// 퓨어데이 사다리 — 최대 20명, 사다리 가로줄은 매번 무작위, 당첨된 사람의 길은 빨간 선 (2026-10-21 대표님 요청)
const $ = (id) => document.getElementById(id);
const SAVE_KEY = "pureday-ladder-v1";
const SVGNS = "http://www.w3.org/2000/svg";
const PUREDAY = ["조아름", "조하임", "조성민 박사", "이마리", "김미아", "리웨이", "하루카", "디에고", "콰메", "라일라",
  "노아", "캐털린", "아마라", "루시아", "요나스", "마이클", "아퀼라", "페이", "타미", "루아"];
const S = { n: 6, names: [], wins: 1, winText: "당첨", loseText: "꽝", sound: true };
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
  const box = $("names"), have = box.querySelectorAll("input").length;
  if (have !== S.n) {
    box.innerHTML = Array.from({ length: S.n }, (_, i) =>
      `<input type="text" maxlength="10" data-i="${i}" value="${(S.names[i] || "").replace(/"/g, "&quot;")}" placeholder="참가자 ${i + 1}" aria-label="${i + 1}번 참가자 이름">`).join("");
  }
}
$("count").oninput = () => { S.n = Number($("count").value); drawSetup(); save(); };
document.querySelectorAll(".stepper [data-d]").forEach((b) => b.onclick = () => { S.n = Math.max(2, Math.min(20, S.n + Number(b.dataset.d))); drawSetup(); save(); });
document.querySelectorAll(".stepper [data-w]").forEach((b) => b.onclick = () => { S.wins = Math.max(1, Math.min(S.n - 1, S.wins + Number(b.dataset.w))); drawSetup(); save(); });
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
  const results = Array(n).fill(false);
  const slots = [...Array(n).keys()].sort(() => Math.random() - 0.5).slice(0, S.wins);
  for (const s of slots) results[s] = true;
  return { n, rows, rungs, results, traced: new Map(), names: Array.from({ length: n }, (_, i) => nameFor(i)) };
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
  const dur = fast ? 900 : Math.min(2600, 900 + len * 2.2);
  p.style.strokeDasharray = len; p.style.strokeDashoffset = len;
  // 기둥 안에서 보이게 가운데로 스크롤 (넓은 사다리)
  const sc = $("boardScroll"); if (!fast && sc.scrollWidth > sc.clientWidth) sc.scrollTo({ left: X(c) - sc.clientWidth / 2, behavior: "smooth" });
  tone([520], 0.04, 0.03);
  await p.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: dur, easing: "ease-in-out", fill: "forwards" }).finished;
  p.style.strokeDashoffset = 0;
  p.setAttribute("class", "path " + (win ? "win" : "lose"));
  if (win) G.paths.appendChild(p);   // 빨간 선을 위로
  showDone(c, true);
  if (win) { tone([523, 659, 784, 1046], 0.11, 0.07); say(`🎉 ${L.names[c]} — ${S.winText}!`); }
  else { tone([330], 0.08, 0.04); say(`${L.names[c]} — ${S.loseText}`); }
}
function showDone(c, fresh) {
  const end = L.traced.get(c), win = L.results[end];
  const nm = $("board").querySelector(`.name[data-c="${c}"]`), sl = $("board").querySelector(`.slot[data-s="${end}"]`);
  nm.classList.add("done"); if (win) nm.classList.add("winner");
  sl.classList.add("open", win ? "win" : "lose");
  const [t1, t2] = sl.querySelectorAll("text");
  t1.textContent = fit(win ? S.winText : S.loseText, Math.min(G.colW - 6, 100)); t2.textContent = fit(L.names[c], Math.min(G.colW - 6, 100));
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
  const winners = rows.filter((r) => L.results[r.end]).map((r) => L.names[r.c]);
  $("summary").innerHTML = `<h3>🎉 ${S.winText}: ${winners.join(", ")}</h3><ul>${rows.map((r) =>
    `<li class="${L.results[r.end] ? "w" : ""}">${L.names[r.c]} → ${L.results[r.end] ? S.winText : S.loseText}</li>`).join("")}</ul>`;
  $("summary").hidden = false;
  say(`다 탔어요! ${S.winText}은(는) ${winners.join(", ")}! 빨간 선이 당첨된 길이에요.`);
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
  say(pick(["이름을 누르면 그 사람의 사다리를 타요!", `${S.winText}은(는) ${S.wins}개! 누가 될까요?`, "사다리는 방금 무작위로 새로 만들었어요."]));
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
if (hp.has("demo")) { S.n = Number(hp.get("demo")) || 20; S.wins = Number(hp.get("wins")) || 3; S.names = PUREDAY.slice(0, 20); startLadder(); if (!hp.has("still")) setTimeout(() => $("btnAll").click(), 300); }
