// 퓨어데이 FC — 커리어 v3 (2026-10-25): 여러 리그·승강제, 실제 구단 맡기 / 뉴팀 창단, 운영비, 여름·겨울·FA 이적시장, 트레이드
import { makeWorld, makeStarterSquad, ovr, marketValue, formulaValue, wageOf, money, autoLineup, teamRating, DEFAULT_TACTIC, PRESETS, FORMATIONS, migrateTactic, rng, getNextId, setNextId, AKEYS, clampA } from "./data.js?v=3";
import { quickSim } from "./engine.js?v=3";
import { PROMO, COUNTRY } from "./realdata.js?v=3";

export const MY = "my";
export const WINDOW_DAYS = 5;
export const PHASE_KO = { summer: "여름 이적시장", winter: "겨울 이적시장", fa: "FA 이적시장", league: "리그 진행 중" };
const SQUAD_MAX = 34, SQUAD_MIN = 16;

// ---------------------------------------------------------------- 만들기
// opts: { world, mode:"real"|"pure", take: 구단 id | null, team: {name,short,c1,c2,league} | null, seed }
export function newCareer(opts) {
  const seed = opts.seed ?? (Date.now() % 1e9);
  const w = opts.world || makeWorld();
  setNextId(w.nextId || 100000);
  const clubs = w.clubs.map((c) => ({ ...c })), players = w.players.map((p) => ({ ...p })), leagues = w.leagues.map((l) => ({ ...l, clubs: l.clubs.slice() }));
  let myName;
  if (opts.take) {   // 실제 구단 맡기: 그 구단 id 를 my 로 바꿈
    const c = clubs.find((x) => x.id === opts.take); const old = c.id; c.id = MY; c.my = true; c.realId = old; myName = c.name;
    for (const p of players) if (p.club === old) p.club = MY;
    for (const l of leagues) l.clubs = l.clubs.map((id) => (id === old ? MY : id));
  } else {           // 뉴팀: 고른 리그(보통 3부)에 한 팀 더해 들어감
    const t = opts.team || {}; const lgId = t.league || leagues[leagues.length - 1].id, lg = leagues.find((l) => l.id === lgId);
    const others = clubs.filter((c) => c.league === lgId), avgBudget = others.reduce((s, c) => s + c.budget, 0) / Math.max(1, others.length);
    const lvl = levelOf(players, others.map((c) => c.id));
    const my = { id: MY, name: t.name || "뉴팀 FC", short: (t.short || "NEW").slice(0, 3).toUpperCase(), c1: t.c1 || "#ffd34a", c2: t.c2 || "#1b2a4a", rep: Math.max(20, Math.round(others.reduce((s, c) => s + (c.rep || 50), 0) / Math.max(1, others.length)) - 8), budget: Math.round(Math.max(2e6, avgBudget * 0.8) / 1e5) * 1e5, my: true, league: lgId };
    const st = makeStarterSquad(seed, getNextId(), lvl - (opts.mode === "real" ? 5 : 12)); st.players.forEach((p) => { p.club = MY; p.value = null; }); setNextId(st.nextId);
    clubs.unshift(my); players.push(...st.players); lg.clubs.push(MY); myName = my.name;
  }
  const S = { v: 3, mode: opts.mode || "pure", seed, season: 1, year: 2026, phase: "summer", day: 1, clubs, players, leagues, nextId: getNextId(),
    tactics: {}, lineups: {}, listed: [], offers: [], news: [], fin: [], history: [], fetched: w.fetched || null, created: Date.now() };
  const r = rng(seed), forms = Object.keys(FORMATIONS), pres = Object.keys(PRESETS);
  for (const c of S.clubs) { if (c.my) S.tactics[c.id] = { ...DEFAULT_TACTIC }; else { const pr = PRESETS[pres[Math.floor(r() * pres.length)]]; S.tactics[c.id] = { ...DEFAULT_TACTIC, formation: forms[Math.floor(r() * forms.length)], ...pr.v, preset: null, v3: true }; } }
  for (const l of S.leagues) setupLeague(S, l, r);
  for (const p of S.players) { if (p.club && !p.wage) p.wage = wageOf(p); }
  news(S, `🏟 ${myName} — ${opts.take ? "감독 부임" : "창단"}! 운영비 ${money(club(S, MY).budget)}. ${myLeague(S).name}에서 시작해요. 여름 이적시장이 열렸어요.`, "my");
  fixLineup(S, MY);
  return S;
}
function levelOf(players, clubIds) { const set = new Set(clubIds); const os = players.filter((p) => set.has(p.club)).map((p) => ovr(p)).sort((a, b) => b - a); const top = os.slice(0, Math.max(11, Math.floor(os.length * 0.45))); return Math.round(top.reduce((s, v) => s + v, 0) / Math.max(1, top.length)); }
function setupLeague(S, l, r) { l.fixtures = makeFixtures(l.clubs, r); l.played = 0; l.table = {}; for (const id of l.clubs) l.table[id] = { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }; }
function makeFixtures(ids0, r) {   // 원형 방식 더블 라운드로빈, 홀수면 쉬는 팀
  const ids = ids0.slice(); for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
  if (ids.length % 2) ids.push(null);
  const n = ids.length, arr = ids.slice(), rounds = [];
  for (let k = 0; k < n - 1; k++) {
    const md = []; for (let i = 0; i < n / 2; i++) { const a = arr[i], b = arr[n - 1 - i]; if (a && b) md.push(k % 2 ? { h: a, a: b } : { h: b, a: a }); }
    rounds.push(md); arr.splice(1, 0, arr.pop());
  }
  return [...rounds, ...rounds.map((md) => md.map((f) => ({ h: f.a, a: f.h })))];
}

// ---------------------------------------------------------------- 도우미
export const club = (S, id) => S.clubs.find((c) => c.id === id);
// 색인: 선수 수천 명을 매번 훑지 않게(소속이 바뀔 때마다 touch)
const IDX = new WeakMap();
function idx(S) {
  let I = IDX.get(S);
  if (!I || I.n !== S.players.length || I.ver !== (S._ver || 0)) {
    const byId = new Map(), byClub = new Map();
    for (const p of S.players) { byId.set(p.id, p); if (p.club) { let a = byClub.get(p.club); if (!a) byClub.set(p.club, (a = [])); a.push(p); } }
    I = { byId, byClub, n: S.players.length, ver: S._ver || 0 }; IDX.set(S, I);
  }
  return I;
}
export function touch(S) { S._ver = (S._ver || 0) + 1; }
export const squad = (S, id) => (idx(S).byClub.get(id) || []).slice();
export const player = (S, id) => idx(S).byId.get(id);
export const league = (S, id) => S.leagues.find((l) => l.id === id);
export const myLeague = (S) => S.leagues.find((l) => l.clubs.includes(MY));
export const leagueOf = (S, cid) => S.leagues.find((l) => l.clubs.includes(cid));
export const payroll = (S, id) => squad(S, id).reduce((s, p) => s + (p.wage || wageOf(p)), 0);
export const windowOpen = (S) => S.phase === "summer" || S.phase === "winter" || S.phase === "fa";
export function news(S, text, kind = "info") { S.news.unshift({ text, kind, season: S.season, phase: S.phase }); if (S.news.length > 150) S.news.length = 150; }
function finLog(S, cid, amount, what) { if (cid === MY) { S.fin.unshift({ amount, what, season: S.season }); if (S.fin.length > 80) S.fin.length = 80; } const c = club(S, cid); if (c) c.budget += amount; }
export function seasonLabel(S) { return `${S.year}/${String((S.year + 1) % 100).padStart(2, "0")}`; }
export function standings(S, l = myLeague(S)) { return l.clubs.map((id) => ({ c: club(S, id), ...l.table[id] })).sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf); }
export function fixLineup(S, cid) {
  const sq = squad(S, cid); let t = S.tactics[cid] = migrateTactic(S.tactics[cid] || DEFAULT_TACTIC); const cur = S.lineups[cid];
  const key = t.slots ? "custom:" + t.slots.map((s) => s[0]).join(",") : t.formation;
  const ok = cur && cur.key === key && cur.xi.length === 11 && cur.xi.every((id) => id && sq.some((p) => p.id === id));
  if (!ok) S.lineups[cid] = { ...autoLineup(sq, t), key };
  else S.lineups[cid].bench = cur.bench.filter((id) => sq.some((p) => p.id === id) && !cur.xi.includes(id));
  return S.lineups[cid];
}
export function rating(S, cid) { const lu = fixLineup(S, cid); return teamRating(squad(S, cid), lu, S.tactics[cid]).ovr; }
export function nextFixture(S) { if (S.phase !== "league") return null; const l = myLeague(S), md = l.fixtures[l.played]; return md && md.find((f) => f.h === MY || f.a === MY) || (md ? { bye: true } : null); }
export function phaseInfo(S) {
  const l = myLeague(S), R = l.fixtures.length, half = Math.floor(R / 2);
  if (S.phase === "league") return `${l.name} ${l.played + 1}라운드 / ${R}` + (l.played < half ? ` · 겨울 이적시장까지 ${half - l.played}경기` : "");
  if (windowOpen(S)) return `${PHASE_KO[S.phase]} ${S.day}일째 / ${WINDOW_DAYS}일`;
  return "";
}

// ---------------------------------------------------------------- 이적시장: 사기·팔기·트레이드
function importance(S, p) { if (!p.club) return 0; const sq = squad(S, p.club).sort((a, b) => ovr(b) - ovr(a)); const k = sq.indexOf(p); return k < 3 ? 0.35 : k < 11 ? 0.15 : 0; }
export function askingPrice(S, p) { return p.club ? Math.round(marketValue(p) * (1.12 + importance(S, p)) / 25e3) * 25e3 : 0; }
export function wageDemand(S, p, buyer = MY) {
  const from = p.club ? club(S, p.club).rep : 50, to = club(S, buyer).rep;
  return Math.max(500, Math.round(wageOf(p) * (1.05 + Math.max(0, from - to) / 120) / 250) * 250);
}
export function signBonus(p) { return Math.round(marketValue(p) * 0.12 / 25e3) * 25e3; }
export function makeOffer(S, pid, fee, swaps = []) {
  const p = player(S, pid), me = club(S, MY);
  if (!windowOpen(S)) return { ok: false, msg: "이적시장이 닫혀 있어요." };
  if (!p || p.club === MY) return { ok: false, msg: "살 수 없는 선수예요." };
  if (!p.club) return signFA(S, pid);
  const seller = club(S, p.club), mySq = squad(S, MY), theirSq = squad(S, p.club);
  if (mySq.length - swaps.length + 1 > SQUAD_MAX) return { ok: false, msg: `선수단이 너무 많아요(최대 ${SQUAD_MAX}명).` };
  if (theirSq.length - 1 + swaps.length < SQUAD_MIN) return { ok: false, msg: `${seller.name}은 선수가 모자라 팔 수 없대요.` };
  if (fee > me.budget) return { ok: false, msg: `운영비가 모자라요. (남은 운영비 ${money(me.budget)})` };
  const ask = askingPrice(S, p), avg = theirSq.reduce((s, q) => s + ovr(q), 0) / theirSq.length;
  const swapVal = swaps.map((id) => player(S, id)).reduce((s, q) => s + marketValue(q) * (ovr(q) >= avg - 4 ? 0.9 : 0.5), 0);
  // 선수 마음: 평판이 너무 낮은 팀이면 거절
  const repGap = (seller.rep || 50) - (me.rep || 50);
  if (repGap > 30 && ovr(p) > 95) return { ok: false, result: "reject", msg: `${p.name}: "지금은 더 큰 무대에 남고 싶어요." (평판 차이 ${repGap})` };
  if (fee + swapVal >= ask) { doTransfer(S, p, MY, fee, swaps); return { ok: true, result: "accept", msg: `${seller.name}이(가) 제안을 받아들였어요! ${p.name} 영입.` }; }
  if (fee + swapVal >= ask * 0.78) { const counter = Math.max(0, Math.ceil((ask - swapVal) / 25e3) * 25e3); return { ok: false, result: "counter", counter, msg: `${seller.name}: "${money(counter)}${swaps.length ? " + 제안한 선수" : ""}면 보낼게요."` }; }
  return { ok: false, result: "reject", msg: `${seller.name}이(가) 거절했어요. (원하는 가치 약 ${money(ask)})` };
}
export function signFA(S, pid) {
  const p = player(S, pid), me = club(S, MY);
  if (!windowOpen(S)) return { ok: false, msg: "이적시장이 닫혀 있어요." };
  const bonus = signBonus(p);
  if (bonus > me.budget) return { ok: false, msg: `계약금 ${money(bonus)}이 모자라요.` };
  if (squad(S, MY).length >= SQUAD_MAX) return { ok: false, msg: `선수단이 너무 많아요(최대 ${SQUAD_MAX}명).` };
  p.club = MY; touch(S); p.contract = 2; p.wage = wageDemand(S, p); finLog(S, MY, -bonus, `FA 계약금 ${p.name}`);
  news(S, `✍ ${me.name}, 자유 계약 ${p.name}(${p.pos}, ${ovr(p)}) 영입 — 계약금 ${money(bonus)}`, "my");
  fixLineup(S, MY);
  return { ok: true, result: "accept", msg: `${p.name}와(과) 계약했어요! 계약금 ${money(bonus)}` };
}
function doTransfer(S, p, buyerId, fee, swaps = []) {
  const sellerId = p.club, buyer = club(S, buyerId), seller = club(S, sellerId);
  finLog(S, buyerId, -fee, `이적료 ${p.name}`); finLog(S, sellerId, fee, `이적료 ${p.name}`);
  p.club = buyerId; touch(S); p.contract = 3; p.wage = wageDemand(S, p, buyerId);
  for (const id of swaps) { const q = player(S, id); q.club = sellerId; touch(S); q.contract = Math.max(q.contract, 2); S.listed = S.listed.filter((x) => x !== id); }
  S.listed = S.listed.filter((x) => x !== p.id);
  const sw = swaps.length ? ` + ${swaps.map((id) => player(S, id).name).join(", ")}` : "";
  const mine = buyerId === MY || sellerId === MY;
  if (mine || marketValue(p) > 5e6) news(S, `🔁 ${p.name}(${p.pos}, ${ovr(p)}) ${seller.name} → ${buyer.name}, ${money(fee)}${sw}`, mine ? "my" : "info");
  fixLineup(S, buyerId); fixLineup(S, sellerId);
}
export function toggleList(S, pid) { if (S.listed.includes(pid)) S.listed = S.listed.filter((x) => x !== pid); else S.listed.push(pid); }
export function acceptOffer(S, k) {
  const o = S.offers[k]; if (!o) return; const p = player(S, o.pid);
  if (!p || p.club !== MY) { S.offers.splice(k, 1); return; }
  if (club(S, o.from).budget < o.fee) { S.offers.splice(k, 1); return { msg: "상대 구단 운영비가 모자라 취소됐어요." }; }
  doTransfer(S, p, o.from, o.fee); S.offers = S.offers.filter((x) => x.pid !== o.pid);
  return { msg: `${p.name}을(를) ${club(S, o.from).name}에 ${money(o.fee)}에 보냈어요.` };
}
export function declineOffer(S, k) { S.offers.splice(k, 1); }
export function release(S, pid) {
  const p = player(S, pid); if (!p || p.club !== MY) return;
  if (squad(S, MY).length <= SQUAD_MIN) return { msg: `선수가 ${SQUAD_MIN}명보다 적어지면 안 돼요.` };
  const pay = Math.round((p.wage || wageOf(p)) * 36 * Math.max(1, p.contract) * 0.5 / 1000) * 1000;
  finLog(S, MY, -pay, `계약 해지 ${p.name}`); p.club = null; touch(S); p.contract = 0; S.listed = S.listed.filter((x) => x !== pid);
  news(S, `📤 ${p.name}과(와) 계약을 해지했어요 — 위약금 ${money(pay)}`, "my"); fixLineup(S, MY);
  return { msg: `${p.name} 방출 — 위약금 ${money(pay)}` };
}
export function extend(S, pid) {
  const p = player(S, pid); if (!p || p.club !== MY) return;
  if (p.age >= 35) return { msg: `${p.name}: "이제 은퇴를 생각하고 있어요."` };
  p.contract += 2; p.wage = Math.round(Math.max(p.wage || 0, wageOf(p)) * 1.1 / 250) * 250;
  return { msg: `${p.name} 재계약! 남은 계약 ${p.contract}시즌, 주급 ${money(p.wage)}` };
}
// 능력치 편집(대표님 요청: 커스터마이징). 실제 자료 선수는 시장가치도 능력 변화만큼 따라 움직임
export function editPlayer(S, pid, attrs, pos) {
  const p = player(S, pid); if (!p) return; const before = formulaValue(p);
  for (const k of AKEYS) if (attrs[k] != null) p[k] = clampA(attrs[k]);
  if (pos) p.pos = pos; p.pot = Math.max(p.pot || 0, ovr(p));
  if (p.value != null) p.value = Math.max(25e3, Math.round(p.value * formulaValue(p) / Math.max(1, before) / 25e3) * 25e3);
  if (p.club) fixLineup(S, p.club);
}

// ---------------------------------------------------------------- 하루 넘기기(이적시장)
export function advanceDay(S, rand = Math.random) {
  if (!windowOpen(S)) return;
  aiTransfers(S, rand);
  for (const pid of S.listed) {
    const p = player(S, pid); if (!p || p.club !== MY || rand() > 0.55) continue;
    const myL = myLeague(S), pool = S.clubs.filter((c) => !c.my && c.budget > marketValue(p) * 0.8 && squad(S, c.id).length < 30 && (leagueOf(S, c.id) || {}).country === myL.country);
    if (!pool.length) continue;
    const b = pool[Math.floor(rand() * pool.length)], fee = Math.round(marketValue(p) * (0.75 + rand() * 0.45) / 25e3) * 25e3;
    if (!S.offers.some((o) => o.pid === pid && o.from === b.id)) { S.offers.push({ pid, from: b.id, fee }); news(S, `📨 ${b.name}이(가) ${p.name}에게 ${money(fee)} 제안`, "my"); }
  }
  S.day++;
  if (S.day > WINDOW_DAYS) closeWindow(S);
}
function aiTransfers(S, rand) {
  const fa = S.players.filter((p) => !p.club);
  const pool = S.players.filter((p) => p.club && p.club !== MY);
  for (const c of S.clubs) {
    if (c.my) continue; const sq = squad(S, c.id);
    if (sq.length < 20) {   // 모자라면 FA 로 채움(싼 선수부터 형편껏)
      for (const p of fa.filter((q) => !q.club).sort((a, b) => ovr(b) - ovr(a))) { if (squad(S, c.id).length >= 20) break; const bonus = signBonus(p); if (c.budget > bonus * 2 && marketValue(p) < c.sqVal * 0.25 + 2e5) { p.club = c.id; touch(S); p.contract = 2; p.wage = wageDemand(S, p, c.id); c.budget -= bonus; if (marketValue(p) > 2e6) news(S, `✍ ${c.name}, 자유 계약 ${p.name} 영입`); } }
    }
    if (rand() > 0.3) continue;
    const avg = sq.reduce((s, p) => s + ovr(p), 0) / Math.max(1, sq.length);
    // 후보 몇 명만 뽑아 본다(전체 수천 명)
    for (let k = 0; k < 40; k++) {
      const p = rand() < 0.15 ? fa[Math.floor(rand() * fa.length)] : pool[Math.floor(rand() * pool.length)];
      if (!p || p.club === c.id || p.club === MY) continue; const o = ovr(p); if (o < avg + 1 || o > avg + 8) continue;
      if (!p.club) { const bonus = signBonus(p); if (c.budget > bonus * 3 && sq.length < 28) { p.club = c.id; touch(S); p.contract = 2; p.wage = wageDemand(S, p, c.id); c.budget -= bonus; news(S, `✍ ${c.name}, 자유 계약 ${p.name}(${o}) 영입`); } break; }
      const ask = askingPrice(S, p);
      if (c.budget > ask * 1.15 && squad(S, p.club).length > 18 && sq.length < 28) { doTransfer(S, p, c.id, ask); }
      break;
    }
  }
}
function closeWindow(S) {
  const was = S.phase; S.offers = [];
  if (was === "fa") { S.phase = "summer"; S.day = 1; news(S, `☀ ${seasonLabel(S)} 여름 이적시장이 열렸어요.`); return; }
  S.phase = "league"; S.day = 0;
  news(S, was === "summer" ? `⚽ ${seasonLabel(S)} 시즌 개막! 여름 이적시장이 닫혔어요.` : "❄ 겨울 이적시장이 닫혔어요. 후반기 시작!");
  for (const c of S.clubs) fixLineup(S, c.id);
}

// ---------------------------------------------------------------- 경기 진행
function playRound(S, l, myResult, rand) {
  const md = l.fixtures[l.played]; if (!md) return [];
  const res = [], gate = Math.max(5e3, (l.econ || 2e8) * 0.006);
  for (const f of md) {
    let sc, scorers = []; const mine = f.h === MY || f.a === MY;
    if (mine && myResult) { sc = myResult.score; scorers = myResult.scorers || []; }
    else { sc = quickSim(rating(S, f.h) + 2, rating(S, f.a), S.tactics[f.h], S.tactics[f.a], rand); scorers = [...pickScorers(S, f.h, sc[0], rand), ...pickScorers(S, f.a, sc[1], rand)]; }
    for (const id of scorers) { const p = player(S, id); if (p) p.sg = (p.sg || 0) + 1; }
    for (const cid of [f.h, f.a]) for (const id of (S.lineups[cid] || fixLineup(S, cid)).xi) { const p = player(S, id); if (p) p.apps = (p.apps || 0) + 1; }
    const H = l.table[f.h], A = l.table[f.a], [gh, ga] = sc; H.p++; A.p++; H.gf += gh; H.ga += ga; A.gf += ga; A.ga += gh;
    if (gh > ga) { H.w++; H.pts += 3; A.l++; } else if (gh < ga) { A.w++; A.pts += 3; H.l++; } else { H.d++; A.d++; H.pts++; A.pts++; }
    f.score = sc; res.push({ ...f, mine });
    finLog(S, f.h, Math.round(gate * (0.6 + (club(S, f.h).rep || 50) / 100) / 1e3) * 1e3, "홈 경기 입장 수입");
    if (gh !== ga) finLog(S, gh > ga ? f.h : f.a, Math.round(gate * 0.3 / 1e3) * 1e3, "승리 수당");
  }
  for (const id of l.clubs) finLog(S, id, -payroll(S, id) * 2, "주급(2주)");
  l.played++;
  return res;
}
export function playMatchday(S, myResult = null, rand = Math.random) {
  if (S.phase !== "league") return null;
  const L = myLeague(S), R = L.fixtures.length;
  const results = playRound(S, L, myResult, rand);
  for (const l of S.leagues) { if (l === L) continue; const target = Math.floor(L.played * l.fixtures.length / R); while (l.played < target) playRound(S, l, null, rand); }
  const my = results.find((r) => r.mine);
  if (my) { const me = my.h === MY ? 0 : 1, gf = my.score[me], ga = my.score[1 - me], opp = club(S, me === 0 ? my.a : my.h); news(S, `${gf > ga ? "🟢 승리" : gf < ga ? "🔴 패배" : "⚪ 무승부"} ${L.played}R ${club(S, my.h).short} ${my.score[0]}:${my.score[1]} ${club(S, my.a).short} (vs ${opp.name})`, "my"); }
  if (L.played === Math.floor(R / 2)) { S.phase = "winter"; S.day = 1; news(S, "❄ 겨울 이적시장이 열렸어요!", "my"); }
  else if (L.played >= R) { for (const l of S.leagues) while (l.played < l.fixtures.length) playRound(S, l, null, rand); endSeason(S, rand); }
  return { results, league: L.id };
}
function pickScorers(S, cid, n, rand) {
  const lu = S.lineups[cid] || fixLineup(S, cid); const xi = lu.xi.map((id) => player(S, id)).filter(Boolean);
  const w = xi.map((p) => (p.pos === "ST" ? 5 : ["LW", "RW", "AM"].includes(p.pos) ? 3 : p.pos === "CM" ? 1.5 : 0.4) * (p.sho / 90) + (p.hea > 100 ? 0.4 : 0));
  const tot = w.reduce((a, b) => a + b, 0); const out = [];
  for (let k = 0; k < n; k++) { let r = rand() * tot; for (let i = 0; i < xi.length; i++) { r -= w[i]; if (r <= 0) { out.push(xi[i].id); break; } } }
  return out;
}
function endSeason(S, rand) {
  const label = seasonLabel(S), myL = myLeague(S);
  // 상금(리그 경제 규모에 맞춰)·평판
  for (const l of S.leagues) {
    const tab = standings(S, l), base = (l.econ || 2e8) * 0.08;
    tab.forEach((row, i) => { finLog(S, row.c.id, Math.round(base * (1 - i / tab.length * 0.8) / 1e4) * 1e4, `${label} ${l.name} ${i + 1}위 상금`); row.c.rep = Math.max(15, Math.min(98, (row.c.rep || 50) + (tab.length / 2 - i) * 0.6)); });
  }
  const myTab = standings(S, myL), myRank = myTab.findIndex((r) => r.c.id === MY) + 1;
  const top = S.players.filter((p) => p.club && myL.clubs.includes(p.club)).sort((a, b) => (b.sg || 0) - (a.sg || 0))[0];
  // 승강
  const moves = promoteRelegate(S);
  const myMove = moves.find((m) => m.id === MY);
  S.history.unshift({ season: label, league: myL.name, champion: myTab[0].c.name, myRank, myPts: myL.table[MY].pts, topScorer: top ? `${top.name} ${top.sg}골` : "", move: myMove ? myMove.kind : "" });
  news(S, `🏆 ${label} ${myL.name} 우승: ${myTab[0].c.name}! 우리 팀 ${myRank}위${myMove ? (myMove.kind === "up" ? " — 🎉 승격!" : " — 강등") : ""} · 득점왕 ${top ? top.name + " " + top.sg + "골" : "-"}`, "my");
  for (const l of S.leagues) if (l !== myL) { const t = standings(S, l)[0]; if (t) news(S, `🏆 ${l.name} 우승: ${t.c.name}`); }
  // 계약·나이·성장
  let expired = 0;
  for (const p of S.players) {
    const before = formulaValue(p); p.age++;
    const o = ovr(p); let d = p.age <= 21 ? 2.5 + rand() * 3 : p.age <= 24 ? 1 + rand() * 2.2 : p.age <= 29 ? rand() * 1.6 - 0.5 : p.age <= 32 ? -1 - rand() * 1.6 : -2 - rand() * 2.8;
    if (o >= (p.pot || o) && d > 0) d *= 0.3;
    for (const k of AKEYS) { const dd = k === "iq" ? Math.abs(d) * 0.5 + 0.5 : (k === "pac" || k === "sta") && p.age > 29 ? d * 1.3 : d; p[k] = clampA(p[k] + dd * (0.6 + rand() * 0.8)); }
    if (p.value != null) p.value = Math.max(25e3, Math.round(p.value * formulaValue(p) / Math.max(1, before) * (p.sg ? 1 + Math.min(0.3, p.sg * 0.02) : 1) / 25e3) * 25e3);
    if (p.club) { p.contract--; if (p.contract <= 0) {
      const c = club(S, p.club);
      // 인공지능 구단은 쓸 만한 선수와 재계약
      if (!c.my && p.age < 33 && rand() < 0.65 && ovr(p) >= (c._avg ?? (c._avg = squad(S, c.id).reduce((s2, q) => s2 + ovr(q), 0) / Math.max(1, squad(S, c.id).length))) - 3) { p.contract = 1 + Math.floor(rand() * 3); p.wage = wageOf(p); continue; }
      if (p.club === MY) news(S, `📋 계약 만료: ${p.name} → FA`, "my"); else expired++;
      p.club = null; touch(S); p.contract = 0; S.listed = S.listed.filter((x) => x !== p.id);
    } }
  }
  for (const c of S.clubs) delete c._avg;
  if (expired) news(S, `📋 다른 구단 선수 ${expired}명이 계약 만료로 FA 가 됐어요.`);
  S.players = S.players.filter((p) => !(p.club == null && p.age >= 36 && !p.face));
  for (const c of S.clubs) { const l = leagueOf(S, c.id); finLog(S, c.id, Math.round(((l && l.econ) || 2e8) * (0.02 + (c.rep || 50) / 2500) / 1e4) * 1e4, "스폰서 계약"); }
  S.season++; S.year++; S.phase = "fa"; S.day = 1;
  const r = rng(S.seed + S.season); for (const l of S.leagues) setupLeague(S, l, r);
  for (const p of S.players) { p.sg = 0; p.apps = 0; }
  news(S, `📋 FA 이적시장이 열렸어요 — 계약이 끝난 선수들을 잡을 수 있어요.`, "my");
  for (const c of S.clubs) fixLineup(S, c.id);
}
function promoteRelegate(S) {
  const moves = []; const byC = {};
  for (const l of S.leagues) (byC[l.country] = byC[l.country] || []).push(l);
  for (const [country, ls] of Object.entries(byC)) {
    const rule = PROMO[country]; if (!rule) continue;
    for (const [hiTier, n] of [[1, rule[0]], [2, rule[1]]]) {
      const hi = ls.filter((l) => l.tier === hiTier), lo = ls.filter((l) => l.tier === hiTier + 1); if (!hi.length || !lo.length) continue;
      const H = hi[0]; const down = standings(S, H).slice(-n).map((r) => r.c.id);
      // 아래 리그가 여러 조면 조마다 나눠서 올림
      const per = Math.ceil(n / lo.length); let up = [];
      lo.forEach((L) => up.push(...standings(S, L).slice(0, per).map((r) => ({ id: r.c.id, from: L }))));
      up = up.slice(0, n);
      H.clubs = H.clubs.filter((id) => !down.includes(id)).concat(up.map((u) => u.id));
      up.forEach((u) => { u.from.clubs = u.from.clubs.filter((id) => id !== u.id); });
      down.forEach((id, k) => { const L = up[k] ? up[k].from : lo[k % lo.length]; L.clubs.push(id); });
      for (const id of down) { const c = club(S, id); c.league = (leagueOf(S, id) || {}).id; moves.push({ id, kind: "down" }); }
      for (const u of up) { const c = club(S, u.id); c.league = H.id; moves.push({ id: u.id, kind: "up" }); }
      for (const m of moves.slice(-n * 2)) { const c = club(S, m.id); if (c) news(S, `${m.kind === "up" ? "⬆ 승격" : "⬇ 강등"}: ${c.name} → ${(leagueOf(S, m.id) || {}).name}`, m.id === MY ? "my" : "info"); }
    }
  }
  return moves;
}

// ---------------------------------------------------------------- 저장(실제 리그는 수천 명이라 줄여서)
const KEEP = ["id", "name", "nat", "age", "pos", ...AKEYS, "pot", "club", "contract", "value", "wage", "face", "sg", "apps", "num", "lastClub"];
export function save(S) {
  try {
    const slim = { ...S, players: S.players.map((p) => { const o = {}; for (const k of KEEP) if (p[k] != null) o[k] = p[k]; return o; }) };
    localStorage.setItem("pureday-fc-v3", JSON.stringify(slim)); return true;
  } catch (e) { console.warn("저장 실패", e); return false; }
}
export function load() {
  try { const s = localStorage.getItem("pureday-fc-v3"); if (s) return JSON.parse(s); } catch (e) {}
  return null;
}
export function wipe() { try { localStorage.removeItem("pureday-fc-v3"); } catch (e) {} }
export { ovr, marketValue, wageOf, money, COUNTRY };
