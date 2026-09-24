import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, access, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { stageAzureRelease } from '../src/release/stage.js';

const temporary: string[] = [];
afterEach(async () => { await Promise.all(temporary.map((dir) => rm(dir, { recursive: true, force: true }))); temporary.length = 0; });
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'solar-release-test-')); temporary.push(root);
  for (const dir of ['dist/cli', 'openapi', 'db/migrations', 'db/local', '.copilot-azure']) await mkdir(path.join(root, dir), { recursive: true });
  for (const [name, content] of Object.entries({
    'dist/server.js': 'export {};', 'dist/cli/migrate.js': 'export {};', 'dist/server.js.map': '{}',
    'package.json': '{}', 'package-lock.json': '{}', '.nvmrc': '24', 'openapi/openapi.json': '{"openapi":"3.1.0"}',
    'db/migrations/001_initial_schema.sql': 'CREATE TABLE example(id integer);', 'db/local/credentials.sql': 'local credentials',
    '.env': 'JWT_SECRET=private-test-marker', 'dist/.env': 'stale-private-build-marker', '.copilot-azure/context.json': 'private session',
  })) await writeFile(path.join(root, name), content);
  return root;
}
describe('App Service release boundary', () => {
  it('prepares an Azure dependency-install hook without changing source manifests or including private files', async () => {
    const root = await fixture();
    const original = { scripts: { build: 'tsc', dev: 'tsx src/server.ts' }, dependencies: { pg: '8.0.0' }, devDependencies: { typescript: '5.0.0' } };
    await writeFile(path.join(root, 'package.json'), JSON.stringify(original));
    const target = await stageAzureRelease(root, path.join(root, 'artifacts'), true);
    const manifest = JSON.parse(await readFile(path.join(target, 'package.json'), 'utf8'));
    expect(manifest.dependencies).toEqual(original.dependencies);
    expect(manifest.devDependencies).toEqual(original.devDependencies);
    expect(manifest.scripts.build).toContain('npm ci --omit=dev');
    expect(manifest.scripts.build).toContain("import('./dist/app.js')");
    expect(manifest.scripts.dev).toBeUndefined();
    expect(JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))).toEqual(original);
    expect(await readFile(path.join(target, 'package-lock.json'), 'utf8')).toBe(await readFile(path.join(root, 'package-lock.json'), 'utf8'));
    await expect(access(path.join(target, '.env'))).rejects.toThrow();
  });
  it('includes runtime assets and migrations while excluding private/local files and dependencies not installed for Linux', async () => {
    const root = await fixture();
    const result = await stageAzureRelease(root, path.join(root, 'artifacts'));
    expect(await readFile(path.join(result, 'dist/server.js'), 'utf8')).toBe('export {};');
    await access(path.join(result, 'db/migrations/001_initial_schema.sql'));
    await access(path.join(result, 'openapi/openapi.json'));
    for (const file of ['.env', 'dist/.env', 'db/local', '.copilot-azure', 'node_modules']) await expect(access(path.join(result, file))).rejects.toThrow();
    expect(await readFile(path.join(result, 'RELEASE.txt'), 'utf8')).toContain('production dependencies on Linux');
  });
  it('refuses symlinks into files outside the release boundary and cleans only its own partial output', async () => {
    const root = await fixture(), artifacts = path.join(root, 'artifacts');
    await mkdir(artifacts); await writeFile(path.join(artifacts, 'keep.txt'), 'existing artifact');
    await symlink(path.join(root, '.env'), path.join(root, 'dist/leaked-secret.js'));
    await expect(stageAzureRelease(root, artifacts)).rejects.toThrow('symbolic links');
    expect(await readdir(artifacts)).toEqual(['keep.txt']);
  });
  it('also rejects a symlinked parent directory for whitelisted assets', async () => {
    const root = await fixture();
    await rm(path.join(root, 'openapi'), { recursive: true });
    await mkdir(path.join(root, 'private-assets'));
    await writeFile(path.join(root, 'private-assets/openapi.json'), 'private marker');
    await symlink(path.join(root, 'private-assets'), path.join(root, 'openapi'));
    await expect(stageAzureRelease(root, path.join(root, 'artifacts'))).rejects.toThrow('symbolic links');
  });
});
