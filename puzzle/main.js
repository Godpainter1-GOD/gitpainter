// 퓨어데이 퍼즐 — 회차별 장면 직소 퍼즐. 쉬움 20·30조각, 고급 50·70조각 (2026-10-21 대표님 요청)
import { EPISODES } from "./episodes.js";

const $ = (id) => document.getElementById(id);
const SAVE_KEY = "pureday-puzzle-v1";
const GRID = { 20: [4, 5], 30: [5, 6], 50: [5, 10], 70: [7, 10] };   // 조각 수 → [가로, 세로] (그림이 9:16 세로라 세로를 더 잘게)
const S = { season: "시즌1", ep: null, scene: 1, n: 20, sound: true, rec: {} };   // rec["s1-03/2/30"] = 가장 빠른 초

function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify({ sound: S.sound, rec: S.rec, n: S.n })); } catch (e) { /* 저장 안 됨 */ } }
function load() { try { const s = JSON.parse(localStorage.getItem(SAVE_KEY) || "{}"); S.sound = s.sound !== false; S.rec = s.rec || {}; S.n = s.n || 20; } catch (e) { /* 저장 안 됨 */ } }
const fmt = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;

// ---------------------------------------------------------------- 소리
let actx = null;
function tone(freqs, dur = 0.06, vol = 0.06) {
  if (!S.sound) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    let t = actx.currentTime;
    for (const f of freqs) {
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = "triangle"; o.frequency.value = f;
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g).connect(actx.destination); o.start(t); o.stop(t + dur); t += dur * 0.8;
    }
  } catch (e) { /* 소리 없음 */ }
}

// ---------------------------------------------------------------- 회차 고르기
function drawHome() {
  document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("on", b.dataset.s === S.season));
  $("epGrid").innerHTML = EPISODES.filter((e) => e.season === S.season).map((e) => {
    const done = [1, 2, 3, 4].filter((k) => Object.keys(S.rec).some((r) => r.startsWith(`${e.key}/${k}/`))).length;
    return `<button class="ep" data-key="${e.key}"><img src="assets/eps/${e.key}/t1.jpg" alt="" loading="lazy">
      <span><b>${e.label}</b>${e.title}<br><i class="stars">${"★".repeat(done)}${"☆".repeat(4 - done)}</i></span></button>`;
  }).join("");
}
$("tabs").onclick = (ev) => { const b = ev.target.closest("button"); if (b) { S.season = b.dataset.s; drawHome(); } };
$("epGrid").onclick = (ev) => { const b = ev.target.closest(".ep"); if (b) openPick(b.dataset.key); };
function openPick(key) {
  S.ep = EPISODES.find((e) => e.key === key);
  $("pickTitle").textContent = `${S.ep.season} ${S.ep.label} · ${S.ep.title}`;
  drawPick();
  $("pick").hidden = false;
}
function drawPick() {
  $("scenes").innerHTML = [1, 2, 3, 4].map((k) => {
    const best = Object.entries(S.rec).filter(([r]) => r.startsWith(`${S.ep.key}/${k}/`));
    return `<button data-k="${k}" class="${k === S.scene ? "on" : ""}"><img src="assets/eps/${S.ep.key}/t${k}.jpg" alt="장면 ${k}">${best.length ? '<span class="ok">완성</span>' : ""}</button>`;
  }).join("");
  document.querySelectorAll("#levels button").forEach((b) => b.classList.toggle("on", Number(b.dataset.n) === S.n));
  const rec = S.rec[`${S.ep.key}/${S.scene}/${S.n}`];
  $("btnGo").textContent = rec ? `퍼즐 시작 (최고 기록 ${fmt(rec)})` : "퍼즐 시작";
}
$("scenes").onclick = (ev) => { const b = ev.target.closest("button"); if (b) { S.scene = Number(b.dataset.k); drawPick(); } };
$("levels").onclick = (ev) => { const b = ev.target.closest("button"); if (b) { S.n = Number(b.dataset.n); save(); drawPick(); } };
$("btnPickClose").onclick = () => { $("pick").hidden = true; };
$("btnGo").onclick = () => { $("pick").hidden = true; startPuzzle(); };
$("btnSound").onclick = () => { S.sound = !S.sound; $("btnSound").textContent = S.sound ? "🔊" : "🔇"; save(); };

// ---------------------------------------------------------------- 퍼즐
const cv = $("cv"), ctx = cv.getContext("2d");
const Z = { img: null, cols: 4, rows: 5, pieces: [], board: null, pw: 0, ph: 0, m: 0, t0: 0, placed: 0, ghost: false, edge: false, peek: 0, drag: null, done: false, dpr: 1, W: 0, H: 0, hints: 0 };
let raf = 0;

function startPuzzle() {
  const [cols, rows] = GRID[S.n];
  Object.assign(Z, { cols, rows, pieces: [], placed: 0, ghost: false, edge: false, peek: 0, drag: null, done: false, hints: 0 });
  $("btnGhost").classList.remove("on"); $("btnEdge").classList.remove("on");
  $("home").hidden = true; $("play").hidden = false;
  $("playTitle").textContent = `${S.ep.label} ${S.ep.title} · 장면 ${S.scene} · ${S.n}조각`;
  const im = new Image();
  im.onload = () => {
    Z.img = im;
    // 이웃 조각이 맞물리는 방향(볼록 +1 / 오목 -1)을 정한다: h[r][c] = r 줄 조각의 아래쪽, v[r][c] = c 칸 조각의 오른쪽
    Z.h = Array.from({ length: rows }, () => Array.from({ length: cols }, () => (Math.random() < 0.5 ? 1 : -1)));
    Z.v = Array.from({ length: rows }, () => Array.from({ length: cols }, () => (Math.random() < 0.5 ? 1 : -1)));
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) Z.pieces.push({ r, c, fx: 0, fy: 0, placed: false, edge: r === 0 || c === 0 || r === rows - 1 || c === cols - 1 });
    layout(true);
    Z.t0 = performance.now();
    cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);
  };
  im.src = `assets/eps/${S.ep.key}/${S.scene}.jpg`;
}

// 화면 크기에 맞춰 판·조각 크기를 정하고, 흩어 놓을 자리(fx, fy: 화면에 대한 비율)를 고른다
function layout(scatter) {
  const r = cv.getBoundingClientRect();
  Z.dpr = Math.min(2, window.devicePixelRatio || 1);
  Z.W = r.width; Z.H = r.height;
  cv.width = Math.round(Z.W * Z.dpr); cv.height = Math.round(Z.H * Z.dpr);
  const land = Z.W / Z.H > 0.95;
  let bh = land ? Z.H * 0.9 : Math.min(Z.H * 0.52, (Z.W * 0.9) * 16 / 9);   // 세로 화면: 아래에 조각 둘 자리를 넉넉히
  let bw = bh * 9 / 16;
  if (!land && bw > Z.W * 0.9) { bw = Z.W * 0.9; bh = bw * 16 / 9; }
  const bx = land ? Math.max(16, Z.W * 0.32 - bw / 2) : (Z.W - bw) / 2;
  const by = land ? (Z.H - bh) / 2 : 12;
  Z.board = { x: bx, y: by, w: bw, h: bh };
  Z.pw = bw / Z.cols; Z.ph = bh / Z.rows; Z.S = Math.min(Z.pw, Z.ph); Z.m = Z.S * 0.3;
  for (const p of Z.pieces) p.cv = renderPiece(p);
  if (scatter) for (const p of Z.pieces) placeLoose(p, land);
}
function placeLoose(p, land) {
  // 판을 피해 남은 자리에 흩는다. 세로 화면이면 아래쪽 + 판 양옆 빈자리, 가로 화면이면 오른쪽. 화면 밖으로 나가지 않게
  const b = Z.board;
  let x, y;
  if (land) { x = rand(b.x + b.w + 10, Z.W - Z.pw - 6); y = rand(6, Z.H - Z.ph - 6); }
  else {
    const side = (b.x - Z.pw - 12) > 0 && Math.random() < 0.25;   // 판 옆에 한 조각 들어갈 틈이 있으면 가끔 그리로
    if (side) { x = Math.random() < 0.5 ? rand(4, b.x - Z.pw - 8) : rand(b.x + b.w + 8, Z.W - Z.pw - 4); y = rand(b.y, b.y + b.h - Z.ph); }
    else { x = rand(6, Z.W - Z.pw - 6); y = rand(b.y + b.h + 8, Z.H - Z.ph - 6); }
  }
  if (!(x > 0)) x = rand(6, Math.max(7, Z.W - Z.pw - 6));
  if (!(y > 0)) y = rand(6, Math.max(7, Z.H - Z.ph - 6));
  p.fx = x / Z.W; p.fy = y / Z.H;
}
const rand = (a, b) => a + Math.random() * Math.max(0, b - a);
const sides = (p) => ({
  top: p.r === 0 ? 0 : -Z.h[p.r - 1][p.c], bottom: p.r === Z.rows - 1 ? 0 : Z.h[p.r][p.c],
  left: p.c === 0 ? 0 : -Z.v[p.r][p.c - 1], right: p.c === Z.cols - 1 ? 0 : Z.v[p.r][p.c],
});
// 조각 테두리 (조각 왼쪽 위 = (0,0), 시계 방향). s = +1 볼록 / -1 오목 / 0 평평
function piecePath(p) {
  const { pw, ph, S: L } = Z, sd = sides(p), path = new Path2D();
  const edge = (x0, y0, x1, y1, s) => {
    if (!s) { path.lineTo(x1, y1); return; }
    const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy), nx = (dy / len) * s, ny = (-dx / len) * s;
    const P = (u, v) => [x0 + dx * u + nx * v * L, y0 + dy * u + ny * v * L];
    path.lineTo(...P(0.34, 0));
    path.bezierCurveTo(...P(0.40, 0), ...P(0.43, 0.05), ...P(0.39, 0.11));
    path.bezierCurveTo(...P(0.33, 0.21), ...P(0.40, 0.27), ...P(0.50, 0.27));
    path.bezierCurveTo(...P(0.60, 0.27), ...P(0.67, 0.21), ...P(0.61, 0.11));
    path.bezierCurveTo(...P(0.57, 0.05), ...P(0.60, 0), ...P(0.66, 0));
    path.lineTo(x1, y1);
  };
  path.moveTo(0, 0);
  edge(0, 0, pw, 0, sd.top); edge(pw, 0, pw, ph, sd.right); edge(pw, ph, 0, ph, sd.bottom); edge(0, ph, 0, 0, sd.left);
  path.closePath();
  p.path = path;
  return path;
}
function renderPiece(p) {
  const { pw, ph, m, dpr, board } = Z;
  const c = document.createElement("canvas");
  c.width = Math.ceil((pw + 2 * m) * dpr); c.height = Math.ceil((ph + 2 * m) * dpr);
  const g = c.getContext("2d");
  g.scale(dpr, dpr); g.translate(m, m);
  const path = piecePath(p);
  g.save(); g.clip(path);
  g.drawImage(Z.img, -p.c * pw, -p.r * ph, board.w, board.h);
  g.restore();
  g.lineWidth = 1.2; g.strokeStyle = "rgba(255,255,255,.55)"; g.stroke(path);
  g.lineWidth = 0.8; g.strokeStyle = "rgba(0,0,0,.35)"; g.translate(0.6, 0.6); g.stroke(path);
  return c;
}

// ---------------------------------------------------------------- 그리기
function loop(now) {
  draw(now);
  if (!Z.done) $("playStat").textContent = `${Z.placed} / ${Z.pieces.length} · ${fmt((now - Z.t0) / 1000)}`;
  raf = requestAnimationFrame(loop);
}
function draw(now) {
  const { dpr, board: b } = Z;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, Z.W, Z.H);
  // 판
  ctx.fillStyle = "#1b1a22"; ctx.fillRect(b.x - 4, b.y - 4, b.w + 8, b.h + 8);
  ctx.strokeStyle = "#5b5768"; ctx.lineWidth = 1; ctx.strokeRect(b.x - 4.5, b.y - 4.5, b.w + 9, b.h + 9);
  if (Z.ghost || Z.peek > now) { ctx.globalAlpha = Z.peek > now ? 1 : 0.28; ctx.drawImage(Z.img, b.x, b.y, b.w, b.h); ctx.globalAlpha = 1; }
  else {
    ctx.strokeStyle = "rgba(255,255,255,.06)";
    for (let c = 1; c < Z.cols; c++) { ctx.beginPath(); ctx.moveTo(b.x + c * Z.pw, b.y); ctx.lineTo(b.x + c * Z.pw, b.y + b.h); ctx.stroke(); }
    for (let r = 1; r < Z.rows; r++) { ctx.beginPath(); ctx.moveTo(b.x, b.y + r * Z.ph); ctx.lineTo(b.x + b.w, b.y + r * Z.ph); ctx.stroke(); }
  }
  if (Z.peek > now) return;
  // 조각: 맞춘 것 먼저, 그다음 흩어진 것(배열 순서 = 위아래 순서)
  for (const p of Z.pieces) if (p.placed) drawPiece(p);
  for (const p of Z.pieces) if (!p.placed && (!Z.edge || p.edge || p === Z.drag?.p)) drawPiece(p, p === Z.drag?.p);
  if (Z.hintP && Z.hintT > now) {
    const p = Z.hintP;
    ctx.strokeStyle = "#ffd34a"; ctx.lineWidth = 3;
    ctx.strokeRect(b.x + p.c * Z.pw, b.y + p.r * Z.ph, Z.pw, Z.ph);
  }
}
function drawPiece(p, lifted) {
  const x = p.fx * Z.W - Z.m, y = p.fy * Z.H - Z.m, w = p.cv.width / Z.dpr, h = p.cv.height / Z.dpr;
  if (lifted) { ctx.save(); ctx.shadowColor = "rgba(0,0,0,.55)"; ctx.shadowBlur = 14; ctx.shadowOffsetY = 6; }
  else if (!p.placed) { ctx.save(); ctx.shadowColor = "rgba(0,0,0,.4)"; ctx.shadowBlur = 4; ctx.shadowOffsetY = 2; }
  ctx.drawImage(p.cv, x, y, w, h);
  if (lifted || !p.placed) ctx.restore();
}

// ---------------------------------------------------------------- 끌기 · 맞추기
const hitCtx = document.createElement("canvas").getContext("2d");
function pieceAt(x, y) {
  for (let i = Z.pieces.length - 1; i >= 0; i--) {
    const p = Z.pieces[i];
    if (p.placed || (Z.edge && !p.edge)) continue;
    const lx = x - p.fx * Z.W, ly = y - p.fy * Z.H;
    if (lx < -Z.m || ly < -Z.m || lx > Z.pw + Z.m || ly > Z.ph + Z.m) continue;
    if (hitCtx.isPointInPath(p.path, lx, ly)) return p;
  }
  return null;
}
function pos(ev) { const r = cv.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; }
cv.addEventListener("pointerdown", (ev) => {
  if (Z.done || !Z.img) return;
  const [x, y] = pos(ev);
  const p = pieceAt(x, y);
  if (!p) return;
  Z.pieces.splice(Z.pieces.indexOf(p), 1); Z.pieces.push(p);   // 맨 위로
  Z.drag = { p, dx: x - p.fx * Z.W, dy: y - p.fy * Z.H, id: ev.pointerId };
  cv.setPointerCapture(ev.pointerId);
  tone([660], 0.03, 0.03);
});
cv.addEventListener("pointermove", (ev) => {
  const d = Z.drag; if (!d || d.id !== ev.pointerId) return;
  const [x, y] = pos(ev);
  d.p.fx = Math.max(-0.05, Math.min(1.02, (x - d.dx) / Z.W)); d.p.fy = Math.max(-0.05, Math.min(1.02, (y - d.dy) / Z.H));
});
const drop = (ev) => {
  const d = Z.drag; if (!d || d.id !== ev.pointerId) return;
  Z.drag = null;
  const p = d.p, tx = Z.board.x + p.c * Z.pw, ty = Z.board.y + p.r * Z.ph;
  if (Math.hypot(p.fx * Z.W - tx, p.fy * Z.H - ty) < Z.S * 0.32) snap(p);
};
cv.addEventListener("pointerup", drop); cv.addEventListener("pointercancel", drop);
function snap(p) {
  p.fx = (Z.board.x + p.c * Z.pw) / Z.W; p.fy = (Z.board.y + p.r * Z.ph) / Z.H; p.placed = true;
  Z.placed++; tone([880, 1175], 0.05);
  if (Z.placed === Z.pieces.length) finish();
}
function finish() {
  Z.done = true;
  const sec = (performance.now() - Z.t0) / 1000;
  const key = `${S.ep.key}/${S.scene}/${S.n}`, prev = S.rec[key];
  const best = !prev || sec < prev;
  if (best) S.rec[key] = Math.round(sec);
  save();
  $("playStat").textContent = `${Z.pieces.length} / ${Z.pieces.length} · ${fmt(sec)} 완성!`;
  tone([523, 659, 784, 1046], 0.13, 0.08);
  setTimeout(() => {
    $("doneImg").src = `assets/eps/${S.ep.key}/${S.scene}.jpg`;
    $("doneText").textContent = `${S.ep.label} 「${S.ep.title}」 장면 ${S.scene} · ${S.n}조각을 ${fmt(sec)}에 맞췄어요!` + (best ? (prev ? ` 최고 기록 경신! (전 ${fmt(prev)})` : " 첫 완성 기록!") : ` (최고 기록 ${fmt(prev)})`) + (Z.hints ? ` · 힌트 ${Z.hints}번` : "");
    $("btnNextScene").textContent = S.scene < 4 ? "다음 장면 ▶" : "다음 회차 ▶";
    $("done").hidden = false;
  }, 700);
}

// ---------------------------------------------------------------- 도구
$("btnGhost").onclick = () => { Z.ghost = !Z.ghost; $("btnGhost").classList.toggle("on", Z.ghost); };
$("btnEdge").onclick = () => { Z.edge = !Z.edge; $("btnEdge").classList.toggle("on", Z.edge); };
$("btnPeek").onclick = () => { Z.peek = performance.now() + 1800; };
$("btnHint").onclick = () => {   // 흩어진 조각 하나를 제자리에 놓아 준다 (테두리 모드면 테두리 조각부터)
  if (Z.done) return;
  const loose = Z.pieces.filter((p) => !p.placed && (!Z.edge || p.edge));
  if (!loose.length) return;
  const p = loose[Math.floor(Math.random() * loose.length)];
  Z.hints++; Z.hintP = p; Z.hintT = performance.now() + 1500;
  snap(p);
};
$("btnBack").onclick = () => { cancelAnimationFrame(raf); $("play").hidden = true; $("home").hidden = false; drawHome(); };
$("btnNextScene").onclick = () => {
  $("done").hidden = true;
  if (S.scene < 4) S.scene++;
  else { const i = EPISODES.indexOf(S.ep); S.ep = EPISODES[(i + 1) % EPISODES.length]; S.scene = 1; S.season = S.ep.season; }
  startPuzzle();
};
$("btnDoneHome").onclick = () => { $("done").hidden = true; $("btnBack").click(); };
addEventListener("resize", () => {
  if ($("play").hidden || !Z.img) return;
  // 맞춘 조각은 판 위 자리로, 흩어진 조각은 비율 그대로 둔다
  layout(false);
  for (const p of Z.pieces) if (p.placed) { p.fx = (Z.board.x + p.c * Z.pw) / Z.W; p.fy = (Z.board.y + p.r * Z.ph) / Z.H; }
});

// ---------------------------------------------------------------- 시작
load();
$("btnSound").textContent = S.sound ? "🔊" : "🔇";
drawHome();
// 개발용: #play=s1-03/2/50 → 바로 그 퍼즐, &solve=N → N조각 미리 맞춤
const hp = new URLSearchParams(location.hash.slice(1));
if (hp.has("play")) {
  const [key, sc, n] = hp.get("play").split("/");
  S.ep = EPISODES.find((e) => e.key === key) || EPISODES[0]; S.scene = Number(sc) || 1; S.n = Number(n) || 20;
  startPuzzle();
  if (hp.has("solve")) setTimeout(() => { for (let k = 0; k < Number(hp.get("solve")); k++) $("btnHint").click(); Z.hintT = 0; }, 600);
}
