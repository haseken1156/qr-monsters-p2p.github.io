// 描画と判定で同じ時刻・位置を使います。全モードに時間切れ判定があります。
import { randomInt } from "./engine.js?v=result-bgm-20261024";
export function createQtePattern(kind = "utility") {
  const attack = kind === "attack";
  const mode = attack ? "attack" : ["sweep", "bounce", "ring"][randomInt(0,2)];
  const speeds = Array.from({length:5},()=>randomInt(65,175)/100);
  speeds[1]=.65; speeds[3]=1.75;
  if(randomInt(0,1))speeds.reverse();
  return {
    mode,
    duration: attack ? randomInt(1450,1850) : randomInt(1750,2350),
    zone: attack ? 26 : randomInt(25,55),
    width: attack ? 48 : randomInt(20,26),
    reverse: !attack && mode !== "ring" && !!randomInt(0,1),
    speeds,
  };
}
export function qtePosition(elapsed, p) {
  const t=Math.max(0,Math.min(1,elapsed/p.duration))*p.speeds.length;
  let distance=0;
  for(let i=0;i<p.speeds.length;i++)
    distance+=p.speeds[i]*Math.max(0,Math.min(1,t-i));
  let pos=100*distance/p.speeds.reduce((a,b)=>a+b,0);
  if(p.mode==="bounce")pos=pos<=50 ? pos*2 : (100-pos)*2;
  if(p.mode==="ring")pos=100-pos;
  return p.reverse ? 100-pos : pos;
}
export function qteHit(elapsed,p) {
  if(!p || elapsed<0 || elapsed>=p.duration)return false;
  const pos=qtePosition(elapsed,p);
  return pos>=p.zone && pos<=p.zone+p.width;
}
export function attackQteResult(elapsed,p) {
  if(!qteHit(elapsed,p))return "miss";
  return Math.abs(qtePosition(elapsed,p)-50)<=6 ? "critical" : "normal";
}
