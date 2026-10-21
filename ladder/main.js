// 퓨어데이 사다리 — 최대 20명, 사다리 가로줄은 매번 무작위, 당첨된 사람의 길은 빨간 선 (2026-10-21 대표님 요청)
const $ = (id) => document.getElementById(id);
const SAVE_KEY = "pureday-ladder-v1";
const SVGNS = "http://www.w3.org/2000/svg";
const PUREDAY = ["조아름", "조하임", "조성민 박사", "이마리", "김미아", "리웨이", "하루카", "디에고", "콰메", "라일라",
  "노아", "캐털린", "아마라", "루시아", "요나스", "마이클", "아퀼라", "페이", "타미", "루아"];
const S = { n: 6, names: [], wins: 1, winText: "당첨", loseText: "꽝", sound: true, res: null };   // res[칸] = { t: 글자, w: 당첨? }
let L = null;   // 지금 사다리 { n, rows, rungs[row] = Set(왼쪽 기둥 번호), results[slot] = bool(당첨), traced: Set }

function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* 저장 안 됨 */ } }
function load() { try { Object.assign(S, JSON.parse(localStorage.getItem(SAVE_KEY) || "{}")); } catch (e) { /* 저장 안 됨 */ } }
const pick = (a) => a[Math.floor(Math.random() * a.length)];
function say(t) { $("bubbleText").textContent = t; }

// ---------------------------------------------------------------- 소리
let actx = null;
function tone(freqs, dur = 0.06, vol = 0.05) {
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

// ---------------------------------------------------------------- 준비 화면
function nameFor(i) { return S.names[i] || `참가자 ${i + 1}`; }
function drawSetup() {
  $("count").value = S.n; $("countVal").textContent = S.n;
  S.wins = Math.max(1, Math.min(S.n - 1, S.wins)); $("winVal").textContent = S.wins;
  $("winText").value = S.winText; $("loseText").value = S.loseText;
  // 결과 칸 수를 인원에 맞춘다 (처음이면 '빠르게 채우기'대로, 늘어난 칸은 꽝)
  if (!Array.isArray(S.res)) fillResults(true);
  while (S.res.length < S.n) S.res.push({ t: S.loseText, w: false });
  S.res.length = S.n;
  drawResults();
  const box = $("names"), have = box.querySelectorAll("input").length;
  if (have !== S.n) {
    box.innerHTML = Array.from({ length: S.n }, (_, i) =>
      `<input type="text" maxlength="10" data-i="${i}" value="${(S.names[i] || "").replace(/"/g, "&quot;")}" placeholder="참가자 ${i + 1}" aria-label="${i + 1}번 참가자 이름">`).join("");
  }
}
$("count").oninput = () => { S.n = Number($("count").value); drawSetup(); save(); };
document.querySelectorAll(".stepper [data-d]").forEach((b) => b.onclick = () => { S.n = Math.max(2, Math.min(20, S.n + Number(b.dataset.d))); drawSetup(); save(); });
document.querySelectorAll(".stepper [data-w]").forEach((b) => b.onclick = () => { S.wins = Math.max(1, Math.min(S.n - 1, S.wins + Number(b.dataset.w))); drawSetup(); save(); });
function fillResults(shuffle = true) {
  S.res = Array.from({ length: S.n }, (_, i) => (i < S.wins ? { t: S.winText, w: true } : { t: S.loseText, w: false }));
  if (shuffle) S.res.sort(() => Math.random() - 0.5);
}
function drawResults() {
  $("results").innerHTML = S.res.map((r, i) => `<div class="res ${r.w ? "win" : ""}">
    <input type="text" maxlength="10" data-r="${i}" value="${r.t.replace(/"/g, "&quot;")}" aria-label="${i + 1}번째 결과 칸 글자">
    <button type="button" data-t="${i}" aria-pressed="${r.w}" title="눌러서 🎉당첨 / 일반 바꾸기">${r.w ? "🎉당첨" : "일반"}</button></div>`).join("");
}
$("results").oninput = (e) => { const i = Number(e.target.dataset.r); if (!isNaN(i)) { S.res[i].t = e.target.value.trim(); save(); } };
$("results").onclick = (e) => {
  const b = e.target.closest("button[data-t]"); if (!b) return;
  const r = S.res[Number(b.dataset.t)];
  r.w = !r.w;
  // 글자를 안 바꾼 칸이면 당첨/꽝 글자도 따라 바꿔 준다
  if (r.w && r.t === S.loseText) r.t = S.winText; else if (!r.w && r.t === S.winText) r.t = S.loseText;
  save(); drawResults();
};
// 보상 목록 한 번에: 줄바꿈·쉼표로 나눈 순서대로 칸을 채운다. 앞에 * 가 있으면 당첨 칸
$("btnBulk").onclick = () => {
  const items = $("bulk").value.split(/[\n,，]+/).map((x) => x.trim()).filter(Boolean);
  if (!items.length) { $("bulk").focus(); return; }
  if (items.length > S.n && items.length <= 20) { S.n = items.length; }   // 보상이 더 많으면 인원도 늘린다(최대 20)
  S.res = Array.from({ length: S.n }, (_, i) => {
    const it = items[i];
    if (!it) return S.res[i] || { t: S.loseText, w: false };
    const win = /^[*＊🎉]/.test(it);
    return { t: it.replace(/^[*＊🎉]+\s*/, "").slice(0, 10), w: win };
  });
  save(); $("names").innerHTML = ""; drawSetup();
};
$("btnFill").onclick = () => { fillResults(true); save(); drawResults(); };
$("btnShuffle").onclick = () => { S.res.sort(() => Math.random() - 0.5); save(); drawResults(); };
$("names").oninput = (e) => { const i = Number(e.target.dataset.i); S.names[i] = e.target.value.trim(); save(); };
$("winText").oninput = () => { S.winText = $("winText").value.trim() || "당첨"; save(); };
$("loseText").oninput = () => { S.loseText = $("loseText").value.trim() || "꽝"; save(); };
$("btnPureday").onclick = () => { S.names = PUREDAY.slice(0, 20); $("names").innerHTML = ""; drawSetup(); save(); };
$("btnNumber").onclick = () => { S.names = []; $("names").innerHTML = ""; drawSetup(); save(); };
$("btnSound").onclick = () => { S.sound = !S.sound; $("btnSound").textContent = S.sound ? "🔊" : "🔇"; save(); };

// ---------------------------------------------------------------- 사다리 만들기 (무작위)
function makeLadder(n) {
  const rows = Math.max(10, Math.min(18, n + 6));
  const rungs = Array.from({ length: rows }, () => new Set());
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < n - 1; c++) {
      // 한 줄에서 이웃한 가로줄이 붙어 있으면 길이 갈라지므로, 바로 왼쪽에 가로줄이 있으면 건너뛴다
      if (!rungs[r].has(c - 1) && Math.random() < 0.42) rungs[r].add(c);
    }
  }
  // 이웃한 두 기둥 사이에 가로줄이 하나도 없으면(거의 그대로 내려가면) 재미없으니 한두 개 넣어 준다
  for (let c = 0; c < n - 1; c++) {
    let cnt = rungs.reduce((s, set) => s + (set.has(c) ? 1 : 0), 0);
    for (let tries = 0; cnt < 2 && tries < 40; tries++) {
      const r = Math.floor(Math.random() * rows);
      if (!rungs[r].has(c) && !rungs[r].has(c - 1) && !rungs[r].has(c + 1)) { rungs[r].add(c); cnt++; }
    }
  }
  // 결과 칸은 준비 화면에서 고른 그대로 (글자 · 당첨 여부)
  const results = S.res.map((r) => !!r.w), labels = S.res.map((r) => r.t || (r.w ? S.winText : S.loseText));
  return { n, rows, rungs, results, labels, traced: new Map(), names: Array.from({ length: n }, (_, i) => nameFor(i)) };
}
// 출발 기둥 c 에서 내려가는 길: 지나는 점들과 도착 칸
function route(c) {
  const pts = [[c, -1]];
  for (let r = 0; r < L.rows; r++) {
    if (L.rungs[r].has(c)) { pts.push([c, r]); c += 1; pts.push([c, r]); }
    else if (L.rungs[r].has(c - 1)) { pts.push([c, r]); c -= 1; pts.push([c, r]); }
  }
  pts.push([c, L.rows]);
  return { pts, end: c };
}

// ---------------------------------------------------------------- 그리기 (SVG)
const G = {};
function el(tag, attrs, parent) {
  const e = document.createElementNS(SVGNS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}
function layout() {
  const wrap = $("boardScroll").clientWidth - 12;
  G.colW = Math.max(46, Math.min(110, wrap / L.n));   // 좁은 화면에서 20명이면 옆으로 밀어 볼 수 있게
  G.left = G.colW / 2; G.top = 58; G.rowH = 30; G.bottom = G.top + (L.rows + 1) * G.rowH;
  G.W = G.colW * L.n; G.H = G.bottom + 62;
}
const X = (c) => G.left + c * G.colW;
const Y = (r) => (r < 0 ? G.top : r >= L.rows ? G.bottom : G.top + (r + 1) * G.rowH);
function drawBoard() {
  layout();
  const svg = $("board");
  svg.innerHTML = "";
  svg.setAttribute("width", G.W); svg.setAttribute("height", G.H); svg.setAttribute("viewBox", `0 0 ${G.W} ${G.H}`);
  const g = el("g", {}, svg);
  for (let c = 0; c < L.n; c++) el("line", { class: "rail", x1: X(c), y1: G.top, x2: X(c), y2: G.bottom }, g);
  L.rungs.forEach((set, r) => set.forEach((c) => el("line", { class: "rung", x1: X(c), y1: Y(r), x2: X(c + 1), y2: Y(r) }, g)));
  G.paths = el("g", {}, svg);
  const bw = Math.min(G.colW - 6, 100);
  for (let c = 0; c < L.n; c++) {
    const nm = el("g", { class: "name", "data-c": c, role: "button", tabindex: 0, "aria-label": `${L.names[c]} 사다리 타기` }, svg);
    el("rect", { x: X(c) - bw / 2, y: 8, width: bw, height: 38, rx: 10 }, nm);
    const t = el("text", { x: X(c), y: 27 }, nm); t.textContent = fit(L.names[c], bw);
    const sl = el("g", { class: "slot", "data-s": c }, svg);
    el("rect", { x: X(c) - bw / 2, y: G.bottom + 8, width: bw, height: 44, rx: 10 }, sl);
    const r1 = el("text", { x: X(c), y: G.bottom + 25 }, sl); r1.textContent = "?";
    const r2 = el("text", { x: X(c), y: G.bottom + 42, class: "who" }, sl); r2.textContent = "";
  }
  for (const [c] of L.traced) showDone(c, false);
  markCursor();
}
function fit(s, w) { const max = Math.max(2, Math.floor(w / 12)); return s.length > max ? s.slice(0, max - 1) + "…" : s; }

// ---------------------------------------------------------------- 타기
let busy = false;
function pathD(pts) { return pts.map(([c, r], i) => `${i ? "L" : "M"}${X(c)},${Y(r)}`).join(" "); }
async function trace(c, fast = false) {
  if (L.traced.has(c)) return;
  const { pts, end } = route(c);
  const win = L.results[end];
  L.traced.set(c, end);
  const p = el("path", { class: "path run", d: pathD(pts), "data-c": c }, G.paths);
  const len = p.getTotalLength();
  const dur = fast ? 800 : Math.min(1700, 700 + len * 1.4);
  p.style.strokeDasharray = len; p.style.strokeDashoffset = len;
  // 기둥 안에서 보이게 가운데로 스크롤 (넓은 사다리)
  const sc = $("boardScroll"); if (!fast && sc.scrollWidth > sc.clientWidth) sc.scrollTo({ left: X(c) - sc.clientWidth / 2, behavior: "smooth" });
  tone([520], 0.04, 0.03);
  await p.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: dur, easing: "ease-in-out", fill: "forwards" }).finished;
  p.style.strokeDashoffset = 0;
  p.setAttribute("class", "path " + (win ? "win" : "lose"));
  if (win) G.paths.appendChild(p);   // 빨간 선을 위로
  showDone(c, true);
  if (win) { tone([523, 659, 784, 1046], 0.11, 0.07); say(`🎉 ${L.names[c]} — ${L.labels[end]}!`); }
  else { tone([330], 0.08, 0.04); say(`${L.names[c]} — ${L.labels[end]}`); }
}
function showDone(c, fresh) {
  const end = L.traced.get(c), win = L.results[end];
  const nm = $("board").querySelector(`.name[data-c="${c}"]`), sl = $("board").querySelector(`.slot[data-s="${end}"]`);
  nm.classList.add("done"); if (win) nm.classList.add("winner");
  sl.classList.add("open", win ? "win" : "lose");
  const [t1, t2] = sl.querySelectorAll("text");
  t1.textContent = fit(L.labels[end], Math.min(G.colW - 6, 100)); t2.textContent = fit(L.names[c], Math.min(G.colW - 6, 100));
  if (!fresh) {   // 다시 그릴 때(화면 크기 바뀜) 길도 다시
    const p = el("path", { class: "path " + (win ? "win" : "lose"), d: pathD(route(c).pts) }, G.paths);
    if (win) G.paths.appendChild(p);
  }
  updateButtons();
}
function updateButtons() {
  const left = L.n - L.traced.size;
  $("btnOne").disabled = busy || !left; $("btnAll").disabled = busy || !left;
  $("btnOne").textContent = left ? `다음 사람 ▶ (${left}명 남음)` : "모두 끝났어요";
  if (!left) showSummary();
}
function showSummary() {
  const rows = [...Array(L.n).keys()].map((c) => ({ c, end: L.traced.get(c) })).sort((a, b) => L.results[b.end] - L.results[a.end] || a.c - b.c);
  const winners = rows.filter((r) => L.results[r.end]).map((r) => `${L.names[r.c]}(${L.labels[r.end]})`);
  $("summary").innerHTML = `<h3>🎉 당첨: ${winners.join(", ") || "없음"}</h3><ul>${rows.map((r) =>
    `<li class="${L.results[r.end] ? "w" : ""}">${L.names[r.c]} → ${L.labels[r.end]}</li>`).join("")}</ul>`;
  $("summary").hidden = false;
  say(winners.length ? `다 탔어요! 당첨: ${winners.join(", ")} — 빨간 선이 당첨된 길이에요.` : "다 탔어요! 이번엔 당첨 칸이 없었어요.");
}
async function run(list, fast) {
  if (busy) return;
  busy = true; updateButtons();
  try { await Promise.all(list.map((c, i) => new Promise((res) => setTimeout(() => trace(c, fast).then(res), fast ? i * 90 : 0)))); }
  finally { busy = false; updateButtons(); }
}
$("board").addEventListener("click", (e) => { const nm = e.target.closest(".name"); if (nm && !busy) run([Number(nm.dataset.c)], false); });
$("board").addEventListener("keydown", (e) => { const nm = e.target.closest(".name"); if (nm && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); if (!busy) run([Number(nm.dataset.c)], false); } });
$("btnOne").onclick = () => { const c = [...Array(L.n).keys()].find((i) => !L.traced.has(i)); if (c != null) run([c], false); };
$("btnAll").onclick = () => run([...Array(L.n).keys()].filter((i) => !L.traced.has(i)), true);

// ---------------------------------------------------------------- 화면 전환
function startLadder() {
  L = makeLadder(S.n);
  $("setup").hidden = true; $("play").hidden = false; $("summary").hidden = true;
  drawBoard(); updateButtons();
  say(pick(["이름을 누르면 그 사람의 사다리를 타요!", `당첨 칸은 ${S.res.filter((r) => r.w).length}개! 누가 될까요?`, "사다리는 방금 무작위로 새로 만들었어요."]));
  tone([660, 880], 0.06);
}
$("btnMake").onclick = () => { S.names = [...$("names").querySelectorAll("input")].map((i) => i.value.trim()); save(); startLadder(); };
$("btnRemake").onclick = () => { if (!busy) startLadder(); };
$("btnBack").onclick = () => { if (busy) return; $("play").hidden = true; $("setup").hidden = false; drawSetup(); };
let rt = 0;
addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { if (L && !$("play").hidden && !busy) drawBoard(); }, 150); });

load();
$("btnSound").textContent = S.sound ? "🔊" : "🔇";
drawSetup();
// 개발용: #demo=20 → 20명 사다리 바로 만들고 모두 타기
const hp = new URLSearchParams(location.hash.slice(1));
if (hp.has("demo")) { S.n = Number(hp.get("demo")) || 20; S.wins = Number(hp.get("wins")) || 3; S.names = PUREDAY.slice(0, 20); fillResults(true); startLadder(); if (!hp.has("still")) setTimeout(() => $("btnAll").click(), 300); }

// ---------------------------------------------------------------- 키보드 (2026-10-21 대표님: "마우스로 하니까 너무 어려워요 · 키 설정 옵션")
// 동작마다 키를 바꿀 수 있다. 설정은 localStorage 에 저장
const ACTIONS = [
  ["prev", "← 왼쪽 이름 고르기", "ArrowLeft"],
  ["next", "→ 오른쪽 이름 고르기", "ArrowRight"],
  ["go", "고른 이름 타기 · 사다리 만들기", "Enter"],
  ["one", "다음 사람 타기", "Space"],
  ["all", "한꺼번에 모두", "KeyA"],
  ["remake", "사다리 새로 만들기", "KeyR"],
  ["back", "처음으로", "Escape"],
  ["more", "참가 인원 +1 (준비 화면)", "ArrowUp"],
  ["less", "참가 인원 −1 (준비 화면)", "ArrowDown"],
];
const KEY_SAVE = "pureday-ladder-keys-v1";
let KEYS = Object.fromEntries(ACTIONS.map(([a, , k]) => [a, k]));
try { Object.assign(KEYS, JSON.parse(localStorage.getItem(KEY_SAVE) || "{}")); } catch (e) { /* 저장 안 됨 */ }
const saveKeys = () => { try { localStorage.setItem(KEY_SAVE, JSON.stringify(KEYS)); } catch (e) { /* 저장 안 됨 */ } };
function keyLabel(code) {
  const map = { ArrowLeft: "←", ArrowRight: "→", ArrowUp: "↑", ArrowDown: "↓", Enter: "Enter", Space: "Space", Escape: "Esc",
    Backspace: "⌫", Tab: "Tab", ShiftLeft: "Shift", ShiftRight: "Shift(오)", ControlLeft: "Ctrl", AltLeft: "Alt" };
  if (map[code]) return map[code];
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad")) return "숫자판 " + code.slice(6);
  return code;
}
let cursor = 0;
function markCursor() {
  if (!L) return;
  cursor = Math.max(0, Math.min(L.n - 1, cursor));
  document.querySelectorAll("#board .name").forEach((n) => n.classList.toggle("sel", Number(n.dataset.c) === cursor));
  const sc = $("boardScroll");
  if (sc.scrollWidth > sc.clientWidth) { const x = X(cursor); if (x < sc.scrollLeft + 40 || x > sc.scrollLeft + sc.clientWidth - 40) sc.scrollTo({ left: x - sc.clientWidth / 2, behavior: "smooth" }); }
}
function moveCursor(d) {
  if (!L) return;
  // 아직 안 탄 이름으로 건너뛰며 움직인다 (모두 탔으면 그냥 한 칸씩)
  const left = [...Array(L.n).keys()].filter((i) => !L.traced.has(i));
  let c = cursor;
  for (let k = 0; k < L.n; k++) { c = (c + d + L.n) % L.n; if (!left.length || left.includes(c)) break; }
  cursor = c; markCursor(); tone([700], 0.025, 0.02);
  say(`${L.names[cursor]} — ${keyLabel(KEYS.go)} 키를 누르면 타요!`);
}
function showHints() {
  const k = (a) => `<kbd>${keyLabel(KEYS[a])}</kbd>`;
  $("btnOne").querySelector("kbd")?.remove();   // 이미 붙은 키 표시는 떼고 다시 붙인다
  $("btnOne").innerHTML = $("btnOne").textContent.trim() + k("one");
  $("btnAll").innerHTML = "한꺼번에 모두" + k("all");
  $("btnRemake").innerHTML = "🔀 사다리 새로 만들기" + k("remake");
  $("btnBack").innerHTML = "처음으로" + k("back");
  $("btnMake").innerHTML = "사다리 만들기" + k("go");
  $("keyHint").innerHTML = `키보드: ${k("prev")}${k("next")} 이름 고르기 · ${k("go")} 고른 이름 타기 · ⌨ 버튼에서 키를 바꿀 수 있어요`;
}
// updateButtons 가 글자를 바꾸므로, 그 뒤에 키 표시를 다시 붙인다
const _updateButtons = updateButtons;
updateButtons = function () { _updateButtons(); showHints(); };   // eslint-disable-line no-func-assign

let waiting = null;   // 키 설정에서 새 키를 기다리는 동작
function drawKeyList() {
  $("keyList").innerHTML = ACTIONS.map(([a, label]) =>
    `<div><span>${label}</span><button data-a="${a}" class="${waiting === a ? "wait" : ""}">${waiting === a ? "키를 누르세요…" : keyLabel(KEYS[a])}</button></div>`).join("");
}
$("btnKeys").onclick = () => { waiting = null; drawKeyList(); $("keysModal").hidden = false; };
$("keysClose").onclick = () => { waiting = null; $("keysModal").hidden = true; showHints(); };
$("keysReset").onclick = () => { KEYS = Object.fromEntries(ACTIONS.map(([a, , k]) => [a, k])); saveKeys(); waiting = null; drawKeyList(); showHints(); };
$("keyList").onclick = (e) => { const b = e.target.closest("button"); if (b) { waiting = b.dataset.a; drawKeyList(); } };

let pendingAct = null;
function doAct(act) {
  if (act === "go") { if (L && !L.traced.has(cursor)) run([cursor], false).then(() => moveCursor(1)); }
  else if (act === "one") $("btnOne").click();
  else if (act === "all") $("btnAll").click();
  else if (act === "remake") { $("btnRemake").click(); cursor = 0; markCursor(); }
  else if (act === "back") $("btnBack").click();
}
setInterval(() => { if (pendingAct && !busy) { const a = pendingAct; pendingAct = null; doAct(a); } }, 80);
addEventListener("keydown", (e) => {
  // 1) 키 설정 중: 누른 키를 그 동작에 (다른 동작이 쓰던 키면 서로 바꾼다)
  if (!$("keysModal").hidden) {
    if (!waiting) { if (e.code === "Escape") $("keysClose").click(); return; }
    e.preventDefault();
    const other = Object.keys(KEYS).find((a) => a !== waiting && KEYS[a] === e.code);
    if (other) KEYS[other] = KEYS[waiting];
    KEYS[waiting] = e.code; waiting = null; saveKeys(); drawKeyList(); showHints();
    tone([880], 0.05, 0.04);
    return;
  }
  const act = Object.keys(KEYS).find((a) => KEYS[a] === e.code);
  if (!act || e.repeat) return;
  if (e.target.tagName === "TEXTAREA") return;   // 보상 목록 칸에서는 Enter = 줄바꿈
  const typing = e.target.tagName === "INPUT" && e.target.type === "text";
  // 2) 준비 화면
  if (!$("setup").hidden) {
    if (act === "go") { e.preventDefault(); $("btnMake").click(); }
    else if (!typing && act === "more") { e.preventDefault(); document.querySelector('.stepper [data-d="1"]').click(); }
    else if (!typing && act === "less") { e.preventDefault(); document.querySelector('.stepper [data-d="-1"]').click(); }
    return;
  }
  // 3) 사다리 화면
  if ($("play").hidden || typing) return;
  e.preventDefault();
  // 사다리가 내려가는 중에 누른 키는 버리지 않고, 끝나자마자 실행한다
  if (busy && !["prev", "next"].includes(act)) { pendingAct = act; return; }
  if (act === "prev") moveCursor(-1);
  else if (act === "next") moveCursor(1);
  else doAct(act);
});
showHints();
