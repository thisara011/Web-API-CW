import { copyFile, mkdir, mkdtemp, readdir, rm, lstat, access, writeFile, realpath } from 'node:fs/promises';
import path from 'node:path';

// A whitelist prevents .env, Azure sessions, local DB bootstrap and Git data
// from entering an App Service deployment artifact.
export async function stageAzureRelease(sourceRoot: string, outputParent: string): Promise<string> {
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
    await writeFile(path.join(target, 'RELEASE.txt'), 'App Service staging directory. Install locked production dependencies on Linux with Node 24, then ZIP the contents. Use node dist/server.js and disable remote build for this precompiled package. No cloud deployment has been performed by staging.\n');
    return target;
  } catch (error) {
    // Delete only the new directory owned by this invocation.
    await rm(target, { recursive: true, force: true });
    throw error;
  }
}
