// 퓨어데이 장기 — 화면·입력·연출. 규칙은 janggi.js, 컴퓨터 수는 worker.js(ai.js)
import { Janggi, R_, F_, MAX_PLIES, score } from "./janggi.js";

const $ = (id) => document.getElementById(id);
const SAVE_KEY = "pureday-janggi-v1";

// 말 그림: assets/pieces/<W|B>_<종류><번호>.png (칸마다 다른 캐릭터), 없으면 <W|B>_<종류>.png, 그것도 없으면 전통 장기알
const HANJA = { w: { K: "楚", A: "士", R: "車", C: "包", H: "馬", E: "象", P: "卒" }, b: { K: "漢", A: "士", R: "車", C: "包", H: "馬", E: "象", P: "兵" } };
// v3 (2026-10-20 대표님 확정): 초 = 퓨어데이 주인공들, 한 = 드래곤 군단 + 늑대개 군단(에베레스트 사가)
const NAME = {
  wK: "조성민 박사", wA1: "이마리", wA2: "김미아", wR1: "조아름", wR2: "조하임", wC1: "리웨이", wC2: "하루카 사토",
  wH1: "디에고 라미레스", wH2: "콰메 아산테", wE1: "라일라 알하르비", wE2: "노아 벤아미",
  wP1: "캐털린 리드", wP2: "아마라 오코예", wP3: "루시아 가르시아", wP4: "요나스 베커", wP5: "마이클 하트",
  bK: "큰 용", bA: "도마뱀 근위병", bR: "용암 병거 짐승", bC: "교만의 용장", bH: "아포피스", bE: "비룡대",
  bP1: "늑대개 우두머리", bP2: "늑대개 회색 대장", bP3: "늑대개 갈색 추격자", bP4: "늑대개 모래색 막내", bP5: "늑대개 숯빛 얼룩이",
};
const KIND = { K: "궁", A: "사", R: "차", C: "포", H: "마", E: "상", P: "졸·병" };
const SIDE = { w: "빛 진영(초)", b: "드래곤 군단(한)" };
const RULES = [
  ["K", "궁", "궁성 안에서 선을 따라 한 칸. 잡히면 끝!"],
  ["A", "사", "궁 곁을 지키는 호위. 궁처럼 궁성 안에서 한 칸"],
  ["R", "차", "가로·세로로 막힐 때까지 쭉 (가장 강한 말)"],
  ["C", "포", "말 하나를 꼭 넘어서 가요. 포끼리는 넘지도 잡지도 못해요"],
  ["H", "마", "한 칸 곧게 + 한 칸 비스듬히. 첫 칸이 막히면 못 가요"],
  ["E", "상", "한 칸 곧게 + 두 칸 비스듬히. 가는 길이 막히면 못 가요"],
  ["P", "졸·병", "앞이나 옆으로 한 칸 (뒤로는 못 가요)"],
];
const imgOk = {};
// 미리 확인할 그림: 칸별 코드(번호 포함) + 종류별 공용 코드
const CODES = [...new Set([...Object.keys(NAME), ..."KARCHEP".split("").flatMap((t) => ["w" + t, "b" + t])])];

const fileOf = (code) => `assets/pieces/${code[0] === "w" ? "W" : "B"}_${code.slice(1)}.png`;
const pieceSrc = (code) => (imgOk[code] ? fileOf(code) : imgOk[code.slice(0, 2)] ? fileOf(code.slice(0, 2)) : null);
const nameOf = (code) => NAME[code] || NAME[code.slice(0, 2)] || KIND[code[1]];
const hz = (code) => HANJA[code[0]][code[1]];
function pieceInner(code) {
  // v2: 그림 속 깃발이 신분(한자)을 알려 주므로 배지는 달지 않는다
  const src = pieceSrc(code);
  return src ? `<img src="${src}" alt="${nameOf(code)} (${KIND[code[1]]})" draggable="false">`
             : `<span class="token ${code[0]}" aria-label="${nameOf(code)}">${hz(code)}</span>`;
}
async function preload() {
  await Promise.all(CODES.map((c) => new Promise((res) => {
    const im = new Image();
    im.onload = () => { imgOk[c] = true; res(); };
    im.onerror = () => { imgOk[c] = false; res(); };
    im.src = fileOf(c);
  })));
}

// ---------------------------------------------------------------- 상태
let game = new Janggi();
const S = { mode: "ai", level: "normal", side: "w", setup: "마상마상", flipped: false, sel: -1, legal: [], last: null, busy: false, sound: true, hint: null };
let worker = null, aiReq = 0;

function save() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify({ game: game.toJSON(), mode: S.mode, level: S.level, side: S.side, setup: S.setup, sound: S.sound })); } catch (e) { /* 저장 안 되는 환경 */ }
}
function loadSaved() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY) || "null"); } catch (e) { return null; }
}

// ---------------------------------------------------------------- 소리 (짧은 합성음, 파일 없음)
let actx = null;
function tone(freqs, dur = 0.09, type = "triangle", vol = 0.12) {
  if (!S.sound) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    let t = actx.currentTime;
    for (const f of freqs) {
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = type; o.frequency.value = f;
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g).connect(actx.destination); o.start(t); o.stop(t + dur);
      t += dur * 0.8;
    }
  } catch (e) { /* 소리 없음 */ }
}
const SFX = {
  move: () => tone([440], 0.07, "square", 0.06), capture: () => tone([330, 220], 0.09, "square", 0.08),
  check: () => tone([660, 880], 0.1), win: () => tone([523, 659, 784, 1046], 0.14), lose: () => tone([392, 330, 262], 0.16),
};

// ---------------------------------------------------------------- 페이 말풍선
const LINES = {
  start: ["어서 와요! 빛 진영(초)이 먼저 둬요.", "끼룩! 오늘은 장기 한판 어때요?"],
  captureLight: ["끼룩! 빛 진영이 하나 잡았어요!", "좋아요, 그 기세예요!", "마물이 물러갔어요!"],
  captureDark: ["앗, 드래곤 군단이 하나 잡아 갔어요…", "괜찮아요, 아직 기회가 있어요!", "조심해요, 용이 노리고 있어요!"],
  check: ["장군이에요! 궁을 지켜요!", "장군! 궁이 위험해요!"],
  escape: ["멍군! 잘 막았어요!", "멍군이요! 휴, 살았다!"],
  hint: ["여기 어때요? 반짝이는 자리를 봐요!"],
  think: ["드래곤 군단이 고민 중이에요…", "용들이 머리를 맞대는 중…"],
  pass: ["둘 곳이 없어서 한 수 쉬어요."],
};
const pick = (a) => a[Math.floor(Math.random() * a.length)];
function say(text) {
  $("bubbleText").textContent = text;
  const b = $("bubble"); b.classList.remove("flash"); void b.offsetWidth; b.classList.add("flash");
}

// ---------------------------------------------------------------- 그리기
const view = (i) => { let r = R_(i), f = F_(i); if (S.flipped) { r = 9 - r; f = 8 - f; } return [f, r]; };
const sqAt = (f, r) => (S.flipped ? (9 - r) * 9 + (8 - f) : r * 9 + f);

function drawLines() {
  let s = `<rect class="frame" x=".5" y=".5" width="8" height="9" fill="none" stroke="currentColor"/>`;
  for (let r = 0; r < 10; r++) s += `<line x1=".5" y1="${r + 0.5}" x2="8.5" y2="${r + 0.5}"/>`;
  for (let f = 0; f < 9; f++) s += `<line x1="${f + 0.5}" y1=".5" x2="${f + 0.5}" y2="9.5"/>`;
  for (const y of [0.5, 7.5]) s += `<line x1="3.5" y1="${y}" x2="5.5" y2="${y + 2}"/><line x1="5.5" y1="${y}" x2="3.5" y2="${y + 2}"/>`;
  // 졸·포 자리 표시 (작은 꺾쇠)
  const mark = (x, y) => {
    const d = 0.09, l = 0.16;
    let p = "";
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      if (x + sx * 0.5 < 0.5 || x + sx * 0.5 > 8.5) continue;
      const ox = x + sx * d, oy = y + sy * d;
      p += `M${ox + sx * l} ${oy}L${ox} ${oy}L${ox} ${oy + sy * l}`;
    }
    return `<path d="${p}"/>`;
  };
  for (const r of [3, 6]) for (const f of [0, 2, 4, 6, 8]) s += mark(f + 0.5, r + 0.5);
  for (const r of [2, 7]) for (const f of [1, 7]) s += mark(f + 0.5, r + 0.5);
  $("lines").innerHTML = s;
}

function drawBoard() {
  const kingSq = game.inCheck() ? game.board.indexOf(game.turn + "K") : -1;
  let html = "";
  for (let r = 0; r < 10; r++) for (let f = 0; f < 9; f++) {
    const i = sqAt(f, r);
    const cls = ["sq"];
    if (S.last && (S.last.from === i || S.last.to === i)) cls.push("last");
    if (S.sel === i) cls.push("sel");
    if (kingSq === i) cls.push("check");
    if (S.hint && (S.hint.from === i || S.hint.to === i)) cls.push("hint");
    const mv = S.legal.find((m) => m.to === i);
    const mark = mv ? (mv.captured ? '<span class="ring"></span>' : '<span class="dot"></span>') : "";
    html += `<div class="${cls.join(" ")}" data-i="${i}" role="gridcell">${mark}</div>`;
  }
  $("board").innerHTML = html;
}

function drawPieces(popSq = -1) {
  let html = "";
  game.board.forEach((p, i) => {
    if (!p) return;
    const [f, r] = view(i);
    const cls = ["piece", p[0], p[1]];
    if (S.sel === i) cls.push("picked");
    if (popSq === i) cls.push("pop");
    html += `<div class="${cls.join(" ")}" data-i="${i}" style="left:${(f * 100) / 9}%;top:${r * 10}%;z-index:${10 + r}">${pieceInner(p)}</div>`;
  });
  $("layer").innerHTML = html;
}

function drawTrays() {
  const took = { w: [], b: [] };   // 진영별로 잡은 상대 말
  for (const h of game.hist) if (h.captured) took[h.turn].push(h.captured);
  const order = "RCHEAP";
  const row = (list) => list.sort((a, b) => order.indexOf(a[1]) - order.indexOf(b[1]))
    .map((c) => (pieceSrc(c) ? `<img src="${pieceSrc(c)}" alt="${nameOf(c)}">` : `<span class="token mini ${c[0]}">${hz(c)}</span>`)).join("");
  const bottom = S.flipped ? "b" : "w", top = bottom === "w" ? "b" : "w";
  $("trayBottom").innerHTML = row(took[bottom]);
  $("trayTop").innerHTML = row(took[top]);
  const who = (c) => SIDE[c] + (S.mode === "ai" ? (c === S.side ? " · 나" : " · 컴퓨터") : "");
  $("nameBottom").textContent = who(bottom); $("nameTop").textContent = who(top);
  $("ptsBottom").textContent = score(game.board, bottom) + "점"; $("ptsTop").textContent = score(game.board, top) + "점";
  document.querySelector("#playerBottom .side-dot").className = "side-dot " + bottom;
  document.querySelector("#playerTop .side-dot").className = "side-dot " + top;
  const over = !!game.result();
  $("playerBottom").classList.toggle("turn", game.turn === bottom && !over);
  $("playerTop").classList.toggle("turn", game.turn === top && !over);
}

function drawStatus() {
  const st = $("status"), res = game.result();
  st.classList.toggle("alert", game.inCheck());
  if (res) st.textContent = res.winner ? `${res.why === "mate" ? "외통!" : "점수 판정"} ${SIDE[res.winner]} 승리` : "무승부";
  else st.textContent = `${SIDE[game.turn]} 차례${game.inCheck() ? " · 장군!" : ""} · ${game.plies()}/${MAX_PLIES}수`;
  $("btnUndo").disabled = game.plies() === 0 || S.busy;
  $("btnHint").disabled = !!res || S.busy || !myTurn();
}

function render(popSq = -1) { drawBoard(); drawPieces(popSq); drawTrays(); drawStatus(); }

// ---------------------------------------------------------------- 수 두기
const myTurn = () => S.mode === "pvp" || game.turn === S.side;

function animateMove(m) {
  return new Promise((resolve) => {
    const el = $("layer").querySelector(`.piece[data-i="${m.from}"]`);
    const victim = $("layer").querySelector(`.piece[data-i="${m.to}"]`);
    if (!el) return resolve();
    const [f, r] = view(m.to);
    el.style.zIndex = 40;
    if (victim) victim.classList.add("gone");
    requestAnimationFrame(() => { el.style.left = (f * 100) / 9 + "%"; el.style.top = r * 10 + "%"; });
    setTimeout(resolve, matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 280);
  });
}

async function doMove(m) {
  S.busy = true; S.sel = -1; S.legal = []; S.hint = null;
  const wasCheck = game.inCheck();
  drawBoard();
  await animateMove(m);
  const rec = game.move(m);
  S.busy = false;
  if (!rec) { render(); return; }
  S.last = { from: rec.from, to: rec.to };
  render(rec.to);
  if (rec.check) { SFX.check(); say(pick(LINES.check)); }
  else if (rec.captured) { SFX.capture(); say(pick(rec.turn === "w" ? LINES.captureLight : LINES.captureDark)); }
  else { SFX.move(); if (wasCheck) say(pick(LINES.escape)); }
  save();
  afterMove();
}

function afterMove() {
  if (game.result()) return finish();
  // 둘 수가 없으면(장군 아님) 한 수 쉰다
  if (!game.moves().length) {
    game.move({ pass: true }); say(pick(LINES.pass)); render(); save();
    if (game.result()) return finish();
  }
  drawStatus();
  if (S.mode === "ai" && game.turn !== S.side) aiMove();
}

function onSquare(i) {
  if (S.busy || game.result() || !myTurn()) return;
  const p = game.get(i);
  if (S.sel >= 0) {
    const mv = S.legal.find((m) => m.to === i);
    if (mv) return doMove({ from: S.sel, to: i });
  }
  if (p && p[0] === game.turn) {
    S.sel = i; S.legal = game.moves(i);
    tone([740], 0.04, "sine", 0.06);
  } else { S.sel = -1; S.legal = []; }
  drawBoard(); drawPieces();
}

function ensureWorker() {
  if (worker) return worker;
  worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
  return worker;
}
function askEngine(level) {
  const id = ++aiReq;
  return new Promise((resolve) => {
    const w = ensureWorker();
    const onMsg = (e) => { if (e.data.id !== id) return; w.removeEventListener("message", onMsg); resolve(e.data.move); };
    w.addEventListener("message", onMsg);
    w.postMessage({ board: game.board, turn: game.turn, level, id });
  });
}
async function aiMove() {
  S.busy = true; drawStatus();
  if (Math.random() < 0.3) say(pick(LINES.think));
  const started = performance.now();
  const id = aiReq + 1;
  const m = await askEngine(S.level);
  if (id !== aiReq) return;   // 그사이 새 게임·되돌리기
  const wait = Math.max(0, 450 - (performance.now() - started));   // 너무 빠르면 사람처럼 잠깐 쉰다
  await new Promise((r) => setTimeout(r, wait));
  S.busy = false;
  if (m) doMove(m); else afterMove();
}

async function hint() {
  if (S.busy || !myTurn() || game.result()) return;
  S.busy = true; drawStatus();
  const m = await askEngine(S.level === "hard" ? "hard" : "normal");
  S.busy = false;
  if (m) { S.hint = m; say(pick(LINES.hint)); render(); }
}

function undo() {
  if (S.busy && S.mode === "ai") { aiReq++; S.busy = false; }
  if (!game.plies()) return;
  game.undo();
  // 컴퓨터 수(와 한 수 쉼)까지 되돌려 내 차례로
  while (S.mode === "ai" && game.turn !== S.side && game.plies()) game.undo();
  const h = game.hist.filter((x) => !x.pass);
  S.last = h.length ? { from: h[h.length - 1].from, to: h[h.length - 1].to } : null;
  S.sel = -1; S.legal = []; S.hint = null;
  render(); save();
  if (S.mode === "ai" && game.turn !== S.side && !game.result()) aiMove();
}

function finish() {
  save(); render();
  const res = game.result();
  let title, text;
  if (res.winner) {
    const iWon = S.mode === "pvp" || res.winner === S.side;
    title = S.mode === "pvp" ? `${SIDE[res.winner]} 승리!` : iWon ? "승리!" : "아쉬워요…";
    const how = res.why === "mate" ? "외통수!" : `점수 판정 (초 ${res.w} : 한 ${res.b})`;
    text = how + " " + (res.winner === "w" ? "빛 진영이 드래곤 군단을 물리쳤어요! 골든 캐슬에 다시 빛이 비쳐요." : "드래곤 군단이 이겼어요. 하지만 빛은 꺼지지 않아요 — 한 판 더?");
    (iWon ? SFX.win : SFX.lose)();
  } else { title = "무승부"; text = "둘 다 둘 곳이 없어요. 비겼어요!"; SFX.move(); }
  $("overTitle").textContent = title; $("overText").textContent = text;
  setTimeout(() => { $("over").hidden = false; }, 600);
}

// ---------------------------------------------------------------- 메뉴
function segValue(key) { return document.querySelector(`.seg[data-key="${key}"] button.on`).dataset.v; }
function setSeg(key, v) { document.querySelectorAll(`.seg[data-key="${key}"] button`).forEach((b) => b.classList.toggle("on", b.dataset.v === v)); }
function syncMenu() { const ai = segValue("mode") === "ai"; $("grpLevel").hidden = !ai; $("grpSide").hidden = !ai; }
function openMenu() {
  const saved = loadSaved();
  $("btnResume").hidden = !(saved && saved.game && saved.game.moves.length && !game.result());
  setSeg("mode", S.mode); setSeg("level", S.level); setSeg("side", S.side); setSeg("setup", S.setup); syncMenu();
  $("menu").hidden = false;
}
const randomSetup = () => pick(["마상마상", "상마상마", "마상상마", "상마마상"]);
function startGame({ mode, level, side, setup, saved = null }) {
  aiReq++;
  S.mode = mode; S.level = level; S.side = mode === "ai" ? side : "w"; S.setup = setup;
  S.flipped = mode === "ai" && side === "b";
  if (saved) game = Janggi.fromJSON(saved);
  else {
    // 컴퓨터 쪽 상차림은 무작위, 둘이서는 같은 상차림
    const other = mode === "ai" ? randomSetup() : setup;
    game = S.side === "w" ? new Janggi(setup, other) : new Janggi(other, setup);
  }
  const h = game.hist.filter((x) => !x.pass);
  S.last = h.length ? { from: h[h.length - 1].from, to: h[h.length - 1].to } : null;
  S.sel = -1; S.legal = []; S.hint = null; S.busy = false;
  $("menu").hidden = true; $("over").hidden = true;
  render(); save();
  say(saved ? "이어서 해요! 어디까지 했더라…" : pick(LINES.start));
  if (S.mode === "ai" && game.turn !== S.side && !game.result()) aiMove();
}

function openRules() {
  $("rulesList").innerHTML = RULES.map(([t, k, d]) => {
    const who = (c) => [...new Set(Object.keys(NAME).filter((x) => x[0] === c && x[1] === t).map((x) => NAME[x].replace(/^늑대개 .+/, "늑대개 군단")))].join("·");
    return `<li><span class="hz">${HANJA.w[t]}</span><span><b>${k}</b> · ${who("w")} / ${who("b")}<br>${d}</span></li>`;
  }).join("");
  $("rules").hidden = false;
}

// ---------------------------------------------------------------- 시작
document.querySelectorAll(".seg").forEach((seg) => seg.addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  seg.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b)); syncMenu();
}));
$("btnStart").onclick = () => startGame({ mode: segValue("mode"), level: segValue("level"), side: segValue("side"), setup: segValue("setup") });
$("btnResume").onclick = () => { const s = loadSaved(); if (s) startGame({ mode: s.mode, level: s.level, side: s.side, setup: s.setup, saved: s.game }); };
$("btnMenu").onclick = openMenu; $("btnNew").onclick = openMenu; $("btnOverMenu").onclick = openMenu;
$("btnAgain").onclick = () => startGame({ mode: S.mode, level: S.level, side: S.side, setup: S.setup });
$("btnUndo").onclick = undo; $("btnHint").onclick = hint;
$("btnRules").onclick = openRules; $("btnRulesOk").onclick = () => { $("rules").hidden = true; };
$("btnSound").onclick = () => { S.sound = !S.sound; $("btnSound").textContent = S.sound ? "🔊" : "🔇"; save(); };
$("board").addEventListener("click", (e) => { const c = e.target.closest(".sq"); if (c) onSquare(Number(c.dataset.i)); });

(async function init() {
  drawLines();
  await preload();
  const saved = loadSaved();
  if (saved) {
    S.sound = saved.sound !== false; $("btnSound").textContent = S.sound ? "🔊" : "🔇";
    S.mode = saved.mode || "ai"; S.level = saved.level || "normal"; S.side = saved.side || "w"; S.setup = saved.setup || "마상마상";
    if (saved.game) {
      S.flipped = S.mode === "ai" && S.side === "b";
      game = Janggi.fromJSON(saved.game);
      const h = game.hist.filter((x) => !x.pass);
      S.last = h.length ? { from: h[h.length - 1].from, to: h[h.length - 1].to } : null;
    }
  }
  render();
  openMenu();
  if (location.hash === "#peek") $("menu").hidden = true;   // 개발용: 메뉴 없이 판만 보기
})();

// ---------------------------------------------------------------- 자동 점검 (주소 끝에 #selftest) — 개발용
if (location.hash === "#selftest") {
  (async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const log = [];
    try {
      await wait(800);
      startGame({ mode: "ai", level: "normal", side: "w", setup: "마상마상" });
      const click = (i) => document.querySelector(`.sq[data-i="${i}"]`).click();
      // 졸 e(6,4)→(5,4), 마(9,1)→(7,2), 차(9,0)→(8,0)
      for (const [a, b] of [[6 * 9 + 4, 5 * 9 + 4], [9 * 9 + 1, 7 * 9 + 2], [9 * 9 + 0, 8 * 9 + 0]]) {
        while (S.busy || !myTurn()) await wait(100);
        click(a); await wait(150);
        const dots = document.querySelectorAll(".sq .dot, .sq .ring").length;
        click(b); await wait(700);
        while (S.busy || !myTurn()) await wait(100);
        log.push(`${a}>${b}(dots ${dots}) plies ${game.plies()}`);
      }
      undo(); await wait(500);
      log.push("undo → " + game.plies() + " plies");
      document.title = "SELFTEST OK | " + log.join(" | ") + " | pieces " + document.querySelectorAll(".piece").length;
    } catch (e) { document.title = "SELFTEST FAIL " + e; }
  })();
}
