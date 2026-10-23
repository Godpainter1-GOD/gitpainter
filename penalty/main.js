// 퓨어데이 페널티킥 대결 — 6명의 선수, 슛과 막기를 번갈아. 컴퓨터와 대결 / 둘이서(한 기기)
// 좌표는 360×640 논리 화면. 골문 단위: x = -1(왼쪽 골대) ~ 1(오른쪽 골대), h = 0(땅) ~ 1(크로스바)
const W = 360, H = 640;
const GOAL = { cx: 180, y: 262, hw: 134, h: 98 };
const BALL0 = { x: 180, y: 556 };
const PLAYERS = [
  { id: "areum", name: "조아름", acc: 5, pow: 3, def: 4, skill: "빛의 화살", desc: "구석을 정확하게 노려요" },
  { id: "heim", name: "조하임", acc: 3, pow: 4, def: 3, skill: "AI 분석", desc: "막을 때 키커의 눈치를 더 잘 읽어요" },
  { id: "mia", name: "김미아", acc: 4, pow: 4, def: 5, skill: "점프 세이브", desc: "운동선수 출신, 손이 길어요" },
  { id: "michael", name: "마이클 하트", acc: 3, pow: 5, def: 4, skill: "봅슬레이 파워", desc: "공이 가장 빨라요" },
  { id: "diego", name: "디에고", acc: 4, pow: 4, def: 3, skill: "바나나킥", desc: "공이 휘어서 골키퍼가 헷갈려요" },
  { id: "kwame", name: "콰메", acc: 3, pow: 5, def: 4, skill: "강슛", desc: "언제나 온 힘을 실어 차요" },
];
const DIFF = [{ id: 0, name: "쉬움", read: 0.42 }, { id: 1, name: "보통", read: 0.58 }, { id: 2, name: "어려움", read: 0.72 }];
const KICKS = 5;
const LINES = {
  goal: ["골! 빛나는 슛이에요!", "골! 구석에 정확히 꽂혔어요!", "골! 그물이 춤을 춰요!"],
  save: ["멋진 선방이에요!", "손끝으로 막아 냈어요!", "읽었어요! 완벽한 세이브!"],
  miss: ["괜찮아요, 다음 슛은 들어갈 거예요!", "아깝게 빗나갔어요. 다시 해 봐요!"],
  post: ["골대를 맞았어요! 다음엔 조금만 안쪽으로!", "땅! 골대예요. 운이 아까웠어요!"],
  win: ["함께해서 즐거운 대결이었어요!", "서로를 빛나게 한 경기였어요!", "멋진 승부, 다음에 또 해요!"],
};
const PEI = ["🦜 페이: 공을 튕기듯 빠르게 놓으면 강슛, 천천히 놓으면 정확한 슛이에요!", "🦜 페이: 막을 때는 키커의 눈이 보는 쪽을 살펴요. 가끔은 속임수예요!", "🦜 페이: 골대 바로 안쪽이 제일 막기 어려워요. 하지만 빗나갈 수도 있어요!"];

const $ = (id) => document.getElementById(id);
const cv = $("cv"), ctx = cv.getContext("2d");
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * 1.63;   // 대략 표준정규
const col = (x) => (x < -0.33 ? -1 : x > 0.33 ? 1 : 0);
const IMG = {};
let AUTO = false, FAST = false;

// ---------------------------------------------------------------- 저장·소리
const P = { sound: true, diff: 1, best: 0, played: 0, wins: 0 };
function load() { try { Object.assign(P, JSON.parse(localStorage.getItem("pureday-pk-v1") || "{}")); } catch (e) {} }
function save() { try { localStorage.setItem("pureday-pk-v1", JSON.stringify(P)); } catch (e) {} }
let AC = null;
function tone(freqs, dur = 0.08, vol = 0.05, type = "square") {
  if (!P.sound) return;
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === "suspended") AC.resume();
    const t0 = AC.currentTime; freqs.forEach((f, i) => { const o = AC.createOscillator(), g = AC.createGain(); o.type = type; o.frequency.value = f; g.gain.setValueAtTime(vol, t0 + i * dur); g.gain.exponentialRampToValueAtTime(0.0001, t0 + (i + 1) * dur); o.connect(g).connect(AC.destination); o.start(t0 + i * dur); o.stop(t0 + (i + 1) * dur + 0.02); });
  } catch (e) {}
}
const sfx = {
  whistle: () => tone([2300, 2100, 2300], 0.12, 0.04, "sine"), kick: () => tone([140, 90], 0.07, 0.08, "sawtooth"),
  goal: () => tone([523, 659, 784, 1046, 1318], 0.09, 0.05, "triangle"), save: () => tone([330, 220, 165], 0.1, 0.06, "square"),
  post: () => tone([900, 500], 0.08, 0.06, "square"), miss: () => tone([300, 240], 0.12, 0.04, "sine"), tick: () => tone([700], 0.04, 0.03, "triangle"),
};

// ---------------------------------------------------------------- 경기 상태
let mode = "title";       // title | select | play
let M = null;             // 경기
function newMatch(a, b, vs) {
  M = {
    vs,                                   // "cpu" | "2p"
    side: [{ p: a, goals: 0, rec: [] }, { p: b, goals: 0, rec: [] }],
    round: 1, shooter: 0, phase: "intro", t: 0, sudden: false,
    aim: null, drag: null, power: 0.6, charge: null, keeper: null, ball: null, fx: [], netShake: 0, cue: null, lastResult: null,
    keeperLate: false, kickAt: 0, hotPick: null, log: [],
  };
}
const S = () => M.side[M.shooter], K = () => M.side[1 - M.shooter];
const isHumanShooter = () => M.vs === "2p" || M.shooter === 0;
const isHumanKeeper = () => M.vs === "2p" || M.shooter === 1;

// ---------------------------------------------------------------- 화면(DOM)
function screen(html) { const s = $("screen"); s.innerHTML = html; s.hidden = false; }
function hideScreen() { $("screen").hidden = true; }
function title() {
  mode = "title"; $("hud").hidden = true; $("pad").hidden = true;
  screen(`<small style="letter-spacing:6px;opacity:.8;font-weight:800">PUREDAY PENALTY</small>
    <h1><b>퓨어데이</b><br>페널티킥 대결</h1>
    <p>6명의 선수 가운데 골라 슛과 막기를 번갈아 해요.<br>5번씩 차서 더 많이 넣는 쪽이 이겨요.</p>
    <div class="rowbtn" id="diffRow">${DIFF.map((d) => `<button class="small ${P.diff === d.id ? "on" : ""}" data-d="${d.id}">${d.name}</button>`).join("")}</div>
    <button class="big" id="btnCpu">컴퓨터와 대결</button>
    <button class="big alt" id="btnTwo">둘이서 (한 기기)</button>
    <button class="small" id="btnHow">하는 방법</button>
    <p class="sub">${P.played ? `${P.played}경기 · ${P.wins}승 · 최다 골 ${P.best}` : "첫 대결을 시작해요"} · <span id="snd">${P.sound ? "🔊 소리 켬" : "🔇 소리 끔"}</span></p>`);
  $("diffRow").querySelectorAll("button").forEach((b) => (b.onclick = () => { P.diff = Number(b.dataset.d); save(); title(); }));
  $("btnCpu").onclick = () => select("cpu"); $("btnTwo").onclick = () => select("2p"); $("btnHow").onclick = how;
  $("snd").onclick = () => { P.sound = !P.sound; save(); title(); };
}
function how() {
  screen(`<h2>하는 방법</h2>
    <p><b>슛:</b> 공을 누른 채 골문 쪽으로 끌면 과녁이 보여요. <b>튕기듯 빠르게 놓으면 강슛</b>(골키퍼가 반응할 시간이 줄지만 조금 흔들려요), 천천히 놓으면 정확한 슛. 키보드는 ←↑→↓ 로 과녁, Space 를 누르고 있다가 놓으면 힘.</p>
    <p><b>막기:</b> 상대가 준비하는 동안 골문 안 막을 곳을 눌러요. 키커의 머리 위 눈치 화살표가 힌트인데, 가끔 속임수예요! 공이 떠난 직후에도 늦게 몸을 날릴 수 있지만 손이 짧아져요. 키보드 Q W E(위) · A S D(아래).</p>
    <p><b>둘이서:</b> 막는 사람이 먼저 몰래 막을 곳을 고르고 기기를 넘기면, 차는 사람이 슛해요.</p>
    <p><b>선수 특기:</b> 조아름 정확 · 조하임 눈치 읽기 · 김미아 긴 손 · 마이클 빠른 공 · 디에고 휘는 공 · 콰메 강슛</p>
    <button class="big" id="btnBack">돌아가기</button>`);
  $("btnBack").onclick = title;
}
function select(vs) {
  mode = "select"; const chosen = [];
  const step = () => {
    const who = chosen.length === 0 ? (vs === "cpu" ? "내 선수" : "1번 선수(먼저 차요)") : (vs === "cpu" ? "상대 선수" : "2번 선수");
    screen(`<h2>${who}를 고르세요</h2>
      <div class="cards">${PLAYERS.map((p, i) => `<button class="card ${chosen[0] === i ? "taken" : ""}" data-i="${i}" ${chosen[0] === i ? "disabled" : ""}><img src="assets/players/${p.id}_face.png" alt=""><b>${p.name}</b><small>${p.skill} · ${p.desc}</small><div class="st"><span>슛 ${p.acc}</span><span>힘 ${p.pow}</span><span>막기 ${p.def}</span></div></button>`).join("")}</div>
      <div class="rowbtn">${chosen.length === 1 && vs === "cpu" ? `<button class="small" id="btnRand">무작위 상대</button>` : ""}<button class="small" id="btnBack">${chosen.length ? "앞으로" : "처음으로"}</button></div>`);
    $("screen").querySelectorAll(".card").forEach((b) => (b.onclick = () => { sfx.tick(); chosen.push(Number(b.dataset.i)); chosen.length === 2 ? start(chosen[0], chosen[1], vs) : step(); }));
    const r = $("btnRand"); if (r) r.onclick = () => { const rest = PLAYERS.map((_, i) => i).filter((i) => i !== chosen[0]); chosen.push(pick(rest)); start(chosen[0], chosen[1], vs); };
    $("btnBack").onclick = () => { if (chosen.length) { chosen.pop(); step(); } else title(); };
  };
  step();
}
function start(a, b, vs) {
  newMatch(PLAYERS[a], PLAYERS[b], vs); mode = "play"; hideScreen(); $("hud").hidden = false; $("pad").hidden = false;
  $("faceA").src = `assets/players/${M.side[0].p.id}_face.png`; $("faceB").src = `assets/players/${M.side[1].p.id}_face.png`;
  $("nameA").textContent = (vs === "2p" ? "1P " : "") + M.side[0].p.name; $("nameB").textContent = (vs === "2p" ? "2P " : "컴퓨터 ") + M.side[1].p.name;
  hud(); sfx.whistle(); beginKick();
}

// ---------------------------------------------------------------- 킥 진행
function beginKick() {
  const m = M; m.phase = "intro"; m.t = 0; m.aim = null; m.drag = null; m.keeper = null; m.ball = null; m.cue = null; m.keeperLate = false; m.hotPick = null; m.charge = null;
  m.shooterPos = 0; m.power = 0.6;
  hud();
  const s = S(), k = K();
  banner(`${m.sudden ? "서든데스 " : `${m.round}번째 킥 `}— ${s.p.name}`, `${k.p.name}이(가) 골문을 지켜요`);
  setTimeout(() => { if (M !== m || mode !== "play") return; if (m.vs === "2p") hotKeeperPick(); else if (isHumanShooter()) phaseAim(); else phaseCpuAim(); }, FAST ? 200 : 1500);
}
function phaseAim() {
  const m = M; m.phase = "aim"; m.t = 0;
  hint(`<b>${S().p.name}</b>의 슛 — 공을 누른 채 골문 쪽으로 끌어서 과녁을 맞추고, <b>튕기듯 놓으면 강슛</b>`);
  if (AUTO) setTimeout(() => { if (M === m && m.phase === "aim") shoot({ x: rnd(-1.1, 1.1), h: rnd(0, 1.1) }, rnd(0.3, 1)); }, FAST ? 150 : 900);
}
function hotKeeperPick() {   // 둘이서: 막는 사람이 몰래 고른다
  const m = M; m.phase = "hot";
  const k = K();
  screen(`<h2>${k.p.name}(${m.shooter === 0 ? "2P" : "1P"})이 막을 곳을 고르세요</h2><p class="sub">${S().p.name}은 잠깐 눈을 감아 주세요 🙈</p>
    <div class="zones">${["↖ 위 왼쪽", "↑ 위 가운데", "↗ 위 오른쪽", "↙ 아래 왼쪽", "↓ 아래 가운데", "↘ 아래 오른쪽"].map((n, i) => `<button data-z="${i}">${n}</button>`).join("")}</div>`);
  $("screen").querySelectorAll(".zones button").forEach((b) => (b.onclick = () => { const z = Number(b.dataset.z); m.hotPick = { x: [-0.72, 0, 0.72][z % 3], h: z < 3 ? 0.75 : 0.2 }; sfx.tick();
    screen(`<h2>골라졌어요!</h2><p>이제 기기를 <b>${S().p.name}</b>에게 넘겨 주세요.</p><button class="big" id="btnGo">슛 준비</button>`); $("btnGo").onclick = () => { hideScreen(); phaseAim(); }; }));
  if (AUTO) { m.hotPick = { x: pick([-0.72, 0, 0.72]), h: pick([0.75, 0.2]) }; hideScreen(); phaseAim(); }
}
function phaseCpuAim() {   // 컴퓨터가 찬다: 준비 동작 동안 사람이 막을 곳을 고른다
  const m = M, s = S().p; m.phase = "cpuaim"; m.t = 0;
  const side = Math.random() < 0.65 ? (Math.random() < 0.5 ? -1 : 1) : 0;
  const x = side ? side * rnd(0.6, 0.97) : rnd(-0.3, 0.3), h = Math.random() < 0.5 ? rnd(0.05, 0.4) : rnd(0.5, 0.92);
  const power = s.id === "kwame" ? rnd(0.75, 1) : rnd(0.45, 0.95);
  m.plan = { aim: { x, h }, power };
  const honest = Math.random() < (s.id === "diego" ? 0.5 : 0.65);
  const shotPrev = resolveShot(s, m.plan.aim, power, true);   // 겉보기 방향(휘기 전)
  m.cue = honest ? col(shotPrev.apparent.x) : pick([-1, 0, 1].filter((c) => c !== col(shotPrev.apparent.x)));
  m.planned = shotPrev;
  hint(`<b>${K().p.name}</b>의 막기 — 골문 안 막을 곳을 누르세요. 키커의 눈치 화살표는 힌트(가끔 속임수!)`);
  const wind = FAST ? 500 : 1700;
  setTimeout(() => { if (M === m && m.phase === "cpuaim") launch(shotPrev); }, wind);
  if (AUTO) setTimeout(() => { if (M === m && (m.phase === "cpuaim" || m.phase === "fly")) dive({ x: pick([-0.72, 0, 0.72]), h: pick([0.75, 0.2]) }); }, wind * rnd(0.3, 1.2));
}
// 슛 계산: 선수 특기·힘에 따라 흔들림과 휘기를 더해 최종 도착점을 정한다
function resolveShot(p, aim, power, keepRandom = false) {
  let sc = (0.2 - p.acc * 0.028) * (0.55 + power * 0.7);
  if (p.id === "areum") sc *= 0.6; if (p.id === "kwame") sc *= 1.15;
  const fx = aim.x + gauss() * sc, fh = Math.max(0, aim.h + gauss() * sc * 0.9);
  const curve = p.id === "diego" ? (Math.random() < 0.5 ? -1 : 1) * rnd(0.22, 0.34) : 0;
  let T = 0.98 - power * 0.38; if (p.id === "michael") T *= 0.8; if (p.id === "kwame") T *= 0.88; T = Math.max(0.42, T);
  return { final: { x: fx, h: fh }, apparent: { x: fx - curve, h: fh }, curve, power, T };
}
function shoot(aim, power) {   // 사람이 찼다
  const m = M; if (m.phase !== "aim") return;
  const shot = resolveShot(S().p, aim, power);
  if (m.vs === "2p") { m.keeper = { ...m.hotPick, late: false, t: 0 }; }
  else cpuKeeperDecide(shot);
  launch(shot);
}
function cpuKeeperDecide(shot) {
  const m = M, k = K().p;
  let p = DIFF[P.diff].read - shot.power * 0.12 + (k.id === "heim" ? 0.1 : 0);
  const ac = col(shot.apparent.x);
  const c = Math.random() < p ? ac : pick([-1, 0, 1].filter((v) => v !== ac));
  const hiOK = Math.random() < 0.55;
  const h = (shot.apparent.h > 0.5) === hiOK ? 0.75 : 0.2;
  m.keeper = { x: c * 0.72, h, late: false, t: 0 };
}
function launch(shot) {
  const m = M; m.phase = "fly"; m.t = 0; m.shot = shot; m.kickAt = 0; m.shooterPos = 1; sfx.kick();
  m.ball = { t: 0 };
  hint(isHumanKeeper() ? `공이 떠났어요! 아직이면 <b>지금 눌러서</b> 몸을 날려요` : "슛!");
}
function dive(z) {   // 사람 골키퍼가 막을 곳을 정했다
  const m = M; if (!(m.phase === "cpuaim" || (m.phase === "fly" && m.ball.t < 0.25 && !m.keeper))) return;
  if (m.keeper) return;
  m.keeper = { x: clamp(z.x, -1, 1), h: clamp(z.h, 0, 1), late: m.phase === "fly", t: 0 }; sfx.tick();
  hint(m.keeper.late ? "늦게 몸을 날렸어요!" : "막을 곳을 정했어요 — 공이 옵니다");
}
function resolve() {
  const m = M, s = S(), k = K(), f = m.shot.final, kp = k.p;
  let res;
  const ax = Math.abs(f.x);
  if (ax > 1.08 || f.h > 1.08) res = "miss";
  else if (ax > 0.96 || f.h > 0.96) res = "post";
  else {
    const kx = m.keeper ? m.keeper.x : 0, kh = m.keeper ? m.keeper.h : 0.35;
    let RX = 0.36 + kp.def * 0.04 + (kp.id === "mia" ? 0.08 : 0), RH = 0.5 + kp.def * 0.05;
    if (!m.keeper) RX *= 0.65; else if (m.keeper.late) { RX *= 0.75; RH *= 0.8; }
    res = Math.abs(f.x - kx) <= RX && Math.abs(f.h - kh) <= RH ? "save" : "goal";
  }
  m.lastResult = res; s.rec.push(res === "goal"); if (res === "goal") s.goals++;
  m.log.push({ round: m.round, shooter: s.p.id, res, x: +f.x.toFixed(2), h: +f.h.toFixed(2), power: +m.shot.power.toFixed(2), keeper: m.keeper && { x: m.keeper.x, h: m.keeper.h, late: m.keeper.late } });
  if (res === "goal") { sfx.goal(); m.netShake = 1; confetti(); banner("⚽ 골!", pick(LINES.goal)); }
  else if (res === "save") { sfx.save(); banner("🧤 막았어요!", `${kp.name}: "${pick(LINES.save)}"`); }
  else if (res === "post") { sfx.post(); banner("골대!", pick(LINES.post), true); }
  else { sfx.miss(); banner("빗나갔어요", pick(LINES.miss), true); }
  m.phase = "result"; m.t = 0; hud();
  setTimeout(() => { if (M === m) next(); }, FAST ? 400 : 2200);
}
function next() {
  const m = M, a = m.side[0], b = m.side[1];
  // 승부가 이미 났는지: 남은 킥을 다 넣어도 못 따라가면 끝
  if (!m.sudden) {
    const remA = KICKS - a.rec.length, remB = KICKS - b.rec.length;
    if (a.goals > b.goals + remB || b.goals > a.goals + remA) return finish();
    if (a.rec.length === KICKS && b.rec.length === KICKS) { if (a.goals !== b.goals) return finish(); m.sudden = true; }
  } else if (a.rec.length === b.rec.length && a.goals !== b.goals) return finish();
  if (m.shooter === 0) m.shooter = 1; else { m.shooter = 0; m.round++; }
  beginKick();
}
function finish() {
  const m = M, a = m.side[0], b = m.side[1]; m.phase = "end"; mode = "end";
  const winner = a.goals > b.goals ? a : b, human = m.vs === "2p" || winner === a;
  P.played++; if (m.vs === "cpu" && winner === a) P.wins++; P.best = Math.max(P.best, a.goals); save();
  sfx.whistle(); setTimeout(() => sfx.goal(), 300);
  const rec = (s) => `<div class="rec">${s.rec.map((g) => `<i class="${g ? "g" : "x"}"></i>`).join("")}</div>`;
  screen(`<small style="letter-spacing:4px;opacity:.8;font-weight:800">${m.sudden ? "서든데스 끝" : "경기 끝"}</small>
    <h1>${human ? "🏆" : "🤝"} ${winner.p.name} <b>승리!</b></h1>
    <div class="fin"><div><img src="assets/players/${a.p.id}_face.png" alt=""><br><b>${a.p.name}</b>${rec(a)}</div><div class="vs">${a.goals} : ${b.goals}</div><div><img src="assets/players/${b.p.id}_face.png" alt=""><br><b>${b.p.name}</b>${rec(b)}</div></div>
    <div class="pei"><img src="assets/players/${winner.p.id}_face.png" style="width:36px;height:36px;border-radius:50%" alt=""><span>${winner.p.name}: "${pick(LINES.win)}"</span></div>
    <button class="big" id="btnAgain">다시 대결</button>
    <div class="rowbtn"><button class="small" id="btnSel">선수 바꾸기</button><button class="small" id="btnHome">처음으로</button></div>`);
  $("btnAgain").onclick = () => start(PLAYERS.indexOf(a.p), PLAYERS.indexOf(b.p), m.vs);
  $("btnSel").onclick = () => select(m.vs); $("btnHome").onclick = title;
  $("hud").hidden = true; $("pad").hidden = true;
}

// ---------------------------------------------------------------- HUD·알림
function hud() {
  if (!M) return;
  const m = M;
  $("scoreA").textContent = m.side[0].goals; $("scoreB").textContent = m.side[1].goals;
  $("round").textContent = m.sudden ? "서든데스" : `${m.round} / ${KICKS}`;
  [0, 1].forEach((i) => { const s = m.side[i], n = Math.max(KICKS, s.rec.length + (m.sudden ? 1 : 0)); const el = $(i ? "slotsB" : "slotsA"); el.innerHTML = ""; for (let k = 0; k < n; k++) { const d = document.createElement("i"); if (k < s.rec.length) d.className = s.rec[k] ? "g" : "x"; else if (k === s.rec.length && m.shooter === i && m.phase !== "end") d.className = "now"; el.appendChild(d); } });
}
let bannerTimer = 0, toastTimer = 0;
function banner(big, small = "", red = false) { const b = $("banner"); b.innerHTML = `${big}<small>${small}</small>`; b.className = "banner" + (red ? " red" : ""); b.hidden = false; clearTimeout(bannerTimer); bannerTimer = setTimeout(() => { b.hidden = true; }, 2100); }
function hint(html) { $("hint").innerHTML = html; }
function toast(msg, ms = 1800) { const t = $("toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, ms); }
function confetti() { for (let i = 0; i < 60; i++) M.fx.push({ x: rnd(60, 300), y: rnd(150, 260), vx: rnd(-80, 80), vy: rnd(-160, -40), t: rnd(0.8, 1.6), c: pick(["#ffd34a", "#7fe07a", "#5ec8ff", "#ff9ad5", "#fff"]), r: rnd(2, 4) }); }

// ---------------------------------------------------------------- 그리기
const gx = (x) => GOAL.cx + x * GOAL.hw, gy = (h) => GOAL.y - h * GOAL.h;
function draw(dt) {
  const m = M;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.clearRect(0, 0, W, H);
  // 하늘·관중석
  let g = ctx.createLinearGradient(0, 0, 0, 200); g.addColorStop(0, "#1e3a6a"); g.addColorStop(1, "#4b78b8"); ctx.fillStyle = g; ctx.fillRect(0, 0, W, 200);
  ctx.fillStyle = "#2b2f4a"; ctx.fillRect(0, 120, W, 90);
  for (let r = 0; r < 4; r++) for (let i = 0; i < 30; i++) { ctx.fillStyle = ["#e4c1a0", "#f2d6b8", "#c99a74", "#ffd34a", "#8ab4ff", "#ff9ad5"][(i * 7 + r * 3) % 6]; ctx.globalAlpha = 0.75; ctx.beginPath(); ctx.arc(6 + i * 12 + (r % 2) * 6, 132 + r * 18 + Math.sin((i + r) * 1.3) * 2, 4, 0, 7); ctx.fill(); }
  ctx.globalAlpha = 1; ctx.fillStyle = "#1b2140"; ctx.fillRect(0, 206, W, 8);
  // 잔디(원근 줄무늬)
  for (let i = 0; i < 9; i++) { const y0 = 214 + i * 47.5; ctx.fillStyle = i % 2 ? "#3f9a3f" : "#48a848"; ctx.fillRect(0, y0, W, 48); }
  ctx.strokeStyle = "rgba(255,255,255,.85)"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, GOAL.y + 2); ctx.lineTo(W, GOAL.y + 2); ctx.stroke();                     // 골라인
  ctx.beginPath(); ctx.moveTo(24, 430); ctx.lineTo(80, GOAL.y + 2); ctx.moveTo(336, 430); ctx.lineTo(280, GOAL.y + 2); ctx.moveTo(24, 430); ctx.lineTo(336, 430); ctx.stroke();   // 골 에어리어
  ctx.beginPath(); ctx.ellipse(180, 430, 70, 20, 0, Math.PI, 0, true); ctx.stroke();
  ctx.beginPath(); ctx.arc(BALL0.x, BALL0.y + 4, 3, 0, 7); ctx.fillStyle = "#fff"; ctx.fill();
  // 골문(그물 → 기둥)
  const shake = m && m.netShake > 0 ? Math.sin(m.netShake * 40) * 4 * m.netShake : 0;
  ctx.save(); ctx.beginPath(); ctx.rect(gx(-1), gy(1) - 6, GOAL.hw * 2, GOAL.h + 8); ctx.clip();
  ctx.fillStyle = "rgba(255,255,255,.12)"; ctx.fillRect(gx(-1), gy(1), GOAL.hw * 2, GOAL.h);
  ctx.strokeStyle = "rgba(255,255,255,.45)"; ctx.lineWidth = 1;
  for (let i = 0; i <= 16; i++) { const x = gx(-1) + i * (GOAL.hw * 2 / 16) + shake; ctx.beginPath(); ctx.moveTo(x, gy(1)); ctx.lineTo(x, GOAL.y); ctx.stroke(); }
  for (let i = 0; i <= 7; i++) { const y = gy(1) + i * (GOAL.h / 7); ctx.beginPath(); ctx.moveTo(gx(-1), y + shake * 0.5); ctx.lineTo(gx(1), y + shake * 0.5); ctx.stroke(); }
  ctx.restore();
  ctx.strokeStyle = "#fff"; ctx.lineWidth = 5; ctx.lineJoin = "round"; ctx.beginPath(); ctx.moveTo(gx(-1), GOAL.y + 2); ctx.lineTo(gx(-1), gy(1)); ctx.lineTo(gx(1), gy(1)); ctx.lineTo(gx(1), GOAL.y + 2); ctx.stroke();
  if (!m) return;
  // 막기 안내: 사람 골키퍼 차례면 골문 구역 살짝 표시
  if (isHumanKeeper() && (m.phase === "cpuaim" || (m.phase === "fly" && !m.keeper))) {
    ctx.strokeStyle = "rgba(255,211,74,.45)"; ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(gx(-0.33), gy(1)); ctx.lineTo(gx(-0.33), GOAL.y); ctx.moveTo(gx(0.33), gy(1)); ctx.lineTo(gx(0.33), GOAL.y); ctx.moveTo(gx(-1), gy(0.5)); ctx.lineTo(gx(1), gy(0.5)); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = "rgba(0,0,0,.55)"; ctx.beginPath(); ctx.roundRect(GOAL.cx - 62, gy(0.5) - 11, 124, 22, 11); ctx.fill(); ctx.fillStyle = "#ffd34a"; ctx.font = "700 12px Pretendard, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("막을 곳을 누르세요", GOAL.cx, gy(0.5)); ctx.textBaseline = "alphabetic";
  }
  // 골키퍼
  drawKeeper(m);
  // 키커
  drawShooter(m);
  // 눈치 화살표
  if (m.phase === "cpuaim" && m.cue !== null) { const sx = 112, sy = 428; ctx.save(); ctx.translate(sx, sy); ctx.fillStyle = "#ffd34a"; ctx.font = "900 22px Pretendard, sans-serif"; ctx.textAlign = "center"; ctx.fillText(m.cue < 0 ? "👀 ↖" : m.cue > 0 ? "👀 ↗" : "👀 ↑", 0, Math.sin(m.t * 6) * 3); ctx.restore(); }
  // 과녁·조준선
  if (m.phase === "aim" && m.aim) {
    const ax = gx(m.aim.x), ay = gy(m.aim.h);
    ctx.setLineDash([6, 6]); ctx.strokeStyle = "rgba(255,255,255,.7)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(BALL0.x, BALL0.y); ctx.lineTo(ax, ay); ctx.stroke(); ctx.setLineDash([]);
    const inGoal = Math.abs(m.aim.x) <= 1 && m.aim.h <= 1;
    ctx.strokeStyle = inGoal ? "#ffd34a" : "#ff5a6e"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(ax, ay, 12, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.moveTo(ax - 18, ay); ctx.lineTo(ax + 18, ay); ctx.moveTo(ax, ay - 18); ctx.lineTo(ax, ay + 18); ctx.stroke();
    if (m.charge !== null) { ctx.fillStyle = "rgba(0,0,0,.5)"; ctx.fillRect(BALL0.x - 50, BALL0.y + 26, 100, 10); ctx.fillStyle = m.power > 0.8 ? "#ff5a6e" : "#ffd34a"; ctx.fillRect(BALL0.x - 50, BALL0.y + 26, 100 * m.power, 10); }
  }
  // 공
  drawBall(m);
  // 조각(색종이)
  for (const f of m.fx) { ctx.globalAlpha = Math.min(1, f.t); ctx.fillStyle = f.c; ctx.fillRect(f.x, f.y, f.r, f.r); } ctx.globalAlpha = 1;
}
function drawKeeper(m) {
  const k = K().p, im = IMG[k.id]; if (!im) return;
  let x = GOAL.cx, y = GOAL.y + 6, rot = 0, sc = 1;
  if (m.keeper) {
    const t = Math.min(1, m.keeper.t / 0.28), e = 1 - (1 - t) * (1 - t);
    x = lerp(GOAL.cx, gx(m.keeper.x * 0.85), e); y = lerp(GOAL.y + 6, gy(m.keeper.h * 0.55) + 6, e);
    rot = lerp(0, clamp(m.keeper.x, -1, 1) * 0.95, e); sc = lerp(1, 0.92, e);
  } else if (m.phase === "cpuaim" || m.phase === "aim" || m.phase === "intro" || m.phase === "hot") { x += Math.sin((m.t || 0) * 3) * 6; }
  const h = 126 * sc, w = h * im.width / im.height;
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.beginPath(); ctx.ellipse(0, 0, w * 0.4, 7, 0, 0, 7); ctx.fill();
  ctx.drawImage(im, -w / 2, -h, w, h); ctx.restore();
}
function drawShooter(m) {
  const s = S().p, im = IMG[s.id]; if (!im) return;
  const lung = m.shooterPos ? Math.max(0, 1 - m.t / 0.25) : 0;   // 찬 직후 살짝 앞으로
  const x = 112 + (m.shooterPos ? 22 * (1 - lung * 0.5) : 0), y = 612;
  const h = 168, w = h * im.width / im.height;
  ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.beginPath(); ctx.ellipse(x, y, w * 0.38, 9, 0, 0, 7); ctx.fill();
  ctx.drawImage(im, x - w / 2, y - h, w, h);
}
function drawBall(m) {
  let x = BALL0.x, y = BALL0.y, r = 11, t = 0;
  if (m.phase === "fly" || m.phase === "result") {
    t = Math.min(1, m.ball.t / m.shot.T);
    const f = m.shot.final, a = m.shot.apparent;
    const tx = gx(f.x), ty = gy(f.h), ax = gx(a.x);
    x = lerp(BALL0.x, ax, t) + (tx - ax) * t * t;
    const arc = 26 + 50 * (1 - Math.min(1, f.h));
    y = lerp(BALL0.y, ty, t) - Math.sin(Math.PI * t) * arc;
    r = lerp(11, 6, t);
    if (m.phase === "result") {
      const u = Math.min(1, m.t / 0.6);
      if (m.lastResult === "goal") { y = ty + u * 6; }
      else if (m.lastResult === "save") { x = tx + (BALL0.x > tx ? 1 : -1) * 20 * u; y = ty + 60 * u * u; }
      else if (m.lastResult === "post") { x = tx + (tx > GOAL.cx ? 1 : -1) * 70 * u; y = ty + 90 * u * u; }
      else { x = tx + (f.x > 0 ? 1 : -1) * 20 * u; y = ty - 30 * u + 40 * u * u; }
    }
  }
  ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.beginPath(); ctx.ellipse(x, Math.min(BALL0.y + 6, y + r + 2 + (1 - t) * 0), r * 0.9, r * 0.35, 0, 0, 7); ctx.fill();
  ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  ctx.strokeStyle = "#222"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke();
  const sp = (m.ball ? m.ball.t : 0) * 20;
  ctx.fillStyle = "#222"; for (let i = 0; i < 5; i++) { const a = sp + i * 1.256; ctx.beginPath(); ctx.arc(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.22, 0, 7); ctx.fill(); }
  if (m.phase === "aim" && m.drag) { ctx.strokeStyle = "rgba(255,211,74,.9)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(BALL0.x, BALL0.y, 20, 0, 7); ctx.stroke(); }
}

// ---------------------------------------------------------------- 진행(프레임)
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000) * (FAST ? 3 : 1); last = now;
  if (M && mode === "play") {
    const m = M; m.t += dt;
    if (m.keeper) m.keeper.t += dt;
    if (m.phase === "fly") { m.ball.t += dt; if (m.ball.t >= m.shot.T) resolve(); }
    if (m.phase === "aim" && m.charge !== null) { m.charge += dt; m.power = 0.3 + 0.7 * Math.abs(Math.sin(m.charge * 2.4)); }
    m.netShake = Math.max(0, m.netShake - dt * 1.4);
    for (let i = m.fx.length - 1; i >= 0; i--) { const f = m.fx[i]; f.t -= dt; f.x += f.vx * dt; f.y += f.vy * dt; f.vy += 300 * dt; if (f.t <= 0) m.fx.splice(i, 1); }
  }
  draw(dt);
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- 입력
const pos = (e) => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height }; };
let samples = [];
cv.addEventListener("pointerdown", (e) => {
  if (!M || mode !== "play") return; const p = pos(e), m = M; e.preventDefault();
  if (m.phase === "aim" && isHumanShooter()) {
    if (Math.hypot(p.x - BALL0.x, p.y - BALL0.y) < 70) { m.drag = { sx: p.x, sy: p.y, id: e.pointerId }; samples = [{ t: performance.now(), x: p.x, y: p.y }]; m.aim = null; cv.setPointerCapture(e.pointerId); }
  } else if (isHumanKeeper() && (m.phase === "cpuaim" || m.phase === "fly")) {
    if (p.y < 330) dive({ x: (p.x - GOAL.cx) / GOAL.hw, h: (GOAL.y - p.y) / GOAL.h });
  }
});
cv.addEventListener("pointermove", (e) => {
  const m = M; if (!m || m.phase !== "aim" || !m.drag || m.drag.id !== e.pointerId) return; const p = pos(e);
  const mx = BALL0.x + (p.x - m.drag.sx) * 2.2, my = BALL0.y + (p.y - m.drag.sy) * 2.0;
  m.aim = { x: clamp((mx - GOAL.cx) / GOAL.hw, -1.45, 1.45), h: clamp((GOAL.y - my) / GOAL.h, 0, 1.45) };
  samples.push({ t: performance.now(), x: p.x, y: p.y }); if (samples.length > 8) samples.shift();
});
const release = (e) => {
  const m = M; if (!m || m.phase !== "aim" || !m.drag || m.drag.id !== e.pointerId) return;
  const p = pos(e), d = Math.hypot(p.x - m.drag.sx, p.y - m.drag.sy);
  const old = samples.find((s) => performance.now() - s.t <= 90) || samples[0]; const dtm = Math.max(16, performance.now() - old.t);
  const v = Math.hypot(p.x - old.x, p.y - old.y) / dtm * 1000;   // 논리 px/초
  m.drag = null;
  if (d < 25 || !m.aim) { m.aim = null; return; }
  const power = clamp((v - 150) / 1500, 0.25, 1);
  m.power = power; shoot(m.aim, power);
};
cv.addEventListener("pointerup", release); cv.addEventListener("pointercancel", release);
addEventListener("keydown", (e) => {
  const m = M; if (!m || mode !== "play") return;
  if (m.phase === "aim" && isHumanShooter()) {
    const k = e.key; if (!m.aim && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " "].includes(k)) m.aim = { x: 0, h: 0.4 };
    if (k === "ArrowLeft") m.aim.x = clamp(m.aim.x - 0.1, -1.45, 1.45); if (k === "ArrowRight") m.aim.x = clamp(m.aim.x + 0.1, -1.45, 1.45);
    if (k === "ArrowUp") m.aim.h = clamp(m.aim.h + 0.1, 0, 1.45); if (k === "ArrowDown") m.aim.h = clamp(m.aim.h - 0.1, 0, 1.45);
    if (k === " " && m.charge === null) { m.charge = 0; }
    if (k.startsWith("Arrow") || k === " ") e.preventDefault();
  } else if (isHumanKeeper() && (m.phase === "cpuaim" || m.phase === "fly")) {
    const map = { q: [-0.72, 0.75], w: [0, 0.75], e: [0.72, 0.75], a: [-0.72, 0.2], s: [0, 0.2], d: [0.72, 0.2] };
    const z = map[e.key.toLowerCase()]; if (z) dive({ x: z[0], h: z[1] });
  }
});
addEventListener("keyup", (e) => { const m = M; if (m && m.phase === "aim" && e.key === " " && m.charge !== null) { const pw = m.power; m.charge = null; shoot(m.aim || { x: 0, h: 0.4 }, pw); } });
$("btnMenu").onclick = () => title();
const DPR = Math.min(2, window.devicePixelRatio || 1); cv.width = W * DPR; cv.height = H * DPR;

// ---------------------------------------------------------------- 시작
load();
Promise.all(PLAYERS.map((p) => new Promise((res) => { const im = new Image(); im.onload = () => { IMG[p.id] = im; res(); }; im.onerror = res; im.src = `assets/players/${p.id}.png`; }))).then(() => {
  const hp = new URLSearchParams(location.hash.slice(1));
  // 개발용: #auto (자동 경기, 컴퓨터끼리처럼) · &fast · &2p · &a=areum&b=mia
  if (hp.has("auto") || hp.has("play")) {
    P.sound = false; AUTO = hp.has("auto"); FAST = hp.has("fast");
    const a = PLAYERS.findIndex((p) => p.id === hp.get("a")), b = PLAYERS.findIndex((p) => p.id === hp.get("b"));
    start(a >= 0 ? a : 0, b >= 0 ? b : 2, hp.has("2p") ? "2p" : "cpu");
  } else title();
  requestAnimationFrame(frame);
});
window.__pk = { get M() { return M; }, get mode() { return mode; }, P, PLAYERS, shoot, dive };
