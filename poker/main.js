// 퓨어데이 포커 — 화면 · 진행 · 캐릭터 AI. 규칙은 poker.js
import { newDeck, evaluate, equity, splitPots, HAND_NAMES, rankOf, suitOf, SUITS, rankLabel } from "./poker.js";

const $ = (id) => document.getElementById(id);
const SAVE_KEY = "pureday-poker-v1";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pick = (a) => a[Math.floor(Math.random() * a.length)];

// ---------------------------------------------------------------- 캐릭터
// pers: tight(신중) · aggr(공격) · bluff(허세)
const CHARS = {
  areum: { name: "나 (조아름)", img: "areum" },
  heim: { name: "조하임", img: "heim", pers: { tight: 0.45, aggr: 0.65, bluff: 0.12 }, win: ["이 정도는 계산 끝!", "누나, 봤지?"], raise: ["간다!", "올려 볼까?"] },
  mia: { name: "김미아", img: "mia", pers: { tight: 0.62, aggr: 0.45, bluff: 0.05 }, win: ["좋은 거래였어요.", "숫자는 거짓말을 안 해요."], raise: ["조금 더 투자할게요.", "레이즈."] },
  rahab: { name: "교만의 용장 라합", img: "rahab", pers: { tight: 0.32, aggr: 0.82, bluff: 0.22 }, win: ["역시 나야말로 최고지.", "감히 나를 이기려고?"], raise: ["내 앞에 무릎 꿇어라!", "더 올린다!"] },
  wolf: { name: "늑대개 우두머리", img: "wolf", pers: { tight: 0.22, aggr: 0.35, bluff: 0.08 }, win: ["아우우우!", "컹! 내 거다!"], raise: ["으르릉…", "컹!"] },
  dragon: { name: "대왕용", img: "dragon", pers: { tight: 0.5, aggr: 0.72, bluff: 0.15 }, win: ["크하하, 모두 내 것이다!", "빛도 내 구슬 앞에선…"], raise: ["불길처럼 올린다!", "크르릉…"] },
  apophis: { name: "아포피스", img: "apophis", pers: { tight: 0.4, aggr: 0.55, bluff: 0.18 }, win: ["세 머리가 다 웃는다!", "분쟁은 나의 기쁨!"], raise: ["왼쪽 머리가 올리래.", "셋이 합의했다, 레이즈!"] },
};
const TABLES = { 5: ["areum", "heim", "rahab", "mia", "wolf"], 7: ["areum", "heim", "wolf", "rahab", "dragon", "apophis", "mia"] };
const POS = {
  5: [[50, 91], [9, 56], [24, 12], [76, 12], [91, 56]],
  7: [[50, 91], [8, 66], [8, 33], [30, 11], [70, 11], [92, 33], [92, 66]],
};
// 그림 카드: ♥♦ = 빛 진영, ♠♣ = 드래곤 군단
const FACE = { red: { 11: "heim", 12: "areum", 13: "drjo" }, black: { 11: "wolf", 12: "rahab", 13: "dragon" } };

// ---------------------------------------------------------------- 상태
const G = { gen: 0, coach: true, tutSeen: false, players: [], dealer: -1, sb: 10, bb: 20, board: [], deck: [], currentBet: 0, minRaise: 20, round: "", handNo: 0, size: 5, showdown: false, sound: true, stats: { hands: 0, wins: 0, best: 1000 } };
let humanResolve = null;

function save() {
  const me = G.players[0];
  try { localStorage.setItem(SAVE_KEY, JSON.stringify({ chips: me ? me.chips : 1000, stats: G.stats, sound: G.sound, size: G.size, coach: G.coach, tutSeen: G.tutSeen })); } catch (e) { /* 저장 안 됨 */ }
}
function loadSaved() { try { return JSON.parse(localStorage.getItem(SAVE_KEY) || "null"); } catch (e) { return null; } }

// ---------------------------------------------------------------- 소리
let actx = null;
function tone(freqs, dur = 0.06, type = "triangle", vol = 0.06) {
  if (!G.sound) return;
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
const SFX = { card: () => tone([900], 0.03, "square", 0.02), chip: () => tone([1300, 1700], 0.04), win: () => tone([523, 659, 784, 1046], 0.12), lose: () => tone([330, 262], 0.15) };

function say(text) { $("bubbleText").textContent = text; }

// ---------------------------------------------------------------- 그리기
function cardHTML(c, cls = "") {
  if (c == null) return `<div class="card back ${cls}"></div>`;
  const r = rankOf(c), s = suitOf(c), red = s === 1 || s === 2;
  const face = FACE[red ? "red" : "black"][r];
  const mid = face ? `<div class="face" style="background-image:url(assets/chars/${face}.png)"></div>` : `<div class="big">${SUITS[s]}</div>`;
  return `<div class="card ${red ? "red" : "black"} ${cls}" aria-label="${SUITS[s]}${rankLabel(r)}"><div class="rk">${rankLabel(r)}<i>${SUITS[s]}</i></div>${mid}</div>`;
}
const potTotal = () => G.players.reduce((s, p) => s + p.total, 0);

function render() {
  const pos = POS[G.size];
  let html = "";
  G.players.forEach((p, i) => {
    const [x, y] = pos[i];
    const cls = ["seat"];
    if (p.out) cls.push("out"); else if (p.folded) cls.push("folded");
    if (G.actor === i) cls.push("turn");
    let hc = "";
    if (i !== 0 && !p.out && p.hole.length) {
      const show = G.showdown && !p.folded;
      hc = `<div class="hc">${p.hole.map((c) => cardHTML(show ? c : null, (show && p.winCards && p.winCards.includes(c)) ? "win" : "")).join("")}</div>`;
    }
    const hn = G.showdown && !p.folded && p.handName ? `<div class="hn">${p.handName}</div>` : "";
    html += `<div class="${cls.join(" ")}" style="left:${x}%;top:${y}%">
      ${p.say ? `<div class="say">${p.say}</div>` : ""}
      ${G.dealer === i ? '<div class="dealer">D</div>' : ""}
      <div class="ava" style="background-image:url(assets/chars/${p.img}.png)"></div>
      <div class="nm">${p.out ? "탈락" : p.name}</div><div class="chips">🔮 ${p.chips}</div>${hc}${hn}</div>`;
    if (p.bet > 0) {
      const bx = x + (50 - x) * 0.42, by = y + (47 - y) * 0.42;
      html += `<div class="seat" style="left:${bx}%;top:${by}%;width:auto"><div class="bet" style="position:static">🔮 ${p.bet}</div></div>`;
    }
  });
  $("seats").innerHTML = html;
  $("board").innerHTML = G.board.map((c) => cardHTML(c, (G.showdown && G.winCards && G.winCards.includes(c)) ? "win" : "")).join("") + Array(5 - G.board.length).fill('<div class="card" style="opacity:.15"></div>').join("");
  $("pot").textContent = `팟 🔮 ${potTotal()}`;
  $("roundName").textContent = { preflop: "프리플롭", flop: "플롭", turn: "턴", river: "리버", showdown: "쇼다운" }[G.round] || "";
  const me = G.players[0];
  $("myCards").innerHTML = me && me.hole.length ? me.hole.map((c) => cardHTML(c, me.winCards && me.winCards.includes(c) ? "win" : "")).join("") : cardHTML(null) + cardHTML(null);
  if (me && me.hole.length) {
    const e = evaluate([...me.hole, ...G.board]);
    $("myHand").textContent = G.board.length ? `지금 족보: ${HAND_NAMES[e.cat]}` : (rankOf(me.hole[0]) === rankOf(me.hole[1]) ? "시작부터 원페어!" : "가운데 카드를 기다려요");
  }
}

// ---------------------------------------------------------------- 진행
const live = (i) => !G.players[i].out;
function nextIdx(i, pred = live) { const n = G.players.length; for (let k = 1; k <= n; k++) { const j = (i + k) % n; if (pred(j)) return j; } return -1; }
const notFolded = () => G.players.filter((p) => !p.out && !p.folded);
const canAct = (p) => !p.out && !p.folded && !p.allIn;

function put(p, amt) { amt = Math.min(amt, p.chips); p.chips -= amt; p.bet += amt; p.total += amt; if (p.chips === 0) p.allIn = true; if (amt > 0) SFX.chip(); }

function setupTable(size, myChips = 1000) {
  G.size = size; G.sb = 10; G.bb = 20; G.handNo = 0; G.dealer = -1;
  G.players = TABLES[size].map((id, i) => ({ id, ...CHARS[id], chips: i === 0 ? myChips : 1000, hole: [], bet: 0, total: 0, folded: false, allIn: false, out: false, acted: false, human: i === 0 }));
  G.players[0].name = "나";
}

async function playHand() {
  const gen = ++G.gen;   // 새 테이블·새 판이 시작되면 이전 진행은 여기 번호가 달라져 멈춘다
  $("btnNext").hidden = true;
  G.handNo++; G.stats.hands++;
  if (G.handNo > 1 && (G.handNo - 1) % 10 === 0) { G.sb *= 2; G.bb *= 2; say(`블라인드가 올라갔어요! 이제 ${G.sb}/${G.bb}`); await sleep(900); }
  G.showdown = false; G.winCards = null; G.board = []; G.deck = newDeck();
  for (const p of G.players) Object.assign(p, { hole: [], bet: 0, total: 0, folded: p.out, allIn: false, acted: false, say: "", handName: "", winCards: null });
  G.dealer = nextIdx(G.dealer < 0 ? G.players.length - 1 : G.dealer);
  const heads = G.players.filter((p) => !p.out).length === 2;
  const sbI = heads ? G.dealer : nextIdx(G.dealer), bbI = nextIdx(sbI);
  put(G.players[sbI], G.sb); put(G.players[bbI], G.bb);
  G.players[sbI].say = `SB ${G.sb}`; G.players[bbI].say = `BB ${G.bb}`;
  G.currentBet = G.bb; G.minRaise = G.bb; G.round = "preflop";
  for (let k = 0; k < 2; k++) for (let i = sbI, n = 0; n < G.players.length; n++, i = (i + 1) % G.players.length) if (!G.players[i].out) G.players[i].hole.push(G.deck.pop());
  SFX.card();
  say(`새 판! 딜러는 ${G.players[G.dealer].name}. ${G.players[0].hole.length ? "내 카드를 봐요." : ""}`);
  render();
  await sleep(600);

  let first = nextIdx(bbI);
  for (const street of ["preflop", "flop", "turn", "river"]) {
    if (street !== "preflop") {
      for (const p of G.players) { p.bet = 0; p.acted = false; if (!p.out && !p.folded) p.say = ""; }
      G.currentBet = 0; G.minRaise = G.bb; G.round = street;
      G.deck.pop();   // 버리는 카드
      const n = street === "flop" ? 3 : 1;
      for (let k = 0; k < n; k++) G.board.push(G.deck.pop());
      SFX.card(); render();
      if (G.coach) say({ flop: "플롭! 가운데 카드 3장이 펼쳐졌어요. 내 카드 2장과 합쳐 족보를 봐요.", turn: "턴! 가운데 4번째 카드예요.", river: "리버! 마지막 5번째 카드예요. 이번 베팅이 끝나면 패를 보여 줘요(쇼다운)." }[street]);
      await sleep(G.coach ? 1300 : 700);
      if (gen !== G.gen) return;
      first = nextIdx(G.dealer, (j) => canAct(G.players[j]));
    }
    if (notFolded().length > 1 && G.players.filter(canAct).length > (G.currentBet > 0 ? 0 : 1)) {
      const done = await bettingRound(first, gen);
      if (gen !== G.gen || done === "abort") return;
      if (done === "won") return finishFold();
    }
  }
  return finishShowdown();
}

function roundDone() {
  return G.players.every((p) => !canAct(p) || (p.acted && p.bet === G.currentBet));
}
async function bettingRound(start, gen) {
  let i = start;
  if (i < 0) return "done";
  for (let guard = 0; guard < 200; guard++) {
    if (notFolded().length === 1) return "won";
    if (roundDone()) break;
    const p = G.players[i];
    if (canAct(p) && !(p.acted && p.bet === G.currentBet)) {
      G.actor = i; render();
      const a = p.human ? await humanAction(p) : await aiAction(p);
      if (gen !== G.gen) return "abort";
      apply(p, a);
      G.actor = -1; render();
      if (!p.human) await sleep(350);
    }
    i = (i + 1) % G.players.length;
  }
  G.actor = -1;
  return "done";
}
function apply(p, a) {
  const toCall = G.currentBet - p.bet;
  if (a.type === "fold") { p.folded = true; p.say = "폴드"; }
  else if (a.type === "call") {
    const amt = Math.min(toCall, p.chips);
    put(p, amt); p.say = toCall === 0 ? "체크" : p.allIn ? `올인 ${p.total}` : `콜 ${amt}`;
  } else {
    let to = Math.min(a.to, p.bet + p.chips);
    to = Math.max(to, Math.min(G.currentBet + G.minRaise, p.bet + p.chips));
    put(p, to - p.bet);
    if (p.bet > G.currentBet) {
      const by = p.bet - G.currentBet;
      if (by >= G.minRaise) G.minRaise = by;
      G.currentBet = p.bet;
      for (const q of G.players) if (q !== p) q.acted = false;
    }
    p.say = p.allIn ? "올인!" : (toCall === 0 ? `베팅 ${p.bet}` : `레이즈 ${p.bet}`);
    if (!p.human && CHARS[p.id].raise && Math.random() < 0.5) p.say += " · " + pick(CHARS[p.id].raise);
  }
  p.acted = true;
}

// ---------------------------------------------------------------- 컴퓨터
async function aiAction(p) {
  await sleep(550 + Math.random() * 500);
  const opp = Math.max(1, notFolded().length - 1);
  const e = equity(p.hole, G.board, opp, G.board.length ? 260 : 200);
  const P = p.pers, pot = potTotal(), toCall = G.currentBet - p.bet, r = Math.random();
  const roundTo = (v) => Math.max(G.bb, Math.round(v / G.sb) * G.sb);
  if (toCall === 0) {
    if (e > 0.62 - P.aggr * 0.12 || r < P.bluff) return { type: "raise", to: G.currentBet + roundTo(pot * (0.4 + 0.5 * Math.random())) };
    return { type: "call" };
  }
  const odds = toCall / (pot + toCall);
  if (e < odds * (0.85 + P.tight * 0.5) && r >= P.bluff * 0.6 && !(toCall <= G.bb && e > 0.22)) return { type: "fold" };
  if (e > 0.66 + P.tight * 0.08 && Math.random() < P.aggr) {
    const to = G.currentBet + Math.max(G.minRaise, roundTo(pot * 0.75));
    return { type: "raise", to: to >= (p.bet + p.chips) * 0.8 ? p.bet + p.chips : to };
  }
  return { type: "call" };
}

// ---------------------------------------------------------------- 나
function humanAction(p) {
  return new Promise((resolve) => {
    humanResolve = (a) => { humanResolve = null; setButtons(false); $("raiseBox").hidden = true; clearCoach(); resolve(a); };
    const toCall = G.currentBet - p.bet;
    $("btnCall").textContent = toCall === 0 ? "체크" : toCall >= p.chips ? `올인 콜 ${p.chips}` : `콜 ${toCall}`;
    $("btnRaise").textContent = toCall === 0 ? "베팅" : "레이즈";
    setButtons(true);
    $("btnRaise").disabled = p.chips <= toCall;
    $("btnFold").disabled = toCall === 0;   // 공짜로 볼 수 있으면 접지 않게
    say(toCall === 0 ? "내 차례예요. 체크하거나 베팅해요." : `내 차례예요 — ${toCall}개를 내면 콜이에요.`);
    if (G.coach) coachAdvice(p, toCall);
    if (location.hash.startsWith("#selftest")) setTimeout(() => humanResolve && humanResolve({ type: "call" }), 200);
  });
}
// ---------------------------------------------------------------- 페이의 조언 (초보 코치, 2026-10-21)
function clearCoach() { document.querySelectorAll(".act.rec").forEach((b) => b.classList.remove("rec")); $("bubble").classList.remove("coach"); }
function coachAdvice(p, toCall) {
  const opp = Math.max(1, notFolded().length - 1);
  const e = equity(p.hole, G.board, opp, 700), pct = Math.round(e * 100);
  const pot = potTotal(), odds = toCall / (pot + toCall), need = Math.round(odds * 100);
  const hand = G.board.length ? HAND_NAMES[evaluate([...p.hole, ...G.board]).cat] : null;
  const now = hand ? `지금 내 족보는 ${hand}. ` : "";
  let btn, text;
  if (toCall === 0) {
    if (e >= 0.6) { btn = "btnRaise"; text = `${now}이길 확률 약 ${pct}% — 좋은 패예요! '베팅'으로 팟을 키워 봐요.`; }
    else { btn = "btnCall"; text = `${now}이길 확률 약 ${pct}%. 걸 필요가 없으니 '체크'로 공짜로 다음 카드를 봐요.`; }
  } else if (e < odds && G.round === "preflop" && toCall <= G.bb && e > 0.2) {
    btn = "btnCall"; text = `이길 확률 약 ${pct}%. 블라인드만큼(${toCall}개)만 내면 되니 싸게 '콜'하고 가운데 카드를 봐요.`;
  } else if (e < odds) {
    btn = "btnFold"; text = `${now}이길 확률 약 ${pct}%가 내야 할 몫 ${need}%보다 낮아요. 이번엔 '폴드'하고 다음 판을 노려요.`;
  } else if (e >= 0.65) {
    btn = "btnRaise"; text = `${now}이길 확률 약 ${pct}% — 아주 좋아요! '레이즈'로 더 걸어 봐요.`;
  } else {
    btn = "btnCall"; text = `${now}이길 확률 약 ${pct}%가 내야 할 몫 ${need}% 이상 — '콜'로 따라가 볼 만해요.`;
  }
  if ($(btn).disabled) btn = "btnCall";
  $(btn).classList.add("rec");
  $("bubble").classList.add("coach");
  say("조언: " + text);
}
function setButtons(on) {
  for (const id of ["btnFold", "btnCall", "btnRaise"]) $(id).disabled = !on;
  if (!on) { $("btnCall").textContent = "콜"; $("btnRaise").textContent = "레이즈"; }   // 내 차례가 아닐 때 이전 판 금액이 남지 않게
}
function openRaise() {
  const p = G.players[0], toCall = G.currentBet - p.bet, max = p.bet + p.chips;
  const min = Math.min(G.currentBet + G.minRaise, max);
  const r = $("raiseRange");
  r.min = min; r.max = max; r.step = G.sb; r.value = Math.min(max, G.currentBet + Math.max(G.minRaise, Math.round((potTotal() + toCall) / 2 / G.sb) * G.sb));
  $("raiseVal").textContent = r.value;
  $("raiseBox").hidden = false;
}

// ---------------------------------------------------------------- 판 끝
async function finishFold() {
  const w = notFolded()[0];
  const won = potTotal();
  w.chips += won;
  w.say = `+${won}`;
  say(`${w.name === "나" ? "내가" : w.name + "이(가)"} 팟 ${won}개를 가져갔어요. (다른 사람이 모두 폴드)`);
  if (w.human) { G.stats.wins++; SFX.win(); } else SFX.lose();
  for (const p of G.players) p.bet = 0;
  return endHand();
}
async function finishShowdown() {
  // 남은 카드 펼치기
  while (G.board.length < 5) { G.deck.pop(); G.board.push(G.deck.pop()); SFX.card(); render(); await sleep(500); }
  G.round = "showdown"; G.showdown = true;
  const scored = G.players.map((p) => {
    if (p.out || p.folded) return { total: p.total, folded: true, score: -1 };
    const e = evaluate([...p.hole, ...G.board]);
    p.handName = HAND_NAMES[e.cat];
    return { total: p.total, folded: false, score: e.score };
  });
  const { won } = splitPots(scored);
  const names = [];
  G.players.forEach((p, i) => {
    p.bet = 0;
    if (won[i] > 0) {
      p.chips += won[i]; p.say = `+${won[i]}`; names.push(`${p.name}(${p.handName}) +${won[i]}`);
      p.winCards = bestFive([...p.hole, ...G.board]);
      if (!p.human && CHARS[p.id].win) p.say += " · " + pick(CHARS[p.id].win);
    }
  });
  const winSet = new Set(G.players.filter((p) => p.winCards).flatMap((p) => p.winCards));
  G.winCards = [...winSet];
  if (won[0] > 0) { G.stats.wins++; SFX.win(); } else SFX.lose();
  say(`쇼다운! ${names.join(" · ")}`);
  return endHand();
}
// 이긴 5장 (보드·손패 강조용): 7장에서 5장 고르는 21가지 중 최고 점수
function bestFive(cards) {
  let best = null, bs = -1;
  for (let a = 0; a < cards.length; a++) for (let b = a + 1; b < cards.length; b++) {
    const five = cards.filter((_, k) => k !== a && k !== b);
    const s = evaluate(five).score;
    if (s > bs) { bs = s; best = five; }
  }
  return best;
}
async function endHand() {
  G.actor = -1; render();
  for (const p of G.players) if (!p.human && !p.out && p.chips === 0) { p.out = true; p.say = "탈락"; }
  const me = G.players[0];
  G.stats.best = Math.max(G.stats.best, me.chips);
  save(); render();
  if (G.players.every((p) => p.human || p.out)) {
    notice("테이블 정복! 🏆", `모든 상대의 빛의 구슬을 모았어요! (${me.chips}개) 새 테이블을 열어요.`, () => { setupTable(G.size, 1000); playHand(); });
    return;
  }
  if (me.chips === 0) {
    notice("구슬이 다 떨어졌어요", "괜찮아요! 빛의 구슬 1000개를 다시 받아서 계속해요.", () => { me.chips = 1000; G.refills = (G.refills || 0) + 1; save(); playHand(); });
    if (location.hash.startsWith("#selftest")) setTimeout(() => $("noticeOk").click(), 300);
    return;
  }
  $("btnNext").hidden = false;
  if (location.hash.startsWith("#selftest")) {   // 개발용: 구슬 총합이 그대로인지 (다시 받은 구슬 포함)
    const sum = G.players.reduce((t, q) => t + q.chips, 0), want = 1000 * G.players.length + (G.refills || 0) * 1000;
    document.title = `SELFTEST hands ${G.handNo} sum ${sum}/${want}` + (sum !== want ? " MISMATCH" : "");
    if (sum !== want) { say("ERR 구슬 총합이 맞지 않아요 " + sum + "/" + want); return; }
    setTimeout(() => $("btnNext").click(), 300);
  }
}
function notice(title, text, ok) {
  $("noticeTitle").textContent = title; $("noticeText").textContent = text; $("notice").hidden = false;
  $("noticeOk").onclick = () => { $("notice").hidden = true; ok && ok(); };
}

// ---------------------------------------------------------------- 튜토리얼 '포커 배우기' (2026-10-21 대표님: "규칙을 인트로에서 튜토리얼처럼")
const C = (r, s) => (r - 2) * 4 + s;   // 카드 만들기: 숫자(2..14), 무늬(0 ♠ 1 ♥ 2 ♦ 3 ♣)
const cards = (list) => `<div class="cards">${list.map((c) => (typeof c === "string" ? c : cardHTML(c))).join("")}</div>`;
const RANK_EX = [
  ["로열 플러시", [C(10, 1), C(11, 1), C(12, 1), C(13, 1), C(14, 1)], "같은 무늬 10 J Q K A"],
  ["스트레이트 플러시", [C(5, 0), C(6, 0), C(7, 0), C(8, 0), C(9, 0)], "같은 무늬 + 이어진 숫자"],
  ["포카드", [C(7, 0), C(7, 1), C(7, 2), C(7, 3)], "같은 숫자 4장"],
  ["풀하우스", [C(12, 0), C(12, 1), C(12, 2), C(9, 3), C(9, 1)], "3장 + 2장"],
  ["플러시", [C(2, 2), C(6, 2), C(9, 2), C(11, 2), C(14, 2)], "같은 무늬 5장"],
  ["스트레이트", [C(5, 1), C(6, 0), C(7, 3), C(8, 2), C(9, 1)], "이어진 숫자 5장"],
  ["트리플", [C(8, 0), C(8, 2), C(8, 3)], "같은 숫자 3장"],
  ["투페어", [C(5, 0), C(5, 1), C(10, 2), C(10, 3)], "같은 숫자 2장 × 2"],
  ["원페어", [C(13, 0), C(13, 2)], "같은 숫자 2장"],
  ["하이카드", [C(14, 3)], "아무것도 없으면 가장 높은 카드"],
];
const TUT = [
  { t: "포커는 이런 게임이에요", h: () => `
    <p>빛의 구슬을 걸고, <b>더 좋은 카드 조합(족보)</b>을 만든 사람이 가운데 모인 구슬(<b>팟</b>)을 가져가는 게임이에요.</p>
    ${cards([C(14, 1), C(13, 1), '<span class="plus">vs</span>', C(11, 0), C(11, 3)])}
    <div class="tip">팟을 가져가는 방법은 두 가지예요.<br>① 마지막까지 남아 <b>가장 좋은 족보</b>를 보여 주기<br>② 내가 크게 걸어서 <b>다른 사람이 모두 포기(폴드)</b>하게 만들기</div>
    <p>실제 돈은 쓰지 않아요. 구슬을 다 잃어도 1000개를 다시 받아요.</p>` },
  { t: "카드 7장 중 좋은 5장", h: () => `
    <div class="lab">내 카드 2장 (나만 봐요)</div>${cards([C(8, 0), C(8, 2)])}
    <div class="lab">가운데 카드 5장 (모두 함께 써요)</div>${cards([C(8, 3), C(13, 1), C(3, 0), C(5, 2), C(2, 3)])}
    <p>내 카드 2장과 가운데 5장, 모두 7장 중에서 <b>가장 좋은 5장</b>으로 겨뤄요.</p>
    <div class="tip">위 예: 8이 세 장(8♠ 8♦ 8♣) → <b>트리플</b>이에요!</div>` },
  { t: "한 판은 이렇게 흘러가요", h: () => `
    <div class="flow">
      <b>① 프리플롭</b><span>내 카드 2장을 받고 첫 번째로 걸어요.</span>
      <b>② 플롭</b><span>가운데 카드 3장이 펼쳐지고 또 걸어요.</span>
      <b>③ 턴</b><span>가운데 4번째 카드 → 또 걸어요.</span>
      <b>④ 리버</b><span>가운데 5번째 카드 → 마지막으로 걸어요.</span>
      <b>⑤ 쇼다운</b><span>남은 사람이 카드를 보여 주고 가장 좋은 족보가 팟을 가져가요.</span>
    </div>
    <p>단계마다 테이블을 한 바퀴 돌며, 차례가 온 사람이 걸지 말지 정해요.</p>` },
  { t: "내 차례에 누르는 버튼", h: () => `
    <div class="acts">
      <div><b>체크</b> 아무도 안 걸었을 때, 안 걸고 차례를 넘겨요. (공짜)</div>
      <div><b>콜</b> 앞사람이 건 만큼 <b>똑같이</b> 걸고 따라가요.</div>
      <div><b>베팅·레이즈</b> 내가 먼저 걸거나, 앞사람보다 <b>더 많이</b> 걸어요. ½팟·팟·올인 중 고를 수 있어요.</div>
      <div><b>폴드</b> 이번 판을 포기해요. 이미 건 구슬은 돌려받지 못해요.</div>
      <div><b>올인</b> 가진 구슬을 모두 걸어요.</div>
    </div>` },
  { t: "블라인드와 딜러(D)", h: () => `
    <p>판마다 <b>D(딜러)</b> 표시가 한 칸씩 옮겨 가요.</p>
    <p>D 바로 다음 두 사람은 카드를 보기 전에 정해진 구슬을 먼저 내요. 이걸 <b>블라인드</b>라고 해요.</p>
    <div class="flow"><b>SB</b><span>작은 블라인드 (처음 10개)</span><b>BB</b><span>큰 블라인드 (처음 20개)</span></div>
    <p>그래서 팟이 늘 조금 차 있고, 첫 차례에는 <b>BB만큼 내면 콜</b>이에요. 블라인드는 10판마다 두 배가 돼요.</p>` },
  { t: "족보 (위가 가장 강해요)", h: () => `
    <div class="rank">${RANK_EX.map(([n, cs, d]) => `<div><b>${n}</b>${cs.map((c) => cardHTML(c)).join("")}<small>${d}</small></div>`).join("")}</div>
    <p style="font-size:13px">같은 족보끼리는 더 높은 숫자가 이겨요. (A가 가장 높아요)</p>` },
  { t: "처음이라면 이렇게!", h: () => `
    <div class="tip">🦜 <b>페이의 조언</b>을 켜 두면 내 차례마다 <b>추천 버튼이 반짝이고</b>, 왜 그런지 알려 줘요.</div>
    <p>• 시작 카드가 <b>같은 숫자 2장</b>(예: 8·8)이거나 <b>A·K·Q 같은 높은 카드</b>면 따라가 볼 만해요.</p>
    <p>• 💡 버튼을 누르면 지금 내 패가 <b>이길 확률</b>을 보여 줘요.</p>
    <p>• 콜할지 망설여지면: <b>이길 확률이 '내야 할 몫'보다 크면 콜</b>, 작으면 폴드!</p>
    <p>• 라합은 허세가 심하고, 늑대개는 웬만하면 따라오고, 김미아는 좋은 패일 때만 크게 걸어요.</p>` },
];
let tutI = 0, tutDone = null;
function openTutorial(after) {
  tutI = 0; tutDone = after || null; $("menu").hidden = true; drawTut(); $("tutorial").hidden = false;
}
function drawTut() {
  const st = TUT[tutI];
  $("tutStep").textContent = `${tutI + 1} / ${TUT.length}`;
  $("tutTitle").textContent = st.t; $("tutBody").innerHTML = st.h();
  $("tutDots").innerHTML = TUT.map((_, i) => `<i class="${i === tutI ? "on" : ""}"></i>`).join("");
  $("tutPrev").disabled = tutI === 0;
  $("tutNext").textContent = tutI === TUT.length - 1 ? "다 배웠어요! ▶" : "다음 ▶";
}
function closeTutorial() {
  $("tutorial").hidden = true; G.tutSeen = true; save();
  if (tutDone) tutDone(); else if (!G.players.length) openMenu();
}
$("tutPrev").onclick = () => { if (tutI > 0) { tutI--; drawTut(); } };
$("tutNext").onclick = () => { if (tutI < TUT.length - 1) { tutI++; drawTut(); } else closeTutorial(); };
$("tutSkip").onclick = closeTutorial;
$("btnLearn").onclick = () => openTutorial(openMenu);
$("btnLearnTop").onclick = () => openTutorial(null);
$("coachOn").onchange = () => { G.coach = $("coachOn").checked; save(); };

// ---------------------------------------------------------------- 메뉴 · 버튼
function openMenu() {
  const size = Number(document.querySelector('.seg[data-key="table"] button.on').dataset.v);
  $("whoRow").innerHTML = TABLES[size].slice(1).map((id) => `<figure><img src="assets/chars/${CHARS[id].img}.png" alt=""><figcaption>${CHARS[id].name}</figcaption></figure>`).join("");
  $("menu").hidden = false;
}
document.querySelectorAll(".seg").forEach((seg) => seg.addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  seg.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b)); openMenu();
}));
$("btnStart").onclick = () => {
  const size = Number(document.querySelector('.seg[data-key="table"] button.on').dataset.v);
  const s = loadSaved();
  if (humanResolve) { humanResolve = null; setButtons(false); $("raiseBox").hidden = true; }
  setupTable(size, s && s.chips > 0 ? s.chips : 1000);
  $("menu").hidden = true; save(); playHand();
};
$("btnMenu").onclick = () => { if (humanResolve || !$("btnNext").hidden || !G.players.length) openMenu(); else say("이 판이 끝나면 메뉴를 열 수 있어요."); };
$("btnFold").onclick = () => humanResolve && humanResolve({ type: "fold" });
$("btnCall").onclick = () => humanResolve && humanResolve({ type: "call" });
$("btnRaise").onclick = () => humanResolve && openRaise();
$("raiseRange").oninput = () => { $("raiseVal").textContent = $("raiseRange").value; };
document.querySelectorAll(".raise-presets [data-p]").forEach((b) => b.onclick = () => {
  const p = G.players[0], r = $("raiseRange"), toCall = G.currentBet - p.bet;
  const v = b.dataset.p === "allin" ? Number(r.max) : G.currentBet + Math.round((potTotal() + toCall) * (b.dataset.p === "half" ? 0.5 : 1) / G.sb) * G.sb;
  r.value = Math.max(Number(r.min), Math.min(Number(r.max), v)); $("raiseVal").textContent = r.value;
});
$("raiseCancel").onclick = () => { $("raiseBox").hidden = true; };
$("raiseOk").onclick = () => humanResolve && humanResolve({ type: "raise", to: Number($("raiseRange").value) });
$("btnNext").onclick = () => playHand();
$("btnHint").onclick = () => {
  const me = G.players[0];
  if (!me || !me.hole.length || me.folded) return;
  const e = equity(me.hole, G.board, Math.max(1, notFolded().length - 1), 1500);
  $("myEq").textContent = `이길 확률 약 ${Math.round(e * 100)}% (상대 ${Math.max(1, notFolded().length - 1)}명 기준 어림)`;
};
$("btnRules").onclick = () => {
  const ex = ["A K 9 7 3", "8 8", "8 8 + 5 5", "Q Q Q", "5 6 7 8 9", "같은 무늬 5장", "Q Q Q + 9 9", "7 7 7 7", "같은 무늬 5 6 7 8 9", "같은 무늬 10 J Q K A"];
  $("rulesList").innerHTML = HAND_NAMES.map((n, i) => `<li><b>${n}</b> <small>${ex[i]}</small></li>`).reverse().join("");
  $("rules").hidden = false;
};
$("btnRulesOk").onclick = () => { $("rules").hidden = true; };
$("btnSound").onclick = () => { G.sound = !G.sound; $("btnSound").textContent = G.sound ? "🔊" : "🔇"; save(); };

(function init() {
  const s = loadSaved();
  if (s) { G.stats = s.stats || G.stats; G.sound = s.sound !== false; $("btnSound").textContent = G.sound ? "🔊" : "🔇"; G.coach = s.coach !== false; G.tutSeen = !!s.tutSeen; }
  $("coachOn").checked = G.coach;
  setButtons(false);
  if (location.hash.startsWith("#selftest")) {   // 개발용: 나는 항상 콜, 판이 끝나면 바로 다음 판. 오류는 말풍선에
    addEventListener("error", (e) => { document.title = "ERR " + e.message; say("ERR " + e.message); });
    addEventListener("unhandledrejection", (e) => { document.title = "ERR " + e.reason; say("ERR " + e.reason); });
    setupTable(location.hash === "#selftest7" ? 7 : 5); playHand(); return;
  }
  // 개발용: #tut=6 → 튜토리얼 6단계, #coachdemo → 바로 판 시작(자동 진행 없음, 조언 확인용)
  if (location.hash.startsWith("#tut=")) { openTutorial(openMenu); tutI = Number(location.hash.slice(5)) - 1; drawTut(); return; }
  if (location.hash === "#coachdemo") { G.coach = true; setupTable(5); playHand(); return; }
  if (!G.tutSeen) openTutorial(openMenu); else openMenu();
})();
