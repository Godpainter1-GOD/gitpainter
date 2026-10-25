// 퓨어데이 FC — 2D 경기 엔진 (위에서 내려다보는 11대11). 단위 m, 경기장 68×105.
// 팀 0(홈)은 아래(y=105) 골을 지키고 위(y=0)로 공격, 팀 1은 반대. 사람 입력은 팀별 input 객체로 받는다.
import { FORMATIONS, ovr, toEngine, toOld, slotsOf, tacN } from "./data.js?v=3";

export const PW = 68, PL = 105, GOAL_W = 7.32, GOAL_H = 2.44;
const GX0 = PW / 2 - GOAL_W / 2, GX1 = PW / 2 + GOAL_W / 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hyp = Math.hypot;

export class Match {
  // opts: { teams:[{name,short,c1,c2,players:[11 선수 객체(능력)], formation, tactic}], human:[bool,bool], halfSec, diff, onEvent }
  constructor(opts) {
    this.o = opts; this.halfSec = opts.halfSec || 150; this.diff = opts.diff ?? 1;
    this.rand = opts.rand || Math.random;
    this.teams = opts.teams; this.human = opts.human || [true, false];
    this.input = [mkInput(), mkInput()];
    this.score = [0, 0]; this.stats = { shots: [0, 0], onTarget: [0, 0], poss: [0, 0], passes: [0, 0] };
    this.t = 0; this.half = 1; this.phase = "kickoff"; this.timer = 1.2; this.kickTeam = 0;
    this.ball = { x: PW / 2, y: PL / 2, z: 0, vx: 0, vy: 0, vz: 0, owner: -1, last: 0, kicker: -1, shot: null, restart: null };
    this.ctrl = [-1, -1]; this.ctrlHold = [0, 0]; this.events = [];
    this.ps = [];
    for (let t = 0; t < 2; t++) {
      const tm = this.teams[t]; tm.tactic = tm.tactic || {}; if (!tm.tactic.formation) tm.tactic.formation = tm.formation;
      if (tm.slots && !tm.tactic.slots) tm.tactic.slots = tm.slots;
      const slots = slotsOf(tm.tactic); tm.tn = tacN(tm.tactic);
      tm.players.forEach((raw, i) => {
        const d = toEngine(raw);
        const [pos, ax, ay] = slots[i];
        this.ps.push({ t, i, pos, d, ax, ay, x: 0, y: 0, vx: 0, vy: 0, fx: 0, fy: t === 0 ? -1 : 1, stun: 0, kickCd: 0, think: this.rand() * 0.3, tackleT: 0, plan: null, num: raw.num && /^\d+$/.test(raw.num) ? +raw.num : i === 0 ? 1 : i + 1, goals: 0, energy: 1,
          jit: { x: (this.rand() - 0.5), y: (this.rand() - 0.5) } });
      });
    }
    this.kickoffSetup(0);
  }
  // ------------------------------------------------------------ 좌표 도우미
  wx(t, ax) { return t === 0 ? ax * PW : PW - ax * PW; }
  wy(t, ay) { return t === 0 ? PL - ay * PL : ay * PL; }
  goalY(t) { return t === 0 ? 0 : PL; }            // 팀 t 가 공격하는 골 라인
  ownGoalY(t) { return t === 0 ? PL : 0; }
  prog(t, y) { return t === 0 ? (PL - y) / PL : y / PL; }   // 0 = 우리 골, 1 = 상대 골
  maxSpeed(p) { return (5.4 + p.d.pac * 0.042) * (0.78 + 0.22 * p.energy); }
  team(t) { return this.ps.filter((p) => p.t === t); }
  gk(t) { return this.ps.find((p) => p.t === t && p.pos === "GK") || this.ps.find((p) => p.t === t); }
  emit(type, text, extra = {}) { const e = { type, text, t: this.minute(), ...extra }; this.events.push(e); if (this.o.onEvent) this.o.onEvent(e); }
  minute() { return Math.min(90, Math.floor((this.half - 1) * 45 + (this.t / this.halfSec) * 45)); }

  kickoffSetup(team) {
    this.kickTeam = team; const b = this.ball;
    Object.assign(b, { x: PW / 2, y: PL / 2, z: 0, vx: 0, vy: 0, vz: 0, owner: -1, shot: null, restart: null });
    for (const p of this.ps) {
      const ay = Math.min(p.ay, 0.46); p.x = this.wx(p.t, p.ax); p.y = this.wy(p.t, ay); p.vx = p.vy = 0; p.stun = 0; p.kickCd = 0;
    }
    // 차는 팀 공격수 두 명을 가운데로
    const fw = this.team(team).filter((p) => p.pos !== "GK").sort((a, b) => b.ay - a.ay);
    if (fw[0]) { fw[0].x = PW / 2 - 0.8; fw[0].y = PL / 2 + (team === 0 ? 0.6 : -0.6); this.ball.owner = this.ps.indexOf(fw[0]); this.ball.last = team; }
    if (fw[1]) { fw[1].x = PW / 2 + 6; fw[1].y = PL / 2 + (team === 0 ? 1.5 : -1.5); }
    this.phase = "kickoff"; this.timer = 1.2; this.ctrl = [-1, -1];
  }

  // ------------------------------------------------------------ 한 걸음
  step(dt) {
    if (this.phase === "end") return;
    if (this.phase === "goal" || this.phase === "half") { this.timer -= dt; if (this.timer <= 0) this.kickoffSetup(this.kickTeam); return; }
    if (this.phase === "kickoff" || this.phase === "restart") { this.timer -= dt; if (this.timer <= 0) this.phase = "play"; this.updateCtrl(dt); this.syncBallToOwner(); return; }
    this.t += dt;
    if (this.t >= this.halfSec) {
      if (this.half === 1) { this.half = 2; this.t = 0; this.phase = "half"; this.timer = 2; this.kickTeam = 1; for (const p of this.ps) p.energy = Math.min(1, p.energy + 0.12); this.emit("half", "전반 끝"); return; }
      this.phase = "end"; this.emit("end", "경기 끝"); return;
    }
    const b = this.ball;
    if (b.owner >= 0) this.stats.poss[this.ps[b.owner].t] += dt;
    this.updateCtrl(dt);
    for (const p of this.ps) { p.stun = Math.max(0, p.stun - dt); p.kickCd = Math.max(0, p.kickCd - dt); p.bodyCd = Math.max(0, (p.bodyCd || 0) - dt); p.flash = Math.max(0, (p.flash || 0) - dt); }
    for (let i = 0; i < this.ps.length; i++) this.think(i, dt);
    for (const p of this.ps) this.move(p, dt);
    // 체력: 경기 전체(2×halfSec)에 걸쳐 달린 만큼 줄어든다. 체력 능력치가 낮을수록 빨리
    const drainBase = dt / (this.halfSec * 2);
    for (const p of this.ps) { if (p.pos === "GK") continue; const run = Math.hypot(p.vx, p.vy) / 8; p.energy = Math.max(0.25, p.energy - drainBase * (0.15 + run * 0.7) * (1.55 - p.d.sta / 100)); }
    this.ballPhysics(dt);
    this.tackles(dt);
    this.checkOut();
  }

  // ------------------------------------------------------------ 사람이 조종하는 선수
  updateCtrl(dt) {
    const b = this.ball;
    for (let t = 0; t < 2; t++) {
      if (!this.human[t]) { this.ctrl[t] = -1; continue; }
      const inp = this.input[t]; this.ctrlHold[t] = Math.max(0, this.ctrlHold[t] - dt);
      if (b.owner >= 0 && this.ps[b.owner].t === t) { this.ctrl[t] = b.owner; continue; }
      const cur = this.ps[this.ctrl[t]];
      const want = inp.switchQ || this.ctrl[t] < 0 || !cur || cur.t !== t || (this.ctrlHold[t] <= 0 && !inp.moving);
      if (inp.switchQ) inp.switchQ = false;
      if (want) {
        // 공에 가장 가까운 선수(골키퍼 빼고)
        let best = -1, bd = 1e9;
        this.ps.forEach((p, i) => { if (p.t !== t || p.pos === "GK") return; const d = hyp(p.x - b.x, p.y - b.y) + (i === this.ctrl[t] ? -2 : 0); if (d < bd) { bd = d; best = i; } });
        if (best !== this.ctrl[t]) { this.ctrl[t] = best; this.ctrlHold[t] = 0.8; }
      }
    }
  }

  // ------------------------------------------------------------ 생각(인공지능)
  think(i, dt) {
    const p = this.ps[i], b = this.ball, t = p.t, tn = this.teams[t].tn;
    p.tx = p.x; p.ty = p.y; p.run = 0.75;
    if (p.slide || p.stun > 0) { p.tx = p.x; p.ty = p.y; return; }
    if (this.ctrl[t] === i) return this.humanControl(i, dt);
    const owner = b.owner >= 0 ? this.ps[b.owner] : null;
    const poss = owner ? owner.t : -1;
    if (p.pos === "GK") return this.gkThink(i, dt);
    if (b.owner === i) return this.ownerThink(i, dt);
    if (b.owner < 0 && b.target === i) {   // 나에게 오는 패스: 공이 멈출 자리로 마중
      const sp = Math.hypot(b.vx, b.vy), stopT = Math.min(1.2, Math.hypot(p.x - b.x, p.y - b.y) / Math.max(6, sp));
      p.tx = b.x + b.vx * stopT * 0.8; p.ty = b.y + b.vy * stopT * 0.8; p.run = 1; return;
    }
    // 쫓아가는 선수: 상대가 공을 가졌거나 공이 굴러다니면 가장 가까운 1~2명
    if (poss !== t) {
      const mates = this.team(t).filter((q) => q.pos !== "GK" && this.ctrl[t] !== this.ps.indexOf(q));
      const lead = owner ? 0.25 : clamp(hyp(b.vx, b.vy) / 20, 0, 0.6);
      const bx = b.x + b.vx * lead, by = b.y + b.vy * lead;
      mates.sort((a, c) => hyp(a.x - bx, a.y - by) - hyp(c.x - bx, c.y - by));
      const nChase = 1 + (tn.press > 0.3 ? 1 : 0) + (tn.press > 0.7 && this.prog(t, b.y) > 0.5 ? 1 : 0);
      const humanChasing = this.ctrl[t] >= 0 && hyp(this.ps[this.ctrl[t]].x - bx, this.ps[this.ctrl[t]].y - by) < 12;
      const k = mates.indexOf(p);
      const pressOK = this.prog(t, b.y) < 0.55 + tn.press * 0.45 || k === 0;   // 압박 강도: 낮으면 우리 진영에서만
      if (k >= 0 && k < nChase - (humanChasing ? 1 : 0) && pressOK) { p.tx = bx; p.ty = by; p.run = 1; return; }
    }
    // 자리 잡기(포메이션 + 공 위치 + 공격/수비)
    const prog = this.prog(t, b.y), attack = poss === t;
    let ay = p.ay * 0.55 + prog * 0.42 + (attack ? 0.07 : -0.05) + tn.ment * 0.05 + (["CB", "LB", "RB", "DM"].includes(p.pos) ? tn.line * 0.06 : tn.line * 0.03);
    if (attack && (p.pos === "ST" || p.pos === "LW" || p.pos === "RW")) ay += 0.1 + (prog > 0.55 ? 0.08 : 0);
    if (attack && (p.pos === "AM" || p.pos === "CM")) ay += 0.04;
    if (attack && ["CB"].includes(p.pos)) ay -= 0.04;
    ay = clamp(ay, 0.05, 0.9);
    const wScale = (1 + tn.width * 0.2) * (attack ? 1.08 : 0.86);
    const bxn = b.x / PW;
    let ax = 0.5 + (p.ax - 0.5) * wScale + ((t === 0 ? bxn : 1 - bxn) - 0.5) * 0.28;
    ax = clamp(ax, 0.04, 0.96);
    const miss = Math.max(0, (85 - p.d.iq) / 100) * 9;   // 전술지능이 낮으면 자리가 흐트러짐(m)
    p.tx = this.wx(t, ax) + p.jit.x * miss; p.ty = this.wy(t, ay) + p.jit.y * miss; p.run = (attack ? 0.82 : 0.78) * (1 + tn.tempo * 0.06);
    // 상대 공격수 마크(수비 시 가장 가까운 상대에게 조금 붙기)
    if (!attack && ["CB", "LB", "RB", "DM"].includes(p.pos)) {
      let near = null, nd = 1e9; for (const q of this.ps) { if (q.t === t) continue; const d = hyp(q.x - p.tx, q.y - p.ty); if (d < nd) { nd = d; near = q; } }
      if (near && nd < 10) { p.tx = p.tx * 0.5 + (near.x + (this.ownGoalY(t) > near.y ? 0 : 0)) * 0.5; p.ty = p.ty * 0.5 + (near.y + (t === 0 ? 2 : -2)) * 0.5; }
    }
    // 오프사이드 대신: 공격수는 상대 마지막 수비보다 너무 앞서지 않게
    if (attack && p.pos !== "GK") {
      const opp = this.team(1 - t).filter((q) => q.pos !== "GK");
      const lastDef = t === 0 ? Math.min(...opp.map((q) => q.y)) : Math.max(...opp.map((q) => q.y));
      if (t === 0) p.ty = Math.max(p.ty, Math.min(lastDef - 0.5, b.y)); else p.ty = Math.min(p.ty, Math.max(lastDef + 0.5, b.y));
    }
  }

  ownerThink(i, dt) {
    const p = this.ps[i], t = p.t, b = this.ball, tn = this.teams[t].tn;
    const gy = this.goalY(t), gd = hyp(PW / 2 - p.x, gy - p.y);
    const opp = this.team(1 - t);
    const press = Math.min(...opp.map((q) => hyp(q.x - p.x, q.y - p.y)));
    // 코너킥·프리 상황(restart)이면 바로 처리
    p.think -= dt;
    if (b.restart === "corner" && p.think <= 0) { p.think = 0.6; return this.cross(i); }
    if (b.restart === "penalty" && p.think <= 0) { p.think = 1; return this.shoot(i, null, 0.95); }
    if (p.think > 0 && (press > 2.2 || !p.plan)) { if (p.plan) { p.tx = p.x + p.plan.dx * 6; p.ty = p.y + p.plan.dy * 6; p.run = 0.86; } else { p.tx = p.x + (p.t === 0 ? 0 : 0); p.ty = p.y + (p.t === 0 ? -2 : 2); p.run = 0.5; } return; }
    p.think = ([0.45, 0.32, 0.24][this.diff] + this.rand() * 0.15) * (1.25 - p.d.iq / 400) * (1 - tn.tempo * 0.25);
    // 슛
    const shotRange = 21 + p.d.sho / 9 + tn.ment * 2;
    const angleOK = Math.abs(p.x - PW / 2) < 20;
    if (gd < shotRange && angleOK && (this.rand() < 0.55 + (shotRange - gd) / 25 || press < 1.6)) return this.shoot(i, null, 0.8 + this.rand() * 0.2);
    // 패스 후보
    let best = null, bs = -1e9;
    const mates = this.team(t).filter((q) => q !== p);
    for (const q of mates) {
      const d = hyp(q.x - p.x, q.y - p.y); if (d < 5 || d > 38 + Math.max(0, tn.pass) * 12) continue;
      const gain = (this.prog(t, q.y) - this.prog(t, p.y)) * PL;
      const open = Math.min(10, ...opp.map((o) => hyp(o.x - q.x, o.y - q.y)));
      let risk = 0; for (const o of opp) { const r = segDist(p.x, p.y, q.x, q.y, o.x, o.y); if (r < 2.2) risk += 2.2 - r; }
      let s = gain * (gain > 0 ? 0.16 : 0.18) * (1 + tn.ment * 0.2) + (this.prog(t, q.y) > 0.75 ? 1 : 0) + open * 0.28 - risk * 1.8 - d * 0.02 + (q.pos === "GK" ? -4 : 0);
      if (d < 18) s -= tn.pass * 0.8; if (d > 24) s += tn.pass * 0.9;
      s += (this.rand() - 0.5) * Math.max(0, (90 - p.d.iq) / 25);   // 전술지능이 낮으면 판단이 흔들림
      if (s > bs) { bs = s; best = q; }
    }
    // 드리블 점수: 앞쪽 공간
    const fy = t === 0 ? -1 : 1;
    let ahead = 12; for (const o of opp) { const dy = (o.y - p.y) * fy; if (dy > 0 && dy < 14 && Math.abs(o.x - p.x) < 4) ahead = Math.min(ahead, hyp(o.x - p.x, o.y - p.y)); }
    const dribS = ahead * 0.3 + (p.d.dri - 60) / 14 - (press < 2 ? 2.4 : press < 4 ? 0.8 : 0) + (gd < 32 ? 0.8 : 0) + 0.6;
    if (best && bs > dribS + 0.4) return this.pass(i, best);
    // 드리블: 골 쪽으로, 가장 가까운 상대를 비켜서
    let dx = (PW / 2 - p.x) * 0.25, dy = fy * 10;
    let near = null, nd = 1e9; for (const o of opp) { const d = hyp(o.x - p.x, o.y - p.y); if (d < nd) { nd = d; near = o; } }
    if (near && nd < 6) { const side = near.x > p.x ? -1 : 1; dx += side * (6 - nd) * 1.6; }
    if (p.x < 6) dx += 3; if (p.x > PW - 6) dx -= 3;
    const L = hyp(dx, dy) || 1; p.plan = { dx: dx / L, dy: dy / L };
    p.tx = p.x + p.plan.dx * 6; p.ty = p.y + p.plan.dy * 6; p.run = 0.86;
  }

  gkThink(i, dt) {
    const p = this.ps[i], t = p.t, b = this.ball, gy = this.ownGoalY(t), sgn = t === 0 ? -1 : 1;
    if (b.owner === i) {   // 골키퍼가 공을 가짐: 잠깐 뒤 패스나 길게 차기
      p.tx = p.x; p.ty = p.y; p.hold = (p.hold || 0) + dt;
      if (p.hold > 1.1 && !this.human[t] || p.hold > 4) {
        p.hold = 0;
        const mates = this.team(t).filter((q) => q !== p), opp = this.team(1 - t);
        const free = mates.filter((q) => Math.min(...opp.map((o) => hyp(o.x - q.x, o.y - q.y))) > 7 && hyp(q.x - p.x, q.y - p.y) < 30);
        if (free.length && this.rand() < 0.6) this.pass(i, free[Math.floor(this.rand() * free.length)]);
        else { const fw = mates.sort((a, c) => c.ay - a.ay)[Math.floor(this.rand() * 3)]; this.pass(i, fw, true); }
      }
      return;
    }
    p.hold = 0;
    if (b.restart === "penalty" && b.owner >= 0 && this.ps[b.owner].t !== t) { p.tx = PW / 2; p.ty = gy + sgn * 0.6; p.run = 0.4; return; }
    // 기본 자리: 골라인 앞, 공 쪽으로 조금
    let tx = PW / 2 + (b.x - PW / 2) * 0.18, ty = gy + sgn * (1.4 + Math.min(4, Math.abs(b.y - gy) / 12));
    tx = clamp(tx, GX0 + 0.5, GX1 - 0.5);
    // 굴러오는 공이 박스 안이면 달려 나가기
    const inBox = Math.abs(b.y - gy) < 16 && b.x > 13.8 && b.x < 54.2;
    if (b.owner < 0 && inBox && hyp(b.vx, b.vy) < 9 && b.z < 1) { tx = b.x; ty = b.y; p.run = 1; }
    // 슛을 막으러 몸 날리기
    const sh = b.shot;
    if (sh && sh.team !== t && b.owner < 0) {
      const vy = b.vy; if (Math.abs(vy) > 1) { const tt = (gy - b.y) / vy; if (tt > 0 && tt < 2) { tx = clamp(b.x + b.vx * tt, GX0 - 1, GX1 + 1); ty = gy + sgn * 0.6; p.run = 1.3; } }
    }
    p.tx = tx; p.ty = ty; p.run = p.run || 0.7;
  }

  humanControl(i, dt) {
    const p = this.ps[i], inp = this.input[p.t], b = this.ball;
    const L = hyp(inp.mx, inp.my);
    if (L > 0.15) { p.tx = p.x + inp.mx / L * 5; p.ty = p.y + inp.my / L * 5; p.run = (inp.sprint ? 1 : 0.8) * Math.min(1, L); p.fx = inp.mx / L; p.fy = inp.my / L; }
    else { p.tx = p.x; p.ty = p.y; p.run = 0.6; }
    if (b.owner === i) {
      if (inp.passQ) { inp.passQ = false; const q = this.pickPassTarget(i); if (q) this.pass(i, q, false); }
      if (inp.longQ) { inp.longQ = false; const q = this.pickPassTarget(i, true); if (q) this.pass(i, q, true); }
      if (inp.shootQ) { inp.shootQ = false; this.shoot(i, L > 0.15 ? inp.mx / L : null, inp.power ?? 0.9); }
    } else {
      if (inp.passQ) { inp.passQ = false; this.bodyTackle(i); }      // 공이 없으면 패스 = 몸태클
      if (inp.shootQ) { inp.shootQ = false; this.slideTackle(i); }   // 공이 없으면 슛 = 다리태클(슬라이딩)
      if (inp.longQ) { inp.longQ = false; inp.switchQ = true; }      // 공이 없으면 롱패스 = 선수 바꾸기
    }
  }
  pickPassTarget(i, far = false) {
    const p = this.ps[i], opp = this.team(1 - p.t); let best = null, bs = -1e9;
    const fl = hyp(p.fx, p.fy) || 1, fx = p.fx / fl, fy = p.fy / fl;
    for (const q of this.team(p.t)) {
      if (q === p) continue; const dx = q.x - p.x, dy = q.y - p.y, d = hyp(dx, dy); if (d < 3) continue;
      const cos = (dx * fx + dy * fy) / d; const open = Math.min(8, ...opp.map((o) => hyp(o.x - q.x, o.y - q.y)));
      const s = cos * 3 + open * 0.15 - d * (far ? -0.04 : 0.03) - (q.pos === "GK" ? 2 : 0) - (far && d < 15 ? 2 : 0);
      if (s > bs) { bs = s; best = q; }
    }
    return best;
  }

  // ------------------------------------------------------------ 차기
  kickBall(i, tx, ty, speed, loft, err) {
    const p = this.ps[i], b = this.ball;
    let a = Math.atan2(ty - p.y, tx - p.x) + gauss(this.rand) * err;
    b.owner = -1; b.kicker = i; b.last = p.t; p.kickCd = 0.35; b.restart = null; b.target = -1;
    b.x = p.x + Math.cos(a) * 0.9; b.y = p.y + Math.sin(a) * 0.9;
    b.vx = Math.cos(a) * speed; b.vy = Math.sin(a) * speed; b.z = 0.1; b.vz = loft;
  }
  pass(i, q, long = false) {
    const p = this.ps[i], d = hyp(q.x - p.x, q.y - p.y), tn = this.teams[p.t].tn;
    const lead = clamp(d / 22, 0.2, 0.9); const tx = q.x + q.vx * lead, ty = q.y + q.vy * lead;
    const dd = hyp(tx - p.x, ty - p.y);
    const opp = this.team(1 - p.t); let risk = 0; for (const o of opp) if (segDist(p.x, p.y, tx, ty, o.x, o.y) < 1.8) risk++;
    const lofted = long || dd > 30 || (risk > 1 && dd > 18 && this.rand() < 0.35) || (tn.pass > 0.5 && dd > 24 && this.rand() < 0.3 + tn.pass * 0.3);
    const press = Math.min(...opp.map((o) => hyp(o.x - p.x, o.y - p.y)));
    const err = (100 - p.d.pas) / 100 * 0.11 * (press < 2 ? 1.6 : 1) * (this.human[p.t] ? 0.8 : [1.4, 1, 0.85][this.diff]);
    if (lofted) { const T = clamp(dd / 18, 0.9, 1.9); this.kickBall(this.ps.indexOf(p), tx, ty, dd / T * 1.02, 4.9 * T, err); }
    else this.kickBall(this.ps.indexOf(p), tx, ty, clamp(dd * 0.95 + 6, 10, 25), 0, err);
    this.ball.target = this.ps.indexOf(q);
    this.stats.passes[p.t]++;
  }
  cross(i) {
    const p = this.ps[i], t = p.t, gy = this.goalY(t);
    const tx = PW / 2 + (this.rand() - 0.5) * 12, ty = gy + (t === 0 ? 1 : -1) * (7 + this.rand() * 6);
    const dd = hyp(tx - p.x, ty - p.y), T = clamp(dd / 18, 1, 1.9);
    this.kickBall(i, tx, ty, dd / T, 5 * T, (100 - p.d.pas) / 100 * 0.1);
  }
  shoot(i, aimX, power = 0.9) {
    const p = this.ps[i], t = p.t, b = this.ball, gy = this.goalY(t), gk = this.gk(1 - t);
    // 골키퍼 반대쪽 구석
    let side = aimX != null ? clamp(aimX, -1, 1) : (gk.x < PW / 2 ? 1 : -1) * (0.55 + this.rand() * 0.45);
    const tx = PW / 2 + side * (GOAL_W / 2 - 0.35), ty = gy;
    const d = hyp(tx - p.x, ty - p.y);
    const err = ((100 - p.d.sho) / 100 * 0.085 + d * 0.0016) * (this.human[t] ? 0.9 : [1.35, 1, 0.9][this.diff]) * (0.75 + power * 0.4);
    const speed = (19 + p.d.sho * 0.11) * (0.75 + power * 0.3);
    const loft = 1.2 + this.rand() * 2.4;
    const wasPenalty = b.restart === "penalty";
    this.kickBall(i, tx, ty, speed, loft, err * (wasPenalty ? 0.6 : 1)); if (wasPenalty) b.restart = "penalty";
    b.shot = { team: t, shooter: i, sho: p.d.sho + (wasPenalty ? 25 : 0), rolled: false }; b.restart = null;
    this.stats.shots[t]++;
    this.emit("shot", `${p.d.name} 슛!`, { team: t });
  }

  // ------------------------------------------------------------ 움직이기
  move(p, dt) {
    if (p.slide) {   // 다리태클: 바라보는 쪽으로 미끄러진다
      const sl = p.slide; sl.t -= dt; const sp = 8.5 * Math.max(0.2, sl.t / 0.5);
      p.vx = sl.dx * sp; p.vy = sl.dy * sp; p.x = clamp(p.x + p.vx * dt, -2, PW + 2); p.y = clamp(p.y + p.vy * dt, -3, PL + 3);
      this.slideContact(p);
      if (sl.t <= 0) { p.slide = null; p.stun = Math.max(p.stun, 0.65); p.down = 0.65; p.vx = p.vy = 0; }
      return;
    }
    if (p.down > 0) { p.down -= dt; p.vx *= 0.8; p.vy *= 0.8; return; }
    const ms = this.maxSpeed(p) * (p.run || 0.75) * (p.stun > 0 ? 0 : 1) * (this.ball.owner === this.ps.indexOf(p) ? 0.9 : 1);
    let dx = p.tx - p.x, dy = p.ty - p.y; const d = hyp(dx, dy);
    let wvx = 0, wvy = 0; if (d > 0.15) { const s = Math.min(ms, d * 3); wvx = dx / d * s; wvy = dy / d * s; }
    const acc = 16 * dt; const ddx = wvx - p.vx, ddy = wvy - p.vy, dl = hyp(ddx, ddy);
    if (dl > acc) { p.vx += ddx / dl * acc; p.vy += ddy / dl * acc; } else { p.vx = wvx; p.vy = wvy; }
    p.x = clamp(p.x + p.vx * dt, -2, PW + 2); p.y = clamp(p.y + p.vy * dt, -3, PL + 3);
    const sp = hyp(p.vx, p.vy); if (sp > 0.6 && this.ctrl[p.t] !== this.ps.indexOf(p)) { p.fx = p.vx / sp; p.fy = p.vy / sp; }
    if (this.ctrl[p.t] === this.ps.indexOf(p) && sp > 0.6 && hyp(this.input[p.t].mx, this.input[p.t].my) < 0.15) { p.fx = p.vx / sp; p.fy = p.vy / sp; }
  }
  syncBallToOwner() { const b = this.ball; if (b.owner < 0) return; const p = this.ps[b.owner]; b.x = p.x + p.fx * 0.7; b.y = p.y + p.fy * 0.7; b.z = 0; b.vx = p.vx; b.vy = p.vy; b.vz = 0; }

  ballPhysics(dt) {
    const b = this.ball;
    if (b.owner >= 0) { this.syncBallToOwner(); return; }
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.z > 0 || b.vz > 0) { b.vz -= 9.8 * dt; b.z += b.vz * dt; if (b.z <= 0) { b.z = 0; b.vz = Math.abs(b.vz) > 2.2 ? -b.vz * 0.42 : 0; } }
    const k = b.z > 0.05 ? 0.12 : 1.05; const f = Math.exp(-k * dt); b.vx *= f; b.vy *= f;
    // 골키퍼 선방
    if (b.shot && !b.shot.rolled) {
      const gk = this.gk(1 - b.shot.team), gy = this.ownGoalY(gk.t);
      const reach = 1.1 + gk.d.gk / 100 * 1.3;
      if (Math.abs(b.y - gy) < 3.2 && hyp(gk.x - b.x, gk.y - b.y) < reach + 0.8 && b.z < 2.7) {
        b.shot.rolled = true;
        const onTarget = b.x > GX0 - 0.2 && b.x < GX1 + 0.2;
        const pSave = clamp(0.3 + (gk.d.gk - b.shot.sho) / 110 + (hyp(b.vx, b.vy) < 18 ? 0.12 : 0) - (onTarget && Math.abs(b.x - PW / 2) > 2.6 ? 0.12 : 0), 0.1, 0.85);
        if (this.rand() < pSave) {
          if (onTarget) this.stats.onTarget[b.shot.team]++;
          if (this.rand() < 0.55 && b.z < 2) { b.owner = this.ps.indexOf(gk); b.last = gk.t; b.shot = null; gk.hold = 0; this.emit("save", `${gk.d.name} 선방!`, { team: gk.t }); }
          else { const s = gk.t === 0 ? -1 : 1; b.vx = (this.rand() - 0.5) * 18; b.vy = s * (6 + this.rand() * 6); b.vz = 2; b.last = gk.t; b.shot = null; this.emit("save", `${gk.d.name} 쳐냈어요!`, { team: gk.t }); }
          return;
        }
      }
    }
    // 헤딩: 떠 있는 공 근처 선수들이 다툰다
    if (b.z > 1.2 && b.z < 2.9 && b.vz < 0) {   // 떨어지는 공만
      const cand = [];
      for (let i = 0; i < this.ps.length; i++) { const p = this.ps[i]; if (p.kickCd > 0 || p.stun > 0 || p.slide || p.pos === "GK" || (b.kicker === i)) continue; const d = hyp(p.x - b.x, p.y - b.y); if (d < 1.5) cand.push([i, p.d.hea * 0.7 + p.d.phy * 0.3 + this.rand() * 25 - d * 8]); }
      if (cand.length) {
        cand.sort((a, c) => c[1] - a[1]); const i = cand[0][0], p = this.ps[i], gy = this.goalY(p.t), gd = hyp(PW / 2 - p.x, gy - p.y);
        if (i === b.target && !(gd < 15 && Math.abs(p.x - PW / 2) < 14)) { b.owner = i; b.last = p.t; b.target = -1; b.z = 0; b.vx = b.vy = b.vz = 0; b.shot = null; p.think = 0.3; return; }   // 받을 선수는 가슴으로 받기
        b.last = p.t; b.kicker = i; b.shot = null; p.kickCd = 0.3; b.restart = null;
        if (gd < 15 && Math.abs(p.x - PW / 2) < 14) {   // 헤딩슛
          const side = (this.gk(1 - p.t).x < PW / 2 ? 1 : -1) * (0.3 + this.rand() * 0.6), tx = PW / 2 + side * 3.2;
          const a = Math.atan2(gy - p.y, tx - p.x) + gauss(this.rand) * ((100 - p.d.hea) / 100 * 0.16 + 0.03);
          const sp = 13 + p.d.hea * 0.09; b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp; b.vz = -0.5 + this.rand() * 2.5;
          b.shot = { team: p.t, shooter: i, sho: p.d.hea, rolled: false }; this.stats.shots[p.t]++; this.emit("shot", `${p.d.name} 헤딩슛!`, { team: p.t });
        } else if (this.prog(p.t, p.y) < 0.35) {        // 우리 진영: 멀리 걷어 내기
          const a = Math.atan2(this.goalY(p.t) - p.y, (PW / 2 - p.x) * 0.3) + (this.rand() - 0.5) * 0.8; b.vx = Math.cos(a) * 16; b.vy = Math.sin(a) * 16; b.vz = 5;
          this.emit("header", `${p.d.name} 헤딩 걷어 내기`, { team: p.t });
        } else {                                         // 가까운 동료에게 떨궈 주기
          let q = null, qd = 1e9; for (const m of this.team(p.t)) { if (m === p) continue; const d = hyp(m.x - p.x, m.y - p.y); if (d < qd && d < 14) { qd = d; q = m; } }
          const tx = q ? q.x : p.x + p.fx * 4, ty = q ? q.y : p.y + p.fy * 4, a = Math.atan2(ty - p.y, tx - p.x), sp = Math.max(5, Math.min(12, hyp(tx - p.x, ty - p.y) * 1.1));
          b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp; b.vz = 1.5; if (q) b.target = this.ps.indexOf(q);
        }
        b.z = Math.max(b.z, 1.2); return;
      }
    }
    // 잡기
    let best = -1, bd = 1e9;
    for (let i = 0; i < this.ps.length; i++) {
      const p = this.ps[i]; if (p.kickCd > 0 || p.stun > 0) continue;
      if (b.shot && p.pos === "GK" && p.t !== b.shot.team) continue;   // 슛은 선방 판정으로만
      const isGK = p.pos === "GK" && Math.abs(p.y - this.ownGoalY(p.t)) < 17 && p.x > 13 && p.x < 55;
      const d = hyp(p.x - b.x, p.y - b.y), R = isGK ? 1.5 : 1.05, Z = isGK ? 2.6 : 1.7;
      if (d < R && b.z < Z && d < bd) { bd = d; best = i; }
    }
    if (best >= 0) {
      const p = this.ps[best], sp = hyp(b.vx, b.vy);
      const mate = p.t === b.last;
      const pCtrl = sp < 14 ? 1 : clamp(0.75 - (sp - 14) / 30 + p.d.dri / 400 + (mate ? 0.15 : 0), 0.25, 0.95);
      if (this.rand() < pCtrl * Math.min(1, dt * 30)) {
        if (b.shot && p.t !== b.shot.team && p.pos !== "GK") this.emit("block", `${p.d.name} 막았어요`, { team: p.t });
        b.owner = best; b.last = p.t; b.shot = null; b.restart = null; b.target = -1;
        p.think = 0.3 + this.rand() * 0.35; p.plan = null;
      } else if (sp > 14) { b.vx *= -0.35; b.vy *= -0.35; b.vx += (this.rand() - 0.5) * 6; b.last = p.t; b.shot = null; p.kickCd = 0.2; }
    }
  }

  tackles(dt) {
    const b = this.ball; if (b.owner < 0) return;
    const o = this.ps[b.owner];
    for (let i = 0; i < this.ps.length; i++) {
      const p = this.ps[i]; if (p.t === o.t || p.stun > 0 || p.pos === "GK") continue;
      if (this.ctrl[p.t] === i || p.slide || p.down > 0) continue;     // 사람은 태클 키로
      const d = hyp(p.x - o.x, p.y - o.y);
      if (d > 1.7 && d < 3.2 && !b.restart && this.rand() < dt * [0.25, 0.4, 0.55][this.diff]) {   // 뒤쫓다 다리태클
        const a = Math.atan2(o.y + o.vy * 0.3 - p.y, o.x + o.vx * 0.3 - p.x); p.fx = Math.cos(a); p.fy = Math.sin(a); this.slideTackle(i); continue;
      }
      if (d > 1.5) { p.tackleT = 0; continue; }
      p.tackleT += dt; if (p.tackleT < [0.6, 0.48, 0.4][this.human[p.t] ? 1 : this.diff]) continue;
      p.tackleT = 0; this.tryTackle(i, false);
      if (b.owner < 0 || this.ps[b.owner].t !== o.t) return;
    }
  }
  tryTackle(i, human) {
    const p = this.ps[i], b = this.ball; if (b.owner < 0) { if (human) { p.vx += p.fx * 3; p.vy += p.fy * 3; } return; }
    const o = this.ps[b.owner]; if (o.t === p.t) return;
    const d = hyp(p.x - o.x, p.y - o.y);
    if (human && d > 2.4) { p.vx += p.fx * 4; p.vy += p.fy * 4; p.stun = 0.35; return; }   // 헛태클: 잠깐 넘어짐
    if (d > (human ? 2.4 : 1.5)) return;
    const pr = clamp(0.24 + (p.d.def - o.d.dri) / 210 + (human ? 0.2 : 0) + (b.restart ? -0.3 : 0), 0.06, 0.75) * (this.ctrl[o.t] === b.owner && !human ? 0.7 : 1);   // 사람이 가진 공은 조금 덜 뺏김
    if (this.rand() < pr) {
      b.owner = -1; b.last = p.t; const a = Math.atan2(o.y - p.y, o.x - p.x) + (this.rand() - 0.5);
      b.vx = Math.cos(a) * 5 + p.vx * 0.5; b.vy = Math.sin(a) * 5 + p.vy * 0.5; b.kicker = i; o.stun = 0.6; o.kickCd = 0.5;
      this.emit("tackle", `${p.d.name} 태클 성공`, { team: p.t });
    } else if (human) { p.stun = 0.45; }
  }

  // 몸태클: 어깨로 밀어 공 뺏기 — 피지컬 차이가 중요, 실패하면 잠깐 휘청
  bodyTackle(i) {
    const p = this.ps[i], b = this.ball; if (p.bodyCd > 0 || p.slide || p.down > 0) return;
    p.bodyCd = 0.45; p.flash = 0.25;
    const o = b.owner >= 0 ? this.ps[b.owner] : null;
    if (!o || o.t === p.t || hyp(p.x - o.x, p.y - o.y) > 2.1) { p.vx += p.fx * 3.5; p.vy += p.fy * 3.5; this.emit("body", "", { team: p.t }); return; }
    const pr = clamp(0.32 + (p.d.phy - o.d.phy) / 140 + (p.d.def - o.d.dri) / 320 + (b.restart ? -0.3 : 0), 0.08, 0.8);
    if (this.rand() < pr) {
      if (this.rand() < 0.55) { b.owner = i; b.last = p.t; b.kicker = -1; p.think = 0.25; }
      else { b.owner = -1; b.last = p.t; const a = Math.atan2(p.fy, p.fx); b.vx = Math.cos(a) * 4 + p.vx * 0.4; b.vy = Math.sin(a) * 4 + p.vy * 0.4; b.kicker = i; }
      o.stun = 0.55; o.kickCd = 0.45; o.vx -= p.fx * 2; o.vy -= p.fy * 2;
      this.emit("tackle", `${p.d.name} 몸싸움 승리`, { team: p.t });
    } else { p.stun = 0.3; p.vx *= 0.3; p.vy *= 0.3; }
  }
  // 다리태클(슬라이딩): 3~4m 미끄러지며 공을 걷어 낸다. 공 대신 사람을 치면 반칙
  slideTackle(i) {
    const p = this.ps[i]; if (p.slide || p.down > 0 || p.stun > 0) return;
    const L = hyp(p.fx, p.fy) || 1;
    p.slide = { t: 0.5, dx: p.fx / L, dy: p.fy / L, done: false }; p.tackleT = 0;
    this.emit("slide", "", { team: p.t });
  }
  slideContact(p) {
    const sl = p.slide, b = this.ball; if (sl.done) return;
    const o = b.owner >= 0 ? this.ps[b.owner] : null;
    const db = hyp(p.x + sl.dx * 0.6 - b.x, p.y + sl.dy * 0.6 - b.y);
    if (o && o.t !== p.t) {
      const dp = hyp(p.x - o.x, p.y - o.y);
      if (db < 1.25) {   // 공에 먼저 닿음
        sl.done = true;
        const pr = clamp(0.5 + (p.d.def - o.d.dri) / 140 + (this.ctrl[o.t] === b.owner && this.ctrl[p.t] !== this.ps.indexOf(p) ? -0.12 : 0), 0.15, 0.88);
        if (this.rand() < pr) {
          b.owner = -1; b.last = p.t; b.kicker = this.ps.indexOf(p); b.vx = sl.dx * 9 + (this.rand() - 0.5) * 3; b.vy = sl.dy * 9 + (this.rand() - 0.5) * 3; b.z = 0;
          o.stun = 0.8; o.down = 0.8; o.kickCd = 0.6;
          this.emit("tackle", `${p.d.name} 슬라이딩 태클!`, { team: p.t });
        } else if (dp < 1.3 && this.rand() < 0.45) this.foul(p, o);
        return;
      }
      if (dp < 1.0) { sl.done = true; if (this.rand() < 0.7) this.foul(p, o); }   // 사람을 침
    } else if (b.owner < 0 && db < 1.2 && b.z < 1) {   // 굴러다니는 공 걷어 내기
      sl.done = true; b.last = p.t; b.kicker = this.ps.indexOf(p); b.shot = null; b.vx = sl.dx * 10; b.vy = sl.dy * 10;
    }
  }
  foul(p, o) {
    const b = this.ball, t = o.t, gyDef = this.ownGoalY(p.t);
    o.stun = 1; o.down = 1; p.fouls = (p.fouls || 0) + 1;
    const inBox = Math.abs(o.y - gyDef) < 16.5 && o.x > PW / 2 - 20.16 && o.x < PW / 2 + 20.16;
    this.emit("foul", `반칙! ${p.d.name}${p.fouls >= 2 ? " (경고)" : ""}`, { team: p.t });
    if (inBox) this.restart("penalty", t, PW / 2, gyDef + (p.t === 0 ? -11 : 11));
    else this.restart("free", t, clamp(o.x, 1, PW - 1), clamp(o.y, 1, PL - 1));
  }

  // ------------------------------------------------------------ 라인 밖·골
  checkOut() {
    const b = this.ball;
    if (b.owner >= 0) { const o = this.ps[b.owner]; if (o.x < -0.5 || o.x > PW + 0.5 || o.y < -0.5 || o.y > PL + 0.5) { b.owner = -1; } else return; }
    if (b.y < 0 || b.y > PL) {
      const end = b.y < 0 ? 0 : 1;                // 0 = 위쪽 골(팀 1 의 골), 1 = 아래쪽 골(팀 0 의 골)
      const attacker = end === 0 ? 0 : 1, defender = 1 - attacker;
      if (b.x > GX0 && b.x < GX1 && b.z < GOAL_H) return this.goal(attacker);
      if (b.last === defender) return this.restart("corner", attacker, b.x < PW / 2 ? 0.6 : PW - 0.6, end === 0 ? 0.6 : PL - 0.6);
      return this.restart("goalkick", defender, PW / 2 + (b.x < PW / 2 ? -5 : 5), end === 0 ? 5.5 : PL - 5.5);
    }
    if (b.x < 0 || b.x > PW) this.restart("throw", 1 - b.last, b.x < 0 ? 0.4 : PW - 0.4, clamp(b.y, 1, PL - 1));
  }
  restart(kind, team, x, y) {
    const b = this.ball; let p;
    if (kind === "goalkick") p = this.gk(team);
    else { let bd = 1e9; for (const q of this.team(team)) { if (q.pos === "GK") continue; const d = hyp(q.x - x, q.y - y); if (d < bd) { bd = d; p = q; } } }
    p.x = x; p.y = y; p.vx = p.vy = 0; p.fx = (PW / 2 - x) / (Math.abs(PW / 2 - x) || 1) * 0.3; p.fy = team === 0 ? -1 : 1;
    if (kind === "throw") { p.fx = x < 1 ? 1 : -1; p.fy = team === 0 ? -0.5 : 0.5; }
    if (kind === "penalty") {   // 차는 선수는 팀에서 슛이 가장 좋은 선수, 나머지는 박스 밖으로
      p = this.team(team).filter((q) => q.pos !== "GK").sort((a, c) => c.d.sho - a.d.sho)[0];
      p.x = x; p.y = y; p.fx = 0; p.fy = team === 0 ? -1 : 1;
      const gk = this.gk(1 - team); gk.x = PW / 2; gk.y = this.goalY(team) + (team === 0 ? 0.6 : -0.6);
      for (const q of this.ps) if (q !== p && q !== gk && Math.abs(q.y - this.goalY(team)) < 18) q.y = this.goalY(team) + (team === 0 ? 19 : -19);
    }
    Object.assign(b, { x: kind === "penalty" ? p.x + p.fx * 0.7 : x, y: kind === "penalty" ? p.y + p.fy * 0.7 : y, z: 0, vx: 0, vy: 0, vz: 0, owner: this.ps.indexOf(p), last: team, shot: null, restart: kind });
    p.think = 0.5; p.hold = 0; this.phase = "restart"; this.timer = 0.9;
    // 상대는 공에서 조금 떨어지게
    const keep = kind === "free" || kind === "penalty" ? 9 : 6;
    for (const q of this.ps) if (q.t !== team && q !== this.gk(1 - team) && hyp(q.x - x, q.y - y) < keep) { const a = Math.atan2(q.y - y, q.x - x) || 0.5; q.x = clamp(x + Math.cos(a) * keep, 0, PW); q.y = clamp(y + Math.sin(a) * keep, 0, PL); }
    if (kind === "penalty" || kind === "free") this.timer = 1.4;
    this.emit(kind, { corner: "코너킥", goalkick: "골킥", throw: "스로인", free: "프리킥", penalty: "페널티킥!" }[kind], { team });
  }
  goal(team) {
    this.score[team]++; const b = this.ball; const k = b.kicker >= 0 ? this.ps[b.kicker] : null;
    const scorer = k && k.t === team ? k : null; if (scorer) scorer.goals++;
    this.stats.onTarget[team]++;
    this.emit("goal", `골! ${scorer ? scorer.d.name : this.teams[team].name}`, { team, scorer: scorer ? scorer.d.id : null, name: scorer ? scorer.d.name : "" });
    this.phase = "goal"; this.timer = 2.4; this.kickTeam = 1 - team; b.owner = -1; b.vx *= 0.2; b.vy *= 0.2; b.shot = null;
  }

  // ------------------------------------------------------------ 온라인: 상태 주고받기
  snap() {
    const b = this.ball, a = [Math.round(this.t * 10), this.half, this.score[0], this.score[1], PHASES.indexOf(this.phase), r1(b.x), r1(b.y), r1(b.z), b.owner, this.ctrl[0], this.ctrl[1]];
    for (const p of this.ps) a.push(r1(p.x), r1(p.y), Math.round(Math.atan2(p.fy, p.fx) * 10));
    return a;
  }
  applySnap(a) {
    this.t = a[0] / 10; this.half = a[1]; this.score[0] = a[2]; this.score[1] = a[3]; this.phase = PHASES[a[4]];
    const b = this.ball; b.tx = a[5]; b.ty = a[6]; b.z = a[7]; b.owner = a[8]; this.ctrl[0] = a[9]; this.ctrl[1] = a[10];
    let k = 11; for (const p of this.ps) { p.sx = a[k++]; p.sy = a[k++]; const ang = a[k++] / 10; p.fx = Math.cos(ang); p.fy = Math.sin(ang); }
  }
  smooth(dt) {   // 손님 화면: 받은 상태로 부드럽게
    const f = 1 - Math.exp(-dt * 14), b = this.ball;
    if (b.tx != null) { b.x += (b.tx - b.x) * f; b.y += (b.ty - b.y) * f; }
    for (const p of this.ps) if (p.sx != null) { p.x += (p.sx - p.x) * f; p.y += (p.sy - p.y) * f; }
  }
}
const PHASES = ["kickoff", "play", "goal", "half", "restart", "end"];   // 손님 화면: 슬라이딩·넘어짐도 보내면 좋지만 지금은 위치·방향만
const r1 = (v) => Math.round(v * 10) / 10;
function mkInput() { return { mx: 0, my: 0, moving: false, sprint: false, passQ: false, shootQ: false, longQ: false, switchQ: false, power: 0.9 }; }
function gauss(r) { return (r() + r() + r() - 1.5) * 1.63; }
function segDist(ax, ay, bx, by, px, py) { const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy || 1; let t = ((px - ax) * dx + (py - ay) * dy) / L; if (t < 0.05 || t > 1) return 99; return hyp(ax + dx * t - px, ay + dy * t - py); }

// ---------------------------------------------------------------- 그리기
export function drawMatch(ctx, m, view) {
  // view: { w, h, flip, faces: {key: Image}, scale }
  const { w, h } = view, s = view.scale || w / 46, flip = !!view.flip;
  const b = m.ball;
  const camX = clamp(b.x, w / s / 2 - 3, PW - w / s / 2 + 3), camY = clamp(b.y, h / s / 2 - 4, PL - h / s / 2 + 4);
  const T = (x, y) => { if (flip) { x = PW - x; y = PL - y; } const cx = flip ? PW - camX : camX, cy = flip ? PL - camY : camY; return [(x - cx) * s + w / 2, (y - cy) * s + h / 2]; };
  // 잔디
  ctx.fillStyle = "#2e8b3e"; ctx.fillRect(0, 0, w, h);
  for (let k = 0; k < 15; k++) { const [, y0] = T(0, k * 7); const [, y1] = T(0, k * 7 + 7); ctx.fillStyle = k % 2 ? "#349a45" : "#2f8f40"; ctx.fillRect(0, Math.min(y0, y1), w, Math.abs(y1 - y0) + 1); }
  ctx.strokeStyle = "rgba(255,255,255,.85)"; ctx.lineWidth = Math.max(1.5, s * 0.12);
  const line = (pts) => { ctx.beginPath(); pts.forEach(([x, y], i) => { const [X, Y] = T(x, y); i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }); ctx.stroke(); };
  line([[0, 0], [PW, 0], [PW, PL], [0, PL], [0, 0]]); line([[0, PL / 2], [PW, PL / 2]]);
  { const [X, Y] = T(PW / 2, PL / 2); ctx.beginPath(); ctx.arc(X, Y, 9.15 * s, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.arc(X, Y, s * 0.3, 0, 7); ctx.fillStyle = "#fff"; ctx.fill(); }
  for (const e of [0, PL]) {
    const sg = e === 0 ? 1 : -1;
    line([[PW / 2 - 20.16, e], [PW / 2 - 20.16, e + sg * 16.5], [PW / 2 + 20.16, e + sg * 16.5], [PW / 2 + 20.16, e]]);
    line([[PW / 2 - 9.16, e], [PW / 2 - 9.16, e + sg * 5.5], [PW / 2 + 9.16, e + sg * 5.5], [PW / 2 + 9.16, e]]);
    const [X, Y] = T(PW / 2, e + sg * 11); ctx.beginPath(); ctx.arc(X, Y, s * 0.25, 0, 7); ctx.fillStyle = "#fff"; ctx.fill();
    // 골대·그물
    const [g0x, g0y] = T(GX0, e), [g1x, g1y] = T(GX1, e - sg * 2);
    ctx.fillStyle = "rgba(255,255,255,.25)"; ctx.fillRect(Math.min(g0x, g1x), Math.min(g0y, g1y), Math.abs(g1x - g0x), Math.abs(g1y - g0y));
    ctx.strokeStyle = "#fff"; ctx.lineWidth = Math.max(2, s * 0.2); ctx.strokeRect(Math.min(g0x, g1x), Math.min(g0y, g1y), Math.abs(g1x - g0x), Math.abs(g1y - g0y));
    ctx.strokeStyle = "rgba(255,255,255,.85)"; ctx.lineWidth = Math.max(1.5, s * 0.12);
  }
  // 그림자 + 선수
  const R = Math.max(9, s * (view.big ?? 1.45));
  const order = m.ps.map((p, i) => i).sort((a, c) => (flip ? -1 : 1) * (m.ps[a].y - m.ps[c].y));
  for (const i of order) {
    const p = m.ps[i], [X, Y] = T(p.x, p.y), tm = m.teams[p.t];
    if (X < -20 || Y < -20 || X > w + 20 || Y > h + 20) continue;
    ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.beginPath(); ctx.ellipse(X + 2, Y + R * 0.7, R * 0.9, R * 0.4, 0, 0, 7); ctx.fill();
    const isGK = p.pos === "GK";
    if (p.slide || p.down > 0) {   // 슬라이딩·넘어짐: 길쭉하게 눕힌 모양
      const [dx, dy] = p.slide ? (flip ? [-p.slide.dx, -p.slide.dy] : [p.slide.dx, p.slide.dy]) : (flip ? [-p.fx, -p.fy] : [p.fx, p.fy]);
      ctx.save(); ctx.translate(X, Y); ctx.rotate(Math.atan2(dy, dx));
      ctx.fillStyle = isGK ? gkCol(m, p.t) : tm.c1; ctx.strokeStyle = isGK ? "#222" : tm.c2; ctx.lineWidth = Math.max(2, R * 0.25);
      ctx.beginPath(); ctx.ellipse(0, 0, R * 1.5, R * 0.7, 0, 0, 7); ctx.fill(); ctx.stroke();
      if (p.slide) { ctx.strokeStyle = "rgba(255,255,255,.5)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-R * 2.4, -R * 0.4); ctx.lineTo(-R * 1.6, -R * 0.4); ctx.moveTo(-R * 2.6, R * 0.3); ctx.lineTo(-R * 1.7, R * 0.3); ctx.stroke(); }
      ctx.restore();
      ctx.fillStyle = luminance(isGK ? gkCol(m, p.t) : tm.c1) > 0.6 ? "#111" : "#fff"; ctx.font = `800 ${Math.round(R * 0.9)}px Pretendard, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(p.num, X, Y + 0.5);
      continue;
    }
    if (p.flash > 0) { ctx.strokeStyle = "rgba(255,255,255,.8)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(X + (flip ? -p.fx : p.fx) * R * 0.8, Y + (flip ? -p.fy : p.fy) * R * 0.8, R * 1.15, 0, 7); ctx.stroke(); }
    ctx.fillStyle = isGK ? gkCol(m, p.t) : tm.c1; ctx.strokeStyle = isGK ? "#222" : tm.c2; ctx.lineWidth = Math.max(2, R * 0.28);
    ctx.beginPath(); ctx.arc(X, Y, R, 0, 7); ctx.fill(); ctx.stroke();
    const face = p.d.face && view.faces && view.faces[p.d.face];
    if (face && face.complete && face.naturalWidth) { ctx.save(); ctx.beginPath(); ctx.arc(X, Y, R * 0.86, 0, 7); ctx.clip(); ctx.drawImage(face, X - R, Y - R, R * 2, R * 2); ctx.restore(); }
    else { ctx.fillStyle = luminance(isGK ? gkCol(m, p.t) : tm.c1) > 0.6 ? "#111" : "#fff"; ctx.font = `800 ${Math.round(R * 1.05)}px Pretendard, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(p.num, X, Y + 0.5); }
    // 바라보는 방향 점
    const [fx, fy] = flip ? [-p.fx, -p.fy] : [p.fx, p.fy];
    ctx.fillStyle = "rgba(255,255,255,.8)"; ctx.beginPath(); ctx.arc(X + fx * R * 1.15, Y + fy * R * 1.15, R * 0.2, 0, 7); ctx.fill();
    if (m.ctrl[p.t] === i && m.human[p.t]) {
      const me = view.me == null || view.me === p.t;
      ctx.strokeStyle = me ? "#ffd34a" : "#8ab4ff"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(X, Y, R + 4, 0, 7); ctx.stroke();
      ctx.fillStyle = me ? "#ffd34a" : "#8ab4ff"; ctx.beginPath(); ctx.moveTo(X, Y - R - 6); ctx.lineTo(X - 5, Y - R - 13); ctx.lineTo(X + 5, Y - R - 13); ctx.fill();
      ctx.font = "700 11px Pretendard, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic"; ctx.lineWidth = 3; ctx.strokeStyle = "rgba(0,0,0,.6)";
      ctx.strokeText(p.d.name, X, Y - R - 16); ctx.fillStyle = "#fff"; ctx.fillText(p.d.name, X, Y - R - 16);
      ctx.fillStyle = "rgba(0,0,0,.5)"; ctx.fillRect(X - R, Y + R + 5, R * 2, 4); ctx.fillStyle = p.energy > 0.6 ? "#7fe07a" : p.energy > 0.4 ? "#ffd34a" : "#ff6b7a"; ctx.fillRect(X - R, Y + R + 5, R * 2 * p.energy, 4);
    }
  }
  // 공
  const [BX, BY] = T(b.x, b.y), br = Math.max(3.2, s * 0.36);
  ctx.fillStyle = "rgba(0,0,0,.3)"; ctx.beginPath(); ctx.ellipse(BX + b.z * s * 0.25, BY + 1, br, br * 0.5, 0, 0, 7); ctx.fill();
  const bz = BY - b.z * s * 0.55;
  ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(BX, bz, br * (1 + b.z * 0.06), 0, 7); ctx.fill(); ctx.strokeStyle = "#222"; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = "#222"; ctx.beginPath(); ctx.arc(BX, bz, br * 0.35, 0, 7); ctx.fill();
  // 작은 지도
  if (view.mini !== false) {
    const mw = 54, mh = 82, mx0 = w - mw - 8, my0 = 8;
    ctx.fillStyle = "rgba(0,0,0,.4)"; ctx.fillRect(mx0, my0, mw, mh); ctx.strokeStyle = "rgba(255,255,255,.5)"; ctx.lineWidth = 1; ctx.strokeRect(mx0, my0, mw, mh);
    const M = (x, y) => { if (flip) { x = PW - x; y = PL - y; } return [mx0 + x / PW * mw, my0 + y / PL * mh]; };
    for (const p of m.ps) { const [X, Y] = M(p.x, p.y); ctx.fillStyle = m.teams[p.t].c1; ctx.fillRect(X - 1.5, Y - 1.5, 3, 3); }
    const [X, Y] = M(b.x, b.y); ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(X, Y, 2.2, 0, 7); ctx.fill();
  }
}
// 골키퍼 색: 두 팀 유니폼·상대 골키퍼와 겹치지 않는 색
function cdist(a, b) { const x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16); return Math.abs((x >> 16) - (y >> 16)) + Math.abs(((x >> 8) & 255) - ((y >> 8) & 255)) + Math.abs((x & 255) - (y & 255)); }
function gkCol(m, t) {
  if (!m._gk) { const pal = ["#f2d13a", "#3ad17a", "#ff8fd1", "#8fe3ff", "#ff9a3c", "#b28cff"], used = [m.teams[0].c1, m.teams[1].c1]; m._gk = [];
    for (let k = 0; k < 2; k++) { const c = pal.find((x) => used.every((u) => cdist(x, u) > 170)) || pal[k]; m._gk.push(c); used.push(c); } }
  return m._gk[t];
}
function luminance(hex) { const n = parseInt(hex.slice(1), 16); return (((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114) / 255; }

// ---------------------------------------------------------------- 빠른 경기(결과만): 팀 종합·전술로 골 수
export function quickSim(ratingA, ratingB, tacA, tacB, rand = Math.random) {
  const A = tacN(tacA), B = tacN(tacB); ratingA = toOld(ratingA); ratingB = toOld(ratingB);
  const att = (r, t) => 1.25 * Math.exp((r - 70) / 14) * (1 + t.ment * 0.15 + t.tempo * 0.04);
  const def = (r, t) => Math.exp((r - 70) / 16) * (1 - t.ment * 0.12) * (1 - Math.max(0, t.press) * 0.04) * (1 + t.line * -0.02);
  const la = Math.max(0.2, att(ratingA, A) / def(ratingB, B) * 1.15 + 0.15), lb = Math.max(0.2, att(ratingB, B) / def(ratingA, A) * 1.0);
  return [poisson(la, rand), poisson(lb, rand)];
}
function poisson(l, r) { let L = Math.exp(-l), k = 0, p = 1; do { k++; p *= r(); } while (p > L && k < 12); return k - 1; }
export { ovr };
