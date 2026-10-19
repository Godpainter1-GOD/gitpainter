// 퓨어데이 체스 — 컴퓨터 상대. 알파베타 네가맥스 + 말 위치 점수표.
// 쉬움: 1수 앞 + 실수 섞기 / 보통: 2수 / 어려움: 3수 + 잡기 수 끝까지 보기(정적 탐색)
import { Chess } from "./vendor/chess.js";

const VALUE = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

// 흰 쪽 기준 위치 점수 (a8..h8 → a1..h1 순서), 검은 쪽은 위아래를 뒤집어 쓴다
const PST = {
  p: [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5,
      0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
  n: [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30,
      -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50],
  b: [-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10,
      -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20],
  r: [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5,
      -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0],
  q: [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5,
      0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20],
  k: [-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30,
      -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20],
};

function evaluate(game) {
  // 둘 차례인 쪽 기준 점수
  let s = 0;
  const b = game.board();
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
    const sq = b[r][f];
    if (!sq) continue;
    const idx = sq.color === "w" ? r * 8 + f : (7 - r) * 8 + f;
    const v = VALUE[sq.type] + PST[sq.type][idx];
    s += sq.color === "w" ? v : -v;
  }
  return game.turn() === "w" ? s : -s;
}

function ordered(game) {
  // 잡는 수 먼저 (MVV-LVA 비슷하게) → 알파베타가 더 많이 자른다
  return game.moves({ verbose: true }).sort((a, b) =>
    ((b.captured ? VALUE[b.captured] * 10 - VALUE[b.piece] : 0) + (b.promotion ? 800 : 0)) -
    ((a.captured ? VALUE[a.captured] * 10 - VALUE[a.piece] : 0) + (a.promotion ? 800 : 0)));
}

function quiesce(game, alpha, beta, depth) {
  const stand = evaluate(game);
  if (stand >= beta) return beta;
  if (alpha < stand) alpha = stand;
  if (depth <= 0) return alpha;
  for (const m of ordered(game)) {
    if (!m.captured) continue;
    game.move(m);
    const sc = -quiesce(game, -beta, -alpha, depth - 1);
    game.undo();
    if (sc >= beta) return beta;
    if (sc > alpha) alpha = sc;
  }
  return alpha;
}

let deadline = Infinity;
class Timeout extends Error {}

function negamax(game, depth, alpha, beta, qdepth) {
  if (Date.now() > deadline) throw new Timeout();
  if (game.isCheckmate()) return -100000 - depth;   // 빨리 지는 것을 더 나쁘게
  if (game.isDraw() || game.isStalemate()) return 0;
  if (depth === 0) return qdepth ? quiesce(game, alpha, beta, qdepth) : evaluate(game);
  let best = -Infinity;
  for (const m of ordered(game)) {
    game.move(m);
    const sc = -negamax(game, depth - 1, -beta, -alpha, qdepth);
    game.undo();
    if (sc > best) best = sc;
    if (sc > alpha) alpha = sc;
    if (alpha >= beta) break;
  }
  return best;
}

export const LEVELS = {
  easy: { label: "쉬움", depth: 1, q: 0, blunder: 0.35, ms: 500 },
  normal: { label: "보통", depth: 2, q: 2, blunder: 0.08, ms: 1500 },
  hard: { label: "어려움", depth: 3, q: 3, blunder: 0, ms: 2500 },   // 2500ms 넘으면 한 수 얕은 결과를 쓴다
};

/** fen 에서 둘 수를 골라 verbose move 를 돌려준다 */
export function bestMove(fen, level = "normal") {
  const L = LEVELS[level] || LEVELS.normal;
  const game = new Chess(fen);
  const moves = ordered(game);
  if (!moves.length) return null;
  if (L.blunder && Math.random() < L.blunder) return moves[Math.floor(Math.random() * moves.length)];
  // 깊이를 1부터 늘려 가며(반복 심화) 찾고, 시간이 넘으면 바로 앞 깊이의 결과를 쓴다
  deadline = Date.now() + L.ms;
  let best = moves[0], bestSc = -Infinity, scored = [];
  for (let d = 1; d <= L.depth; d++) {
    let dBest = null, dSc = -Infinity, alpha = -Infinity;
    const dScored = [];
    try {
      // 앞 깊이의 최선 수를 먼저 보면 가지치기가 잘 된다
      const order = [best, ...moves.filter((m) => m !== best)];
      for (const m of order) {
        game.move(m);
        let sc;
        try { sc = -negamax(game, d - 1, -Infinity, -alpha, L.q); } finally { game.undo(); }
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
  // 1수 탐색(점수가 정확)일 때만 같은 점수의 수 중에서 골라 매번 같은 게임이 되지 않게.
  // 깊은 탐색은 가지치기로 나머지 점수가 '상한'이라 같은 점수처럼 보여도 실제로는 더 나쁠 수 있다
  if (L.depth === 1) {
    const ties = scored.filter(([s]) => s === bestSc).map(([, m]) => m);
    if (ties.length) return ties[Math.floor(Math.random() * ties.length)];
  }
  return best;
}
