import { MoveSummary } from "./Visual.js";
import { jsx, jsxs } from "../vendor/libraries.js";
import { useEffect, useState } from "../vendor/libraries.js";
import {
  availableMoves,
  selectedMoveIds,
  normalizeNickname,
} from "./engine.js";
function SavePanel({ state, busy, onSave }) {
  const time = state.savedAt
    ? new Date(state.savedAt).toLocaleString("ja-JP")
    : null;
  return /* @__PURE__ */ jsxs("section", {
    className: "save-panel" + (state.error ? " save-error" : ""),
    "aria-label": "セーブ状況",
    children: [
      /* @__PURE__ */ jsxs("div", {
        children: [
          /* @__PURE__ */ jsx("b", {
            children: state.error
              ? "保存を確認してください"
              : time
                ? "保存済み"
                : "オートセーブ",
          }),
          /* @__PURE__ */ jsx("p", {
            role: "status",
            children:
              state.error ||
              (time
                ? `最終保存：${time}`
                : "入手・強化・CPU戦終了・相棒や技の変更時に自動保存します。"),
          }),
        ],
      }),
      /* @__PURE__ */ jsx("button", {
        className: "save-button",
        disabled: busy,
        onClick: onSave,
        children: "今すぐセーブ",
      }),
      /* @__PURE__ */ jsx("small", {
        children:
          "同じ端末・同じブラウザで、このURLを開くと続きから再開できます。",
      }),
    ],
  });
}
function MoveEditor({ monster, busy, locked, onSave }) {
  const [draft, setDraft] = useState(() => selectedMoveIds(monster));
  const saved = selectedMoveIds(monster),
    key = saved.join("|");
  useEffect(() => setDraft(selectedMoveIds(monster)), [monster.id, key]);
  const options = availableMoves(monster),
    changed = draft.join("|") !== key;
  function toggle(id) {
    setDraft((previous) =>
      previous.includes(id)
        ? previous.filter((x) => x !== id)
        : previous.length < 4
          ? [...previous, id]
          : previous,
    );
  }
  return /* @__PURE__ */ jsxs("section", {
    className: "move-editor",
    "aria-label": "技の編成",
    children: [
      /* @__PURE__ */ jsxs("div", {
        className: "section-label",
        children: [
          "MOVE SET ",
          /* @__PURE__ */ jsxs("span", {
            children: [draft.length, " / 4 選択中"],
          }),
        ],
      }),
      /* @__PURE__ */ jsx("h2", { children: "バトルで使う技を選ぼう" }),
      /* @__PURE__ */ jsx("p", {
        className: "hint",
        children:
          "候補9種類から異なる4つを選んで保存。選んだ順に4つのボタンへ並びます。入れ替えるときは、先に1つ外してね。",
      }),
      locked &&
        /* @__PURE__ */ jsx("p", {
          className: "warning",
          children: "技を変更するには対戦部屋を離れてください。",
        }),
      /* @__PURE__ */ jsx("div", {
        className: "move-slots",
        "aria-label": "選んだ技",
        children: [0, 1, 2, 3].map((i) =>
          /* @__PURE__ */ jsxs(
            "div",
            {
              children: [
                /* @__PURE__ */ jsxs("span", { children: ["0", i + 1] }),
                /* @__PURE__ */ jsx("b", {
                  children:
                    options.find((m) => m.id === draft[i])?.name || "未選択",
                }),
              ],
            },
            i,
          ),
        ),
      }),
      /* @__PURE__ */ jsx("div", {
        className: "move-options",
        children: options.map((move) => {
          const checked = draft.includes(move.id);
          return /* @__PURE__ */ jsxs(
            "label",
            {
              className: checked ? "picked" : "",
              children: [
                /* @__PURE__ */ jsx("input", {
                  type: "checkbox",
                  checked,
                  disabled: busy || locked || (!checked && draft.length === 4),
                  onChange: () => toggle(move.id),
                }),
                /* @__PURE__ */ jsxs("span", {
                  children: [
                    /* @__PURE__ */ jsx("b", { children: move.name }),
                    /* @__PURE__ */ jsx(MoveSummary, { move }),
                  ],
                }),
              ],
            },
            move.id,
          );
        }),
      }),
      /* @__PURE__ */ jsx("button", {
        className: "primary save-moves",
        disabled: busy || locked || draft.length !== 4 || !changed,
        onClick: () => onSave([...draft]),
        children: !changed ? "この4つを装備中" : "この4つの技を保存",
      }),
      /* @__PURE__ */ jsx("p", {
        className: "hint center",
        children:
          draft.length !== 4
            ? "4つ選ぶと保存できます。"
            : changed
              ? "まだ保存していません。上のボタンで確定してください。"
              : "保存した技は、次の対戦と再起動後にも引き継がれます。",
      }),
    ],
  });
}
function NicknameEditor({ monster, busy, locked, onSave }) {
  const [draft, setDraft] = useState(monster.nickname || "");
  useEffect(
    () => setDraft(monster.nickname || ""),
    [monster.id, monster.nickname],
  );
  let clean = "",
    error = "";
  try {
    clean = normalizeNickname(draft);
  } catch (e) {
    error = e.message;
  }
  return jsxs("section", {
    className: "nickname-editor",
    children: [
      jsx("label", { htmlFor: "nickname", children: "相棒の名前" }),
      jsx("input", {
        id: "nickname",
        type: "text",
        value: draft,
        disabled: busy || locked,
        placeholder: "好きな名前を入力",
        onChange: (e) => setDraft(e.target.value),
      }),
      jsx("small", {
        children:
          error ||
          `${Array.from(draft).length} / 12文字・空欄で元の名前に戻ります。`,
      }),
      jsx("button", {
        className: "primary",
        disabled:
          busy || locked || !!error || clean === (monster.nickname || ""),
        onClick: () => onSave(clean),
        children: "名前を保存",
      }),
      locked &&
        jsx("small", {
          children: "名前を変更するには対戦部屋を離れてください。",
        }),
    ],
  });
}
export { MoveEditor, SavePanel, NicknameEditor };
