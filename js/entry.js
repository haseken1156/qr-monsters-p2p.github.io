/* 起動処理。index.htmlのrootにゲーム画面を表示します。 */
import { jsx } from "../vendor/libraries.js";
import { createRoot } from "../vendor/libraries.js";
import Game from "./Game.js";
createRoot(document.getElementById("root")).render(/* @__PURE__ */ jsx(Game, {}));
