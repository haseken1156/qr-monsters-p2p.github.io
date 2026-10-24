import fs from 'node:fs';
import assert from 'node:assert/strict';
const calls={starts:0,stops:0,tones:0,storage:0};
const param=()=>({setValueAtTime(){},exponentialRampToValueAtTime(){},linearRampToValueAtTime(){},setTargetAtTime(){}});
class Context {
  state='running';currentTime=0;sampleRate=22050;destination={};
  createGain(){return {gain:param(),connect(){},disconnect(){}};}
  createOscillator(){calls.tones++;return {frequency:param(),connect(){},disconnect(){},start(){},stop(){}};}
  createBufferSource(){return {connect(){},disconnect(){},start(){calls.starts++;},stop(){calls.stops++;}};}
  createBuffer(c,n){return {getChannelData:()=>new Float32Array(n)};}
  createBiquadFilter(){return {frequency:{},connect(){},disconnect(){}};}
  async decodeAudioData(){return {};}
  async resume(){this.state='running';}
  async suspend(){this.state='suspended';}
}
globalThis.window={AudioContext:Context};
globalThis.document={hidden:false,addEventListener(){},removeEventListener(){}};
globalThis.localStorage={getItem(){return null;},setItem(){calls.storage++;}};
globalThis.fetch=async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(1)});
let code=fs.readFileSync(new URL('../public/js/Audio.js',import.meta.url),'utf8');
code=code.replace(/^import .*libraries.*;$/m,`const jsx=(type,props)=>({type,props}),jsxs=jsx,useState=()=>[0,()=>{}],useEffect=()=>{};`);
code=code.replaceAll('import.meta.url', JSON.stringify(new URL('../public/js/Audio.js',import.meta.url).href));
const audio=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
audio.battleMusic(true);assert.equal(calls.starts,0);
await audio.unlockAudio();await new Promise(r=>setImmediate(r));assert.equal(calls.starts,1);
audio.battleMusic(true);await new Promise(r=>setImmediate(r));assert.equal(calls.starts,1,'turns do not restart BGM');
for(let i=0;i<5;i++)audio.effectSound('attack',i);
for(const kind of ['guard','heal','miss','qte-success','qteFail','statusTick'])audio.effectSound(kind);
assert.ok(calls.tones>=20);
audio.battleMusic(false);assert.equal(calls.stops,1);
const mute=audio.AudioPanel().props.children[1].props.children[0];mute.props.onClick();
const before={...calls};audio.effectSound('attack',0);audio.battleMusic(true);await new Promise(r=>setImmediate(r));
assert.equal(calls.tones,before.tones);assert.equal(calls.starts,before.starts);assert.equal(calls.storage,1);
mute.props.onClick();await new Promise(r=>setImmediate(r));assert.ok(calls.starts>before.starts);
document.hidden=true;audio.battleMusic(false);const hidden={...calls};audio.effectSound('heal');assert.equal(calls.tones,hidden.tones);
console.log('Passed: audio lifecycle, 5 elements, utilities, mute, settings persistence, hidden tab.');
document.hidden=false;
const requests=[];
globalThis.fetch=async(url,options)=>{
  const name=new URL(url).pathname.split('/').pop();if(name==='tracks.json')return {ok:false};requests.push(name);
  assert.equal(options.cache,'no-store');
  return {ok:name==='battle.wav',arrayBuffer:async()=>new ArrayBuffer(1)};
};
const fallback=await import('data:text/javascript;base64,'+Buffer.from(code+'\n// fallback scenario').toString('base64'));
const fallbackStart=calls.starts;
fallback.battleMusic(true);await fallback.unlockAudio();await new Promise(r=>setImmediate(r));
assert.deepEqual(requests,['battle.mp3','battle.m4a','battle.ogg','battle.wav']);
assert.equal(calls.starts,fallbackStart+1,'WAV fallback starts');fallback.battleMusic(false);
let misses=0;
globalThis.fetch=async(url)=>{if(new URL(url).pathname.endsWith('tracks.json'))return {ok:false};misses++;return {ok:false};};
const absent=await import('data:text/javascript;base64,'+Buffer.from(code+'\n// absent scenario').toString('base64'));
const absentStart=calls.starts;
absent.battleMusic(true);await absent.unlockAudio();await new Promise(r=>setImmediate(r));
assert.equal(calls.starts,absentStart,'absent music stays silent');assert.equal(misses,4);
await absent.unlockAudio();await new Promise(r=>setImmediate(r));assert.equal(misses,4,'missing files are not requested on every tap');
const beforeEffects=calls.tones;absent.effectSound('heal');assert.ok(calls.tones>beforeEffects,'effects work without BGM');
console.log('Passed: custom MP3, WAV fallback, absent music, no repeated requests, effects without music.');


// 複数曲、次の対戦、ミュート復帰、読み込み中の退出を実際のライフサイクルで確認。
const settle=()=>new Promise(r=>setImmediate(r));
const played=[],originalRandom=Math.random;
Context.prototype.decodeAudioData=async function(data){return {name:data.name};};
Context.prototype.createBufferSource=function(){return {
  connect(){},disconnect(){},start(){calls.starts++;played.push(this.buffer.name);},
  stop(){calls.stops++;}
};};
const requestsMulti=[];
globalThis.fetch=async url=>{
  const name=new URL(url).pathname.split('/').pop();requestsMulti.push(name);
  if(name==='tracks.json')return {ok:true,json:async()=>({tracks:['one.mp3','two.wav','one.mp3','../bad.mp3']})};
  return {ok:true,arrayBuffer:async()=>({name})};
};
const multi=await import('data:text/javascript;base64,'+Buffer.from(code+'\n// multiple scenario').toString('base64'));
Math.random=()=>.99;
multi.battleMusic(true);await multi.unlockAudio();await settle();
assert.equal(played.at(-1),'one.mp3');
multi.battleMusic(true);await settle();assert.equal(played.length,1,'turn updates keep one source');
const multiMute=multi.AudioPanel().props.children[1].props.children[0];
multiMute.props.onClick();multiMute.props.onClick();await settle();
assert.equal(played.at(-1),'one.mp3','unmute retains chosen track');
multi.battleMusic(false);Math.random=()=>0;multi.battleMusic(true);await settle();
assert.equal(played.at(-1),'two.wav','new battle draws again');
assert.equal(requestsMulti.filter(n=>n==='tracks.json').length,1,'playlist loaded once');
assert.ok(!requestsMulti.includes('../bad.mp3'));
multi.battleMusic(false);
let release;
globalThis.fetch=async url=>{
  if(new URL(url).pathname.endsWith('tracks.json')) return {ok:true,json:async()=>({tracks:['slow.mp3']})};
  return await new Promise(r=>release=()=>r({ok:true,arrayBuffer:async()=>({name:'slow.mp3'})}));
};
const race=await import('data:text/javascript;base64,'+Buffer.from(code+'\n// race scenario').toString('base64'));
race.battleMusic(true);await race.unlockAudio();await settle();
const beforeLate=calls.starts;race.battleMusic(false);release();await settle();
assert.equal(calls.starts,beforeLate,'late audio must not start after leaving battle');
Math.random=originalRandom;
console.log('Passed: random selection per battle, stable turns/unmute, playlist cache, late-load cancellation.');

// ロビーと対戦の切り替え、ループ、無音の結果画面、再読込不要のキャッシュ。
const scenePlayed=[],sceneRequests=[];
Context.prototype.createBufferSource=function(){return {
  connect(){},disconnect(){},
  start(){scenePlayed.push({name:this.buffer.name,loop:this.loop});},
  stop(){calls.stops++;}
};};
globalThis.fetch=async url=>{
  const name=new URL(url).pathname.split('/').pop();sceneRequests.push(name);
  if(name==='tracks.json')return {ok:true,json:async()=>({tracks:['battle-1.mp3']})};
  return {ok:true,arrayBuffer:async()=>({name})};
};
const scene=await import('data:text/javascript;base64,'+Buffer.from(code+'\n// scene switching').toString('base64'));
scene.lobbyMusic(true);assert.equal(scenePlayed.length,0,'waits for gesture');
await scene.unlockAudio();await settle();
assert.deepEqual(scenePlayed,[{name:'lobby.mp3',loop:true}]);
scene.lobbyMusic(true);await settle();assert.equal(scenePlayed.length,1,'tabs do not restart lobby');
scene.battleMusic(true);scene.lobbyMusic(false);await settle();
assert.equal(scenePlayed.at(-1).name,'battle-1.mp3');assert.equal(scenePlayed.at(-1).loop,true);
const resultsStart=scenePlayed.length;
scene.battleMusic(false);await settle();assert.equal(scenePlayed.length,resultsStart,'results stay silent');
scene.lobbyMusic(true);await settle();assert.equal(scenePlayed.at(-1).name,'lobby.mp3');
assert.equal(sceneRequests.filter(n=>n==='lobby.mp3').length,1,'lobby buffer reused');
scene.battleMusic(false);await settle();assert.equal(scenePlayed.length,resultsStart+1,'battle cleanup does not stop lobby');
const sceneMute=scene.AudioPanel().props.children[1].props.children[0];
sceneMute.props.onClick();const mutedCount=scenePlayed.length;
await scene.unlockAudio();await settle();assert.equal(scenePlayed.length,mutedCount);
sceneMute.props.onClick();await settle();assert.equal(scenePlayed.at(-1).name,'lobby.mp3');
scene.lobbyMusic(false);
// Lobby decoding must not leak into a battle that started while loading.
let resolveLobby;
globalThis.fetch=async url=>{
 const name=new URL(url).pathname.split('/').pop();
 if(name==='tracks.json')return {ok:true,json:async()=>({tracks:['battle-1.mp3']})};
 if(name==='lobby.mp3')return await new Promise(r=>resolveLobby=()=>r({ok:true,arrayBuffer:async()=>({name})}));
 return {ok:true,arrayBuffer:async()=>({name})};
};
const sceneRace=await import('data:text/javascript;base64,'+Buffer.from(code+'\n// lobby race').toString('base64'));
sceneRace.lobbyMusic(true);await sceneRace.unlockAudio();await settle();
sceneRace.battleMusic(true);await settle();const raceCount=scenePlayed.length;
resolveLobby();await settle();assert.equal(scenePlayed.length,raceCount);
assert.equal(scenePlayed.at(-1).name,'battle-1.mp3');sceneRace.battleMusic(false);
console.log('Passed: looping lobby, battle switching, silent results, cached return, mute, late lobby cancellation.');

// 勝敗曲は専用名でループ。バトルやロビーとの二重再生を防ぎます。
const resultsPlayed=[],resultRequests=[];
let activeMusic=0;
Context.prototype.createBufferSource=function(){let started=false;return {
 connect(){},disconnect(){},
 start(){started=true;activeMusic++;assert.equal(activeMusic,1,'only one scene BGM at a time');resultsPlayed.push({name:this.buffer.name,loop:this.loop});},
 stop(){if(started){activeMusic--;started=false;}}
};};
globalThis.fetch=async url=>{
 const name=new URL(url).pathname.split('/').pop();resultRequests.push(name);
 if(name==='tracks.json')return {ok:true,json:async()=>({tracks:['battle-1.mp3']})};
 return {ok:true,arrayBuffer:async()=>({name})};
};
const resultAudio=await import('data:text/javascript;base64,'+Buffer.from(code+'\n// result tracks').toString('base64'));
resultAudio.resultMusic('you');assert.equal(resultsPlayed.length,0);
await resultAudio.unlockAudio();await settle();
assert.deepEqual(resultsPlayed.at(-1),{name:'victory.mp3',loop:true});
resultAudio.resultMusic('you');await settle();assert.equal(resultsPlayed.length,1,'stable result does not restart');
resultAudio.battleMusic(false);resultAudio.lobbyMusic(false);assert.equal(activeMusic,1,'other scene cleanup leaves result playing');
resultAudio.resultMusic('friend');await settle();assert.equal(resultsPlayed.at(-1).name,'defeat.mp3');
resultAudio.resultMusic('draw');await settle();assert.equal(resultsPlayed.at(-1).name,'draw.mp3');
resultAudio.resultMusic(null);assert.equal(activeMusic,0);
resultAudio.lobbyMusic(true);await settle();assert.equal(resultsPlayed.at(-1).name,'lobby.mp3');
resultAudio.resultMusic(null);assert.equal(activeMusic,1,'result cleanup leaves lobby playing');
resultAudio.battleMusic(true);await settle();assert.equal(resultsPlayed.at(-1).name,'battle-1.mp3');
resultAudio.battleMusic(false);resultAudio.resultMusic('you');await settle();
assert.equal(resultsPlayed.at(-1).name,'victory.mp3');
assert.equal(resultRequests.filter(n=>n==='victory.mp3').length,1,'scene buffer is reused');
const resultMute=resultAudio.AudioPanel().props.children[1].props.children[0];
resultMute.props.onClick();assert.equal(activeMusic,0);
resultMute.props.onClick();await settle();assert.equal(resultsPlayed.at(-1).name,'victory.mp3');
resultAudio.resultMusic(null);
// MP3未配置時は対応形式へ。勝利用音源がなくてもバトル曲を流さない。
const absentResultRequests=[];
globalThis.fetch=async url=>{
 const name=new URL(url).pathname.split('/').pop();absentResultRequests.push(name);
 return {ok:name==='defeat.wav',arrayBuffer:async()=>({name})};
};
const resultFallback=await import('data:text/javascript;base64,'+Buffer.from(code+'\n// result fallback').toString('base64'));
resultFallback.resultMusic('you');await resultFallback.unlockAudio();await settle();assert.equal(activeMusic,0);
assert.deepEqual(absentResultRequests,['victory.mp3','victory.m4a','victory.ogg','victory.wav']);
await resultFallback.unlockAudio();await settle();assert.equal(absentResultRequests.length,4);
resultFallback.resultMusic('friend');await settle();assert.equal(resultsPlayed.at(-1).name,'defeat.wav');
assert.equal(activeMusic,1);resultFallback.resultMusic(null);
// 結果画面を離れた後、遅れて読み込んだ勝利曲を再生しない。
let releaseVictory;
globalThis.fetch=async url=>{
 const name=new URL(url).pathname.split('/').pop();
 if(name==='victory.mp3')return await new Promise(r=>releaseVictory=()=>r({ok:true,arrayBuffer:async()=>({name})}));
 return {ok:true,arrayBuffer:async()=>({name})};
};
const resultRace=await import('data:text/javascript;base64,'+Buffer.from(code+'\n// result race').toString('base64'));
resultRace.resultMusic('you');await resultRace.unlockAudio();await settle();
resultRace.resultMusic(null);resultRace.lobbyMusic(true);await settle();
const beforeVictory=resultsPlayed.length;releaseVictory();await settle();
assert.equal(resultsPlayed.length,beforeVictory);assert.equal(resultsPlayed.at(-1).name,'lobby.mp3');
resultRace.lobbyMusic(false);assert.equal(activeMusic,0);
console.log('Passed: victory/defeat/draw loops, one BGM per scene, cache, mute, missing/fallback files and result exit cancellation.');
