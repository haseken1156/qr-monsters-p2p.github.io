import { jsx, jsxs, useRef, useEffect } from "../vendor/libraries.js?v=result-bgm-20261024";
import {
  AILMENTS,
  TYPES,
  COLORS,
  STRONG,
  SPECIES,
  stats,
  displayName,
} from "./engine.js?v=result-bgm-20261024";
import { SPRITES } from "./assets.js?v=result-bgm-20261024";
const PATHS = [
  "M12 2C13 8 6 8 6 14a6 6 0 0 0 12 0c0-3-2-5-3-6 0 3-2 4-2 4S15 6 12 2Z",
  "M12 2S5 10 5 15a7 7 0 0 0 14 0c0-5-7-13-7-13Z",
  "M20 3C9 2 3 7 5 14c2 7 13 5 15-11ZM5 21 17 7",
  "m13 2-9 12h7l-1 8 10-13h-8l1-7Z",
  "m3 18 5-13 8-2 5 12-6 6H5Zm5-13 4 9 9 1M3 18l9-4 3 7",
];
export function TypeBadge({ type, large = false }) {
  return jsxs("span", {
    className: "element-badge" + (large ? " large" : ""),
    style: { "--type-color": COLORS[type] },
    children: [
      jsx("svg", {
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 1.8,
        "aria-hidden": true,
        children: jsx("path", {
          d: PATHS[type],
          strokeLinejoin: "round",
          strokeLinecap: "round",
        }),
      }),
      jsx("b", { children: TYPES[type] }),
      large && jsx("small", { children: "タイプ" }),
    ],
  });
}
export function StatTiles({ monster }) {
  const s = stats(monster);
  return jsx("div", {
    className: "visual-stats",
    children: [
      ["♥", "HP", s.hp],
      ["⚔", "攻撃", s.attack],
      ["➤", "素早さ", s.speed],
    ].map(([icon, label, value]) =>
      jsxs(
        "div",
        {
          children: [
            jsx("span", { "aria-hidden": true, children: icon }),
            jsx("small", { children: label }),
            jsx("b", { children: value }),
          ],
        },
        label,
      ),
    ),
  });
}
export function Journey({ onNavigate }) {
  return jsx("div", {
    className: "journey",
    "aria-label": "遊び方",
    children: [
      ["▦", "集める", "QRを読み取る"],
      ["↑", "育てる", "CPU戦 / 素材"],
      ["⚔", "戦う", "4つの技を選ぶ"],
    ].map(([mark, title, caption], i) =>
      jsxs(
        "button",
        {
          type: "button",
          onClick: () => onNavigate?.(i),
          "aria-label": title,
          children: [
            jsx("i", { "aria-hidden": true, children: mark }),
            jsx("b", { children: title }),
            jsx("small", { children: caption }),
          ],
        },
        title,
      ),
    ),
  });
}
export function TypeChart() {
  return jsxs("div", {
    className: "type-chart",
    children: [
      jsx("p", { children: "矢印の相手に強い · 属性攻撃 ×1.5" }),
      jsx("div", {
        className: "type-cycle",
        children: [0, 2, 4, 3, 1].map((type) =>
          jsxs(
            "div",
            {
              children: [
                jsx(TypeBadge, { type }),
                jsx("span", { "aria-hidden": true, children: "→" }),
              ],
            },
            type,
          ),
        ),
      }),
    ],
  });
}
export function Acquired({ monster, onClose }) {
  const button = useRef(null),
    close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    button.current?.focus();
    const key = (e) => {
      if (e.key === "Escape") close.current();
      if (e.key === "Tab") {
        e.preventDefault();
        button.current?.focus();
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  const type = SPECIES[monster.species].type;
  return jsx("div", {
    className: "modal-backdrop acquired-backdrop",
    children: jsxs("section", {
      role: "dialog",
      "aria-modal": true,
      "aria-labelledby": "acquired-name",
      className: "modal acquired-card",
      style: { "--type-color": COLORS[type] },
      children: [
        jsx("span", { className: "discovery-title", children: "NEW PARTNER!" }),
        jsx("p", { children: "新しい仲間を獲得！" }),
        jsx("div", {
          className: "acquired-art",
          children: jsx("img", {
            src: SPRITES[monster.species],
            alt: displayName(monster),
            width: 280,
            height: 280,
          }),
        }),
        jsx("h1", { id: "acquired-name", children: displayName(monster) }),
        jsx(TypeBadge, { type, large: true }),
        jsxs("div", {
          className: "type-advantage",
          children: ["得意な相手", jsx(TypeBadge, { type: STRONG[type] })],
        }),
        jsx(StatTiles, { monster }),
        jsx("button", {
          ref: button,
          className: "primary",
          onClick: onClose,
          children: "相棒を見にいく",
        }),
      ],
    }),
  });
}

export function MoveSummary({ move }) {
  return jsxs("small", {
    className: "move-summary",
    children: [
      move.kind === "attack"
        ? `${move.priority > 0 ? "先制 · " : ""}⚔ ×${move.power} · QTE · 急所×1.5`
        : move.kind === "guard"
          ? "◆ ダメージ半減"
          : move.kind === "heal"
            ? "♥ 12% ＋ 状態回復"
            : `◉ ${AILMENTS[move.ailment]}`,
      move.drain &&
        jsx("span", {
          className: "move-extra",
          children: `♥ 与えたダメージの${Math.round(move.drain * 100)}%回復`,
        }),
      move.offType &&
        jsx("span", {
          className: "move-extra",
          children: "他タイプ技 · 威力控えめ",
        }),
      jsx("span", {className:"move-extra", children:"使用後1ターン休み"}),
      move.type >= 0 && jsx(TypeBadge, { type: move.type }),
      jsx("span", { className: "sr-only", children: move.description }),
    ],
  });
}
