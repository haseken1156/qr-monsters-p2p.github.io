import { Fragment, jsx, jsxs } from "../vendor/libraries.js";
import { useState, useEffect, useRef } from "../vendor/libraries.js";
import {
  SPECIES,
  AILMENTS,
  battleSpeed,
  displayName,
  COLORS,
  stats,
  movesFor,
  requiresQte,
} from "./engine.js";
import { SPRITES } from "./assets.js";
import { createQtePattern, qtePosition, qteHit } from "./Qte.js";
import { TypeBadge } from "./Visual.js";
function QuickTimeEvent({ move, onComplete }) {
  const [pattern] = useState(createQtePattern);
  const start = useRef(null),
    done = useRef(false),
    callback = useRef(onComplete),
    button = useRef(null);
  const [position, setPosition] = useState(() => (pattern.reverse ? 100 : 0)),
    [result, setResult] = useState(null);
  callback.current = onComplete;
  const finishRef = useRef(null);
  finishRef.current = (success) => {
    if (done.current) return;
    done.current = true;
    setPosition(qtePosition(performance.now() - start.current, pattern));
    setResult(success);
  };
  useEffect(() => {
    start.current = performance.now();
    let frame;
    function tick() {
      if (done.current) return;
      const elapsed = performance.now() - start.current;
      setPosition(qtePosition(elapsed, pattern));
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    const timeout = setTimeout(
      () => finishRef.current(false),
      pattern.duration,
    );
    function key(e) {
      if (e.key === "Tab") {
        e.preventDefault();
        button.current?.focus();
        return;
      }
      if ((e.key === " " || e.key === "Enter") && !e.repeat) {
        e.preventDefault();
        if (!done.current)
          finishRef.current(qteHit(performance.now() - start.current, pattern));
      }
    }
    document.addEventListener("keydown", key);
    button.current?.focus();
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timeout);
      document.removeEventListener("keydown", key);
    };
  }, []);
  useEffect(() => {
    if (result === null) return;
    const timer = setTimeout(() => callback.current(result), 650);
    return () => clearTimeout(timer);
  }, [result]);
  return /* @__PURE__ */ jsx("div", {
    className: "modal-backdrop qte-backdrop",
    children: /* @__PURE__ */ jsxs("section", {
      className: "modal qte-modal",
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": "qte-title",
      children: [
        /* @__PURE__ */ jsx("div", {
          className: "section-label",
          children: "QUICK TIME EVENT",
        }),
        /* @__PURE__ */ jsx("h2", { id: "qte-title", children: move.name }),
        /* @__PURE__ */ jsx("p", {
          children: "緑に重なったら、止める！",
        }),
        jsx("div", {
          className: "qte-motion-label",
          children: pattern.reverse
            ? "← SPEED SHIFT · 緩急あり"
            : "SPEED SHIFT · 緩急あり →",
        }),
        /* @__PURE__ */ jsxs("div", {
          className: "qte-track",
          "aria-hidden": "true",
          children: [
            /* @__PURE__ */ jsx("div", {
              className: "qte-zone",
              style: { left: `${pattern.zone}%`, width: `${pattern.width}%` },
            }),
            /* @__PURE__ */ jsx("div", {
              className: "qte-cursor",
              style: { left: `${position}%` },
            }),
          ],
        }),
        /* @__PURE__ */ jsx("button", {
          ref: button,
          className: "primary qte-stop",
          disabled: result !== null,
          onClick: () =>
            finishRef.current(
              qteHit(performance.now() - start.current, pattern),
            ),
          children: "STOP! 止める",
        }),
        /* @__PURE__ */ jsx("p", {
          className: "hint",
          children: `タップ / Space / Enter · ${(pattern.duration / 1000).toFixed(1)}秒`,
        }),
        /* @__PURE__ */ jsx("p", {
          className:
            "qte-result " +
            (result === true ? "success" : result === false ? "failure" : ""),
          role: "status",
          children:
            result === null
              ? "狙え、緑のゾーン！"
              : result
                ? "SUCCESS! 成功！"
                : "MISS… 効果なし",
        }),
      ],
    }),
  });
}
function Battle({ room, busy, onChoose, onNewBattle }) {
  const [display, setDisplay] = useState(room.players),
    [playing, setPlaying] = useState(false),
    [active, setActive] = useState(null),
    [messages, setMessages] = useState(room.log),
    [qte, setQte] = useState(null);
  const lastPlayed = useRef(0),
    playingRef = useRef(false);
  const pb = room.playback,
    disconnected = room.status === "disconnected";
  const pending = !!pb && pb.turn > lastPlayed.current;
  useEffect(() => {
    let cancelled = false,
      timer;
    function state(s) {
      return room.players.map((p, i) => ({
        ...p,
        currentHp: s.hp[i],
        ailment: s.ailments[i],
      }));
    }
    if (disconnected) {
      playingRef.current = false;
      setPlaying(false);
      setQte(null);
      setActive(null);
      setDisplay(room.players);
      setMessages(room.log);
      return;
    }
    if (!pb || pb.turn <= lastPlayed.current) {
      if (!playingRef.current) {
        setDisplay(room.players);
        setMessages(room.log);
      }
      return;
    }
    lastPlayed.current = pb.turn;
    playingRef.current = true;
    setPlaying(true);
    setDisplay(state(pb.before));
    setMessages([`ターン ${pb.turn}`]);
    const reduced =
      typeof matchMedia === "function" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches;
    let index = 0;
    function step() {
      if (cancelled) return;
      if (index >= pb.events.length) {
        playingRef.current = false;
        setPlaying(false);
        setActive(null);
        setDisplay(room.players);
        setMessages(room.log);
        return;
      }
      const event = pb.events[index];
      setActive({ ...event, step: index });
      setDisplay(state(event));
      setMessages((previous) => [...previous, event.text].slice(-5));
      index++;
      timer = setTimeout(
        step,
        reduced ? 180 : event.kind === "end" ? 600 : 850,
      );
    }
    timer = setTimeout(step, reduced ? 50 : 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      playingRef.current = false;
    };
  }, [room.id, pb?.turn, disconnected]);
  const me = room.players.find((p) => p.isYou),
    yourIndex = room.players.findIndex((p) => p.isYou),
    ready = room.ready[yourIndex];
  const blocked =
    busy || playing || pending || !!qte || room.status !== "battle" || ready;
  function choose(index) {
    if (blocked) return;
    const move = movesFor(me)[index];
    if (requiresQte(move)) setQte({ index, move, turn: room.turn });
    else onChoose(index, null, room.turn);
  }
  function completeQte(success) {
    const selected = qte;
    setQte(null);
    if (
      selected &&
      room.status === "battle" &&
      selected.turn === room.turn &&
      !ready
    )
      onChoose(selected.index, success, selected.turn);
  }
  const ended = room.status === "ended" && !playing && !pending;
  const status =
    playing || pending
      ? "先攻 → 後攻の順に表示中"
      : ready
        ? "選択済み・友達を待っています"
        : "技を1つ選ぶ";
  return /* @__PURE__ */ jsxs(Fragment, {
    children: [
      /* @__PURE__ */ jsxs("div", {
        className: "battle-turn",
        children: [
          "TURN ",
          (playing || pending) && pb ? pb.turn : room.turn,
          /* @__PURE__ */ jsx("span", { children: status }),
        ],
      }),
      /* @__PURE__ */ jsx("div", {
        className: "arena",
        children: [...display]
          .sort((a, b) => Number(a.isYou) - Number(b.isYou))
          .map((p) => {
            const index = room.players.findIndex((x) => x.isYou === p.isYou),
              target = active?.target === index;
            const effect = target
              ? active.kind === "attack" || active.kind === "statusTick"
                ? "battle-hit"
                : active.kind === "heal"
                  ? "battle-heal"
                  : active.kind === "status"
                    ? "battle-poison"
                    : active.kind === "guard"
                      ? "battle-guard"
                      : ""
              : "";
            return /* @__PURE__ */ jsxs(
              "div",
              {
                className:
                  "fighter " + (p.isYou ? "yours" : "enemy") + " " + effect,
                "data-fighter-index": index,
                "data-active-kind": target ? active.kind : "",
                children: [
                  /* @__PURE__ */ jsxs("div", {
                    className: "fighter-info",
                    children: [
                      /* @__PURE__ */ jsx("span", {
                        children: p.isYou
                          ? "YOUR PARTNER"
                          : room.mode === "cpu"
                            ? "CPU"
                            : "FRIEND",
                      }),
                      /* @__PURE__ */ jsxs("h2", {
                        children: [
                          displayName(p),
                          /* @__PURE__ */ jsxs("small", {
                            children: ["Lv.", p.level],
                          }),
                        ],
                      }),
                      jsx(TypeBadge, { type: SPECIES[p.species].type }),
                      p.ailment &&
                        /* @__PURE__ */ jsx("span", {
                          className: "poison-badge status-" + p.ailment,
                          "aria-label": AILMENTS[p.ailment] + "状態",
                          children: AILMENTS[p.ailment],
                        }),
                      /* @__PURE__ */ jsx("div", {
                        className: "health",
                        children: /* @__PURE__ */ jsx("i", {
                          style: {
                            width: `${(p.currentHp / stats(p).hp) * 100}%`,
                          },
                        }),
                      }),
                      /* @__PURE__ */ jsxs("p", {
                        children: [p.currentHp, " / ", stats(p).hp, " HP"],
                      }),
                    ],
                  }),
                  /* @__PURE__ */ jsx(
                    "div",
                    {
                      className: "monster-art",
                      children: /* @__PURE__ */ jsx("img", {
                        src: SPRITES[p.species],
                        alt: displayName(p),
                        width: "280",
                        height: "280",
                      }),
                    },
                    target ? `${pb?.turn}-${active.step}` : "idle",
                  ),
                ],
              },
              p.isYou ? "you" : "friend",
            );
          }),
      }),
      /* @__PURE__ */ jsx("div", {
        className: "battle-log",
        "aria-live": "polite",
        children: messages.map((s, i) =>
          /* @__PURE__ */ jsx("p", { children: s }, i),
        ),
      }),
      ended
        ? /* @__PURE__ */ jsxs("div", {
            className: "result",
            children: [
              /* @__PURE__ */ jsx("h1", {
                children:
                  room.winner === "draw"
                    ? "DRAW"
                    : room.winner === "you"
                      ? "VICTORY!"
                      : "DEFEAT",
              }),
              /* @__PURE__ */ jsx("p", {
                children:
                  room.winner === "draw"
                    ? "両者が倒れた！ 引き分け。"
                    : room.winner === "you"
                      ? "相棒とつかんだ勝利！"
                      : "相棒を鍛えて、もう一度。",
              }),
              room.mode === "cpu" &&
                room.reward &&
                jsx("p", {
                  className: "xp-reward",
                  role: "status",
                  children: room.reward.message,
                }),
              /* @__PURE__ */ jsx("button", {
                className: "primary",
                onClick: onNewBattle,
                children: "新しい対戦へ",
              }),
            ],
          })
        : /* @__PURE__ */ jsxs(Fragment, {
            children: [
              /* @__PURE__ */ jsxs("div", {
                className: "section-label",
                children: [
                  "CHOOSE YOUR MOVE ",
                  /* @__PURE__ */ jsx("span", { children: status }),
                ],
              }),
              /* @__PURE__ */ jsx("div", {
                className: "moves",
                children:
                  me &&
                  movesFor(me).map((move, i) =>
                    /* @__PURE__ */ jsxs(
                      "button",
                      {
                        disabled: blocked,
                        onClick: () => choose(i),
                        style: {
                          "--move":
                            move.type < 0 ? "#b3bdcf" : COLORS[move.type],
                        },
                        children: [
                          /* @__PURE__ */ jsxs("span", {
                            children: [
                              "0",
                              i + 1,
                              requiresQte(move) ? " · QTE" : "",
                            ],
                          }),
                          /* @__PURE__ */ jsx("b", { children: move.name }),
                          /* @__PURE__ */ jsxs("small", {
                            className: "move-summary",
                            children: [
                              move.kind === "attack"
                                ? `⚔ ×${move.power}`
                                : move.kind === "guard"
                                  ? "◆ ダメージ半減"
                                  : move.kind === "heal"
                                    ? "♥ 12% ＋ 状態回復"
                                    : `◉ ${AILMENTS[move.ailment]}`,
                              jsx("span", {
                                className: "sr-only",
                                children: move.description,
                              }),
                            ],
                          }),
                        ],
                      },
                      i,
                    ),
                  ),
              }),
              /* @__PURE__ */ jsx("p", {
                className: "hint center",
                children:
                  "状態異常技・癒しの光のみQTEが発生します。成功したときだけ効果が出ます。",
              }),
            ],
          }),
      qte &&
        !disconnected &&
        /* @__PURE__ */ jsx(
          QuickTimeEvent,
          { move: qte.move, onComplete: completeQte },
          `${room.id}-${qte.turn}-${qte.index}`,
        ),
    ],
  });
}
export { Battle, QuickTimeEvent, qteHit };
