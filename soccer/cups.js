// 퓨어데이 FC — 컵 대회 (2026-10-27 대표님: "리그컵·FA컵·챔피언스리그, 우승·준우승·3위 상금, 예선·토너먼트 승리 수당으로 시즌 예산을 벌게",
// "유럽 중소리그 상위 3위까지 유럽연합리그로 그룹별 참여")
// · 나라마다 FA컵(그 나라 모든 리그) · 리그컵(1·2부): 단판 토너먼트, 위 시드는 부전승, 결승 날 3·4위전
// · 챔피언스리그: 5대 리그(잉글랜드·스페인·이탈리아·독일·프랑스) 상위권 + 예선 → 8개 조 → 16강 → 8강 → 4강 → 3·4위전·결승
// · 유럽연합리그: 중소리그(포르투갈·스코틀랜드·오스트리아·스위스) 1~3위 + 4·5위 예선 → 4개 조 → 8강 → 4강 → 3·4위전·결승
// 일정: 우리 리그 라운드 사이사이에 끼움(at = 그 라운드가 끝난 뒤). 우리 팀이 없는 경기는 바로 계산하고, 우리 경기는 직접 뛰거나 빠른 결과로.
import { quickSim } from "./engine.js";
import { rng } from "./data.js";
import { MY, club, player, rating, fixLineup, recordMatch, finLog, news, myLeague, leagueOf, recover, squad, makeFixtures } from "./career.js?v=8";
import { COUNTRY } from "./realdata.js?v=8";

export const BIG = ["EN", "ES", "IT", "DE", "FR"];   // 챔피언스리그
export const MID = ["PT", "SC", "AT", "CH"];         // 유럽연합리그
const FA_NAME = { KR: "코리아컵", DE: "DFB 포칼", EN: "FA컵", ES: "코파 델 레이", FR: "쿠프 드 프랑스", IT: "코파 이탈리아", PT: "타사 드 포르투갈", SC: "스코티시컵", AT: "ÖFB 컵", CH: "스위스컵", PURE: "퓨어 FA컵" };
const LC_NAME = { KR: "K리그 리그컵", DE: "독일 리그컵", EN: "EFL 리그컵", ES: "스페인 리그컵", FR: "쿠프 드 라 리그", IT: "이탈리아 리그컵", PT: "타사 다 리가", SC: "스코티시 리그컵", AT: "오스트리아 리그컵", CH: "스위스 리그컵", PURE: "퓨어 리그컵" };
export const KIND = { cl: { icon: "⭐", name: "챔피언스리그" }, eul: { icon: "🌍", name: "유럽연합리그" }, fa: { icon: "🏆", name: "FA컵" }, lc: { icon: "🏅", name: "리그컵" } };
// 상금(유로): 유럽 대회는 정해진 금액, 국내 컵은 그 나라 1부 경제 규모(E = 구단 평균 선수단 가치)에 비례
export const EURO_P = {
  cl: { q: 1.5e6, join: 18e6, gw: 2.1e6, gd: 0.7e6, adv: 11e6, ko: { 16: 12.5e6, 8: 15e6, 4: 18.5e6 }, podium: [25e6, 15e6, 8e6] },
  eul: { q: 0.5e6, join: 4e6, gw: 0.6e6, gd: 0.2e6, adv: 1.5e6, ko: { 8: 2e6, 4: 3e6 }, podium: [8e6, 4.5e6, 2.5e6] },
};
export const DOM_P = { fa: { win: 0.0015, podium: [0.04, 0.02, 0.01] }, lc: { win: 0.001, podium: [0.025, 0.012, 0.006] } };
// 일정(우리 리그 진행 비율). 국내 컵은 결승이 맨 뒤 칸, 라운드가 적으면 뒤쪽 칸만 씀
const SLOT = { fa: [0.96, 0.86, 0.74, 0.6, 0.46, 0.33, 0.2, 0.1, 0.05, 0.03], lc: [0.66, 0.55, 0.44, 0.33, 0.22, 0.12, 0.06, 0.03, 0.02], q: 0.05, g: [0.12, 0.2, 0.28, 0.36, 0.43, 0.49], ko: [0.92, 0.82, 0.72, 0.62] };

export const comp = (S, id) => (S.comps || []).find((c) => c.id === id);
const countryOf = (S, id) => (leagueOf(S, id) || {}).country;
const tierOf = (S, id) => (leagueOf(S, id) || {}).tier || 9;
export const flagOfCountry = (cty) => (COUNTRY[cty] ? COUNTRY[cty].flag : "");
function shuffle(a, r) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const round1e4 = (v) => Math.round(v / 1e4) * 1e4;

// ---------------------------------------------------------------- 시즌 시작: 대회 만들기 + 일정
export function startCups(S) {
  const r = rng((S.seed || 1) * 7 + S.season * 131);
  S.comps = []; S.cal = []; S.calI = 0;
  const byC = {}; for (const l of S.leagues) (byC[l.country] = byC[l.country] || []).push(l);
  for (const [cty, ls] of Object.entries(byC)) {
    const top = ls.find((l) => l.tier === 1) || ls[0], E = top.econ || 2e8;
    const all = ls.flatMap((l) => l.clubs.map((id) => ({ id, tier: l.tier, rep: club(S, id).rep || 50 }))).sort((a, b) => a.tier - b.tier || b.rep - a.rep).map((x) => x.id);
    S.comps.push(koComp({ id: "fa_" + cty, kind: "fa", country: cty, name: FA_NAME[cty] || `${(COUNTRY[cty] || {}).name || ""} FA컵`, E, teams: all }));
    const two = all.filter((id) => tierOf(S, id) <= 2);
    if (two.length >= 4) S.comps.push(koComp({ id: "lc_" + cty, kind: "lc", country: cty, name: LC_NAME[cty] || "리그컵", E, teams: two }));
  }
  const euro = (kind, countries, G) => {
    const lists = countries.filter((c) => byC[c]).map((c) => lastRank(S, byC[c].find((l) => l.tier === 1))).filter((x) => x && x.length);
    if (!lists.length) return;
    const g = lists.length >= 4 ? G : Math.max(2, G / 2), size = g * 4, qWin = g / 2 * (kind === "cl" ? 1.5 : 2) | 0, direct = size - qWin;
    const order = []; for (let k = 0; k < 30; k++) for (const lst of lists) if (lst[k]) order.push(lst[k]);
    const seen = new Set((S.comps.find((c) => c.kind === "cl") || { teams: [] }).teams.concat((S.comps.find((c) => c.kind === "cl") || { qual: [] }).qual || []));
    const ent = [], qual = [], add = (id, arr) => { if (id && club(S, id) && !seen.has(id)) { seen.add(id); arr.push(id); } };
    if (kind === "cl" && S.lastEuro) { add(S.lastEuro.eul, ent); add(S.lastEuro.cl, ent); }   // 지난 시즌 유럽연합리그·챔피언스리그 우승팀은 본선 직행
    for (const id of order) { if (ent.length >= direct) break; add(id, ent); }
    for (const id of order) { if (qual.length >= qWin * 2) break; add(id, qual); }
    const c = { id: kind, kind, name: KIND[kind].name, icon: KIND[kind].icon, G: g, teams: ent, qual, steps: [...(qual.length ? ["q"] : []), "g", "g", "g", "g", "g", "g", ...Array(Math.log2(g * 2)).fill("ko")], k: 0, log: [], sf: [], podium: [null, null, null], myRes: "", groups: null };
    if (!qual.length) drawGroups(S, c, r);
    S.comps.push(c);
  };
  euro("cl", BIG, 8); euro("eul", MID, 4);
  for (const c of S.comps) {
    c.myIn = c.teams.includes(MY) || (c.qual || []).includes(MY);
    if (c.myIn && c.kind !== "fa" && c.kind !== "lc") news(S, `${c.icon} ${c.name} 출전! ${c.qual && c.qual.includes(MY) ? "예선부터 시작해요." : "본선 조별리그에 바로 들어가요."}`, "my");
  }
  // 일정
  const L = myLeague(S), R = L.fixtures.length;
  for (const c of S.comps) {
    const nKo = c.steps.filter((s) => s === "ko").length; let ko = 0, g = 0;
    c.steps.forEach((s, k) => {
      let f;
      if (c.kind === "fa" || c.kind === "lc") { const sl = SLOT[c.kind]; f = sl[Math.min(sl.length - 1, c.steps.length - 1 - k)]; }
      else if (s === "q") f = SLOT.q; else if (s === "g") f = SLOT.g[g++]; else f = SLOT.ko[nKo - 1 - ko++];
      S.cal.push({ c: c.id, k, f, at: Math.max(1, Math.min(R - 1, Math.round(f * R))) });
    });
  }
  S.cal.sort((a, b) => a.at - b.at || a.f - b.f);
  const mine = S.comps.filter((c) => c.myIn).map((c) => c.name);
  if (mine.length) news(S, `🏆 이번 시즌 우리 팀 대회: 리그 + ${mine.join(" · ")}`, "my");
}
function koComp(o) { const n = o.teams.length; return { ...o, icon: KIND[o.kind].icon, steps: Array(Math.max(1, Math.ceil(Math.log2(n)))).fill("ko"), alive: o.teams.slice(), k: 0, log: [], sf: [], podium: [null, null, null], myRes: "" }; }
// 지난 시즌 순위(없으면 지금 선수단 종합 순)
function lastRank(S, l) {
  if (!l) return null;
  const ids = S.lastRank && S.lastRank[l.id];
  if (ids && ids.length) return ids.filter((id) => club(S, id));
  return l.clubs.slice().sort((a, b) => rating(S, b) - rating(S, a));
}
function drawGroups(S, c, r) {
  const ids = c.teams.slice().sort((a, b) => rating(S, b) - rating(S, a)), G = c.G;
  const groups = Array.from({ length: G }, (_, i) => ({ name: "ABCDEFGH"[i], clubs: [] }));
  for (let pot = 0; pot < 4; pot++) {
    for (const id of shuffle(ids.slice(pot * G, pot * G + G), r)) {
      const cty = countryOf(S, id), open = groups.filter((g) => g.clubs.length === pot);
      (open.find((g) => !g.clubs.some((x) => countryOf(S, x) === cty)) || open[0]).clubs.push(id);   // 같은 나라끼리는 되도록 다른 조
    }
  }
  for (const g of groups) { g.fixtures = makeFixtures(g.clubs, r); g.table = {}; for (const id of g.clubs) g.table[id] = { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }; }
  c.groups = groups; c.gi = 0;
  for (const id of c.teams) finLog(S, id, EURO_P[c.kind].join, `${c.name} 본선 참가금`, "euro");
  if (c.teams.includes(MY)) { const g = groups.find((x) => x.clubs.includes(MY)); news(S, `${c.icon} ${c.name} 조 추첨: ${g.name}조 — ${g.clubs.filter((x) => x !== MY).map((x) => club(S, x).name).join(", ")} · 본선 참가금 ${(EURO_P[c.kind].join / 1e6).toFixed(1)}M`, "my"); }
}
export function groupTable(c, g) { return g.clubs.map((id) => ({ id, ...g.table[id] })).sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf); }

// ---------------------------------------------------------------- 한 단계(라운드)의 대진
function roundName(n) { return n === 2 ? "결승" : n === 4 ? "4강" : n === 8 ? "8강" : `${n}강`; }
export function prep(S, c, k) {
  if (c.cur && c.cur.k === k) return c.cur;
  const type = c.steps[k], r = rng((S.seed || 1) + S.season * 977 + k * 31 + c.id.length * 7 + c.id.charCodeAt(0));
  let ties = [], label = "", byes = [];
  if (type === "q") {
    const pool = c.qual.slice(0, c.qual.length - (c.qual.length % 2)); label = "예선 플레이오프";
    for (let i = 0; i < pool.length / 2; i++) ties.push({ h: pool[i], a: pool[pool.length - 1 - i], ko: 1 });
  } else if (type === "g") {
    const md = c.gi; label = `조별리그 ${md + 1}차전`;
    for (const g of c.groups) for (const f of g.fixtures[md] || []) ties.push({ h: f.h, a: f.a, g: g.name });
  } else {
    const n = c.alive.length;
    if (n <= 2) { label = "결승 · 3·4위전"; if (n === 2) ties.push({ h: c.alive[0], a: c.alive[1], ko: 1, neutral: 1, tag: "final" }); if (c.sf.length === 2) ties.push({ h: c.sf[0], a: c.sf[1], ko: 1, neutral: 1, tag: "third" }); }
    else if (c.koPairs) { label = roundName(n); ties = c.koPairs.map(([h, a]) => ({ h, a, ko: 1 })); }
    else {
      const p = 2 ** Math.floor(Math.log2(n)); let play = c.alive;
      if (p < n) { const m = n - p; byes = c.alive.slice(0, n - 2 * m); play = c.alive.slice(n - 2 * m); label = `${k + 1}라운드`; } else label = roundName(n);
      const sh = shuffle(play.slice(), r);
      for (let i = 0; i + 1 < sh.length; i += 2) ties.push({ h: sh[i], a: sh[i + 1], ko: 1 });
    }
  }
  c.cur = { k, type, label, ties, byes };
  return c.cur;
}
export function myTie(S, ev) { const c = comp(S, ev.c); if (!c) return null; const t = prep(S, c, ev.k).ties.find((x) => x.h === MY || x.a === MY); return t ? { ...t, comp: c.id, label: `${c.icon} ${c.name} ${t.tag === "third" ? "3·4위전" : t.tag === "final" ? "결승" : c.cur.label}`, cup: true } : null; }
export function pendingEvent(S) { const e = S.cal && S.cal[S.calI || 0]; return e && e.at <= myLeague(S).played ? e : null; }
// 우리 팀이 없는 대회 경기는 바로 계산(리그 진행 중일 때만)
export function runIdle(S, rand = Math.random) { let e, guard = 0; while (S.phase === "league" && (e = pendingEvent(S)) && !myTie(S, e) && guard++ < 200) runEvent(S, e, null, rand); }
export function finishAll(S, rand = Math.random) { let e, guard = 0; while ((e = S.cal && S.cal[S.calI || 0]) && guard++ < 300) runEvent(S, e, null, rand); }
export function cupFixture(S) { const e = pendingEvent(S); return e ? myTie(S, e) : null; }
export function nextCupEvents(S, n = 3) { return (S.cal || []).slice(S.calI || 0).filter((e) => { const c = comp(S, e.c); return c && c.myIn && !c.out; }).slice(0, n).map((e) => ({ ...e, comp: comp(S, e.c) })); }

// ---------------------------------------------------------------- 경기 치르기
function shootout(rand) { let a = 0, b = 0; for (let k = 0; k < 5; k++) { a += rand() < 0.76; b += rand() < 0.76; } while (a === b) { a += rand() < 0.76; b += rand() < 0.76; } return [a, b]; }
function gate(S, cid, mult) { const l = leagueOf(S, cid); return round1e4(Math.max(5e3, ((l && l.econ) || 2e8) * 0.006) * (0.6 + (club(S, cid).rep || 50) / 100) * mult); }
const pay = (S, c, cid, amount, what) => { if (amount > 0) finLog(S, cid, round1e4(amount), what, c.kind === "cl" || c.kind === "eul" ? "euro" : "cup"); };
export function runEvent(S, ev, myResult = null, rand = Math.random) {
  const c = comp(S, ev.c); S.calI = (S.calI || 0) + 1; if (!c) return null;
  const cur = prep(S, c, ev.k), euro = c.kind === "cl" || c.kind === "eul", out = [];
  for (const t of cur.ties) {
    const mine = t.h === MY || t.a === MY; let sc, det = null;
    fixLineup(S, t.h); fixLineup(S, t.a);
    if (mine && myResult) { sc = myResult.score; det = myResult; }
    else sc = quickSim(rating(S, t.h) + (t.neutral ? 0 : 2), rating(S, t.a), S.tactics[t.h], S.tactics[t.a], rand);
    t.motm = recordMatch(S, t, sc, det, rand, c.kind);
    t.score = sc;
    if (t.ko) { if (sc[0] === sc[1]) t.pens = (mine && myResult && myResult.pens) || shootout(rand); const hw = sc[0] > sc[1] || (sc[0] === sc[1] && t.pens[0] > t.pens[1]); t.win = hw ? t.h : t.a; t.lose = hw ? t.a : t.h; }
    if (!t.neutral) pay(S, c, t.h, gate(S, t.h, euro ? 2.2 : 1), `${c.name} 홈 경기 입장 수입`);
    out.push({ ...t, mine });
  }
  for (const t of cur.ties) for (const id of [t.h, t.a]) for (const p of squad(S, id)) recover(p, 1);
  finishStep(S, c, cur, rand);
  c.log.push({ label: cur.label, ties: cur.ties.map((t) => ({ h: t.h, a: t.a, score: t.score, pens: t.pens, tag: t.tag, g: t.g })) });
  c.k = ev.k + 1; c.cur = null;
  const my = out.find((x) => x.mine);
  if (my) { const me = my.h === MY ? 0 : 1, gf = my.score[me], ga = my.score[1 - me], opp = club(S, me ? my.h : my.a); const pk = my.pens ? ` (승부차기 ${my.pens[me]}:${my.pens[1 - me]})` : ""; const won = my.ko ? my.win === MY : gf > ga;
    news(S, `${won ? "🟢 승리" : gf === ga && !my.ko ? "⚪ 무승부" : "🔴 패배"} ${c.icon} ${c.name} ${cur.label} ${gf}:${ga}${pk} vs ${opp.name}`, "my"); }
  return { results: out, title: `${c.icon} ${c.name} ${cur.label} 결과`, comp: c.id, mine: !!my };
}
function finishStep(S, c, cur, rand) {
  const euro = c.kind === "cl" || c.kind === "eul", P = euro ? EURO_P[c.kind] : null, D = euro ? null : DOM_P[c.kind];
  if (cur.type === "q") {
    for (const t of cur.ties) { c.teams.push(t.win); pay(S, c, t.win, P.q, `${c.name} 예선 승리 수당`); if (t.lose === MY) { c.myRes = "예선 탈락"; c.out = true; news(S, `${c.icon} ${c.name} 예선 탈락…`, "my"); } }
    drawGroups(S, c, rng((S.seed || 1) + S.season * 53));
    return;
  }
  if (cur.type === "g") {
    for (const t of cur.ties) {
      const g = c.groups.find((x) => x.name === t.g), H = g.table[t.h], A = g.table[t.a], [gh, ga] = t.score;
      H.p++; A.p++; H.gf += gh; H.ga += ga; A.gf += ga; A.ga += gh;
      if (gh > ga) { H.w++; H.pts += 3; A.l++; pay(S, c, t.h, P.gw, `${c.name} 조별리그 승리 수당`); } else if (gh < ga) { A.w++; A.pts += 3; H.l++; pay(S, c, t.a, P.gw, `${c.name} 조별리그 승리 수당`); }
      else { H.d++; A.d++; H.pts++; A.pts++; pay(S, c, t.h, P.gd, `${c.name} 조별리그 무승부 수당`); pay(S, c, t.a, P.gd, `${c.name} 조별리그 무승부 수당`); }
    }
    c.gi++;
    if (c.gi >= 6) {   // 조 1·2위 → 토너먼트(조 1위 vs 다른 조 2위, 1위 홈)
      const tabs = c.groups.map((g) => groupTable(c, g)), win = tabs.map((t) => t[0].id), run = tabs.map((t) => t[1].id);
      c.alive = [...win, ...run]; c.koPairs = win.map((w, i) => [w, run[(i + 1) % run.length]]);
      for (const id of c.alive) pay(S, c, id, P.adv, `${c.name} 토너먼트 진출 수당`);
      if (c.myIn && !c.out) { if (c.alive.includes(MY)) news(S, `${c.icon} ${c.name} 조별리그 통과! 토너먼트 진출 수당 ${(P.adv / 1e6).toFixed(1)}M`, "my"); else { c.myRes = "조별리그 탈락"; c.out = true; news(S, `${c.icon} ${c.name} 조별리그 탈락`, "my"); } }
    }
    return;
  }
  // 토너먼트
  const n = c.alive.length, depth = c.steps.length - 1 - cur.k;   // 0 = 결승
  c.koPairs = null;
  if (n <= 2) {
    const fin = cur.ties.find((t) => t.tag === "final"), th = cur.ties.find((t) => t.tag === "third");
    if (fin) { c.podium[0] = fin.win; c.podium[1] = fin.lose; }
    if (th) { c.podium[2] = th.win; c.fourth = th.lose; }
    const prize = (i) => (euro ? P.podium[i] : c.E * D.podium[i]);
    ["우승", "준우승", "3위"].forEach((w, i) => { const id = c.podium[i]; if (id) { pay(S, c, id, prize(i), `${c.name} ${w} 상금`); const cl = club(S, id); cl.rep = Math.min(98, (cl.rep || 50) + [euro ? 4 : 2, 1, 0.5][i]); } });
    if (c.myIn && !c.out) { c.myRes = c.podium[0] === MY ? "우승" : c.podium[1] === MY ? "준우승" : c.podium[2] === MY ? "3위" : c.fourth === MY ? "4위" : c.myRes; c.out = true; }
    c.done = true;
    const nm = (id) => (id ? club(S, id).name : "-");
    if (c.myIn || euro || c.country === (myLeague(S) || {}).country) news(S, `${c.icon} ${c.name} ${c.podium[0] === MY ? "🎉 우승! " : ""}우승 ${nm(c.podium[0])} · 준우승 ${nm(c.podium[1])} · 3위 ${nm(c.podium[2])}`, c.myIn ? "my" : "info");
    return;
  }
  const winners = cur.ties.map((t) => t.win), losers = cur.ties.map((t) => t.lose);
  for (const id of winners) pay(S, c, id, euro ? P.ko[n] || 0 : c.E * D.win * (1 + (c.steps.length - 1 - depth) * 0.6), `${c.name} ${cur.label} 승리 수당`);
  if (n === 4) c.sf = losers.slice();
  c.alive = c.alive.filter((id) => cur.byes.includes(id) || winners.includes(id));
  if (c.myIn && !c.out && losers.includes(MY)) { c.myRes = cur.label; if (n !== 4) { c.out = true; news(S, `${c.icon} ${c.name} ${cur.label}에서 탈락`, "my"); } else news(S, `${c.icon} ${c.name} 4강 패배 — 3·4위전이 남았어요`, "my"); }
  if (c.myIn && !c.out && winners.includes(MY)) news(S, `${c.icon} ${c.name} ${cur.label} 통과 → ${roundName(c.alive.length)}`, "my");
}

// ---------------------------------------------------------------- 결과 정리(엔딩용)
export function compScorer(S, c) {
  const set = new Set([...(c.teams || []), ...(c.qual || [])]); let best = null, bv = 0;
  for (const p of S.players) { const s = p.cst && p.cst[c.kind]; if (!s || !s.g || !set.has(p.club)) continue; if (c.kind !== "cl" && c.kind !== "eul" && countryOf(S, p.club) !== c.country) continue; if (s.g > bv || (s.g === bv && best && s.a > best.cst[c.kind].a)) { bv = s.g; best = p; } }
  return best ? { name: best.name, club: club(S, best.club) ? club(S, best.club).name : "", n: bv } : null;
}
export function compStatus(S, c) {
  if (c.done) return c.myIn ? c.myRes || "탈락" : "끝";
  if (c.myIn) return c.out ? c.myRes : "진행 중";
  return "진행 중";
}
