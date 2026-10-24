/* 起動処理。index.htmlのrootにゲーム画面を表示します。 */
import { jsx } from "../vendor/libraries.js?v=result-bgm-20261024";
import { createRoot } from "../vendor/libraries.js?v=result-bgm-20261024";
import Game from "./Game.js?v=result-bgm-20261024";
createRoot(document.getElementById("root")).render(/* @__PURE__ */ jsx(Game, {}));
