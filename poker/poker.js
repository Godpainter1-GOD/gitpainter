// 퓨어데이 포커 — 텍사스 홀덤 규칙 엔진 (덱 · 족보 판정 · 팟 나누기 · 승률 어림)
// 카드 = 정수 0..51 : rank = (c >> 2) + 2 (2..14, 14 = A), suit = c & 3 (0 ♠ 1 ♥ 2 ♦ 3 ♣)
export const rankOf = (c) => (c >> 2) + 2;
export const suitOf = (c) => c & 3;
export const SUITS = ["♠", "♥", "♦", "♣"];
export const RANKS = { 11: "J", 12: "Q", 13: "K", 14: "A", 10: "10" };
export const rankLabel = (r) => RANKS[r] || String(r);

export function newDeck() {
  const d = Array.from({ length: 52 }, (_, i) => i);
  for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
  return d;
}

export const HAND_NAMES = ["하이카드", "원페어", "투페어", "트리플", "스트레이트", "플러시", "풀하우스", "포카드", "스트레이트 플러시", "로열 플러시"];

// 높은 순으로 정렬된 서로 다른 rank 목록에서 가장 높은 스트레이트의 꼭대기 (없으면 0). A 는 1 로도 쓴다
function straightTop(ranks) {
  const set = new Set(ranks);
  if (set.has(14)) set.add(1);
  for (let top = 14; top >= 5; top--) {
    let ok = true;
    for (let k = 0; k < 5; k++) if (!set.has(top - k)) { ok = false; break; }
    if (ok) return top;
  }
  return 0;
}
const pack = (cat, ks) => ks.reduce((s, k, i) => s + k * Math.pow(15, 4 - i), cat * Math.pow(15, 5));

/** 5~7장 중 가장 좋은 5장의 점수 (클수록 강함) + 족보 번호 */
export function evaluate(cards) {
  const bySuit = [[], [], [], []], cnt = new Array(15).fill(0);
  for (const c of cards) { const r = rankOf(c); bySuit[suitOf(c)].push(r); cnt[r]++; }
  // 스트레이트 플러시 · 플러시
  for (const s of bySuit) {
    if (s.length >= 5) {
      s.sort((a, b) => b - a);
      const sf = straightTop(s);
      if (sf) return { score: pack(sf === 14 ? 9 : 8, [sf]), cat: sf === 14 ? 9 : 8 };
      var flush = s.slice(0, 5);
    }
  }
  const quads = [], trips = [], pairs = [], singles = [];
  for (let r = 14; r >= 2; r--) {
    if (cnt[r] === 4) quads.push(r); else if (cnt[r] === 3) trips.push(r); else if (cnt[r] === 2) pairs.push(r); else if (cnt[r] === 1) singles.push(r);
  }
  const high = (excl, n) => { const out = []; for (let r = 14; r >= 2 && out.length < n; r--) if (cnt[r] && !excl.includes(r)) out.push(r); return out; };
  if (quads.length) return { score: pack(7, [quads[0], ...high([quads[0]], 1)]), cat: 7 };
  if (trips.length && (trips.length > 1 || pairs.length)) {
    const t = trips[0], p = Math.max(trips[1] || 0, pairs[0] || 0);
    return { score: pack(6, [t, p]), cat: 6 };
  }
  if (flush) return { score: pack(5, flush), cat: 5 };
  const distinct = []; for (let r = 14; r >= 2; r--) if (cnt[r]) distinct.push(r);
  const st = straightTop(distinct);
  if (st) return { score: pack(4, [st]), cat: 4 };
  if (trips.length) return { score: pack(3, [trips[0], ...high([trips[0]], 2)]), cat: 3 };
  if (pairs.length >= 2) return { score: pack(2, [pairs[0], pairs[1], ...high([pairs[0], pairs[1]], 1)]), cat: 2 };
  if (pairs.length) return { score: pack(1, [pairs[0], ...high([pairs[0]], 3)]), cat: 1 };
  return { score: pack(0, high([], 5)), cat: 0 };
}

/** 이길 확률 어림 (몬테카를로): 내 패 2장, 공개 카드, 남은 상대 수 */
export function equity(hole, board, opponents, iters = 300) {
  const used = new Set([...hole, ...board]);
  const rest = []; for (let c = 0; c < 52; c++) if (!used.has(c)) rest.push(c);
  let win = 0;
  for (let it = 0; it < iters; it++) {
    // 필요한 만큼만 앞쪽을 섞는다
    const need = opponents * 2 + (5 - board.length);
    for (let i = 0; i < need; i++) { const j = i + Math.floor(Math.random() * (rest.length - i)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
    const full = board.concat(rest.slice(opponents * 2, need));
    const me = evaluate(hole.concat(full)).score;
    let best = 0, ties = 1, lost = false;
    for (let o = 0; o < opponents; o++) {
      const s = evaluate([rest[o * 2], rest[o * 2 + 1], ...full]).score;
      if (s > me) { lost = true; break; }
      if (s === me) ties++;
      best = Math.max(best, s);
    }
    if (!lost) win += 1 / ties;
  }
  return win / iters;
}

/** 팟 나누기: players[i] = { total(이번 판에 넣은 구슬), folded, score(쇼다운 점수) } → 각자 받을 구슬 배열
 *  사이드 팟: 넣은 양이 다른 단계마다 팟을 나누고, 그 단계까지 낸 사람 중 접지 않은 최고 점수가 가져간다 */
export function splitPots(players) {
  const won = players.map(() => 0);
  const levels = [...new Set(players.map((p) => p.total).filter((t) => t > 0))].sort((a, b) => a - b);
  let prev = 0;
  const pots = [];
  for (const lv of levels) {
    let amount = 0;
    const elig = [];
    players.forEach((p, i) => { const part = Math.min(p.total, lv) - Math.min(p.total, prev); amount += Math.max(0, part); if (p.total >= lv && !p.folded) elig.push(i); });
    prev = lv;
    if (amount <= 0) continue;
    if (!elig.length) { pots.push({ amount, winners: [] }); continue; }   // 모두 접은 단계는 앞 팟에 얹는다
    const best = Math.max(...elig.map((i) => players[i].score));
    const winners = elig.filter((i) => players[i].score === best);
    pots.push({ amount, winners });
  }
  // 이긴 사람이 없는 팟(전원 폴드 단계)은 바로 앞 팟의 승자에게
  for (let k = 0; k < pots.length; k++) if (!pots[k].winners.length) pots[k].winners = (pots[k - 1] || pots[k + 1] || { winners: [] }).winners;
  for (const pot of pots) {
    if (!pot.winners.length) continue;
    const share = Math.floor(pot.amount / pot.winners.length);
    pot.winners.forEach((i) => { won[i] += share; });
    won[pot.winners[0]] += pot.amount - share * pot.winners.length;   // 나머지 구슬은 첫 승자
  }
  return { won, pots };
}
