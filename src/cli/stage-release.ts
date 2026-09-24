import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { stageAzureRelease } from '../release/stage.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
stageAzureRelease(root, path.join(root, 'artifacts')).then((directory) => {
  // Also accepted as a GitHub Actions step output when appended to GITHUB_OUTPUT.
  console.log(`directory=${directory}`);
}).catch(() => {
  console.error('Release staging failed; build first and check the required files and absence of symlinks');
  process.exitCode = 1;
});
