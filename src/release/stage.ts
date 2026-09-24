import { copyFile, mkdir, mkdtemp, readdir, rm, lstat, access, writeFile, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';

// A whitelist prevents .env, Azure sessions, local DB bootstrap and Git data
// from entering an App Service deployment artifact.
export async function stageAzureRelease(sourceRoot: string, outputParent: string, azureInstall = false): Promise<string> {
  sourceRoot = await realpath(sourceRoot);
  await access(path.join(sourceRoot, 'dist/server.js'));
  await access(path.join(sourceRoot, 'dist/cli/migrate.js'));
  await mkdir(outputParent, { recursive: true });
  const target = await mkdtemp(path.join(outputParent, 'appservice-'));
  const copy = async (relative: string) => {
    const source = path.join(sourceRoot, relative), destination = path.join(target, relative);
    if (await realpath(source) !== source) throw new Error('Release files must not be symbolic links');
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(source, destination);
  };
  const compiled = async (relative: string): Promise<void> => {
    for (const entry of await readdir(path.join(sourceRoot, relative), { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw new Error('Release files must not be symbolic links');
      const item = path.join(relative, entry.name);
      if (entry.isDirectory()) await compiled(item);
      else if (entry.isFile() && /\.js(?:\.map)?$/.test(entry.name)) await copy(item);
    }
  };
  try {
    if ((await lstat(path.join(sourceRoot, 'dist'))).isSymbolicLink()) throw new Error('Release directories must not be symbolic links');
    for (const file of ['package.json', 'package-lock.json', '.nvmrc', 'openapi/openapi.json']) await copy(file);
    await compiled('dist');
    for (const entry of await readdir(path.join(sourceRoot, 'db/migrations'), { withFileTypes: true })) {
      if (/^\d{3}_[a-z0-9_]+\.sql$/.test(entry.name)) await copy(path.join('db/migrations', entry.name));
    }
    if (azureInstall) {
      const manifestPath = path.join(target, 'package.json');
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
      // The compiled JavaScript is platform-independent. Oryx installs packages
      // on Linux; its build hook enforces the lockfile and checks runtime imports.
      // Keep dependency declarations/lockfile unchanged, and never run tsc
      // remotely against a package that intentionally excludes TypeScript sources.
      manifest.scripts = {
        start: 'node dist/server.js',
        build: 'npm ci --omit=dev && node --input-type=module -e "await import(\'./dist/app.js\'); await import(\'@azure/identity\'); console.log(\'Linux runtime imports verified\')"',
      };
      await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
    }
    await writeFile(path.join(target, 'RELEASE.txt'), azureInstall
      ? 'Compiled App Service release. Enable SCM_DO_BUILD_DURING_DEPLOYMENT and ENABLE_ORYX_BUILD: the package build hook installs locked production dependencies on Azure Linux and verifies imports. Start with node dist/server.js. No cloud deployment has been performed by staging.\n'
      : 'App Service staging directory. Install locked production dependencies on Linux with Node 24, then ZIP the contents. Use node dist/server.js and disable remote build for this precompiled package. No cloud deployment has been performed by staging.\n');
    return target;
  } catch (error) {
    // Delete only the new directory owned by this invocation.
    await rm(target, { recursive: true, force: true });
    throw error;
  }
}
