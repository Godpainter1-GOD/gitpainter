// 퓨어데이 FC — 커리어 v3 (2026-10-25): 여러 리그·승강제, 실제 구단 맡기 / 뉴팀 창단, 운영비, 여름·겨울·FA 이적시장, 트레이드
// v7 (2026-10-27): 컵 대회(cups.js)·리그 1~3위 상금·득점왕/도움왕 상금·시즌 수입 집계(S.earn)·시즌 엔딩(S.endings)
import { makeWorld, makeStarterSquad, ovr, fitOvr, marketValue, formulaValue, wageOf, money, autoLineup, teamRating, DEFAULT_TACTIC, PRESETS, FORMATIONS, migrateTactic, rng, getNextId, setNextId, AKEYS, clampA } from "./data.js";
import { quickSim } from "./engine.js";
import { PROMO, COUNTRY } from "./realdata.js?v=8";
import { startCups, runIdle, runEvent, pendingEvent, cupFixture, finishAll, nextCupEvents, compScorer, comp, flagOfCountry } from "./cups.js?v=8";

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
export function makeFixtures(ids0, r) {   // 원형 방식 더블 라운드로빈, 홀수면 쉬는 팀
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
// 돈 기록. cat(시즌 수입 집계용)을 안 주면 내용으로 짐작
const CAT = [[/이적료|계약금|해지/, "transfer"], [/주급/, "wage"], [/입장/, "gate"], [/수당/, "bonus"], [/상금/, "prize"], [/스폰서/, "sponsor"]];
export function finLog(S, cid, amount, what, cat) {
  if (cid === MY) { S.fin.unshift({ amount, what, season: S.season }); if (S.fin.length > 80) S.fin.length = 80;
    const k = cat || (CAT.find(([re]) => re.test(what)) || [0, "etc"])[1]; S.earn = S.earn || {}; S.earn[k] = (S.earn[k] || 0) + amount; }
  const c = club(S, cid); if (c) c.budget += amount;
}
export function seasonLabel(S) { return `${S.year}/${String((S.year + 1) % 100).padStart(2, "0")}`; }
export function standings(S, l = myLeague(S)) { return l.clubs.map((id) => ({ c: club(S, id), ...l.table[id] })).sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf); }
export function fixLineup(S, cid) {
  const sq = squad(S, cid); if (!S.tactics[cid] || !S.tactics[cid].v3) S.tactics[cid] = migrateTactic(S.tactics[cid] || DEFAULT_TACTIC);   // 같은 객체를 계속 씀(화면에서 바꾼 값이 남도록)
  const t = S.tactics[cid], cur = S.lineups[cid];
  const key = t.slots ? "custom:" + t.slots.map((s) => s[0]).join(",") : t.formation;
  const ok = cur && cur.key === key && cur.xi.length === 11 && cur.xi.every((id) => id && sq.some((p) => p.id === id));
  if (!ok) S.lineups[cid] = { ...autoLineup(sq, t), key };
  else {
    S.lineups[cid].bench = cur.bench.filter((id) => sq.some((p) => p.id === id) && !cur.xi.includes(id));
    // 부상·출장 정지 선수가 선발이면 그 자리에 맞는 다른 선수로
    const slots = t.slots && t.slots.length === 11 ? t.slots : FORMATIONS[t.formation] || FORMATIONS["4-3-3"];
    if (cid !== MY) cur.xi.forEach((id, i) => { const p = sq.find((q) => q.id === id); if (p && (p.fit ?? 100) < 58) { const fresh = sq.filter((q) => avail(q) && !cur.xi.includes(q.id) && (q.fit ?? 100) > 80 && fitOvr(q, slots[i][0]) >= fitOvr(p, slots[i][0]) * 0.92).sort((a, b) => fitOvr(b, slots[i][0]) - fitOvr(a, slots[i][0]))[0]; if (fresh) { cur.xi[i] = fresh.id; cur.bench = [p.id, ...cur.bench.filter((x) => x !== fresh.id)].slice(0, 9); } } });
    cur.xi.forEach((id, i) => { const p = sq.find((q) => q.id === id); if (p && !avail(p)) { const rep2 = sq.filter((q) => avail(q) && !cur.xi.includes(q.id)).sort((a, b) => fitOvr(b, slots[i][0]) - fitOvr(a, slots[i][0]))[0]; if (rep2) { cur.xi[i] = rep2.id; cur.bench = cur.bench.filter((x) => x !== rep2.id); } } });
  }
  return S.lineups[cid];
}
export function rating(S, cid) { const lu = fixLineup(S, cid); return teamRating(squad(S, cid), lu, S.tactics[cid]).ovr; }
export function nextFixture(S) {
  if (S.phase !== "league") return null;
  const cf = cupFixture(S); if (cf) return cf;   // 컵 대회 경기가 먼저
  const l = myLeague(S), md = l.fixtures[l.played], f = md && md.find((x) => x.h === MY || x.a === MY);
  return f ? { ...f, label: `${l.name} ${l.played + 1}라운드` } : md ? { bye: true, label: `${l.name} ${l.played + 1}라운드` } : null;
}
export function phaseInfo(S) {
  const l = myLeague(S), R = l.fixtures.length, half = Math.floor(R / 2);
  if (S.phase === "league") { const ce = nextCupEvents(S, 1)[0]; return `${l.name} ${l.played + 1}라운드 / ${R}` + (l.played < half ? ` · 겨울 이적시장까지 ${half - l.played}경기` : "") + (ce ? ` · 다음 ${ce.comp.icon} ${ce.comp.name}: ${ce.at <= l.played ? "이번 차례" : `리그 ${ce.at - l.played}경기 뒤`}` : ""); }
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
  for (const p of S.players) if (p.club) { if (p.fit == null) p.fit = 100; p.fit = Math.min(100, p.fit + 15); }
  S.day++;
  if (S.day > WINDOW_DAYS) closeWindow(S);
}
function aiTransfers(S, rand) {
  const fa = S.players.filter((p) => !p.club);
  const pool = S.players.filter((p) => p.club && p.club !== MY);
  // FA 는 하루 한 번만 정렬(리그가 늘어 FA 가 수천 명이라 구단마다 정렬하면 느림)
  const faList = fa.map((p) => ({ p, o: ovr(p), mv: marketValue(p), b: signBonus(p) })).sort((a, b) => b.o - a.o);
  for (const c of S.clubs) {
    if (c.my) continue; const sq = squad(S, c.id);
    if (sq.length < 20) {   // 모자라면 FA 로 채움(싼 선수부터 형편껏)
      let n = sq.length;
      for (const { p, mv, b: bonus } of faList) { if (n >= 20) break; if (p.club) continue; if (c.budget > bonus * 2 && mv < c.sqVal * 0.25 + 2e5) { p.club = c.id; touch(S); n++; p.contract = 2; p.wage = wageDemand(S, p, c.id); c.budget -= bonus; if (mv > 2e6) news(S, `✍ ${c.name}, 자유 계약 ${p.name} 영입`); } }
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
  if (was === "summer") startCups(S);
  runIdle(S);
}
// 예전 저장(컵 대회 없음): 시즌 전이면 지금 만들고, 시즌 중이면 다음 시즌부터
export function ensureCups(S) {
  if (S.comps) { runIdle(S); return; }
  if (S.phase === "league" && myLeague(S).played > 0) { S.comps = []; S.cal = []; S.calI = 0; news(S, "🏆 컵 대회(FA컵·리그컵·챔피언스리그·유럽연합리그)는 다음 시즌부터 열려요.", "my"); return; }
  if (S.phase === "league") { startCups(S); runIdle(S); }
}

// ---------------------------------------------------------------- 경기 진행
function playRound(S, l, myResult, rand) {
  const md = l.fixtures[l.played]; if (!md) return [];
  const res = [], gate = Math.max(5e3, (l.econ || 2e8) * 0.006);
  for (const f of md) {
    let sc, det = null; const mine = f.h === MY || f.a === MY;
    for (const cid of [f.h, f.a]) fixLineup(S, cid);
    if (mine && myResult) { sc = myResult.score; det = myResult; }
    else sc = quickSim(rating(S, f.h) + 2, rating(S, f.a), S.tactics[f.h], S.tactics[f.a], rand);
    f.motm = recordMatch(S, f, sc, det, rand);
    const H = l.table[f.h], A = l.table[f.a], [gh, ga] = sc; H.p++; A.p++; H.gf += gh; H.ga += ga; A.gf += ga; A.ga += gh;
    if (gh > ga) { H.w++; H.pts += 3; A.l++; } else if (gh < ga) { A.w++; A.pts += 3; H.l++; } else { H.d++; A.d++; H.pts++; A.pts++; }
    f.score = sc; res.push({ ...f, mine });
    finLog(S, f.h, Math.round(gate * (0.6 + (club(S, f.h).rep || 50) / 100) / 1e3) * 1e3, "홈 경기 입장 수입");
    if (gh !== ga) finLog(S, gh > ga ? f.h : f.a, Math.round(gate * 0.3 / 1e3) * 1e3, "승리 수당");
  }
  for (const id of l.clubs) finLog(S, id, -payroll(S, id) * 2, "주급(2주)");
  // 라운드가 지나면: 체력 회복, 부상·정지 줄이기
  for (const id of l.clubs) for (const p of squad(S, id)) recover(p, 1);
  l.played++;
  return res;
}
export function playMatchday(S, myResult = null, rand = Math.random) {
  if (S.phase !== "league") return null;
  const ev = pendingEvent(S);
  if (ev) { const out = runEvent(S, ev, myResult, rand); runIdle(S, rand); return out; }   // 컵 대회 차례
  const L = myLeague(S), R = L.fixtures.length;
  const results = playRound(S, L, myResult, rand);
  for (const l of S.leagues) { if (l === L) continue; const target = Math.floor(L.played * l.fixtures.length / R); while (l.played < target) playRound(S, l, null, rand); }
  const my = results.find((r) => r.mine);
  if (my) { const me = my.h === MY ? 0 : 1, gf = my.score[me], ga = my.score[1 - me], opp = club(S, me === 0 ? my.a : my.h); news(S, `${gf > ga ? "🟢 승리" : gf < ga ? "🔴 패배" : "⚪ 무승부"} ${L.played}R ${club(S, my.h).short} ${my.score[0]}:${my.score[1]} ${club(S, my.a).short} (vs ${opp.name})`, "my"); }
  if (L.played === Math.floor(R / 2)) { S.phase = "winter"; S.day = 1; S.superday = { season: S.season, done: false }; news(S, "❄ 겨울 이적시장이 열렸어요! ⭐ 시즌 중간 슈퍼데이(상위·하위 스플릿 올스타전)도 열려요.", "my"); }
  else if (L.played >= R) { for (const l of S.leagues) while (l.played < l.fixtures.length) playRound(S, l, null, rand); endSeason(S, rand); }
  runIdle(S, rand);
  return { results, league: L.id, title: `${L.name} ${L.played || R}라운드 결과` };
}
// ---------------------------------------------------------------- 선수 기록
export const ST0 = () => ({ apps: 0, g: 0, a: 0, fouls: 0, yc: 0, rc: 0, inj: 0, rat: 0, motm: 0, cs: 0 });
export const st = (p) => (p.st || (p.st = ST0()));
const stL = st;
export const avail = (p) => !(p.inj > 0) && !(p.sus > 0);
export const avgRat = (p) => (p.st && p.st.apps ? p.st.rat / p.st.apps : 0);
export function recover(p, rounds) {
  if (p.fit == null) p.fit = 100;
  for (let k = 0; k < rounds; k++) p.fit = Math.min(100, p.fit + 3 + (100 - p.fit) * 0.4 + ((p.sta || 80) - 80) / 8);   // 지친 만큼 더 회복: 계속 뛰면 체력 80 선수는 약 85, 60 은 약 72, 100 은 약 97 에 머묾
  if (p.inj > 0) { p.inj = Math.max(0, p.inj - rounds); }
  if (p.sus > 0 && p._played) p.sus = Math.max(0, p.sus - 1);
  p._played = false;
}
function pickW(arr, w, rand) { const tot = w.reduce((a, b) => a + b, 0); let r = rand() * tot; for (let i = 0; i < arr.length; i++) { r -= w[i]; if (r <= 0) return arr[i]; } return arr[arr.length - 1]; }
// 한 경기의 기록 남기기. det(직접 뛴 경기) = { scorers, assists, fouls:{id:n}, cards:[{id,type}], energy:{id:0~1} }, 없으면 만들어 냄. 반환: 경기 최우수 선수 id
// kind(컵 대회 "fa"|"lc"|"cl"|"eul")를 주면 기록은 p.cst[kind] 에 따로(리그 득점왕에 섞이지 않게)
export const cst = (p, kind) => { const o = p.cst || (p.cst = {}); return o[kind] || (o[kind] = ST0()); };
export function recordMatch(S, f, sc, det, rand = Math.random, kind = null) {
  const st = kind ? (p) => cst(p, kind) : stL;
  const sides = [f.h, f.a].map((cid, k) => ({ cid, gf: sc[k], ga: sc[1 - k], xi: (S.lineups[cid] || fixLineup(S, cid)).xi.map((id) => player(S, id)).filter(Boolean) }));
  const rat = new Map(), info = (p) => { if (!rat.has(p.id)) rat.set(p.id, 6.3 + (rand() - 0.5) * 1.2); return p; };
  const scorers = det ? det.scorers || [] : [], assists = det ? det.assists || [] : [];
  for (const sd of sides) {
    for (const p of sd.xi) { info(p); const s = st(p); s.apps++; p._played = true; if (!kind) p.apps = s.apps;
      const win = sd.gf > sd.ga ? 0.45 : sd.gf < sd.ga ? -0.35 : 0.05; rat.set(p.id, rat.get(p.id) + win);
      if (p.pos === "GK") { if (sd.ga === 0) { s.cs++; rat.set(p.id, rat.get(p.id) + 0.9); } else rat.set(p.id, rat.get(p.id) - Math.max(0, sd.ga - 1) * 0.35); }
      else if (["CB", "LB", "RB", "DM"].includes(p.pos) && sd.ga === 0) rat.set(p.id, rat.get(p.id) + 0.35);
      // 체력: 뛴 선수는 떨어짐(체력 능력치가 낮을수록 더)
      const e = det && det.energy && det.energy[p.id] != null ? det.energy[p.id] : null;
      const drop = p.pos === "GK" ? 5 : (12 + (100 - (p.sta || 80)) / 6) * (0.8 + rand() * 0.4);   // 골키퍼는 덜 지침
      p.fit = Math.max(40, e != null ? Math.round(Math.max(e, p.pos === "GK" ? 0.9 : 0) * 100) : (p.fit ?? 100) - drop);
    }
    if (!det) {   // 빠른 결과: 골·도움 만들기
      for (let k = 0; k < sd.gf; k++) {
        const w = sd.xi.map((p) => (p.pos === "ST" ? 3.2 : ["LW", "RW"].includes(p.pos) ? 2.4 : p.pos === "AM" ? 2.2 : p.pos === "CM" ? 1.2 : p.pos === "GK" ? 0.01 : 0.5) * Math.pow(p.sho / 90, 2) + (p.hea > 100 ? 0.3 : 0));   // 한 명에게 너무 몰리지 않게
        const g = pickW(sd.xi, w, rand); scorers.push(g.id);
        if (rand() < 0.74) { const cand = sd.xi.filter((p) => p !== g && p.pos !== "GK"); const a = pickW(cand, cand.map((p) => (["AM", "LW", "RW"].includes(p.pos) ? 3 : p.pos === "CM" ? 2.2 : p.pos === "ST" ? 1.6 : 0.8) * (p.pas / 90)), rand); assists.push(a.id); } else assists.push(null);
      }
    }
    // 반칙·경고·퇴장
    const fouls = det && det.fouls ? null : Math.round(8 + rand() * 7);
    if (fouls != null) for (let k = 0; k < fouls; k++) {
      const cand = sd.xi.filter((p) => p.pos !== "GK"); const p = pickW(cand, cand.map((q) => (["CB", "DM", "LB", "RB"].includes(q.pos) ? 2 : ["CM", "ST"].includes(q.pos) ? 1.3 : 0.9) * (q.phy / 90)), rand);
      st(p).fouls++; rat.set(p.id, rat.get(p.id) - 0.05);
      if (rand() < 0.12) { st(p).yc++; p._ycm = (p._ycm || 0) + 1; rat.set(p.id, rat.get(p.id) - 0.25); if (p._ycm >= 2 || rand() < 0.03) { st(p).rc++; p.sus = (p.sus || 0) + 1; rat.set(p.id, rat.get(p.id) - 1); if (sd.cid === MY) news(S, `🟥 퇴장: ${p.name} — 다음 경기 출장 정지`, "my"); } }
    }
    for (const p of sd.xi) { if ((st(p).yc % 5 === 0) && p._ycm && st(p).yc > 0) { p.sus = (p.sus || 0) + 1; if (sd.cid === MY) news(S, `🟨 경고 누적 5장: ${p.name} — 다음 경기 출장 정지`, "my"); } p._ycm = 0; }
    // 부상
    for (const p of sd.xi) if (rand() < 0.011 + (p.fit < 50 ? 0.012 : 0)) { const r = 1 + Math.floor(rand() * rand() * 8); p.inj = r; st(p).inj++; if (sd.cid === MY) news(S, `🚑 부상: ${p.name} — ${r}경기 결장 예상`, "my"); }
  }
  if (det) {   // 직접 뛴 경기: 반칙·카드
    for (const [id, n] of Object.entries(det.fouls || {})) { const p = player(S, id); if (p) { st(p).fouls += n; if (rat.has(id)) rat.set(id, rat.get(id) - 0.05 * n); } }
    for (const c of det.cards || []) { const p = player(S, c.id); if (!p) continue; if (c.type === "yellow") { st(p).yc++; if (st(p).yc % 5 === 0) p.sus = (p.sus || 0) + 1; } else { st(p).rc++; p.sus = (p.sus || 0) + 1; } if (rat.has(c.id)) rat.set(c.id, rat.get(c.id) - (c.type === "red" ? 1 : 0.25)); }
  }
  scorers.forEach((id) => { const p = player(S, id); if (!p) return; st(p).g++; if (!kind) p.sg = st(p).g; if (rat.has(id)) rat.set(id, rat.get(id) + 1); });
  assists.forEach((id) => { if (!id) return; const p = player(S, id); if (!p) return; st(p).a++; if (rat.has(id)) rat.set(id, rat.get(id) + 0.6); });
  let best = null, bv = -1;
  for (const [id, r0] of rat) { const r = Math.max(3.5, Math.min(10, r0)); const p = player(S, id); if (!p) continue; st(p).rat += r; if (r > bv) { bv = r; best = p; } }
  if (best) st(best).motm++;
  return best ? { id: best.id, name: best.name, rat: Math.round(bv * 10) / 10 } : null;
}
// 기록 순위: key = g | a | rat | motm | cs | fouls | yc
export function leaders(S, l, key, n = 10) {
  const set = new Set(l.clubs), minApps = Math.max(1, Math.floor(l.played * 0.4));
  let ps = S.players.filter((p) => p.club && set.has(p.club) && p.st && p.st.apps);
  if (key === "rat") ps = ps.filter((p) => p.st.apps >= minApps);
  if (key === "cs") ps = ps.filter((p) => p.pos === "GK");
  const v = (p) => (key === "rat" ? avgRat(p) : p.st[key] || 0);
  return ps.sort((a, b) => v(b) - v(a) || b.st.apps - a.st.apps).slice(0, n).map((p) => ({ p, v: v(p) }));
}
export function awardsFor(S, l) {
  const set = new Set(l.clubs), minApps = Math.max(1, Math.floor(l.fixtures.length * 0.5));
  const ps = S.players.filter((p) => p.club && set.has(p.club) && p.st && p.st.apps);
  const top = (arr, f) => arr.slice().sort((a, b) => f(b) - f(a))[0] || null;
  const reg = ps.filter((p) => p.st.apps >= minApps);
  return {
    scorer: top(ps, (p) => p.st.g * 100 + p.st.a), assist: top(ps, (p) => p.st.a * 100 + p.st.g),
    mvp: top(reg, (p) => avgRat(p)),
    poy: top(reg, (p) => avgRat(p) * 10 + p.st.g * 1.5 + p.st.a + p.st.motm * 0.8),
    gk: top(reg.filter((p) => p.pos === "GK"), (p) => p.st.cs * 10 + avgRat(p)),
  };
}
// 시즌 중간 슈퍼데이: 우리 리그 상위 스플릿(위쪽 절반) 올스타 vs 하위 스플릿 올스타 — 리그 순위에는 영향 없음
export function superdayTeams(S) {
  const l = myLeague(S), tab = standings(S, l), half = Math.ceil(tab.length / 2);
  const mk = (rows, name, short, c1, c2) => {
    const pool = rows.flatMap((r) => squad(S, r.c.id)).filter(avail).sort((a, b) => ovr(b) - ovr(a));
    const slots = FORMATIONS["4-3-3"], used = new Set(), per = {}, xi = [];
    for (const [pos] of slots) { const best = pool.filter((p) => !used.has(p.id) && (per[p.club] || 0) < 2).sort((a, b) => fitOvrLocal(b, pos) - fitOvrLocal(a, pos))[0]; if (best) { used.add(best.id); per[best.club] = (per[best.club] || 0) + 1; xi.push(best); } }
    return { name, short, c1, c2, formation: "4-3-3", tactic: { ...DEFAULT_TACTIC, mentality: 70, tempo: 70 }, players: xi, clubs: rows.map((r) => r.c.id) };
  };
  return [mk(tab.slice(0, half), "상위 스플릿 올스타", "TOP", "#ffd34a", "#7a4b00"), mk(tab.slice(half), "하위 스플릿 올스타", "BOT", "#c9d3e0", "#1d2a3a")];
}
function fitOvrLocal(p, pos) { return p.pos === pos ? ovr(p) : pos === "GK" || p.pos === "GK" ? 0 : ovr(p, pos) * 0.92; }
export function finishSuperday(S, score, mvp) {
  const [A, B] = superdayTeams(S); S.superday = { ...(S.superday || {}), done: true, score, mvp };
  S.superdays = S.superdays || []; S.superdays.unshift({ season: seasonLabel(S), league: myLeague(S).name, score, mvp });
  news(S, `⭐ 슈퍼데이: ${A.name} ${score[0]} : ${score[1]} ${B.name}${mvp ? ` · MVP ${mvp}` : ""}`, "my");
}
export function editClub(S, o) {
  const c = club(S, MY); for (const k of ["name", "short", "c1", "c2", "coach", "stadium"]) if (o[k] != null && o[k] !== "") c[k] = k === "short" ? String(o[k]).slice(0, 3).toUpperCase() : o[k];
}

function pickScorers(S, cid, n, rand) {
  const lu = S.lineups[cid] || fixLineup(S, cid); const xi = lu.xi.map((id) => player(S, id)).filter(Boolean);
  const w = xi.map((p) => (p.pos === "ST" ? 5 : ["LW", "RW", "AM"].includes(p.pos) ? 3 : p.pos === "CM" ? 1.5 : 0.4) * (p.sho / 90) + (p.hea > 100 ? 0.4 : 0));
  const tot = w.reduce((a, b) => a + b, 0); const out = [];
  for (let k = 0; k < n; k++) { let r = rand() * tot; for (let i = 0; i < xi.length; i++) { r -= w[i]; if (r <= 0) { out.push(xi[i].id); break; } } }
  return out;
}
const brief = (c) => (c ? { id: c.id, name: c.name, short: c.short, c1: c.c1, c2: c.c2 } : null);
const pBrief = (S, p, n) => (p ? { name: p.name, club: club(S, p.club) ? club(S, p.club).name : "", n } : null);
// 상금 비율(리그 경제 규모 × 비율): 순위 배당금(1위 8% → 꼴찌 1.6%) + 1~3위 상금 + 득점왕·도움왕 상금(구단에)
export const LEAGUE_PRIZE = { podium: [0.10, 0.06, 0.035], scorer: 0.012, assist: 0.008 };
function endSeason(S, rand) {
  finishAll(S, rand);   // 혹시 남은 컵 경기
  const label = seasonLabel(S), myL = myLeague(S), end = { season: label, leagues: [], comps: [] };
  for (const l of S.leagues) {
    const tab = standings(S, l), E = l.econ || 2e8, base = E * 0.08, r4 = (v) => Math.round(v / 1e4) * 1e4;
    tab.forEach((row, i) => { finLog(S, row.c.id, r4(base * (1 - i / tab.length * 0.8)), `${label} ${l.name} ${i + 1}위 배당 상금`); row.c.rep = Math.max(15, Math.min(98, (row.c.rep || 50) + (tab.length / 2 - i) * 0.6)); });
    ["우승", "준우승", "3위"].forEach((w, i) => { if (tab[i]) finLog(S, tab[i].c.id, r4(E * LEAGUE_PRIZE.podium[i]), `${l.name} ${w} 상금`, "prize"); });
    const aw = awardsFor(S, l);
    if (aw.scorer) finLog(S, aw.scorer.club, r4(E * LEAGUE_PRIZE.scorer), `${l.name} 득점왕 상금 (${aw.scorer.name})`, "prize");
    if (aw.assist) finLog(S, aw.assist.club, r4(E * LEAGUE_PRIZE.assist), `${l.name} 도움왕 상금 (${aw.assist.name})`, "prize");
    end.leagues.push({ id: l.id, name: l.name, country: l.country, flag: flagOfCountry(l.country), tier: l.tier, podium: tab.slice(0, 3).map((r) => brief(r.c)),
      scorer: aw.scorer && pBrief(S, aw.scorer, aw.scorer.st.g), assist: aw.assist && pBrief(S, aw.assist, aw.assist.st.a), mvp: aw.mvp && pBrief(S, aw.mvp, +avgRat(aw.mvp).toFixed(2)) });
    S.lastRank = S.lastRank || {}; S.lastRank[l.id] = tab.map((r) => r.c.id);   // 다음 시즌 유럽 대회 출전권
  }
  for (const c of S.comps || []) end.comps.push({ id: c.id, kind: c.kind, name: c.name, icon: c.icon, country: c.country || null, flag: c.country ? flagOfCountry(c.country) : "", podium: c.podium.map((id) => brief(club(S, id))), scorer: compScorer(S, c), my: c.myIn ? c.myRes || "" : null });
  const cl = comp(S, "cl"), eul = comp(S, "eul"); S.lastEuro = { cl: cl && cl.podium[0], eul: eul && eul.podium[0] };
  const myTab = standings(S, myL), myRank = myTab.findIndex((r) => r.c.id === MY) + 1;
  { const t = myL.table[MY]; end.my = { ...brief(club(S, MY)), league: myL.name, flag: flagOfCountry(myL.country), rank: myRank, n: myTab.length, pts: t.pts, w: t.w, d: t.d, l: t.l, gf: t.gf, ga: t.ga,
      trophies: [...(myRank === 1 ? [`${myL.name} 우승`] : []), ...(S.comps || []).filter((c) => c.podium[0] === MY).map((c) => `${c.name} 우승`)] }; }
  const top = S.players.filter((p) => p.club && myL.clubs.includes(p.club)).sort((a, b) => (b.sg || 0) - (a.sg || 0))[0];
  // 시상(우리 리그)
  const aw = awardsFor(S, myL), nm = (p, extra) => (p ? { id: p.id, name: p.name, club: club(S, p.club) ? club(S, p.club).name : "", extra } : null);
  S.awards = S.awards || [];
  S.awards.unshift({ season: label, league: myL.name, scorer: nm(aw.scorer, aw.scorer && aw.scorer.st.g + "골"), assist: nm(aw.assist, aw.assist && aw.assist.st.a + "도움"), mvp: nm(aw.mvp, aw.mvp && avgRat(aw.mvp).toFixed(2) + "점"), poy: nm(aw.poy, aw.poy && `${aw.poy.st.g}골 ${aw.poy.st.a}도움`), gk: nm(aw.gk, aw.gk && aw.gk.st.cs + "클린시트") });
  const A0 = S.awards[0]; news(S, `🏅 ${label} ${myL.name} 시상 — 올해의 선수 ${A0.poy ? A0.poy.name : "-"} · MVP ${A0.mvp ? A0.mvp.name : "-"} · 득점왕 ${A0.scorer ? A0.scorer.name + " " + A0.scorer.extra : "-"} · 도움왕 ${A0.assist ? A0.assist.name + " " + A0.assist.extra : "-"} · 골키퍼상 ${A0.gk ? A0.gk.name : "-"}`, "my");
  // 선수 통산 기록에 더하기
  for (const p of S.players) if (p.st && p.st.apps) { const c = p.car || (p.car = { apps: 0, g: 0, a: 0 }); c.apps += p.st.apps; c.g += p.st.g; c.a += p.st.a; }
  // 승강
  const moves = promoteRelegate(S);
  const myMove = moves.find((m) => m.id === MY);
  S.history.unshift({ season: label, league: myL.name, champion: myTab[0].c.name, myRank, myPts: myL.table[MY].pts, topScorer: top ? `${top.name} ${top.sg}골` : "", move: myMove ? myMove.kind : "" });
  end.my.move = myMove ? myMove.kind : "";
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
  // 시즌 엔딩(한눈에 보기) 저장 → 화면이 결과 창 뒤에 띄움
  end.my.earn = { ...(S.earn || {}) }; end.my.budget = club(S, MY).budget;
  S.endings = S.endings || []; S.endings.unshift(end); if (S.endings.length > 6) S.endings.length = 6; S.endingNew = true; S.earn = {};
  S.season++; S.year++; S.phase = "fa"; S.day = 1;
  const r = rng(S.seed + S.season); for (const l of S.leagues) setupLeague(S, l, r);
  for (const p of S.players) { p.sg = 0; p.apps = 0; p.st = null; p.cst = null; p.sus = 0; p.fit = 100; }
  S.superday = null;
  news(S, `📋 FA 이적시장이 열렸어요 — 계약이 끝난 선수들을 잡을 수 있어요.`, "my");
  for (const c of S.clubs) fixLineup(S, c.id);
}
const RESERVE = / (B|II|U21|U23|Juniors|Amateure( OÖ)?|Reserves|Castilla)$| B$|Young Violets|Liefering/;
function promoteRelegate(S) {
  const moves = []; const byC = {};
  for (const l of S.leagues) (byC[l.country] = byC[l.country] || []).push(l);
  for (const [country, ls] of Object.entries(byC)) {
    const rule = PROMO[country]; if (!rule) continue;
    for (const [hiTier, n] of [[1, rule[0]], [2, rule[1]]]) { if (!n) continue;
      const hi = ls.filter((l) => l.tier === hiTier), lo = ls.filter((l) => l.tier === hiTier + 1); if (!hi.length || !lo.length) continue;
      const H = hi[0]; const down = standings(S, H).slice(-n).map((r) => r.c.id);
      // 아래 리그가 여러 조면 조마다 나눠서 올림
      // 조가 올라갈 팀 수보다 많으면(오스트리아 3부 4개 조 등) 조 1위 중 승점률 높은 팀부터
      const per = Math.ceil(n / lo.length); let up = [];
      // 2군(B·II·U21·Juniors 등)은 승격하지 않음 — 다음 순위 팀이 올라감
      lo.forEach((L) => up.push(...standings(S, L).filter((r) => !RESERVE.test(r.c.en || r.c.name)).slice(0, per).map((r, k) => ({ id: r.c.id, from: L, k, ppg: r.pts / Math.max(1, r.p) }))));
      up = up.sort((x, y) => x.k - y.k || y.ppg - x.ppg).slice(0, n);
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

// ---------------------------------------------------------------- 저장: 칸 3개, gzip 으로 줄여 localStorage 에(실제 리그 2MB → 약 0.3MB)
const KEEP = ["id", "name", "nat", "age", "pos", ...AKEYS, "pot", "club", "contract", "value", "wage", "face", "sg", "apps", "num", "lastClub", "st", "cst", "car", "fit", "inj", "sus"];
export const SLOTS = [1, 2, 3];
const slotKey = (n) => `pureday-fc-slot${n}`;
function slim(S) { const o = { ...S, players: S.players.map((p) => { const q = {}; for (const k of KEEP) if (p[k] != null) q[k] = p[k]; return q; }) }; delete o._ver; return o; }
async function gz(str) {
  if (typeof CompressionStream === "undefined") return "J" + str;
  const cs = new Blob([str]).stream().pipeThrough(new CompressionStream("gzip")); const buf = new Uint8Array(await new Response(cs).arrayBuffer());
  let bin = ""; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000)); return "G" + btoa(bin);
}
async function ungz(s) {
  if (s[0] === "J") return s.slice(1); if (s[0] !== "G") return s;
  const bin = atob(s.slice(1)), buf = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  const ds = new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip")); return await new Response(ds).text();
}
let saving = Promise.resolve();
export function save(S) {
  const slot = S.slot || 1, data = slim(S);
  const meta = { slot, name: club(S, MY).name, league: myLeague(S).name, season: seasonLabel(S), phase: S.phase, saved: Date.now(), mode: S.mode, cloud: S.cloud ? S.cloud.code : "" };
  saving = saving.then(async () => { try { const z = await gz(JSON.stringify(data)); localStorage.setItem(slotKey(slot), z); localStorage.setItem(slotKey(slot) + "-meta", JSON.stringify(meta)); localStorage.setItem("pureday-fc-cur", String(slot)); if (S.cloud) cloudQueue(S, z, meta); } catch (e) { console.warn("저장 실패", e); } });
  return true;
}
export function slotMeta(n) { try { return JSON.parse(localStorage.getItem(slotKey(n) + "-meta") || "null"); } catch (e) { return null; } }
export function currentSlot() { const n = +(localStorage.getItem("pureday-fc-cur") || 0); return SLOTS.includes(n) ? n : 0; }
export async function loadSlot(n) { try { const s = localStorage.getItem(slotKey(n)); if (!s) return null; const S = JSON.parse(await ungz(s)); S.slot = n; const rv = JSON.parse(localStorage.getItem(slotKey(n) + "-rev") || "null"); if (S.cloud && rv && rv.code === S.cloud.code) S.cloud.rev = Math.max(S.cloud.rev, rv.rev); ensureCups(S); return S; } catch (e) { console.warn("불러오기 실패", e); return null; } }
export function deleteSlot(n) { try { localStorage.removeItem(slotKey(n)); localStorage.removeItem(slotKey(n) + "-meta"); localStorage.removeItem(slotKey(n) + "-rev"); if (currentSlot() === n) localStorage.removeItem("pureday-fc-cur"); } catch (e) {} }
export function freeSlot() { return SLOTS.find((n) => !slotMeta(n)) || 0; }
// 예전 저장(pureday-fc-v3, 한 칸) → 1번 칸으로 옮김
export async function migrateOld() { try { const s = localStorage.getItem("pureday-fc-v3"); if (s && !slotMeta(1)) { const S = JSON.parse(s); S.slot = 1; save(S); await saving; } if (s) localStorage.removeItem("pureday-fc-v3"); localStorage.removeItem("pureday-fc-v1"); } catch (e) {} }
export async function flush() { await saving; }

// ---------------------------------------------------------------- 클라우드 저장: 저장 코드(8자)로 서버에 올려 핸드폰·PC 어디서든 이어하기
// S.cloud = { code, rev } — rev 는 이 기기가 마지막으로 올리거나 받은 판. 서버: worker/src/index.js 의 Save
export const CLOUD = (globalThis.localStorage && localStorage.getItem("pureday-fc-cloud-dev")) || "https://pureday-fc.godpainter.workers.dev";   // 시험 땐 로컬 서버 주소를 넣음
const CODE_A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const cloud = { state: "", at: 0, conflict: null, onChange: null };   // state: ""|"wait"|"up"|"ok"|"off"|"conflict"
const setCloud = (st, extra = {}) => { Object.assign(cloud, { state: st }, extra); if (cloud.onChange) cloud.onChange(); };
export const fmtCode = (c) => (c ? c.slice(0, 4) + "-" + c.slice(4) : "");
export const cleanCode = (s) => { const c = String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); return /^[A-HJ-NP-Z2-9]{8}$/.test(c) ? c : ""; };
let upT = 0, upNext = null, upBusy = false;
function cloudQueue(S, z, meta) { upNext = { S, z, meta }; setCloud("wait"); clearTimeout(upT); upT = setTimeout(cloudUpload, 3000); }
async function cloudUpload(force) {
  clearTimeout(upT); if (upBusy || !upNext) return; const { S, z, meta } = upNext; upNext = null; upBusy = true; setCloud("up");
  try {
    const r = await fetch(`${CLOUD}/save/${S.cloud.code}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ meta, data: z, base: force != null ? force : S.cloud.rev }) });
    const j = await r.json();
    if (r.status === 409) { upNext = upNext || { S, z, meta }; setCloud("conflict", { conflict: j.meta }); }
    else if (!r.ok) throw new Error(j.error || r.status);
    else { S.cloud.rev = j.meta.rev; patchRev(meta.slot, S.cloud); setCloud("ok", { at: j.meta.at }); }
  } catch (e) { console.warn("클라우드 저장 실패", e); upNext = upNext || { S, z, meta }; setCloud("off"); upT = setTimeout(cloudUpload, 20000); }
  upBusy = false; if (upNext && cloud.state !== "conflict" && cloud.state !== "off") cloudUpload();
}
// 올린 뒤 rev 가 바뀌었으니 이 칸의 저장 자료 속 S.cloud.rev 도 맞춰 둔다(다음에 열 때 충돌로 오해하지 않게)
function patchRev(slot, c) { try { localStorage.setItem(slotKey(slot) + "-rev", JSON.stringify(c)); } catch (e) {} }
export function cloudFlush() { if (upNext && !upBusy) cloudUpload(); }
export function cloudPending() { return !!upNext || upBusy; }
// 충돌 때: "mine" = 이 기기 기록으로 덮어쓰기, 그 밖엔 대기열만 비움
export function cloudResolve(how) { if (how === "mine" && upNext && cloud.conflict) { const base = cloud.conflict.rev; setCloud("wait", { conflict: null }); cloudUpload(base); } else { upNext = null; setCloud("", { conflict: null }); } }
// 클라우드 저장 켜기: 새 코드를 만들어 지금 커리어를 올린다
export async function cloudEnable(S) {
  for (let k = 0; k < 4; k++) {
    let code = ""; const rnd = crypto.getRandomValues(new Uint8Array(8)); for (const x of rnd) code += CODE_A[x % 32];
    const r = await fetch(`${CLOUD}/save/${code}?meta=1`); if (r.status !== 404) continue;
    S.cloud = { code, rev: 0 }; save(S); await saving; clearTimeout(upT); await cloudUpload(); if (cloud.state === "ok") return code; clearTimeout(upT); upNext = null; S.cloud = null; setCloud(""); save(S); throw new Error("올리지 못했어요");
  }
  throw new Error("코드를 만들지 못했어요");
}
export function cloudDisable(S) { S.cloud = null; upNext = null; setCloud(""); save(S); }
export async function cloudMeta(code) { const r = await fetch(`${CLOUD}/save/${code}?meta=1`); if (r.status === 404) return null; if (!r.ok) throw new Error("서버 " + r.status); return (await r.json()).meta; }
// 코드로 받아 slot 칸에 넣고 커리어를 돌려준다
export async function cloudLoad(code, slot) {
  const r = await fetch(`${CLOUD}/save/${code}`); if (r.status === 404) return null; if (!r.ok) throw new Error("서버 " + r.status);
  const { meta, data } = await r.json(); const S = JSON.parse(await ungz(data));
  S.slot = slot; S.cloud = { code, rev: meta.rev }; ensureCups(S); upNext = null; setCloud("ok", { at: meta.at, conflict: null });
  const z = await gz(JSON.stringify(slim(S))); localStorage.setItem(slotKey(slot), z);
  localStorage.setItem(slotKey(slot) + "-meta", JSON.stringify({ ...meta, slot, cloud: code })); localStorage.setItem("pureday-fc-cur", String(slot)); patchRev(slot, S.cloud);
  return S;
}
export function load() { return null; }
export function wipe(n) { deleteSlot(n || 1); }
export { ovr, marketValue, wageOf, money, COUNTRY };
