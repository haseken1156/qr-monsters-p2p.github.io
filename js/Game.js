"use client";
import { Fragment, jsx, jsxs } from "../vendor/libraries.js";
import { useState, useEffect, useRef } from "../vendor/libraries.js";
import {
  ScanLine,
  Swords,
  Diamond,
  Flame,
  Wifi,
  BookOpen,
  Plus,
  X,
  Camera,
  Upload,
  Check,
} from "../vendor/libraries.js";
import { jsQR } from "../vendor/libraries.js";
import {
  SPECIES,
  TYPES,
  COLORS,
  STRONG,
  stats,
  movesFor,
  displayName,
  xpForLevel,
} from "./engine.js";
import { inspectClaim } from "./claims.js";
import { gameFetch, leaveRoom } from "./network.js";
import { SPRITES } from "./assets.js";
import { buildEntryQr } from "./qr.js";
import { TypeBadge, Journey, TypeChart, Acquired } from "./Visual.js";
import { Battle } from "./Battle.js";
import { SavePanel, MoveEditor, NicknameEditor } from "./Progress.js";
const empty = {
  userLevel: 1,
  dex: 0,
  monsters: [],
  materials: 0,
  used: [],
  selected: null,
};
function Art({ species, small = false }) {
  return /* @__PURE__ */ jsx("div", {
    className: "monster-art " + (small ? "small" : ""),
    children: /* @__PURE__ */ jsx("img", {
      src: SPRITES[species],
      alt: SPECIES[species].name,
      width: 280,
      height: 280,
    }),
  });
}
function Game() {
  const [saveState, setSaveState] = useState({ savedAt: null, error: null });
  const [claimCard, setClaimCard] = useState(null);
  const [acquired, setAcquired] = useState(null);
  const [entryQr, setEntryQr] = useState("");
  useEffect(() => {
    buildEntryQr()
      .then(setEntryQr)
      .catch(() => {});
  }, []);
  // パソコン・スマホ・タブレットすべてで、同じゲーム画面を表示します。
  const [player, setPlayer] = useState(empty),
    [tab, setTab] = useState("home"),
    [busy, setBusy] = useState(false),
    [loaded, setLoaded] = useState(false),
    [notice, setNotice] = useState(""),
    [room, setRoom] = useState(null),
    [roomCode, setRoomCode] = useState(""),
    [claim, setClaim] = useState(""),
    [scan, setScan] = useState(false),
    [cameraError, setCameraError] = useState("");
  const video = useRef(null),
    canvas = useRef(null),
    upload = useRef(null),
    stream = useRef(null);
  const selected =
    player.monsters.find((m) => m.id === player.selected) || player.monsters[0];
  async function api(body) {
    const r = await gameFetch("/api/game", {
      method: body ? "POST" : "GET",
      headers: body ? { "Content-Type": "application/json" } : void 0,
      body: body ? JSON.stringify(body) : void 0,
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || "接続できませんでした。");
    if (d.player) setPlayer(d.player);
    if (d.saveState) setSaveState(d.saveState);
    if (d.message) setNotice(d.message);
    if (d.room) setRoom(d.room);
    return d;
  }
  async function act(body) {
    if (busy) return;
    setBusy(true);
    try {
      const d = await api(body);
      if (d.message) setNotice(d.message);
      if (body.action === "redeem") {
        if (claimCard?.kind === "monster") {
          const m = d.player?.monsters.find(
            (m) => m.species === claimCard.species,
          );
          if (m) setAcquired(m);
        }
        setClaimCard(null);
        setClaim("");
        setTab("home");
        history.replaceState(null, "", location.pathname);
      }
      if (d.room) {
        setTab("battle");
        sessionStorage.setItem("qm_room", d.room.id);
      }
      return d;
    } catch (e) {
      setNotice(e.message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    sessionStorage.removeItem("qm_room");
    api()
      .then(() => setLoaded(true))
      .catch((e) => setNotice(e.message));
    const initial =
      new URLSearchParams(location.hash.slice(1)).get("claim") ||
      new URLSearchParams(location.search).get("claim");
    if (initial) parseCode(initial);
    const saved = sessionStorage.getItem("qm_room");
    if (saved)
      gameFetch("/api/game?room=" + saved)
        .then((r) => r.json())
        .then((d) => {
          if (d.room) {
            setRoom(d.room);
            setRoomCode(saved);
          }
        });
  }, []);
  useEffect(() => {
    if (!room || room.status === "ended" || room.status === "disconnected")
      return;
    const timer = setInterval(() => {
      gameFetch("/api/game?room=" + room.id)
        .then((r) => r.json())
        .then((d) => {
          if (d.room) setRoom(d.room);
          else if (d.error) setNotice(d.error);
        })
        .catch(() => setNotice("接続が途切れました。再接続を待っています。"));
    }, 1800);
    return () => clearInterval(timer);
  }, [room?.id, room?.status]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 7e3);
    return () => clearTimeout(t);
  }, [notice]);
  async function parseCode(value) {
    stopCamera();
    setScan(false);
    try {
      const c = await inspectClaim(value);
      setClaimCard(c);
      setClaim(c.token);
    } catch (e) {
      setClaimCard(null);
      setClaim("");
      history.replaceState(null, "", location.pathname);
      setNotice(e.message);
    }
  }
  function stopCamera() {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }
  useEffect(() => {
    if (!scan) return;
    let alive = true,
      frame = 0;
    setCameraError("");
    (async () => {
      try {
        let tick = function () {
          if (!alive) return;
          const v = video.current,
            c = canvas.current;
          if (v && c && v.readyState >= 2) {
            c.width = v.videoWidth;
            c.height = v.videoHeight;
            const ctx = c.getContext("2d", { willReadFrequently: true });
            ctx?.drawImage(v, 0, 0);
            if (ctx) {
              const result = jsQR(
                ctx.getImageData(0, 0, c.width, c.height).data,
                c.width,
                c.height,
                { inversionAttempts: "dontInvert" },
              );
              if (result) {
                parseCode(result.data);
                return;
              }
            }
          }
          frame = requestAnimationFrame(tick);
        };
        if (!navigator.mediaDevices?.getUserMedia)
          throw new Error("カメラを利用できません。QR画像を選んでください。");
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (!alive) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream.current = s;
        if (video.current) {
          video.current.srcObject = s;
          await video.current.play();
        }
        tick();
      } catch (e) {
        setCameraError(
          "カメラを開けませんでした。カメラの許可を確認するか、QR画像を選んでください。",
        );
      }
    })();
    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      stopCamera();
    };
  }, [scan]);
  async function readImage(file) {
    const url = URL.createObjectURL(file);
    try {
      const im = new Image();
      im.src = url;
      await im.decode();
      const c = document.createElement("canvas");
      c.width = im.width;
      c.height = im.height;
      const ctx = c.getContext("2d");
      ctx.drawImage(im, 0, 0);
      const result = jsQR(
        ctx.getImageData(0, 0, c.width, c.height).data,
        c.width,
        c.height,
      );
      if (result) parseCode(result.data);
      else
        setNotice(
          "QRコードが見つかりませんでした。鮮明な画像を選んでください。",
        );
    } catch {
      setNotice("画像を読み込めませんでした。");
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const controller = new AbortController();
    try {
      Promise.resolve(
        context.registerTool(
          {
            name: "read_monster_collection",
            description: "現在のモンスターと強化素材を取得します。",
            inputSchema: {
              type: "object",
              properties: {},
              additionalProperties: false,
            },
            annotations: { readOnlyHint: true },
            execute: async (input) => {
              if (Object.keys(input || {}).length)
                throw new Error("入力は空のオブジェクトにしてください。");
              const r = await gameFetch("/api/game");
              const d = await r.json();
              if (!r.ok) throw new Error(d.error);
              setPlayer(d.player);
              return d.player;
            },
          },
          { signal: controller.signal },
        ),
      ).catch(() => {});
    } catch {}
    return () => controller.abort();
  }, []);
  const nav = [
    ["home", "相棒", Flame],
    ["scan", "QR入手", ScanLine],
    ["battle", "対戦", Swords],
    ["guide", "図鑑", BookOpen],
  ];
  return /* @__PURE__ */ jsxs(Fragment, {
    children: [
      /* @__PURE__ */ jsxs("div", {
        className: "app",
        children: [
          /* @__PURE__ */ jsxs("header", {
            children: [
              /* @__PURE__ */ jsxs("a", {
                className: "brand",
                href: location.pathname,
                children: [
                  "QR",
                  /* @__PURE__ */ jsx("span", { children: "MONSTERS" }),
                  /* @__PURE__ */ jsx("i", { children: "01" }),
                ],
              }),
              /* @__PURE__ */ jsxs("div", {
                className: "currency",
                children: [
                  /* @__PURE__ */ jsx("small", {
                    children: `ユーザー Lv.${player.userLevel}`,
                  }),
                  jsx(Diamond, { size: 17 }),
                  player.materials,
                  /* @__PURE__ */ jsx("span", { children: "個" }),
                ],
              }),
            ],
          }),
          /* @__PURE__ */ jsxs("main", {
            children: [
              notice &&
                /* @__PURE__ */ jsxs("div", {
                  role: "status",
                  className: "toast",
                  children: [
                    /* @__PURE__ */ jsx(Check, { size: 18 }),
                    notice,
                    /* @__PURE__ */ jsx("button", {
                      "aria-label": "閉じる",
                      onClick: () => setNotice(""),
                      children: /* @__PURE__ */ jsx(X, { size: 16 }),
                    }),
                  ],
                }),
              !loaded &&
                /* @__PURE__ */ jsxs("div", {
                  className: "loading",
                  children: [
                    /* @__PURE__ */ jsx("p", {
                      children: notice
                        ? "接続を確認してください。"
                        : "相棒を呼び出しています…",
                    }),
                    /* @__PURE__ */ jsx("button", {
                      onClick: () =>
                        api()
                          .then(() => setLoaded(true))
                          .catch((e) => setNotice(e.message)),
                      children: "再読み込み",
                    }),
                  ],
                }),
              loaded &&
                tab === "home" &&
                jsx(SavePanel, {
                  state: saveState,
                  busy,
                  onSave: () => act({ action: "save" }),
                }),
              tab === "home" && jsx(Journey, {}),
              tab === "home" &&
                /* @__PURE__ */ jsxs(Fragment, {
                  children: [
                    /* @__PURE__ */ jsxs("div", {
                      className: "section-label",
                      children: [
                        "MY PARTNER ",
                        /* @__PURE__ */ jsxs("span", {
                          children: [
                            player.monsters.length,
                            " / ",
                            SPECIES.length,
                            " MONSTERS",
                          ],
                        }),
                      ],
                    }),
                    selected
                      ? /* @__PURE__ */ jsxs(Fragment, {
                          children: [
                            /* @__PURE__ */ jsxs("div", {
                              className: "partner",
                              style: {
                                "--element":
                                  COLORS[SPECIES[selected.species].type],
                              },
                              children: [
                                /* @__PURE__ */ jsxs("div", {
                                  className: "partner-top",
                                  children: [
                                    jsx(TypeBadge, {
                                      type: SPECIES[selected.species].type,
                                    }),
                                    /* @__PURE__ */ jsxs("span", {
                                      className: "level",
                                      children: [
                                        "Lv. ",
                                        /* @__PURE__ */ jsx("b", {
                                          children: selected.level
                                            .toString()
                                            .padStart(2, "0"),
                                        }),
                                        /* @__PURE__ */ jsx("small", {
                                          children: " / 10",
                                        }),
                                      ],
                                    }),
                                  ],
                                }),
                                /* @__PURE__ */ jsx(Art, {
                                  species: selected.species,
                                }),
                                /* @__PURE__ */ jsxs("div", {
                                  className: "partner-title",
                                  children: [
                                    /* @__PURE__ */ jsxs("div", {
                                      children: [
                                        /* @__PURE__ */ jsx("h1", {
                                          children: displayName(selected),
                                        }),
                                        /* @__PURE__ */ jsx("p", {
                                          children:
                                            SPECIES[selected.species]
                                              .description,
                                        }),
                                      ],
                                    }),
                                    /* @__PURE__ */ jsxs("span", {
                                      className: "number",
                                      children: [
                                        "N° ",
                                        String(selected.species + 1).padStart(
                                          3,
                                          "0",
                                        ),
                                      ],
                                    }),
                                  ],
                                }),
                              ],
                            }),
                            /* @__PURE__ */ jsx("div", {
                              className: "stats",
                              children: [
                                ["HP", stats(selected).hp, 818],
                                ["攻撃", stats(selected).attack, 108],
                                ["素早さ", stats(selected).speed, 118],
                              ].map(([n, v, max]) =>
                                /* @__PURE__ */ jsxs(
                                  "div",
                                  {
                                    children: [
                                      /* @__PURE__ */ jsx("span", {
                                        children: n,
                                      }),
                                      /* @__PURE__ */ jsx("b", { children: v }),
                                      /* @__PURE__ */ jsx("div", {
                                        className: "stat-track",
                                        children: /* @__PURE__ */ jsx("i", {
                                          style: {
                                            width: `${(Number(v) / Number(max)) * 100}%`,
                                            background:
                                              COLORS[
                                                SPECIES[selected.species].type
                                              ],
                                          },
                                        }),
                                      }),
                                    ],
                                  },
                                  n,
                                ),
                              ),
                            }),
                            /* @__PURE__ */ jsxs("button", {
                              className: "primary upgrade",
                              disabled:
                                busy ||
                                selected.level === 10 ||
                                !player.materials ||
                                (!!room &&
                                  ["waiting", "battle"].includes(room.status)),
                              onClick: () =>
                                act({
                                  action: "upgrade",
                                  monster: selected.id,
                                }),
                              children: [
                                /* @__PURE__ */ jsx(Plus, { size: 20 }),
                                selected.level === 10
                                  ? "最大レベルに到達"
                                  : "強化する",
                                /* @__PURE__ */ jsxs("span", {
                                  children: [
                                    /* @__PURE__ */ jsx(Diamond, { size: 15 }),
                                    "1",
                                  ],
                                }),
                              ],
                            }),
                            /* @__PURE__ */ jsx("p", {
                              className: "hint center",
                              children:
                                "レベルアップで HP・攻撃・素早さ 各 +2（最大Lv.10）",
                            }),
                            jsxs("section", {
                              className: "xp-panel",
                              children: [
                                jsx("b", {
                                  children:
                                    selected.level === 10
                                      ? "最大レベル"
                                      : `EXP ${selected.xp || 0} / ${xpForLevel(selected.level)}`,
                                }),
                                selected.level < 10 &&
                                  jsx("progress", {
                                    value: selected.xp || 0,
                                    max: xpForLevel(selected.level),
                                    "aria-label": "次のレベルまでの経験値",
                                  }),
                                jsx("p", {
                                  children:
                                    "CPU戦で経験値を貯めるか、強化クリスタル1個で1レベルアップ。アイテム使用時も経験値は残ります。",
                                }),
                                jsx("button", {
                                  className: "primary",
                                  disabled:
                                    busy ||
                                    !loaded ||
                                    (!!room &&
                                      ["waiting", "battle"].includes(
                                        room.status,
                                      )),
                                  onClick: () => act({ action: "cpu" }),
                                  children: "CPUと戦って育てる",
                                }),
                              ],
                            }),
                            jsx(NicknameEditor, {
                              monster: selected,
                              busy,
                              locked:
                                !!room &&
                                ["waiting", "battle"].includes(room.status),
                              onSave: (nickname) =>
                                act({
                                  action: "rename",
                                  monster: selected.id,
                                  nickname,
                                }),
                            }),
                            jsx(MoveEditor, {
                              monster: selected,
                              busy,
                              locked:
                                !!room &&
                                ["waiting", "battle"].includes(room.status),
                              onSave: (moves) =>
                                act({
                                  action: "loadout",
                                  monster: selected.id,
                                  moves,
                                }),
                            }),
                            /* @__PURE__ */ jsxs("div", {
                              className: "section-label",
                              children: [
                                "COLLECTION ",
                                /* @__PURE__ */ jsx("span", {
                                  children: "バトルに出す相棒を選ぶ",
                                }),
                              ],
                            }),
                            /* @__PURE__ */ jsx("div", {
                              className: "collection",
                              children: player.monsters.map((m) =>
                                /* @__PURE__ */ jsxs(
                                  "button",
                                  {
                                    className:
                                      "mini " +
                                      (m.id === selected.id ? "active" : ""),
                                    onClick: () =>
                                      act({ action: "select", monster: m.id }),
                                    disabled:
                                      busy ||
                                      (!!room &&
                                        ["waiting", "battle"].includes(
                                          room.status,
                                        )),
                                    children: [
                                      /* @__PURE__ */ jsx(Art, {
                                        species: m.species,
                                        small: true,
                                      }),
                                      /* @__PURE__ */ jsx("b", {
                                        children: displayName(m),
                                      }),
                                      /* @__PURE__ */ jsxs("span", {
                                        style: {
                                          color:
                                            COLORS[SPECIES[m.species].type],
                                        },
                                        children: [
                                          "Lv.",
                                          m.level,
                                          " ・ ",
                                          TYPES[SPECIES[m.species].type],
                                        ],
                                      }),
                                    ],
                                  },
                                  m.id,
                                ),
                              ),
                            }),
                          ],
                        })
                      : /* @__PURE__ */ jsxs("div", {
                          className: "empty-partner",
                          children: [
                            /* @__PURE__ */ jsx(Art, { species: 0 }),
                            /* @__PURE__ */ jsx("div", {
                              className: "section-label",
                              children: "YOUR ADVENTURE STARTS HERE",
                            }),
                            /* @__PURE__ */ jsxs("h1", {
                              children: [
                                "最初の相棒を",
                                /* @__PURE__ */ jsx("br", {}),
                                "見つけよう。",
                              ],
                            }),
                            /* @__PURE__ */ jsxs("p", {
                              children: [
                                "モンスターのQRを読み取ると、",
                                /* @__PURE__ */ jsx("br", {}),
                                "あなたの相棒が仲間になる。",
                              ],
                            }),
                            /* @__PURE__ */ jsxs("button", {
                              className: "primary",
                              onClick: () => {
                                setTab("scan");
                                setScan(true);
                              },
                              children: [
                                /* @__PURE__ */ jsx(ScanLine, { size: 22 }),
                                "QRを読み取る",
                              ],
                            }),
                          ],
                        }),
                  ],
                }),
              tab === "scan" &&
                /* @__PURE__ */ jsxs(Fragment, {
                  children: [
                    /* @__PURE__ */ jsx("div", {
                      className: "section-label",
                      children: "SCAN & DISCOVER",
                    }),
                    /* @__PURE__ */ jsx("h1", { children: "QRから、仲間に。" }),
                    /* @__PURE__ */ jsxs("p", {
                      className: "intro",
                      children: [
                        "モンスターや強化クリスタルの",
                        /* @__PURE__ */ jsx("br", {}),
                        "QRコードを読み取ろう。",
                      ],
                    }),
                    /* @__PURE__ */ jsxs("div", {
                      className: "scan-box",
                      children: [
                        /* @__PURE__ */ jsx(ScanLine, { size: 84 }),
                        /* @__PURE__ */ jsx("span", {
                          children: "MONSTER / CRYSTAL",
                        }),
                      ],
                    }),
                    /* @__PURE__ */ jsxs("button", {
                      className: "primary",
                      onClick: () => setScan(true),
                      children: [
                        /* @__PURE__ */ jsx(Camera, { size: 20 }),
                        "カメラで読み取る",
                      ],
                    }),
                    /* @__PURE__ */ jsxs("button", {
                      className: "secondary",
                      onClick: () => upload.current?.click(),
                      children: [
                        /* @__PURE__ */ jsx(Upload, { size: 18 }),
                        "QR画像を選ぶ",
                      ],
                    }),
                    /* @__PURE__ */ jsx("p", {
                      className: "hint center",
                      children:
                        "同じQRは1プレイヤーにつき1回受け取れます。パソコンでカメラがない場合は「QR画像を選ぶ」を使ってください。",
                    }),
                    /* @__PURE__ */ jsx("p", {
                      className: "hint",
                      children:
                        "開発者から配られたQRを読み取ると入手できます。",
                    }),
                    entryQr &&
                      /* @__PURE__ */ jsxs("details", {
                        children: [
                          /* @__PURE__ */ jsx("summary", {
                            children: "友達にこのゲームのURLを教える",
                          }),
                          /* @__PURE__ */ jsx("img", {
                            src: entryQr,
                            alt: "サイトを開く入口QR",
                            width: "200",
                            height: "200",
                          }),
                          /* @__PURE__ */ jsx("p", {
                            className: "hint",
                            children:
                              "これは入口用QRです。モンスター・素材は入手できません。",
                          }),
                        ],
                      }),
                  ],
                }),
              tab === "battle" &&
                /* @__PURE__ */ jsxs(Fragment, {
                  children: [
                    /* @__PURE__ */ jsxs("div", {
                      className: "section-label",
                      children: [
                        "CPU & FRIEND BATTLE ",
                        /* @__PURE__ */ jsxs("span", {
                          children: [
                            /* @__PURE__ */ jsx(Wifi, { size: 14 }),
                            " P2P",
                          ],
                        }),
                      ],
                    }),
                    !room
                      ? /* @__PURE__ */ jsxs(Fragment, {
                          children: [
                            /* @__PURE__ */ jsx("h1", {
                              children: "相棒と、いざ対戦。",
                            }),
                            /* @__PURE__ */ jsxs("p", {
                              className: "intro",
                              children: [
                                "ひとりで育成するならCPU戦。",
                                /* @__PURE__ */ jsx("br", {}),
                                "友達とは合言葉で1対1のP2P対戦。",
                              ],
                            }),
                            selected
                              ? /* @__PURE__ */ jsxs("div", {
                                  className: "chosen",
                                  children: [
                                    /* @__PURE__ */ jsx(Art, {
                                      species: selected.species,
                                      small: true,
                                    }),
                                    /* @__PURE__ */ jsxs("div", {
                                      children: [
                                        /* @__PURE__ */ jsx("span", {
                                          children: "出場するモンスター",
                                        }),
                                        /* @__PURE__ */ jsx("h2", {
                                          children: displayName(selected),
                                        }),
                                        /* @__PURE__ */ jsxs("p", {
                                          children: [
                                            "Lv.",
                                            selected.level,
                                            " ・ ",
                                            TYPES[
                                              SPECIES[selected.species].type
                                            ],
                                          ],
                                        }),
                                      ],
                                    }),
                                  ],
                                })
                              : /* @__PURE__ */ jsx("p", {
                                  className: "warning",
                                  children:
                                    "先にQRからモンスターを入手してください。",
                                }),
                            jsxs("section", {
                              className: "cpu-intro",
                              children: [
                                jsx("h2", { children: "CPU育成バトル" }),
                                jsx("p", {
                                  children:
                                    "勝利20 EXP・敗北5 EXP・引き分け10 EXP。Lv.1では5勝でレベルアップ。途中で離れると経験値は入りません。",
                                }),
                                jsx("button", {
                                  className: "primary",
                                  disabled: busy || !selected,
                                  onClick: () => act({ action: "cpu" }),
                                  children: "CPUと対戦する",
                                }),
                              ],
                            }),
                            /* @__PURE__ */ jsxs("button", {
                              className: "primary",
                              disabled: busy || !selected,
                              onClick: () => act({ action: "create" }),
                              children: [
                                /* @__PURE__ */ jsx(Swords, { size: 20 }),
                                "対戦部屋を作る",
                              ],
                            }),
                            /* @__PURE__ */ jsx("div", {
                              className: "divider",
                            }),
                            /* @__PURE__ */ jsx("label", {
                              className: "field-label",
                              htmlFor: "room",
                              children: "友達の部屋に参加",
                            }),
                            /* @__PURE__ */ jsx("input", {
                              id: "room",
                              inputMode: "numeric",
                              pattern: "[0-9]*",
                              maxLength: 6,
                              value: roomCode,
                              onChange: (e) =>
                                setRoomCode(e.target.value.replace(/\D/g, "")),
                              placeholder: "6桁の合言葉",
                            }),
                            /* @__PURE__ */ jsx("button", {
                              className: "secondary",
                              disabled:
                                busy || roomCode.length !== 6 || !selected,
                              onClick: () =>
                                act({ action: "join", room: roomCode }),
                              children: "部屋に入る",
                            }),
                            /* @__PURE__ */ jsx("p", {
                              className: "hint",
                              children:
                                "対戦中は双方の画面を開いたままにしてください。回線によって接続できない場合は、Wi-Fiなど別の回線でお試しください。",
                            }),
                          ],
                        })
                      : /* @__PURE__ */ jsxs(Fragment, {
                          children: [
                            room.status === "disconnected" &&
                              /* @__PURE__ */ jsx("p", {
                                role: "alert",
                                className: "warning",
                                children:
                                  "友達との接続が切れました。部屋を離れ、新しい部屋を作って再接続してください。",
                              }),
                            /* @__PURE__ */ jsxs("div", {
                              className: "room-header",
                              children: [
                                /* @__PURE__ */ jsxs("span", {
                                  children: [
                                    room.mode === "cpu"
                                      ? "対戦相手 "
                                      : "合言葉 ",
                                    /* @__PURE__ */ jsx("b", {
                                      children:
                                        room.mode === "cpu" ? "CPU" : room.id,
                                    }),
                                  ],
                                }),
                                /* @__PURE__ */ jsxs("span", {
                                  children: [
                                    room.mode === "cpu"
                                      ? "CPU TRAINING"
                                      : "P2P BATTLE",
                                  ],
                                }),
                              ],
                            }),
                            room.status === "waiting"
                              ? /* @__PURE__ */ jsxs("div", {
                                  className: "waiting",
                                  children: [
                                    /* @__PURE__ */ jsx(Art, {
                                      species: room.players[0].species,
                                    }),
                                    /* @__PURE__ */ jsx("h2", {
                                      children: "友達の参加を待っています",
                                    }),
                                    /* @__PURE__ */ jsxs("p", {
                                      children: [
                                        "友達に合言葉 ",
                                        /* @__PURE__ */ jsx("b", {
                                          children: room.id,
                                        }),
                                        " を伝えてね。",
                                      ],
                                    }),
                                    /* @__PURE__ */ jsx("button", {
                                      className: "secondary",
                                      onClick: () =>
                                        navigator.clipboard
                                          ?.writeText(room.id)
                                          .then(() =>
                                            setNotice("合言葉をコピーしました"),
                                          )
                                          .catch(() =>
                                            setNotice("合言葉は " + room.id),
                                          ),
                                      children: "合言葉をコピー",
                                    }),
                                  ],
                                })
                              : jsx(
                                  Battle,
                                  {
                                    room,
                                    busy,
                                    onChoose: (move, qte, turn) =>
                                      act({
                                        action: "move",
                                        room: room.id,
                                        turn,
                                        move,
                                        qte,
                                      }),
                                    onNewBattle: () => {
                                      leaveRoom();
                                      setRoom(null);
                                      sessionStorage.removeItem("qm_room");
                                    },
                                  },
                                  room.id,
                                ),
                            /* @__PURE__ */ jsx("button", {
                              className: "text-button",
                              onClick: () => {
                                leaveRoom();
                                setRoom(null);
                                sessionStorage.removeItem("qm_room");
                              },
                              children:
                                room.mode === "cpu"
                                  ? "CPU戦を終了する（途中の経験値なし）"
                                  : "部屋を離れる",
                            }),
                            /* @__PURE__ */ jsx("p", {
                              className: "hint center",
                              children:
                                room.mode === "cpu"
                                  ? "戦闘後にHPと状態異常はリセット。CPUのキャラは入手・図鑑登録されません。"
                                  : "切断後は新しい部屋を作って再接続してください。",
                            }),
                          ],
                        }),
                  ],
                }),
              tab === "guide" &&
                /* @__PURE__ */ jsxs(Fragment, {
                  children: [
                    /* @__PURE__ */ jsx("div", {
                      className: "section-label",
                      children: `MONSTER FIELD GUIDE　登録 ${Array.from({ length: 20 }, (_, i) => !!(player.dex & (1 << i))).filter(Boolean).length} / 20`,
                    }),
                    /* @__PURE__ */ jsxs("h1", {
                      children: ["5つの力、", SPECIES.length, "体の相棒。"],
                    }),
                    /* @__PURE__ */ jsx("div", {
                      className: "guide-list",
                      children: SPECIES.map((s, i) => {
                        const owned = !!(player.dex & (1 << i));
                        return jsxs(
                          "div",
                          {
                            className:
                              "guide-monster" + (owned ? "" : " unowned"),
                            children: owned
                              ? [
                                  jsx(Art, { species: i, small: true }),
                                  jsxs("div", {
                                    children: [
                                      jsxs("span", {
                                        style: { color: COLORS[s.type] },
                                        children: [TYPES[s.type], "タイプ"],
                                      }),
                                      jsx("h2", { children: s.name }),
                                      jsx("p", { children: s.description }),
                                    ],
                                  }),
                                ]
                              : jsx("h2", { children: s.name }),
                          },
                          i,
                        );
                      }),
                    }),
                    /* @__PURE__ */ jsx("h2", { children: "タイプ相性" }),
                    /* @__PURE__ */ jsxs("p", {
                      className: "hint",
                      children: [
                        "得意な相手への属性技は1.5倍。逆は0.75倍。",
                        /* @__PURE__ */ jsx("br", {}),
                        "同タイプ・それ以外は1倍。",
                      ],
                    }),
                    jsx(TypeChart, {}),
                    /* @__PURE__ */ jsx("div", {
                      className: "table-wrap",
                      children: /* @__PURE__ */ jsxs("table", {
                        children: [
                          /* @__PURE__ */ jsx("thead", {
                            children: /* @__PURE__ */ jsxs("tr", {
                              children: [
                                /* @__PURE__ */ jsx("th", {
                                  children: "攻撃 ↓ / 相手 →",
                                }),
                                TYPES.map((t) =>
                                  /* @__PURE__ */ jsx("th", { children: t }, t),
                                ),
                              ],
                            }),
                          }),
                          /* @__PURE__ */ jsx("tbody", {
                            children: TYPES.map((t, a) =>
                              /* @__PURE__ */ jsxs(
                                "tr",
                                {
                                  children: [
                                    /* @__PURE__ */ jsx("th", {
                                      style: { color: COLORS[a] },
                                      children: t,
                                    }),
                                    TYPES.map((_, b) =>
                                      /* @__PURE__ */ jsx(
                                        "td",
                                        {
                                          className:
                                            STRONG[a] === b ? "strong" : "",
                                          children:
                                            STRONG[a] === b
                                              ? "1.5"
                                              : STRONG[b] === a
                                                ? "0.75"
                                                : "1",
                                        },
                                        b,
                                      ),
                                    ),
                                  ],
                                },
                                t,
                              ),
                            ),
                          }),
                        ],
                      }),
                    }),
                    /* @__PURE__ */ jsx("h2", {
                      children: "育成と対戦のルール",
                    }),
                    jsx(Journey, {}),
                    jsx("details", {
                      className: "rule-details",
                      children: jsxs(Fragment, {
                        children: [
                          jsx("summary", { children: "詳しいルールを開く" }),
                          jsxs("ul", {
                            className: "rules",
                            children: [
                              jsx("li", {
                                children:
                                  "炎「灯火」・雷「感電」は火傷、草「どくのきり」は毒。毒と火傷はターン終了時に最大HPの5%ダメージ。",
                              }),
                              jsx("li", {
                                children:
                                  "水「泡ブレス」・土「罠に掛ける」は素早さ半減。行動順はターン開始時の素早さで決まります。状態異常は1種類のみで新しいものに置き換わり、重複せず次の対戦では解除されます。状態異常技と癒しの光のみQTEが発生し、毎回変わる緑のゾーンで止めると成功。左右の進行方向と速度の緩急も変化します。",
                              }),
                              jsx("li", {
                                children:
                                  "癒しの光はQTE成功で状態異常を解除し、最大HPの12%を回復します。ガードはそのターンの被ダメージを半減します。",
                              }),

                              /* @__PURE__ */ jsx("li", {
                                children:
                                  "入手時はLv.1。HP 500〜800、攻撃70〜90、素早さ50〜100の範囲でランダム。CPU戦の勝利20・敗北5・引き分け10 EXP。必要経験値は100からレベルごとに20増加。強化アイテムでも育成できます。",
                              }),
                              /* @__PURE__ */ jsx("li", {
                                children:
                                  "素材1個でLv.+1。全ステータス+2。最大Lv.10。",
                              }),
                              /* @__PURE__ */ jsx("li", {
                                children:
                                  "双方が選び終えるとターン開始。先制技を優先し、それ以外は素早い方が先攻。同条件ならランダム。",
                              }),
                              /* @__PURE__ */ jsx("li", {
                                children:
                                  "HPが0になったら決着。対戦開始時のステータスを使い、対戦後はHPが回復。",
                              }),
                              /* @__PURE__ */ jsx("li", {
                                children:
                                  "モンスター・素材・選んだ相棒・装備した4つの技は自動保存され、同じ端末の同じブラウザで再開できます。育成データはこの端末のブラウザに保存されます。旧サイトのデータは自動移行されません。ブラウザのデータ削除や別端末・別URLでは別プレイヤーになります。",
                              }),
                              /* @__PURE__ */ jsx("li", {
                                children:
                                  "P2P対戦の接続仲介にはPeerJS Cloud、接続確認にはSTUNを使います。対戦データは端末間で直接通信します。",
                              }),
                            ],
                          }),
                        ],
                      }),
                    }),
                  ],
                }),
            ],
          }),
          /* @__PURE__ */ jsx("nav", {
            children: nav.map(([id, label, Icon]) =>
              /* @__PURE__ */ jsxs(
                "button",
                {
                  className: tab === id ? "selected" : "",
                  onClick: () => setTab(id),
                  children: [
                    /* @__PURE__ */ jsx(Icon, { size: 22 }),
                    /* @__PURE__ */ jsx("span", { children: label }),
                    tab === id && /* @__PURE__ */ jsx("i", {}),
                  ],
                },
                id,
              ),
            ),
          }),
          /* @__PURE__ */ jsx("input", {
            hidden: true,
            ref: upload,
            type: "file",
            accept: "image/*",
            onChange: (e) => {
              const f = e.target.files?.[0];
              if (f) readImage(f);
              e.target.value = "";
            },
          }),
          scan &&
            /* @__PURE__ */ jsx("div", {
              className: "modal-backdrop",
              children: /* @__PURE__ */ jsxs("div", {
                className: "modal",
                children: [
                  /* @__PURE__ */ jsx("button", {
                    className: "close",
                    "aria-label": "閉じる",
                    onClick: () => setScan(false),
                    children: /* @__PURE__ */ jsx(X, {}),
                  }),
                  /* @__PURE__ */ jsx("div", {
                    className: "section-label",
                    children: "SCAN QR",
                  }),
                  /* @__PURE__ */ jsx("h2", {
                    children: "QRを枠の中に合わせてね",
                  }),
                  /* @__PURE__ */ jsxs("div", {
                    className: "camera",
                    children: [
                      /* @__PURE__ */ jsx("video", {
                        ref: video,
                        playsInline: true,
                        muted: true,
                      }),
                      /* @__PURE__ */ jsx("div", { className: "viewfinder" }),
                    ],
                  }),
                  /* @__PURE__ */ jsx("canvas", { hidden: true, ref: canvas }),
                  cameraError &&
                    /* @__PURE__ */ jsx("p", {
                      className: "warning",
                      children: cameraError,
                    }),
                  /* @__PURE__ */ jsxs("button", {
                    className: "secondary",
                    onClick: () => upload.current?.click(),
                    children: [
                      /* @__PURE__ */ jsx(Upload, { size: 18 }),
                      "QR画像を選ぶ",
                    ],
                  }),
                ],
              }),
            }),
          acquired &&
            jsx(Acquired, {
              monster: acquired,
              onClose: () => setAcquired(null),
            }),
          claimCard &&
            /* @__PURE__ */ jsx("div", {
              className: "modal-backdrop",
              children: /* @__PURE__ */ jsxs("div", {
                className: "modal claim-modal",
                children: [
                  /* @__PURE__ */ jsx("button", {
                    className: "close",
                    "aria-label": "閉じる",
                    onClick: () => {
                      setClaimCard(null);
                      setClaim("");
                      history.replaceState(null, "", location.pathname);
                    },
                    children: /* @__PURE__ */ jsx(X, {}),
                  }),
                  /* @__PURE__ */ jsx("div", {
                    className: "section-label",
                    children: "DISCOVERED!",
                  }),
                  claimCard.kind === "monster"
                    ? /* @__PURE__ */ jsx(Art, { species: claimCard.species })
                    : /* @__PURE__ */ jsx(Diamond, {
                        className: "crystal-icon",
                        size: 90,
                      }),
                  claimCard.kind === "monster" &&
                    jsx(TypeBadge, {
                      type: SPECIES[claimCard.species].type,
                      large: true,
                    }),
                  /* @__PURE__ */ jsx("h1", { children: claimCard.label }),
                  /* @__PURE__ */ jsx("p", {
                    children:
                      claimCard.kind === "monster"
                        ? "Lv.1で仲間になる。どんな能力かは入手してからのお楽しみ！"
                        : `強化クリスタル${claimCard.amount}個を入手できます。`,
                  }),
                  /* @__PURE__ */ jsx("button", {
                    className: "primary",
                    disabled:
                      busy || !loaded || player.used.includes(claimCard.id),
                    onClick: () =>
                      act({ action: "redeem", token: claimCard.token }),
                    children: player.used.includes(claimCard.id)
                      ? "受け取り済み"
                      : "受け取る",
                  }),
                ],
              }),
            }),
        ],
      }),
    ],
  });
}
export { Game as default };
