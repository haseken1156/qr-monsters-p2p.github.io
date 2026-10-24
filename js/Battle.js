import { battleMusic, resultMusic, effectSound } from "./Audio.js?v=result-bgm-20261024";
import { Fragment, jsx, jsxs } from "../vendor/libraries.js?v=result-bgm-20261024";
import { useState, useEffect, useRef } from "../vendor/libraries.js?v=result-bgm-20261024";
import {
  SPECIES,
  AILMENTS,
  battleSpeed,
  displayName,
  COLORS,
  stats,
  movesFor,
  requiresQte,
  randomInt,
  moveCoolingDown,
} from "./engine.js?v=result-bgm-20261024";
import { CastEffect, effectForAction } from "./Textures.js?v=result-bgm-20261024";
import { SPRITES } from "./assets.js?v=result-bgm-20261024";
import { createQtePattern, qtePosition, qteHit, attackQteResult } from "./Qte.js?v=result-bgm-20261024";
import { TypeBadge, MoveSummary } from "./Visual.js?v=result-bgm-20261024";
function QuickTimeRound({move, step, total, onComplete}) {
  const attack=move.kind==="attack";
  const [pattern]=useState(()=>createQtePattern(attack ? "attack" : "utility"));
  const start=useRef(null),done=useRef(false),callback=useRef(onComplete),button=useRef(null);
  const [position,setPosition]=useState(()=>qtePosition(0,pattern)),[result,setResult]=useState(null);
  callback.current=onComplete;
  const finishRef=useRef(null);
  finishRef.current=()=>{
    if(done.current || start.current===null)return;
    const elapsed=performance.now()-start.current;
    done.current=true;
    setPosition(qtePosition(elapsed,pattern));
    const outcome=attack ? attackQteResult(elapsed,pattern) : qteHit(elapsed,pattern);
    setResult(outcome);
    effectSound(outcome===true || outcome==="critical" || outcome==="normal" ? "qte-success" : "qte-fail");
  };
  useEffect(()=>{
    start.current=performance.now();
    let frame;
    function tick(){
      if(done.current)return;
      setPosition(qtePosition(performance.now()-start.current,pattern));
      frame=requestAnimationFrame(tick);
    }
    frame=requestAnimationFrame(tick);
    const timeout=setTimeout(()=>finishRef.current(),pattern.duration);
    function key(e){
      if(e.key==="Tab"){e.preventDefault();button.current?.focus();return;}
      if((e.key===" " || e.key==="Enter") && !e.repeat){
        e.preventDefault();finishRef.current();
      }
    }
    document.addEventListener("keydown",key);
    button.current?.focus();
    return ()=>{cancelAnimationFrame(frame);clearTimeout(timeout);document.removeEventListener("keydown",key);};
  },[]);
  useEffect(()=>{
    if(result===null)return;
    const timer=setTimeout(()=>callback.current(result),attack ? 600 : 400);
    return ()=>clearTimeout(timer);
  },[result,attack]);
  const good=result===true || result==="normal" || result==="critical";
  return jsxs("div",{className:"qte-round",children:[
    jsx("div",{className:"section-label",children:attack ? "ATTACK TIMING" : "SKILL CHAIN"}),
    jsx("h2",{id:"qte-title",children:move.name}),
    jsxs("div",{className:"qte-progress",children:Array.from({length:total},(_,i)=>
      jsx("span",{className:i<step ? "complete" : i===step ? "current" : "",children:i+1},i))}),
    jsx("p",{children:attack ? "中央で止めて、急所を狙え！" :
      pattern.mode==="ring" ? "縮む枠を、緑の枠に重ねよう！" :
      pattern.mode==="bounce" ? "往復するカーソルを緑で止めよう！" : "緩急のあるカーソルを緑で止めよう！"}),
    jsx("div",{className:"qte-motion-label",children:attack ? "中央：急所×1.5 ／ 緑：通常 ／ 外：ミス" :
      `${step+1} / ${total} 回目 · ${pattern.mode==="ring" ? "SHRINK" : pattern.mode==="bounce" ? "BOUNCE" : "SPEED SHIFT"}`}),
    pattern.mode==="ring" ?
      jsxs("div",{className:"qte-rings","aria-hidden":true,children:[
        jsx("i",{className:"qte-target-ring",style:{transform:`scale(${.3+(pattern.zone+pattern.width/2)/100})`,borderWidth:`${pattern.width/3}px`}}),
        jsx("i",{className:"qte-moving-ring",style:{transform:`scale(${.3+position/100})`}})
      ]}) :
      jsxs("div",{className:"qte-track"+(attack ? " attack-track" : ""),"aria-hidden":true,children:[
        jsx("div",{className:"qte-zone",style:{left:pattern.zone+"%",width:pattern.width+"%"}}),
        attack && jsx("div",{className:"qte-critical-zone",style:{left:"44%",width:"12%"}}),
        attack && jsx("div",{className:"qte-center-line"}),
        jsx("div",{className:"qte-cursor",style:{left:position+"%"}})
      ]}),
    jsx("button",{ref:button,type:"button",className:"primary qte-stop",disabled:result!==null,
      onClick:()=>finishRef.current(),children:attack ? "STRIKE! 止める" : "STOP! 止める"}),
    jsx("p",{className:"hint",children:attack ? "タップ / Space / Enter · 1回で判定" : "2〜3回、すべて成功で発動"}),
    jsx("p",{className:"qte-result "+(result===null ? "" : good ? "success" : "failure"),role:"status",children:
      result===null ? "タイミングを合わせよう！" : result==="critical" ? "CRITICAL! 急所 ×1.5" :
      result==="normal" ? "HIT! 通常攻撃" : result===true ? "SUCCESS!" : "MISS…"}),
  ]});
}
function QuickTimeEvent({move,onComplete}) {
  const [total]=useState(()=>move.kind==="attack" ? 1 : randomInt(2,3));
  const [step,setStep]=useState(0);
  const results=useRef([]),completed=useRef(false);
  function finish(result){
    if(completed.current)return;
    results.current.push(result);
    if(step+1<total){setStep(step+1);return;}
    completed.current=true;
    onComplete(move.kind==="attack" ? result : results.current.every(r=>r===true));
  }
  return jsx("div",{className:"modal-backdrop qte-backdrop",children:
    jsx("section",{className:"modal qte-modal",role:"dialog","aria-modal":true,"aria-labelledby":"qte-title",
      children:jsx(QuickTimeRound,{move,step,total,onComplete:finish},step)})
  });
}
function Battle({ room, busy, onChoose, onNewBattle }) {
  const [display, setDisplay] = useState(room.players),
    [playing, setPlaying] = useState(false),
    [active, setActive] = useState(null),
    [messages, setMessages] = useState(room.log),
    [qte, setQte] = useState(null);
  const logPanel = useRef(null);
  useEffect(() => {
    const panel = logPanel.current;
    if (panel) panel.scrollTop = panel.scrollHeight;
  }, [messages]);
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
      effectSound(event.kind, event.moveType);
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
    if (moveCoolingDown(me,move.id,room.turn)) return;
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
  useEffect(() => {
    battleMusic(!disconnected && (room.status === "battle" || playing || pending));
  }, [room.id, room.status, disconnected, playing, pending]);
  useEffect(() => {
    resultMusic(ended ? room.winner : null);
  }, [room.id, ended, room.winner]);
  useEffect(() => () => {battleMusic(false);resultMusic(null);}, [room.id]);
  const status =
    playing || pending
      ? "先攻 → 後攻の順に表示中"
      : ready
        ? "選択済み・友達を待っています"
        : "技を1つ選ぶ";
  return /* @__PURE__ */ jsxs("section", {
    className: "battle-screen",
    "aria-label": "バトル",
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
              target = active?.target === index,
              casting =
                active?.actor === index ? effectForAction(active) : null;
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
                  "fighter " + (p.isYou ? "yours" : "enemy") + " " + effect +
                  (ended ? ((room.winner==="you")===p.isYou && room.winner!=="draw" ? " fighter-winner" : " fighter-defeated") : "") +
                  (active?.critical && target ? " critical-hit" : ""),
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
                      children: [
                        casting &&
                          jsx(
                            CastEffect,
                            { effect: casting },
                            `${pb?.turn}-${active.step}-${casting}`,
                          ),
                        /* @__PURE__ */ jsx("img", {
                          src: SPRITES[p.species],
                          alt: displayName(p),
                          width: "280",
                          height: "280",
                        }),
                      ],
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
        ref: logPanel,
        tabIndex: 0,
        role: "log",
        "aria-label": "戦闘ログ（上下にスクロールして履歴を確認）",
        "aria-live": "polite",
        children: messages.map((s, i) =>
          /* @__PURE__ */ jsx("p", { children: s }, i),
        ),
      }),
      ended
        ? /* @__PURE__ */ jsxs("div", {
            className: "result result-" + (room.winner === "you" ? "win" : room.winner === "draw" ? "draw" : "lose"),
            role: "status",
            children: [
              jsx("div", {className:"result-emblem","aria-hidden":true,children:room.winner==="you" ? "★" : room.winner==="draw" ? "◆" : "↗"}),
              jsx("div", {className:"result-particles","aria-hidden":true,children:Array.from({length:16},(_,i)=>
                jsx("i",{style:{"--i":i,"--x":(6+i*37%88)+"%","--fall":(i%5)*.09+"s"}},i))}),
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
              room.mode === "cpu" && room.reward &&
                jsx("p", {className: "crystal-drop" + (room.reward.crystals ? " found" : ""), children:
                  room.reward.crystals ? "◆ DROP! 強化クリスタル ×1" :
                    room.winner === "you" ? "クリスタルのドロップなし（勝利時20%）" : "クリスタルはCPU勝利時にドロップ抽選"}),
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
                        disabled: blocked || moveCoolingDown(me,move.id,room.turn),
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
                              moveCoolingDown(me,move.id,room.turn) ? " · あと1ターン" :
                                move.kind==="attack" ? " · 攻撃QTE ×1" : requiresQte(move) ? " · QTE ×2〜3" : "",
                            ],
                          }),
                          /* @__PURE__ */ jsx("b", { children: move.name }),
                          jsx(MoveSummary, { move }),
                        ],
                      },
                      i,
                    ),
                  ),
              }),
              /* @__PURE__ */ jsx("p", {
                className: "hint center",
                children:
                  "攻撃はQTE1回。状態異常・回復は2〜3回すべて成功で発動。使用した技は次の1ターンお休み。",
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
