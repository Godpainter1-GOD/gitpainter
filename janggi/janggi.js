// 퓨어데이 장기 — 규칙 엔진 (화면과 컴퓨터가 같이 쓴다)
// 판: 9줄(f 0..8) × 10줄(r 0..9), r=0 이 위(한), r=9 가 아래(초). 칸 번호 i = r*9 + f
// 말 코드: 진영(w=초·빛, b=한·어둠) + 종류(K 궁, A 사, R 차, C 포, H 마, E 상, P 졸·병) [+ 그림 번호]
//   예: "wK", "wR1"(조아름), "wA2"(김미아), "bP3"(늑대개 갈색 추격자) — 번호는 그림 고르기용, 규칙은 앞 두 글자만 본다

export const VALUE = { K: 0, R: 1300, C: 700, H: 500, E: 300, A: 300, P: 200 };
export const POINTS = { K: 0, R: 13, C: 7, H: 5, E: 3, A: 3, P: 2 };   // 판정승 점수
export const HAN_BONUS = 1.5;                                           // 한(후수) 덤
export const MAX_PLIES = 200;                                           // 이만큼 두면 점수로 판정

export const R_ = (i) => (i / 9) | 0;
export const F_ = (i) => i % 9;
const at = (r, f) => r * 9 + f;
const onB = (r, f) => r >= 0 && r < 10 && f >= 0 && f < 9;
const other = (c) => (c === "w" ? "b" : "w");

function inPalace(r, f) { return f >= 3 && f <= 5 && ((r >= 0 && r <= 2) || (r >= 7 && r <= 9)); }
const sameHalf = (r1, r2) => (r1 <= 4) === (r2 <= 4);
// 궁성 안 대각선: 한쪽이 궁성 가운데이고 다른 쪽이 모서리일 때만 선이 있다
function palDiag(r, f, dr, df) {
  const r2 = r + dr, f2 = f + df;
  if (!inPalace(r, f) || !inPalace(r2, f2) || !sameHalf(r, r2)) return false;
  const c = r <= 4 ? 1 : 8;
  return (r === c && f === 4) || (r2 === c && f2 === 4);
}

// 상차림 (보는 사람 왼쪽부터 b·c·g·h 줄): 마=H, 상=E
export const SETUPS = { "마상마상": "HEHE", "상마상마": "EHEH", "마상상마": "HEEH", "상마마상": "EHHE" };

export function initialBoard(setupW = "마상마상", setupB = "마상마상") {
  // 말마다 번호를 붙여 칸마다 다른 캐릭터 그림을 쓴다: 번호는 그 진영 사람이 보는 왼쪽부터 1, 2, …
  // (초는 아래에서 보므로 f 작은 쪽이 왼쪽, 한은 위에서 보므로 f 큰 쪽이 왼쪽)
  const b = new Array(90).fill(null);
  const put = (c, t, row, files) => {
    const ord = [...files].sort((x, y) => (c === "w" ? x - y : y - x));
    ord.forEach((f, k) => { b[at(row, f)] = c + t + (files.length > 1 ? k + 1 : ""); });
  };
  for (const [c, back, pal, cann, pawn, setup] of [["w", 9, 8, 7, 6, setupW], ["b", 0, 1, 2, 3, setupB]]) {
    const s = SETUPS[setup] || "HEHE";
    const sideFiles = c === "w" ? [1, 2, 6, 7] : [7, 6, 2, 1];   // 보는 사람 왼쪽부터
    put(c, "H", back, sideFiles.filter((f, k) => s[k] === "H"));
    put(c, "E", back, sideFiles.filter((f, k) => s[k] === "E"));
    put(c, "R", back, [0, 8]);
    put(c, "A", back, [3, 5]);
    b[at(pal, 4)] = c + "K";
    put(c, "C", cann, [1, 7]);
    put(c, "P", pawn, [0, 2, 4, 6, 8]);
  }
  return b;
}

const ORTH = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

/** i 칸 말이 갈 수 있는 칸 (자기 궁이 장군 받는지는 보지 않음) → push(to) */
export function pieceTargets(board, i, push) {
  const p = board[i]; if (!p) return;
  const c = p[0], t = p[1], r = R_(i), f = F_(i);
  const can = (j) => { const q = board[j]; return !q || q[0] !== c; };
  if (t === "K" || t === "A") {
    for (const [dr, df] of ORTH) {
      const r2 = r + dr, f2 = f + df;
      if (inPalace(r2, f2) && sameHalf(r, r2) && can(at(r2, f2))) push(at(r2, f2));
    }
    for (const [dr, df] of DIAG) if (palDiag(r, f, dr, df) && can(at(r + dr, f + df))) push(at(r + dr, f + df));
  } else if (t === "R") {
    for (const [dr, df] of ORTH) {
      for (let r2 = r + dr, f2 = f + df; onB(r2, f2); r2 += dr, f2 += df) {
        const q = board[at(r2, f2)];
        if (!q) push(at(r2, f2)); else { if (q[0] !== c) push(at(r2, f2)); break; }
      }
    }
    for (const [dr, df] of DIAG) {
      for (let r2 = r, f2 = f; palDiag(r2, f2, dr, df); r2 += dr, f2 += df) {
        const q = board[at(r2 + dr, f2 + df)];
        if (!q) push(at(r2 + dr, f2 + df)); else { if (q[0] !== c) push(at(r2 + dr, f2 + df)); break; }
      }
    }
  } else if (t === "C") {
    // 포: 포가 아닌 말 하나를 넘어서 간다. 포는 넘지도 잡지도 못한다
    for (const [dr, df] of ORTH) {
      let r2 = r + dr, f2 = f + df;
      while (onB(r2, f2) && !board[at(r2, f2)]) { r2 += dr; f2 += df; }
      if (!onB(r2, f2) || board[at(r2, f2)][1] === "C") continue;
      for (r2 += dr, f2 += df; onB(r2, f2); r2 += dr, f2 += df) {
        const q = board[at(r2, f2)];
        if (!q) push(at(r2, f2)); else { if (q[0] !== c && q[1] !== "C") push(at(r2, f2)); break; }
      }
    }
    for (const [dr, df] of DIAG) {
      if (!palDiag(r, f, dr, df) || !palDiag(r + dr, f + df, dr, df)) continue;   // 모서리 → 가운데 → 모서리
      const mid = board[at(r + dr, f + df)], j = at(r + 2 * dr, f + 2 * df), q = board[j];
      if (mid && mid[1] !== "C" && (!q || (q[0] !== c && q[1] !== "C"))) push(j);
    }
  } else if (t === "H" || t === "E") {
    // 마: 한 칸 곧게 + 한 칸 비스듬히 / 상: 한 칸 곧게 + 두 칸 비스듬히. 지나는 칸이 막히면 못 간다
    const steps = t === "H" ? 1 : 2;
    for (const [dr, df] of ORTH) {
      const r1 = r + dr, f1 = f + df;
      if (!onB(r1, f1) || board[at(r1, f1)]) continue;
      const sides = dr ? [[dr, -1], [dr, 1]] : [[-1, df], [1, df]];
      for (const [sr, sf] of sides) {
        let rr = r1, ff = f1, ok = true;
        for (let k = 1; k <= steps; k++) {
          rr += sr; ff += sf;
          if (!onB(rr, ff)) { ok = false; break; }
          if (k < steps && board[at(rr, ff)]) { ok = false; break; }
        }
        if (ok && can(at(rr, ff))) push(at(rr, ff));
      }
    }
  } else if (t === "P") {
    const fw = c === "w" ? -1 : 1;
    for (const [dr, df] of [[fw, 0], [0, -1], [0, 1]]) {
      const r2 = r + dr, f2 = f + df;
      if (onB(r2, f2) && can(at(r2, f2))) push(at(r2, f2));
    }
    for (const df of [-1, 1]) if (palDiag(r, f, fw, df) && can(at(r + fw, f + df))) push(at(r + fw, f + df));
  }
}

export function findKing(board, c) { return board.indexOf(c + "K"); }

/** sq 칸을 by 진영이 노리고 있나 */
export function attacked(board, sq, by) {
  for (let i = 0; i < 90; i++) {
    const p = board[i];
    if (!p || p[0] !== by) continue;
    let hit = false;
    pieceTargets(board, i, (j) => { if (j === sq) hit = true; });
    if (hit) return true;
  }
  return false;
}

export function inCheck(board, c) { const k = findKing(board, c); return k >= 0 && attacked(board, k, other(c)); }

/** 진영 c 의 둘 수 있는 수 [{from,to,piece,captured}] (자기 궁을 장군 받게 두는 수는 뺀다) */
export function legalMoves(board, c, onlyFrom = -1) {
  const out = [];
  for (let i = 0; i < 90; i++) {
    const p = board[i];
    if (!p || p[0] !== c || (onlyFrom >= 0 && i !== onlyFrom)) continue;
    pieceTargets(board, i, (j) => {
      const cap = board[j];
      board[j] = p; board[i] = null;
      const bad = inCheck(board, c);
      board[i] = p; board[j] = cap;
      if (!bad) out.push({ from: i, to: j, piece: p, captured: cap });
    });
  }
  return out;
}

export function score(board, c) {
  let s = c === "b" ? HAN_BONUS : 0;
  for (const p of board) if (p && p[0] === c) s += POINTS[p[1]];
  return s;
}

/** 게임 한 판: 판 + 차례 + 기록 */
export class Janggi {
  constructor(setupW = "마상마상", setupB = "마상마상") { this.reset(setupW, setupB); }
  reset(setupW = this.setupW, setupB = this.setupB) {
    this.setupW = setupW; this.setupB = setupB;
    this.board = initialBoard(setupW, setupB);
    this.turn = "w"; this.hist = [];
  }
  get(i) { return this.board[i]; }
  moves(from = -1) { return legalMoves(this.board, this.turn, from); }
  inCheck(c = this.turn) { return inCheck(this.board, c); }
  /** m = {from,to} 또는 {pass:true} (둘 수가 없을 때 한 수 쉼) */
  move(m) {
    if (m.pass) { this.hist.push({ pass: true, turn: this.turn }); this.turn = other(this.turn); return m; }
    const ok = legalMoves(this.board, this.turn, m.from).find((x) => x.to === m.to);
    if (!ok) return null;
    this.board[m.to] = ok.piece; this.board[m.from] = null;
    const rec = { ...ok, turn: this.turn, check: false };
    this.turn = other(this.turn);
    rec.check = inCheck(this.board, this.turn);
    this.hist.push(rec);
    return rec;
  }
  undo() {
    const h = this.hist.pop(); if (!h) return null;
    this.turn = h.turn;
    if (!h.pass) { this.board[h.from] = h.piece; this.board[h.to] = h.captured; }
    return h;
  }
  plies() { return this.hist.length; }
  /** 끝났으면 {winner:'w'|'b'|null, why} */
  result() {
    const legal = this.moves();
    if (!legal.length) {
      if (this.inCheck()) return { winner: other(this.turn), why: "mate" };
      // 둘 다 둘 수가 없으면 비김 (한 수 쉼은 화면이 처리)
      if (!legalMoves(this.board, other(this.turn)).length) return { winner: null, why: "stuck" };
      return null;
    }
    if (this.hist.length >= MAX_PLIES) {
      const w = score(this.board, "w"), b = score(this.board, "b");
      return { winner: w > b ? "w" : "b", why: "points", w, b };
    }
    return null;
  }
  toJSON() { return { setupW: this.setupW, setupB: this.setupB, moves: this.hist.map((h) => (h.pass ? "pass" : [h.from, h.to])) }; }
  static fromJSON(s) {
    const g = new Janggi(s.setupW, s.setupB);
    for (const m of s.moves || []) { if (!g.move(m === "pass" ? { pass: true } : { from: m[0], to: m[1] })) break; }
    return g;
  }
}
