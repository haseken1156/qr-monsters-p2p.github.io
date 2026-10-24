/* モンスター20体・5タイプ・4つの技・レベルと戦闘ルール。名前や相性の変更はこのファイルです。 */
const MAX_LEVEL = 99;
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
// すべてのモンスターは、候補13種類から異なる4つを装備します。
const MOVE_IDS = [
  "element",
  "tackle",
  "guard",
  "heal",
  "poison",
  "quick",
  "heavy",
  "drain",
  "burst",
  "off0",
  "off1",
  "off2",
  "off3",
  "off4",
];
function normalizeNickname(value) {
  if (typeof value !== "string")
    throw new Error("名前を文字で入力してください。");
  const name = value.normalize("NFC").trim();
  if (
    Array.from(name).length > 12 ||
    /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/.test(name)
  )
    throw new Error("名前は改行なしの12文字以内で入力してください。");
  return name;
}
function validNickname(value) {
  try {
    return value === undefined || normalizeNickname(value) === value;
  } catch {
    return false;
  }
}
function displayName(monster) {
  return monster.nickname || SPECIES[monster.species].name;
}
// 状態異常は1種類だけ。技ID「poison」は旧セーブの編成を引き継ぐため維持します。
const AILMENTS = { poison: "毒", burn: "火傷", slow: "速度低下" };
const STATUS_MOVES = [
  { name: "灯火", ailment: "burn" },
  { name: "泡ブレス", ailment: "slow" },
  { name: "どくのきり", ailment: "poison" },
  { name: "感電", ailment: "burn" },
  { name: "罠に掛ける", ailment: "slow" },
];
function battleSpeed(m) {
  return m.ailment === "slow"
    ? Math.max(1, Math.floor(stats(m).speed / 2))
    : stats(m).speed;
}
const DEFAULT_MOVES = ["element", "tackle", "guard", "heal"];
function availableMoves(m) {
  const type = SPECIES[m.species].type;
  return [
    {
      id: "element",
      name: NAMES[type],
      type,
      kind: "attack",
      power: 1.4,
      accuracy: 1,
      priority: 0,
      description: "属性攻撃 · 威力1.4倍 · 攻撃QTEで命中判定",
    },
    {
      id: "tackle",
      name: "たいあたり",
      type: -1,
      kind: "attack",
      power: 1,
      accuracy: 1,
      priority: 0,
      description: "通常攻撃 · 威力1倍 · 攻撃QTEで命中判定",
    },
    {
      id: "guard",
      name: "ガード",
      type: -1,
      kind: "guard",
      power: 0,
      accuracy: 1,
      priority: 0,
      description: "このターンに受けるダメージを半減",
    },
    {
      id: "heal",
      name: "癒しの光",
      type: -1,
      kind: "heal",
      power: 0,
      accuracy: 1,
      priority: 0,
      qte: true,
      description: "QTEを2〜3回すべて成功で状態異常を解除＋最大HPの12%回復",
    },
    {
      id: "poison",
      name: STATUS_MOVES[type].name,
      type,
      kind: "status",
      ailment: STATUS_MOVES[type].ailment,
      power: 0,
      accuracy: 1,
      priority: 0,
      qte: true,
      description:
        STATUS_MOVES[type].ailment === "slow"
          ? "QTEを2〜3回すべて成功で速度低下 · 素早さ半減（重複なし）"
          : `QTEを2〜3回すべて成功で${AILMENTS[STATUS_MOVES[type].ailment]}状態 · ターン終了時に最大HPの5%ダメージ`,
    },
    {
      id: "quick",
      name: "でんこうせっか",
      type: -1,
      kind: "attack",
      power: 0.75,
      accuracy: 1,
      priority: 1,
      description: "先制攻撃 · 威力0.75倍 · 攻撃QTEで命中判定",
    },
    {
      id: "heavy",
      name: "ヘビータックル",
      type: -1,
      kind: "attack",
      power: 1.6,
      accuracy: 0.8,
      priority: 0,
      description: "通常攻撃 · 威力1.6倍 · 攻撃QTEで命中判定",
    },
    {
      id: "drain",
      name: TYPES[type] + "のドレイン",
      type,
      kind: "attack",
      power: 0.85,
      accuracy: 1,
      priority: 0,
      drain: 0.4,
      description: "属性攻撃 · 威力0.85倍 · 与えたダメージの40%回復",
    },
    {
      id: "burst",
      name: TYPES[type] + "のバースト",
      type,
      kind: "attack",
      power: 1.8,
      accuracy: 0.85,
      priority: 0,
      description: "属性攻撃 · 威力1.8倍 · 攻撃QTEで命中判定",
    },
    ...[
      "ひのこ",
      "みずでっぽう",
      "はっぱカッター",
      "スパーク",
      "いわつぶて",
    ].flatMap((name, otherType) =>
      otherType === type
        ? []
        : [
            {
              id: "off" + otherType,
              name,
              type: otherType,
              kind: "attack",
              power: 1.1,
              accuracy: 1,
              priority: 0,
              offType: true,
              description:
                TYPES[otherType] +
                "の他タイプ技 · 威力1.1倍（基本の一致技1.4倍より約21%低い） · 攻撃QTEで命中判定",
            },
          ],
    ),
  ];
}
function validLoadout(ids, monster) {
  return (
    Array.isArray(ids) &&
    ids.length === 4 &&
    new Set(ids).size === 4 &&
    ids.every(
      (id) =>
        MOVE_IDS.includes(id) &&
        (!monster ||
          !id.startsWith("off") ||
          Number(id.slice(3)) !== SPECIES[monster.species].type),
    )
  );
}
function selectedMoveIds(m) {
  return validLoadout(m.moves, m) ? [...m.moves] : [...DEFAULT_MOVES];
}
function movesFor(m) {
  const all = availableMoves(m);
  return selectedMoveIds(m).map((id) => all.find((move) => move.id === id));
}
function stats(m) {
  const bonus = (m.level - 1) * 2;
  return { hp: m.hp + bonus, attack: m.attack + bonus, speed: m.speed + bonus };
}
// 経験値は現在のレベル内で保持。育成中だけ保存し、戦闘中の状態異常は保存しません。
function xpForLevel(level) {
  return level >= MAX_LEVEL ? 0 : 100 + (level - 1) * 20;
}
// 必要量に合わせて報酬も増やし、高レベルでも育成ペースを維持。
function cpuExperience(level, result) {
  const rate = result === "win" ? .6 : result === "draw" ? .3 : .15;
  return Math.ceil(xpForLevel(level) * rate);
}
// CPU勝利時だけ抽選。結果は戦闘報酬に保存して二重付与を防ぎます。
function cpuCrystalDrop(won, roll) {
  if (!won) return 0;
  return (roll ?? randomInt(1, 100)) <= 20 ? 1 : 0;
}
function awardExperience(monster, amount) {
  if (monster.level >= MAX_LEVEL) {
    monster.xp = 0;
    return { xp: 0, levels: 0, capped: true };
  }
  monster.xp = (monster.xp || 0) + amount;
  let levels = 0;
  while (monster.level < MAX_LEVEL && monster.xp >= xpForLevel(monster.level)) {
    monster.xp -= xpForLevel(monster.level);
    monster.level++;
    levels++;
  }
  if (monster.level === MAX_LEVEL) monster.xp = 0;
  return { xp: amount, levels, capped: monster.level === MAX_LEVEL };
}
function cpuMoveIndex(monster, turn = 1) {
  const moves = movesFor(monster),
    heal = moves.findIndex((m) => m.kind === "heal" && !moveCoolingDown(monster, m.id, turn)),
    status = moves.findIndex((m) => m.kind === "status" && !moveCoolingDown(monster, m.id, turn));
  if (
    heal >= 0 &&
    (monster.currentHp < stats(monster).hp * 0.4 || monster.ailment) &&
    randomInt(1, 100) <= 35
  )
    return heal;
  if (status >= 0 && randomInt(1, 100) <= 15) return status;
  const attacks = moves
    .map((m, i) => (m.kind === "attack" && !moveCoolingDown(monster, m.id, turn) ? i : -1))
    .filter((i) => i >= 0);
  const usable = moves.map((m,i) => moveCoolingDown(monster,m.id,turn) ? -1 : i).filter(i=>i>=0);
  const pool = attacks.length ? attacks : usable;
  return pool[randomInt(0, pool.length - 1)];
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
    xp: 0,
    hp: randomInt(500, 800),
    attack: randomInt(70, 90),
    speed: randomInt(50, 100),
    moves: [...DEFAULT_MOVES],
  };
}
// QTEの結果は選択した技にひも付けて、そのターンだけ使用します。
function requiresQte(move) {
  return ["attack", "status", "heal"].includes(move?.kind);
}
function validQteResult(move, result) {
  if (move?.kind === "attack") return ["critical", "normal", "miss"].includes(result);
  if (requiresQte(move)) return typeof result === "boolean";
  return result === null || result === undefined;
}
function moveCoolingDown(monster, moveId, turn) {
  return Number.isInteger(monster.cooldowns?.[moveId]) && monster.cooldowns[moveId] >= turn;
}
function cpuQteResult(move) {
  if (move.kind === "attack") {
    const roll = randomInt(1, 100);
    return roll <= 15 ? "critical" : roll <= 85 ? "normal" : "miss";
  }
  return requiresQte(move) ? randomInt(1, 100) <= 70 : null;
}
function resolveTurn(r) {
  const chosen = r.players.map((p, i) => movesFor(p)[r.moves[i]]);
  r.players.forEach((p,i) => {
    if (!chosen[i] || moveCoolingDown(p,chosen[i].id,r.turn))
      throw new Error("この技はクールタイム中です。別の技を選んでください。");
    if (!validQteResult(chosen[i],r.qtes?.[i]))
      throw new Error("QTEの結果を確認してください。");
  });
  const state = () => ({
    hp: r.players.map((p) => p.currentHp),
    ailments: r.players.map((p) => p.ailment || null),
  });
  const playback = { turn: r.turn, before: state(), events: [] };
  r.log = [`ターン ${r.turn}`];
  function event(kind, actor, target, text) {
    r.log.push(text);
    playback.events.push({
      kind,
      actor,
      target,
      text,
      moveType: actor === null ? null : chosen[actor].type,
      critical: kind === "attack" && r.qtes?.[actor] === "critical",
      ...state(),
    });
  }
  r.players.forEach((p, i) => {
    p.guard = chosen[i].kind === "guard";
    p.ailment ??= null;
  });
  const speed = r.players.map(battleSpeed),
    priority = chosen.map((m) => m.priority);
  const first =
    priority[0] !== priority[1]
      ? priority[0] > priority[1]
        ? 0
        : 1
      : speed[0] === speed[1]
        ? randomInt(0, 1)
        : speed[0] > speed[1]
          ? 0
          : 1;
  const order = [first, 1 - first];
  function victory() {
    const fallen = r.players.map((p) => p.currentHp <= 0);
    if (!fallen.some(Boolean)) return false;
    r.status = "ended";
    r.winner = fallen.every(Boolean)
      ? "draw"
      : r.players[fallen[0] ? 1 : 0].owner;
    event(
      "end",
      null,
      null,
      r.winner === "draw"
        ? "両者が倒れた！ 引き分け！"
        : `${displayName(r.players[fallen[0] ? 1 : 0])} の勝利！`,
    );
    return true;
  }
  for (const i of order) {
    const p = r.players[i],
      enemy = r.players[1 - i],
      move = chosen[i],
      name = displayName(p);
    if (p.currentHp <= 0) continue;
    p.cooldowns ??= {};
    p.cooldowns[move.id] = r.turn + 1; // 使用ターンの次の1ターンを禁止。
    if (move.kind === "guard") {
      event("guard", i, i, `${name} はガード！ このターンの被ダメージを半減。`);
      continue;
    }
    if (move.kind !== "attack" && requiresQte(move) && r.qtes?.[i] !== true) {
      event("qteFail", i, i, `${name} の ${move.name}！ QTE失敗で効果なし。`);
      continue;
    }
    if (move.kind === "heal") {
      const before = p.currentHp,
        previousAilment = p.ailment;
      p.ailment = null;
      p.currentHp = Math.min(
        stats(p).hp,
        p.currentHp + Math.floor(stats(p).hp * 0.12),
      );
      event(
        "heal",
        i,
        i,
        `${name} の ${move.name}！ ${previousAilment ? `${AILMENTS[previousAilment]}を解除し、` : ""}HPを${p.currentHp - before}回復！`,
      );
      continue;
    }
    if (move.kind === "status") {
      const already = enemy.ailment === move.ailment;
      enemy.ailment = move.ailment;
      event(
        "status",
        i,
        1 - i,
        `${name} の ${move.name}！ ${displayName(enemy)}${already ? "はすでに" : "を"}${AILMENTS[move.ailment]}状態${already ? "。" : "にした！"}`,
      );
      continue;
    }
    if (r.qtes?.[i] === "miss") {
      event("miss", i, 1 - i, `${name} の ${move.name}！ しかし外れた！`);
      continue;
    }
    const a = move.type,
      b = SPECIES[enemy.species].type,
      mult = a < 0 ? 1 : STRONG[a] === b ? 1.5 : STRONG[b] === a ? 0.75 : 1;
    const damage = Math.max(
      1,
      Math.floor(stats(p).attack * move.power * mult * (r.qtes?.[i] === "critical" ? 1.5 : 1) * (enemy.guard ? 0.5 : 1)),
    );
    const dealt = Math.min(enemy.currentHp, damage);
    enemy.currentHp = Math.max(0, enemy.currentHp - damage);
    let text = `${name} の ${move.name}！ ${r.qtes?.[i] === "critical" ? "急所に命中！ " : ""}${dealt}ダメージ${mult > 1 ? "・効果抜群！" : mult < 1 ? "・いまひとつ" : ""}`;
    if (move.drain) {
      const before = p.currentHp;
      p.currentHp = Math.min(
        stats(p).hp,
        p.currentHp + Math.floor(dealt * move.drain),
      );
      text += ` HPを${p.currentHp - before}吸収！`;
    }
    event("attack", i, 1 - i, text);
    if (victory()) break;
  }
  if (r.status !== "ended") {
    // 毒と火傷は両者の行動後に最大HPの5%ダメージ。同時に倒れた場合は引き分け。
    for (const i of order) {
      const p = r.players[i];
      if (!["poison", "burn"].includes(p.ailment) || p.currentHp <= 0) continue;
      const damage = Math.min(
        p.currentHp,
        Math.max(1, Math.floor(stats(p).hp * 0.05)),
      );
      p.currentHp -= damage;
      event(
        "statusTick",
        i,
        i,
        `${displayName(p)} は${AILMENTS[p.ailment]}で${damage}ダメージ！`,
      );
    }
    victory();
  }
  r.playback = playback;
  r.moves = [null, null];
  r.qtes = [null, null];
  r.players.forEach((p) => (p.guard = false));
  r.turn++;
}

export {
  MAX_LEVEL,
  validQteResult,
  moveCoolingDown,
  cpuQteResult,
  xpForLevel,
  cpuExperience,
  cpuCrystalDrop,
  awardExperience,
  cpuMoveIndex,
  AILMENTS,
  battleSpeed,
  MOVE_IDS,
  displayName,
  normalizeNickname,
  validNickname,
  COLORS,
  SPECIES,
  STRONG,
  TYPES,
  DEFAULT_MOVES,
  availableMoves,
  validLoadout,
  selectedMoveIds,
  movesFor,
  newMonster,
  randomInt,
  resolveTurn,
  requiresQte,
  stats,
};
