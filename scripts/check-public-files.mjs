import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Deliberately inspect Git's index: ignored local credentials never belong in a push.
const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const privatePath = /(?:^|\/)(?:\.env(?:\..*)?|\.envrc|\.azure|\.copilot-azure|private|secrets|node_modules|dist|artifacts|coverage)(?:\/|$)|\.(?:pem|key|pfx|p12|publishsettings|pubxml\.user)$/i;
const credentials = [
  /\bgh[pousr]_[A-Za-z0-9]{36,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{50,}\b/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\r\n]+[A-Za-z0-9+/=]{20,}/,
  /\bAccountKey=[A-Za-z0-9+/]{60,}={0,2}/,
  /\bSharedAccessSignature=SharedAccessSignature\s+sr=/,
];
const problems = [];
for (const file of files) {
  if (privatePath.test(file) && file !== '.env.example') problems.push(`${file}: private/generated path is tracked`);
  let bytes;
  try { bytes = readFileSync(file); } catch { problems.push(`${file}: staged path is missing`); continue; }
  if (bytes.includes(0)) continue;
  const text = bytes.toString('utf8');
  if (credentials.some(pattern => pattern.test(text))) problems.push(`${file}: possible credential detected`);
}
if (problems.length) {
  console.error(problems.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Public-file check passed: ${files.length} tracked files; private paths and common credential formats excluded.`);
}
