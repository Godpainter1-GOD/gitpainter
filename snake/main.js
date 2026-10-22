// 퓨어데이 지렁이 v2 「빛의 행렬 진군」 (2026-10-22 대표님: 벽에 맞아 죽는 것 말고, 화면이 계속 이동하며
//   구슬이 작은 것부터 큰 것까지 나오고, 악마군단이 부하부터 장군까지 계속 나오며 이동하면서 강화되는 게임으로)
// 규칙: 넓은 들판을 자유롭게 달린다(격자 없음). 빛의 구슬을 먹으면 행렬이 길어지고 LV(힘)가 오른다.
//       어둠의 군단은 졸개→병사→기사→대장→장군→대왕용 순으로 시간이 갈수록 강한 녀석이 나온다.
//       내 LV ≥ 적의 힘이면 부딪혀서 물리치고(구슬을 떨어뜨림), 약하면 하트 하나와 행렬 30%를 잃는다. 들판 끝(빛의 울타리)은 밀어낼 뿐.
const SAVE_KEY = "pureday-snake-v2";
const WORLD = 2600;                       // 들판 한 변(px)
const CHARS = [
  { id: "areum", name: "조아름", line: "빛의 구슬, 한 알도 놓치지 않을게요!" },
  { id: "heim", name: "조하임", line: "최단 경로 계산 완료!" },
  { id: "drjo", name: "조성민 박사", line: "서두르지 않아도 괜찮아. 한 칸씩." },
  { id: "aquila", name: "아퀼라", line: "하늘에서 보면 길이 다 보여!" },
  { id: "squire", name: "견습 창병", line: "오늘도 훈련! 구슬 모으기!" },
];
const ORB_COLORS = ["#ffd34a", "#ff6b6b", "#5ec8ff", "#7fe07a", "#ff9ad5", "#b48cff", "#ffa347"];
const ORB_KINDS = [                       // 구슬 크기: 작은 것부터 큰 것까지. wave 가 오를수록 큰 것이 많이 나온다
  { r: 5, grow: 1, score: 1 }, { r: 8, grow: 2, score: 3 }, { r: 12, grow: 3, score: 10 }, { r: 16, grow: 5, score: 25 },
];
const LV_SEG = [0, 12, 24, 40, 60, 85, 115, 150, 190, 240, 300, 370, 450, 550, 700];   // LV n 이 되는 행렬 길이(LV1 = 0). 2026-10-22 시험 뒤 두 번 늦춤(자동 조종 40초 LV9 → LV7쯤)
const TIERS = [                           // 어둠의 군단. pow = 이기려면 필요한 내 LV, from = 등장 wave(25초 단위)
  { name: "졸개", pow: 1, r: 11, spd: 58, color: "#8a5ac0", score: 10, drops: 1, from: 0 },
  { name: "병사", pow: 2, r: 13, spd: 66, color: "#6a44a8", score: 25, drops: 3, from: 1 },
  { name: "기사", pow: 4, r: 15, spd: 74, color: "#4c3390", score: 60, drops: 4, from: 3 },
  { name: "대장", pow: 6, r: 18, spd: 80, color: "#34236e", score: 120, drops: 6, from: 5 },
  { name: "장군", pow: 8, r: 22, spd: 86, color: "#1e1650", score: 300, drops: 9, from: 7 },
  { name: "대왕용", pow: 12, r: 32, spd: 72, color: "#4a1020", score: 1200, drops: 18, from: 10 },
];
const WAVE_SEC = 25;
const CLEAR_LINES = ["감사해요, 함께해서 더 즐거웠어요!", "빛은 어둠을 두려워하지 않아요.", "구슬이 이렇게 길게 이어졌어요!", "한 알 한 알이 다 소중해요."];
const PEI_HIT = ["🦜 페이: 아직 힘이 모자라요. 구슬을 더 모아요!", "🦜 페이: 끼룩! 괜찮아요, 빛은 다시 모여요.", "🦜 페이: 초록 테두리 적만 부딪혀요!"];
const PEI_OVER = ["🦜 페이: 끼룩! 괜찮아요, 다시 한 번!", "🦜 페이: 구슬은 다시 반짝일 거예요.", "🦜 페이: 장군은 LV 8부터, 대왕용은 LV 12부터예요!"];

const $ = (id) => document.getElementById(id);
const cv = $("cv"), ctx = cv.getContext("2d");
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
const lvOf = (seg) => { let lv = 1; while (lv < LV_SEG.length && seg >= LV_SEG[lv]) lv++; return lv; };

// ---------------------------------------------------------------- 상태
const P = { char: 0, sound: true, best: 0, bestLv: 1, kills: 0 };   // 저장
let G = null, mode = "title", VW = 360, VH = 640, DPR = 1, AUTO = false;
const SPR = {};
function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(P)); } catch (e) { /* 저장 안 됨 */ } }
function load() { try { Object.assign(P, JSON.parse(localStorage.getItem(SAVE_KEY) || "{}")); } catch (e) { /* 저장 안 됨 */ } }

// ---------------------------------------------------------------- 소리
let actx = null;
function tone(freqs, dur = 0.05, vol = 0.05, type = "square") {
  if (!P.sound) return;
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

// ---------------------------------------------------------------- 새 판
function newGame() {
  G = {
    t: 0, score: 0, lives: 3, kills: 0, killsBy: [0, 0, 0, 0, 0, 0], maxLv: 1,
    x: WORLD / 2, y: WORLD / 2, ang: -Math.PI / 2, want: -Math.PI / 2, speed: 150, started: false,
    seg: 5, cols: [ORB_COLORS[0], ORB_COLORS[0], ORB_COLORS[0], ORB_COLORS[0], ORB_COLORS[0]], trail: [], cur: ORB_COLORS[0],
    inv: 0, hitFlash: 0, shake: 0, stam: 100, dash: false, lv: 1,
    orbs: [], enemies: [], parts: [], camX: WORLD / 2, camY: WORLD / 2, wave: 0, bossTimer: 0, spawnAcc: 0, seen: new Set([0]),
    joy: null, keys: new Set(),
  };
  G.trail.push({ x: G.x, y: G.y });
  for (let i = 0; i < 70; i++) spawnOrb();
  for (let i = 0; i < 6; i++) spawnEnemy(0, true);
}
function inWorld(x, y, m = 40) { return x > m && y > m && x < WORLD - m && y < WORLD - m; }
function ringPos(minR, maxR, near = true) {   // 머리 둘레 고리(또는 들판 아무 데나) 중 들판 안 자리
  for (let k = 0; k < 20; k++) {
    let x, y;
    if (near) { const a = rnd(0, Math.PI * 2), r = rnd(minR, maxR); x = G.x + Math.cos(a) * r; y = G.y + Math.sin(a) * r; }
    else { x = rnd(60, WORLD - 60); y = rnd(60, WORLD - 60); }
    if (inWorld(x, y)) return { x, y };
  }
  return null;
}
function orbKindFor() {   // wave 가 오를수록 큰 구슬 비율이 오른다
  const w = G.wave, r = Math.random();
  if (r < 0.03 + w * 0.012) return 3;
  if (r < 0.12 + w * 0.03) return 2;
  if (r < 0.40 + w * 0.04) return 1;
  return 0;
}
function spawnOrb(anywhere = false, at = null, kind = null) {
  const p = at || ringPos(260, 1000, !anywhere); if (!p) return;
  const k = kind ?? orbKindFor();
  G.orbs.push({ x: p.x, y: p.y, k, c: pick(ORB_COLORS), ph: rnd(0, 6.28), vx: at ? rnd(-90, 90) : 0, vy: at ? rnd(-90, 90) : 0 });
}
function spawnEnemy(tier, anywhere = false, at = null) {
  const p = at || ringPos(anywhere ? 420 : 380, anywhere ? 900 : 620); if (!p) return;
  const T = TIERS[tier];
  G.enemies.push({ x: p.x, y: p.y, tier, ang: rnd(0, 6.28), turn: 0, stun: 0, bite: 0, ph: rnd(0, 6.28), hp: tier === 5 ? 3 : 1 });
  if (!G.seen.has(tier)) { G.seen.add(tier); banner(`어둠의 ${T.name} 등장!`, `힘 ${T.pow} — LV ${T.pow} 이상이면 부딪혀 물리쳐요`, true); tone([200, 150], 0.15, 0.06, "sawtooth"); }
}
function pickTier() {   // 지금 wave 에 나올 수 있는 등급 중 하나 (낮은 등급이 더 자주)
  const can = TIERS.map((T, i) => i).filter((i) => i < 5 && TIERS[i].from <= G.wave);
  const w = can.map((i) => 1 / (1 + (can.length - 1 - (can.length - 1 - i)) * 0.6));   // 높은 등급일수록 가중치 작게
  let s = w.reduce((a, b) => a + b, 0), r = Math.random() * s;
  for (let k = 0; k < can.length; k++) { r -= w[k]; if (r <= 0) return can[k]; }
  return can[0];
}

// ---------------------------------------------------------------- 진행
function update(dt) {
  const g = G; g.t += dt;
  const wave = Math.floor(g.t / WAVE_SEC);
  if (wave !== g.wave) { g.wave = wave; if (!TIERS.some((T) => T.from === wave)) banner(`제 ${wave + 1} 진군`, "구슬이 더 커지고 군단이 늘어요"); }
  // 입력 → 가고 싶은 각도
  if (AUTO) g.want = autoAngle();
  else if (g.keys.size) { let dx = 0, dy = 0; if (g.keys.has("left")) dx--; if (g.keys.has("right")) dx++; if (g.keys.has("up")) dy--; if (g.keys.has("down")) dy++; if (dx || dy) { g.want = Math.atan2(dy, dx); g.started = true; } }
  // 질주
  const dashing = (g.dash || g.keys.has("dash")) && g.stam > 0 && g.started;
  if (dashing) g.stam = Math.max(0, g.stam - dt * 38); else g.stam = Math.min(100, g.stam + dt * 18);
  if (g.stam === 0) g.dash = false;
  // 방향 돌리기(부드럽게) + 이동
  let d = Math.atan2(Math.sin(g.want - g.ang), Math.cos(g.want - g.ang));
  const turnRate = 7.5;
  g.ang += clamp(d, -turnRate * dt, turnRate * dt);
  if (g.started) {
    const sp = (150 + Math.min(40, g.lv * 3)) * (dashing ? 1.8 : 1);
    g.x += Math.cos(g.ang) * sp * dt; g.y += Math.sin(g.ang) * sp * dt;
    // 빛의 울타리: 밀어내기만
    const m = 24;
    if (g.x < m) { g.x = m; } if (g.y < m) { g.y = m; } if (g.x > WORLD - m) { g.x = WORLD - m; } if (g.y > WORLD - m) { g.y = WORLD - m; }
    const lt = g.trail[g.trail.length - 1];
    if (dist(lt.x, lt.y, g.x, g.y) >= 2) g.trail.push({ x: g.x, y: g.y });
    const need = (g.seg + 2) * spacing() + 20; let acc = 0;
    for (let i = g.trail.length - 1; i > 0; i--) { acc += dist(g.trail[i].x, g.trail[i].y, g.trail[i - 1].x, g.trail[i - 1].y); if (acc > need) { g.trail.splice(0, i - 1); break; } }
  }
  g.inv = Math.max(0, g.inv - dt); g.hitFlash = Math.max(0, g.hitFlash - dt); g.shake = Math.max(0, g.shake - dt);
  // 구슬: 자석 + 먹기 + 흩어진 구슬 멈추기
  const segs = segPositions();
  for (let i = g.orbs.length - 1; i >= 0; i--) {
    const o = g.orbs[i], K = ORB_KINDS[o.k];
    if (o.vx || o.vy) { o.x += o.vx * dt; o.y += o.vy * dt; o.vx *= 0.9; o.vy *= 0.9; if (Math.abs(o.vx) + Math.abs(o.vy) < 4) o.vx = o.vy = 0; o.x = clamp(o.x, 30, WORLD - 30); o.y = clamp(o.y, 30, WORLD - 30); }
    const dd = dist(o.x, o.y, g.x, g.y);
    if (dd < 70 + K.r) { const k = Math.min(1, dt * 9); o.x = lerp(o.x, g.x, k); o.y = lerp(o.y, g.y, k); }
    if (dd < 16 + K.r) {
      g.orbs.splice(i, 1); eat(o.c, K.grow, K.score);
    } else if (dd > 1500) g.orbs.splice(i, 1);     // 너무 먼 구슬은 치우고 근처에 다시
  }
  g.spawnAcc += dt;
  if (g.spawnAcc > 0.25) { g.spawnAcc = 0; const near = g.orbs.filter((o) => dist(o.x, o.y, g.x, g.y) < 1000).length; if (near < 42) spawnOrb(); }
  // 군단: 숫자 유지 + 등장 + 대왕용
  const want = 8 + Math.min(10, g.wave);
  if (g.enemies.length < want && Math.random() < dt * 1.5) spawnEnemy(pickTier());
  if (g.wave >= TIERS[5].from) { g.bossTimer += dt; if (g.bossTimer > 75 && !g.enemies.some((e) => e.tier === 5)) { g.bossTimer = 0; spawnEnemy(5); banner("⚠ 대왕용이 나타났어요!", "LV 12 이상이면 세 번 부딪혀 물리쳐요", true); } }
  else if (g.wave === TIERS[5].from - 1) g.bossTimer = 60;
  for (let i = g.enemies.length - 1; i >= 0; i--) {
    const e = g.enemies[i], T = TIERS[e.tier];
    e.stun = Math.max(0, e.stun - dt); e.bite = Math.max(0, e.bite - dt);
    const dd = dist(e.x, e.y, g.x, g.y);
    if (e.stun <= 0) {
      let target = e.ang;
      if (dd < 420 + e.tier * 40 && g.started) target = Math.atan2(g.y - e.y, g.x - e.x);   // 군단은 늘 달려든다(약한 녀석은 부딪혀 물리치면 됨)
      else { e.turn -= dt; if (e.turn <= 0) { e.turn = rnd(0.8, 2.5); e.ang += rnd(-1.4, 1.4); } }
      let da = Math.atan2(Math.sin(target - e.ang), Math.cos(target - e.ang)); e.ang += clamp(da, -3 * dt, 3 * dt);
      const sp = T.spd + g.wave * 2;
      e.x += Math.cos(e.ang) * sp * dt; e.y += Math.sin(e.ang) * sp * dt;
      if (!inWorld(e.x, e.y, 30)) { e.ang += Math.PI; e.x = clamp(e.x, 30, WORLD - 30); e.y = clamp(e.y, 30, WORLD - 30); }
    }
    if (dd > 1100 && e.tier < 5) { g.enemies.splice(i, 1); continue; }   // 멀리 간 녀석은 치움(대왕용 빼고) → 근처에 새로 나온다
    // 머리와 부딪힘
    if (dd < T.r + 14 && g.started) {
      if (g.lv >= T.pow) { if (e.tier === 5 && e.stun > 0) continue; if (e.tier === 5) { e.hp--; e.stun = 1.2; e.x += Math.cos(e.ang + Math.PI) * 60; burst(e.x, e.y, "#ff8aa0", 10); tone([400, 300], 0.08, 0.05); if (e.hp > 0) { toast(`대왕용에게 한 방! 남은 ${e.hp}`); continue; } } defeat(i); continue; }
      if (g.inv <= 0) { hit(e); continue; }
    }
    // 행렬(몸)과 닿음: 약한 녀석은 빛에 닿아 물러나고, 강한 녀석은 꼬리를 문다
    if (e.bite <= 0 && g.started) {
      for (let s = 2; s < segs.length; s += 2) {
        if (dist(e.x, e.y, segs[s].x, segs[s].y) < T.r + 8) {
          if (g.lv >= T.pow && e.tier < 5) { defeat(i); } else { e.bite = 1.4; if (g.seg > 5) { g.seg = Math.max(5, g.seg - 2); g.cols.length = g.seg; tone([180], 0.08, 0.04, "sawtooth"); burst(segs[s].x, segs[s].y, "#ffffff", 5); } }
          break;
        }
      }
    }
  }
  // 조각
  for (let i = g.parts.length - 1; i >= 0; i--) { const p = g.parts[i]; p.t -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.96; p.vy *= 0.96; if (p.t <= 0) g.parts.splice(i, 1); }
  // LV
  const lv = lvOf(g.seg);
  if (lv !== g.lv) { if (lv > g.lv) { banner(`LV ${lv}!`, lv >= 12 ? "대왕용과 맞설 수 있어요" : lv >= 8 ? "장군과 맞설 수 있어요" : lv >= 6 ? "대장과 맞설 수 있어요" : lv >= 4 ? "기사와 맞설 수 있어요" : "빛이 강해졌어요"); tone([523, 659, 784, 1046], 0.08, 0.05, "triangle"); } g.lv = lv; g.maxLv = Math.max(g.maxLv, lv); }
  // 화면 따라가기
  const k = Math.min(1, dt * 4);
  g.camX = lerp(g.camX, g.x + Math.cos(g.ang) * 40, k); g.camY = lerp(g.camY, g.y + Math.sin(g.ang) * 40, k);
}
function eat(c, grow, score) {
  const g = G; g.score += score;
  for (let i = 0; i < grow; i++) g.cols.push(c);
  g.seg += grow; g.cur = c;
  tone([520 + (g.seg % 7) * 40, 780], 0.04, 0.035, "triangle");
}
function defeat(i) {
  const g = G, e = g.enemies[i], T = TIERS[e.tier];
  g.enemies.splice(i, 1); g.kills++; g.killsBy[e.tier]++; g.score += T.score;
  burst(e.x, e.y, T.color, 14 + e.tier * 4); burst(e.x, e.y, "#ffd34a", 8);
  for (let k = 0; k < T.drops; k++) spawnOrb(false, { x: e.x, y: e.y }, Math.min(3, Math.floor(k / 3) + (e.tier >= 3 ? 1 : 0)));
  tone(e.tier >= 4 ? [392, 523, 659, 784, 1046] : [660, 880], 0.07, 0.05, "triangle");
  toast(e.tier >= 4 ? `✨ 어둠의 ${T.name}을 물리쳤어요! +${T.score}` : `${T.name} 물리침 +${T.score}`);
  if (e.tier === 5) banner("🎉 대왕용을 물리쳤어요!", `+${T.score} — ${CHARS[P.char].name}: "${pick(CLEAR_LINES)}"`);
}
function hit(e) {
  const g = G, T = TIERS[e.tier];
  g.lives--; g.inv = 2.2; g.hitFlash = 0.5; g.shake = 0.4;
  const lose = Math.floor(g.seg * 0.3); g.seg = Math.max(5, g.seg - lose); g.cols.length = g.seg;
  const a = Math.atan2(g.y - e.y, g.x - e.x); g.x = clamp(g.x + Math.cos(a) * 70, 24, WORLD - 24); g.y = clamp(g.y + Math.sin(a) * 70, 24, WORLD - 24); g.trail.push({ x: g.x, y: g.y });
  e.stun = 1.5; burst(g.x, g.y, "#ffffff", 16);
  tone([300, 200, 120], 0.12, 0.07, "sawtooth");
  if (g.lives <= 0) { gameOver(); return; }
  toast(`${T.name}(힘 ${T.pow})에게 부딪혔어요 — ${pick(PEI_HIT)}`, 2600);
}
function burst(x, y, c, n) { for (let k = 0; k < n; k++) { const a = rnd(0, 6.28), s = rnd(40, 220); G.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: rnd(0.3, 0.8), c, r: rnd(2, 5) }); } }
function spacing() { return 6 + Math.min(6, G.lv * 0.6); }
function segRadius() { return 5 + Math.min(6, G.lv * 0.6); }
function segPositions() {   // 꼬리 자취를 따라 일정 간격으로 행렬 자리를 찾는다 (0 = 머리)
  const g = G, out = [{ x: g.x, y: g.y }], sp = spacing(); let need = sp, acc = 0;
  for (let i = g.trail.length - 1; i > 0 && out.length <= g.seg; i--) {
    const a = g.trail[i], b = g.trail[i - 1], L = dist(a.x, a.y, b.x, b.y);
    while (acc + L >= need && out.length <= g.seg) { const t = (need - acc) / L; out.push({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) }); need += sp; }
    acc += L;
  }
  while (out.length <= g.seg) out.push({ ...out[out.length - 1] });
  return out;
}
function gameOver() {
  const g = G; mode = "over";
  P.best = Math.max(P.best, g.score); P.bestLv = Math.max(P.bestLv, g.maxLv); P.kills += g.kills; save();
  const c = CHARS[P.char], mm = Math.floor(g.t / 60), ss = String(Math.floor(g.t % 60)).padStart(2, "0");
  showScreen(`<h2>진군 끝</h2><div class="scoreBig">${g.score}</div><p>최고 ${P.best}</p>
    <div class="stats"><span>최고 LV<b>${g.maxLv}</b></span><span>물리친 군단<b>${g.kills}</b></span><span>시간<b>${mm}:${ss}</b></span></div>
    <div class="ranks">${TIERS.map((T, i) => g.killsBy[i] ? `<span>${T.name} ×${g.killsBy[i]}</span>` : "").join("")}</div>
    <div class="say"><img src="assets/${c.id}.png" alt=""><span>${pick(PEI_OVER)}</span></div>
    <button class="big" id="retry">다시 진군</button><button class="ghost" id="toTitle">처음으로</button>`);
  $("retry").onclick = () => { newGame(); play(); }; $("toTitle").onclick = title;
}

// ---------------------------------------------------------------- 화면(HTML)
function showScreen(html) { $("screen").innerHTML = html; $("screen").hidden = false; }
let toastTimer = 0, bannerTimer = 0;
function toast(msg, ms = 1500) { const t = $("toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); if (ms) toastTimer = setTimeout(hideToast, ms); }
function hideToast() { $("toast").hidden = true; }
function banner(big, small = "", red = false) { const b = $("banner"); b.innerHTML = `${big}<small>${small}</small>`; b.className = "banner" + (red ? " red" : ""); b.hidden = false; clearTimeout(bannerTimer); bannerTimer = setTimeout(() => { b.hidden = true; }, 2600); }
function title() {
  mode = "title"; G = null; $("hud").hidden = true; $("pad").hidden = true; hideToast(); $("banner").hidden = true;
  showScreen(`<h1><small>PUREDAY SNAKE</small><b>퓨어데이</b> 지렁이<small style="letter-spacing:0;font-size:15px;opacity:.9;margin-top:4px">빛의 행렬 진군</small></h1>
    <div class="demo"><img src="assets/${CHARS[P.char].id}.png" alt="">${ORB_COLORS.map((c) => `<i style="--c:${c}"></i>`).join("")}</div>
    <div class="chars" id="chars">${CHARS.map((c, i) => `<button data-i="${i}" class="${i === P.char ? "on" : ""}"><img src="assets/${c.id}.png" alt="">${c.name}</button>`).join("")}</div>
    <div class="ranks">${TIERS.map((T) => `<span>${T.name} 힘${T.pow}</span>`).join("")}</div>
    <button class="big" id="go">진군 시작!</button>
    <p>최고 점수 ${P.best} · 최고 LV ${P.bestLv} · 물리친 군단 ${P.kills}</p>
    <p class="how">화면을 누르고 끌면 그쪽으로 달려요(키보드 ←↑→↓/WASD). 들판 끝은 밀어낼 뿐 안 죽어요.<br>빛의 구슬(작은 것 1 ~ 큰 것 7)을 먹으면 행렬이 길어지고 LV 이 올라요.<br>어둠의 군단은 <b>초록 테두리</b>(내 LV ≥ 힘)일 때 부딪혀 물리쳐요. 빨간 테두리는 피하기! 부딪히면 하트 하나와 행렬 30%.<br>⚡ 질주는 아래 버튼이나 Space.</p>
    <button class="small" id="snd">소리 ${P.sound ? "켜짐" : "꺼짐"}</button>`);
  $("chars").onclick = (e) => { const b = e.target.closest("button"); if (!b) return; P.char = Number(b.dataset.i); save(); title(); };
  $("go").onclick = () => { newGame(); play(); };
  $("snd").onclick = () => { P.sound = !P.sound; save(); title(); };
}
function play() {
  mode = "play"; $("screen").hidden = true; $("hud").hidden = false; $("pad").hidden = false; resize();
  tone([660, 880], 0.06, 0.05, "triangle");
  if (!G.started) toast("화면을 누르고 끌어 출발! (키보드도 돼요)", 0);
}
function pause() {
  if (mode === "play") {
    mode = "pause";
    showScreen(`<h2>잠시 멈춤</h2><p>LV ${G.lv} · 점수 ${G.score} · 물리친 군단 ${G.kills}</p>
      <button class="big" id="resume">계속하기</button><button class="ghost" id="restart">처음부터</button><button class="ghost" id="toTitle">처음으로</button>`);
    $("resume").onclick = resume; $("toTitle").onclick = title; $("restart").onclick = () => { newGame(); play(); };
  } else if (mode === "pause") resume();
}
function resume() { mode = "play"; $("screen").hidden = true; }
function hud() {
  const g = G; if (!g) return;
  $("label").innerHTML = `LV <b>${g.lv}</b> · 점수 <b>${g.score}</b>`;
  $("lives").textContent = "♥".repeat(g.lives) + "♡".repeat(Math.max(0, 3 - g.lives));
  const a = LV_SEG[g.lv - 1], b = LV_SEG[g.lv] ?? (a + 60);
  $("bar").style.width = `${clamp(((g.seg - a) / (b - a)) * 100, 0, 100)}%`;
  const next = TIERS.find((T) => T.pow > g.lv);
  $("info").textContent = `행렬 ${g.seg} · ⚔ ${g.kills}` + (next ? ` · ${next.name}은 LV ${next.pow}` : " · 모두 이길 수 있어요");
  const mm = Math.floor(g.t / 60), ss = String(Math.floor(g.t % 60)).padStart(2, "0");
  $("wave").textContent = `제 ${g.wave + 1} 진군 · ${mm}:${ss}`;
  $("btnSound").textContent = P.sound ? "🔊" : "🔇";
  $("stam").style.transform = `scaleX(${g.stam / 100})`; $("btnDash").classList.toggle("tired", g.stam < 10);
}

// ---------------------------------------------------------------- 그리기
function resize() {
  const r = $("field").getBoundingClientRect(); DPR = Math.min(2, window.devicePixelRatio || 1);
  VW = Math.max(1, Math.round(r.width)); VH = Math.max(1, Math.round(r.height));
  cv.width = Math.round(VW * DPR); cv.height = Math.round(VH * DPR);
}
const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >> 13)) * 1274126177; return ((h ^ (h >> 16)) >>> 0) / 4294967296; };
function fieldColors() {   // wave 에 따라 들판 색이 천천히 바뀐다 (봄 → 황금 → 저녁 → 별빛)
  const sets = [["#7cc26a", "#72b862", "#4d6b3a"], ["#d8b85a", "#cfae52", "#8a6a2a"], ["#8a6aa8", "#80619e", "#4c3566"], ["#35477a", "#304170", "#1d2648"]];
  return sets[Math.min(3, Math.floor((G ? G.wave : 0) / 3))];
}
function draw() {
  const g = G;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const [ca, cb, cw] = fieldColors();
  if (!g) { ctx.fillStyle = ca; ctx.fillRect(0, 0, VW, VH); return; }
  const sx = g.shake > 0 ? (Math.random() - .5) * 8 : 0, sy = g.shake > 0 ? (Math.random() - .5) * 8 : 0;
  const ox = VW / 2 - g.camX + sx, oy = VH / 2 - g.camY + sy;
  // 들판(보이는 범위만 큰 칸으로)
  const TILE = 60;
  ctx.fillStyle = cw; ctx.fillRect(0, 0, VW, VH);
  const x0 = Math.max(0, Math.floor((g.camX - VW / 2) / TILE) - 1), x1 = Math.min(WORLD / TILE, Math.ceil((g.camX + VW / 2) / TILE) + 1);
  const y0 = Math.max(0, Math.floor((g.camY - VH / 2) / TILE) - 1), y1 = Math.min(WORLD / TILE, Math.ceil((g.camY + VH / 2) / TILE) + 1);
  for (let ty = y0; ty < y1; ty++) for (let tx = x0; tx < x1; tx++) {
    ctx.fillStyle = (tx + ty) % 2 ? ca : cb; ctx.fillRect(tx * TILE + ox, ty * TILE + oy, TILE, TILE);
    const h = hash(tx, ty);
    if (h < 0.18) { ctx.fillStyle = "rgba(255,255,255,.28)"; const fx = tx * TILE + ox + h * 300 % TILE, fy = ty * TILE + oy + (h * 7000) % TILE; ctx.fillRect(fx, fy, 3, 3); ctx.fillRect(fx + 5, fy + 4, 2, 2); }
    else if (h > 0.93) { ctx.fillStyle = "rgba(0,0,0,.08)"; ctx.beginPath(); ctx.ellipse(tx * TILE + ox + 30, ty * TILE + oy + 30, 16, 9, 0, 0, 7); ctx.fill(); }
  }
  // 빛의 울타리
  ctx.strokeStyle = "#ffd34a"; ctx.lineWidth = 6; ctx.shadowColor = "#ffd34a"; ctx.shadowBlur = 16; ctx.strokeRect(ox, oy, WORLD, WORLD); ctx.shadowBlur = 0;
  // 구슬
  for (const o of g.orbs) {
    const x = o.x + ox, y = o.y + oy; if (x < -30 || y < -30 || x > VW + 30 || y > VH + 30) continue;
    const K = ORB_KINDS[o.k], bob = Math.sin(g.t * 4 + o.ph) * 1.5, r = K.r + Math.sin(g.t * 6 + o.ph) * (o.k >= 2 ? 1.5 : 0);
    ctx.fillStyle = o.c; ctx.globalAlpha = .25; ctx.beginPath(); ctx.arc(x, y + bob, r + 4 + o.k * 2, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.arc(x, y + bob, r, 0, 7); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.85)"; ctx.beginPath(); ctx.arc(x - r * .35, y + bob - r * .4, Math.max(1.2, r * .22), 0, 7); ctx.fill();
    if (o.k === 3) { ctx.strokeStyle = "rgba(255,255,255,.7)"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y + bob, r + 3, g.t * 2, g.t * 2 + 2); ctx.stroke(); }
  }
  // 행렬
  const segs = segPositions(), rb = segRadius();
  for (let i = segs.length - 1; i >= 1; i--) {
    const s = segs[i], x = s.x + ox, y = s.y + oy; if (x < -30 || y < -30 || x > VW + 30 || y > VH + 30) continue;
    const r = rb * (0.65 + 0.35 * (1 - i / segs.length)), c = g.cols[i - 1] || ORB_COLORS[0];
    if (g.inv > 0 && Math.floor(g.t * 12) % 2) ctx.globalAlpha = .45;
    ctx.fillStyle = c; ctx.globalAlpha *= .3; ctx.beginPath(); ctx.arc(x, y, r + 3, 0, 7); ctx.fill(); ctx.globalAlpha = g.inv > 0 && Math.floor(g.t * 12) % 2 ? .45 : 1;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.7)"; ctx.beginPath(); ctx.arc(x - r * .35, y - r * .4, Math.max(1, r * .25), 0, 7); ctx.fill();
    ctx.globalAlpha = 1;
  }
  // 군단
  for (const e of g.enemies) drawEnemy(e, ox, oy);
  // 머리(캐릭터) + 기운
  const hx = g.x + ox, hy = g.y + oy, im = SPR[CHARS[P.char].id], scale = 1.5;
  ctx.fillStyle = g.cur; ctx.globalAlpha = .35 + 0.05 * g.lv; ctx.beginPath(); ctx.arc(hx, hy, 12 + g.lv * 1.2, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
  if (g.lv >= 4) { ctx.strokeStyle = g.lv >= 12 ? "#fff6c2" : g.lv >= 8 ? "#ffd34a" : "#c9f0ff"; ctx.lineWidth = 2; ctx.globalAlpha = .7; ctx.beginPath(); ctx.arc(hx, hy, 18 + g.lv * 1.2 + Math.sin(g.t * 5) * 2, 0, 7); ctx.stroke(); ctx.globalAlpha = 1; }
  if (im) {
    ctx.save(); ctx.imageSmoothingEnabled = false;
    if (g.inv > 0 && Math.floor(g.t * 12) % 2) ctx.globalAlpha = .45;
    const w = im.width * scale, h = im.height * scale, bob = g.started ? -Math.abs(Math.sin(g.t * 10)) * 3 : 0;
    ctx.translate(hx, hy + h * .35 + bob);
    if (Math.cos(g.ang) < 0) ctx.scale(-1, 1);
    ctx.drawImage(im, -w / 2, -h, w, h);
    ctx.restore();
  }
  // 조각
  for (const p of g.parts) { ctx.fillStyle = p.c; ctx.globalAlpha = Math.min(1, p.t * 2); ctx.beginPath(); ctx.arc(p.x + ox, p.y + oy, p.r, 0, 7); ctx.fill(); } ctx.globalAlpha = 1;
  // 조이스틱
  if (g.joy) { ctx.strokeStyle = "rgba(255,255,255,.5)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(g.joy.x, g.joy.y, 34, 0, 7); ctx.stroke(); ctx.fillStyle = "rgba(255,255,255,.6)"; ctx.beginPath(); ctx.arc(g.joy.cx, g.joy.cy, 14, 0, 7); ctx.fill(); }
  // 화면 밖 장군·대왕용 화살표
  for (const e of g.enemies) {
    if (e.tier < 4) continue; const x = e.x + ox, y = e.y + oy; if (x > 0 && y > 0 && x < VW && y < VH) continue;
    const a = Math.atan2(e.y - g.camY, e.x - g.camX), px = clamp(VW / 2 + Math.cos(a) * 1000, 18, VW - 18), py = clamp(VH / 2 + Math.sin(a) * 1000, 18, VH - 18);
    ctx.save(); ctx.translate(px, py); ctx.rotate(a); ctx.fillStyle = e.tier === 5 ? "#ff6b8a" : "#c9b8ff"; ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-6, -7); ctx.lineTo(-6, 7); ctx.fill(); ctx.restore();
  }
  if (g.hitFlash > 0) { ctx.fillStyle = `rgba(255,80,110,${g.hitFlash * .5})`; ctx.fillRect(0, 0, VW, VH); }
}
function drawEnemy(e, ox, oy) {
  const g = G, T = TIERS[e.tier], x = e.x + ox, y = e.y + oy, r = T.r; if (x < -60 || y < -60 || x > VW + 60 || y > VH + 60) return;
  const can = g.lv >= T.pow, bob = Math.sin(g.t * 6 + e.ph) * 1.5;
  ctx.save(); ctx.translate(x, y + bob);
  // 이길 수 있으면 초록, 아니면 빨간 테두리
  ctx.strokeStyle = can ? "#7fe07a" : "#ff5a6e"; ctx.lineWidth = 2.5; ctx.globalAlpha = .9; ctx.beginPath(); ctx.arc(0, 0, r + 5, 0, 7); ctx.stroke(); ctx.globalAlpha = 1;
  if (e.tier >= 4) { ctx.strokeStyle = e.tier === 5 ? "rgba(255,120,140,.5)" : "rgba(200,170,255,.5)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, r + 11 + Math.sin(g.t * 4) * 3, 0, 7); ctx.stroke(); }
  // 망토(대장 이상)
  if (e.tier >= 3) { ctx.fillStyle = e.tier === 5 ? "#6a1030" : "#241a4a"; ctx.beginPath(); ctx.moveTo(-r * .9, -r * .2); ctx.lineTo(-r * 1.4, r * 1.1); ctx.lineTo(r * 1.4, r * 1.1); ctx.lineTo(r * .9, -r * .2); ctx.fill(); }
  // 날개(대왕용)
  if (e.tier === 5) { ctx.fillStyle = "#3a0c1c"; const f = Math.sin(g.t * 8) * 6; ctx.beginPath(); ctx.moveTo(-r * .6, -r * .3); ctx.lineTo(-r * 1.9, -r * 1.1 - f); ctx.lineTo(-r * 1.5, r * .3); ctx.fill(); ctx.beginPath(); ctx.moveTo(r * .6, -r * .3); ctx.lineTo(r * 1.9, -r * 1.1 - f); ctx.lineTo(r * 1.5, r * .3); ctx.fill(); }
  // 몸
  const grd = ctx.createRadialGradient(-r * .3, -r * .3, r * .2, 0, 0, r); grd.addColorStop(0, lighten(T.color)); grd.addColorStop(1, T.color);
  ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill();
  // 뿔
  ctx.fillStyle = e.tier === 5 ? "#ffb347" : "#d9c6ff"; ctx.beginPath(); ctx.moveTo(-r * .55, -r * .7); ctx.lineTo(-r * .85, -r * 1.35); ctx.lineTo(-r * .2, -r * .9); ctx.fill(); ctx.beginPath(); ctx.moveTo(r * .55, -r * .7); ctx.lineTo(r * .85, -r * 1.35); ctx.lineTo(r * .2, -r * .9); ctx.fill();
  // 눈
  ctx.fillStyle = "#ff3b3b"; ctx.shadowColor = "#ff3b3b"; ctx.shadowBlur = 6; ctx.beginPath(); ctx.arc(-r * .3, -r * .1, r * .14, 0, 7); ctx.arc(r * .3, -r * .1, r * .14, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
  // 등급 표시: 병사 방패, 기사 투구, 대장 견장, 장군 왕관
  if (e.tier === 1) { ctx.fillStyle = "#9aa3c7"; ctx.fillRect(r * .5, -r * .2, r * .5, r * .7); }
  if (e.tier >= 2 && e.tier <= 4) { ctx.fillStyle = "#1a1530"; ctx.fillRect(-r * .8, -r * .95, r * 1.6, r * .5); }
  if (e.tier >= 3) { ctx.fillStyle = "#ffd34a"; ctx.fillRect(-r * .95, -r * .1, r * .3, r * .15); ctx.fillRect(r * .65, -r * .1, r * .3, r * .15); }
  if (e.tier >= 4) { ctx.fillStyle = "#ffd34a"; ctx.beginPath(); ctx.moveTo(-r * .5, -r * 1.05); ctx.lineTo(-r * .4, -r * 1.5); ctx.lineTo(-r * .15, -r * 1.15); ctx.lineTo(0, -r * 1.6); ctx.lineTo(r * .15, -r * 1.15); ctx.lineTo(r * .4, -r * 1.5); ctx.lineTo(r * .5, -r * 1.05); ctx.fill(); }
  // 이름·힘
  ctx.font = `800 ${e.tier >= 4 ? 12 : 11}px Pretendard, "Noto Sans KR", sans-serif`; ctx.textAlign = "center"; ctx.fillStyle = "#fff"; ctx.strokeStyle = "rgba(0,0,0,.7)"; ctx.lineWidth = 3;
  const label = `${T.name} 힘${T.pow}${e.tier === 5 ? ` ♥${e.hp}` : ""}`; ctx.strokeText(label, 0, r + 18); ctx.fillText(label, 0, r + 18);
  ctx.restore();
}
function lighten(hex) { const p = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)); return `rgb(${p.map((v) => Math.min(255, v + 70)).join(",")})`; }

// ---------------------------------------------------------------- 자동 조종(개발·시험용): 가까운 구슬로, 강한 적은 피하고 약한 적은 쫓아간다
function autoAngle() {
  const g = G; g.started = true;
  let tx = null, ty = null, best = 1e9;
  for (const e of g.enemies) { const T = TIERS[e.tier]; const d = dist(e.x, e.y, g.x, g.y); if (g.lv >= T.pow && (e.tier < 5 ? d < 300 : e.stun <= 0) && d < best) { best = d * 0.6; tx = e.x; ty = e.y; } }
  for (const o of g.orbs) { const d = dist(o.x, o.y, g.x, g.y) / (1 + o.k * 0.6); if (d < best) { best = d; tx = o.x; ty = o.y; } }
  let ax = tx === null ? Math.cos(g.ang) : (tx - g.x), ay = ty === null ? Math.sin(g.ang) : (ty - g.y);
  const L = Math.hypot(ax, ay) || 1; ax /= L; ay /= L;
  for (const e of g.enemies) { const T = TIERS[e.tier]; if (g.lv >= T.pow) continue; const d = dist(e.x, e.y, g.x, g.y); if (d < 220) { const w = (220 - d) / 220 * 2.5; ax += (g.x - e.x) / d * w; ay += (g.y - e.y) / d * w; } }
  if (g.x < 150) ax += 1; if (g.x > WORLD - 150) ax -= 1; if (g.y < 150) ay += 1; if (g.y > WORLD - 150) ay -= 1;
  return Math.atan2(ay, ax);
}

// ---------------------------------------------------------------- 진행
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (mode === "play" && G) { update(dt); hud(); }
  draw();
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- 입력
const KEYS = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", KeyW: "up", KeyS: "down", KeyA: "left", KeyD: "right", Space: "dash", ShiftLeft: "dash", ShiftRight: "dash" };
addEventListener("keydown", (e) => {
  if (KEYS[e.code]) { e.preventDefault(); if (G && mode === "play") { G.keys.add(KEYS[e.code]); if (KEYS[e.code] !== "dash") { G.started = true; hideToast(); } } if (KEYS[e.code] === "dash") $("btnDash").classList.add("hit"); return; }
  if (e.code === "Escape" || e.code === "KeyP") { e.preventDefault(); pause(); }
  if (e.code === "Enter" && mode !== "play") { const b = $("go") || $("retry") || $("resume"); if (b) b.click(); }
});
addEventListener("keyup", (e) => { if (G && KEYS[e.code]) G.keys.delete(KEYS[e.code]); if (KEYS[e.code] === "dash") $("btnDash").classList.remove("hit"); });
// 조이스틱: 캔버스 아무 데나 누른 자리가 중심, 끄는 방향으로 간다
cv.addEventListener("pointerdown", (e) => { if (!G || mode !== "play") return; const r = cv.getBoundingClientRect(); G.joy = { id: e.pointerId, x: e.clientX - r.left, y: e.clientY - r.top, cx: e.clientX - r.left, cy: e.clientY - r.top }; cv.setPointerCapture(e.pointerId); });
cv.addEventListener("pointermove", (e) => {
  if (!G || !G.joy || G.joy.id !== e.pointerId) return;
  const r = cv.getBoundingClientRect(), j = G.joy, px = e.clientX - r.left, py = e.clientY - r.top, dx = px - j.x, dy = py - j.y, L = Math.hypot(dx, dy);
  if (L > 10) { G.want = Math.atan2(dy, dx); if (!G.started) { G.started = true; hideToast(); } }
  const k = Math.min(1, 34 / (L || 1)); j.cx = j.x + dx * k; j.cy = j.y + dy * k;
  if (L > 60) { j.x = px - dx / L * 60; j.y = py - dy / L * 60; }   // 손가락이 멀리 가면 중심도 따라옴
});
const joyEnd = (e) => { if (G && G.joy && G.joy.id === e.pointerId) G.joy = null; };
cv.addEventListener("pointerup", joyEnd); cv.addEventListener("pointercancel", joyEnd);
$("btnDash").addEventListener("pointerdown", (e) => { e.preventDefault(); if (G) G.dash = true; });
const dashEnd = () => { if (G) G.dash = false; };
$("btnDash").addEventListener("pointerup", dashEnd); $("btnDash").addEventListener("pointercancel", dashEnd); $("btnDash").addEventListener("pointerleave", dashEnd);
$("btnMenu").onclick = pause;
$("btnSound").onclick = () => { P.sound = !P.sound; save(); hud(); };
document.addEventListener("visibilitychange", () => { if (document.hidden && mode === "play") pause(); });
addEventListener("resize", resize);
if (window.ResizeObserver) new ResizeObserver(resize).observe($("field"));

// ---------------------------------------------------------------- 시작
load();
Promise.all(CHARS.map((c) => new Promise((res) => { const im = new Image(); im.onload = () => { SPR[c.id] = im; res(); }; im.onerror = res; im.src = `assets/${c.id}.png`; }))).then(() => {
  resize(); title();
  // 개발용 주소: #play 바로 시작 · &auto 자동 조종 · &t=초 (진군 시간 앞당김) · &seg=N 행렬 길이
  const hp = new URLSearchParams(location.hash.slice(1));
  if (hp.has("play") || hp.has("auto")) {
    P.sound = false; AUTO = hp.has("auto"); newGame();
    if (hp.has("t")) G.t = Number(hp.get("t")) || 0;
    if (hp.has("seg")) { G.seg = Number(hp.get("seg")) || 5; while (G.cols.length < G.seg) G.cols.push(pick(ORB_COLORS)); G.lv = lvOf(G.seg); }
    if (hp.has("boss")) spawnEnemy(5);   // &boss 대왕용 바로 등장
    play();
  }
  requestAnimationFrame(frame);
});
window.__snake = { get G() { return G; }, get mode() { return mode; }, P, TIERS, setAuto: (v) => { AUTO = v; } };
