// 퓨어데이 슈팅 — 조아름이 빛의 화살로 드래곤 군단을 물리친다.
// 10단계 · 단계마다 적 편대 3~4물결 → 중간보스 · 10단계 보스 = 대왕용 → 엔딩
// 화면은 논리 크기 360×640 캔버스 하나. 그림은 장기·체스 피규어를 받침 없이 자른 스프라이트(tools/make_sprites.py)
const W = 360, H = 640;
const cv = document.getElementById("cv");
const ctx = cv.getContext("2d");
const FONT = '"Pretendard", "Noto Sans KR", system-ui, sans-serif';
const HASH = new URLSearchParams(location.hash.slice(1));   // 개발용: #stage=7&boss&god&auto
const SAVE_KEY = "pureday-shooter-v1";

// ---------------------------------------------------------------- 그림
const SPR = {};
const SPRITES = ["player_areum", "aquila", "mamul", "wolf1", "wolf2", "wolf3", "wolf4", "wolf5", "wyvern", "lizard", "ruin_tower",
  "lava_beast", "wyvern_captain", "rahab", "apophis", "great_dragon"];
const ENDING = ["W_K", "W_A1", "W_A2", "W_R1", "W_R2", "W_C1", "W_C2", "W_H1", "W_H2", "W_E1", "W_E2", "W_P1", "W_P2", "W_P3", "W_P4", "W_P5"];
function loadImages() {
  const all = [...SPRITES, ...ENDING.map((n) => "end_" + n)];
  return Promise.all(all.map((n) => new Promise((res) => {
    const im = new Image();
    im.onload = () => { SPR[n] = im; res(); };
    im.onerror = () => res();
    im.src = `assets/sprites/${n}.png`;
  })));
}
function drawSprite(name, x, y, h, opt = {}) {
  const im = SPR[name];
  if (!im) { ctx.fillStyle = "#c33"; ctx.beginPath(); ctx.arc(x, y, h / 3, 0, 7); ctx.fill(); return; }
  const w = (im.width / im.height) * h;
  ctx.save();
  ctx.translate(x, y);
  if (opt.rot) ctx.rotate(opt.rot);
  if (opt.flip) ctx.scale(-1, 1);
  if (opt.alpha != null) ctx.globalAlpha = opt.alpha;
  if (opt.flash) ctx.filter = "brightness(2.2)";
  ctx.drawImage(im, -w / 2, -h / 2, w, h);
  ctx.restore();
}

// ---------------------------------------------------------------- 소리 (합성음)
let actx = null, soundOn = true;
function tone(freqs, dur = 0.08, type = "square", vol = 0.05) {
  if (!soundOn) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    let t = actx.currentTime;
    for (const f of freqs) {
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = type; o.frequency.value = f;
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
      o.connect(g).connect(actx.destination); o.start(t); o.stop(t + dur);
      t += dur * 0.7;
    }
  } catch (e) { /* 소리 없음 */ }
}
const SFX = {
  shot: () => tone([1180], 0.03, "triangle", 0.015), hit: () => tone([300], 0.04, "square", 0.03),
  boom: () => tone([180, 90], 0.12, "sawtooth", 0.06), item: () => tone([660, 990], 0.07, "triangle", 0.06),
  hurt: () => tone([440, 220, 110], 0.12, "sawtooth", 0.08), bomb: () => tone([200, 400, 800, 1600], 0.1, "triangle", 0.08),
  boss: () => tone([110, 98, 82], 0.3, "sawtooth", 0.07), clear: () => tone([523, 659, 784, 1046], 0.13, "triangle", 0.07),
};

// ---------------------------------------------------------------- 단계
// waves: [적 종류, 수, 대형(줄 수)]  boss: 보스 정의 이름
const STAGES = [
  { name: "새벽의 들판", sky: ["#f7c6a3", "#8fb7e0", "#3f5f9c"], waves: [["mamul", 8, 2], ["mamul", 10, 2], ["mamul", 6, 2, "wolf", 4]], boss: "wolfKing" },
  { name: "늑대개 고개", sky: ["#f2a77c", "#a86f8f", "#3b3466"], waves: [["wolf", 8, 2], ["mamul", 8, 2, "wolf", 4], ["wolf", 12, 3]], boss: "lizardCaptain" },
  { name: "비룡의 하늘", sky: ["#9fd0f2", "#6b8fd6", "#2d3f86"], waves: [["wyvern", 6, 2], ["wyvern", 8, 2, "mamul", 4], ["wyvern", 10, 2]], boss: "ruinTower" },
  { name: "잿빛 협곡", sky: ["#c9b8a6", "#7a6a6a", "#2e2a33"], waves: [["wolf", 8, 2, "wyvern", 4], ["lizard", 6, 2], ["mamul", 10, 3, "lizard", 2]], boss: "lavaBeast" },
  { name: "구름 성채", sky: ["#e6f0ff", "#9db5e8", "#4b5aa8"], waves: [["wyvern", 10, 2], ["lizard", 6, 2, "wyvern", 4], ["wyvern", 12, 3]], boss: "wyvernCaptain" },
  { name: "늑대개 군단의 밤", sky: ["#3b3b6b", "#1f2147", "#0d0e22"], waves: [["wolf", 12, 3], ["wolf", 14, 3], ["wolf", 10, 2, "lizard", 4]], boss: "wolfTwins" },
  { name: "불의 강", sky: ["#ffb36b", "#d4553a", "#4a1520"], waves: [["lava", 4, 1, "mamul", 8], ["wyvern", 10, 2, "lava", 2], ["lizard", 8, 2, "lava", 2]], boss: "rahab" },
  { name: "세 갈래 협곡", sky: ["#b9a3d9", "#6a4f9c", "#241838"], waves: [["wolf", 10, 2, "wyvern", 6], ["lizard", 8, 2, "lava", 2], ["wyvern", 14, 3]], boss: "apophis" },
  { name: "어둠의 성문", sky: ["#5b4a6e", "#2c2140", "#120c1c"], waves: [["lava", 4, 1, "lizard", 6], ["wolf", 14, 3, "wyvern", 4], ["mamul", 12, 3, "lava", 4]], boss: "darkGate" },
  { name: "대왕용의 둥지", sky: ["#ff8a5c", "#8c2a3a", "#1a0a12"], waves: [["wyvern", 12, 3, "lizard", 4], ["wolf", 12, 3, "lava", 4], ["lizard", 8, 2, "wyvern", 8], ["mamul", 16, 4]], boss: "greatDragon" },
];
const ENEMY = {
  mamul: { spr: () => "mamul", hp: 1, size: 42, score: 100, fire: 0.10 },
  wolf: { spr: (i) => "wolf" + (1 + (i % 5)), hp: 2, size: 46, score: 150, fire: 0.08, diver: true },
  wyvern: { spr: () => "wyvern", hp: 3, size: 48, score: 200, fire: 0.22 },
  lizard: { spr: () => "lizard", hp: 6, size: 50, score: 300, fire: 0.25, spread: 3 },
  lava: { spr: () => "lava_beast", hp: 10, size: 58, score: 500, fire: 0.3, spread: 5 },
};
const BOSS = {
  wolfKing: { name: "늑대개 우두머리", parts: [{ spr: "wolf1", size: 130, hp: 140 }], pats: ["aim3", "charge", "summonWolf"] },
  lizardCaptain: { name: "도마뱀 근위대장", parts: [{ spr: "lizard", size: 140, hp: 190 }], pats: ["fan5", "ring12", "aim3"] },
  ruinTower: { name: "무너진 탑", parts: [{ spr: "ruin_tower", size: 150, hp: 240, still: true }], pats: ["rockRain", "ring16", "fan7"] },
  lavaBeast: { name: "용암 병거 짐승", parts: [{ spr: "lava_beast", size: 150, hp: 280 }], pats: ["charge", "lavaFan", "ring16"] },
  wyvernCaptain: { name: "비룡대 대장", parts: [{ spr: "wyvern_captain", size: 150, hp: 320, fast: true }], pats: ["spiral", "swoop", "fan7"] },
  wolfTwins: { name: "늑대개 쌍대장", parts: [{ spr: "wolf2", size: 110, hp: 180, dx: -70 }, { spr: "wolf3", size: 110, hp: 180, dx: 70 }], pats: ["aim3", "charge", "ring12"] },
  rahab: { name: "교만의 용장 라합", parts: [{ spr: "rahab", size: 165, hp: 420 }], pats: ["flower", "spiral", "mirror"] },
  apophis: { name: "분쟁의 용장 아포피스", parts: [{ spr: "apophis", size: 170, hp: 480 }], pats: ["threeHeads", "ring16", "lavaFan"] },
  darkGate: { name: "라합 · 아포피스", parts: [{ spr: "rahab", size: 130, hp: 330, dx: -80 }, { spr: "apophis", size: 130, hp: 330, dx: 80 }], pats: ["flower", "threeHeads", "spiral"] },
  greatDragon: { name: "대왕용", parts: [{ spr: "great_dragon", size: 210, hp: 1100 }], pats: ["breath", "meteor", "spiral", "summonAll", "ring24"], final: true },
};

// ---------------------------------------------------------------- 상태
const G = {
  mode: "title", t: 0, stage: 0, wave: 0, score: 0, hi: 0, lives: 3, bombs: 2, power: 1, aquila: false,
  easy: false, banner: null, shake: 0, flash: 0, clearT: 0, sel: 0, endT: 0, continues: 0,
};
let P = null;                      // 플레이어
let shots = [], ebullets = [], enemies = [], bosses = [], items = [], parts = [], stars = [];
const keys = {};
let touch = null;                  // { id, px, py, sx, sy }

function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify({ hi: G.hi, sound: soundOn, best: G.best || 0 })); } catch (e) { /* 저장 안 됨 */ } }
function load() { try { const s = JSON.parse(localStorage.getItem(SAVE_KEY) || "{}"); G.hi = s.hi || 0; soundOn = s.sound !== false; G.best = s.best || 0; } catch (e) { /* 저장 안 됨 */ } }

function resetPlayer() {
  P = { x: W / 2, y: H - 90, r: 5, inv: 2.2, cool: 0, opt: 0, alive: true };
}
function newGame(stage = 0) {
  G.score = 0; G.lives = G.easy ? 5 : 3; G.bombs = 2; G.power = 1; G.aquila = false; G.continues = 0;
  startStage(stage);
}
function startStage(i) {
  G.stage = i; G.wave = -1; G.mode = "intro"; G.t = 0;
  shots = []; ebullets = []; enemies = []; bosses = []; items = [];
  resetPlayer();
  G.banner = { big: `STAGE ${i + 1}`, small: STAGES[i].name, t: 0 };
  if (HASH.has("boss")) { G.wave = STAGES[i].waves.length - 1; }
}

// ---------------------------------------------------------------- 수학
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ang = (x1, y1, x2, y2) => Math.atan2(y2 - y1, x2 - x1);
function bez(p, t) {
  const u = 1 - t;
  return [u * u * u * p[0][0] + 3 * u * u * t * p[1][0] + 3 * u * t * t * p[2][0] + t * t * t * p[3][0],
          u * u * u * p[0][1] + 3 * u * u * t * p[1][1] + 3 * u * t * t * p[2][1] + t * t * t * p[3][1]];
}

// ---------------------------------------------------------------- 적 편대 (갤러그식: 곡선으로 들어와 줄 서기 → 가끔 돌격)
function spawnWave() {
  const st = STAGES[G.stage], spec = st.waves[G.wave];
  const groups = [];
  for (let k = 0; k < spec.length; ) {
    if (typeof spec[k + 2] === "number") { groups.push([spec[k], spec[k + 1], spec[k + 2]]); k += 3; }
    else { groups.push([spec[k], spec[k + 1], 1]); k += 2; }
  }
  let rowBase = 0, idx = 0;
  for (const [type, n, rows] of groups) {
    const perRow = Math.ceil(n / rows);
    for (let j = 0; j < n; j++) {
      const row = rowBase + Math.floor(j / perRow), col = j % perRow;
      const cols = Math.min(perRow, n - Math.floor(j / perRow) * perRow);
      const gap = Math.min(52, (W - 60) / Math.max(1, cols - 1 || 1));
      const sx = W / 2 + (col - (cols - 1) / 2) * gap, sy = 90 + row * 50;
      const fromLeft = (idx % 2 === 0);
      const sx0 = fromLeft ? -40 : W + 40, sy0 = rnd(60, 220);
      const path = [[sx0, sy0], [fromLeft ? W * 0.75 : W * 0.25, sy0 + 220], [fromLeft ? W * 0.2 : W * 0.8, 330], [sx, sy]];
      const E = ENEMY[type];
      const hpMul = 1 + G.stage * 0.18;
      enemies.push({ type, spr: E.spr(j), x: sx0, y: sy0, sx, sy, hp: Math.ceil(E.hp * hpMul), size: E.size, mode: "enter",
                     path, t: -idx * 0.11, dur: 1.7, cool: rnd(1.5, 4), flash: 0, diveT: rnd(3, 9), E });
      idx++;
    }
    rowBase += rows;
  }
  G.banner = G.wave === 0 ? G.banner : { big: `WAVE ${G.wave + 1}`, small: "", t: 0, short: true };
}

function updateEnemies(dt) {
  const speedUp = 1 + G.stage * 0.06;
  for (const e of enemies) {
    e.flash = Math.max(0, e.flash - dt);
    if (e.mode === "enter") {
      e.t += dt * speedUp;
      if (e.t < 0) continue;
      const k = Math.min(1, e.t / e.dur);
      [e.x, e.y] = bez(e.path, k);
      if (k >= 1) { e.mode = "hold"; e.t = 0; }
    } else if (e.mode === "hold") {
      e.t += dt;
      e.x = e.sx + Math.sin(G.t * 1.2 + e.sy * 0.05) * 14;
      e.y = e.sy + Math.sin(G.t * 2 + e.sx * 0.03) * 4;
      e.diveT -= dt * (e.E.diver ? 1.6 : 1) * speedUp;
      if (e.diveT <= 0 && P.alive) {
        e.mode = "dive"; e.t = 0; e.dur = rnd(1.9, 2.6) / speedUp;
        const loop = e.x < W / 2 ? 1 : -1;
        e.path = [[e.x, e.y], [e.x + loop * 120, e.y - 60], [P.x - loop * 60, P.y - 120], [P.x + rnd(-40, 40), H + 60]];
      }
    } else if (e.mode === "dive") {
      e.t += dt;
      const k = Math.min(1, e.t / e.dur);
      [e.x, e.y] = bez(e.path, k);
      if (k >= 1) { e.mode = "return"; e.x = e.sx; e.y = -40; e.diveT = rnd(4, 10); }
    } else if (e.mode === "return") {
      e.y += 160 * dt;
      e.x += (e.sx - e.x) * Math.min(1, dt * 3);
      if (e.y >= e.sy) { e.y = e.sy; e.mode = "hold"; }
    }
    // 쏘기
    if (e.mode !== "enter" && e.y > 0 && e.y < H * 0.75 && P.alive) {
      e.cool -= dt * speedUp;
      if (e.cool <= 0) {
        e.cool = rnd(2.2, 4.5) / (1 + G.stage * 0.08);
        if (Math.random() < e.E.fire * (G.easy ? 0.6 : 1) * 3) {
          const a = ang(e.x, e.y, P.x, P.y), sp = 120 + G.stage * 8;
          const n = e.E.spread || 1;
          for (let k = 0; k < n; k++) fire(e.x, e.y + 10, a + (k - (n - 1) / 2) * 0.22, sp, 5, "#ff6a3d");
        }
      }
    }
  }
}

// ---------------------------------------------------------------- 보스
function spawnBoss() {
  const B = BOSS[STAGES[G.stage].boss];
  bosses = B.parts.map((p, i) => ({ ...p, def: B, x: W / 2 + (p.dx || 0), y: -120, baseX: W / 2 + (p.dx || 0), ty: B.final ? 150 : 130,
    maxHp: Math.round(p.hp * (G.easy ? 0.75 : 1)), hp: Math.round(p.hp * (G.easy ? 0.75 : 1)), t: 0, pat: i, patT: 2.5 + i, flash: 0,
    mode: "enter", spin: 0, vx: 0, vy: 0, phase: 1 }));
  G.banner = { big: B.final ? "최후의 결전" : "BOSS", small: B.name, t: 0, boss: true };
  SFX.boss();
}
function bossHpFrac() {
  const max = bosses.reduce((s, b) => s + b.maxHp, 0), hp = bosses.reduce((s, b) => s + Math.max(0, b.hp), 0);
  return max ? hp / max : 0;
}
function updateBosses(dt) {
  for (const b of bosses) {
    if (b.hp <= 0) continue;
    b.t += dt; b.flash = Math.max(0, b.flash - dt);
    const frac = b.hp / b.maxHp;
    b.phase = frac < 0.3 ? 3 : frac < 0.65 ? 2 : 1;
    const rage = 1 + (b.phase - 1) * 0.35;
    if (b.mode === "enter") {
      b.y += (b.ty - b.y) * Math.min(1, dt * 1.6);
      if (Math.abs(b.y - b.ty) < 2) b.mode = "fight";
      continue;
    }
    if (b.mode === "charge") {
      b.x = clamp(b.x + b.vx * dt, b.size * 0.3, W - b.size * 0.3); b.y += b.vy * dt;
      if (b.y > H - 140) b.vy = -Math.abs(b.vy) * 0.8;
      if (b.vy < 0 && b.y <= b.ty) { b.y = b.ty; b.mode = "fight"; }
      continue;
    }
    // 좌우로 천천히 (still 은 제자리). 목표 자리로 미끄러지듯 따라가 돌진 뒤에도 튀지 않게
    if (!b.still) {
      const amp = b.dx ? 40 : Math.max(20, W / 2 - b.size * 0.5);   // 큰 보스도 화면 밖으로 잘리지 않게
      const tx = b.baseX + Math.sin(b.t * (b.fast ? 1.4 : 0.7)) * amp, ty = b.ty + Math.sin(b.t * 1.3) * 10;
      b.x += (tx - b.x) * Math.min(1, dt * 2.5); b.y += (ty - b.y) * Math.min(1, dt * 2.5);
    }
    b.patT -= dt * rage;
    if (b.patT <= 0) {
      const pats = b.def.pats;
      const name = pats[b.pat % pats.length]; b.pat++;
      b.patT = runPattern(b, name) / (G.easy ? 0.8 : 1);
    }
    if (b.spin > 0) {   // 회오리 탄은 몇 초 동안 계속 뿜는다
      b.spin -= dt;
      b.spinCool = (b.spinCool || 0) - dt;
      if (b.spinCool <= 0) {
        b.spinCool = 0.07 / rage;
        b.spinA = (b.spinA || 0) + 0.32;
        const arms = b.phase >= 2 ? 3 : 2;
        for (let k = 0; k < arms; k++) fire(b.x, b.y + 20, b.spinA + (k * Math.PI * 2) / arms, 110 + b.phase * 15, 5, "#ff9ad5");
      }
    }
  }
}
// 패턴: 쏘고 다음 패턴까지 쉴 시간(초)을 돌려준다
function runPattern(b, name) {
  const aim = ang(b.x, b.y, P.x, P.y), sp = 130 + G.stage * 6, mx = b.x, my = b.y + b.size * 0.25;
  const fan = (n, step, speed, color = "#ff6a3d", r = 6) => { for (let k = 0; k < n; k++) fire(mx, my, aim + (k - (n - 1) / 2) * step, speed, r, color); };
  const ring = (n, speed, color = "#ffd36b", off = Math.random()) => { for (let k = 0; k < n; k++) fire(mx, my, off + (k * Math.PI * 2) / n, speed, 6, color); };
  switch (name) {
    case "aim3": fan(3, 0.2, sp + 30); setTimeout(() => b.hp > 0 && fan(3, 0.2, sp + 30), 300); return 1.6;
    case "fan5": fan(5, 0.18, sp); return 1.5;
    case "fan7": fan(7, 0.16, sp); setTimeout(() => b.hp > 0 && fan(6, 0.16, sp), 350); return 1.9;
    case "ring12": ring(12, sp * 0.8); return 1.6;
    case "ring16": ring(16, sp * 0.8); setTimeout(() => b.hp > 0 && ring(16, sp * 0.7), 450); return 2.2;
    case "ring24": ring(24, sp * 0.75, "#ff8a5c"); setTimeout(() => b.hp > 0 && ring(24, sp * 0.65, "#ffd36b"), 400); return 2.0;
    case "charge":
      b.mode = "charge"; const a = ang(b.x, b.y, P.x, P.y); b.vx = Math.cos(a) * 260; b.vy = Math.abs(Math.sin(a)) * 330 + 80;
      return 2.4;
    case "summonWolf": summon("wolf", 4); return 2.5;
    case "summonAll": summon(["wolf", "wyvern", "lizard"][Math.floor(Math.random() * 3)], 5); return 2.5;
    case "rockRain":
      for (let k = 0; k < 14; k++) setTimeout(() => b.hp > 0 && ebullets.push({ x: rnd(10, W - 10), y: -10, vx: 0, vy: rnd(110, 170) + G.stage * 5, r: 8, color: "#a08566", rock: true }), k * 120);
      return 2.6;
    case "lavaFan": fan(9, 0.14, sp * 0.85, "#ff4a1f", 7); return 1.8;
    case "spiral": b.spin = 2.6; return 3.4;
    case "swoop": b.mode = "charge"; b.vx = (P.x > b.x ? 1 : -1) * 220; b.vy = 300; fan(5, 0.2, sp); return 2.2;
    case "flower":
      for (let w = 0; w < 4; w++) setTimeout(() => { if (b.hp > 0) for (let k = 0; k < 10; k++) fire(mx, my, w * 0.16 + (k * Math.PI * 2) / 10, sp * 0.7, 6, "#ffe0f0"); }, w * 220);
      return 2.3;
    case "mirror":
      for (let w = 0; w < 6; w++) setTimeout(() => { if (b.hp > 0) { fire(20, 40, Math.PI / 2 - 0.5 + w * 0.12, sp, 6, "#c9b6ff"); fire(W - 20, 40, Math.PI / 2 + 0.5 - w * 0.12, sp, 6, "#c9b6ff"); } }, w * 140);
      return 2.0;
    case "threeHeads":   // 세 머리: 왼쪽 부채, 가운데 조준, 오른쪽 고리
      for (let k = 0; k < 5; k++) fire(mx - 50, my, Math.PI / 2 + 0.5 - k * 0.12, sp, 6, "#9cff8a");
      fan(3, 0.12, sp + 40, "#ff6a3d");
      for (let k = 0; k < 8; k++) fire(mx + 50, my, (k * Math.PI * 2) / 8, sp * 0.7, 6, "#8ad0ff");
      return 1.7;
    case "breath":       // 불숨: 플레이어 쪽으로 넓게 퍼지는 불덩이
      for (let k = 0; k < 26; k++) setTimeout(() => b.hp > 0 && fire(mx, my + 20, ang(mx, my, P.x, P.y) + rnd(-0.45, 0.45), rnd(140, 230), rnd(5, 9), k % 3 ? "#ff7a2f" : "#ffd36b"), k * 45);
      return 2.6;
    case "meteor":
      for (let k = 0; k < 18; k++) setTimeout(() => b.hp > 0 && ebullets.push({ x: rnd(10, W - 10), y: -15, vx: rnd(-30, 30), vy: rnd(150, 220), r: 10, color: "#ff5a2a", rock: true }), k * 110);
      return 2.6;
  }
  return 1.5;
}
function summon(type, n) {
  for (let k = 0; k < n; k++) {
    const E = ENEMY[type], fromLeft = k % 2 === 0, sx = rnd(40, W - 40), sy = rnd(220, 300);
    enemies.push({ type, spr: E.spr(k), x: fromLeft ? -30 : W + 30, y: 120, sx, sy, hp: E.hp, size: E.size * 0.9, mode: "enter",
      path: [[fromLeft ? -30 : W + 30, 120], [W / 2, 60], [sx, 380], [sx, sy]], t: -k * 0.15, dur: 1.4, cool: rnd(1, 3), flash: 0, diveT: rnd(1.5, 4), E, minion: true });
  }
}

// ---------------------------------------------------------------- 총알·아이템·효과
function fire(x, y, a, speed, r, color) { ebullets.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r, color }); }
function playerShoot() {
  const lv = G.power, y = P.y - 26;
  const add = (x, a, dmg = 1) => shots.push({ x, y, vx: Math.sin(a) * 620, vy: -Math.cos(a) * 620, dmg });
  if (lv === 1) add(P.x, 0);
  else if (lv === 2) { add(P.x - 7, 0); add(P.x + 7, 0); }
  else if (lv === 3) { add(P.x, 0, 1.2); add(P.x - 8, -0.12); add(P.x + 8, 0.12); }
  else { add(P.x - 6, 0, 1.2); add(P.x + 6, 0, 1.2); add(P.x - 10, -0.2); add(P.x + 10, 0.2); add(P.x, -0.08); }
  SFX.shot();
}
function burst(x, y, n, colors, spd = 160, life = 0.6) {
  for (let k = 0; k < n; k++) {
    const a = rnd(0, 7), s = rnd(spd * 0.3, spd);
    parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rnd(life * 0.5, life), max: life, c: colors[k % colors.length], r: rnd(1.5, 3.5) });
  }
}
function dropItem(x, y, force) {
  const r = Math.random();
  let kind = null;
  if (force) kind = force;
  else if (r < 0.06) kind = "P";
  else if (r < 0.075) kind = "B";
  else if (r < 0.082) kind = "H";
  else if (r < 0.088 && !G.aquila && G.stage >= 1) kind = "A";
  if (kind) items.push({ x, y, kind, vy: 60, t: 0 });
}
function bomb() {
  if (G.bombs <= 0 || !P.alive || G.mode !== "play") return;
  G.bombs--; G.flash = 0.6; G.shake = 0.4; SFX.bomb();
  for (const b of ebullets) burst(b.x, b.y, 2, ["#fff6c8"], 60, 0.3);
  ebullets = [];
  for (const e of enemies) hitEnemy(e, 8);
  for (const b of bosses) if (b.hp > 0 && b.mode !== "enter") hitBoss(b, 25);
  P.inv = Math.max(P.inv, 1.2);
}
function hitEnemy(e, dmg) {
  if (e.hp <= 0) return;
  e.hp -= dmg; e.flash = 0.08;
  if (e.hp <= 0) {
    G.score += e.E.score * (e.mode === "dive" ? 2 : 1);
    burst(e.x, e.y, 14, ["#ffb35c", "#ff6a3d", "#fff2b0"]);
    SFX.boom();
    if (!e.minion) dropItem(e.x, e.y);
  } else SFX.hit();
}
function hitBoss(b, dmg) {
  if (b.hp <= 0 || b.mode === "enter") return;
  b.hp -= dmg; b.flash = 0.05; G.score += 10;
  if (b.hp <= 0) {
    burst(b.x, b.y, 60, ["#fff2b0", "#ffb35c", "#ff6a3d", "#ffffff"], 260, 1.2);
    G.shake = 0.6; SFX.boom(); G.score += 5000 * (G.stage + 1);
  }
}
function hurtPlayer() {
  if (P.inv > 0 || !P.alive || HASH.has("god")) return;
  burst(P.x, P.y, 30, ["#ffffff", "#ffe39a", "#9fd3ff"], 220, 0.9);
  SFX.hurt(); G.shake = 0.5;
  G.lives--; G.power = Math.max(1, G.power - 1); G.aquila = false;
  if (G.lives <= 0) { P.alive = false; G.mode = "gameover"; G.t = 0; if (G.score > G.hi) G.hi = G.score; save(); return; }
  G.bombs = Math.max(G.bombs, 2);
  P.x = W / 2; P.y = H - 90; P.inv = 2.5;
  ebullets = ebullets.filter((b) => Math.hypot(b.x - P.x, b.y - P.y) > 120);
}

// ---------------------------------------------------------------- 진행
function update(dt) {
  G.t += dt; G.shake = Math.max(0, G.shake - dt); G.flash = Math.max(0, G.flash - dt);
  updateStars(dt);
  if (G.banner) { G.banner.t += dt; if (G.banner.t > (G.banner.short ? 1.4 : 2.6)) G.banner = null; }
  for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.96; p.vy *= 0.96; p.life -= dt; }
  parts = parts.filter((p) => p.life > 0);
  if (G.mode === "title" || G.mode === "paused" || G.mode === "gameover" || G.mode === "ending") { if (G.mode === "ending") G.endT += dt; return; }

  // 플레이어 이동
  if (P.alive) {
    let dx = 0, dy = 0;
    if (keys.ArrowLeft || keys.KeyA) dx--; if (keys.ArrowRight || keys.KeyD) dx++;
    if (keys.ArrowUp || keys.KeyW) dy--; if (keys.ArrowDown || keys.KeyS) dy++;
    if (HASH.has("auto")) { dx = Math.sign(Math.sin(G.t * 0.9)); dy = 0; }
    const sp = keys.ShiftLeft || keys.ShiftRight ? 130 : 240;   // Shift = 천천히 (정밀 피하기)
    if (dx || dy) { const l = Math.hypot(dx, dy); P.x += (dx / l) * sp * dt; P.y += (dy / l) * sp * dt; }
    P.x = clamp(P.x, 16, W - 16); P.y = clamp(P.y, 60, H - 30);
    P.inv = Math.max(0, P.inv - dt);
    P.cool -= dt;
    if (P.cool <= 0 && G.mode !== "intro") { P.cool = 0.11; playerShoot(); }   // 자동 발사
    if (G.aquila) {
      P.opt -= dt;
      if (P.opt <= 0) { P.opt = 0.28; shots.push({ x: P.x - 34, y: P.y - 10, vx: 0, vy: -560, dmg: 0.8, aq: true }); }
    }
  }
  for (const s of shots) { s.x += s.vx * dt; s.y += s.vy * dt; }
  shots = shots.filter((s) => s.y > -20 && s.x > -20 && s.x < W + 20);
  for (const b of ebullets) { b.x += b.vx * dt; b.y += b.vy * dt; }
  ebullets = ebullets.filter((b) => b.y < H + 20 && b.y > -40 && b.x > -20 && b.x < W + 20);
  for (const it of items) { it.t += dt; it.y += it.vy * dt; if (P.alive && Math.hypot(it.x - P.x, it.y - P.y) < 90) { it.x += (P.x - it.x) * dt * 4; it.y += (P.y - it.y) * dt * 4; } }

  updateEnemies(dt);
  updateBosses(dt);

  // 충돌: 내 화살 → 적·보스
  for (const s of shots) {
    if (s.hit) continue;
    for (const e of enemies) {
      if (e.hp > 0 && e.y > -10 && Math.abs(s.x - e.x) < e.size * 0.38 && Math.abs(s.y - e.y) < e.size * 0.42) { hitEnemy(e, s.dmg); s.hit = true; break; }
    }
    if (s.hit) continue;
    for (const b of bosses) {
      if (b.hp > 0 && Math.abs(s.x - b.x) < b.size * 0.36 && Math.abs(s.y - b.y) < b.size * 0.4) { hitBoss(b, s.dmg); s.hit = true; burst(s.x, s.y, 2, ["#fff2b0"], 80, 0.25); break; }
    }
  }
  shots = shots.filter((s) => !s.hit);
  enemies = enemies.filter((e) => e.hp > 0);

  // 충돌: 적 탄·몸 → 나
  if (P.alive) {
    for (const b of ebullets) if (Math.hypot(b.x - P.x, b.y - P.y) < b.r + P.r) { b.dead = true; hurtPlayer(); break; }
    ebullets = ebullets.filter((b) => !b.dead);
    for (const e of enemies) if (Math.hypot(e.x - P.x, e.y - P.y) < e.size * 0.32) { hitEnemy(e, 99); hurtPlayer(); break; }
    for (const b of bosses) if (b.hp > 0 && Math.hypot(b.x - P.x, b.y - P.y) < b.size * 0.3) { hurtPlayer(); break; }
    for (const it of items) if (Math.hypot(it.x - P.x, it.y - P.y) < 22) { it.got = true; takeItem(it.kind); }
    items = items.filter((it) => !it.got && it.y < H + 20);
  }

  // 단계 흐름
  if (G.mode === "intro" && G.t > 2.2) { G.mode = "play"; G.wave = HASH.has("boss") ? STAGES[G.stage].waves.length - 1 : -1; nextWave(); }
  else if (G.mode === "play" && !enemies.length) nextWave();
  else if (G.mode === "boss" && bosses.length && bosses.every((b) => b.hp <= 0)) {
    G.mode = "clear"; G.clearT = 0; enemies.forEach((e) => hitEnemy(e, 99)); ebullets = [];
    SFX.clear();
    const last = G.stage === STAGES.length - 1;
    G.banner = { big: last ? "대왕용을 물리쳤다!" : "STAGE CLEAR", small: last ? "" : `+${5000 * (G.stage + 1)}`, t: 0 };
    if (!last) dropItem(W / 2, 200, "P");
    G.best = Math.max(G.best || 0, G.stage + 1); if (G.score > G.hi) G.hi = G.score; save();
  } else if (G.mode === "clear") {
    G.clearT += dt;
    if (G.clearT > 3.2) {
      if (G.stage === STAGES.length - 1) { G.mode = "ending"; G.endT = 0; }
      else startStage(G.stage + 1);
    }
  }
}
function nextWave() {
  const st = STAGES[G.stage];
  G.wave++;
  if (G.wave < st.waves.length) spawnWave();
  else { G.mode = "boss"; spawnBoss(); }
}
function takeItem(k) {
  SFX.item();
  if (k === "P") { if (G.power < 4) G.power++; else G.score += 1000; }
  else if (k === "B") G.bombs = Math.min(5, G.bombs + 1);
  else if (k === "H") G.lives = Math.min(7, G.lives + 1);
  else if (k === "A") G.aquila = true;
  burst(P.x, P.y - 10, 10, ["#fff2b0", "#9fd3ff"], 120, 0.5);
}

// ---------------------------------------------------------------- 배경
function initStars() { stars = Array.from({ length: 70 }, () => ({ x: rnd(0, W), y: rnd(0, H), z: rnd(0.3, 1) })); }
function updateStars(dt) { for (const s of stars) { s.y += (30 + s.z * 90) * dt; if (s.y > H) { s.y = -2; s.x = rnd(0, W); } } }
function drawBackground() {
  const sky = G.mode === "ending" ? ["#fff4d6", "#ffd98a", "#f2a65a"] : G.mode === "title" ? ["#f7c6a3", "#8fb7e0", "#2d3f86"] : STAGES[G.stage].sky;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, sky[2]); g.addColorStop(0.55, sky[1]); g.addColorStop(1, sky[0]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // 먼 산 (천천히 흐름)
  const off = (G.t * 12) % 120;
  ctx.fillStyle = "rgba(20, 16, 40, .22)";
  ctx.beginPath(); ctx.moveTo(0, H);
  for (let x = -120; x <= W + 120; x += 60) ctx.lineTo(x + off, H - 70 - ((x / 60) % 2 ? 40 : 0));
  ctx.lineTo(W, H); ctx.fill();
  for (const s of stars) { ctx.fillStyle = `rgba(255,255,255,${0.25 + s.z * 0.5})`; ctx.fillRect(s.x, s.y, 1.2 + s.z, 1.2 + s.z * 3); }
}

// ---------------------------------------------------------------- 그리기
function draw() {
  ctx.save();
  if (G.shake > 0) ctx.translate(rnd(-4, 4) * G.shake * 2, rnd(-4, 4) * G.shake * 2);
  drawBackground();
  if (G.mode === "title") { drawTitle(); ctx.restore(); return; }
  if (G.mode === "ending") { drawEnding(); ctx.restore(); return; }

  for (const it of items) drawItem(it);
  for (const e of enemies) drawSprite(e.spr, e.x, e.y, e.size, { flash: e.flash > 0, rot: e.mode === "dive" ? Math.sin(e.t * 6) * 0.25 : 0 });
  for (const b of bosses) if (b.hp > 0) {
    ctx.save(); ctx.shadowColor = "#ff5a2a"; ctx.shadowBlur = 20 + Math.sin(G.t * 4) * 8;
    drawSprite(b.spr, b.x, b.y, b.size, { flash: b.flash > 0 }); ctx.restore();
  }
  // 내 화살
  for (const s of shots) {
    ctx.strokeStyle = s.aq ? "#ffe39a" : "#cfe9ff"; ctx.lineWidth = s.aq ? 3 : 2.5; ctx.shadowColor = "#9fd3ff"; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - s.vx * 0.022, s.y - s.vy * 0.022); ctx.stroke();
  }
  ctx.shadowBlur = 0;
  // 적 탄
  for (const b of ebullets) {
    const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r * 1.6);
    g.addColorStop(0, "#fff"); g.addColorStop(0.45, b.color); g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 1.6, 0, 7); ctx.fill();
  }
  // 나
  if (P.alive) {
    if (G.aquila) drawSprite("aquila", P.x - 36, P.y - 4 + Math.sin(G.t * 5) * 3, 34);
    const blink = P.inv > 0 && Math.floor(G.t * 12) % 2 === 0;
    if (!blink) drawSprite("player_areum", P.x, P.y, 62);
    // 맞는 곳(작은 빛): 평소엔 은은하게, Shift(천천히)일 때 또렷하게
    ctx.globalAlpha = keys.ShiftLeft || keys.ShiftRight ? 1 : 0.55; ctx.fillStyle = "#fff"; ctx.shadowColor = "#9fd3ff"; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.arc(P.x, P.y, 3.5, 0, 7); ctx.fill(); ctx.shadowBlur = 0; ctx.globalAlpha = 1;
  }
  for (const p of parts) { ctx.globalAlpha = Math.max(0, p.life / p.max); ctx.fillStyle = p.c; ctx.fillRect(p.x, p.y, p.r, p.r); }
  ctx.globalAlpha = 1;
  if (G.flash > 0) { ctx.fillStyle = `rgba(255,250,220,${G.flash})`; ctx.fillRect(0, 0, W, H); }
  drawHud();
  if (G.banner) drawBanner();
  if (G.mode === "paused") drawCenter("일시정지", "Esc · P 또는 ▶ 를 눌러 계속");
  if (G.mode === "gameover") drawGameOver();
  ctx.restore();
}
function drawItem(it) {
  const col = { P: "#ffcc4d", B: "#ff8adf", H: "#ff6b6b", A: "#9fd3ff" }[it.kind];
  const lab = { P: "P", B: "✦", H: "♥", A: "🦅" }[it.kind];
  ctx.save(); ctx.translate(it.x, it.y); ctx.rotate(Math.sin(it.t * 4) * 0.2);
  ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 12;
  ctx.beginPath(); ctx.arc(0, 0, 11, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
  ctx.fillStyle = "#2a1a10"; ctx.font = `800 13px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(lab, 0, 1);
  ctx.restore();
}
function text(s, x, y, size, color = "#fff", align = "center", weight = 800, stroke = "rgba(20,14,30,.75)") {
  ctx.font = `${weight} ${size}px ${FONT}`; ctx.textAlign = align; ctx.textBaseline = "middle";
  ctx.lineWidth = Math.max(2, size / 7); ctx.strokeStyle = stroke; ctx.strokeText(s, x, y);
  ctx.fillStyle = color; ctx.fillText(s, x, y);
}
function drawHud() {
  text(`${G.score}`, 10, 18, 16, "#fff", "left");
  text(`HI ${Math.max(G.hi, G.score)}`, 10, 38, 11, "#e6c47c", "left", 700);
  text(`STAGE ${G.stage + 1}`, W / 2, 18, 13, "#fff", "center", 700);
  text("♥".repeat(Math.max(0, G.lives)), 10, H - 16, 15, "#ff7a7a", "left");
  text("✦".repeat(G.bombs), W - 70, H - 16, 14, "#ffd36b", "right");
  text(`P${G.power}`, W - 70, H - 36, 12, "#ffcc4d", "right", 700);
  if (G.mode === "boss" || (G.mode === "clear" && bosses.length)) {
    const f = bossHpFrac(), bw = W - 80;
    ctx.fillStyle = "rgba(0,0,0,.45)"; ctx.fillRect(40, 50, bw, 8);
    ctx.fillStyle = f > 0.3 ? "#ff6a3d" : "#ff2d55"; ctx.fillRect(40, 50, bw * f, 8);
    text(BOSS[STAGES[G.stage].boss].name, W / 2, 68, 11, "#ffd9c9", "center", 700);
  }
}
function drawBanner() {
  const b = G.banner, a = Math.min(1, b.t * 3, ((b.short ? 1.4 : 2.6) - b.t) * 3);
  ctx.globalAlpha = Math.max(0, a);
  ctx.fillStyle = b.boss ? "rgba(90,10,20,.55)" : "rgba(20,14,40,.45)"; ctx.fillRect(0, H * 0.38, W, b.small ? 92 : 64);
  text(b.big, W / 2, H * 0.38 + 30, b.boss ? 30 : 28, b.boss ? "#ffb3a0" : "#ffe9b0");
  if (b.small) text(b.small, W / 2, H * 0.38 + 66, 17, "#fff", "center", 700);
  ctx.globalAlpha = 1;
}
function drawCenter(big, small) {
  ctx.fillStyle = "rgba(10,8,20,.55)"; ctx.fillRect(0, 0, W, H);
  text(big, W / 2, H / 2 - 14, 28, "#ffe9b0"); if (small) text(small, W / 2, H / 2 + 22, 13, "#fff", "center", 600);
}
function drawGameOver() {
  ctx.fillStyle = "rgba(10,8,20,.6)"; ctx.fillRect(0, 0, W, H);
  text("GAME OVER", W / 2, H / 2 - 60, 32, "#ff9a8a");
  text(`점수 ${G.score}`, W / 2, H / 2 - 20, 16);
  if (G.t > 1) {
    button(W / 2, H / 2 + 30, 200, 44, `STAGE ${G.stage + 1} 이어 하기`, G.sel === 0);
    button(W / 2, H / 2 + 84, 200, 44, "처음으로", G.sel === 1);
  }
}
const BTNS = [];
function button(x, y, w, h, label, on) {
  BTNS.push({ x: x - w / 2, y: y - h / 2, w, h, label });
  ctx.fillStyle = on ? "#e6c47c" : "rgba(255,255,255,.15)"; ctx.strokeStyle = "#e6c47c"; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.roundRect(x - w / 2, y - h / 2, w, h, 12); ctx.fill(); ctx.stroke();
  text(label, x, y + 1, 15, on ? "#2a1a10" : "#fff", "center", 800);
}
function drawTitle() {
  drawSprite("great_dragon", W / 2 + 70, 210, 170, { alpha: 0.9 });
  drawSprite("player_areum", W / 2 - 70, 330, 130);
  drawSprite("aquila", W / 2 - 140, 260, 60);
  text("퓨어데이", W / 2, 70, 22, "#ffe9b0");
  text("빛의 화살", W / 2, 108, 40, "#ffffff");
  text("조아름 vs 드래곤 군단", W / 2, 144, 14, "#ffe9b0", "center", 700);
  button(W / 2, 440, 220, 46, "시작하기 (보통)", G.sel === 0);
  button(W / 2, 496, 220, 46, "시작하기 (쉬움)", G.sel === 1);
  text(`최고 점수 ${G.hi} · 최고 단계 ${G.best || 0}`, W / 2, 548, 12, "#fff", "center", 600);
  text("이동: 방향키·WASD / 손가락으로 끌기 · 발사: 자동", W / 2, 584, 11, "#e8e0ff", "center", 500);
  text("폭발(✦): X · Space / 천천히: Shift · 멈춤: P", W / 2, 602, 11, "#e8e0ff", "center", 500);
  text(`소리 ${soundOn ? "켜짐" : "꺼짐"} (M)`, W / 2, 622, 10, "#cfc6ee", "center", 500);
}
function drawEnding() {
  const t = G.endT;
  // 빛 진영이 모여 선다
  const row1 = ENDING.slice(0, 8), row2 = ENDING.slice(8);
  row2.forEach((n, i) => drawSprite("end_" + n, 30 + i * 43, 470 + Math.sin(t * 2 + i) * 2, 70, { alpha: clamp((t - 1 - i * 0.1) * 2, 0, 1) }));
  row1.forEach((n, i) => drawSprite("end_" + n, 30 + i * 43, 540 + Math.sin(t * 2 + i) * 2, 76, { alpha: clamp((t - 0.5 - i * 0.1) * 2, 0, 1) }));
  drawSprite("player_areum", W / 2, 385 - Math.min(20, t * 8), 110, { alpha: clamp(t, 0, 1) });
  const lines = ["대왕용이 쓰러지자", "드래곤 군단은 흩어지고", "골든 캐슬에 다시 빛이 비쳤어요.", "", "조아름과 빛 진영의 친구들은", "오늘도 퓨어랜드를 지켜요.", "", "THE END"];
  lines.forEach((l, i) => { const a = clamp((t - 2 - i * 0.7) * 1.5, 0, 1); if (a > 0) { ctx.globalAlpha = a; text(l, W / 2, 60 + i * 27, l === "THE END" ? 26 : 16, l === "THE END" ? "#8a4b10" : "#4a2a10", "center", 800, "rgba(255,248,230,.9)"); } });
  ctx.globalAlpha = 1;
  if (t > 9) { text(`최종 점수 ${G.score}`, W / 2, 282, 15, "#4a2a10", "center", 800, "rgba(255,248,230,.9)"); button(W / 2, 620 - 6, 180, 36, "처음으로", true); }
}

// ---------------------------------------------------------------- 입력
addEventListener("keydown", (e) => {
  keys[e.code] = true;
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();
  if (G.mode === "title") {
    if (e.code === "ArrowUp" || e.code === "ArrowDown") G.sel = 1 - G.sel;
    if (e.code === "Enter" || e.code === "Space") { G.easy = G.sel === 1; newGame(); }
  } else if (G.mode === "gameover" && G.t > 1) {
    if (e.code === "ArrowUp" || e.code === "ArrowDown") G.sel = 1 - G.sel;
    if (e.code === "Enter" || e.code === "Space") choose();
  } else if (G.mode === "ending" && G.endT > 9 && (e.code === "Enter" || e.code === "Space")) { G.mode = "title"; G.sel = 0; }
  else if (e.code === "KeyX" || e.code === "Space") bomb();
  if (e.code === "KeyP" || e.code === "Escape") togglePause();
  if (e.code === "KeyM") { soundOn = !soundOn; save(); }
});
addEventListener("keyup", (e) => { keys[e.code] = false; });
function choose() {
  if (G.sel === 0) { G.continues++; G.lives = G.easy ? 5 : 3; G.bombs = 2; G.score = Math.floor(G.score / 2); startStage(G.stage); }
  else { G.mode = "title"; G.sel = 0; }
}
function togglePause() {
  if (G.mode === "paused") G.mode = G.prevMode;
  else if (["play", "boss", "intro", "clear"].includes(G.mode)) { G.prevMode = G.mode; G.mode = "paused"; }
}
function toLogical(ev) {
  const r = cv.getBoundingClientRect();
  return [((ev.clientX - r.left) / r.width) * W, ((ev.clientY - r.top) / r.height) * H];
}
cv.addEventListener("pointerdown", (ev) => {
  const [x, y] = toLogical(ev);
  const hit = BTNS.find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
  if (G.mode === "title" && hit) { G.easy = hit.label.includes("쉬움"); newGame(); return; }
  if (G.mode === "gameover" && hit) { G.sel = hit.label.includes("이어") ? 0 : 1; choose(); return; }
  if (G.mode === "ending" && hit) { G.mode = "title"; G.sel = 0; return; }
  if (P && P.alive) { touch = { id: ev.pointerId, sx: x, sy: y, px: P.x, py: P.y }; cv.setPointerCapture(ev.pointerId); }
});
cv.addEventListener("pointermove", (ev) => {
  if (!touch || touch.id !== ev.pointerId || !P) return;
  const [x, y] = toLogical(ev);
  P.x = clamp(touch.px + (x - touch.sx) * 1.2, 16, W - 16); P.y = clamp(touch.py + (y - touch.sy) * 1.2, 60, H - 30);   // 손가락에 가리지 않게 상대 이동
});
const endTouch = (ev) => { if (touch && touch.id === ev.pointerId) touch = null; };
cv.addEventListener("pointerup", endTouch); cv.addEventListener("pointercancel", endTouch);
document.getElementById("btnBomb").addEventListener("pointerdown", (e) => { e.preventDefault(); bomb(); });
document.getElementById("btnPause").addEventListener("click", togglePause);
addEventListener("blur", () => { if (["play", "boss", "intro"].includes(G.mode)) togglePause(); });

// ---------------------------------------------------------------- 시작
function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const r = cv.getBoundingClientRect();
  cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
  ctx.setTransform(cv.width / W, 0, 0, cv.height / H, 0, 0);
  ctx.imageSmoothingQuality = "high";
}
addEventListener("resize", resize);
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  BTNS.length = 0;
  update(dt); draw();
  const inGame = !["title", "ending"].includes(G.mode);
  document.getElementById("btnPause").classList.toggle("show", inGame);
  document.getElementById("btnBomb").classList.toggle("show", inGame && G.mode !== "gameover");
  document.getElementById("btnPause").textContent = G.mode === "paused" ? "▶" : "Ⅱ";
  requestAnimationFrame(frame);
}
(async function init() {
  load(); initStars(); resetPlayer(); resize();
  await loadImages();
  if (HASH.has("stage")) { G.easy = HASH.has("easy"); newGame(clamp(Number(HASH.get("stage")) - 1, 0, 9)); }
  if (HASH.has("ending")) { G.mode = "ending"; G.endT = Number(HASH.get("ending")) || 10; }
  // 개발용: #sim=초 — 그 시간만큼 미리 돌려 놓고 보여 준다 (헤드리스 스크린샷 확인용)
  if (HASH.has("sim")) { soundOn = false; for (let k = 0; k < Number(HASH.get("sim")) * 60; k++) update(1 / 60); }
  requestAnimationFrame(frame);
})();
