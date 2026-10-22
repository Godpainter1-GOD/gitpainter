// 퓨어데이 볼트·너트 (색 맞추기) — 2026-10-22
// - 규칙과 풀이기는 solver.js, 200단계는 levels.js(tools/gen_levels.mjs 가 만듦)
// - 볼트를 누르면 맨 위 같은 색 묶음이 들리고, 다른 볼트를 누르면 옮겨진다. 모든 볼트가 한 색 4개씩이면 클리어
// - 40단계마다 캐릭터 안내자: 조아름 · 조하임 · 김미아 · 조성민 박사 · 아퀼라
import { CAP, topRun, isDone, solved, canMove, applyMove, solve } from "./solver.js";
import { LEVELS } from "./levels.js";

const $ = (id) => document.getElementById(id);
const SAVE_KEY = "pureday-nuts-v1";
const BW = 400, BH = 560;                       // 판 논리 크기
const COLORS = ["#ff5a5a", "#4f8cff", "#ffd23f", "#4ad66d", "#ff9a3c", "#a66cff", "#ff7ac8", "#2ad4c8", "#a5673f", "#e9ecf2", "#b8e02f", "#3346a8"];
const PER_CH = 40;
const GUIDES = [
  { id: "areum", name: "조아름", title: "빛의 활", start: "같은 색 너트를 한 볼트에 모아요. 볼트를 누르면 맨 위 너트가 들려요!", clear: ["잘했어요! 다음 볼트도 함께 맞춰요.", "한 수 한 수 차근차근, 참 좋아요.", "너트가 가지런해지니 마음도 환해져요."] },
  { id: "heim", name: "조하임", title: "방패의 형", start: "급하지 않아도 돼요. 빈 볼트를 잘 쓰면 길이 보여요.", clear: ["든든해요. 한 단계 더 올라갔어요.", "차분하게 풀었네요. 멋져요!", "끝까지 해낸 걸 봤어요. 고마워요."] },
  { id: "mia", name: "김미아", title: "기록자", start: "옮기기 전에 맨 위 색을 먼저 살펴봐요. 힌트는 세 번!", clear: ["기록해 둘게요 — 깔끔한 풀이!", "순서가 참 아름다웠어요.", "좋아요, 다음 판도 기대돼요."] },
  { id: "drjo", name: "조성민 박사", title: "연구자", start: "볼트는 작은 실험실이에요. 가설을 세우고 옮겨 보세요.", clear: ["놀라운 결과예요. 가설이 맞았군요!", "정리된 볼트처럼 생각도 정리됐어요.", "훌륭해요. 다음 실험으로 가 볼까요?"] },
  { id: "aquila", name: "아퀼라", title: "하늘의 눈", start: "높이서 보면 판이 한눈에 들어와요. 전체를 보고 옮겨요.", clear: ["날개를 펴듯 시원하게 풀었어요!", "하늘에서도 보였어요 — 멋진 수!", "마지막 챕터까지 함께해서 기뻐요."] },
];

// ---------------------------------------------------------------- 저장
const SAVE = { unlocked: 0, stars: {}, sound: true };
function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(SAVE)); } catch (e) { /* 저장 안 됨 */ } }
function load() { try { Object.assign(SAVE, JSON.parse(localStorage.getItem(SAVE_KEY) || "{}")); } catch (e) { /* 저장 안 됨 */ } }

// ---------------------------------------------------------------- 소리
let actx = null;
function tone(freqs, dur = 0.06, vol = 0.04, type = "triangle") {
  if (!SAVE.sound) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    let t = actx.currentTime;
    for (const f of freqs) {
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = type; o.frequency.value = f;
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g).connect(actx.destination); o.start(t); o.stop(t + dur); t += dur * 0.8;
    }
  } catch (e) { /* 소리 없음 */ }
}

// ---------------------------------------------------------------- 게임 상태
const G = { level: 0, st: [], ids: [], sel: -1, moves: 0, history: [], hints: 3, extra: 1, busy: false, mode: "title", nextId: 0 };
const HASH = Object.fromEntries(location.hash.slice(1).split("&").filter(Boolean).map((kv) => { const [k, v = "1"] = kv.split("="); return [k, v]; }));

const guideOf = (lv) => GUIDES[Math.min(GUIDES.length - 1, Math.floor(lv / PER_CH))];
const starsOf = (moves, par, usedExtra) => Math.min(usedExtra ? 2 : 3, moves <= par ? 3 : moves <= Math.ceil(par * 1.5) ? 2 : 1);
const starStr = (n) => "★".repeat(n) + "☆".repeat(3 - n);

// ---------------------------------------------------------------- 판 배치
const L = { cols: 3, slotW: 133, nutW: 98, nutH: 44, rowH: 0, rows: [], pos: [] };
function layout() {
  const n = G.st.length;
  L.cols = n <= 4 ? n : n <= 6 ? 3 : n <= 8 ? 4 : 5;   // 4볼트는 한 줄, 5~6은 3+, 7~8은 4+, 그 위는 5+
  L.slotW = BW / L.cols;
  L.nutW = Math.round(L.slotW * 0.74); L.nutH = Math.round(L.nutW * 0.45);
  const rows = Math.ceil(n / L.cols);
  const lift = L.nutH + 12;
  L.rowH = CAP * L.nutH + lift + 22;
  const totalH = rows * L.rowH, top0 = Math.max(0, (BH - totalH) / 2);
  L.pos = [];
  for (let b = 0; b < n; b++) {
    const r = Math.floor(b / L.cols);
    const inRow = Math.min(L.cols, n - r * L.cols);
    const x0 = (BW - inRow * L.slotW) / 2;
    const c = b - r * L.cols;
    L.pos.push({ x: x0 + c * L.slotW, y: top0 + r * L.rowH, cx: x0 + c * L.slotW + L.slotW / 2, baseY: top0 + r * L.rowH + L.rowH - 10, lift });
  }
  const board = $("board");
  board.style.setProperty("--nutW", L.nutW + "px"); board.style.setProperty("--nutH", L.nutH + "px");
  board.innerHTML = "";
  L.pos.forEach((p, b) => {
    const slot = document.createElement("div");
    slot.className = "slot"; slot.dataset.b = b;
    slot.style.cssText = `left:${p.x}px;top:${p.y}px;width:${L.slotW}px;height:${L.rowH}px`;
    const shaftTop = L.rowH - 10 - CAP * L.nutH - 10;
    slot.innerHTML = `<div class="bolt"><div class="shaft" style="top:${shaftTop}px;height:${L.rowH - 10 - shaftTop}px"></div><div class="base" style="top:${L.rowH - 16}px"></div><div class="cap" style="top:${shaftTop}px">✓</div></div>`;
    board.appendChild(slot);
  });
  // 너트 DOM (이미 있으면 다시 만든다)
  for (let b = 0; b < n; b++) for (let k = 0; k < G.st[b].length; k++) nutEl(G.ids[b][k], G.st[b][k]);
  place();
}
const NUTS = new Map();
function nutEl(id, color) {
  let el = NUTS.get(id);
  if (!el) { el = document.createElement("div"); el.className = "nut"; NUTS.set(id, el); }
  el.style.setProperty("--c", COLORS[color % COLORS.length]);
  $("board").appendChild(el);
  return el;
}
/** 지금 상태대로 너트 자리 잡기. sel 볼트의 맨 위 묶음은 들린다 */
function place(instant = false) {
  for (let b = 0; b < G.st.length; b++) {
    const p = L.pos[b], run = b === G.sel ? topRun(G.st[b]) : 0, len = G.st[b].length;
    for (let k = 0; k < len; k++) {
      const el = NUTS.get(G.ids[b][k]);
      const lifted = k >= len - run;
      if (instant) el.style.transition = "none";
      el.style.left = p.cx - L.nutW / 2 + "px";
      el.style.top = p.baseY - (k + 1) * L.nutH - (lifted ? p.lift : 0) + "px";
      el.classList.toggle("lift", lifted);
      if (instant) { el.offsetHeight; el.style.transition = ""; }
    }
    const slot = $("board").children[b];
    slot.classList.toggle("sel", b === G.sel);
    slot.classList.toggle("done", isDone(G.st[b]));
  }
}

// ---------------------------------------------------------------- 단계
function startLevel(i) {
  G.level = i; G.mode = "play";
  const lv = LEVELS[i];
  G.st = lv.b.map((b) => b.slice());
  G.nextId = 0; NUTS.clear();
  G.ids = G.st.map((b) => b.map(() => G.nextId++));
  G.sel = -1; G.moves = 0; G.history = []; G.hints = 3; G.extra = 1; G.busy = false;
  $("screen").hidden = true; $("hud").hidden = false; $("tools").hidden = false;
  const g = guideOf(i);
  $("levelName").textContent = `${i + 1}단계 · ${Math.floor(i / PER_CH) + 1}장 ${g.name}`;
  $("guideImg").src = `assets/${g.id}.png`;
  $("guideSay").textContent = i % PER_CH === 0 ? g.start : `${lv.b.filter((b) => b.length).length}색 · 목표 ${lv.p}수 안이면 ★★★`;
  layout(); resize(); place(true); hud();
  if (HASH.auto) autoPlay();
  if (HASH.taps) { const t = HASH.taps.split(",").map(Number); let k = 0; const go = () => { if (k < t.length) { tapBolt(t[k++]); setTimeout(go, 400); } }; setTimeout(go, 300); }   // 시험용: #taps=0,2,1,3 → 볼트 차례로 누르기
}
function hud() {
  const lv = LEVELS[G.level];
  $("moves").textContent = G.moves; $("par").textContent = lv.p;
  $("stars").textContent = starStr(starsOf(G.moves, lv.p, G.extra === 0));
  $("hintN").textContent = G.hints; $("extraN").textContent = G.extra;
  $("btnHint").disabled = G.hints <= 0 || G.busy; $("btnExtra").disabled = G.extra <= 0 || G.busy; $("btnUndo").disabled = !G.history.length || G.busy;
  $("btnSound").textContent = SAVE.sound ? "🔊" : "🔇";
}
let toastT = 0;
function toast(msg, ms = 1600) { const t = $("toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, ms); }

function tapBolt(b) {
  if (G.mode !== "play" || G.busy) return;
  if (G.sel < 0) {
    if (!G.st[b].length || isDone(G.st[b])) { shake(b); return; }
    G.sel = b; tone([520], 0.05, 0.03, "square"); place(); return;
  }
  if (G.sel === b) { G.sel = -1; tone([400], 0.05, 0.02, "square"); place(); return; }
  const n = canMove(G.st, G.sel, b);
  if (!n) {
    // 다른 볼트를 고른 걸로: 들 수 있으면 바꿔 들고, 아니면 흔들기
    if (G.st[b].length && !isDone(G.st[b])) { G.sel = b; tone([520], 0.05, 0.03, "square"); place(); } else { shake(b); }
    return;
  }
  move(G.sel, b);
}
function shake(b) { const s = $("board").children[b]; s.classList.remove("bad"); s.offsetHeight; s.classList.add("bad"); tone([180], 0.08, 0.03, "sawtooth"); }
function move(from, to, record = true) {
  const n = applyMove(G.st, from, to);
  if (!n) return 0;
  for (let k = 0; k < n; k++) G.ids[to].push(G.ids[from].pop());
  if (record) { G.history.push([from, to, n]); G.moves++; }
  G.busy = true;
  // 1) 들린 채로 목적지 위로 → 2) 내려앉기
  G.sel = -1;
  const p = L.pos[to], len = G.st[to].length;
  for (let k = len - n; k < len; k++) { const el = NUTS.get(G.ids[to][k]); el.classList.add("lift"); el.style.left = p.cx - L.nutW / 2 + "px"; el.style.top = p.baseY - (k + 1) * L.nutH - p.lift + "px"; }
  tone([620 + n * 40], 0.05, 0.03, "triangle");
  setTimeout(() => {
    place();
    const done = isDone(G.st[to]);
    if (done) tone([660, 880, 1100], 0.09, 0.04);
    else tone([330], 0.04, 0.025, "square");
    setTimeout(() => { G.busy = false; hud(); if (solved(G.st)) clear(); }, 180);
  }, 230);
  hud();
  return n;
}
function undo() {
  if (G.busy || !G.history.length) return;
  const [from, to, n] = G.history.pop();
  for (let k = 0; k < n; k++) { G.st[from].push(G.st[to].pop()); G.ids[from].push(G.ids[to].pop()); }
  G.moves = Math.max(0, G.moves - 1); G.sel = -1;
  tone([300, 260], 0.05, 0.025, "square");
  place(); hud();
}
function hint() {
  if (G.busy || G.hints <= 0) return;
  G.sel = -1; place();
  const path = solve(G.st, CAP, 150000);
  if (!path) { toast("지금 판에서는 길을 못 찾았어요 — 되돌리기를 써 보세요"); return; }
  G.hints--; hud();
  const [from, to] = path[0];
  for (const b of [from, to]) { const s = $("board").children[b]; s.classList.remove("hint"); s.offsetHeight; s.classList.add("hint"); setTimeout(() => s.classList.remove("hint"), 2000); }
  tone([880, 1100], 0.06, 0.03);
  toast(`${guideOf(G.level).name}: 반짝이는 볼트에서 반짝이는 볼트로!`);
}
function extraBolt() {
  if (G.busy || G.extra <= 0) return;
  G.extra--; G.sel = -1;
  G.st.push([]); G.ids.push([]);
  layout(); place(true); hud();
  tone([440, 550], 0.06, 0.03);
  toast("빈 볼트가 하나 생겼어요 (별은 최대 ★★)");
}
function clear() {
  G.mode = "clear";
  const lv = LEVELS[G.level], g = guideOf(G.level);
  const s = starsOf(G.moves, lv.p, G.extra === 0);
  SAVE.stars[G.level] = Math.max(SAVE.stars[G.level] || 0, s);
  SAVE.unlocked = Math.max(SAVE.unlocked, G.level + 1);
  save();
  tone([523, 659, 784, 1047], 0.12, 0.05);
  const last = G.level + 1 >= LEVELS.length;
  setTimeout(() => showScreen(`
    <h2>${G.level + 1}단계 클리어!</h2>
    <div class="result">${starStr(s)}</div>
    <img class="hero" src="assets/${g.id}.png" alt="${g.name}">
    <div class="bubble"><b>${g.name}</b> · ${g.clear[G.level % g.clear.length]}</div>
    <p>${G.moves}수 (목표 ${lv.p}수)${G.extra === 0 ? " · 볼트 추가 사용" : ""}</p>
    ${last ? `<p>200단계를 모두 마쳤어요. 고마워요!</p><button class="big" id="bMenu">단계 고르기</button>` : `<button class="big" id="bNext">다음 단계 ▶</button>`}
    <button class="ghost" id="bRetry">다시 하기</button>
    ${last ? "" : `<button class="ghost" id="bMenu">단계 고르기</button>`}
  `, () => {
    if ($("bNext")) $("bNext").onclick = () => startLevel(G.level + 1);
    $("bRetry").onclick = () => startLevel(G.level);
    $("bMenu").onclick = levelMenu;
  }), 500);
}

// ---------------------------------------------------------------- 화면
function showScreen(html, bind) { $("screen").innerHTML = html; $("screen").hidden = false; $("screen").scrollTop = 0; if (bind) bind(); }
function title() {
  G.mode = "title"; $("hud").hidden = true; $("tools").hidden = true;
  const next = Math.min(SAVE.unlocked, LEVELS.length - 1);
  showScreen(`
    <h1>퓨어데이<br><b>볼트·너트</b></h1>
    <p>같은 색 너트를 한 볼트에 모아요 · 200단계</p>
    <div class="demo">${[0, 1, 2, 3, 4, 5].map((c) => `<i style="--c:${COLORS[c]}"></i>`).join("")}</div>
    <img class="hero" src="assets/areum.png" alt="조아름">
    <div class="cast">${GUIDES.map((g) => `<img src="assets/${g.id}.png" alt="${g.name}" title="${g.name}">`).join("")}</div>
    <button class="big" id="bPlay">${SAVE.unlocked ? `${next + 1}단계 계속하기` : "시작하기"}</button>
    <button class="ghost" id="bLevels">단계 고르기</button>
    <p class="how">볼트를 누르면 맨 위 너트가 들리고(같은 색은 한꺼번에), 다른 볼트를 누르면 옮겨져요.<br>빈 볼트이거나 맨 위 색이 같아야 들어가요. 볼트 하나에 4개까지.<br>U 되돌리기 · H 힌트 · Esc 메뉴</p>
  `, () => { $("bPlay").onclick = () => startLevel(next); $("bLevels").onclick = levelMenu; });
}
function levelMenu() {
  G.mode = "menu"; $("tools").hidden = true;
  const chaps = GUIDES.map((g, ci) => {
    const from = ci * PER_CH, to = Math.min(LEVELS.length, from + PER_CH);
    let sum = 0, done = 0;
    for (let i = from; i < to; i++) if (SAVE.stars[i]) { sum += SAVE.stars[i]; done++; }
    const btns = [];
    for (let i = from; i < to; i++) {
      const locked = i > SAVE.unlocked, st = SAVE.stars[i] || 0;
      btns.push(`<button data-i="${i}" ${locked ? "disabled" : ""} class="${st ? "done" : ""}${i === SAVE.unlocked ? " next" : ""}">${i + 1}<small>${st ? "★".repeat(st) : "&nbsp;"}</small></button>`);
    }
    return `<div class="chap"><div class="head"><img src="assets/${g.id}.png" alt=""><div><b>${ci + 1}장 · ${g.name} 「${g.title}」</b><small>${from + 1}~${to}단계 · ${LEVELS[from].b.filter((b) => b.length).length}~${LEVELS[to - 1].b.filter((b) => b.length).length}색</small></div><span class="sum">${done}/${to - from} · ★${sum}</span></div><div class="lv">${btns.join("")}</div></div>`;
  }).join("");
  showScreen(`<h2>단계 고르기</h2><p class="how">별은 목표 수 안 ★★★ · 1.5배 안 ★★ · 클리어 ★</p><div class="chapters">${chaps}</div><button class="ghost" id="bTitle">처음 화면</button>`, () => {
    $("screen").querySelector(".chapters").onclick = (e) => { const b = e.target.closest("button[data-i]"); if (b && !b.disabled) startLevel(Number(b.dataset.i)); };
    $("bTitle").onclick = title;
  });
}
function pauseMenu() {
  if (G.mode !== "play") return;
  G.mode = "paused";
  showScreen(`<h2>${G.level + 1}단계</h2><p>${G.moves}수 · 목표 ${LEVELS[G.level].p}수</p>
    <button class="big" id="bResume">계속하기</button><button class="ghost" id="bRetry">다시 하기</button><button class="ghost" id="bLevels">단계 고르기</button><button class="ghost" id="bSound">소리 ${SAVE.sound ? "끄기" : "켜기"}</button>`, () => {
    $("bResume").onclick = () => { G.mode = "play"; $("screen").hidden = true; };
    $("bRetry").onclick = () => startLevel(G.level);
    $("bLevels").onclick = levelMenu;
    $("bSound").onclick = () => { SAVE.sound = !SAVE.sound; save(); hud(); $("bSound").textContent = `소리 ${SAVE.sound ? "끄기" : "켜기"}`; };
  });
}

// ---------------------------------------------------------------- 자동 진행(개발·시험용 #auto)
function autoPlay() {
  const path = solve(G.st, CAP, 300000);
  if (!path) { toast("자동: 풀이 없음"); return; }
  let k = 0;
  const tick = () => {
    if (G.mode !== "play" || k >= path.length) return;
    if (G.busy) { setTimeout(tick, 60); return; }
    const [from, to] = path[k++];
    G.sel = from; place();
    setTimeout(() => { if (G.mode === "play") move(from, to); setTimeout(tick, 120); }, 140);
  };
  setTimeout(tick, 300);
}

// ---------------------------------------------------------------- 입력·크기
function resize() {
  const bw = $("boardWrap"), r = bw.getBoundingClientRect();
  const s = Math.min(r.width / BW, r.height / BH);
  const b = $("board");
  b.style.transform = `scale(${s})`;
  b.style.left = (r.width - BW * s) / 2 + "px"; b.style.top = (r.height - BH * s) / 2 + "px";
}
$("board").addEventListener("pointerdown", (e) => {
  // 2026-10-22: 너트 위를 눌러도 되게 — 요소가 아니라 판 좌표로 볼트를 찾는다
  const r = $("board").getBoundingClientRect(), x = (e.clientX - r.left) / (r.width / BW), y = (e.clientY - r.top) / (r.height / BH);
  const b = L.pos.findIndex((p) => x >= p.x && x < p.x + L.slotW && y >= p.y && y < p.y + L.rowH);
  if (b >= 0) { e.preventDefault(); tapBolt(b); }
});
$("btnUndo").onclick = undo; $("btnHint").onclick = hint; $("btnExtra").onclick = extraBolt;
$("btnMenu").onclick = pauseMenu;
$("btnSound").onclick = () => { SAVE.sound = !SAVE.sound; save(); hud(); };
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { if (G.mode === "play") pauseMenu(); else if (G.mode === "paused") { G.mode = "play"; $("screen").hidden = true; } }
  if (G.mode !== "play") return;
  if (e.key === "u" || e.key === "U") undo();
  if (e.key === "h" || e.key === "H") hint();
});
window.addEventListener("resize", resize);

(function init() {
  load();
  if (HASH.unlock) SAVE.unlocked = LEVELS.length - 1;
  resize();
  if (HASH.level) startLevel(Math.max(0, Math.min(LEVELS.length - 1, Number(HASH.level) - 1)));
  else if (HASH.menu) levelMenu();
  else title();
  requestAnimationFrame(resize);
  // 시험용
  window.__nuts = { G, LEVELS, startLevel, move, solve };
})();
