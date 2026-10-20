// 毎回1つのパターンを生成。描画・判定は同じ位置計算を使用します。
import { randomInt } from "./engine.js";
export function createQtePattern() {
  const speeds = Array.from({ length: 5 }, () => randomInt(45, 165) / 100);
  // 最低1か所は十分な緩急がつくようにする。
  speeds[1] = 0.45;
  speeds[3] = 1.65;
  if (randomInt(0, 1)) speeds.reverse();
  return {
    duration: randomInt(3200, 4000),
    zone: randomInt(24, 60),
    width: randomInt(18, 23),
    reverse: !!randomInt(0, 1),
    speeds,
  };
}
export function qtePosition(elapsed, p) {
  const t = Math.max(0, Math.min(1, elapsed / p.duration)) * p.speeds.length;
  let distance = 0;
  for (let i = 0; i < p.speeds.length; i++)
    distance += p.speeds[i] * Math.max(0, Math.min(1, t - i));
  const pos = (100 * distance) / p.speeds.reduce((a, b) => a + b, 0);
  return p.reverse ? 100 - pos : pos;
}
export function qteHit(elapsed, p) {
  if (!p || elapsed < 0 || elapsed >= p.duration) return false;
  const pos = qtePosition(elapsed, p);
  return pos >= p.zone && pos <= p.zone + p.width;
}
