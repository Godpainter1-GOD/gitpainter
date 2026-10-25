// 온라인 1:1 — Cloudflare Worker(Durable Object) 방에 둘이 접속해 메시지를 서로 전달한다.
// 방장(host)이 경기를 계산하고 손님(guest)은 입력만 보낸다. 서버: worker/src/index.js
export const SERVER = "wss://pureday-fc.godpainter.workers.dev";
export function makeCode() { const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let s = ""; for (let i = 0; i < 5; i++) s += A[Math.floor(Math.random() * A.length)]; return s; }
export function connect(code, role, handlers) {
  const ws = new WebSocket(`${SERVER}/room/${code}?role=${role}`);
  const api = { ws, open: false, send(obj) { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); }, close() { try { ws.close(); } catch (e) {} } };
  ws.onopen = () => { api.open = true; handlers.open && handlers.open(); };
  ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch (_) { return; } handlers.msg && handlers.msg(m); };
  ws.onclose = (e) => { api.open = false; handlers.close && handlers.close(e); };
  ws.onerror = () => { handlers.error && handlers.error(); };
  return api;
}
