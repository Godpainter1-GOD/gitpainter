// 🖼 퓨어데이 센터 2층 회차 안내 홀 — 카드 미리보기 + 본편 보기
// (2026-11-14 대표님: "갤러리에 그림들을 보면 각화의 대표 컷인데 미리보기에서 대략의 줄거리와 본편보기 버튼이 퓨어데이 웹툰 페이지와 연결되면 좋겠어요")
// - 카드 자리는 블렌더가 seoul_layout.json(center.cards)에 함께 내보낸다. 회차 글은 center_episodes.json(포털 data.js 에서 center_data.py 가 뽑음).
// - 카드 앞 2.6m 안에 서면 아래쪽에 안내가 뜬다 → F 키 · 안내 누르기 · 카드 직접 누르기로 미리보기 창.
// - 미리보기 창: 대표 컷(회차 표지) · 시리즈 · 회차 · 제목 · 줄거리 · 「📖 본편 보기 ↗」(웹툰 포털 뷰어, 새 탭) · 이전/다음 회차.
import * as THREE from 'three';

export function createGallery(host, city, { cards = [], episodes = [], isActive, levelNow, toCity }) {
  const key = (s, n) => `${s}:${n}`;
  const byKey = new Map(episodes.map((e, i) => [key(e.series, e.num), { ...e, i }]));
  // 카드마다 보이지 않는 판(누르기 검사용) — 거리 좌표(x, 위, −y)
  const pickMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false });
  const picks = cards.map((c, i) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(c.w, c.h), pickMat);
    m.position.set(c.x, c.z, -c.y); m.rotation.y = Math.atan2(c.n[0], -c.n[1]); m.userData.card = i; m.name = `CARD_${c.series}_${c.num}`;
    city.add(m); return m;
  });

  const css = document.createElement('style');
  css.textContent = `
.pd-hint{position:fixed;left:50%;bottom:92px;transform:translateX(-50%);z-index:16;background:rgba(14,22,34,.86);color:#fff;font:600 14px/1.4 system-ui,sans-serif;padding:9px 16px;border-radius:12px;cursor:pointer;border:1px solid rgba(255,255,255,.18);max-width:min(560px,calc(100vw - 32px));white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pd-hint[hidden],.pd-modal[hidden]{display:none}
.pd-hint b{color:#ffd77a}
.pd-modal{position:fixed;inset:0;z-index:40;background:rgba(6,10,16,.62);display:flex;align-items:center;justify-content:center;padding:16px}
.pd-card{display:flex;gap:20px;background:#fbfaf6;color:#20232a;border-radius:16px;max-width:820px;width:100%;max-height:calc(100vh - 32px);overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,.4);font:15px/1.65 system-ui,sans-serif}
.pd-card img{width:300px;max-width:42%;object-fit:cover;border-radius:16px 0 0 16px;background:#222;flex:none}
.pd-body{padding:22px 22px 20px 0;display:flex;flex-direction:column;gap:10px;min-width:0}
.pd-series{font-weight:700;font-size:13px;letter-spacing:.02em}
.pd-title{font-weight:800;font-size:22px;line-height:1.3;margin:0}
.pd-sum{margin:0;color:#3d4149;white-space:pre-wrap}
.pd-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:auto;padding-top:6px}
.pd-row button,.pd-row a{border:0;border-radius:10px;padding:10px 14px;font:700 14px system-ui,sans-serif;cursor:pointer;text-decoration:none}
.pd-read{background:#2878c8;color:#fff}.pd-nav{background:#e9e6de;color:#20232a}.pd-close{background:transparent;color:#5a5f68;margin-left:auto}
@media (max-width:640px){.pd-card{flex-direction:column}.pd-card img{width:100%;max-width:none;height:260px;border-radius:16px 16px 0 0}.pd-body{padding:4px 18px 18px}}`;
  document.head.append(css);
  const hint = document.createElement('div'); hint.className = 'pd-hint'; hint.hidden = true; document.body.append(hint);
  const modal = document.createElement('div'); modal.className = 'pd-modal'; modal.hidden = true;
  modal.innerHTML = `<div class="pd-card" role="dialog" aria-modal="true" aria-label="회차 미리보기"><img alt=""><div class="pd-body">
    <div class="pd-series"></div><h2 class="pd-title"></h2><p class="pd-sum"></p>
    <div class="pd-row"><a class="pd-read" target="_blank" rel="noopener">📖 본편 보기 ↗</a><button class="pd-nav" data-d="-1">◀ 이전 회차</button><button class="pd-nav" data-d="1">다음 회차 ▶</button><button class="pd-close">닫기 ✕</button></div></div></div>`;
  document.body.append(modal);
  const $ = (s) => modal.querySelector(s);
  const COLORS = { pureday: '#2878c8', pureday2: '#c85a3c', mingtori: '#5a9650' };
  let current = -1, near = -1;

  function open(i) {
    const e = episodes[i]; if (!e) return;
    current = i;
    $('img').src = new URL(`./assets/${e.cover}`, import.meta.url).href; $('img').alt = `${e.label} ${e.title} 대표 컷`;
    $('.pd-series').textContent = e.seriesName; $('.pd-series').style.color = COLORS[e.series] || '#2878c8';
    $('.pd-title').textContent = `${e.label} · ${e.title}`;
    $('.pd-sum').textContent = e.summary || '';
    $('.pd-read').href = e.url;
    $('[data-d="-1"]').disabled = i <= 0; $('[data-d="1"]').disabled = i >= episodes.length - 1;
    modal.hidden = false; hint.hidden = true;
  }
  function close() { modal.hidden = true; current = -1; }
  modal.addEventListener('click', (ev) => {
    if (ev.target === modal || ev.target.closest('.pd-close')) return close();
    const nav = ev.target.closest('[data-d]'); if (nav) open(current + Number(nav.dataset.d));
  });
  for (const ev of ['keydown', 'keyup', 'pointerdown', 'wheel']) modal.addEventListener(ev, (e) => e.stopPropagation());
  addEventListener('keydown', (e) => {
    if (!modal.hidden) { if (e.code === 'Escape') { close(); e.preventDefault(); } else if (e.code === 'ArrowLeft') open(current - 1); else if (e.code === 'ArrowRight') open(current + 1); e.stopPropagation(); return; }
    if (e.code === 'KeyF' && near >= 0 && isActive()) { const c = cards[near], ep = byKey.get(key(c.series, c.num)); if (ep) open(ep.i); e.preventDefault(); }
  }, true);
  hint.addEventListener('click', () => { if (near < 0) return; const c = cards[near], ep = byKey.get(key(c.series, c.num)); if (ep) open(ep.i); });

  // 카드 직접 누르기(끌어서 시점을 돌린 것은 빼고)
  const canvas = host.renderer.domElement, ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let down = null;
  canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  canvas.addEventListener('pointerup', (e) => {
    if (!down || !isActive() || !modal.hidden) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y), quick = performance.now() - down.t < 500; down = null;
    if (moved > 6 || !quick) return;
    const r = canvas.getBoundingClientRect(); ndc.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
    ray.setFromCamera(ndc, host.camera); ray.far = 22;
    const hit = ray.intersectObjects(picks, false)[0]; if (!hit) return;
    const c = cards[hit.object.userData.card], ep = byKey.get(key(c.series, c.num)); if (ep) open(ep.i);
  });

  function update() {
    near = -1;
    if (!isActive() || levelNow() !== 1) { hint.hidden = true; return; }
    const { bx, by } = toCity();
    let best = 2.6;
    cards.forEach((c, i) => {
      const dx = bx - c.x, dy = by - c.y, d = Math.hypot(dx, dy), front = dx * c.n[0] + dy * c.n[1];
      if (front > .2 && d < best) { best = d; near = i; }
    });
    if (near < 0 || !modal.hidden) { hint.hidden = true; return; }
    const c = cards[near], ep = byKey.get(key(c.series, c.num));
    const html = ep ? `🖼 <b>${ep.label}</b> ${ep.title} · <b>F</b> 또는 눌러서 미리보기` : '';
    if (hint.innerHTML !== html) hint.innerHTML = html;
    hint.hidden = !ep;
  }
  return { update, open, close, isOpen: () => !modal.hidden, near: () => near, cards: cards.length };
}
