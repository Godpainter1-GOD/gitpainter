// 퓨어데이 장기 — 컴퓨터 상대. 알파베타 네가맥스 + 간단한 위치 점수.
// 탐색 안에서는 '궁을 잡는 수'를 끝으로 본다(빠름). 맨 위에서만 정식 수(legalMoves)를 고른다.
// 쉬움: 1수 + 실수 섞기 / 보통: 2수 + 잡기 끝까지 / 어려움: 3수까지(반복 심화, 시간 제한)
import { VALUE, pieceTargets, legalMoves, R_, F_ } from "./janggi.js";

const MATE = 100000;

function posBonus(p, i) {
  const t = p[1], r = R_(i), f = F_(i);
  const adv = p[0] === "w" ? 9 - r : r;            // 자기 끝줄에서 얼마나 나왔나 (0..9)
  if (t === "P") return (adv - 3) * 12 + (adv >= 7 && f >= 3 && f <= 5 ? 30 : 0) - Math.abs(f - 4) * 3;
  if (t === "H") return 20 - Math.abs(f - 4) * 6 - Math.abs(adv - 3) * 5;
  if (t === "R") return adv >= 2 ? 10 : 0;
  if (t === "C") return adv === 2 && (f === 4) ? 15 : 0;
  return 0;
}

function evaluate(board, turn) {
  let s = 0;
  for (let i = 0; i < 90; i++) {
    const p = board[i]; if (!p) continue;
    const v = VALUE[p[1]] + posBonus(p, i);
    s += p[0] === "w" ? v : -v;
  }
  return turn === "w" ? s : -s;
}

function gen(board, c, capturesOnly = false) {
  const out = [];
  for (let i = 0; i < 90; i++) {
    const p = board[i];
    if (!p || p[0] !== c) continue;
    pieceTargets(board, i, (j) => {
      const cap = board[j];
      if (capturesOnly && !cap) return;
      out.push({ from: i, to: j, piece: p, captured: cap, k: cap ? (cap[1] === "K" ? 1e6 : VALUE[cap[1]] * 10 - VALUE[p[1]]) : 0 });
    });
  }
  return out.sort((a, b) => b.k - a.k);
}

let deadline = Infinity;
class Timeout extends Error {}
const opp = (c) => (c === "w" ? "b" : "w");

function quiesce(board, turn, alpha, beta, depth) {
  const stand = evaluate(board, turn);
  if (stand >= beta) return beta;
  if (alpha < stand) alpha = stand;
  if (depth <= 0) return alpha;
  for (const m of gen(board, turn, true)) {
    if (m.captured[1] === "K") return MATE;
    board[m.to] = m.piece; board[m.from] = null;
    const sc = -quiesce(board, opp(turn), -beta, -alpha, depth - 1);
    board[m.from] = m.piece; board[m.to] = m.captured;
    if (sc >= beta) return beta;
    if (sc > alpha) alpha = sc;
  }
  return alpha;
}

function negamax(board, turn, depth, alpha, beta, q) {
  if (Date.now() > deadline) throw new Timeout();
  if (depth === 0) return q ? quiesce(board, turn, alpha, beta, q) : evaluate(board, turn);
  let best = -Infinity;
  for (const m of gen(board, turn)) {
    if (m.captured && m.captured[1] === "K") return MATE + depth;   // 궁을 잡을 수 있다 = 앞 수가 잘못됐다
    board[m.to] = m.piece; board[m.from] = null;
    const sc = -negamax(board, opp(turn), depth - 1, -beta, -alpha, q);
    board[m.from] = m.piece; board[m.to] = m.captured;
    if (sc > best) best = sc;
    if (sc > alpha) alpha = sc;
    if (alpha >= beta) break;
  }
  return best === -Infinity ? 0 : best;
}

export const LEVELS = {
  easy: { label: "쉬움", depth: 1, q: 0, blunder: 0.3, ms: 500 },
  normal: { label: "보통", depth: 2, q: 3, blunder: 0.05, ms: 1500 },
  hard: { label: "어려움", depth: 5, q: 4, blunder: 0, ms: 3000 },   // 시간이 넘으면 한 수 얕은 결과를 쓴다
};

/** board(배열 90칸)·turn 에서 둘 수 {from,to} 를 고른다. 둘 수가 없으면 null */
export function bestMove(board, turn, level = "normal") {
  const L = LEVELS[level] || LEVELS.normal;
  board = board.slice();
  const legal = legalMoves(board, turn);
  if (!legal.length) return null;
  const keyed = gen(board, turn);
  const moves = legal.map((m) => keyed.find((k) => k.from === m.from && k.to === m.to) || m).sort((a, b) => (b.k || 0) - (a.k || 0));
  if (L.blunder && Math.random() < L.blunder) return moves[Math.floor(Math.random() * moves.length)];
  deadline = Date.now() + L.ms;
  let best = moves[0], bestSc = -Infinity, scored = [];
  for (let d = 1; d <= L.depth; d++) {
    let dBest = null, dSc = -Infinity, alpha = -Infinity;
    const dScored = [];
    try {
      for (const m of [best, ...moves.filter((x) => x !== best)]) {
        board[m.to] = m.piece; board[m.from] = null;
        let sc;
        try { sc = -negamax(board, opp(turn), d - 1, -Infinity, -alpha, L.q); } finally { board[m.from] = m.piece; board[m.to] = m.captured; }
        dScored.push([sc, m]);
        if (sc > dSc) { dSc = sc; dBest = m; }
        if (sc > alpha) alpha = sc;
      }
    } catch (e) {
      if (!(e instanceof Timeout)) throw e;
      break;   // 이 깊이는 다 못 봤다 → 앞 깊이 결과 유지
    }
    best = dBest; bestSc = dSc; scored = dScored;
  }
  deadline = Infinity;
  if (L.depth === 1) {   // 1수 탐색은 점수가 정확 → 같은 점수 중 골라 매번 같은 판이 되지 않게
    const ties = scored.filter(([s]) => s === bestSc).map(([, m]) => m);
    if (ties.length) best = ties[Math.floor(Math.random() * ties.length)];
  }
  return { from: best.from, to: best.to };
}
