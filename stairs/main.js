// 퓨어데이 무한의 계단 — 픽셀 캐릭터로 끝없이 오르기 (2026-10-21 대표님 요청)
// 규칙: 다음 계단이 지금 보는 쪽이면 '오르기', 반대쪽이면 '방향 바꾸기'(돌아서 한 칸 오르기). 틀리면 떨어진다.
//       위의 시간 막대가 줄어드는데, 한 칸 오를 때마다 조금 차오른다. 높이 오를수록 빨리 줄어든다.
const cv = document.getElementById("cv"), ctx = cv.getContext("2d");
const VW = 240;                       // 논리 너비(픽셀 그림 기준). 높이는 화면 비율대로
const STEP_W = 30, STEP_H = 14;       // 계단 한 칸
const SAVE_KEY = "pureday-stairs-v1";
const CHARS = [
  { id: "areum", name: "조아름", line: "빛의 화살처럼 쭉쭉!" },
  { id: "heim", name: "조하임", line: "계단도 계산 끝!" },
  { id: "drjo", name: "조성민 박사", line: "한 걸음씩, 꾸준히." },
  { id: "aquila", name: "아퀼라", line: "날개가 있지만 걸어서 간다!" },
  { id: "squire", name: "견습 창병", line: "언젠가 기사가 될 거야!" },
];
const ZONES = [   // 높이마다 하늘이 바뀐다
  { at: 0, name: "새벽의 들판", sky: ["#f7c6a3", "#a9c9ec"] },
  { at: 100, name: "푸른 하늘", sky: ["#bfe3ff", "#5d9be0"] },
  { at: 250, name: "노을 구름", sky: ["#ffcf8a", "#c8668a"] },
  { at: 400, name: "별빛 밤하늘", sky: ["#2c2d63", "#0c0d24"] },
  { at: 600, name: "골든 캐슬 위", sky: ["#fff1b8", "#e2a64a"] },
];

// ---------------------------------------------------------------- 화면 위 글자(HTML)
const wrap = document.getElementById("wrap");
wrap.insertAdjacentHTML("beforeend", `
<div class="hud" id="hud"><div class="score" id="score">0</div><div class="bar"><i id="bar"></i></div><div class="zone" id="zone"></div></div>
<div class="screen" id="screen"></div>`);
const css = document.createElement("style");
css.textContent = `
.hud{position:absolute;left:0;right:0;top:0;padding:10px 14px;pointer-events:none;text-align:center}
.hud .score{font:900 44px/1 "Pretendard","Noto Sans KR",system-ui,sans-serif;text-shadow:0 3px 0 rgba(0,0,0,.35)}
.hud .bar{height:12px;margin:8px auto 0;width:70%;background:rgba(0,0,0,.35);border:2px solid #fff;border-radius:3px;overflow:hidden}
.hud .bar i{display:block;height:100%;width:100%;background:linear-gradient(90deg,#ff5a3d,#ffd34a 40%,#7fe07a)}
.hud .zone.pop{font-size:26px;color:#ffd34a;font-weight:900;margin-top:10px}
.hud .zone{font-size:14px;font-weight:800;margin-top:4px;opacity:.85;text-shadow:0 1px 2px #000}
.screen{position:absolute;inset:0 0 auto 0;bottom:92px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;background:rgba(20,18,28,.55);padding:16px;text-align:center}
.screen[hidden]{display:none}
.screen h1{margin:0;font-size:30px;line-height:1.15;text-shadow:0 3px 0 rgba(0,0,0,.4)} .screen h1 b{color:#ffd34a}
.screen p{margin:0;font-size:14px;opacity:.9}
.chars{display:flex;gap:6px;flex-wrap:wrap;justify-content:center}
.chars button{width:62px;padding:6px 2px 4px;border-radius:10px;border:2px solid transparent;background:rgba(255,255,255,.12);color:#fff;font:700 11px/1.2 "Pretendard","Noto Sans KR",system-ui,sans-serif;cursor:pointer}
.chars button.on{border-color:#ffd34a;background:rgba(255,211,74,.2)}
.chars img{display:block;height:46px;margin:0 auto 3px;image-rendering:pixelated}
.big{min-width:200px;min-height:52px;border:0;border-radius:14px;background:linear-gradient(#ffd34a,#f0a64a);color:#3a2410;font:900 19px "Pretendard","Noto Sans KR",system-ui,sans-serif;cursor:pointer;box-shadow:0 4px 0 #b06a1e}
.small{border:0;background:none;color:#fff;text-decoration:underline;font:600 13px "Pretendard","Noto Sans KR",system-ui,sans-serif;cursor:pointer}
.how{font-size:12px;opacity:.8;line-height:1.5}`;
document.head.appendChild(css);
const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- 상태
const S = { mode: "title", char: 0, best: 0, sound: true, steps: [], idx: 0, facing: 1, time: 1, score: 0, started: false,
  px: 0, py: 0, anim: 0, fall: null, shake: 0, t: 0, banner: null, lastZone: 0 };
const SPR = {};
function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify({ best: S.best, char: S.char, sound: S.sound })); } catch (e) { /* 저장 안 됨 */ } }
function load() { try { Object.assign(S, JSON.parse(localStorage.getItem(SAVE_KEY) || "{}")); } catch (e) { /* 저장 안 됨 */ } }

// ---------------------------------------------------------------- 소리
let actx = null;
function tone(freqs, dur = 0.05, vol = 0.05, type = "square") {
  if (!S.sound) return;
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

// ---------------------------------------------------------------- 계단 만들기
// 같은 방향이 1~5칸 이어지다가 꺾인다. 처음 몇 칸은 쉽게(길게)
function extend(n) {
  const st = S.steps;
  while (st.length < n) {
    const last = st[st.length - 1];
    if (!S.runLeft) { S.runDir = st.length < 3 ? 1 : (S.runDir === 1 ? -1 : 1); S.runLeft = 1 + Math.floor(Math.random() * (st.length < 20 ? 5 : 4)); }
    st.push(last + S.runDir); S.runLeft--;
  }
}
function reset() {
  S.steps = [0]; S.runLeft = 0; S.runDir = 1; extend(60);
  Object.assign(S, { idx: 0, facing: 1, time: 1, score: 0, started: false, anim: 0, fall: null, shake: 0, banner: null, lastZone: 0 });
  S.px = 0; S.py = 0;
}

// ---------------------------------------------------------------- 조작
function act(turn) {
  if (S.mode !== "play" || S.fall) return;
  if (turn) S.facing = -S.facing;
  const want = S.steps[S.idx + 1] - S.steps[S.idx];
  if (want !== S.facing) { fallDown(); return; }
  S.idx++; S.score++; S.started = true; S.anim = 1;
  S.time = Math.min(1, S.time + 0.075 - Math.min(0.03, S.score * 0.00004));
  extend(S.idx + 40);
  tone([turn ? 620 : 520 + (S.score % 8) * 30], 0.04, 0.035);
  if (S.score % 100 === 0) { S.banner = { text: `${S.score}계단!`, t: 0 }; tone([523, 659, 784, 1046], 0.09, 0.06, "triangle"); }
  const z = zoneOf(S.score);
  if (z !== S.lastZone) { S.lastZone = z; S.banner = { text: ZONES[z].name, t: 0 }; }
}
function fallDown() {
  S.fall = { t: 0, vy: -60, vx: S.facing * 40, rot: 0 };
  S.shake = 0.3;
  tone([300, 200, 120], 0.12, 0.07, "sawtooth");
}
function endGame() {
  S.mode = "over";
  const newBest = S.score > S.best;
  if (newBest) S.best = S.score;
  save();
  const c = CHARS[S.char];
  showScreen(`<h1>${S.score}<small style="font-size:16px"> 계단</small></h1>
    <p>${newBest ? "🎉 최고 기록!" : `최고 기록 ${S.best}`}</p>
    <p>${pick([`${c.name}: "${c.line}"`, "🦜 페이: 끼룩! 다시 해 볼까요?", "🦜 페이: 다음 계단이 어느 쪽인지 잘 봐요!"])}</p>
    <button class="big" id="again">다시 오르기</button><button class="small" id="toTitle">캐릭터 바꾸기</button>`);
  $("again").onclick = start; $("toTitle").onclick = title;
}
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const zoneOf = (sc) => ZONES.reduce((k, z, i) => (sc >= z.at ? i : k), 0);

// ---------------------------------------------------------------- 화면
function showScreen(html) { $("screen").innerHTML = html; $("screen").hidden = false; }
function title() {
  S.mode = "title"; reset();
  showScreen(`<h1><b>퓨어데이</b><br>무한의 계단</h1>
    <div class="chars" id="chars">${CHARS.map((c, i) => `<button data-i="${i}" class="${i === S.char ? "on" : ""}"><img src="assets/${c.id}.png" alt="">${c.name}</button>`).join("")}</div>
    <p>최고 기록 ${S.best} 계단</p>
    <button class="big" id="go">오르기 시작!</button>
    <p class="how">▲ 오르기: 다음 계단이 보는 쪽에 있을 때 · ⇄ 방향 바꾸기: 반대쪽에 있을 때<br>키보드: → / ↑ / Space = 오르기 · ← / Shift = 방향 바꾸기<br>멈추면 위의 시간 막대가 줄어들어요!</p>
    <button class="small" id="snd">소리 ${S.sound ? "켜짐" : "꺼짐"}</button>`);
  $("chars").onclick = (e) => { const b = e.target.closest("button"); if (!b) return; S.char = Number(b.dataset.i); save(); title(); };
  $("go").onclick = start;
  $("snd").onclick = () => { S.sound = !S.sound; save(); title(); };
}
function start() { reset(); S.mode = "play"; $("screen").hidden = true; tone([660, 880], 0.06, 0.05, "triangle"); }

// ---------------------------------------------------------------- 그리기
function resize() {
  const r = cv.getBoundingClientRect();
  S.VH = Math.round(VW * r.height / r.width);
  cv.width = VW; cv.height = S.VH;
  ctx.imageSmoothingEnabled = false;
}
const lerp = (a, b, t) => a + (b - a) * t;
function hexMix(a, b, t) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16)), pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `rgb(${pa.map((v, i) => Math.round(lerp(v, pb[i], t))).join(",")})`;
}
function skyColors() {
  const z = zoneOf(S.score), a = ZONES[z], b = ZONES[z + 1];
  if (!b) return a.sky;
  const t = Math.max(0, Math.min(1, (S.score - (b.at - 40)) / 40));   // 다음 구역 40계단 전부터 서서히
  return [hexMix(a.sky[0], b.sky[0], t), hexMix(a.sky[1], b.sky[1], t)];
}
function draw(dt) {
  const W = VW, H = S.VH;
  // 플레이어 위치(부드럽게): 계단 위 = (x칸 * STEP_W, -idx * STEP_H)
  const tx = S.steps[S.idx] * STEP_W, ty = -S.idx * STEP_H;
  S.px = lerp(S.px, tx, Math.min(1, dt * 22)); S.py = lerp(S.py, ty, Math.min(1, dt * 22));
  const camX = S.px, camY = S.py;
  const ox = W / 2 - camX + (S.shake > 0 ? (Math.random() - 0.5) * 6 : 0), oy = H * 0.66 - camY;
  // 하늘
  const [top, bot] = skyColors();
  const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, bot); g.addColorStop(1, top);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const night = zoneOf(S.score) === 3;
  // 별·구름 (높이에 따라 천천히 흐름)
  for (let k = 0; k < 24; k++) {
    const sx = (k * 53 + Math.floor(-camX * 0.15)) % (W + 40), sy = ((k * 97 + Math.floor(-camY * 0.3)) % (H + 40) + H + 40) % (H + 40) - 20;
    const x = ((sx % (W + 40)) + W + 40) % (W + 40) - 20;
    if (night) { ctx.fillStyle = k % 3 ? "#fff" : "#ffe9a0"; ctx.fillRect(x, sy, 1 + (k % 2), 1 + (k % 2)); }
    else if (k % 4 === 0) { ctx.fillStyle = "rgba(255,255,255,.75)"; ctx.fillRect(x, sy, 22, 5); ctx.fillRect(x + 5, sy - 3, 12, 3); }
  }
  // 땅 (처음에만 보인다)
  const groundY = Math.round(oy + STEP_H);
  if (groundY < H) { ctx.fillStyle = "#6fb05a"; ctx.fillRect(0, groundY, W, H - groundY); ctx.fillStyle = "#4e8a3e"; ctx.fillRect(0, groundY, W, 3); }
  // 계단
  const from = Math.max(0, S.idx - 14), to = Math.min(S.steps.length - 1, S.idx + 26);
  for (let i = to; i >= from; i--) {
    const x = Math.round(S.steps[i] * STEP_W + ox - STEP_W / 2), y = Math.round(-i * STEP_H + oy);
    if (y > H + 20 || y < -30) continue;
    ctx.fillStyle = "#3a2a22"; ctx.fillRect(x - 1, y - 1, STEP_W + 2, STEP_H + 2);
    ctx.fillStyle = i % 2 ? "#c98d5a" : "#d89b66"; ctx.fillRect(x, y, STEP_W, STEP_H);
    ctx.fillStyle = "#f2c38f"; ctx.fillRect(x, y, STEP_W, 3);
    ctx.fillStyle = "#9c6438"; ctx.fillRect(x, y + STEP_H - 3, STEP_W, 3);
    ctx.fillRect(x + STEP_W / 2 - 1, y + 3, 2, STEP_H - 6);
    if (i > 0 && i % 100 === 0) { ctx.fillStyle = "#ffd34a"; ctx.fillRect(x + STEP_W / 2 - 3, y - 6, 6, 6); }   // 100계단 표시
  }
  // 캐릭터
  const im = SPR[CHARS[S.char].id];
  if (im) {
    let x = Math.round(S.px + ox - im.width / 2), y = Math.round(S.py + oy - im.height + 1);
    if (S.anim > 0) y -= Math.round(Math.sin(S.anim * Math.PI) * 4);
    ctx.save();
    if (S.fall) { x += S.fall.dx || 0; y += S.fall.dy || 0; ctx.translate(x + im.width / 2, y + im.height / 2); ctx.rotate(S.fall.rot); ctx.translate(-(x + im.width / 2), -(y + im.height / 2)); }
    if (S.facing < 0) { ctx.translate(x * 2 + im.width, 0); ctx.scale(-1, 1); }
    ctx.drawImage(im, x, y);
    ctx.restore();
  }
  // 띠 글자
  if (S.banner) {
    S.banner.t += dt;
    const a = Math.min(1, S.banner.t * 4, (1.6 - S.banner.t) * 3);
    // 띠 대신 위 글자를 잠깐 크게 (작은 캔버스에 글자를 그리면 흐려진다)
    if (a > 0) { $("zone").textContent = S.banner.text; $("zone").classList.add("pop"); }
    if (S.banner.t > 1.6) { S.banner = null; $("zone").textContent = ZONES[zoneOf(S.score)].name; $("zone").classList.remove("pop"); }
  }
}

// ---------------------------------------------------------------- 진행
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now; S.t += dt;
  S.anim = Math.max(0, S.anim - dt * 9); S.shake = Math.max(0, S.shake - dt);
  if (S.mode === "play") {
    if (S.started && !S.fall) {
      S.time -= dt * (0.16 + Math.min(0.42, S.score * 0.0011));
      if (S.time <= 0) { S.time = 0; fallDown(); }
    }
    if (S.fall) {
      const f = S.fall; f.t += dt; f.vy += 520 * dt; f.dy = (f.dy || 0) + f.vy * dt; f.dx = (f.dx || 0) + f.vx * dt; f.rot += S.facing * dt * 7;
      if (f.t > 1.1) endGame();
    }
  }
  if (S.mode === "title") { S.facing = Math.sin(S.t * 1.2) > 0 ? 1 : -1; }
  draw(dt);
  $("score").textContent = S.score;
  $("bar").style.width = `${Math.max(0, S.time) * 100}%`;
  $("hud").style.visibility = S.mode === "play" || S.mode === "over" ? "visible" : "hidden";
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- 입력
function press(turn, btn) {
  if (S.mode !== "play") return;
  act(turn);
  if (btn) { btn.classList.add("hit"); setTimeout(() => btn.classList.remove("hit"), 80); }
}
$("btnClimb").addEventListener("pointerdown", (e) => { e.preventDefault(); press(false, e.currentTarget); });
$("btnTurn").addEventListener("pointerdown", (e) => { e.preventDefault(); press(true, e.currentTarget); });
addEventListener("keydown", (e) => {
  if (e.repeat) return;
  if (["ArrowRight", "ArrowUp", "Space", "KeyJ", "KeyK"].includes(e.code)) { e.preventDefault(); if (S.mode === "play") press(false, $("btnClimb")); else if ($("go")) start(); else if ($("again")) start(); }
  if (["ArrowLeft", "ShiftLeft", "ShiftRight", "KeyF", "KeyD"].includes(e.code)) { e.preventDefault(); press(true, $("btnTurn")); }
});
addEventListener("resize", resize);

// ---------------------------------------------------------------- 시작
load();
Promise.all(CHARS.map((c) => new Promise((res) => { const im = new Image(); im.onload = () => { SPR[c.id] = im; res(); }; im.onerror = res; im.src = `assets/${c.id}.png`; }))).then(() => {
  resize(); title();
  // 개발용: #auto=N → 자동으로 N계단 정답대로 오르고 멈춤 (화면 확인용), #auto=N&miss → 마지막에 틀리기
  const hp = new URLSearchParams(location.hash.slice(1));
  if (hp.has("auto")) {
    S.sound = false; start();
    const n = Number(hp.get("auto")) || 30;
    for (let k = 0; k < n; k++) act(S.steps[S.idx + 1] - S.steps[S.idx] !== S.facing);
    S.px = S.steps[S.idx] * STEP_W; S.py = -S.idx * STEP_H; S.time = 0.7;
    if (hp.has("miss")) act(S.steps[S.idx + 1] - S.steps[S.idx] === S.facing);
  }
  requestAnimationFrame(frame);
});
