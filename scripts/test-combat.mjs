import fs from 'node:fs';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
const root=new URL('../public/js/',import.meta.url);
const url=code=>'data:text/javascript;base64,'+Buffer.from(code).toString('base64');
const engineURL=url(fs.readFileSync(new URL('engine.js',root),'utf8'));
const E=await import(engineURL);
const qteURL=url(fs.readFileSync(new URL('Qte.js',root),'utf8').replace(/"\.\/engine.js[^"]*"/,JSON.stringify(engineURL)));
const Q=await import(qteURL);
function fighter(species,owner){const p=E.newMonster(species);return {...p,hp:800,attack:80,speed:owner==='host'?100:50,owner,currentHp:800,ailment:null,cooldowns:{}};}
function room(){return {players:[fighter(0,'host'),fighter(0,'guest')],turn:1,status:'battle',winner:null,moves:[0,2],qtes:['normal',null],log:[]};}
let r=room();E.resolveTurn(r);
assert.equal(r.players[1].currentHp,744,'guard halves normal damage');
assert.ok(E.moveCoolingDown(r.players[0],'element',2));
assert.ok(!E.moveCoolingDown(r.players[0],'element',3));
r.moves=[0,1];r.qtes=['normal','normal'];assert.throws(()=>E.resolveTurn(r),/クールタイム/);
r.moves=[1,0];E.resolveTurn(r);assert.equal(r.turn,3);
r.moves=[0,1];r.qtes=['critical','miss'];const before=r.players[1].currentHp;E.resolveTurn(r);
assert.equal(before-r.players[1].currentHp,168,'critical is exactly 1.5x and miss does no damage');
assert.ok(r.playback.events.some(e=>e.critical));
r=room();r.qtes=['miss',null];E.resolveTurn(r);
assert.equal(r.players[1].currentHp,800);assert.ok(E.moveCoolingDown(r.players[0],'element',2),'miss also starts cooldown');
r=room();r.moves=[3,1];r.qtes=[true,'miss'];r.players[0].currentHp=400;r.players[0].ailment='poison';E.resolveTurn(r);
assert.equal(r.players[0].currentHp,496);assert.equal(r.players[0].ailment,null);
r=room();r.moves=[3,1];r.qtes=[false,'miss'];r.players[0].currentHp=400;E.resolveTurn(r);assert.equal(r.players[0].currentHp,400);
const max=E.newMonster(0);max.level=98;max.xp=E.xpForLevel(98)-10;E.awardExperience(max,20);
assert.equal(max.level,99);assert.equal(max.xp,0);assert.equal(E.stats(max).hp,max.hp+196);
assert.equal(E.awardExperience(max,50).capped,true);
const attack={mode:'attack',duration:1000,zone:26,width:48,speeds:[1],reverse:false};
assert.equal(Q.attackQteResult(500,attack),'critical');
assert.equal(Q.attackQteResult(300,attack),'normal');
assert.equal(Q.attackQteResult(100,attack),'miss');
assert.equal(Q.attackQteResult(1000,attack),'miss');
const modes=new Set();
for(let i=0;i<100;i++){const p=Q.createQtePattern();modes.add(p.mode);assert.ok(p.duration<3200);assert.equal(Q.qteHit(p.duration,p),false);}
assert.equal(modes.size,3);
for(const mode of ['sweep','bounce','ring']){
 const p={...attack,mode,zone:40,width:20};
 for(let t=0;t<1000;t+=13){const pos=Q.qtePosition(t,p);assert.equal(Q.qteHit(t,p),pos>=40&&pos<=60);}
}
console.log('Passed: cooldown incl. misses, guard, critical/normal/miss, healing, level 99, three QTE modes and boundaries.');
// Exercise real network module with in-memory Peer channels, no internet.
class Channel extends EventEmitter{open=false;send(data){queueMicrotask(()=>this.other.emit('data',structuredClone(data)));}close(){this.open=false;this.emit('close');}}
const peers=new Map();
class Peer extends EventEmitter{
 constructor(id){super();this.id=id||crypto.randomUUID();peers.set(this.id,this);queueMicrotask(()=>this.emit('open',this.id));}
 connect(id){const a=new Channel(),b=new Channel();a.other=b;b.other=a;
 setImmediate(()=>{peers.get(id).emit('connection',b);a.open=b.open=true;a.emit('open');b.emit('open');});return a;}
 destroy(){peers.delete(this.id);}
}
globalThis.__testPeer=Peer;
globalThis.window={isSecureContext:true,RTCPeerConnection(){},addEventListener(){}};
window.RTCPeerConnection=function(){};
const memory=new Map();
globalThis.localStorage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)};
const claimsURL=url(fs.readFileSync(new URL('claims.js',root),'utf8').replace(/"\.\/engine.js[^"]*"/,JSON.stringify(engineURL)));
let serial=0;
async function network(level=10, savedRaw=null){
 const mon={...E.newMonster(0),level};
 memory.clear();memory.set('qr-monsters-p2p-v1',savedRaw || JSON.stringify({userLevel:1,dex:1,monsters:[mon],materials:2,used:[],selected:mon.id}));
 let code=fs.readFileSync(new URL('network.js',root),'utf8')
 .replace(/import \{ Peer \} from "[^"]+";/,'const Peer=globalThis.__testPeer;')
 .replace(/"\.\/engine.js[^"]*"/,JSON.stringify(engineURL))
 .replace(/"\.\/claims.js[^"]*"/,JSON.stringify(claimsURL));
 const mod=await import(url(code+'\nexport function finishFixture(winner) {hostRoom.status="ended";hostRoom.winner=winner;finishCpuBattle();broadcast();return {player:copy(player),room:copy(view)};}\n'+'\n// fixture '+(++serial)));
 const request=async body=>{const response=await mod.gameFetch('/api/game',body?{method:'POST',body:JSON.stringify(body)}:{});const data=await response.json();return {ok:response.ok,...data};};
 return {mod,request,mon};
}
let a=await network(98);
let res=await a.request({action:'upgrade',monster:a.mon.id});assert.equal(res.player.monsters[0].level,99);
res=await a.request({action:'upgrade',monster:a.mon.id});assert.equal(res.ok,false);
const saved99=memory.get('qr-monsters-p2p-v1');
const reloaded=await network(99,saved99);
assert.equal((await reloaded.request()).player.monsters[0].level,99,'level 99 restored by a fresh module');
res=await a.request();assert.equal(res.player.monsters[0].level,99,'99 survives save reload');
res=await a.request({action:'cpu'});let cpu=res.room;
res=await a.request({action:'move',room:cpu.id,turn:cpu.turn,move:0,qte:true});assert.equal(res.ok,false,'old boolean attack result rejected');
res=await a.request({action:'move',room:cpu.id,turn:cpu.turn,move:0,qte:'normal'});assert.equal(res.ok,true);
cpu=res.room;res=await a.request({action:'move',room:cpu.id,turn:cpu.turn,move:0,qte:'normal'});assert.equal(res.ok,false,'CPU enforces cooldown');
let last;
for(let n=0;n<120 && cpu.status==='battle';n++){
 const me=cpu.players.find(p=>p.isYou),idx=E.movesFor(me).findIndex(m=>!E.moveCoolingDown(me,m.id,cpu.turn) && m.kind==='attack');
 res=await a.request({action:'move',room:cpu.id,turn:cpu.turn,move:idx,qte:'critical'});
 assert.equal(res.ok,true,res.error);cpu=res.room;last=res;
}
assert.equal(cpu.status,'ended');assert.ok(cpu.reward);a.mod.leaveRoom();
a=await network(10);res=await a.request();assert.equal(res.player.monsters[0].level,10,'old level 10 save retained');
const host=await a.request({action:'create'});const b=await network(99);
let guest=await b.request({action:'join',room:host.room.id});assert.equal(guest.ok,true);
const h=await a.request(); // game state retrieval below uses room endpoint
const getRoom=async client=>{const response=await client.mod.gameFetch('/api/game?room='+host.room.id);return await response.json();};
let hr=(await getRoom(a)).room;
guest=await b.request({action:'move',room:hr.id,turn:hr.turn,move:0,qte:'critical'});assert.equal(guest.ok,true,guest.error);
res=await a.request({action:'move',room:hr.id,turn:hr.turn,move:1,qte:'normal'});assert.equal(res.ok,true);
await new Promise(r=>setImmediate(r));hr=(await getRoom(a)).room;let gr=(await getRoom(b)).room;
assert.equal(gr.turn,2);assert.deepEqual(hr.players.map(p=>p.currentHp),gr.players.map(p=>p.currentHp));
assert.deepEqual(hr.players.map(p=>p.cooldowns),gr.players.map(p=>p.cooldowns),'cooldowns synchronise');
res=await b.request({action:'move',room:gr.id,turn:gr.turn,move:0,qte:'normal'});assert.equal(res.ok,false);
res=await b.request({action:'move',room:gr.id,turn:gr.turn,move:1,qte:'normal'});assert.equal(res.ok,true);
res=await a.request({action:'move',room:hr.id,turn:hr.turn,move:0,qte:'normal'});assert.equal(res.ok,true);
a.mod.leaveRoom();b.mod.leaveRoom();
console.log('Passed: old save migration, level-99 item cap, CPU battle/reward, P2P attack results, cooldown validation and synchronised snapshots.');

assert.equal(E.cpuExperience(1,'win'),60);
assert.equal(E.cpuExperience(50,'win'),648);
assert.equal(E.cpuExperience(98,'win'),1224);
assert.equal(E.cpuExperience(99,'win'),0);
for(let level=1;level<99;level++){
 const m={...E.newMonster(0),level,xp:0};
 E.awardExperience(m,E.cpuExperience(m.level,'win'));
 E.awardExperience(m,E.cpuExperience(m.level,'win'));
 assert.ok(m.level>level,'two wins advance every level');
 assert.ok(E.cpuExperience(level,'lose')>0);
 assert.ok(E.cpuExperience(level,'draw')>E.cpuExperience(level,'lose'));
}
const journey=E.newMonster(0);let wins=0;
while(journey.level<99 && wins<196){E.awardExperience(journey,E.cpuExperience(journey.level,'win'));wins++;}
assert.equal(journey.level,99);assert.ok(wins<=196);
console.log('Passed: level-scaled CPU rewards, two-win progression at all levels; level 1 to 99 in '+wins+' wins.');

// 20%の境界、勝利限定、最大レベルでも入手、報酬の二重付与と保存を検証。
assert.equal(E.cpuCrystalDrop(true,1),1);
assert.equal(E.cpuCrystalDrop(true,20),1);
assert.equal(E.cpuCrystalDrop(true,21),0);
assert.equal(E.cpuCrystalDrop(true,100),0);
assert.equal(E.cpuCrystalDrop(false,1),0);
assert.equal(Array.from({length:100},(_,i)=>E.cpuCrystalDrop(true,i+1)).reduce((a,b)=>a+b),20);
const originalValues=crypto.getRandomValues;
try{
 for(const [winner,roll,expected] of [['host',20,1],['host',21,0],['cpu',1,0],['draw',1,0]]){
  const client=await network(99);
  await client.request({action:'cpu'});
  crypto.getRandomValues=function(array){array.fill(roll-1);return array;};
  const finish=client.mod.finishFixture(winner);
  assert.equal(finish.room.reward.crystals,expected);
  assert.equal(finish.player.materials,2+expected);
  const twice=client.mod.finishFixture(winner);
  assert.equal(twice.player.materials,2+expected,'reward only once');
  const restored=await network(99,memory.get('qr-monsters-p2p-v1'));
  assert.equal((await restored.request()).player.materials,2+expected,'drop survives reload');
  client.mod.leaveRoom();
 }
} finally {crypto.getRandomValues=originalValues;}
console.log('Passed: exact 20/100 roll boundary, victory-only drops, no duplicate rewards, level-99 drops and saved inventory.');
