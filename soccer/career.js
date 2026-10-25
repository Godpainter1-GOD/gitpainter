// 퓨어데이 FC — 커리어(구단 운영): 뉴팀 창단 → 마이 팀, 운영비, 여름·겨울·FA 이적시장, 트레이드, 리그 18라운드
import { makeWorld, makeStarterSquad, ovr, marketValue, wageOf, money, autoLineup, teamRating, FORMATIONS, DEFAULT_TACTIC, POS, rng } from "./data.js?v=2";
import { quickSim } from "./engine.js?v=2";

export const MY = "my";
export const WINDOW_DAYS = 5;
export const PHASE_KO = { summer: "여름 이적시장", winter: "겨울 이적시장", fa: "FA 이적시장", league: "리그 진행 중", done: "시즌 끝" };
const START_BUDGET = 40e6;
const MD_TOTAL = 18, WINTER_AFTER = 9;

// ---------------------------------------------------------------- 만들기
export function newCareer({ name, short, c1, c2, seed = Date.now() % 1e9 }) {
  const w = makeWorld(20261025);
  const st = makeStarterSquad(seed, w.nextId);
  const my = { id: MY, name: name || "뉴팀 FC", short: (short || "NEW").slice(0, 3).toUpperCase(), c1: c1 || "#ffd34a", c2: c2 || "#1b2a4a", rep: 50, budget: START_BUDGET, my: true };
  st.players.forEach((p) => { p.club = MY; });
  const S = {
    v: 1, seed, season: 1, year: 2026, phase: "summer", day: 1, md: 0,
    clubs: [my, ...w.clubs], players: [...w.players, ...st.players], nextId: st.nextId,
    tactics: {}, lineups: {}, listed: [], offers: [], news: [], fin: [], table: {}, fixtures: [], history: [],
    created: Date.now(),
  };
  const r = rng(seed);
  const forms = Object.keys(FORMATIONS);
  for (const c of S.clubs) S.tactics[c.id] = c.my ? { ...DEFAULT_TACTIC } : { formation: forms[Math.floor(r() * forms.length)], mentality: Math.floor(r() * 3), press: Math.floor(r() * 3), width: 1, passing: Math.floor(r() * 3) };
  S.fixtures = makeFixtures(S.clubs.map((c) => c.id), r);
  resetTable(S);
  news(S, `🏟 ${my.name} 창단! 운영비 ${money(my.budget)}로 시작해요. 여름 이적시장이 열렸어요.`);
  fixLineup(S, MY);
  return S;
}
function makeFixtures(ids, r) {   // 원형 방식 더블 라운드로빈 (홈·원정)
  const n = ids.length, arr = ids.slice(), rounds = [];
  for (let k = 0; k < n - 1; k++) {
    const md = []; for (let i = 0; i < n / 2; i++) { const a = arr[i], b = arr[n - 1 - i]; md.push(k % 2 ? { h: a, a: b } : { h: b, a: a }); }
    rounds.push(md); arr.splice(1, 0, arr.pop());
  }
  const second = rounds.map((md) => md.map((f) => ({ h: f.a, a: f.h })));
  return [...rounds, ...second];
}
function resetTable(S) { S.table = {}; for (const c of S.clubs) S.table[c.id] = { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }; for (const p of S.players) { p.sg = 0; p.apps = 0; } }

// ---------------------------------------------------------------- 도우미
export const club = (S, id) => S.clubs.find((c) => c.id === id);
export const squad = (S, id) => S.players.filter((p) => p.club === id);
export const player = (S, id) => S.players.find((p) => p.id === id);
export const payroll = (S, id) => squad(S, id).reduce((s, p) => s + (p.wage || wageOf(p)), 0);
export const windowOpen = (S) => S.phase === "summer" || S.phase === "winter" || S.phase === "fa";
export function news(S, text, kind = "info") { S.news.unshift({ text, kind, season: S.season, md: S.md, phase: S.phase }); if (S.news.length > 120) S.news.length = 120; }
function finLog(S, cid, amount, what) { if (cid === MY) { S.fin.unshift({ amount, what, season: S.season, md: S.md }); if (S.fin.length > 80) S.fin.length = 80; } club(S, cid).budget += amount; }
export function seasonLabel(S) { return `${S.year}/${String((S.year + 1) % 100).padStart(2, "0")}`; }
export function standings(S) {
  return S.clubs.map((c) => ({ c, ...S.table[c.id] })).sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf);
}
export function fixLineup(S, cid) {
  const sq = squad(S, cid), t = S.tactics[cid], cur = S.lineups[cid];
  const ok = cur && cur.formation === t.formation && cur.xi.every((id) => id && sq.some((p) => p.id === id));
  if (!ok) S.lineups[cid] = { ...autoLineup(sq, t.formation), formation: t.formation };
  else S.lineups[cid].bench = cur.bench.filter((id) => sq.some((p) => p.id === id));
  return S.lineups[cid];
}
export function rating(S, cid) { const lu = fixLineup(S, cid); return teamRating(squad(S, cid), lu, S.tactics[cid].formation).ovr; }
export function nextFixture(S) { if (S.phase !== "league") return null; const md = S.fixtures[S.md]; return md && md.find((f) => f.h === MY || f.a === MY); }
export function phaseInfo(S) {
  if (S.phase === "league") return `${S.md + 1}라운드 / ${MD_TOTAL}` + (S.md < WINTER_AFTER ? ` · 겨울 이적시장까지 ${WINTER_AFTER - S.md}경기` : "");
  if (windowOpen(S)) return `${PHASE_KO[S.phase]} ${S.day}일째 / ${WINDOW_DAYS}일`;
  return PHASE_KO[S.phase];
}

// ---------------------------------------------------------------- 이적시장: 사기·팔기·트레이드
function importance(S, p) {
  if (!p.club) return 0;
  const sq = squad(S, p.club).sort((a, b) => ovr(b) - ovr(a)); const k = sq.indexOf(p);
  return k < 3 ? 0.35 : k < 11 ? 0.15 : 0;
}
export function askingPrice(S, p) { return p.club ? Math.round(marketValue(p) * (1.12 + importance(S, p)) / 25e3) * 25e3 : 0; }
export function wageDemand(S, p, buyer = MY) {
  const from = p.club ? club(S, p.club).rep : 50, to = club(S, buyer).rep;
  return Math.round(wageOf(p) * (1.05 + Math.max(0, from - to) / 120) / 500) * 500;
}
// 내 제안: fee(이적료) + swaps(내 선수 id 배열, 트레이드). 결과 {ok, result, counter, msg}
export function makeOffer(S, pid, fee, swaps = []) {
  const p = player(S, pid), me = club(S, MY);
  if (!windowOpen(S)) return { ok: false, msg: "이적시장이 닫혀 있어요." };
  if (!p || p.club === MY) return { ok: false, msg: "살 수 없는 선수예요." };
  const sellerId = p.club;
  if (!sellerId) return signFA(S, pid);
  const seller = club(S, sellerId);
  const mySq = squad(S, MY), theirSq = squad(S, sellerId);
  if (mySq.length - swaps.length + 1 > 32) return { ok: false, msg: "선수단이 너무 많아요(최대 32명)." };
  if (theirSq.length - 1 + swaps.length < 16) return { ok: false, msg: `${seller.name}은 선수가 모자라 팔 수 없대요.` };
  if (fee > me.budget) return { ok: false, msg: `운영비가 모자라요. (남은 운영비 ${money(me.budget)})` };
  const ask = askingPrice(S, p);
  const avg = theirSq.reduce((s, q) => s + ovr(q), 0) / theirSq.length;
  const swapVal = swaps.map((id) => player(S, id)).reduce((s, q) => s + marketValue(q) * (ovr(q) >= avg - 4 ? 0.9 : 0.5), 0);
  const total = fee + swapVal;
  if (total >= ask) { doTransfer(S, p, MY, fee, swaps); return { ok: true, result: "accept", msg: `${seller.name}이(가) 제안을 받아들였어요! ${p.name} 영입.` }; }
  if (total >= ask * 0.78) { const counter = Math.max(0, Math.ceil((ask - swapVal) / 25e3) * 25e3); return { ok: false, result: "counter", counter, msg: `${seller.name}: "${money(counter)}${swaps.length ? " + 제안한 선수" : ""}면 보낼게요."` }; }
  return { ok: false, result: "reject", msg: `${seller.name}이(가) 거절했어요. (원하는 가치 약 ${money(ask)})` };
}
export function signFA(S, pid) {
  const p = player(S, pid), me = club(S, MY);
  if (!windowOpen(S)) return { ok: false, msg: "이적시장이 닫혀 있어요." };
  const bonus = Math.round(marketValue(p) * 0.12 / 25e3) * 25e3;
  if (bonus > me.budget) return { ok: false, msg: `계약금 ${money(bonus)}이 모자라요.` };
  if (squad(S, MY).length >= 32) return { ok: false, msg: "선수단이 너무 많아요(최대 32명)." };
  p.club = MY; p.contract = 2; p.wage = wageDemand(S, p); finLog(S, MY, -bonus, `FA 계약금 ${p.name}`);
  news(S, `✍ ${me.name}, 자유 계약 ${p.name}(${p.pos}, ${ovr(p)}) 영입 — 계약금 ${money(bonus)}`, "my");
  fixLineup(S, MY);
  return { ok: true, result: "accept", msg: `${p.name}와(과) 계약했어요! 계약금 ${money(bonus)}` };
}
function doTransfer(S, p, buyerId, fee, swaps = []) {
  const sellerId = p.club, buyer = club(S, buyerId), seller = club(S, sellerId);
  finLog(S, buyerId, -fee, `이적료 ${p.name}`); finLog(S, sellerId, fee, `이적료 ${p.name}`);
  p.club = buyerId; p.contract = 3; p.wage = wageDemand(S, p, buyerId);
  for (const id of swaps) { const q = player(S, id); q.club = sellerId; q.contract = Math.max(q.contract, 2); S.listed = S.listed.filter((x) => x !== id); }
  S.listed = S.listed.filter((x) => x !== p.id);
  const sw = swaps.length ? ` + ${swaps.map((id) => player(S, id).name).join(", ")}` : "";
  news(S, `🔁 ${p.name}(${p.pos}, ${ovr(p)}) ${seller.name} → ${buyer.name}, ${money(fee)}${sw}`, buyerId === MY || sellerId === MY ? "my" : "info");
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
  if (squad(S, MY).length <= 16) return { msg: "선수가 16명보다 적어지면 안 돼요." };
  const pay = Math.round((p.wage || wageOf(p)) * 36 * Math.max(1, p.contract) * 0.5 / 1000) * 1000;
  finLog(S, MY, -pay, `계약 해지 ${p.name}`); p.club = null; p.contract = 0; S.listed = S.listed.filter((x) => x !== pid);
  news(S, `📤 ${p.name}과(와) 계약을 해지했어요 — 위약금 ${money(pay)}`, "my"); fixLineup(S, MY);
  return { msg: `${p.name} 방출 — 위약금 ${money(pay)}` };
}
export function extend(S, pid) {
  const p = player(S, pid); if (!p || p.club !== MY) return;
  if (p.age >= 34) return { msg: `${p.name}: "이제 은퇴를 생각하고 있어요."` };
  p.contract += 2; p.wage = Math.round(Math.max(p.wage || 0, wageOf(p)) * 1.1 / 500) * 500;
  return { msg: `${p.name} 재계약! 남은 계약 ${p.contract}시즌, 주급 ${money(p.wage)}` };
}

// ---------------------------------------------------------------- 하루 넘기기(이적시장)
export function advanceDay(S, rand = Math.random) {
  if (!windowOpen(S)) return;
  aiTransfers(S, rand);
  // 이적 명단에 올린 내 선수에게 제안
  for (const pid of S.listed) {
    const p = player(S, pid); if (!p || p.club !== MY || rand() > 0.55) continue;
    const buyers = S.clubs.filter((c) => !c.my && c.budget > marketValue(p) * 0.8 && squad(S, c.id).length < 30);
    if (!buyers.length) continue;
    const b = buyers[Math.floor(rand() * buyers.length)], fee = Math.round(marketValue(p) * (0.75 + rand() * 0.45) / 25e3) * 25e3;
    if (!S.offers.some((o) => o.pid === pid && o.from === b.id)) { S.offers.push({ pid, from: b.id, fee }); news(S, `📨 ${b.name}이(가) ${p.name}에게 ${money(fee)} 제안`, "my"); }
  }
  S.day++;
  if (S.day > WINDOW_DAYS) closeWindow(S, rand);
}
function aiTransfers(S, rand) {
  const ai = S.clubs.filter((c) => !c.my);
  for (const c of ai) {
    const sq = squad(S, c.id);
    // 선수가 모자라면 FA 로 채우기
    if (sq.length < 20) {
      const fa = S.players.filter((p) => !p.club).sort((a, b) => ovr(b) - ovr(a));
      for (const p of fa) { if (squad(S, c.id).length >= 20) break; const bonus = marketValue(p) * 0.12; if (c.budget > bonus * 2) { p.club = c.id; p.contract = 2; p.wage = wageDemand(S, p, c.id); c.budget -= bonus; news(S, `✍ ${c.name}, 자유 계약 ${p.name} 영입`); } }
    }
    if (rand() > 0.5) continue;
    // 가장 약한 자리를 보강: 다른 구단(내 팀 제외)·FA 에서 우리 평균보다 나은 선수
    const avg = sq.reduce((s, p) => s + ovr(p), 0) / Math.max(1, sq.length);
    const cand = S.players.filter((p) => p.club !== c.id && p.club !== MY && ovr(p) > avg + 1 && ovr(p) < avg + 9);
    if (!cand.length) continue;
    const p = cand[Math.floor(rand() * cand.length)];
    if (!p.club) { const bonus = marketValue(p) * 0.12; if (c.budget > bonus * 3 && squad(S, c.id).length < 28) { p.club = c.id; p.contract = 2; p.wage = wageDemand(S, p, c.id); c.budget -= bonus; news(S, `✍ ${c.name}, 자유 계약 ${p.name}(${ovr(p)}) 영입`); } continue; }
    const ask = askingPrice(S, p);
    if (c.budget > ask * 1.15 && squad(S, p.club).length > 18 && squad(S, c.id).length < 28) doTransfer(S, p, c.id, ask);
  }
}
function closeWindow(S, rand) {
  const was = S.phase; S.offers = [];
  if (was === "fa") { S.phase = "summer"; S.day = 1; news(S, `☀ ${seasonLabel(S)} 여름 이적시장이 열렸어요.`); return; }
  S.phase = "league"; S.day = 0;
  news(S, was === "summer" ? `⚽ ${seasonLabel(S)} 시즌 개막! 여름 이적시장이 닫혔어요.` : "❄ 겨울 이적시장이 닫혔어요. 후반기 시작!");
  for (const c of S.clubs) fixLineup(S, c.id);
}

// ---------------------------------------------------------------- 경기 진행
// myScore: 내 경기를 직접 뛰었으면 [홈 골, 원정 골] 과 득점자 id 목록, 아니면 null(빠른 진행)
export function playMatchday(S, myResult = null, rand = Math.random) {
  if (S.phase !== "league") return null;
  const md = S.fixtures[S.md]; const results = [];
  for (const f of md) {
    let sc, scorers = [];
    const mine = f.h === MY || f.a === MY;
    if (mine && myResult) { sc = myResult.score; scorers = myResult.scorers || []; }
    else {
      sc = quickSim(rating(S, f.h) + 2, rating(S, f.a), S.tactics[f.h], S.tactics[f.a], rand);   // 홈 이점 +2
      scorers = [...pickScorers(S, f.h, sc[0], rand), ...pickScorers(S, f.a, sc[1], rand)];
    }
    for (const id of scorers) { const p = player(S, id); if (p) p.sg = (p.sg || 0) + 1; }
    for (const cid of [f.h, f.a]) for (const id of S.lineups[cid] ? S.lineups[cid].xi : []) { const p = player(S, id); if (p) p.apps = (p.apps || 0) + 1; }
    applyResult(S, f.h, f.a, sc[0], sc[1]);
    f.score = sc; results.push({ ...f, mine });
  }
  // 돈: 주급(2주), 홈 경기 입장 수입, 승리 수당
  for (const c of S.clubs) finLog(S, c.id, -payroll(S, c.id) * 2, "주급(2주)");
  for (const f of md) {
    const h = club(S, f.h); finLog(S, f.h, Math.round((0.3e6 + h.rep * 0.015e6) / 1e4) * 1e4, "홈 경기 입장 수입");
    if (f.score[0] > f.score[1]) finLog(S, f.h, 0.4e6, "승리 수당"); else if (f.score[1] > f.score[0]) finLog(S, f.a, 0.4e6, "승리 수당");
  }
  const my = results.find((r) => r.mine);
  if (my) { const me = my.h === MY ? 0 : 1, gf = my.score[me], ga = my.score[1 - me], opp = club(S, me === 0 ? my.a : my.h);
    news(S, `${gf > ga ? "🟢 승리" : gf < ga ? "🔴 패배" : "⚪ 무승부"} ${S.md + 1}R ${club(S, my.h).short} ${my.score[0]}:${my.score[1]} ${club(S, my.a).short} (vs ${opp.name})`, "my"); }
  S.md++;
  if (S.md === WINTER_AFTER) { S.phase = "winter"; S.day = 1; news(S, "❄ 겨울 이적시장이 열렸어요!"); }
  else if (S.md >= MD_TOTAL) endSeason(S, rand);
  return results;
}
function pickScorers(S, cid, n, rand) {
  const lu = S.lineups[cid] || fixLineup(S, cid); const xi = lu.xi.map((id) => player(S, id)).filter(Boolean);
  const w = xi.map((p) => (["ST"].includes(p.pos) ? 5 : ["LW", "RW", "AM"].includes(p.pos) ? 3 : ["CM"].includes(p.pos) ? 1.5 : 0.4) * (p.sho / 70));
  const tot = w.reduce((a, b) => a + b, 0); const out = [];
  for (let k = 0; k < n; k++) { let r = rand() * tot; for (let i = 0; i < xi.length; i++) { r -= w[i]; if (r <= 0) { out.push(xi[i].id); break; } } }
  return out;
}
function applyResult(S, h, a, gh, ga) {
  const H = S.table[h], A = S.table[a]; H.p++; A.p++; H.gf += gh; H.ga += ga; A.gf += ga; A.ga += gh;
  if (gh > ga) { H.w++; H.pts += 3; A.l++; } else if (gh < ga) { A.w++; A.pts += 3; H.l++; } else { H.d++; A.d++; H.pts++; A.pts++; }
}
function endSeason(S, rand) {
  const tab = standings(S);
  const prize = [30, 22, 17, 13, 10, 8, 6.5, 5, 4, 3];
  tab.forEach((row, i) => { finLog(S, row.c.id, prize[i] * 1e6, `${seasonLabel(S)} 시즌 상금 ${i + 1}위`); row.c.rep = Math.max(30, Math.min(95, row.c.rep + (5 - i) * 0.8)); });
  const myRank = tab.findIndex((r) => r.c.id === MY) + 1;
  const top = S.players.filter((p) => p.club).sort((a, b) => (b.sg || 0) - (a.sg || 0))[0];
  S.history.unshift({ season: seasonLabel(S), champion: tab[0].c.name, myRank, myPts: S.table[MY].pts, topScorer: top ? `${top.name} ${top.sg}골` : "" });
  news(S, `🏆 ${seasonLabel(S)} 우승: ${tab[0].c.name}! 우리 팀은 ${myRank}위 · 득점왕 ${top ? top.name + " " + top.sg + "골" : "-"}`, "my");
  // 계약 줄이기 → 끝난 선수는 FA, 나이·성장
  for (const p of S.players) {
    p.age++;
    const o = ovr(p), keys = ["pac", "sho", "pas", "dri", "def", "phy", "gk"];
    let d = p.age <= 21 ? 2 + rand() * 3 : p.age <= 24 ? 1 + rand() * 2 : p.age <= 29 ? rand() * 1.5 - 0.5 : p.age <= 32 ? -1 - rand() * 1.5 : -2 - rand() * 2.5;
    if (o >= (p.pot || o) && d > 0) d *= 0.3;
    for (const k of keys) p[k] = Math.max(20, Math.min(97, Math.round(p[k] + d * (0.6 + rand() * 0.8))));
    if (p.club) { p.contract--; if (p.contract <= 0) { const c = club(S, p.club); news(S, `📋 계약 만료: ${p.name}(${c.short}) → FA`, p.club === MY ? "my" : "info"); p.club = null; p.contract = 0; S.listed = S.listed.filter((x) => x !== p.id); } }
  }
  // 은퇴(36세 이상 FA 는 사라짐)
  S.players = S.players.filter((p) => !(p.club == null && p.age >= 36));
  // 스폰서: 평판에 따라
  for (const c of S.clubs) finLog(S, c.id, Math.round((4 + c.rep * 0.08) * 1e6), "스폰서 계약");
  S.season++; S.year++; S.md = 0; S.phase = "fa"; S.day = 1;
  S.fixtures = makeFixtures(S.clubs.map((c) => c.id), rng(S.seed + S.season));
  resetTable(S);
  news(S, `📋 FA 이적시장이 열렸어요 — 계약이 끝난 선수들을 잡을 수 있어요.`, "my");
  for (const c of S.clubs) fixLineup(S, c.id);
}

// ---------------------------------------------------------------- 저장
export function save(S) { try { localStorage.setItem("pureday-fc-v1", JSON.stringify(S)); return true; } catch (e) { return false; } }
export function load() { try { const s = localStorage.getItem("pureday-fc-v1"); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
export function wipe() { try { localStorage.removeItem("pureday-fc-v1"); } catch (e) {} }
export { ovr, marketValue, wageOf, money, POS };
