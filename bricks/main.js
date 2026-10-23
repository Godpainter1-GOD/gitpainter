// 퓨어데이 벽돌깨기 「빛의 방패」 — 방패(패들)로 빛의 구슬을 튕겨 어둠의 안개 블록·군단을 걷어낸다. 12단계, 마지막은 대왕용
const W = 360, H = 640;
const CHARS = [
  { id: "areum", name: "조아름", line: "빛의 구슬, 한 알도 놓치지 않을게요!" },
  { id: "heim", name: "조하임", line: "튕기는 각도, 계산 끝!" },
  { id: "drjo", name: "조성민 박사", line: "서두르지 않아도 괜찮아. 한 칸씩." },
  { id: "aquila", name: "아퀼라", line: "하늘에서 보면 다 보여!" },
  { id: "squire", name: "견습 창병", line: "오늘도 훈련! 방패 들어!" },
];
const COLS = 10, BW = 32, BH = 16, GAP = 3, OX = 5, OY = 72;
// 블록: 1·2·3 = 안개(체력), S 병사(2, 선물 떨어뜨림), K 기사(3, 선물), G 장군(4, 선물 2)
const LEVELS = [
  ["1111111111", "1111111111", "1111111111", "1111111111"],
  ["1.1.1.1.1.", ".2.2.2.2.2", "1.1.1.1.1.", ".2.2.2.2.2", "1111111111"],
  ["....11....", "...1221...", "..122221..", ".12233221.", "..122221..", "...1221...", "....11...."],
  ["1S1S1S1S1S", "2.2.2.2.2.", "S1S1S1S1S1", ".2.2.2.2.2", "1111111111"],
  ["3.3....3.3", "3333..3333", "3223..3223", "3223K.3223", "3333333333", "1111111111"],
  ["..22..22..", ".2332.2332", "23333333S2", "2333333332", ".23333332.", "..233332..", "...2332...", "....22...."],
  ["K..K..K..K", "2..2..2..2", "2..2..2..2", "2..2..2..2", "S..S..S..S", "1111111111", "1111111111"],
  ["1122332211", "1223333221", "1233S33321", "1233333321", "1223333221", "1122332211"],
  ["....SS....", "....22....", "....22....", "SS22K22SS.", "2222222222", "....22....", "....22....", "....SS...."],
  ["3333333333", "2222222222", "3S3S3S3S3S", "2222222222", "3333333333", "1K11111K11"],
  ["2222222222", ".23333332.", "..2S33S2..", "...2332...", "....K2....", "....G.....", "..........", "1.1.1.1.1."],
  null,   // 12단계: 대왕용
];
const KIND = { "1": { hp: 1, c: "#8a5ac0", s: 10 }, "2": { hp: 2, c: "#5e3d96", s: 20 }, "3": { hp: 3, c: "#3d2a6e", s: 35 }, S: { hp: 2, c: "#6a44a8", s: 40, name: "병사", gift: 1 }, K: { hp: 3, c: "#4c3390", s: 80, name: "기사", gift: 1 }, G: { hp: 4, c: "#1e1650", s: 200, name: "장군", gift: 2 } };
const GIFTS = [
  { id: "wide", name: "넓은 방패", c: "#5ec8ff", icon: "🛡" }, { id: "multi", name: "구슬 셋", c: "#ffd34a", icon: "✨" },
  { id: "slow", name: "느린 구슬", c: "#7fe07a", icon: "🐢" }, { id: "arrow", name: "빛의 화살", c: "#ff9ad5", icon: "🏹" }, { id: "heart", name: "하트", c: "#ff6b8a", icon: "♥" },
];
const CLEAR_LINES = ["안개가 걷혔어요!", "빛이 이겼어요!", "한 칸씩, 다 걷어냈어요!", "방패가 빛났어요!"];
const PEI_LOSE = ["🦜 페이: 끼룩! 괜찮아요, 구슬은 다시 떠요.", "🦜 페이: 방패를 구슬 아래로! 다시 한 번!", "🦜 페이: 모서리로 맞추면 구슬이 옆으로 튀어요."];

const $ = (id) => document.getElementById(id);
const cv = $("cv"), ctx = cv.getContext("2d");
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const SPR = {};
let AUTO = false, FAST = false;

// ---------------------------------------------------------------- 저장·소리
const P = { sound: true, char: 0, best: 0, cleared: 0, stageBest: {} };
function load() { try { Object.assign(P, JSON.parse(localStorage.getItem("pureday-bricks-v1") || "{}")); } catch (e) {} }
function save() { try { localStorage.setItem("pureday-bricks-v1", JSON.stringify(P)); } catch (e) {} }
let AC = null;
function tone(freqs, dur = 0.08, vol = 0.05, type = "square") {
  if (!P.sound) return;
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === "suspended") AC.resume();
    const t0 = AC.currentTime; freqs.forEach((f, i) => { const o = AC.createOscillator(), g = AC.createGain(); o.type = type; o.frequency.value = f; g.gain.setValueAtTime(vol, t0 + i * dur); g.gain.exponentialRampToValueAtTime(0.0001, t0 + (i + 1) * dur); o.connect(g).connect(AC.destination); o.start(t0 + i * dur); o.stop(t0 + (i + 1) * dur + 0.02); });
  } catch (e) {}
}

// ---------------------------------------------------------------- 상태
let mode = "title", G = null;
function newGame(stage) {
  G = { stage, score: 0, lives: 3, t: 0, bricks: [], balls: [], gifts: [], arrows: [], fires: [], parts: [], pad: { x: W / 2, w: 70, wide: 0, arrow: 0, slow: 0, fireCd: 0 }, boss: null, launched: false, hitFlash: 0, shake: 0, combo: 0, bricksTotal: 0, cleared: false };
  buildStage();
}
function buildStage() {
  const g = G; g.bricks = []; g.boss = null; g.gifts = []; g.arrows = []; g.fires = []; g.launched = false; g.combo = 0; g.cleared = false;
  const L = LEVELS[g.stage - 1];
  if (L) {
    L.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === ".") return; const k = KIND[ch]; g.bricks.push({ r, c, x: OX + c * (BW + GAP), y: OY + r * (BH + GAP), hp: k.hp, max: k.hp, kind: ch }); }));
  } else {
    g.boss = { x: W / 2, y: 130, r: 34, hp: 30 + 0, max: 30, dir: 1, spd: 70, fireT: 2.5, hit: 0 };
  }
  g.bricksTotal = g.bricks.length;
  g.balls = [newBall()];
  g.pad.x = W / 2; g.pad.wide = 0; g.pad.arrow = 0; g.pad.slow = 0;
}
function ballSpeed() { return Math.min(430, 250 + G.stage * 12) * (G.pad.slow > 0 ? 0.72 : 1); }
function newBall() { return { x: G.pad.x, y: H - 86, vx: 0, vy: 0, r: 6, stuck: true, trail: [] }; }
function launchBall(b) { const a = -Math.PI / 2 + rnd(-0.5, 0.5); const s = ballSpeed(); b.vx = Math.cos(a) * s; b.vy = Math.sin(a) * s; b.stuck = false; G.launched = true; tone([520, 780], 0.05, 0.04, "triangle"); }

// ---------------------------------------------------------------- 화면(DOM)
function screen(html) { const s = $("screen"); s.innerHTML = html; s.hidden = false; }
function hideScreen() { $("screen").hidden = true; }
function title() {
  mode = "title"; $("hud").hidden = true; $("pad").hidden = true;
  const unlocked = Math.min(LEVELS.length, P.cleared + 1);
  screen(`<small style="letter-spacing:6px;opacity:.8;font-weight:800">PUREDAY BRICKS</small>
    <h1><b>퓨어데이</b><br>벽돌깨기 · 빛의 방패</h1>
    <p>빛의 방패로 구슬을 튕겨 어둠의 안개 블록을 걷어내요. 병사·기사·장군 블록은 선물을 떨어뜨리고, 12단계엔 대왕용이 기다려요.</p>
    <div class="chars">${CHARS.map((c, i) => `<button class="${P.char === i ? "on" : ""}" data-c="${i}"><img src="assets/${c.id}.png" alt="">${c.name}</button>`).join("")}</div>
    <div class="stages">${LEVELS.map((_, i) => `<button data-s="${i + 1}" class="${i < P.cleared ? "done" : i + 1 > unlocked ? "lock" : ""}" ${i + 1 > unlocked ? "disabled" : ""}>${i + 1}</button>`).join("")}</div>
    <button class="big" id="btnPlay">${P.cleared >= LEVELS.length ? "1단계부터 다시" : `${unlocked}단계 시작`}</button>
    <p class="sub">최고 점수 ${P.best} · 걷어낸 단계 ${P.cleared}/${LEVELS.length} · <span id="snd">${P.sound ? "🔊 소리 켬" : "🔇 소리 끔"}</span></p>`);
  $("screen").querySelectorAll(".chars button").forEach((b) => (b.onclick = () => { P.char = Number(b.dataset.c); save(); title(); }));
  $("screen").querySelectorAll(".stages button").forEach((b) => (b.onclick = () => startStage(Number(b.dataset.s))));
  $("btnPlay").onclick = () => startStage(P.cleared >= LEVELS.length ? 1 : unlocked);
  $("snd").onclick = () => { P.sound = !P.sound; save(); title(); };
}
function startStage(stage) {
  newGame(stage); mode = "play"; hideScreen(); $("hud").hidden = false; $("pad").hidden = false; hud();
  banner(`${stage}단계`, stage === LEVELS.length ? "⚠ 대왕용이 안개 위에 있어요 — 구슬로 30번!" : `블록 ${G.bricksTotal}개 — ${CHARS[P.char].name}: "${CHARS[P.char].line}"`);
}
function nextStage() {
  const g = G; g.stage++; if (g.stage > LEVELS.length) return allClear();
  buildStage(); hud(); banner(`${g.stage}단계`, g.stage === LEVELS.length ? "⚠ 대왕용이 안개 위에 있어요 — 구슬로 30번!" : `블록 ${g.bricksTotal}개`);
  mode = "play";
}
function stageClear() {
  const g = G; g.cleared = true; mode = "clear";
  P.cleared = Math.max(P.cleared, g.stage); P.best = Math.max(P.best, g.score); save();
  tone([523, 659, 784, 1046, 1318], 0.09, 0.05, "triangle");
  banner(g.stage === LEVELS.length ? "🎉 대왕용을 물리쳤어요!" : `✨ ${g.stage}단계 걷어냄!`, `${CHARS[P.char].name}: "${pick(CLEAR_LINES)}" · 점수 ${g.score}`);
  setTimeout(() => { if (G === g && mode === "clear") nextStage(); }, FAST ? 300 : 2300);
}
function allClear() {
  mode = "end"; $("hud").hidden = true; $("pad").hidden = true;
  screen(`<h1>🎉 안개가 모두 걷혔어요!</h1><p>12단계를 모두 걷어내고 대왕용까지 물리쳤어요.</p><div class="stat"><div>점수<b>${G.score}</b></div><div>최고<b>${P.best}</b></div></div>
    <div class="pei"><img src="assets/${CHARS[P.char].id}.png" alt=""><span>${CHARS[P.char].name}: "${pick(CLEAR_LINES)}"</span></div>
    <button class="big" id="btnAgain">1단계부터 다시</button><button class="small" id="btnHome">처음으로</button>`);
  $("btnAgain").onclick = () => startStage(1); $("btnHome").onclick = title;
}
function gameOver() {
  mode = "over"; P.best = Math.max(P.best, G.score); save(); $("pad").hidden = true;
  tone([300, 240, 180], 0.14, 0.05, "sine");
  screen(`<h2>구슬이 모두 떨어졌어요</h2><div class="stat"><div>점수<b>${G.score}</b></div><div>단계<b>${G.stage}</b></div><div>최고<b>${P.best}</b></div></div>
    <div class="pei"><img src="assets/${CHARS[P.char].id}.png" alt=""><span>${pick(PEI_LOSE)}</span></div>
    <button class="big" id="btnRetry">${G.stage}단계 다시</button><div class="rowbtn"><button class="small" id="btnHome">처음으로</button></div>`);
  $("btnRetry").onclick = () => startStage(G.stage); $("btnHome").onclick = title;
}
function pause() {
  if (mode !== "play") return; mode = "pause";
  screen(`<h2>잠깐 쉬어요</h2><p>${G.stage}단계 · 점수 ${G.score} · 남은 블록 ${G.boss ? "대왕용 ♥" + G.boss.hp : G.bricks.length}</p>
    <button class="big" id="btnResume">계속</button><div class="rowbtn"><button class="small" id="btnHome">처음으로</button></div>`);
  $("btnResume").onclick = () => { hideScreen(); mode = "play"; last = performance.now(); }; $("btnHome").onclick = title;
}
function hud() { const g = G; if (!g) return; $("label").innerHTML = `${g.stage}단계 · 점수 <b>${g.score}</b>${g.boss ? ` · 대왕용 ♥${g.boss.hp}` : ` · 블록 ${g.bricks.length}`}`; $("lives").textContent = "♥".repeat(Math.max(0, g.lives)) + "♡".repeat(Math.max(0, 3 - g.lives)); $("btnSound").textContent = P.sound ? "🔊" : "🔇"; }
let bannerTimer = 0, toastTimer = 0;
function banner(big, small = "", red = false) { const b = $("banner"); b.innerHTML = `${big}<small>${small}</small>`; b.className = "banner" + (red ? " red" : ""); b.hidden = false; clearTimeout(bannerTimer); bannerTimer = setTimeout(() => { b.hidden = true; }, 2200); }
function toast(msg, ms = 1500) { const t = $("toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, ms); }
function burst(x, y, c, n) { for (let k = 0; k < n; k++) { const a = rnd(0, 6.28), s = rnd(40, 200); G.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: rnd(0.3, 0.7), c, r: rnd(2, 4) }); } }

// ---------------------------------------------------------------- 진행
function padW() { return G.pad.wide > 0 ? 112 : 70; }
function update(dt) {
  const g = G; g.t += dt;
  g.pad.wide = Math.max(0, g.pad.wide - dt); g.pad.arrow = Math.max(0, g.pad.arrow - dt); g.pad.slow = Math.max(0, g.pad.slow - dt);
  g.hitFlash = Math.max(0, g.hitFlash - dt); g.shake = Math.max(0, g.shake - dt);
  if (g.keys) { if (g.keys.has("left")) g.pad.x -= 320 * dt; if (g.keys.has("right")) g.pad.x += 320 * dt; }
  if (AUTO) { const b = g.balls.find((b) => !b.stuck) || g.balls[0]; g.pad.x = lerp(g.pad.x, b.x + (b.vx ? b.vx * 0.08 : 0) + Math.sin(g.t * 0.9) * 22, Math.min(1, dt * 12)); if (g.balls.some((b) => b.stuck) && g.t > 1) g.balls.filter((b) => b.stuck).forEach(launchBall); if (g.balls.some((b) => b.stuck) && g.t > 1) g.balls.filter((b) => b.stuck).forEach(launchBall); }
  g.pad.x = clamp(g.pad.x, padW() / 2 + 4, W - padW() / 2 - 4);
  const py = H - 70, pw = padW();
  // 화살(빛의 화살 선물)
  if (g.pad.arrow > 0) { g.pad.fireCd -= dt; if (g.pad.fireCd <= 0) { g.pad.fireCd = 0.28; g.arrows.push({ x: g.pad.x - 16, y: py - 8 }, { x: g.pad.x + 16, y: py - 8 }); tone([900], 0.03, 0.02, "triangle"); } }
  for (let i = g.arrows.length - 1; i >= 0; i--) { const a = g.arrows[i]; a.y -= 420 * dt; if (a.y < 40) { g.arrows.splice(i, 1); continue; } const b = g.bricks.find((k) => a.x >= k.x && a.x <= k.x + BW && a.y >= k.y && a.y <= k.y + BH); if (b) { hitBrick(b, g.bricks.indexOf(b)); g.arrows.splice(i, 1); } else if (g.boss && Math.hypot(a.x - g.boss.x, a.y - g.boss.y) < g.boss.r) { hitBoss(1); g.arrows.splice(i, 1); } }
  // 구슬
  for (let i = g.balls.length - 1; i >= 0; i--) {
    const b = g.balls[i];
    if (b.stuck) { b.x = g.pad.x; b.y = py - 10; continue; }
    const sp = Math.hypot(b.vx, b.vy), want = ballSpeed(); if (Math.abs(sp - want) > 1) { b.vx *= want / sp; b.vy *= want / sp; }
    // 수직·수평으로만 왕복하지 않게: 가로 성분은 속도의 22% 이상, 세로 성분은 30% 이상
    if (Math.abs(b.vx) < want * 0.22) { b.vx = (b.vx < 0 || (b.vx === 0 && Math.random() < 0.5) ? -1 : 1) * want * 0.22; const k = Math.sqrt(Math.max(0, want * want - b.vx * b.vx)); b.vy = (b.vy < 0 ? -1 : 1) * k; }
    if (Math.abs(b.vy) < want * 0.3) { b.vy = (b.vy < 0 ? -1 : 1) * want * 0.3; const k = Math.sqrt(Math.max(0, want * want - b.vy * b.vy)); b.vx = (b.vx < 0 ? -1 : 1) * k; }
    // 작은 걸음으로 나눠서 뚫고 지나가지 않게
    const steps = Math.ceil(Math.hypot(b.vx, b.vy) * dt / 6);
    for (let s = 0; s < steps; s++) {
      b.x += b.vx * dt / steps; b.y += b.vy * dt / steps;
      if (b.x < b.r + 2) { b.x = b.r + 2; b.vx = Math.abs(b.vx); } if (b.x > W - b.r - 2) { b.x = W - b.r - 2; b.vx = -Math.abs(b.vx); } if (b.y < b.r + 2) { b.y = b.r + 2; b.vy = Math.abs(b.vy); }
      // 방패
      if (b.vy > 0 && b.y + b.r >= py - 6 && b.y + b.r <= py + 10 && Math.abs(b.x - g.pad.x) <= pw / 2 + b.r) {
        const u = clamp((b.x - g.pad.x) / (pw / 2), -1, 1), a = -Math.PI / 2 + u * 1.05, s2 = Math.hypot(b.vx, b.vy);
        b.vx = Math.cos(a) * s2; b.vy = Math.sin(a) * s2; b.y = py - 6 - b.r; g.combo = 0; tone([440], 0.04, 0.03, "triangle");
      }
      // 블록
      for (let k = g.bricks.length - 1; k >= 0; k--) {
        const br = g.bricks[k];
        if (b.x + b.r < br.x || b.x - b.r > br.x + BW || b.y + b.r < br.y || b.y - b.r > br.y + BH) continue;
        const ox = Math.min(b.x + b.r - br.x, br.x + BW - (b.x - b.r)), oy = Math.min(b.y + b.r - br.y, br.y + BH - (b.y - b.r));
        if (ox < oy) { b.vx = b.x < br.x + BW / 2 ? -Math.abs(b.vx) : Math.abs(b.vx); b.x += b.vx > 0 ? ox : -ox; } else { b.vy = b.y < br.y + BH / 2 ? -Math.abs(b.vy) : Math.abs(b.vy); b.y += b.vy > 0 ? oy : -oy; }
        hitBrick(br, k); break;
      }
      // 대왕용
      if (g.boss) { const bs = g.boss, d = Math.hypot(b.x - bs.x, b.y - bs.y); if (d < bs.r + b.r) { const nx = (b.x - bs.x) / d, ny = (b.y - bs.y) / d, dot = b.vx * nx + b.vy * ny; b.vx -= 2 * dot * nx; b.vy -= 2 * dot * ny; b.x = bs.x + nx * (bs.r + b.r + 1); b.y = bs.y + ny * (bs.r + b.r + 1); hitBoss(1); } }
    }
    b.trail.push({ x: b.x, y: b.y }); if (b.trail.length > 8) b.trail.shift();
    if (b.y > H + 10) { g.balls.splice(i, 1); burst(b.x, H - 10, "#ffd34a", 8); }
  }
  if (!g.balls.length && mode === "play") loseBall();
  // 선물
  for (let i = g.gifts.length - 1; i >= 0; i--) { const f = g.gifts[i]; f.y += 95 * dt; f.ph += dt; if (f.y > H + 20) { g.gifts.splice(i, 1); continue; } if (f.y >= py - 14 && f.y <= py + 14 && Math.abs(f.x - g.pad.x) <= pw / 2 + 10) { g.gifts.splice(i, 1); takeGift(f); } }
  // 대왕용 움직임·불덩이
  if (g.boss) {
    const bs = g.boss; bs.hit = Math.max(0, bs.hit - dt); bs.x += bs.dir * bs.spd * dt; if (bs.x < bs.r + 10) { bs.x = bs.r + 10; bs.dir = 1; } if (bs.x > W - bs.r - 10) { bs.x = W - bs.r - 10; bs.dir = -1; }
    bs.y = 130 + Math.sin(g.t * 1.3) * 18;
    bs.fireT -= dt; if (bs.fireT <= 0 && g.launched) { bs.fireT = rnd(1.6, 2.8) * (bs.hp < 12 ? 0.7 : 1); g.fires.push({ x: bs.x, y: bs.y + bs.r, vx: (g.pad.x - bs.x) * 0.35, vy: 150 }); tone([200, 140], 0.08, 0.04, "sawtooth"); }
  }
  for (let i = g.fires.length - 1; i >= 0; i--) { const f = g.fires[i]; f.x += f.vx * dt; f.y += f.vy * dt; if (f.y > H + 10) { g.fires.splice(i, 1); continue; } if (f.y >= py - 10 && f.y <= py + 12 && Math.abs(f.x - g.pad.x) <= pw / 2 + 6) { g.fires.splice(i, 1); g.pad.wide = 0; g.pad.arrow = 0; g.hitFlash = 0.4; g.shake = 0.3; burst(f.x, f.y, "#ff6b6b", 10); tone([180, 120], 0.1, 0.05, "sawtooth"); toast("불덩이에 맞아 방패가 흔들렸어요 — 선물 효과가 사라졌어요"); } }
  for (let i = g.parts.length - 1; i >= 0; i--) { const p = g.parts[i]; p.t -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.95; p.vy *= 0.95; if (p.t <= 0) g.parts.splice(i, 1); }
  // 클리어 판정
  if (mode === "play" && !g.cleared && ((g.boss && g.boss.hp <= 0) || (!g.boss && !g.bricks.length))) stageClear();
}
function hitBrick(br, k) {
  const g = G; br.hp--; g.combo++;
  const kd = KIND[br.kind];
  if (br.hp <= 0) {
    g.bricks.splice(k, 1); g.score += kd.s * Math.min(4, g.combo); burst(br.x + BW / 2, br.y + BH / 2, kd.c, 10);
    tone([600 + g.combo * 40, 900], 0.04, 0.035, "triangle");
    if (kd.gift) for (let i = 0; i < kd.gift; i++) g.gifts.push({ x: br.x + BW / 2 + i * 14 - (kd.gift - 1) * 7, y: br.y + BH / 2, g: pick(GIFTS.filter((gf) => gf.id !== "heart" || Math.random() < 0.5)), ph: 0 });
    if (kd.name) toast(`${kd.name} 블록을 걷어냈어요! 선물이 떨어져요`);
  } else { tone([380], 0.03, 0.03, "square"); burst(br.x + BW / 2, br.y + BH / 2, "#ffffff", 3); }
  hud();
}
function hitBoss(n) {
  const g = G, bs = g.boss; if (!bs || bs.hp <= 0) return; bs.hp -= n; bs.hit = 0.25; g.score += 25; burst(bs.x, bs.y, "#ff8aa0", 8); tone([420, 300], 0.06, 0.04, "sawtooth");
  if (bs.hp === 10) banner("대왕용이 지쳤어요!", "불덩이가 잦아져요 — 조금만 더!", true);
  hud();
}
function takeGift(f) {
  const g = G, id = f.g.id;
  if (id === "wide") g.pad.wide = 12; else if (id === "slow") g.pad.slow = 10; else if (id === "arrow") { g.pad.arrow = 8; g.pad.fireCd = 0; }
  else if (id === "heart") { g.lives = Math.min(5, g.lives + 1); }
  else if (id === "multi") { const src = g.balls.find((b) => !b.stuck) || g.balls[0]; if (src) for (const da of [-0.45, 0.45]) { const s = Math.hypot(src.vx, src.vy) || ballSpeed(), a = Math.atan2(src.vy || -1, src.vx || 0) + da; g.balls.push({ x: src.x, y: src.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: 6, stuck: false, trail: [] }); } }
  g.score += 15; tone([660, 880, 1100], 0.06, 0.04, "triangle"); toast(`${f.g.icon} ${f.g.name}!`); burst(f.x, f.y, f.g.c, 12); hud();
}
function loseBall() {
  const g = G; g.lives--; g.hitFlash = 0.5; g.shake = 0.4; g.pad.wide = 0; g.pad.arrow = 0; g.pad.slow = 0; g.gifts.length = 0; g.fires.length = 0; hud();
  if (g.lives <= 0) { gameOver(); return; }
  g.balls = [newBall()]; g.launched = false; toast(`${pick(PEI_LOSE)}`, 2200);
}

// ---------------------------------------------------------------- 그리기
function draw() {
  const g = G;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.clearRect(0, 0, W, H);
  const st = g ? g.stage : 1;
  const sky = [["#1a1631", "#2a2050"], ["#13213a", "#1f3a66"], ["#2a1630", "#5a2a4a"], ["#0b0d24", "#1d1a44"]][Math.floor((st - 1) / 3) % 4];
  const grd = ctx.createLinearGradient(0, 0, 0, H); grd.addColorStop(0, sky[0]); grd.addColorStop(1, sky[1]); ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 40; i++) { const x = (i * 97) % W, y = (i * 53) % (H - 100); ctx.fillStyle = `rgba(255,255,255,${0.15 + ((i * 7) % 5) * 0.1})`; ctx.fillRect(x, y, 2, 2); }
  if (!g) return;
  ctx.save(); if (g.shake > 0) ctx.translate(rnd(-3, 3) * g.shake, rnd(-3, 3) * g.shake);
  // 블록
  for (const br of g.bricks) {
    const kd = KIND[br.kind], a = 0.55 + 0.45 * (br.hp / br.max);
    ctx.fillStyle = kd.c; ctx.globalAlpha = a; ctx.beginPath(); ctx.roundRect(br.x, br.y, BW, BH, 4); ctx.fill(); ctx.globalAlpha = 1;
    ctx.fillStyle = "rgba(255,255,255,.18)"; ctx.fillRect(br.x + 3, br.y + 2, BW - 6, 3);
    if (kd.name) { ctx.fillStyle = "#ff3b3b"; ctx.beginPath(); ctx.arc(br.x + BW / 2 - 5, br.y + BH / 2, 2, 0, 7); ctx.arc(br.x + BW / 2 + 5, br.y + BH / 2, 2, 0, 7); ctx.fill(); ctx.fillStyle = "#d9c6ff"; ctx.beginPath(); ctx.moveTo(br.x + BW / 2 - 9, br.y + 3); ctx.lineTo(br.x + BW / 2 - 12, br.y - 3); ctx.lineTo(br.x + BW / 2 - 5, br.y + 1); ctx.fill(); ctx.beginPath(); ctx.moveTo(br.x + BW / 2 + 9, br.y + 3); ctx.lineTo(br.x + BW / 2 + 12, br.y - 3); ctx.lineTo(br.x + BW / 2 + 5, br.y + 1); ctx.fill(); if (br.kind === "G") { ctx.fillStyle = "#ffd34a"; ctx.fillRect(br.x + BW / 2 - 6, br.y - 2, 12, 3); } }
    else if (br.max > 1) { ctx.fillStyle = "rgba(255,255,255,.55)"; for (let i = 0; i < br.hp; i++) ctx.fillRect(br.x + 6 + i * 7, br.y + BH - 5, 4, 2); }
  }
  // 대왕용
  if (g.boss) { const bs = g.boss, r = bs.r; ctx.save(); ctx.translate(bs.x, bs.y); const f = Math.sin(g.t * 8) * 6;
    ctx.fillStyle = "#3a0c1c"; ctx.beginPath(); ctx.moveTo(-r * .6, -r * .3); ctx.lineTo(-r * 1.9, -r * 1.1 - f); ctx.lineTo(-r * 1.5, r * .3); ctx.fill(); ctx.beginPath(); ctx.moveTo(r * .6, -r * .3); ctx.lineTo(r * 1.9, -r * 1.1 - f); ctx.lineTo(r * 1.5, r * .3); ctx.fill();
    ctx.fillStyle = "#6a1030"; ctx.beginPath(); ctx.moveTo(-r * .9, -r * .2); ctx.lineTo(-r * 1.4, r * 1.1); ctx.lineTo(r * 1.4, r * 1.1); ctx.lineTo(r * .9, -r * .2); ctx.fill();
    const gr = ctx.createRadialGradient(-r * .3, -r * .3, r * .2, 0, 0, r); gr.addColorStop(0, bs.hit > 0 ? "#ff8aa0" : "#8a3050"); gr.addColorStop(1, "#4a1020"); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill();
    ctx.fillStyle = "#ffb347"; ctx.beginPath(); ctx.moveTo(-r * .55, -r * .7); ctx.lineTo(-r * .85, -r * 1.35); ctx.lineTo(-r * .2, -r * .9); ctx.fill(); ctx.beginPath(); ctx.moveTo(r * .55, -r * .7); ctx.lineTo(r * .85, -r * 1.35); ctx.lineTo(r * .2, -r * .9); ctx.fill();
    ctx.fillStyle = "#ff3b3b"; ctx.shadowColor = "#ff3b3b"; ctx.shadowBlur = 8; ctx.beginPath(); ctx.arc(-r * .3, -r * .1, r * .14, 0, 7); ctx.arc(r * .3, -r * .1, r * .14, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
    ctx.fillStyle = "#ffd34a"; ctx.beginPath(); ctx.moveTo(-r * .5, -r * 1.05); ctx.lineTo(-r * .4, -r * 1.5); ctx.lineTo(-r * .15, -r * 1.15); ctx.lineTo(0, -r * 1.6); ctx.lineTo(r * .15, -r * 1.15); ctx.lineTo(r * .4, -r * 1.5); ctx.lineTo(r * .5, -r * 1.05); ctx.fill();
    ctx.restore();
    ctx.fillStyle = "rgba(0,0,0,.5)"; ctx.fillRect(80, 48, 200, 10); ctx.fillStyle = "#ff6b8a"; ctx.fillRect(80, 48, 200 * Math.max(0, bs.hp) / bs.max, 10); ctx.fillStyle = "#fff"; ctx.font = "800 11px Pretendard, sans-serif"; ctx.textAlign = "center"; ctx.fillText(`대왕용 ♥${Math.max(0, bs.hp)}`, 180, 44);
  }
  // 불덩이
  for (const f of g.fires) { ctx.fillStyle = "#ff6b6b"; ctx.shadowColor = "#ff9a2e"; ctx.shadowBlur = 10; ctx.beginPath(); ctx.arc(f.x, f.y, 7, 0, 7); ctx.fill(); ctx.shadowBlur = 0; ctx.fillStyle = "#ffd34a"; ctx.beginPath(); ctx.arc(f.x, f.y, 3, 0, 7); ctx.fill(); }
  // 선물
  for (const f of g.gifts) { ctx.fillStyle = f.g.c; ctx.globalAlpha = .9; ctx.beginPath(); ctx.roundRect(f.x - 13, f.y - 10, 26, 20, 7); ctx.fill(); ctx.globalAlpha = 1; ctx.fillStyle = "#1a1530"; ctx.font = "800 12px Pretendard, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(f.g.icon, f.x, f.y + 1); ctx.textBaseline = "alphabetic"; }
  // 화살
  ctx.strokeStyle = "#ff9ad5"; ctx.lineWidth = 2; for (const a of g.arrows) { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(a.x, a.y + 10); ctx.stroke(); }
  // 방패 + 캐릭터
  const py = H - 70, pw = padW();
  ctx.save(); ctx.translate(g.pad.x, py);
  ctx.shadowColor = g.pad.wide > 0 ? "#5ec8ff" : "#ffd34a"; ctx.shadowBlur = 14;
  const pg = ctx.createLinearGradient(-pw / 2, 0, pw / 2, 0); pg.addColorStop(0, "#ffe27a"); pg.addColorStop(0.5, "#fff6c2"); pg.addColorStop(1, "#ffe27a"); ctx.fillStyle = pg;
  ctx.beginPath(); ctx.roundRect(-pw / 2, -6, pw, 14, 7); ctx.fill(); ctx.shadowBlur = 0;
  ctx.fillStyle = "#e0a93a"; ctx.beginPath(); ctx.roundRect(-pw / 2 + 4, 2, pw - 8, 4, 2); ctx.fill();
  if (g.pad.arrow > 0) { ctx.fillStyle = "#ff9ad5"; ctx.fillRect(-18, -14, 3, 8); ctx.fillRect(15, -14, 3, 8); }
  ctx.restore();
  const im = SPR[CHARS[P.char].id]; if (im) { const s = 1.6, iw = im.width * s, ih = im.height * s; ctx.imageSmoothingEnabled = false; ctx.drawImage(im, g.pad.x - iw / 2 + (g.pad.x < W / 2 ? 0 : 0), py - 8 - ih, iw, ih); ctx.imageSmoothingEnabled = true; }
  // 구슬
  for (const b of g.balls) {
    b.trail.forEach((t, i) => { ctx.fillStyle = `rgba(255,211,74,${(i / b.trail.length) * 0.35})`; ctx.beginPath(); ctx.arc(t.x, t.y, b.r * (i / b.trail.length), 0, 7); ctx.fill(); });
    ctx.fillStyle = "#ffd34a"; ctx.shadowColor = "#ffd34a"; ctx.shadowBlur = 12; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 7); ctx.fill(); ctx.shadowBlur = 0; ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(b.x - 2, b.y - 2, 2, 0, 7); ctx.fill();
    if (b.stuck && !AUTO) { ctx.fillStyle = "rgba(255,255,255,.8)"; ctx.font = "700 11px Pretendard, sans-serif"; ctx.textAlign = "center"; ctx.fillText("누르면 출발", b.x, b.y - 16 - (SPR[CHARS[P.char].id] ? 56 : 0)); }
  }
  // 효과 표시(남은 시간)
  let ex = 8; const eff = [["wide", g.pad.wide, "🛡"], ["slow", g.pad.slow, "🐢"], ["arrow", g.pad.arrow, "🏹"]].filter((e) => e[1] > 0);
  for (const e of eff) { ctx.fillStyle = "rgba(0,0,0,.45)"; ctx.beginPath(); ctx.roundRect(ex, H - 30, 52, 20, 10); ctx.fill(); ctx.fillStyle = "#fff"; ctx.font = "700 11px Pretendard, sans-serif"; ctx.textAlign = "left"; ctx.fillText(`${e[2]} ${Math.ceil(e[1])}초`, ex + 7, H - 16); ex += 58; }
  for (const p of g.parts) { ctx.globalAlpha = Math.min(1, p.t * 2); ctx.fillStyle = p.c; ctx.fillRect(p.x, p.y, p.r, p.r); } ctx.globalAlpha = 1;
  if (g.hitFlash > 0) { ctx.fillStyle = `rgba(255,80,100,${g.hitFlash * 0.35})`; ctx.fillRect(0, 0, W, H); }
  ctx.restore();
}

// ---------------------------------------------------------------- 프레임·입력
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.04, (now - last) / 1000) * (FAST ? 2.5 : 1); last = now;
  if (G && (mode === "play" || mode === "clear")) update(dt);
  draw(); requestAnimationFrame(frame);
}
const pos = (e) => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height }; };
let drag = null;
cv.addEventListener("pointerdown", (e) => { if (!G || mode !== "play") return; e.preventDefault(); const p = pos(e); drag = { id: e.pointerId, ox: p.x - G.pad.x, moved: false }; cv.setPointerCapture(e.pointerId); });
cv.addEventListener("pointermove", (e) => { if (!G || !drag || drag.id !== e.pointerId || mode !== "play") return; const p = pos(e); const nx = p.x - drag.ox; if (Math.abs(nx - G.pad.x) > 2) drag.moved = true; G.pad.x = nx; });
const up = (e) => { if (!G || !drag || drag.id !== e.pointerId) return; const stuck = G.balls.filter((b) => b.stuck); if (stuck.length && mode === "play") stuck.forEach(launchBall); drag = null; };
cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
addEventListener("keydown", (e) => {
  if (!G) return; G.keys = G.keys || new Set();
  if (e.key === "ArrowLeft") G.keys.add("left"); if (e.key === "ArrowRight") G.keys.add("right");
  if ((e.key === " " || e.key === "Enter") && mode === "play") { G.balls.filter((b) => b.stuck).forEach(launchBall); e.preventDefault(); }
  if (e.key === "Escape" || e.key === "p") { if (mode === "play") pause(); else if (mode === "pause") { hideScreen(); mode = "play"; last = performance.now(); } }
});
addEventListener("keyup", (e) => { if (!G || !G.keys) return; if (e.key === "ArrowLeft") G.keys.delete("left"); if (e.key === "ArrowRight") G.keys.delete("right"); });
$("btnMenu").onclick = pause;
$("btnSound").onclick = () => { P.sound = !P.sound; save(); hud(); };
document.addEventListener("visibilitychange", () => { if (document.hidden && mode === "play") pause(); });
const DPR = Math.min(2, window.devicePixelRatio || 1); cv.width = W * DPR; cv.height = H * DPR;

// ---------------------------------------------------------------- 시작
load();
Promise.all(CHARS.map((c) => new Promise((res) => { const im = new Image(); im.onload = () => { SPR[c.id] = im; res(); }; im.onerror = res; im.src = `assets/${c.id}.png`; }))).then(() => {
  const hp = new URLSearchParams(location.hash.slice(1));
  // 개발용: #stage=N 바로 시작 · &auto 방패 자동 · &fast 2.5배속
  if (hp.has("stage") || hp.has("auto")) { P.sound = false; AUTO = hp.has("auto"); FAST = hp.has("fast"); startStage(clamp(Number(hp.get("stage")) || 1, 1, LEVELS.length)); }
  else title();
  requestAnimationFrame(frame);
});
window.__bricks = { get G() { return G; }, get mode() { return mode; }, P, LEVELS, startStage };
