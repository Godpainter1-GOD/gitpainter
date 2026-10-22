// 너트 색깔 맞추기 — 규칙과 풀이기 (게임 화면과 단계 만들기 도구가 같이 쓴다)
// 판 = 볼트 배열, 볼트 = 아래→위 색 번호 배열. 한 볼트에 최대 CAP 개
export const CAP = 4;

/** 맨 위에서 같은 색이 몇 개 이어지나 */
export function topRun(b) {
  if (!b.length) return 0;
  const c = b[b.length - 1]; let n = 0;
  for (let i = b.length - 1; i >= 0 && b[i] === c; i--) n++;
  return n;
}
export const isDone = (b, cap = CAP) => b.length === cap && topRun(b) === cap;
export const solved = (st, cap = CAP) => st.every((b) => !b.length || isDone(b, cap));

/** from → to 로 옮길 수 있는 개수 (0이면 못 옮김). 같은 색이 이어져 있으면 들어갈 만큼 한꺼번에 */
export function canMove(st, from, to, cap = CAP) {
  if (from === to) return 0;
  const a = st[from], b = st[to];
  if (!a.length || b.length >= cap || isDone(a, cap)) return 0;
  const c = a[a.length - 1];
  if (b.length && b[b.length - 1] !== c) return 0;
  return Math.min(topRun(a), cap - b.length);
}
export function applyMove(st, from, to, cap = CAP) {
  const n = canMove(st, from, to, cap);
  if (!n) return 0;
  for (let k = 0; k < n; k++) st[to].push(st[from].pop());
  return n;
}

const key = (st) => st.map((b) => b.join(",")).sort().join("|");
/** 깊이 우선 풀이 (방문 기록·쓸모없는 수 걸러 내기). 찾으면 [[from,to],...], 못 찾으면 null */
export function solve(start, cap = CAP, limit = 200000) {
  const st = start.map((b) => b.slice());
  const seen = new Set([key(st)]);
  const path = [];
  let nodes = 0;
  function moves() {
    const out = [];
    for (let i = 0; i < st.length; i++) for (let j = 0; j < st.length; j++) {
      const n = canMove(st, i, j, cap);
      if (!n) continue;
      const a = st[i], b = st[j];
      if (!b.length && topRun(a) === a.length) continue;   // 한 색뿐인 볼트를 빈 볼트로 옮기는 건 의미 없음
      // 좋은 수 먼저: 같은 색 위로 · 옮기면 볼트가 완성 · 많이 옮김
      let score = n * 2 + (b.length ? 5 : 0) + (b.length + n === cap && topRun(b) + n === cap ? 20 : 0) + (topRun(a) === n && n < a.length ? 3 : 0);
      out.push([score, i, j]);
    }
    return out.sort((x, y) => y[0] - x[0]);
  }
  function dfs() {
    if (solved(st, cap)) return true;
    if (++nodes > limit) return false;
    for (const [, i, j] of moves()) {
      const n = applyMove(st, i, j, cap);
      const k = key(st);
      if (!seen.has(k)) {
        seen.add(k); path.push([i, j]);
        if (dfs()) return true;
        path.pop();
      }
      for (let t = 0; t < n; t++) st[i].push(st[j].pop());   // 되돌리기
      if (nodes > limit) return false;
    }
    return false;
  }
  return dfs() ? path : null;
}
