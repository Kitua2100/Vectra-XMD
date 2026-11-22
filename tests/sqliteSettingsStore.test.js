import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { SqliteSettingsStore } from '../src/storage/SqliteSettingsStore.js';
test('settings persist and remain isolated between sessions',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'vectra-sqlite-'));
 try { const filePath=path.join(dir,'settings.sqlite');
  let s=new SqliteSettingsStore({filePath}); s.set('alice','ping',false);s.close();
  s=new SqliteSettingsStore({filePath}); assert.equal(s.get('alice','ping'),false);
  assert.equal(s.get('bob','ping'),null); s.close();
 } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
