import { spawnSync } from 'node:child_process';
const commands = [
  ['node', ['--test', 'tests/*.test.js']],
  ['node', ['scripts/checkRelease.mjs']]
];
for (const [bin, args] of commands) {
  // Expand glob through shell for Termux compatibility.
  const result = spawnSync(`${bin} ${args.join(' ')}`, { shell: true, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
