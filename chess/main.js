// 퓨어데이 체스 — 화면·입력·연출. 규칙은 chess.js, 컴퓨터 수는 worker.js(ai.js)
import { Chess } from "./vendor/chess.js";

const $ = (id) => document.getElementById(id);
const FILES = "abcdefgh";
const SAVE_KEY = "pureday-chess-v1";

// 말 그림: assets/pieces/<w|b>_<K|Q|R|B|N|P>.png — 없으면 기호로 대신한다
const GLYPH = { w: { k: "♔", q: "♕", r: "♖", b: "♗", n: "♘", p: "♙" }, b: { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" } };
const NAME = {
  w: { k: "조성민 박사", q: "조아름", r: "골든 캐슬의 탑", b: "아퀼라", n: "조하임", p: "견습 창병" },
  b: { k: "큰 용", q: "교만의 용장", r: "무너진 탑", b: "비룡대", n: "아포피스", p: "마물" },
};
const SIDE = { w: "빛 진영", b: "드래곤 군단" };
const imgOk = {};   // 그림 파일이 있는지 미리 확인한 결과

function pieceSrc(color, type) { return `assets/pieces/${color === "w" ? "W" : "B"}_${type.toUpperCase()}.png`; }
function pieceEl(color, type, cls = "") {
  const key = color + type;
  return imgOk[key] ? `<img src="${pieceSrc(color, type)}" alt="${NAME[color][type]}" draggable="false"${cls}>`
                    : `<span class="glyph" aria-label="${NAME[color][type]}">${GLYPH[color][type]}</span>`;
}
async function preload() {
  await Promise.all(["w", "b"].flatMap((c) => ["k", "q", "r", "b", "n", "p"].map((t) => new Promise((res) => {
    const im = new Image();
    im.onload = () => { imgOk[c + t] = true; res(); };
    im.onerror = () => { imgOk[c + t] = false; res(); };
    im.src = pieceSrc(c, t);
  }))));
}

// ---------------------------------------------------------------- 상태
const game = new Chess();
const S = { mode: "ai", level: "normal", side: "w", flipped: false, sel: null, legal: [], last: null, busy: false, sound: true, hint: null };
let worker = null, aiReq = 0;

function save() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify({ pgn: game.pgn(), mode: S.mode, level: S.level, side: S.side, sound: S.sound })); } catch (e) { /* 저장 안 되는 환경 */ }
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
  move: () => tone([520], 0.07), capture: () => tone([330, 220], 0.09, "square", 0.08),
  check: () => tone([660, 880], 0.1), win: () => tone([523, 659, 784, 1046], 0.14), lose: () => tone([392, 330, 262], 0.16),
};

// ---------------------------------------------------------------- 페이 말풍선
const LINES = {
  start: ["어서 와요! 빛 진영이 먼저 둬요.", "끼룩! 오늘도 한판 해 볼까요?"],
  captureLight: ["끼룩! 빛 진영이 하나 잡았어요!", "좋아요, 그 기세예요!", "마물이 물러갔어요!"],
  captureDark: ["앗, 드래곤 군단이 하나 잡아 갔어요…", "괜찮아요, 아직 기회가 있어요!", "조심해요, 용이 노리고 있어요!"],
  check: ["체크! 왕을 지켜요!", "앗, 왕이 위험해요!"],
  promo: ["견습 창병이 끝까지 왔어요! 이제 기사로 성장해요!"],
  hint: ["여기 어때요? 반짝이는 칸을 봐요!"],
  think: ["드래곤 군단이 고민 중이에요…", "용들이 머리를 맞대는 중…"],
};
const pick = (a) => a[Math.floor(Math.random() * a.length)];
function say(text) {
  $("bubbleText").textContent = text;
  const b = $("bubble"); b.classList.remove("flash"); void b.offsetWidth; b.classList.add("flash");
}

// ---------------------------------------------------------------- 그리기
function sqXY(square) {
  let f = FILES.indexOf(square[0]), r = 8 - Number(square[1]);
  if (S.flipped) { f = 7 - f; r = 7 - r; }
  return [f, r];
}
function squareAt(f, r) {
  if (S.flipped) { f = 7 - f; r = 7 - r; }
  return FILES[f] + (8 - r);
}

function drawBoard() {
  const kingSq = game.inCheck() ? findKing(game.turn()) : null;
  let html = "";
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
    const sq = squareAt(f, r);
    const light = (FILES.indexOf(sq[0]) + Number(sq[1])) % 2 === 1;
    const cls = ["sq", light ? "l" : "d"];
    if (S.last && (S.last.from === sq || S.last.to === sq)) cls.push("last");
    if (S.sel === sq) cls.push("sel");
    if (kingSq === sq) cls.push("check");
    if (S.hint && (S.hint.from === sq || S.hint.to === sq)) cls.push("hint");
    const mv = S.legal.find((m) => m.to === sq);
    const mark = mv ? (mv.captured ? '<span class="ring"></span>' : '<span class="dot"></span>') : "";
    const coordF = r === 7 ? `<span class="coord f">${sq[0]}</span>` : "";
    const coordR = f === 0 ? `<span class="coord r">${sq[1]}</span>` : "";
    html += `<div class="${cls.join(" ")}" data-sq="${sq}" role="gridcell" aria-label="${sq}">${mark}${coordF}${coordR}</div>`;
  }
  $("board").innerHTML = html;
}

function drawPieces(popSq = null) {
  const layer = $("layer");
  let html = "";
  for (const row of game.board()) for (const p of row) {
    if (!p) continue;
    const [f, r] = sqXY(p.square);
    const cls = ["piece", p.color];
    if (S.sel === p.square) cls.push("picked");
    if (popSq === p.square) cls.push("pop");
    html += `<div class="${cls.join(" ")}" data-sq="${p.square}" style="left:${f * 12.5}%;top:${r * 12.5}%;z-index:${10 + r}">${pieceEl(p.color, p.type)}</div>`;
  }
  layer.innerHTML = html;
}

function drawTrays() {
  // 처음 말 수와 비교해 잡힌 말을 보여 준다
  const start = { p: 8, n: 2, b: 2, r: 2, q: 1 };
  const have = { w: { p: 0, n: 0, b: 0, r: 0, q: 0 }, b: { p: 0, n: 0, b: 0, r: 0, q: 0 } };
  for (const row of game.board()) for (const p of row) if (p && p.type !== "k") have[p.color][p.type]++;
  const lost = (c) => ["q", "r", "b", "n", "p"].flatMap((t) => Array(Math.max(0, start[t] - have[c][t])).fill(t))
    .map((t) => (imgOk[c + t] ? `<img src="${pieceSrc(c, t)}" alt="">` : `<span class="glyph">${GLYPH[c][t]}</span>`)).join("");
  const bottom = S.flipped ? "b" : "w", top = bottom === "w" ? "b" : "w";
  // 내 쪽 줄에는 내가 잡은(상대의 잃은) 말
  $("trayBottom").innerHTML = lost(top);
  $("trayTop").innerHTML = lost(bottom);
  $("nameBottom").textContent = SIDE[bottom] + (S.mode === "ai" ? (bottom === S.side ? " · 나" : " · 컴퓨터") : "");
  $("nameTop").textContent = SIDE[top] + (S.mode === "ai" ? (top === S.side ? " · 나" : " · 컴퓨터") : "");
  document.querySelector("#playerBottom .side-dot").className = "side-dot " + (bottom === "w" ? "light" : "dark");
  document.querySelector("#playerTop .side-dot").className = "side-dot " + (top === "w" ? "light" : "dark");
  $("playerBottom").classList.toggle("turn", game.turn() === bottom && !game.isGameOver());
  $("playerTop").classList.toggle("turn", game.turn() === top && !game.isGameOver());
}

function drawStatus() {
  const st = $("status");
  st.classList.toggle("alert", game.inCheck());
  if (game.isCheckmate()) st.textContent = `체크메이트! ${SIDE[game.turn() === "w" ? "b" : "w"]} 승리`;
  else if (game.isDraw() || game.isStalemate()) st.textContent = "무승부";
  else st.textContent = `${SIDE[game.turn()]} 차례${game.inCheck() ? " · 체크!" : ""}`;
  $("btnUndo").disabled = game.history().length === 0 || S.busy;
  $("btnHint").disabled = game.isGameOver() || S.busy || !myTurn();
}

function render(popSq = null) { drawBoard(); drawPieces(popSq); drawTrays(); drawStatus(); }

function findKing(color) {
  for (const row of game.board()) for (const p of row) if (p && p.type === "k" && p.color === color) return p.square;
  return null;
}

// ---------------------------------------------------------------- 수 두기
const myTurn = () => S.mode === "pvp" || game.turn() === S.side;

function animateMove(m) {
  return new Promise((resolve) => {
    const el = $("layer").querySelector(`.piece[data-sq="${m.from}"]`);
    const victim = $("layer").querySelector(`.piece[data-sq="${m.to}"]`);
    if (!el) return resolve();
    const [f, r] = sqXY(m.to);
    el.style.zIndex = 40;
    if (victim) victim.classList.add("gone");
    requestAnimationFrame(() => { el.style.left = f * 12.5 + "%"; el.style.top = r * 12.5 + "%"; });
    setTimeout(resolve, matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 280);
  });
}

async function doMove(m) {
  S.busy = true; S.sel = null; S.legal = []; S.hint = null;
  drawBoard();
  await animateMove(m);
  const res = game.move({ from: m.from, to: m.to, promotion: m.promotion || "q" });
  S.last = { from: res.from, to: res.to };
  render(res.promotion ? res.to : null);
  if (game.inCheck()) { SFX.check(); say(pick(LINES.check)); }
  else if (res.captured) { SFX.capture(); say(pick(res.color === "w" ? LINES.captureLight : LINES.captureDark)); }
  else SFX.move();
  if (res.promotion && res.color === "w") say(pick(LINES.promo));
  save();
  S.busy = false;
  if (game.isGameOver()) return finish();
  drawStatus();
  if (S.mode === "ai" && game.turn() !== S.side) aiMove();
}

function askPromotion(color) {
  return new Promise((resolve) => {
    const row = $("promoRow");
    row.innerHTML = ["q", "r", "b", "n"].map((t) => `<button data-t="${t}" aria-label="${NAME[color][t]}">${pieceEl(color, t)}</button>`).join("");
    $("promo").hidden = false;
    row.onclick = (e) => { const b = e.target.closest("button"); if (!b) return; $("promo").hidden = true; resolve(b.dataset.t); };
  });
}

async function onSquare(sq) {
  if (S.busy || game.isGameOver() || !myTurn()) return;
  const p = game.get(sq);
  if (S.sel) {
    const cand = S.legal.filter((m) => m.to === sq);
    if (cand.length) {
      let promo;
      if (cand.some((m) => m.promotion)) promo = await askPromotion(game.turn());
      return doMove({ from: S.sel, to: sq, promotion: promo });
    }
  }
  if (p && p.color === game.turn()) {
    S.sel = sq; S.legal = game.moves({ square: sq, verbose: true });
    tone([740], 0.04, "sine", 0.06);
  } else { S.sel = null; S.legal = []; }
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
    w.postMessage({ fen: game.fen(), level, id });
  });
}
async function aiMove() {
  S.busy = true; drawStatus();
  if (Math.random() < 0.35) say(pick(LINES.think));
  const started = performance.now();
  const id = aiReq + 1;
  const m = await askEngine(S.level);
  if (id !== aiReq) return;   // 그사이 새 게임·되돌리기
  const wait = Math.max(0, 450 - (performance.now() - started));   // 너무 빠르면 사람처럼 잠깐 쉰다
  await new Promise((r) => setTimeout(r, wait));
  S.busy = false;
  if (m) doMove(m);
}

async function hint() {
  if (S.busy || !myTurn() || game.isGameOver()) return;
  S.busy = true; drawStatus();
  const m = await askEngine(S.level === "hard" ? "hard" : "normal");
  S.busy = false;
  if (m) { S.hint = m; say(pick(LINES.hint)); render(); }
}

function undo() {
  if (S.busy && S.mode === "ai") { aiReq++; S.busy = false; }
  if (!game.history().length) return;
  game.undo();
  if (S.mode === "ai" && game.turn() !== S.side && game.history().length) game.undo();   // 컴퓨터 수까지 함께
  const h = game.history({ verbose: true });
  S.last = h.length ? { from: h[h.length - 1].from, to: h[h.length - 1].to } : null;
  S.sel = null; S.legal = []; S.hint = null;
  render(); save();
  if (S.mode === "ai" && game.turn() !== S.side && !game.isGameOver()) aiMove();
}

function finish() {
  save();
  let title, text;
  if (game.isCheckmate()) {
    const winner = game.turn() === "w" ? "b" : "w";
    const iWon = S.mode === "pvp" || winner === S.side;
    title = S.mode === "pvp" ? `${SIDE[winner]} 승리!` : iWon ? "승리!" : "아쉬워요…";
    text = winner === "w" ? "빛 진영이 드래곤 군단을 물리쳤어요! 골든 캐슬에 다시 빛이 비쳐요." : "드래곤 군단이 이겼어요. 하지만 빛은 꺼지지 않아요 — 한 판 더?";
    (iWon ? SFX.win : SFX.lose)();
  } else {
    title = "무승부"; text = game.isStalemate() ? "더 둘 곳이 없어요(스테일메이트). 비겼어요!" : "비겼어요! 다음 판에서 다시 겨뤄요.";
    SFX.move();
  }
  $("overTitle").textContent = title; $("overText").textContent = text;
  setTimeout(() => { $("over").hidden = false; }, 600);
}

// ---------------------------------------------------------------- 메뉴
function segValue(key) { return document.querySelector(`.seg[data-key="${key}"] button.on`).dataset.v; }
function setSeg(key, v) { document.querySelectorAll(`.seg[data-key="${key}"] button`).forEach((b) => b.classList.toggle("on", b.dataset.v === v)); }
function syncMenu() {
  const ai = segValue("mode") === "ai";
  $("grpLevel").hidden = !ai; $("grpSide").hidden = !ai;
}
function openMenu() {
  const saved = loadSaved();
  $("btnResume").hidden = !(saved && saved.pgn && !game.isGameOver() && game.history().length);
  setSeg("mode", S.mode); setSeg("level", S.level); setSeg("side", S.side); syncMenu();
  $("menu").hidden = false;
}
function startGame({ mode, level, side, pgn = "" }) {
  aiReq++;
  S.mode = mode; S.level = level; S.side = mode === "ai" ? side : "w";
  S.flipped = mode === "ai" && side === "b";
  game.reset();
  if (pgn) { try { game.loadPgn(pgn); } catch (e) { game.reset(); } }
  const h = game.history({ verbose: true });
  S.last = h.length ? { from: h[h.length - 1].from, to: h[h.length - 1].to } : null;
  S.sel = null; S.legal = []; S.hint = null; S.busy = false;
  $("menu").hidden = true; $("over").hidden = true;
  render(); save();
  say(pgn ? "이어서 해요! 어디까지 했더라…" : pick(LINES.start));
  if (S.mode === "ai" && game.turn() !== S.side && !game.isGameOver()) aiMove();
}

// ---------------------------------------------------------------- 시작
document.querySelectorAll(".seg").forEach((seg) => seg.addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  seg.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b)); syncMenu();
}));
$("btnStart").onclick = () => startGame({ mode: segValue("mode"), level: segValue("level"), side: segValue("side") });
$("btnResume").onclick = () => { const s = loadSaved(); if (s) startGame({ mode: s.mode, level: s.level, side: s.side, pgn: s.pgn }); };
$("btnMenu").onclick = openMenu; $("btnNew").onclick = openMenu; $("btnOverMenu").onclick = openMenu;
$("btnAgain").onclick = () => startGame({ mode: S.mode, level: S.level, side: S.side });
$("btnUndo").onclick = undo; $("btnHint").onclick = hint;
$("btnSound").onclick = () => { S.sound = !S.sound; $("btnSound").textContent = S.sound ? "🔊" : "🔇"; save(); };
$("board").addEventListener("click", (e) => { const c = e.target.closest(".sq"); if (c) onSquare(c.dataset.sq); });

(async function init() {
  await preload();
  const saved = loadSaved();
  if (saved) { S.sound = saved.sound !== false; $("btnSound").textContent = S.sound ? "🔊" : "🔇"; }
  if (saved && saved.pgn) {
    S.mode = saved.mode; S.level = saved.level; S.side = saved.side;
    S.flipped = S.mode === "ai" && S.side === "b";
    try { game.loadPgn(saved.pgn); } catch (e) { game.reset(); }
    const h = game.history({ verbose: true });
    S.last = h.length ? { from: h[h.length - 1].from, to: h[h.length - 1].to } : null;
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
      startGame({ mode: "ai", level: "normal", side: "w" });
      const click = (sq) => document.querySelector(`.sq[data-sq="${sq}"]`).click();
      for (const [a, b] of [["e2", "e4"], ["g1", "f3"], ["f1", "c4"]]) {
        while (S.busy || !myTurn()) await wait(100);
        click(a); await wait(150);
        const dots = document.querySelectorAll(".sq .dot, .sq .ring").length;
        click(b); await wait(700);
        while (S.busy || !myTurn()) await wait(100);
        log.push(`${a}${b}(dots ${dots}) → ${game.history().slice(-1)[0]}`);
      }
      undo(); await wait(500);
      log.push("undo → " + game.history().length + " plies");
      document.title = "SELFTEST OK | " + log.join(" | ") + " | pieces " + document.querySelectorAll(".piece").length;
    } catch (e) { document.title = "SELFTEST FAIL " + e; }
  })();
}
