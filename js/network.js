import { Peer } from "../vendor/libraries.js";
import { inspectClaim } from "./claims.js";
import { newMonster, stats, resolveTurn, randomInt, SPECIES } from "./engine.js";
const KEY = "qr-monsters-p2p-v1",
  PREFIX = "qr-monsters-p2p-v1-",
  PROTOCOL = 1;
const fresh = () => ({ monsters: [], materials: 0, used: [], selected: null });
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
    m.attack >= 30 &&
    m.attack <= 70 &&
    Number.isInteger(m.speed) &&
    m.speed >= 50 &&
    m.speed <= 100
  );
}
let player = fresh(),
  storageNotice = "";
try {
  const raw = localStorage.getItem(KEY);
  if (raw) {
    const p = JSON.parse(raw);
    if (
      !Array.isArray(p.monsters) ||
      p.monsters.length > 20 ||
      !p.monsters.every(validMonster) ||
      !Number.isInteger(p.materials) ||
      p.materials < 0 ||
      !Array.isArray(p.used)
    )
      throw new Error();
    player = p;
  }
} catch {
  storageNotice = "保存データを読み込めませんでした。このブラウザの保存設定を確認してください。";
}
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(player));
  } catch {
    storageNotice = "保存が制限されています。ページを閉じると育成データが失われることがあります。";
  }
}
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
  return { ...m, owner, currentHp: stats(m).hp, guard: false };
}
function publicRoom(r, role) {
  return {
    id: r.id,
    turn: r.turn,
    status: r.status,
    winner: r.winner === null ? null : r.winner === role ? "you" : "friend",
    log: copy(r.log),
    players: r.players.map(({ owner, ...m }) => ({ ...m, isYou: owner === role })),
    ready: r.moves.map((m) => m !== null),
    revision,
  };
}
function broadcast() {
  if (!hostRoom) return;
  revision++;
  view = publicRoom(hostRoom, "host");
  if (connection?.open)
    connection.send({ protocol: PROTOCOL, kind: "snapshot", room: publicRoom(hostRoom, "guest") });
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
      log: [...(view.log || []), "接続が切れました。新しい部屋を作って再接続してください。"],
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
  if (!window.isSecureContext) throw new Error("P2P対戦はHTTPSのGitHub Pagesで開いてください。");
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
      reject(new Error("接続サービスに接続できませんでした。ネット接続を確認してください。"));
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
        p.currentHp <= stats(p).hp,
    ) &&
    r.players.filter((p) => p.isYou).length === 1 &&
    Array.isArray(r.ready) &&
    r.ready.length === 2 &&
    r.ready.every((v) => typeof v === "boolean") &&
    Array.isArray(r.log) &&
    r.log.length <= 10 &&
    r.log.every((s) => typeof s === "string" && s.length < 250) &&
    [null, "you", "friend"].includes(r.winner) &&
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
      c.send({ protocol: PROTOCOL, kind: "error", message: "この部屋は満員です。" });
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
        c.send({ protocol: PROTOCOL, kind: "error", requestId: m.requestId, message: e.message });
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
        failPending("接続に時間がかかっています。Wi-Fiに切り替えるか、部屋を作り直してください。");
        c.close();
      }, 25e3),
    };
    c.on("open", () => {
      if (epoch === myEpoch) c.send({ protocol: PROTOCOL, kind: "hello", monster: m });
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
  if (!connection?.open) throw new Error("友達との接続が切れています。");
  if (host) {
    if (!hostRoom) throw new Error("対戦を開始してください。");
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
    return { player: copy(player), message: notice };
  }
  const b = JSON.parse(options.body);
  if (b.action === "create") return createRoom();
  if (b.action === "join") return joinRoom(String(b.room).trim());
  if (b.action === "move") return chooseMove(b);
  let message = "";
  if (b.action === "redeem") {
    const c = await inspectClaim(b.token);
    if (player.used.includes(c.id)) throw new Error("このQRコードは受け取り済みです。");
    if (c.kind === "monster") {
      if (player.monsters.some((m2) => m2.species === c.species))
        throw new Error("このモンスターはすでに仲間です。");
      const m = newMonster(c.species);
      player.monsters.push(m);
      player.selected ??= m.id;
      message = c.label + " を仲間にしました！";
    } else {
      player.materials += c.amount;
      message = `強化クリスタルを${c.amount}個入手！`;
    }
    player.used.push(c.id);
  } else if (b.action === "select" || b.action === "upgrade") {
    const m = player.monsters.find((x) => x.id === b.monster);
    if (!m) throw new Error("モンスターを選んでください。");
    if (b.action === "select") player.selected = m.id;
    else {
      if (m.level >= 10) throw new Error("すでに最大レベルです。");
      if (player.materials < 1) throw new Error("強化クリスタルが足りません。");
      m.level++;
      player.materials--;
      message = "レベルアップ！ 全ステータス +2";
    }
  } else throw new Error("操作を確認してください。");
  save();
  return { player: copy(player), message: storageNotice || message };
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
