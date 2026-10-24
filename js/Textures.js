/* PNGを同名で置くだけで変更。なければ同梱SVGを使います。ユーザーデータは保存しません。 */
import { jsx, jsxs, useEffect, useState } from "../vendor/libraries.js?v=result-bgm-20261024";
const ELEMENTS = ["fire", "water", "grass", "lightning", "earth"];
export const TEXTURE_SLOTS = [
  "backgrounds/page",
  "backgrounds/battle",
  "backgrounds/partner",
  ...[
    "fire",
    "water",
    "grass",
    "lightning",
    "earth",
    "normal",
    "heal",
    "guard",
  ].map((x) => "effects/" + x),
];
const overrides = new Map(),
  pending = new Set(),
  listeners = new Map();
const revision = Date.now().toString(36);
export function textureUrl(slot, ext = "svg") {
  if (!TEXTURE_SLOTS.includes(slot)) throw new Error("Unknown texture slot");
  return (
    new URL("../assets/textures/" + slot + "." + ext, import.meta.url).href +
    ("?skin=" + (ext === "png" ? revision : "pixel-20261022"))
  );
}
export function loadTextureOverride(slot) {
  if (pending.has(slot)) return;
  pending.add(slot);
  const image = new Image();
  image.onload = () => {
    overrides.set(slot, image.src);
    listeners.get(slot)?.forEach((fn) => fn(image.src));
  };
  image.onerror = () => {}; // 未配置なら同梱SVG。エラー表示でゲームを中断しません。
  image.src = textureUrl(slot, "png");
}
export function useTexture(slot) {
  const [url, setUrl] = useState(() => overrides.get(slot) || textureUrl(slot));
  useEffect(() => {
    setUrl(overrides.get(slot) || textureUrl(slot));
    const set = listeners.get(slot) || new Set();
    listeners.set(slot, set);
    set.add(setUrl);
    loadTextureOverride(slot);
    return () => set.delete(setUrl);
  }, [slot]);
  return url;
}
export function effectForAction(action) {
  if (
    !action ||
    !["attack", "status", "guard", "heal", "miss"].includes(action.kind)
  )
    return null;
  if (action.kind === "heal" || action.kind === "guard") return action.kind;
  return ELEMENTS[action.moveType] || "normal";
}
const FX_COLORS = {fire:['#ff7738','#ffe994'], water:['#49bdff','#d4faff'],
  grass:['#7ee069','#e2ffb5'], lightning:['#ffe24b','#fffbd8'], earth:['#c98b50','#ffe2a0'],
  normal:['#b2d5ff','#ffffff'], heal:['#83f4b4','#edfff4'], guard:['#78bdff','#ddf5ff']};
export function CastEffect({ effect }) {
  const url = useTexture("effects/" + effect);
  const colors = FX_COLORS[effect] || FX_COLORS.normal;
  return jsxs("span", {
    className: "cast-effect cast-" + effect,
    "data-effect": effect,
    "aria-hidden": true,
    style: { backgroundImage: `url("${url}")`, '--pixel-color':colors[0] },
    children: [
      jsx("b",{className:"pixel-shockwave"}),
      ...Array.from({length:36},(_,i)=>{
      const angle=i*2.39996;
      const dx=Math.round(Math.cos(angle)*(40+i%4*12)/4)*4;
      let dy=Math.round(Math.sin(angle)*52/4)*4;
      if(['fire','grass','heal'].includes(effect))dy=-36-i%5*12;
      if(effect==='earth')dy=20+i%5*12;
      return jsx('i',{className:'pixel-mote'+(i%3===0?' pixel-spark':''),style:{
        left:(12+(i*29)%76)+'%',top:(18+(i*17)%67)+'%',
        '--dx':dx+'px','--dy':dy+'px','--delay':(i%4*35)+'ms',
        backgroundColor:colors[i%2]
      }},i);
    })]
  });
}
export function TextureTheme() {
  const page = useTexture("backgrounds/page"),
    battle = useTexture("backgrounds/battle"),
    partner = useTexture("backgrounds/partner");
  useEffect(() => {
    const style = document.documentElement.style;
    for (const [name, url] of [
      ["page", page],
      ["battle", battle],
      ["partner", partner],
    ])
      style.setProperty("--texture-" + name, `url("${url}")`);
  }, [page, battle, partner]);
  useEffect(() => {
    TEXTURE_SLOTS.forEach(loadTextureOverride);
  }, []);
  return null;
}
