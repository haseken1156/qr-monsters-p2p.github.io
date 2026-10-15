/* モンスター20体・5タイプ・4つの技・レベルと戦闘ルール。名前や相性の変更はこのファイルです。 */
const TYPES = ["炎", "水", "草", "雷", "土"];
const COLORS = ["#ff825d", "#61caff", "#9fe579", "#ffe36c", "#d9ab81"];
const SPECIES = [
  { name: "ヒノコ", description: "小さな炎に、大きな闘志。", type: 0 },
  { name: "ミズル", description: "静かな水面のいたずらっ子。", type: 1 },
  { name: "ハッパル", description: "木漏れ日から生まれた相棒。", type: 2 },
  { name: "ライピョン", description: "稲妻よりも、ひと足はやく。", type: 3 },
  { name: "ゴロック", description: "どっしり構える大地の守り手。", type: 4 },
  { name: "ホムラト", description: "しっぽの火で道を照らす。", type: 0 },
  { name: "プルクラ", description: "ふわりと漂う海のランタン。", type: 1 },
  { name: "モリフク", description: "森の秘密を見守る小さな目。", type: 2 },
  { name: "ビリハリ", description: "とげとげの針に雷をためる。", type: 3 },
  { name: "ドチガメ", description: "背中に大地をのせて歩く。", type: 4 },
  { name: "ヒバネ", description: "羽ばたくたびに火花が踊る。", type: 0 },
  { name: "シャキュア", description: "波を切り裂く元気な泳ぎ手。", type: 1 },
  { name: "キノポン", description: "雨あがりにひょっこり顔を出す。", type: 2 },
  { name: "ライクモ", description: "小さな雲に大きな雷鳴。", type: 3 },
  { name: "ツチモグ", description: "地面の下からチャンスを狙う。", type: 4 },
  { name: "エンガオ", description: "たてがみに燃える勇気を宿す。", type: 0 },
  { name: "ペンミズ", description: "水しぶきと一緒に飛び込む。", type: 1 },
  { name: "ワカシカ", description: "若葉の角で春を呼ぶ。", type: 2 },
  { name: "ライドラ", description: "稲妻をまとって空を目指す。", type: 3 },
  { name: "イシカブ", description: "きらめく結晶を守るかぶと虫。", type: 4 },
];
const STRONG = [2, 0, 4, 1, 3];
const NAMES = [
  "フレアブレス",
  "アクアウェーブ",
  "リーフストーム",
  "サンダーボルト",
  "ロックインパクト",
];
function movesFor(m) {
  return [
    {
      name: NAMES[SPECIES[m.species].type],
      type: SPECIES[m.species].type,
      description: "属性攻撃 · 威力 1.4倍",
    },
    { name: "たいあたり", type: -1, description: "相性に左右されない · 威力 1倍" },
    { name: "まもる", type: -1, description: "このターンのダメージを半減" },
    { name: "いやしの光", type: -1, description: "最大HPの12%を回復" },
  ];
}
function stats(m) {
  const bonus = (m.level - 1) * 2;
  return { hp: m.hp + bonus, attack: m.attack + bonus, speed: m.speed + bonus };
}
function randomInt(min, max) {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return min + (a[0] % (max - min + 1));
}
function newMonster(species) {
  return {
    id: crypto.randomUUID(),
    species,
    level: 1,
    hp: randomInt(500, 800),
    attack: randomInt(30, 70),
    speed: randomInt(50, 100),
  };
}
function resolveTurn(r) {
  r.log = [`ターン ${r.turn}`];
  r.players.forEach((p, i) => {
    p.guard = r.moves[i] === 2;
    if (p.guard) r.log.push(`${SPECIES[p.species].name} は守りを固めた！`);
  });
  const s = r.players.map((p) => stats(p).speed);
  const first = s[0] === s[1] ? randomInt(0, 1) : s[0] > s[1] ? 0 : 1;
  for (const i of [first, 1 - first]) {
    const p = r.players[i],
      enemy = r.players[1 - i],
      move = r.moves[i];
    if (p.currentHp <= 0) continue;
    if (move === 2) continue;
    if (move === 3) {
      const before = p.currentHp;
      p.currentHp = Math.min(stats(p).hp, p.currentHp + Math.floor(stats(p).hp * 0.12));
      r.log.push(`${SPECIES[p.species].name} は HPを${p.currentHp - before}回復！`);
      continue;
    }
    let mult = 1;
    const a = SPECIES[p.species].type,
      b = SPECIES[enemy.species].type;
    if (move === 0) mult = STRONG[a] === b ? 1.5 : STRONG[b] === a ? 0.75 : 1;
    const damage = Math.max(
      1,
      Math.floor(stats(p).attack * (move === 0 ? 1.4 : 1) * mult * (enemy.guard ? 0.5 : 1)),
    );
    enemy.currentHp = Math.max(0, enemy.currentHp - damage);
    r.log.push(
      `${SPECIES[p.species].name} の ${movesFor(p)[move].name}！ ${damage}ダメージ${mult > 1 ? "・効果抜群！" : mult < 1 ? "・いまひとつ" : ""}`,
    );
    if (enemy.currentHp === 0) {
      r.status = "ended";
      r.winner = p.owner;
      r.log.push(`${SPECIES[p.species].name} の勝利！`);
      break;
    }
  }
  r.moves = [null, null];
  r.players.forEach((p) => (p.guard = false));
  r.turn++;
}
export { COLORS, SPECIES, STRONG, TYPES, movesFor, newMonster, randomInt, resolveTurn, stats };
