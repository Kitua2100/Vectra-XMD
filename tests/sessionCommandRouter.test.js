import test from 'node:test';
import assert from 'node:assert/strict';
import { SessionCommandRouter } from '../src/plugins/SessionCommandRouter.js';
import { registerBuiltins } from '../src/plugins/registerBuiltins.js';
const authorize = (user,session) => { if (user !== session) throw new Error('Access denied'); };
test('commands execute only for owned session', async () => {
 const r=registerBuiltins(new SessionCommandRouter({authorize})); let out='';
 assert.equal(await r.dispatch({principal:'alice',sessionId:'alice',text:'!ping',reply:x=>{out=x}}),true);
 assert.equal(out,'pong');
 await assert.rejects(()=>r.dispatch({principal:'bob',sessionId:'alice',text:'!ping',reply:()=>{}}),/Access denied/);
});
test('per-session disable is isolated',async()=>{
 const r=registerBuiltins(new SessionCommandRouter({authorize})); r.setEnabled('alice','alice','ping',false);
 assert.equal(await r.dispatch({principal:'alice',sessionId:'alice',text:'!ping',reply:()=>{}}),false);
 assert.equal(await r.dispatch({principal:'bob','sessionId':'bob',text:'!ping',reply:()=>{}}),true);
});
test('rejects unsafe command identifiers and oversized messages',async()=>{
 const r=new SessionCommandRouter({authorize,maxTextLength:10});
 assert.throws(()=>r.register('../bad',()=>{}));
 assert.equal(await r.dispatch({principal:'alice',sessionId:'alice',text:'!ping too long',reply:()=>{}}),false);
});
