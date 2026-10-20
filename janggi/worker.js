// 컴퓨터 수 계산은 화면이 멈추지 않게 별도 작업자에서 한다
import { bestMove } from "./ai.js";
self.onmessage = (e) => {
  const { board, turn, level, id } = e.data;
  self.postMessage({ id, move: bestMove(board, turn, level) });
};
