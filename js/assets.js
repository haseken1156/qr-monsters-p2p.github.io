// 公開するのはモンスターの見た目だけ。入手QR画像は同梱しません。
export const SPRITES=Array.from({length:20},(_,i)=>new URL('../assets/monsters/'+i+'.png',import.meta.url).href);
