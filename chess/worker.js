// 컴퓨터 수 계산은 화면이 멈추지 않게 별도 작업자에서 한다
import { bestMove } from "./ai.js";
self.onmessage = (e) => {
  const { fen, level, id } = e.data;
  const m = bestMove(fen, level);
  self.postMessage({ id, move: m ? { from: m.from, to: m.to, promotion: m.promotion } : null });
};
