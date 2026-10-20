import { Peer } from "../vendor/libraries.js";
import { inspectClaim } from "./claims.js";
import {
  MOVE_IDS,
  xpForLevel,
  awardExperience,
  cpuMoveIndex,
  validNickname,
  normalizeNickname,
  newMonster,
  stats,
  resolveTurn,
  randomInt,
  SPECIES,
  validLoadout,
  selectedMoveIds,
  movesFor,
  requiresQte,
} from "./engine.js";
const KEY = "qr-monsters-p2p-v1",
  PREFIX = "qr-monsters-p2p-v7-",
  PROTOCOL = 7;
const fresh = () => ({
  userLevel: 1,
  dex: 0,
  monsters: [],
  materials: 0,
  used: [],
  selected: null,
});
function validMonster(m) {
  return (
    !!m &&
    typeof m.id === "string" &&
    m.id.length <= 80 &&
    Number.isInteger(m.species) &&
    m.species >= 0 &&
    m.species < SPECIES.length &&
    Number.isInteger(m.level) &&
    m.level >= 1 &&
    m.level <= 10 &&
    Number.isInteger(m.hp) &&
    m.hp >= 500 &&
    m.hp <= 800 &&
    Number.isInteger(m.attack) &&
    // 旧セーブの攻撃30〜69も継続利用します。新規入手とCPUは70〜90。
    m.attack >= 30 &&
    m.attack <= 90 &&
    Number.isInteger(m.speed) &&
    m.speed >= 50 &&
    m.speed <= 100 &&
    (m.moves === undefined || validLoadout(m.moves)) &&
    validNickname(m.nickname) &&
    (m.xp === undefined ||
      (Number.isInteger(m.xp) &&
        m.xp >= 0 &&
        (m.level === 10 ? m.xp === 0 : m.xp < xpForLevel(m.level))))
  );
}
let player = fresh(),
  storageNotice = "",
  lastSaveError = "",
  restored = false,
  saveBlocked = false;
// 保存対象は数値・ニックネーム・編成・入手記録だけ。画像や図鑑の説明文は保存しません。
// v:形式 / l:ユーザーLv / m:所持キャラ配列 / s:相棒の配列位置 / i:素材 / d:図鑑ビット / r:使用済みQR / t:保存時刻
function packPlayer(p) {
  return {
    v: 3,
    l: p.userLevel,
    m: p.monsters.map((m) => {
      const codes = selectedMoveIds(m)
        .map((id) => MOVE_IDS.indexOf(id).toString(36))
        .join("");
      const row = [
        m.id,
        m.species,
        m.level,
        m.hp,
        m.attack,
        m.speed,
        codes === "0123" ? "" : codes,
      ];
      if (m.nickname || m.xp) row.push(m.nickname || "");
      if (m.xp) row.push(m.xp);
      return row;
    }),
    s: p.monsters.findIndex((m) => m.id === p.selected),
    i: p.materials,
    d: p.dex,
    r: p.used,
    t: Date.parse(p.savedAt) || 0,
  };
}
function readSave(raw) {
  if (!raw) return null;
  let p = JSON.parse(raw);
  if (p?.v === 2 || p?.v === 3) {
    if (
      !Array.isArray(p.m) ||
      !Number.isInteger(p.s) ||
      p.s < -1 ||
      p.s >= p.m.length ||
      !Number.isInteger(p.t) ||
      p.t < 0
    )
      throw new Error("invalid compact save");
    const rows = p.m.map((row) => {
      if (
        !Array.isArray(row) ||
        row.length < 7 ||
        row.length > (p.v === 3 ? 9 : 8) ||
        typeof row[6] !== "string" ||
        (row.length >= 8 && typeof row[7] !== "string") ||
        (row.length === 9 && (!Number.isInteger(row[8]) || row[8] < 0))
      )
        throw new Error("invalid monster row");
      const codes = row[6] || "0123";
      if (!/^[0-8]{4}$/.test(codes)) throw new Error("invalid moves");
      return {
        id: row[0],
        species: row[1],
        level: row[2],
        hp: row[3],
        attack: row[4],
        speed: row[5],
        xp: row[8] ?? 0,
        moves: Array.from(codes, (c) => MOVE_IDS[parseInt(c, 36)]),
        ...(row[7] ? { nickname: row[7] } : {}),
      };
    });
    p = {
      userLevel: p.l,
      monsters: rows,
      selected: p.s < 0 ? null : rows[p.s].id,
      materials: p.i,
      dex: p.d,
      used: p.r,
      savedAt: p.t ? new Date(p.t).toISOString() : null,
    };
  } else if (p?.v !== undefined) throw new Error("unknown save version");
  if (
    !p ||
    !Array.isArray(p.monsters) ||
    p.monsters.length > 20 ||
    !p.monsters.every(validMonster) ||
    !Number.isSafeInteger(p.materials) ||
    p.materials < 0 ||
    !Array.isArray(p.used) ||
    !p.used.every((x) => typeof x === "string")
  )
    throw new Error("invalid save");
  if (
    new Set(p.monsters.map((m) => m.id)).size !== p.monsters.length ||
    new Set(p.monsters.map((m) => m.species)).size !== p.monsters.length
  )
    throw new Error("duplicate monster");
  if (p.userLevel === undefined) p.userLevel = 1;
  if (!Number.isInteger(p.userLevel) || p.userLevel < 1 || p.userLevel > 99999)
    throw new Error("invalid user level");
  if (p.dex === undefined) p.dex = 0;
  if (!Number.isInteger(p.dex) || p.dex < 0 || p.dex > 1048575)
    throw new Error("invalid encyclopedia");
  p.monsters = p.monsters.map((m) => ({
    ...m,
    xp: m.xp || 0,
    moves: selectedMoveIds(m),
  }));
  for (const m of p.monsters) p.dex |= 1 << m.species;
  if (!p.monsters.some((m) => m.id === p.selected))
    p.selected = p.monsters[0]?.id ?? null;
  return p;
}

try {
  const raw = localStorage.getItem(KEY),
    backup = localStorage.getItem(KEY + "-backup");
  let previous = null;
  try {
    previous = readSave(raw);
  } catch {}
  if (!previous && backup)
    try {
      previous = readSave(backup);
      if (previous)
        storageNotice = "バックアップから以前のデータを復元しました。";
    } catch {}
  if (previous) {
    player = previous;
    restored = true;
  } else if (raw || backup) {
    saveBlocked = true;
    lastSaveError =
      "保存データを読み込めませんでした。データは上書きせず保護しています。";
    storageNotice = lastSaveError;
  }
} catch {
  lastSaveError =
    "このブラウザでは保存データを利用できません。保存設定を確認してください。";
  storageNotice = lastSaveError;
}
function saveState() {
  return {
    savedAt: player.savedAt || null,
    persistent: !lastSaveError,
    error: lastSaveError || null,
    restored,
  };
}
function save() {
  if (saveBlocked) throw new Error(lastSaveError);
  const before = player.savedAt;
  try {
    player.savedAt = new Date().toISOString();
    const snapshot = JSON.stringify(packPlayer(player));
    localStorage.setItem(KEY, snapshot);
    try {
      localStorage.setItem(KEY + "-backup", snapshot);
    } catch {}
    if (lastSaveError) storageNotice = "";
    lastSaveError = "";
  } catch {
    player.savedAt = before;
    lastSaveError =
      "端末に保存できませんでした。ブラウザの保存設定・空き容量を確認してください。";
    storageNotice = lastSaveError;
  }
}
// 旧版の育成を引き継ぎ、初回のみ4つの標準技と保存時刻を補います。
if (restored && !saveBlocked) save();

let peer = null,
  connection = null,
  host = false,
  hostRoom = null,
  view = null,
  revision = 0,
  epoch = 0;
let joining = null;
const requests = /* @__PURE__ */ new Map();
const copy = (x) => JSON.parse(JSON.stringify(x));
function selected() {
  const m = player.monsters.find((m2) => m2.id === player.selected);
  if (!m) throw new Error("先にモンスターを入手して選んでください。");
  return copy(m);
}
function fighter(m, owner) {
  return { ...m, owner, currentHp: stats(m).hp, guard: false, ailment: null };
}
function publicRoom(r, role) {
  return {
    id: r.id,
    ...(r.mode === "cpu" ? { mode: "cpu", reward: r.reward || null } : {}),
    turn: r.turn,
    status: r.status,
    winner:
      r.winner === null
        ? null
        : r.winner === "draw"
          ? "draw"
          : r.winner === role
            ? "you"
            : "friend",
    log: copy(r.log),
    playback: r.playback ? copy(r.playback) : null,
    players: r.players.map(({ owner, ...m }) => ({
      ...m,
      isYou: owner === role,
    })),
    ready: r.moves.map((m) => m !== null),
    revision,
  };
}
function broadcast() {
  if (!hostRoom) return;
  revision++;
  view = publicRoom(hostRoom, "host");
  if (connection?.open)
    connection.send({
      protocol: PROTOCOL,
      kind: "snapshot",
      room: publicRoom(hostRoom, "guest"),
    });
}
function failPending(message) {
  if (joining) {
    clearTimeout(joining.timer);
    joining.reject(new Error(message));
    joining = null;
  }
  for (const p of requests.values()) {
    clearTimeout(p.timer);
    p.reject(new Error(message));
  }
  requests.clear();
}
function disconnected() {
  if (view && view.status !== "ended") {
    view = {
      ...view,
      status: "disconnected",
      log: [
        ...(view.log || []),
        "接続が切れました。新しい部屋を作って再接続してください。",
      ],
    };
  }
  failPending("友達との接続が切れました。もう一度部屋に入り直してください。");
}
function leaveRoom() {
  epoch++;
  try {
    connection?.close();
    peer?.destroy();
  } catch {}
  connection = null;
  peer = null;
  hostRoom = null;
  view = null;
  revision = 0;
  failPending("対戦部屋を離れました。");
}
function support() {
  if (!window.isSecureContext)
    throw new Error("P2P対戦はHTTPSのGitHub Pagesで開いてください。");
  if (!("RTCPeerConnection" in window))
    throw new Error(
      "このブラウザはP2P対戦に対応していません。SafariまたはChromeで開いてください。",
    );
}
const peerMessage = (e) =>
  e.type === "peer-unavailable"
    ? "その部屋が見つかりません。友達が部屋を開いているか、合言葉を確認してください。"
    : e.type === "unavailable-id"
      ? "同じ合言葉の部屋が使用中です。もう一度部屋を作ってください。"
      : "P2P接続ができませんでした。Wi-Fiなど別の回線で再度お試しください。";
function openPeer(id) {
  support();
  const current = epoch;
  return new Promise((resolve, reject) => {
    const p = new Peer(id, {
      debug: 0,
      secure: true,
      config: { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] },
    });
    peer = p;
    let opened = false;
    const timer = setTimeout(() => {
      p.destroy();
      reject(
        new Error(
          "接続サービスに接続できませんでした。ネット接続を確認してください。",
        ),
      );
    }, 2e4);
    p.on("open", () => {
      if (epoch !== current) {
        p.destroy();
        return;
      }
      opened = true;
      clearTimeout(timer);
      resolve(p);
    });
    p.on("error", (e) => {
      if (epoch !== current) return;
      if (!opened) {
        clearTimeout(timer);
        reject(new Error(peerMessage(e)));
      } else {
        failPending(peerMessage(e));
        if (!connection?.open) disconnected();
      }
    });
  });
}
function validPlayback(pb, players, turn) {
  if (pb === null) return true;
  const validState = (s) =>
    s &&
    Array.isArray(s.hp) &&
    s.hp.length === 2 &&
    s.hp.every(
      (hp, i) => Number.isInteger(hp) && hp >= 0 && hp <= stats(players[i]).hp,
    ) &&
    Array.isArray(s.ailments) &&
    s.ailments.length === 2 &&
    s.ailments.every((a) => [null, "poison", "burn", "slow"].includes(a));
  return (
    pb &&
    Number.isInteger(pb.turn) &&
    pb.turn === turn - 1 &&
    validState(pb.before) &&
    Array.isArray(pb.events) &&
    pb.events.length > 0 &&
    pb.events.length <= 8 &&
    pb.events.every(
      (e) =>
        validState(e) &&
        [
          "attack",
          "guard",
          "heal",
          "status",
          "statusTick",
          "qteFail",
          "miss",
          "end",
        ].includes(e.kind) &&
        [null, 0, 1].includes(e.actor) &&
        [null, 0, 1].includes(e.target) &&
        typeof e.text === "string" &&
        e.text.length < 250,
    )
  );
}
function validView(r) {
  return (
    r &&
    /^\d{6}$/.test(r.id) &&
    Number.isInteger(r.turn) &&
    r.turn >= 1 &&
    r.turn <= 1e5 &&
    ["waiting", "battle", "ended"].includes(r.status) &&
    Array.isArray(r.players) &&
    r.players.length === 2 &&
    r.players.every(
      (p) =>
        validMonster(p) &&
        typeof p.isYou === "boolean" &&
        Number.isInteger(p.currentHp) &&
        p.currentHp >= 0 &&
        p.currentHp <= stats(p).hp &&
        [null, "poison", "burn", "slow"].includes(p.ailment),
    ) &&
    r.players.filter((p) => p.isYou).length === 1 &&
    Array.isArray(r.ready) &&
    r.ready.length === 2 &&
    r.ready.every((v) => typeof v === "boolean") &&
    Array.isArray(r.log) &&
    r.log.length <= 10 &&
    r.log.every((s) => typeof s === "string" && s.length < 250) &&
    [null, "you", "friend", "draw"].includes(r.winner) &&
    validPlayback(r.playback, r.players, r.turn) &&
    Number.isInteger(r.revision)
  );
}
function applySnapshot(r) {
  if (!validView(r)) throw new Error("対戦データを確認できませんでした。");
  if (!view || r.revision >= view.revision) view = copy(r);
}
function attachHost(c, myEpoch) {
  if (connection) {
    c.on("open", () => {
      c.send({
        protocol: PROTOCOL,
        kind: "error",
        message: "この部屋は満員です。",
      });
      setTimeout(() => c.close(), 300);
    });
    return;
  }
  connection = c;
  let welcomed = false;
  const helloTimeout = setTimeout(() => {
    if (!welcomed) c.close();
  }, 12e3);
  c.on("data", (data) => {
    if (epoch !== myEpoch || !hostRoom) return;
    const m = data;
    if (!m || m.protocol !== PROTOCOL || typeof m.kind !== "string") return;
    if (m.kind === "hello" && !welcomed) {
      if (!validMonster(m.monster)) {
        c.send({
          protocol: PROTOCOL,
          kind: "error",
          message: "モンスター情報を確認してください。",
        });
        c.close();
        return;
      }
      welcomed = true;
      clearTimeout(helloTimeout);
      hostRoom.players.push(fighter(copy(m.monster), "guest"));
      hostRoom.status = "battle";
      hostRoom.log = ["P2P接続完了！ 技を選んでください。"];
      broadcast();
      return;
    }
    if (
      m.kind === "move" &&
      welcomed &&
      typeof m.requestId === "string" &&
      m.requestId.length <= 80
    ) {
      try {
        if (
          hostRoom.status !== "battle" ||
          m.turn !== hostRoom.turn ||
          hostRoom.moves[1] !== null ||
          !Number.isInteger(m.move) ||
          m.move < 0 ||
          m.move > 3
        )
          throw new Error("このターンでは技を選べません。");
        const needs = requiresQte(movesFor(hostRoom.players[1])[m.move]);
        if (needs && typeof m.qte !== "boolean")
          throw new Error("この技にはQTEが必要です。");
        hostRoom.qtes[1] = needs ? m.qte : null;
        hostRoom.moves[1] = m.move;
        if (hostRoom.moves.every((x) => x !== null)) resolveTurn(hostRoom);
        broadcast();
        c.send({
          protocol: PROTOCOL,
          kind: "ack",
          requestId: m.requestId,
          room: publicRoom(hostRoom, "guest"),
        });
      } catch (e) {
        c.send({
          protocol: PROTOCOL,
          kind: "error",
          requestId: m.requestId,
          message: e.message,
        });
      }
    }
  });
  c.on("close", () => {
    clearTimeout(helloTimeout);
    if (epoch !== myEpoch) return;
    if (!welcomed) {
      connection = null;
      return;
    }
    disconnected();
  });
  c.on("error", () => {
    if (epoch === myEpoch) disconnected();
  });
}
async function createRoom() {
  leaveRoom();
  host = true;
  const code = String(randomInt(1e5, 999999)),
    m = selected(),
    myEpoch = epoch;
  const p = await openPeer(PREFIX + code);
  hostRoom = {
    id: code,
    players: [fighter(m, "host")],
    moves: [null, null],
    qtes: [null, null],
    playback: null,
    turn: 1,
    status: "waiting",
    winner: null,
    log: ["友達の参加を待っています。"],
  };
  broadcast();
  p.on("connection", (c) => {
    if (epoch === myEpoch) attachHost(c, myEpoch);
    else c.close();
  });
  return { room: copy(view) };
}
async function joinRoom(code) {
  if (!/^\d{6}$/.test(code)) throw new Error("合言葉は6桁の数字です。");
  const m = selected();
  leaveRoom();
  host = false;
  const myEpoch = epoch;
  const p = await openPeer();
  const c = p.connect(PREFIX + code, {
    reliable: true,
    serialization: "json",
    metadata: { protocol: PROTOCOL },
  });
  connection = c;
  return new Promise((resolve, reject) => {
    joining = {
      resolve,
      reject,
      timer: setTimeout(() => {
        failPending(
          "接続に時間がかかっています。Wi-Fiに切り替えるか、部屋を作り直してください。",
        );
        c.close();
      }, 25e3),
    };
    c.on("open", () => {
      if (epoch === myEpoch)
        c.send({ protocol: PROTOCOL, kind: "hello", monster: m });
    });
    c.on("data", (data) => {
      if (epoch !== myEpoch || !data || data.protocol !== PROTOCOL) return;
      try {
        if (data.kind === "snapshot" || data.kind === "ack") {
          applySnapshot(data.room);
          if (joining) {
            clearTimeout(joining.timer);
            joining.resolve({ room: copy(view) });
            joining = null;
          }
          if (data.kind === "ack") {
            const req = requests.get(data.requestId);
            if (req) {
              clearTimeout(req.timer);
              requests.delete(data.requestId);
              req.resolve({ room: copy(view) });
            }
          }
        } else if (data.kind === "error") {
          const message =
            typeof data.message === "string"
              ? data.message.slice(0, 200)
              : "接続できませんでした。";
          const req = requests.get(data.requestId);
          if (req) {
            clearTimeout(req.timer);
            requests.delete(data.requestId);
            req.reject(new Error(message));
          } else failPending(message);
        }
      } catch {
        disconnected();
        c.close();
      }
    });
    c.on("close", () => {
      if (epoch === myEpoch) disconnected();
    });
    c.on("error", () => {
      if (epoch === myEpoch) disconnected();
    });
  });
}
function startCpuBattle() {
  if (saveBlocked) throw new Error(lastSaveError);
  if (view && ["battle", "waiting"].includes(view.status))
    throw new Error("今の対戦を終えるか、部屋を離れてください。");
  const mine = selected();
  leaveRoom();
  host = true;
  const enemy = {
    ...newMonster(randomInt(0, SPECIES.length - 1)),
    level: mine.level,
    hp: randomInt(500, 650),
    attack: randomInt(70, 90),
    speed: randomInt(60, 85),
    moves: ["element", "tackle", "poison", "heal"],
  };
  hostRoom = {
    id: "cpu-" + crypto.randomUUID(),
    mode: "cpu",
    turn: 1,
    status: "battle",
    winner: null,
    players: [fighter(mine, "host"), fighter(enemy, "cpu")],
    moves: [null, null],
    qtes: [null, null],
    log: ["CPUとの育成バトル！ 最後まで戦うと経験値を獲得。"],
    playback: null,
    reward: null,
  };
  broadcast();
  return { room: copy(view) };
}
function finishCpuBattle() {
  if (hostRoom.status !== "ended" || hostRoom.reward) return;
  const monster = player.monsters.find((m) => m.id === hostRoom.players[0].id);
  if (!monster) throw new Error("育成するキャラが見つかりません。");
  const amount =
    hostRoom.winner === "host" ? 20 : hostRoom.winner === "draw" ? 10 : 5;
  const reward = awardExperience(monster, amount);
  reward.message = reward.xp
    ? `経験値 +${reward.xp}！${reward.levels ? ` Lv.${monster.level}にアップ！ 全能力 +${reward.levels * 2}` : ` 次のレベルまで ${xpForLevel(monster.level) - monster.xp} EXP`}`
    : "最大Lv.10です。これ以上経験値は増えません。";
  hostRoom.reward = reward;
  save();
}
async function chooseMove(body) {
  if (
    !view ||
    view.status !== "battle" ||
    body.room !== view.id ||
    body.turn !== view.turn ||
    !Number.isInteger(body.move) ||
    body.move < 0 ||
    body.move > 3
  )
    throw new Error("ターンと技を確認してください。");
  const i = view.players.findIndex((p) => p.isYou);
  if (view.ready[i]) throw new Error("すでに技を選びました。");
  const needs = requiresQte(movesFor(view.players[i])[body.move]);
  if (needs && typeof body.qte !== "boolean")
    throw new Error("この技にはQTEが必要です。");
  if (host && hostRoom?.mode === "cpu") {
    hostRoom.moves[0] = body.move;
    hostRoom.qtes[0] = needs ? body.qte : null;
    hostRoom.moves[1] = cpuMoveIndex(hostRoom.players[1]);
    const cpuNeeds = requiresQte(
      movesFor(hostRoom.players[1])[hostRoom.moves[1]],
    );
    hostRoom.qtes[1] = cpuNeeds ? randomInt(1, 100) <= 70 : null;
    resolveTurn(hostRoom);
    finishCpuBattle();
    broadcast();
    return { room: copy(view), player: copy(player), saveState: saveState() };
  }
  if (!connection?.open) throw new Error("友達との接続が切れています。");
  if (host) {
    if (!hostRoom) throw new Error("対戦を開始してください。");
    hostRoom.qtes[0] = needs ? body.qte : null;
    hostRoom.moves[0] = body.move;
    if (hostRoom.moves.every((x) => x !== null)) resolveTurn(hostRoom);
    broadcast();
    return { room: copy(view) };
  }
  const requestId = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      requests.delete(requestId);
      reject(new Error("技を送信できませんでした。接続を確認してください。"));
    }, 15e3);
    requests.set(requestId, { resolve, reject, timer });
    connection.send({
      protocol: PROTOCOL,
      kind: "move",
      requestId,
      turn: body.turn,
      move: body.move,
      qte: needs ? body.qte : null,
    });
  });
}
async function localRequest(path, options) {
  const method = options?.method || "GET";
  if (method === "GET") {
    if (path.startsWith("/api/game?room=")) {
      const code = path.slice("/api/game?room=".length);
      if (!view || view.id !== code)
        throw new Error("部屋が閉じられています。新しい部屋を作ってください。");
      return { room: copy(view) };
    }
    const notice = storageNotice;
    storageNotice = "";
    return {
      player: copy(player),
      message: notice || (restored ? "保存データから再開しました。" : ""),
      saveState: saveState(),
    };
  }
  const b = JSON.parse(options.body);
  if (b.action === "cpu") return startCpuBattle();
  if (b.action === "create") return createRoom();
  if (b.action === "join") return joinRoom(String(b.room).trim());
  if (b.action === "move") return chooseMove(b);
  if (saveBlocked) throw new Error(lastSaveError);
  let message = "";
  if (b.action === "save") {
    save();
    return {
      player: copy(player),
      message: storageNotice || "セーブしました。",
      saveState: saveState(),
    };
  }
  if (b.action === "rename") {
    if (view && ["waiting", "battle"].includes(view.status))
      throw new Error("部屋を離れてから名前を変更してください。");
    const m = player.monsters.find((x) => x.id === b.monster);
    if (!m) throw new Error("モンスターを選んでください。");
    const nickname = normalizeNickname(b.nickname);
    if (nickname) m.nickname = nickname;
    else delete m.nickname;
    save();
    return {
      player: copy(player),
      message:
        storageNotice ||
        (nickname ? "名前を変更しました。" : "元の名前に戻しました。"),
      saveState: saveState(),
    };
  }
  if (b.action === "loadout") {
    if (view && ["waiting", "battle"].includes(view.status))
      throw new Error("部屋を離れてから技を変更してください。");
    const m = player.monsters.find((x) => x.id === b.monster);
    if (!m) throw new Error("モンスターを選んでください。");
    if (!validLoadout(b.moves))
      throw new Error("異なる技を4つ選んでください。");
    m.moves = [...b.moves];
    save();
    return {
      player: copy(player),
      message: storageNotice || "4つの技を保存しました。",
      saveState: saveState(),
    };
  }
  if (b.action === "redeem") {
    const c = await inspectClaim(b.token);
    if (player.used.includes(c.id))
      throw new Error("このQRコードは受け取り済みです。");
    if (c.kind === "monster") {
      if (player.monsters.some((m2) => m2.species === c.species))
        throw new Error("このモンスターはすでに仲間です。");
      const m = newMonster(c.species);
      player.monsters.push(m);
      player.dex |= 1 << m.species;
      player.selected ??= m.id;
      message = c.label + " を仲間にしました！";
    } else {
      player.materials += c.amount;
      message = `強化クリスタルを${c.amount}個入手！`;
    }
    player.used.push(c.id);
  } else if (b.action === "select" || b.action === "upgrade") {
    if (view && ["waiting", "battle"].includes(view.status))
      throw new Error("部屋を離れてから相棒の変更・強化をしてください。");
    const m = player.monsters.find((x) => x.id === b.monster);
    if (!m) throw new Error("モンスターを選んでください。");
    if (b.action === "select") player.selected = m.id;
    else {
      if (m.level >= 10) throw new Error("すでに最大レベルです。");
      if (player.materials < 1) throw new Error("強化クリスタルが足りません。");
      m.level++;
      if (m.level === 10) m.xp = 0;
      player.materials--;
      message = "レベルアップ！ 全ステータス +2";
    }
  } else throw new Error("操作を確認してください。");
  save();
  return {
    player: copy(player),
    message: storageNotice || message,
    saveState: saveState(),
  };
}
async function gameFetch(path, options = {}) {
  try {
    const data = await localRequest(path, options);
    return { ok: true, status: 200, json: async () => data };
  } catch (e) {
    return { ok: false, status: 400, json: async () => ({ error: e.message }) };
  }
}
window.addEventListener("beforeunload", () => {
  try {
    connection?.close();
    peer?.destroy();
  } catch {}
});
export { gameFetch, leaveRoom };
