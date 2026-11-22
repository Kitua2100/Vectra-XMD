import { existsSync } from 'node:fs';
const checks = {
  'Node 22+': Number(process.versions.node.split('.')[0]) >= 22,
  'Baileys installed': existsSync('node_modules/@whiskeysockets/baileys'),
  'private credentials excluded from git': existsSync('.gitignore'),
  'deployment example present': existsSync('deployment/vectra.service.example'),
  'release checklist present': existsSync('PHASES22_30_RELEASE_CHECKLIST.md')
};
for (const [label, ok] of Object.entries(checks)) console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
if (Object.values(checks).some(x=>!x)) process.exitCode = 1;
