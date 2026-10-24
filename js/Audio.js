/* 音声だけの設定を別保存。ゲームのセーブデータには触れません。 */
import { jsx, jsxs, useEffect, useState } from '../vendor/libraries.js?v=result-bgm-20261024';
const KEY = 'qr-monsters-audio-v1';
let settings = { muted: false, music: .35, effects: .6 };
try {
  const s = JSON.parse(localStorage.getItem(KEY));
  if (s) settings = { muted: s.muted === true,
    music: Number.isFinite(s.music) ? Math.max(0, Math.min(1,s.music)) : .35,
    effects: Number.isFinite(s.effects) ? Math.max(0, Math.min(1,s.effects)) : .6 };
} catch {}
let ctx, master, musicGain, effectsGain, source, buffer, loading;
let wanted = false, problem = '', disposed = false, battleSession = 0, musicMode = 'silent';
const listeners = new Set();
const notify = () => listeners.forEach(fn=>fn());
function gains() {
  if (!ctx) return;
  master.gain.setTargetAtTime(settings.muted ? 0 : .65,ctx.currentTime,.02);
  musicGain.gain.setTargetAtTime(settings.music*.65,ctx.currentTime,.02);
  effectsGain.gain.setTargetAtTime(settings.effects*.5,ctx.currentTime,.02);
}
function update(patch) {
  settings = {...settings,...patch};
  try { localStorage.setItem(KEY,JSON.stringify(settings)); } catch {}
  gains(); notify();
}
function stopMusic() {
  if (source) { try {source.stop();} catch {} source.disconnect(); source=null; }
}
// tracks.jsonに曲名を追加すると、バトルごとに1曲をランダム抽選します。
const LEGACY_FILES = ['battle.mp3', 'battle.m4a', 'battle.ogg', 'battle.wav'];
const LOBBY_FILES = ['lobby.mp3', 'lobby.m4a', 'lobby.ogg', 'lobby.wav'];
const RESULT_FILES = Object.fromEntries(['victory','defeat','draw'].map(mode =>
  [mode,['mp3','m4a','ogg','wav'].map(ext => mode+'.'+ext)]));
const MODE_LABELS = {lobby:'ロビー',battle:'バトル',victory:'勝利',defeat:'敗北',draw:'引き分け'};
const sceneBuffers = new Map();
const musicRevision = Date.now().toString(36);
let trackName = '', playlistLoading;
const unavailable = new Set();
function musicURL(name) {
  const url = new URL('../assets/audio/' + name, import.meta.url);
  url.searchParams.set('music', musicRevision);
  return url;
}
async function playlist() {
  playlistLoading ??= (async () => {
    try {
      const response = await fetch(musicURL('tracks.json'), {cache:'no-store'});
      if (!response.ok) return [];
      const data = await response.json();
      // この音楽フォルダ内のファイルのみ。重複は抽選確率に影響させません。
      return [...new Set((Array.isArray(data.tracks) ? data.tracks : []).filter(
        name => typeof name === 'string' && !/[\\/:?#]/.test(name)
          && /\.(mp3|m4a|ogg|wav)$/i.test(name)
      ))];
    } catch { return []; }
  })();
  return playlistLoading;
}
async function loadMusic(session) {
  const mode = musicMode;
  if (sceneBuffers.has(mode)) {const cached=sceneBuffers.get(mode);trackName=cached.name;return cached.buffer;}
  const candidates = mode === 'battle' ? (await playlist()).filter(name => !unavailable.has(name)) : [];
  // Fisher–Yates: 未配置・非対応の曲を除いた中で公平に選びます。
  for (let i=candidates.length-1;i>0;i--) {
    const j=Math.floor(Math.random()*(i+1));
    [candidates[i],candidates[j]]=[candidates[j],candidates[i]];
  }
  // 従来のbattle.mp3等は登録曲が使えない場合の予備音源です。
  const names = mode === 'lobby' ? LOBBY_FILES : RESULT_FILES[mode] || [...candidates, ...LEGACY_FILES.filter(name => !candidates.includes(name))];
  for (const name of names) {
    if (session!==battleSession || !wanted || disposed) return null;
    if (unavailable.has(name)) continue;
    try {
      const response = await fetch(musicURL(name), {cache:'no-store'});
      if (!response.ok) {unavailable.add(name);continue;}
      const decoded = await ctx.decodeAudioData(await response.arrayBuffer());
      if (session!==battleSession || !wanted || disposed) return null;
      if (mode !== 'battle') sceneBuffers.set(mode,{name,buffer:decoded});
      trackName = name; problem = ''; notify();
      return decoded;
    } catch { unavailable.add(name); } // 非対応・壊れた音源は次の候補へ。
  }
  if (session===battleSession && wanted) {
    problem = (MODE_LABELS[mode] || '') + 'BGM未設定：音源を入れると再生します。'; notify();
  }
  return null;
}
async function ensureMusic() {
  if (!ctx || !wanted || disposed || document.hidden || settings.muted || source || ctx.state!=='running') return;
  const session=battleSession;
  try {
    if (!buffer) {
      loading ??= loadMusic(session);
      const decoded = await loading;
      if (session!==battleSession) return;
      buffer=decoded;
    }
    if (!buffer || session!==battleSession || !wanted || disposed || document.hidden || settings.muted || source || ctx.state!=='running') return;
    source=ctx.createBufferSource(); source.buffer=buffer; source.loop=true;
    source.connect(musicGain); source.start(); problem=''; notify();
  } catch {
    if (session===battleSession) {problem='BGMを再生できません。ページを再読み込みしてください。'; notify();}
  }
}
export async function unlockAudio() {
  try {
    if (!ctx) {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) {problem='このブラウザでは音声を利用できません。';notify();return;}
      ctx=new Audio(); master=ctx.createGain(); musicGain=ctx.createGain();effectsGain=ctx.createGain();
      musicGain.connect(master);effectsGain.connect(master);master.connect(ctx.destination);gains();
    }
    if (ctx.state!=='running' && ctx.state!=='closed' && !document.hidden) await ctx.resume();
    void ensureMusic();
  } catch {problem='音をONを押すと音声を再開できます。';notify();}
}
function setMusicMode(mode) {
  if (mode !== musicMode) {
    musicMode=mode; wanted=mode!=='silent'; battleSession++;
    stopMusic(); buffer=null; loading=null; trackName=''; problem=''; notify();
  }
  if (wanted) void ensureMusic();
}
// 非アクティブ化は自分のモードだけ停止し、別画面の音楽を中断しません。
export function battleMusic(active) {
  if (active) setMusicMode('battle');
  else if (musicMode==='battle') setMusicMode('silent');
}
export function lobbyMusic(active) {
  if (active) setMusicMode('lobby');
  else if (musicMode==='lobby') setMusicMode('silent');
}
// 結果の表示が終わると停止。未配置時は他の曲へフォールバックしません。
export function resultMusic(result) {
  const mode = {you:'victory',friend:'defeat',draw:'draw'}[result];
  if (mode) setMusicMode(mode);
  else if (RESULT_FILES[musicMode]) setMusicMode('silent');
}
function tone(f,end,duration=.16,type='square',delay=0,volume=.22) {
  if (!ctx || ctx.state!=='running' || settings.muted || document.hidden) return;
  const t=ctx.currentTime+delay,o=ctx.createOscillator(),g=ctx.createGain();
  o.type=type;o.frequency.setValueAtTime(f,t);o.frequency.exponentialRampToValueAtTime(Math.max(20,end),t+duration);
  g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(volume,t+.006);
  g.gain.exponentialRampToValueAtTime(.001,t+duration);
  o.connect(g);g.connect(effectsGain);o.start(t);o.stop(t+duration+.02);
  o.onended=()=>{o.disconnect();g.disconnect();};
}
function noise(duration=.18,cutoff=1000,volume=.25,delay=0) {
  if (!ctx || ctx.state!=='running' || settings.muted || document.hidden) return;
  const b=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*duration),ctx.sampleRate),data=b.getChannelData(0);
  for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*Math.exp(-i/data.length*5);
  const n=ctx.createBufferSource(),f=ctx.createBiquadFilter(),g=ctx.createGain();
  n.buffer=b;f.type='lowpass';f.frequency.value=cutoff;g.gain.value=volume;
  n.connect(f);f.connect(g);g.connect(effectsGain);n.start(ctx.currentTime+delay);
  n.onended=()=>{n.disconnect();f.disconnect();g.disconnect();};
}
export function effectSound(kind,element) {
  if (kind==='miss' || kind==='qte-fail' || kind==='qteFail') {tone(210,80,.18,'triangle');return;}
  if (kind==='qte-success') { [660,880,1320].forEach((f,i)=>tone(f,f,.1,'square',i*.065,.12));return; }
  if (kind==='heal') { [523,659,784,1047].forEach((f,i)=>tone(f,f,.22,'triangle',i*.07,.3));return; }
  if (kind==='guard') {tone(180,460,.12,'square');tone(920,700,.18,'triangle',.08);return;}
  if (kind==='statusTick') {tone(160,90,.14,'triangle');return;}
  if (!['attack','status'].includes(kind)) return;
  if (element===0) {noise(.32,1800,.65);tone(180,70,.25,'sawtooth',0,.12);}
  else if(element===1) {[320,510,760].forEach((f,i)=>tone(f,f*1.4,.14,'sine',i*.065,.28));noise(.18,550,.2);}
  else if(element===2) {noise(.22,3000,.3);[620,470,350].forEach((f,i)=>tone(f,f*.7,.11,'triangle',i*.07));}
  else if(element===3) {[0,.05,.11,.17].forEach((d,i)=>tone(i%2?1300:700,100,.065,'square',d,.18));noise(.17,6000,.22);}
  else if(element===4) {tone(100,35,.3,'triangle',0,.6);noise(.27,380,.8);}
  else {noise(.12,2200,.5);tone(220,65,.12,'square');}
}
export function resultSound(result) {
  const notes=result==='you'?[523,659,784,1047]:result==='draw'?[523,659,523]:[392,349,294,262];
  notes.forEach((f,i)=>tone(f,f,.23,'square',i*.17,.18));
}
export function AudioPanel() {
  const [,refresh]=useState(0);
  useEffect(()=>{
    disposed=false;const listener=()=>refresh(n=>n+1);listeners.add(listener);
    const unlock=()=>void unlockAudio();
    const visibility=()=>{if(document.hidden){stopMusic();if(ctx?.state==='running')void ctx.suspend().catch(()=>{});}else void unlockAudio();};
    document.addEventListener('pointerdown',unlock,{passive:true});
    document.addEventListener('keydown',unlock);
    document.addEventListener('visibilitychange',visibility);
    return ()=>{disposed=true;wanted=false;stopMusic();listeners.delete(listener);
      document.removeEventListener('pointerdown',unlock);document.removeEventListener('keydown',unlock);document.removeEventListener('visibilitychange',visibility);};
  },[]);
  return jsxs('details',{className:'audio-panel',children:[
    jsx('summary',{children:settings.muted?'♪ サウンド OFF':'♫ サウンド設定'}),
    jsxs('div',{className:'audio-controls',children:[
      jsx('button',{type:'button','aria-pressed':!settings.muted,onClick:()=>{update({muted:!settings.muted});if(settings.muted)stopMusic();else void unlockAudio();},children:settings.muted?'音をON':'ミュート'}),
      ...[['music','BGM'],['effects','効果音']].map(([key,label])=>jsxs('label',{children:[label,
        jsx('input',{type:'range',min:0,max:100,step:1,value:Math.round(settings[key]*100),'aria-label':label+'の音量',onChange:e=>update({[key]:Number(e.target.value)/100})}),
        jsx('output',{children:Math.round(settings[key]*100)+'%'})]},key)),
      jsx('button',{type:'button',onClick:()=>{void unlockAudio().then(()=>effectSound('heal'));},children:'試聴 ♪'}),
      jsx('small',{role:'status',children:problem||(trackName ? ((MODE_LABELS[musicMode] || '')+'BGM：')+trackName+' · ループ再生' : 'ロビー・勝敗は指定名の音源、対戦は登録曲を再生します。最初に画面をタップしてください。')})
    ]})
  ]});
}
