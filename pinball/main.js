// 퓨어데이 핀볼 (2026-10-21 대표님 요청)
// - 스테이지 = 포털에 공개된 회차 × 4 (회차 대표 그림 + 그 회차 장면 셋). 포털 ../data.js 를 읽으니 회차가 올라가면 저절로 늘어난다
// - 공이 튈 때마다 점수, 목표 점수를 넘으면 스테이지 클리어
// - 미션 핀을 모두 맞추면 캐릭터 스페셜 능력: 조아름 멀티볼 · 아퀼라 날개 세이브 · 조성민 박사 점수 2배 · 조하임 슬로모션
const cv = document.getElementById("cv"), ctx = cv.getContext("2d");
const W = 400, H = 720;                  // 테이블 논리 크기
const $ = (id) => document.getElementById(id);
const SAVE_KEY = "pureday-pinball-v1";
const BALL_R = 9, GRAV = 640, SUB = 8, MAXV = 1050;   // 2026-10-21: 공이 너무 빨리 떨어져 → 중력·최고 속도 낮춤
const DRAG = 0.18;   // 공기 저항(1초에 약 18% 감속 비율) — 떨어지는 공을 받기 쉽게
const PER_EP = 4;
const REST_Y = 636;          // 발사대에서 공이 놓이는 높이 (그 아래는 스프링 핸들)

// ---------------------------------------------------------------- 스테이지 (포털 회차에서)
let STAGES = [];
function loadPortal() {
  return new Promise((res) => {
    const s = document.createElement("script");
    s.src = `../data.js?v=${Math.floor(Date.now() / 600000)}`;   // 10분마다 새로 (새 회차 반영)
    s.onload = res; s.onerror = res;
    document.head.appendChild(s);
  });
}
function buildStages() {
  const P = window.PORTAL;
  const eps = [];
  if (P) for (const se of P.series) {
    if (!se.id.startsWith("pureday")) continue;
    const season = se.id === "pureday" ? "시즌1" : "시즌2";
    for (const e of se.episodes) if (e.pages && e.pages.length) eps.push({ season, label: e.label || `${e.num}화`, title: e.title, thumb: e.thumb, pages: e.pages });
  }
  STAGES = [];
  eps.forEach((e, ei) => {
    const pick = [e.thumb, e.pages[Math.floor(e.pages.length * 0.3)], e.pages[Math.floor(e.pages.length * 0.6)], e.pages[Math.floor(e.pages.length * 0.88)]];
    for (let k = 0; k < PER_EP; k++) STAGES.push({ ep: e, epIndex: ei, sub: k, bg: "../" + pick[k] });
  });
  return eps;
}
let EPS = [];

// ---------------------------------------------------------------- 저장
const SAVE = { unlocked: 0, best: {}, sound: true };
function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(SAVE)); } catch (e) { /* 저장 안 됨 */ } }
function load() { try { Object.assign(SAVE, JSON.parse(localStorage.getItem(SAVE_KEY) || "{}")); } catch (e) { /* 저장 안 됨 */ } }

// ---------------------------------------------------------------- 소리
let actx = null;
function tone(freqs, dur = 0.05, vol = 0.04, type = "triangle") {
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
let lastBlip = 0;
function blip(f, v = 0.03) { const n = performance.now(); if (n - lastBlip < 35) return; lastBlip = n; tone([f], 0.04, v, "square"); }

// ---------------------------------------------------------------- 테이블 모양 (고정 벽)
const WALLS = [];
const SOLIDS = [];   // 속이 찬 삼각형 (슬링샷)
function inTri(x, y, t) {
  const s = (a, b) => (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
  const d1 = s(t[0], t[1]), d2 = s(t[1], t[2]), d3 = s(t[2], t[0]);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}
const wall = (ax, ay, bx, by, e = 0.5, kind = "wall") => WALLS.push({ ax, ay, bx, by, e, kind });
(function buildWalls() {
  // 위쪽 둥근 지붕 (반타원)
  const cx = 200, cy = 175, rx = 180, ry = 140, N = 18;
  let px = cx - rx, py = cy;
  for (let i = 1; i <= N; i++) {
    const a = Math.PI + (Math.PI * i) / N;
    const x = cx + rx * Math.cos(a), y = cy + ry * Math.sin(a);
    wall(px, py, x, y, 0.45); px = x; py = y;
  }
  wall(20, 175, 20, 574);              // 왼쪽 벽
  wall(380, 175, 380, 715);            // 오른쪽 바깥 벽 (발사 통로 오른쪽)
  wall(350, 215, 350, 715);            // 발사 통로 왼쪽 벽
  wall(350, 715, 380, 715, 0.1);       // 발사대 바닥
  // 아랫길: 플리퍼와 같은 기울기(약 24°)로, 끝을 플리퍼 축 윗면(축 y−8)에 맞춰 턱 없이 이어지게 (2026-10-21: 이음매 틈에 공이 끼던 문제)
  wall(20, 574, 105, 612);             // 왼쪽 아랫길 (플리퍼 축 윗면에 이어짐)
  wall(350, 574, 265, 612);            // 오른쪽 아랫길
  // 슬링샷 (안쪽 빗변이 튕겨 낸다)
  wall(55, 455, 55, 520, 0.5); wall(55, 520, 95, 560, 0.5); wall(55, 455, 95, 560, 0.5, "sling");
  wall(315, 455, 315, 520, 0.5); wall(315, 520, 275, 560, 0.5); wall(315, 455, 275, 560, 0.5, "sling");
  // 2026-10-21: 슬링샷은 속이 찬 블록 — 공 중심이 삼각형 안에 들어가면 밖으로 밀어낸다. 꼭짓점엔 둥근 기둥(반지름 4)
  SOLIDS.push([[55, 455], [55, 520], [95, 560]], [[315, 455], [315, 520], [275, 560]]);
  // 발사 통로 꼭대기에서 들판으로 공을 보내는 작은 비탈
  wall(350, 215, 330, 196, 0.4);
})();

// 플리퍼: 축, 길이, 쉬는 각도 / 올린 각도
const FLIP = [
  // 쉬고 있을 때 두 플리퍼 끝 사이(살 두께 빼고)가 공 지름보다 넓어야 공이 끼지 않고 빠진다 (끝 사이 ≈ 41, 빈틈 ≈ 27 > 18)
  // 2026-10-21: 더 완만하게(쉬는 각 0.42 ≈ 24°). 끝 사이 ≈ 41, 살 두께 빼면 빈틈 ≈ 27 > 공 지름 18
  // 2026-10-21: 플리퍼 길이 62 → 68 (축을 바깥으로 4씩). 끝 사이 ≈ 38, 빈틈 ≈ 24 > 공 18
  { px: 104, py: 620, len: 68, rest: 0.42, up: -0.45, a: 0.42, w: 0, key: false, side: "L" },
  { px: 266, py: 620, len: 68, rest: Math.PI - 0.42, up: Math.PI + 0.45, a: Math.PI - 0.42, w: 0, key: false, side: "R" },
];
const FLIP_SPEED = 26;

// ---------------------------------------------------------------- 게임 상태
const G = { mode: "title", stage: 0, score: 0, target: 0, ballsLeft: 3, balls: [], bumpers: [], pins: [], pinsHit: 0,
  charge: 0, charging: false, ability: null, abilityT: 0, mult: 1, slow: 1, save: 0, wing: 0, flash: [], t: 0, img: null, msg: null, specials: 0 };
window.__pinball = G;   // 개발용: 콘솔·자동 시험에서 상태 보기 (window.__pinballUpdate 도)
let rng = Math.random;
function seeded(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

function setupStage(i) {
  G.stage = i; const st = STAGES[i];
  rng = seeded(i * 7919 + 13);
  G.target = 2500 + i * 150;   // 1단계 2,500 → 96단계 약 16,750
  G.score = 0; G.ballsLeft = 3; G.balls = []; G.pinsHit = 0; G.mult = 1; G.slow = 1; G.wing = 0; G.ability = null; G.abilityT = 0; G.specials = 0;
  // 범퍼: 3개 (+25단계마다 1개, 최대 5). 서로·벽에서 떨어지게
  const nb = Math.min(5, 3 + Math.floor(i / 25));
  G.bumpers = [];
  for (let tries = 0; G.bumpers.length < nb && tries < 400; tries++) {
    const b = { x: 75 + rng() * 210, y: 175 + rng() * 210, r: 22 + Math.round(rng() * 4), hit: 0 };
    if (G.bumpers.every((o) => Math.hypot(o.x - b.x, o.y - b.y) > o.r + b.r + 30)) G.bumpers.push(b);
  }
  // 미션 핀: 3개 (+20단계마다 1개, 최대 6)
  const np = Math.min(6, 3 + Math.floor(i / 20));
  G.pins = [];
  for (let tries = 0; G.pins.length < np && tries < 600; tries++) {
    const p = { x: 50 + rng() * 270, y: 110 + rng() * 330, r: 9, lit: false, glow: 0 };
    if (p.y < 175 && Math.abs(p.x - 200) > 120) continue;   // 지붕 밖
    if (G.bumpers.every((o) => Math.hypot(o.x - p.x, o.y - p.y) > o.r + 40) && G.pins.every((o) => Math.hypot(o.x - p.x, o.y - p.y) > 50)) G.pins.push(p);
  }
  G.img = null;
  const im = new Image(); im.onload = () => { if (G.stage === i) G.img = im; }; im.src = st.bg;
  newBall();
}
function newBall() {
  G.balls = [{ x: 366, y: REST_Y, vx: 0, vy: 0, inLane: true }];
  G.save = 6;   // 새 공 6초 동안은 떨어져도 돌려준다
  showLaunch(true);
}
function launch(power) {
  const b = G.balls.find((x) => x.inLane);
  if (!b) return;
  // 강약: 게이지 0 → 약하게(통로 위까지 못 가고 다시 내려올 수도), 1 → 아주 세게
  power = Math.max(0, Math.min(1, power));
  b.vy = -(470 + power * 640) * (0.98 + Math.random() * 0.04); b.inLane = false;   // 중력이 줄어 발사 세기도 맞춤 (약하면 되돌아옴)
  G.release = 0.18;   // 핸들이 튀어 올라가는 모습
  tone([220 + power * 300, 500 + power * 400], 0.06, 0.05);
  showLaunch(G.balls.some((x) => x.inLane));
}

// ---------------------------------------------------------------- 물리
function hitSeg(b, ax, ay, bx, by, rad, e, surf) {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
  let t = L2 ? ((b.x - ax) * dx + (b.y - ay) * dy) / L2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + dx * t, cy = ay + dy * t;
  let nx = b.x - cx, ny = b.y - cy;
  const d = Math.hypot(nx, ny), R = BALL_R + rad;
  if (d >= R || d === 0) return 0;
  nx /= d; ny /= d;
  b.x = cx + nx * R; b.y = cy + ny * R;
  let svx = 0, svy = 0;
  if (surf) [svx, svy] = surf(cx, cy);
  const rvx = b.vx - svx, rvy = b.vy - svy, vn = rvx * nx + rvy * ny;
  if (vn >= 0) return 0;
  b.vx -= (1 + e) * vn * nx; b.vy -= (1 + e) * vn * ny;
  return { speed: -vn, nx, ny };
}
function hitCircle(b, o, e) {
  let nx = b.x - o.x, ny = b.y - o.y;
  const d = Math.hypot(nx, ny), R = BALL_R + o.r;
  if (d >= R || d === 0) return 0;
  nx /= d; ny /= d;
  b.x = o.x + nx * R; b.y = o.y + ny * R;
  const vn = b.vx * nx + b.vy * ny;
  if (vn >= 0) return 0;
  b.vx -= (1 + e) * vn * nx; b.vy -= (1 + e) * vn * ny;
  return { speed: -vn, nx, ny };
}
function addScore(n, x, y) {
  const v = Math.round(n * G.mult);
  G.score += v;
  if (x != null && v >= 50) G.flash.push({ x, y, text: `+${v}`, t: 0 });
}
function step(dt) {
  // 플리퍼
  for (const f of FLIP) {
    const want = f.key ? f.up : f.rest, old = f.a;
    const d = want - f.a, m = FLIP_SPEED * dt;
    f.a += Math.abs(d) <= m ? d : Math.sign(d) * m;
    f.w = (f.a - old) / dt;
  }
  for (const b of G.balls) {
    b.vy += GRAV * dt;
    const dr = 1 - DRAG * dt; b.vx *= dr; b.vy *= dr;
    const sp = Math.hypot(b.vx, b.vy); if (sp > MAXV) { b.vx *= MAXV / sp; b.vy *= MAXV / sp; }
    const ox = b.x, oy = b.y;
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.inLane) { b.x = 366; b.y = REST_Y + G.charge * 34; b.vx = 0; b.vy = 0; continue; }   // 핸들을 당기면 공도 같이 내려간다
    // 발사대로 굴러 들어온 공(약하게 쐈거나 통로로 되돌아온 공)은 다시 발사 대기
    if (b.x > 352 && b.y > REST_Y - 4 && b.vy >= 0) { b.inLane = true; b.x = 366; b.y = REST_Y; G.needLaunch = true; continue; }
    // 벽
    for (const w of WALLS) {
      const h = hitSeg(b, w.ax, w.ay, w.bx, w.by, 0, w.e);
      if (!h) continue;
      if (w.kind === "sling" && h.speed > 60) { b.vx += h.nx * 330; b.vy += h.ny * 330; addScore(50, b.x, b.y); blip(700); w.lit = 0.2; }
      else if (h.speed > 90) { addScore(10); blip(240 + Math.min(400, h.speed * 0.3), 0.015); }
    }
    // 슬링샷 꼭짓점 기둥 + 안으로 파고들었으면 바깥(이전 자리)으로 되돌리고 튕겨 낸다
    for (const t of SOLIDS) {
      for (const [vx, vy] of t) hitCircle(b, { x: vx, y: vy, r: 4 }, 0.5);
      if (inTri(b.x, b.y, t)) {
        b.x = ox; b.y = oy;
        if (inTri(b.x, b.y, t)) {   // 이전 자리도 안이면 가장 가까운 변 밖으로
          let best = null;
          for (let k = 0; k < 3; k++) {
            const [a, c] = [t[k], t[(k + 1) % 3]], dx = c[0] - a[0], dy = c[1] - a[1], L2 = dx * dx + dy * dy;
            const u = Math.max(0, Math.min(1, ((b.x - a[0]) * dx + (b.y - a[1]) * dy) / L2)), px = a[0] + dx * u, py = a[1] + dy * u;
            const d = Math.hypot(b.x - px, b.y - py);
            if (!best || d < best.d) best = { d, px, py };
          }
          const cx = (t[0][0] + t[1][0] + t[2][0]) / 3, cy = (t[0][1] + t[1][1] + t[2][1]) / 3;
          let nx = best.px - cx, ny = best.py - cy; const n = Math.hypot(nx, ny) || 1; nx /= n; ny /= n;
          b.x = best.px + nx * (BALL_R + 1); b.y = best.py + ny * (BALL_R + 1);
        }
        b.vx = -b.vx * 0.5; b.vy = -b.vy * 0.5;
      }
    }
    // 아퀼라 날개 (배수구 막기)
    if (G.wing > 0) { const h = hitSeg(b, 70, 680, 300, 680, 4, 0.9); if (h && h.speed > 40) { b.vy = Math.min(b.vy, -650); blip(900); } }
    // 플리퍼 (돌고 있으면 표면 속도를 더한다)
    for (const f of FLIP) {
      const tx = f.px + Math.cos(f.a) * f.len, ty = f.py + Math.sin(f.a) * f.len;
      const h = hitSeg(b, f.px, f.py, tx, ty, 7, 0.25, (cx, cy) => [-f.w * (cy - f.py), f.w * (cx - f.px)]);
      if (h && h.speed > 200) blip(180, 0.02);
    }
    // 범퍼
    for (const o of G.bumpers) {
      const h = hitCircle(b, o, 0.6);
      if (h) { b.vx += h.nx * 300 + (Math.random() - 0.5) * 60; b.vy += h.ny * 300;   // 옆으로 살짝 흔들어 범퍼 위에서 제자리 튀기 방지
        o.hit = 0.25; addScore(100, o.x, o.y - o.r); blip(520 + Math.random() * 200, 0.05); }
    }
    // 미션 핀
    for (const p of G.pins) {
      const h = hitCircle(b, p, 0.7);
      if (!h) continue;
      p.glow = 0.4;
      if (!p.lit) {
        p.lit = true; G.pinsHit++; addScore(250, p.x, p.y - 12); tone([880, 1320], 0.06, 0.05);
        if (G.pins.every((q) => q.lit)) special();
      } else addScore(20);
    }
  }
}

// ---------------------------------------------------------------- 스페셜 능력
const ABILITIES = [
  { id: "multi", who: "조아름", img: "areum", name: "빛의 화살 멀티볼", t: 0 },
  { id: "wing", who: "아퀼라", img: "aquila", name: "날개 세이브", t: 20 },
  { id: "double", who: "조성민 박사", img: "drjo", name: "글래스 점수 2배", t: 20 },
  { id: "slow", who: "조하임", img: "heim", name: "집중 슬로모션", t: 10 },
];
function special() {
  const a = ABILITIES[(G.stage + G.specials) % ABILITIES.length];   // 스테이지마다 다른 능력부터, 다시 모으면 다음 능력
  G.specials++;
  G.ability = a; G.abilityT = a.t;
  if (a.id === "multi") {
    const src = G.balls.find((b) => !b.inLane) || { x: 200, y: 300 };
    for (const dx of [-1, 1]) G.balls.push({ x: src.x + dx * 14, y: Math.min(src.y, 400), vx: dx * 260, vy: -520, inLane: false });
    G.abilityT = 3;
  } else if (a.id === "wing") G.wing = a.t;
  else if (a.id === "double") G.mult = 2;
  else if (a.id === "slow") G.slow = 0.55;
  addScore(1000, 200, 300);
  tone([523, 659, 784, 1046, 1318], 0.09, 0.07);
  banner(`스페셜! ${a.who} — ${a.name}`);
  setTimeout(() => { for (const p of G.pins) p.lit = false; }, 900);   // 핀은 다시 켤 수 있게
}
function endAbility() {
  if (!G.ability) return;
  if (G.ability.id === "double") G.mult = 1;
  if (G.ability.id === "slow") G.slow = 1;
  if (G.ability.id === "wing") G.wing = 0;
  G.ability = null;
}

// ---------------------------------------------------------------- 진행
function update(dt) {
  G.t += dt;
  for (const f of G.flash) f.t += dt; G.flash = G.flash.filter((f) => f.t < 0.8);
  for (const o of G.bumpers) o.hit = Math.max(0, o.hit - dt);
  for (const p of G.pins) p.glow = Math.max(0, p.glow - dt);
  if (G.mode !== "play") return;
  // 꾹 누르는 동안 게이지가 오른다 (1.3초면 가득). 끌어서 조절하면 그 값 그대로
  if (G.charging && !G.dragging) G.charge = Math.min(1, G.charge + dt * 0.75);
  if (G.release > 0) G.release -= dt;
  if (G.needLaunch) { G.needLaunch = false; showLaunch(true); banner("발사대로 돌아왔어요 — 다시 발사!"); }
  const sdt = (dt * G.slow) / SUB;
  for (let k = 0; k < SUB; k++) step(sdt);
  G.save = Math.max(0, G.save - dt);
  for (const b of G.balls) {
    if (b.inLane) { b.still = 0; continue; }
    const slow = Math.hypot(b.vx, b.vy) < 25 && !FLIP[0].key && !FLIP[1].key;
    b.still = slow ? (b.still || 0) + dt : 0;
    if (b.still > 1.8) { b.vx += (b.x < 185 ? 1 : -1) * 70; b.vy += 60; b.still = 0; }   // 가운데 쪽 아래로 톡
  }
  if (G.wing > 0) G.wing = Math.max(0, G.wing - dt);
  if (G.ability) { G.abilityT -= dt; if (G.abilityT <= 0) endAbility(); }
  // 떨어진 공
  const lost = G.balls.filter((b) => b.y > H + 30 || b.x < -40 || b.x > W + 40);
  if (lost.length) {
    G.balls = G.balls.filter((b) => !lost.includes(b));
    if (!G.balls.length) {
      if (G.save > 0) { banner("세이브! 공을 돌려줘요"); newBall(); }
      else {
        G.ballsLeft--; endAbility();
        if (G.ballsLeft <= 0) return fail();
        banner(`공 ${G.ballsLeft}개 남았어요`); tone([330, 220], 0.12, 0.05, "sawtooth");
        newBall();
      }
    }
  }
  if (G.score >= G.target) clear();
}
window.__pinballUpdate = (dt) => update(dt);
window.__pinballFlip = () => { for (const f of FLIP) f.key = Math.random() < 0.5; };   // 개발용: 무작위 플리퍼
function clear() {
  G.mode = "clear";
  const i = G.stage, best = SAVE.best[i] || 0;
  SAVE.best[i] = Math.max(best, G.score);
  SAVE.unlocked = Math.max(SAVE.unlocked, Math.min(STAGES.length - 1, i + 1));
  save();
  tone([523, 659, 784, 1046], 0.13, 0.07);
  const st = STAGES[i], last = i === STAGES.length - 1;
  showScreen(`<h2>STAGE ${i + 1} 클리어!</h2>
    <img class="bg" src="${st.bg}" alt="">
    <p><b>${st.ep.season} ${st.ep.label} 「${st.ep.title}」</b> · 장면 ${st.sub + 1}/4</p>
    <p>점수 ${G.score.toLocaleString()} ${best && G.score <= best ? `(최고 ${best.toLocaleString()})` : "· 최고 기록!"}</p>
    ${last ? `<p>지금 공개된 마지막 스테이지까지 왔어요! 새 회차가 올라오면 스테이지가 늘어나요.</p><button class="big" id="sMenu">스테이지 고르기</button>`
      : `<button class="big" id="sNext">다음 스테이지 ▶</button><button class="ghost" id="sMenu">스테이지 고르기</button>`}`);
  if ($("sNext")) $("sNext").onclick = () => startStage(i + 1);
  $("sMenu").onclick = stageMenu;
}
function fail() {
  G.mode = "over";
  tone([392, 330, 262], 0.16, 0.06);
  const st = STAGES[G.stage];
  showScreen(`<h2>공을 모두 잃었어요</h2>
    <p>STAGE ${G.stage + 1} · ${st.ep.label} 「${st.ep.title}」</p>
    <p>점수 ${G.score.toLocaleString()} / 목표 ${G.target.toLocaleString()}</p>
    <p class="how">🦜 페이: 미션 핀(반짝이는 다이아몬드)을 모두 맞추면 스페셜 능력이 나와요!</p>
    <button class="big" id="sRetry">다시 도전</button><button class="ghost" id="sMenu">스테이지 고르기</button>`);
  $("sRetry").onclick = () => startStage(G.stage);
  $("sMenu").onclick = stageMenu;
}
let bannerT = 0, bannerText = "";
function banner(t) { bannerText = t; bannerT = 2; }

// ---------------------------------------------------------------- 발사 핸들 · 강약 게이지
function drawPlunger() {
  const waiting = G.balls.some((b) => b.inLane);
  const pull = G.charge * 34 - (G.release > 0 ? G.release * 40 : 0);
  // 스프링 (발사대 바닥 715 ~ 핸들 머리)
  const top = REST_Y + 10 + pull;
  ctx.strokeStyle = "#c9c9d6"; ctx.lineWidth = 2; ctx.beginPath();
  const turns = 7, h = 712 - top;
  for (let k = 0; k <= turns * 2; k++) { const y = top + 6 + (h - 6) * (k / (turns * 2)); ctx.lineTo(k % 2 ? 372 : 360, y); }
  ctx.stroke();
  // 핸들 머리 (공을 받치는 판)
  ctx.fillStyle = "#ffd34a"; ctx.shadowColor = "#ffd34a"; ctx.shadowBlur = waiting ? 10 : 0;
  ctx.fillRect(355, top, 22, 6); ctx.shadowBlur = 0;
  if (!waiting) return;
  // 강약 게이지 (발사 통로 왼쪽 벽 안쪽에): 아래 약 → 위 강
  const gx = 386, gy0 = 712, gh = 170, gw = 9;   // 발사 통로 오른쪽 바깥 (테이블 선과 안 겹치게)
  const g = ctx.createLinearGradient(0, gy0, 0, gy0 - gh);
  g.addColorStop(0, "#7fe07a"); g.addColorStop(0.55, "#ffd34a"); g.addColorStop(1, "#ff4a3d");
  ctx.fillStyle = "rgba(0,0,0,.55)"; ctx.fillRect(gx - 2, gy0 - gh - 2, gw + 4, gh + 4);
  ctx.fillStyle = g; ctx.fillRect(gx, gy0 - gh * G.charge, gw, gh * G.charge);
  ctx.strokeStyle = "#fff"; ctx.lineWidth = 1;
  for (const t of [0.33, 0.66]) { ctx.beginPath(); ctx.moveTo(gx - 3, gy0 - gh * t); ctx.lineTo(gx + gw + 3, gy0 - gh * t); ctx.stroke(); }
  ctx.fillStyle = "#fff"; ctx.font = `900 9px ${getComputedStyle(document.body).fontFamily}`; ctx.textAlign = "center";
  ctx.fillText("강", gx + gw / 2, gy0 - gh - 6);
}

// ---------------------------------------------------------------- 그리기
function draw() {
  ctx.setTransform(cv.width / W, 0, 0, cv.height / H, 0, 0);
  ctx.fillStyle = "#14101f"; ctx.fillRect(0, 0, W, H);
  // 배경: 회차 그림 (테이블을 덮게 잘라서) + 어둡게
  if (G.img) {
    const im = G.img, s = Math.max(W / im.width, H / im.height);
    ctx.drawImage(im, (W - im.width * s) / 2, (H - im.height * s) / 2, im.width * s, im.height * s);
  }
  ctx.fillStyle = "rgba(10,8,24,.52)"; ctx.fillRect(0, 0, W, H);
  // 벽
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  for (const w of WALLS) {
    ctx.strokeStyle = w.kind === "sling" ? (w.lit > 0 ? "#fff" : "#7fd3ff") : "rgba(255,240,210,.9)";
    ctx.lineWidth = w.kind === "sling" ? 5 : 4;
    ctx.shadowColor = w.kind === "sling" ? "#7fd3ff" : "#ffd34a"; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.moveTo(w.ax, w.ay); ctx.lineTo(w.bx, w.by); ctx.stroke();
    if (w.lit > 0) w.lit -= 1 / 60;
  }
  ctx.shadowBlur = 0;
  // 발사 통로 힘 막대
  drawPlunger();
  // 범퍼
  for (const o of G.bumpers) {
    const g = ctx.createRadialGradient(o.x - 6, o.y - 6, 2, o.x, o.y, o.r);
    g.addColorStop(0, o.hit > 0 ? "#fff" : "#ffe9a0"); g.addColorStop(1, o.hit > 0 ? "#ffb35c" : "#d0782a");
    ctx.fillStyle = g; ctx.shadowColor = "#ffb35c"; ctx.shadowBlur = o.hit > 0 ? 26 : 10;
    ctx.beginPath(); ctx.arc(o.x, o.y, o.r + (o.hit > 0 ? 3 : 0), 0, 7); ctx.fill();
    ctx.shadowBlur = 0; ctx.strokeStyle = "#fff6"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(o.x, o.y, o.r - 6, 0, 7); ctx.stroke();
  }
  // 미션 핀 (다이아몬드)
  for (const p of G.pins) {
    const s = p.r + 3 + Math.sin(G.t * 5 + p.x) * (p.lit ? 0 : 1.5);
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.PI / 4);
    ctx.fillStyle = p.lit ? "#ffd34a" : "#c9a7ff"; ctx.shadowColor = p.lit ? "#ffd34a" : "#c9a7ff"; ctx.shadowBlur = p.lit || p.glow > 0 ? 20 : 8;
    ctx.fillRect(-s / 1.4, -s / 1.4, s * 1.41, s * 1.41);
    ctx.restore();
  }
  ctx.shadowBlur = 0;
  // 아퀼라 날개
  if (G.wing > 0) { ctx.strokeStyle = "#ffe39a"; ctx.lineWidth = 8; ctx.shadowColor = "#ffe39a"; ctx.shadowBlur = 18; ctx.globalAlpha = G.wing < 3 ? 0.5 + 0.5 * Math.sin(G.t * 20) : 1; ctx.beginPath(); ctx.moveTo(70, 680); ctx.lineTo(300, 680); ctx.stroke(); ctx.globalAlpha = 1; ctx.shadowBlur = 0; }
  // 공 세이브 표시
  if (G.save > 0 && G.mode === "play") { ctx.fillStyle = `rgba(127,211,255,${0.4 + 0.3 * Math.sin(G.t * 8)})`; ctx.font = `800 12px ${getComputedStyle(document.body).fontFamily}`; ctx.textAlign = "center"; ctx.fillText("BALL SAVE", 185, 700); }
  // 플리퍼
  for (const f of FLIP) {
    const tx = f.px + Math.cos(f.a) * f.len, ty = f.py + Math.sin(f.a) * f.len;
    ctx.strokeStyle = "#ffd34a"; ctx.lineWidth = 15; ctx.shadowColor = "#ffd34a"; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.moveTo(f.px, f.py); ctx.lineTo(tx, ty); ctx.stroke();
    ctx.shadowBlur = 0; ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(f.px, f.py, 4, 0, 7); ctx.fill();
  }
  // 공
  for (const b of G.balls) {
    const g = ctx.createRadialGradient(b.x - 3, b.y - 3, 1, b.x, b.y, BALL_R);
    g.addColorStop(0, "#fff"); g.addColorStop(1, "#9aa6c4");
    ctx.fillStyle = g; ctx.shadowColor = "#fff"; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.arc(b.x, b.y, BALL_R, 0, 7); ctx.fill();
  }
  ctx.shadowBlur = 0;
  // 점수 튀는 글자
  ctx.textAlign = "center"; ctx.font = `900 14px ${getComputedStyle(document.body).fontFamily}`;
  for (const f of G.flash) { ctx.globalAlpha = 1 - f.t / 0.8; ctx.fillStyle = "#ffe9a0"; ctx.fillText(f.text, f.x, f.y - f.t * 30); }
  ctx.globalAlpha = 1;
  if (bannerT > 0) {
    ctx.globalAlpha = Math.min(1, bannerT * 2);
    ctx.fillStyle = "rgba(12,10,26,.75)"; ctx.fillRect(0, 300, W, 44);
    ctx.fillStyle = "#ffd34a"; ctx.font = `900 18px ${getComputedStyle(document.body).fontFamily}`; ctx.fillText(bannerText, W / 2, 328);
    ctx.globalAlpha = 1;
  }
}
function hud() {
  if (!$("btnLaunch").hidden) $("btnLaunch").querySelector("b").textContent = G.charging ? `세기 ${Math.round(G.charge * 100)}%` : "발사 핸들";
  if (G.mode === "title" || G.mode === "menu") { $("hud").hidden = true; return; }
  $("hud").hidden = false;
  const st = STAGES[G.stage];
  $("stageName").textContent = `STAGE ${G.stage + 1}/${STAGES.length} · ${st.ep.label} ${st.ep.title}`;
  $("score").textContent = G.score.toLocaleString();
  $("target").textContent = `/ 목표 ${G.target.toLocaleString()}`;
  $("goalBar").style.width = `${Math.min(100, (G.score / G.target) * 100)}%`;
  $("balls").textContent = "● ".repeat(Math.max(0, G.ballsLeft)).trim() + (G.mult > 1 ? "  ×2" : "");
  $("pins").textContent = `미션 핀 ${G.pins.filter((p) => p.lit).length}/${G.pins.length}`;
  if (G.ability && G.ability.id !== "multi") { $("ability").hidden = false; $("ability").innerHTML = `<img src="assets/${G.ability.img}.png" alt="">${G.ability.who} · ${G.ability.name} ${Math.ceil(G.abilityT)}초`; }
  else if (G.ability) { $("ability").hidden = false; $("ability").innerHTML = `<img src="assets/${G.ability.img}.png" alt="">${G.ability.who} · ${G.ability.name}!`; }
  else $("ability").hidden = true;
}

// ---------------------------------------------------------------- 화면 (제목 · 스테이지 고르기)
function showScreen(html) { $("screen").innerHTML = html; $("screen").hidden = false; showLaunch(false); }
function showLaunch(on) { $("btnLaunch").hidden = !on || G.mode !== "play"; }
function title() {
  G.mode = "title";
  const next = Math.min(SAVE.unlocked, STAGES.length - 1);
  showScreen(`<h1><b>퓨어데이</b><br>핀볼</h1>
    <p>회차마다 4스테이지 · 지금 <b>${EPS.length}화 × 4 = ${STAGES.length}단계</b><br>새 회차가 올라오면 스테이지가 늘어나요</p>
    ${STAGES.length ? `<img class="bg" src="${STAGES[next].bg}" alt="">
    <button class="big" id="tGo">${next ? `이어서 STAGE ${next + 1}` : "STAGE 1 시작"}</button>
    <button class="ghost" id="tMenu">스테이지 고르기</button>` : "<p>회차 정보를 불러오지 못했어요. 웹툰 포털 안에서 열어 주세요.</p>"}
    <p class="how">플리퍼: ← / Z (왼쪽) · → / M (오른쪽) · 폰은 화면 아래 왼쪽·오른쪽을 눌러요<br>발사: Space 를 꾹 누른 만큼 세게 · 폰은 「발사 핸들」을 누르거나 아래로 끌기<br>공이 튈 때마다 점수! 목표 점수를 넘으면 클리어<br>💎 미션 핀을 모두 맞추면 스페셜 능력 — 조아름 멀티볼 · 아퀼라 날개 세이브 · 박사 점수 2배 · 하임 슬로모션</p>
    <button class="ghost" id="tSnd">소리 ${SAVE.sound ? "켜짐" : "꺼짐"}</button>`);
  if ($("tGo")) { $("tGo").onclick = () => startStage(next); $("tMenu").onclick = stageMenu; }
  $("tSnd").onclick = () => { SAVE.sound = !SAVE.sound; save(); title(); };
}
function stageMenu() {
  G.mode = "menu";
  showScreen(`<h2>스테이지 고르기</h2><p>회차마다 4스테이지 · 깬 다음 스테이지까지 열려요</p>
    <div class="chapters">${EPS.map((e, ei) => `<div class="chap"><img src="../${e.thumb}" alt="" loading="lazy"><div><b>${e.season} ${e.label} ${e.title}</b>
      <div class="st">${[0, 1, 2, 3].map((k) => { const i = ei * PER_EP + k; return `<button data-i="${i}" class="${SAVE.best[i] ? "done" : ""}" ${i > SAVE.unlocked ? "disabled" : ""}>${i + 1}</button>`; }).join("")}</div></div></div>`).join("")}</div>
    <button class="ghost" id="mBack">처음 화면</button>`);
  $("screen").querySelector(".chapters").onclick = (e) => { const b = e.target.closest("button[data-i]"); if (b && !b.disabled) startStage(Number(b.dataset.i)); };
  $("mBack").onclick = title;
}
function startStage(i) {
  $("screen").hidden = true;
  G.mode = "play";
  setupStage(i);
  banner(`STAGE ${i + 1} · ${STAGES[i].ep.label}`);
  showLaunch(true);
}

// ---------------------------------------------------------------- 입력
function flip(side, on) { FLIP[side === "L" ? 0 : 1].key = on; if (on && G.mode === "play") tone([side === "L" ? 260 : 290], 0.03, 0.02, "square"); }
addEventListener("keydown", (e) => {
  if (e.repeat) return;
  if (["ArrowLeft", "KeyZ", "KeyA", "ShiftLeft"].includes(e.code)) { e.preventDefault(); flip("L", true); }
  if (["ArrowRight", "KeyM", "Slash", "KeyL", "ShiftRight"].includes(e.code)) { e.preventDefault(); flip("R", true); }
  if (["Space", "ArrowDown", "Enter"].includes(e.code) && G.mode === "play") { e.preventDefault(); if (G.balls.some((b) => b.inLane)) { G.charging = true; G.charge = 0; } }
  if (e.code === "KeyP" || e.code === "Escape") pause();
});
addEventListener("keyup", (e) => {
  if (["ArrowLeft", "KeyZ", "KeyA", "ShiftLeft"].includes(e.code)) flip("L", false);
  if (["ArrowRight", "KeyM", "Slash", "KeyL", "ShiftRight"].includes(e.code)) flip("R", false);
  if (["Space", "ArrowDown", "Enter"].includes(e.code) && G.charging) { G.charging = false; launch(G.charge); G.charge = 0; }
});
for (const [id, side] of [["touchL", "L"], ["touchR", "R"]]) {
  const el = $(id);
  el.addEventListener("pointerdown", (e) => { e.preventDefault(); el.setPointerCapture(e.pointerId); flip(side, true); });
  const up = () => flip(side, false);
  el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
}
// 발사 핸들: 꾹 누르고 있으면 게이지가 차오르고, 누른 채 아래로 끌면 끈 만큼(끌기 우선). 손을 떼면 발사
let dragY = 0;
$("btnLaunch").addEventListener("pointerdown", (e) => { e.preventDefault(); $("btnLaunch").setPointerCapture(e.pointerId); G.charging = true; G.dragging = false; G.charge = 0; dragY = e.clientY; });
$("btnLaunch").addEventListener("pointermove", (e) => {
  if (!G.charging) return;
  const dy = e.clientY - dragY;
  if (dy > 8) { G.dragging = true; G.charge = Math.max(0, Math.min(1, dy / 140)); }
});
const releaseHandle = () => { if (G.charging) { G.charging = false; G.dragging = false; launch(G.charge); G.charge = 0; } };
$("btnLaunch").addEventListener("pointerup", releaseHandle); $("btnLaunch").addEventListener("pointercancel", releaseHandle);
let pausedFrom = null;
function pause() {
  if (G.mode === "play") { pausedFrom = "play"; G.mode = "paused"; showScreen(`<h2>일시정지</h2><button class="big" id="pGo">계속하기</button><button class="ghost" id="pMenu">스테이지 고르기</button>`); $("pGo").onclick = pause; $("pMenu").onclick = stageMenu; }
  else if (G.mode === "paused") { G.mode = "play"; $("screen").hidden = true; showLaunch(G.balls.some((b) => b.inLane)); }
}
$("btnPause").onclick = pause;
addEventListener("blur", () => { if (G.mode === "play") pause(); });

// ---------------------------------------------------------------- 시작
function resize() { const r = cv.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1); cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); }
addEventListener("resize", resize);
let last = performance.now();
function frame(now) {
  const dt = Math.min(1 / 30, (now - last) / 1000); last = now;
  if (bannerT > 0) bannerT -= dt;
  update(dt); draw(); hud();
  requestAnimationFrame(frame);
}
(async function init() {
  load(); resize();
  await loadPortal();
  EPS = buildStages();
  SAVE.unlocked = Math.min(SAVE.unlocked, Math.max(0, STAGES.length - 1));
  // 개발용: #stage=N&sim=초&auto → N단계를 미리 돌려서(플리퍼 자동) 화면 확인
  const hp = new URLSearchParams(location.hash.slice(1));
  if (hp.has("stage") && STAGES.length) {
    SAVE.sound = false; startStage(Math.min(STAGES.length - 1, Number(hp.get("stage")) - 1));
    launch(Number(hp.get("power") || 0.6));
    const sim = Number(hp.get("sim") || 0);
    for (let k = 0; k < sim * 60; k++) {
      if (hp.has("auto")) for (const f of FLIP) f.key = G.balls.some((b) => b.y > 560 && Math.abs(b.x - (f.side === "L" ? 150 : 220)) < 70);
      if (hp.has("auto") && G.balls.some((b) => b.inLane)) launch(0.6);
      update(1 / 60); if (G.mode !== "play") break;
    }
    for (const f of FLIP) f.key = false;
    document.title = `SIM stage ${G.stage + 1} mode ${G.mode} score ${G.score} balls ${G.ballsLeft} pins ${G.pins.filter((p) => p.lit).length}/${G.pins.length} specials ${G.specials}`;
    if (hp.has("charge")) G.charge = Number(hp.get("charge"));   // 개발용: 게이지 모습 확인
  } else title();
  requestAnimationFrame(frame);
})();
