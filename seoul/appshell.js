// newgame 바탕화면 · ⚙ 메뉴 — bongsik/project-map/m003 appshell.js에서 "기능을 아이콘으로 정리하는" 부분만 옮겼다.
// (m003 2026-11-03 사용자: "컨텐츠 관련 기능들 아이콘들을 다 없애줘 … 아이콘이 하나 생겨 그것을 누르면 텝 메뉴가 생성되.. 그안에서 메뉴 에디터를 추가 해줘..
//  자주 쓰는것을 즐겨찾기 화면에 빼둘수 있어.. 그것을 바탕화면에 활성화 하고나 뺄수 있어 … 폰에서 처럼 어딘가에 폴더 형태로 넣기도 하고 뺄수도 있어")
// - 기능 하나 = 앱 하나: { id, icon, title, sub, run(anchor), running() }. 앱 목록은 main.js가 넘긴다(실행은 main.js의 함수).
// - 바탕화면(.desk): 왼쪽. 맨 위 ⚙, 그 아래 꺼내 둔 앱(켜져 있으면 초록 점). 아이콘을 오른쪽 클릭(폰은 길게 누르기)하면 빼기 메뉴.
// - ⚙ 메뉴(.aw): ⭐ 즐겨찾기(바탕화면 켜기·빼기) · 📱 앱(폰 홈 화면 같은 폴더 격자) · ✏️ 메뉴 편집(순서·폴더 옮기기·새 폴더·이름·풀기·빼기)
// - 📦 꾸러미: 지금 깔린 꾸러미(apps/*.zip) 목록. 꾸러미가 새로 들어오면 그 앱을 저장된 배치에도 알아서 넣는다(known = 이미 본 앱).
// - 배치는 이 브라우저(localStorage)에 저장한다. m003의 해시·창고·스토어·도킹 거래·서버 저장은 가져오지 않았다.
const MAX_DEPTH = 4, STORE_KEY = 'newgame-apps-layout';
const TABS = [['fav', '⭐ 즐겨찾기'], ['apps', '📱 앱'], ['edit', '✏️ 메뉴 편집'], ['pkgs', '📦 꾸러미']];

// 작은 DOM 도우미: h('button', {class:'x', onclick}, '글자', child…)
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) el.append(kid instanceof Node ? kid : String(kid));
  return el;
}
const clone = (v) => JSON.parse(JSON.stringify(v));
function* walk(nodes, path = []) {
  for (const node of nodes) { yield { node, path }; if (node.type === 'folder') yield* walk(node.children, [...path, node]); }
}
function findFolder(nodes, id) {
  for (const { node } of walk(nodes)) if (node.type === 'folder' && node.id === id) return node;
  return null;
}

// packages: 깔린 꾸러미 목록(packages.json) · apps: 앱 목록 · defaults: { menu:[{type:'folder',id,name,children}|{type:'app',id}], favorites:[id], desktop:[id] }
export function createAppShell({ apps, defaults, packages = [] }) {
  const root = document.getElementById('experience') || document.body;
  const byId = new Map(apps.map(a => [a.id, a]));
  const appOf = (id) => byId.get(id);
  let tab = 'apps', appPath = [];

  // ---------- 배치 저장(이 브라우저) ----------
  function prune(l) {   // 없는 앱은 메뉴·즐겨찾기·바탕화면에서 뺀다. 바탕화면에 있으면 즐겨찾기에도 있다
    const keep = (nodes) => (Array.isArray(nodes) ? nodes : []).filter(n => n && (n.type === 'folder' ? typeof n.id === 'string' : byId.has(n.id)))
      .map(n => (n.type === 'folder' ? { type: 'folder', id: n.id, name: String(n.name || '폴더').slice(0, 24), children: keep(n.children) } : { type: 'app', id: n.id }));
    const ids = (list) => [...new Set((Array.isArray(list) ? list : []).filter(id => byId.has(id)))];
    const favorites = ids(l?.favorites);
    return { menu: keep(l?.menu), favorites, desktop: ids(l?.desktop).filter(id => favorites.includes(id)), known: [...byId.keys()] };
  }
  let layout = prune(defaults);
  const save = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify(layout)); } catch {} };
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY));
    if (saved?.menu) {
      // 저장한 뒤에 새로 깔린 꾸러미의 앱은 처음 배치의 자리(폴더·즐겨찾기·바탕화면)에 넣어 준다. 사용자가 뺀 앱은 known에 있으니 다시 넣지 않는다
      const known = new Set(Array.isArray(saved.known) ? saved.known : [...[...walk(saved.menu)].map(x => x.node.id), ...(saved.favorites || [])]);
      layout = prune(saved);
      const fresh = apps.filter(a => !known.has(a.id));
      for (const a of fresh) {
        const home = [...walk(defaults.menu)].find(x => x.node.type === 'app' && x.node.id === a.id)?.path.at(-1);
        let into = layout.menu;
        if (home) { let f = findFolder(layout.menu, home.id); if (!f) { f = { type: 'folder', id: home.id, name: home.name, children: [] }; layout.menu.push(f); } into = f.children; }
        into.push({ type: 'app', id: a.id });
        if (defaults.favorites.includes(a.id)) layout.favorites.push(a.id);
        if (defaults.desktop.includes(a.id)) layout.desktop.push(a.id);
      }
      if (fresh.length || !Array.isArray(saved.known)) save();
    }
  } catch {}
  const update = (fn) => { const next = clone(layout); fn(next); layout = prune(next); save(); render(); };
  const inMenu = () => new Set([...walk(layout.menu)].filter(x => x.node.type === 'app').map(x => x.node.id));

  // ---------- 틀 ----------
  const desk = h('nav', { class: 'desk', 'aria-label': '바탕화면' });
  const aw = h('section', { class: 'aw', role: 'dialog', 'aria-label': '메뉴', hidden: true });
  const awHead = h('header', { class: 'aw-head' }), awTabs = h('div', { class: 'aw-tabs', role: 'tablist' }), awBody = h('div', { class: 'aw-body' });
  aw.append(awHead, awTabs, awBody);
  const toasts = h('div', { class: 'app-toasts', role: 'status', 'aria-live': 'polite' });
  const deskMenu = h('div', { class: 'desk-menu', hidden: true });
  root.append(desk, aw, toasts, deskMenu);
  for (const [id, label] of TABS) awTabs.append(h('button', { type: 'button', role: 'tab', dataset: { tab: id }, onclick: () => { tab = id; renderMenu(); } }, label));

  function toast(text, ms = 3600) {
    const t = h('div', { class: 'app-toast' }, h('p', {}, text), h('button', { type: 'button', class: 'app-toast-x', 'aria-label': '닫기', onclick: () => t.remove() }, '×'));
    toasts.append(t); setTimeout(() => t.remove(), ms); return t;
  }
  const btn = (label, onclick, attrs = {}) => h('button', { type: 'button', onclick, ...attrs }, label);
  const isRunning = (a) => { try { return Boolean(a.running?.()); } catch { return false; } };
  function run(a, anchor) {
    closeDeskMenu();
    let ok = false;
    try { ok = a.run(anchor) !== false; } catch (error) { console.warn('앱 실행 실패', a.id, error); }
    if (!ok) toast(`「${a.title}」을 지금 열 수 없어요.`);
    requestAnimationFrame(syncRunning);
    return ok;
  }

  // ---------- 즐겨찾기·바탕화면 ----------
  function toggleFavorite(id) {
    update(l => {
      if (l.favorites.includes(id)) { l.favorites = l.favorites.filter(x => x !== id); l.desktop = l.desktop.filter(x => x !== id); }
      else l.favorites.push(id);
    });
  }
  function setDesktop(id, on) {
    update(l => {
      if (on) { if (!l.favorites.includes(id)) l.favorites.push(id); if (!l.desktop.includes(id)) l.desktop.push(id); }
      else l.desktop = l.desktop.filter(x => x !== id);
    });
  }

  // ---------- 바탕화면 ----------
  function renderDesk() {
    desk.replaceChildren(h('button', { type: 'button', class: 'desk-icon desk-admin', 'aria-label': '메뉴', 'aria-expanded': String(!aw.hidden), dataset: { label: '메뉴 · 앱 정리' }, onclick: () => (aw.hidden ? openMenu() : closeMenu()) }, h('span', {}, '⚙')));
    for (const id of layout.desktop) {
      const a = appOf(id); if (!a) continue;
      const b = h('button', { type: 'button', class: 'desk-icon', 'aria-label': a.title, dataset: { label: a.title, app: id } }, h('span', {}, a.icon));
      let held = false, press = 0;   // 길게 눌러 빼기 메뉴를 연 뒤 손을 떼도 앱이 실행되지 않게
      b.addEventListener('click', () => { if (held) { held = false; return; } run(a, b); });
      b.addEventListener('contextmenu', (e) => { e.preventDefault(); openDeskMenu(b, id); });
      b.addEventListener('pointerdown', (e) => { held = false; if (e.pointerType !== 'mouse') press = setTimeout(() => { held = true; openDeskMenu(b, id); }, 600); });
      for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => clearTimeout(press));
      desk.append(b);
    }
    syncRunning();
  }
  function syncRunning() {   // 켜져 있는 앱 = 초록 점(바탕화면·메뉴 격자 둘 다)
    for (const el of root.querySelectorAll('[data-app]')) { const a = appOf(el.dataset.app); if (a) el.classList.toggle('running', isRunning(a)); }
  }
  setInterval(syncRunning, 500);
  function openDeskMenu(anchor, id) {
    const a = appOf(id); if (!a) return;
    deskMenu.replaceChildren(h('b', {}, `${a.icon} ${a.title}`),
      btn('바탕화면에서 빼기', () => { closeDeskMenu(); setDesktop(id, false); }),
      btn('즐겨찾기에서도 빼기', () => { closeDeskMenu(); toggleFavorite(id); }),
      btn('⚙ 메뉴에서 정리', () => { closeDeskMenu(); tab = 'fav'; openMenu(); }));
    const r = anchor.getBoundingClientRect();
    deskMenu.hidden = false;
    deskMenu.style.left = `${Math.min(r.right + 10, innerWidth - deskMenu.offsetWidth - 8)}px`; deskMenu.style.top = `${Math.min(r.top, innerHeight - deskMenu.offsetHeight - 8)}px`;
  }
  function closeDeskMenu() { deskMenu.hidden = true; }
  addEventListener('pointerdown', (e) => { if (!deskMenu.hidden && !deskMenu.contains(e.target)) closeDeskMenu(); }, { capture: true });

  // ---------- ⚙ 메뉴 ----------
  function openMenu() { aw.hidden = false; render(); }
  function closeMenu() { aw.hidden = true; renderDesk(); }
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !e.isComposing) { if (!aw.hidden) closeMenu(); closeDeskMenu(); } });
  function render() { renderDesk(); renderMenu(); }
  function renderMenu() {
    if (aw.hidden) return;
    const scroll = awBody.scrollTop, sameTab = awBody.dataset.tab === tab;
    awHead.replaceChildren(h('div', {}, h('b', {}, '⚙ 메뉴'), h('small', {}, `앱 ${apps.length}개 · 즐겨찾기 ${layout.favorites.length} · 바탕화면 ${layout.desktop.length} · 배치는 이 브라우저에 저장`)),
      btn('×', closeMenu, { class: 'aw-x', 'aria-label': '메뉴 닫기' }));
    for (const b of awTabs.children) b.setAttribute('aria-selected', String(b.dataset.tab === tab));
    awBody.replaceChildren(...({ fav: tabFav, apps: tabApps, edit: tabEdit, pkgs: tabPackages })[tab]());
    awBody.dataset.tab = tab;
    if (sameTab) awBody.scrollTop = scroll;
    syncRunning();
  }
  function tile(a, extra = []) {
    const t = h('div', { class: 'app-tile' });
    const open = h('button', { type: 'button', class: 'app-tile-open', title: `${a.title}${a.sub ? ` · ${a.sub}` : ''}`, dataset: { app: a.id } }, h('span', { class: 'app-tile-icon' }, a.icon), h('span', { class: 'app-tile-name' }, a.title));
    open.addEventListener('click', () => { if (run(a, open)) closeMenu(); });
    t.append(open);
    if (extra.length) t.append(h('div', { class: 'app-tile-extra' }, extra));
    return t;
  }
  const star = (id) => btn(layout.favorites.includes(id) ? '★' : '☆', () => toggleFavorite(id), { class: 'star', title: layout.favorites.includes(id) ? '즐겨찾기에서 빼기' : '즐겨찾기에 넣기', 'aria-pressed': String(layout.favorites.includes(id)) });

  // ⭐ 즐겨찾기: 바탕화면 켜기·빼기
  function tabFav() {
    const favs = layout.favorites.map(appOf).filter(Boolean);
    const grid = h('div', { class: 'app-grid' });
    for (const a of favs) grid.append(tile(a, [
      h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: layout.desktop.includes(a.id), onchange: (e) => setDesktop(a.id, e.target.checked) }), h('span', {}, '바탕화면')),
      btn('빼기', () => toggleFavorite(a.id), { class: 'mini', title: '즐겨찾기에서 빼기' })]));
    return [h('p', { class: 'aw-note' }, '자주 쓰는 앱이에요. ', h('b', {}, '바탕화면'), ' 스위치를 켜면 왼쪽 ⚙ 아래에 아이콘이 생겨요. 📱 앱이나 ✏️ 메뉴 편집에서 ☆를 눌러 더할 수 있어요.'),
      favs.length ? grid : h('p', { class: 'aw-empty' }, '즐겨찾기한 앱이 없어요.')];
  }

  // 📱 앱: 폰 홈 화면처럼 폴더 격자. 위쪽 칩 = 첫 단계 폴더
  function tabApps() {
    const menu = layout.menu;
    let folder = { children: menu }; const trail = [];
    for (const id of appPath) { const f = folder.children.find(n => n.type === 'folder' && n.id === id); if (!f) break; trail.push(f); folder = f; }
    appPath = trail.map(f => f.id);
    const go = (path) => { appPath = path; renderMenu(); };
    const chips = h('div', { class: 'chips' }, btn('🏠 홈', () => go([]), { 'aria-pressed': String(!appPath.length) }),
      menu.filter(n => n.type === 'folder').map(f => btn(f.name, () => go([f.id]), { 'aria-pressed': String(appPath[0] === f.id) })));
    const crumbs = h('div', { class: 'crumbs' }, btn('홈', () => go([])), trail.map((f, i) => [' › ', btn(f.name, () => go(appPath.slice(0, i + 1)))]));
    const grid = h('div', { class: 'app-grid' });
    for (const node of folder.children) {
      if (node.type === 'folder') {
        const inside = [...walk(node.children)].filter(x => x.node.type === 'app').map(x => appOf(x.node.id)).filter(Boolean);
        grid.append(h('div', { class: 'app-tile folder' }, h('button', { type: 'button', class: 'app-tile-open', onclick: () => go([...appPath, node.id]) },
          h('span', { class: 'app-tile-icon folder-icon' }, inside.slice(0, 4).map(a => h('i', {}, a.icon))), h('span', { class: 'app-tile-name' }, `${node.name} (${inside.length})`))));
      } else { const a = appOf(node.id); if (a) grid.append(tile(a, [star(a.id)])); }
    }
    if (!folder.children.length) grid.append(h('p', { class: 'aw-empty' }, '빈 폴더예요. ✏️ 메뉴 편집에서 앱을 옮겨 넣어요.'));
    return [chips, trail.length ? crumbs : null, grid, h('p', { class: 'aw-note foot' }, '앱을 누르면 실행하고 창을 닫아요. ☆를 누르면 즐겨찾기에 들어가요. 폴더 구성은 ✏️ 메뉴 편집에서 바꿔요.')].filter(Boolean);
  }

  // ✏️ 메뉴 편집: 순서·폴더 옮기기·새 폴더·이름·풀기·빼기·즐겨찾기
  const nodeAt = (menu, path) => path.reduce((list, i, k) => (k === path.length - 1 ? list[i] : list[i].children), menu);
  const listAt = (menu, path) => path.slice(0, -1).reduce((list, i) => list[i].children, menu);
  const height = (node) => (node.type === 'folder' ? 1 + Math.max(0, ...node.children.map(height)) : 0);
  const folders = (menu) => [...walk(menu)].filter(x => x.node.type === 'folder').map(x => ({ id: x.node.id, name: x.node.name, depth: x.path.length + 1 }));
  const folderOptions = (menu, banned = new Set(), maxDepth = MAX_DEPTH) => folders(menu).filter(f => !banned.has(f.id) && f.depth <= maxDepth).map(f => h('option', { value: f.id }, `${'  '.repeat(f.depth - 1)}📁 ${f.name}`));
  function moveTo(path, targetId) {
    update(l => {
      const node = nodeAt(l.menu, path), list = listAt(l.menu, path);
      const target = targetId ? findFolder(l.menu, targetId) : { children: l.menu };
      if (!target || target === node) return;
      if (node.type === 'folder' && [...walk(node.children)].some(x => x.node === target)) return;
      const depth = targetId ? folders(l.menu).find(f => f.id === targetId).depth : 0;
      if (depth + height(node) > MAX_DEPTH) { toast(`폴더는 ${MAX_DEPTH}단계까지 넣을 수 있어요.`); return; }
      list.splice(list.indexOf(node), 1); target.children.push(node);
    });
  }
  function moveSelect(path, node) {
    const banned = node.type === 'folder' ? new Set([node.id, ...[...walk(node.children)].filter(x => x.node.type === 'folder').map(x => x.node.id)]) : new Set();
    return h('select', { 'aria-label': '옮길 폴더', onchange: (e) => { if (e.target.value !== '-') moveTo(path, e.target.value === 'root' ? null : e.target.value); } },
      h('option', { value: '-' }, '옮기기…'), h('option', { value: 'root' }, '🏠 홈(맨 위)'), folderOptions(layout.menu, banned));
  }
  function tabEdit() {
    const menu = layout.menu, rows = h('div', { class: 'tree' });
    const add = (nodes, path) => nodes.forEach((node, i) => {
      const p = [...path, i], depth = p.length - 1;
      const order = [btn('↑', () => update(l => { const list = listAt(l.menu, p); if (i > 0) [list[i - 1], list[i]] = [list[i], list[i - 1]]; }), { class: 'mini', disabled: i === 0, 'aria-label': '위로' }),
        btn('↓', () => update(l => { const list = listAt(l.menu, p); if (i < list.length - 1) [list[i + 1], list[i]] = [list[i], list[i + 1]]; }), { class: 'mini', disabled: i === nodes.length - 1, 'aria-label': '아래로' })];
      if (node.type === 'folder') {
        rows.append(h('div', { class: 'tree-row folder', style: `--d:${depth}` }, h('span', { class: 'tree-name' }, `📁 ${node.name}`), h('small', {}, `${node.children.length}개`),
          h('span', { class: 'tree-acts' }, order, moveSelect(p, node),
            btn('이름', () => { const name = prompt('폴더 이름', node.name)?.trim(); if (name) update(l => { nodeAt(l.menu, p).name = name.slice(0, 24); }); }, { class: 'mini' }),
            btn('풀기', () => update(l => { const list = listAt(l.menu, p), f = nodeAt(l.menu, p); list.splice(list.indexOf(f), 1, ...f.children); }), { class: 'mini', title: '폴더를 없애고 안의 것을 한 단계 위로' }))));
        add(node.children, p);
      } else {
        const a = appOf(node.id); if (!a) return;
        rows.append(h('div', { class: 'tree-row', style: `--d:${depth}` }, h('span', { class: 'tree-name' }, `${a.icon} ${a.title}`),
          h('span', { class: 'tree-acts' }, order, moveSelect(p, node), star(a.id),
            btn('빼기', () => update(l => { listAt(l.menu, p).splice(i, 1); }), { class: 'mini', title: '메뉴에서 빼기(아래 "메뉴에 없는 앱"에서 다시 넣을 수 있어요)' }))));
      }
    });
    add(menu, []);
    const parentSel = h('select', { 'aria-label': '새 폴더 넣을 곳' }, h('option', { value: 'root' }, '🏠 홈'), folderOptions(menu, new Set(), MAX_DEPTH - 1));
    const nameIn = h('input', { type: 'text', maxlength: 24, placeholder: '새 폴더 이름', 'aria-label': '새 폴더 이름' });
    const bar = h('div', { class: 'aw-bar' }, nameIn, parentSel, btn('+ 새 폴더', () => {
      const name = nameIn.value.trim(); if (!name) { nameIn.focus(); return; }
      update(l => { const target = parentSel.value === 'root' ? { children: l.menu } : findFolder(l.menu, parentSel.value); target?.children.push({ type: 'folder', id: `f-${Date.now().toString(36)}`, name: name.slice(0, 24), children: [] }); });
    }, { class: 'primary' }), btn('처음 배치로 되돌리기', () => { if (confirm('메뉴·즐겨찾기·바탕화면을 처음 상태로 되돌릴까요?')) { layout = prune(defaults); save(); render(); } }, { class: 'ghost' }));
    const outside = apps.filter(a => !inMenu().has(a.id));
    const loose = h('div', { class: 'tree' }, outside.map(a => {
      const sel = h('select', { 'aria-label': '넣을 폴더' }, h('option', { value: '' }, '🏠 홈'), folderOptions(menu));
      return h('div', { class: 'tree-row' }, h('span', { class: 'tree-name' }, `${a.icon} ${a.title}`),
        h('span', { class: 'tree-acts' }, sel, btn('메뉴에 넣기', () => update(l => { (sel.value ? findFolder(l.menu, sel.value) : { children: l.menu })?.children.push({ type: 'app', id: a.id }); }), { class: 'mini' })));
    }));
    return [h('p', { class: 'aw-note' }, '폴더 안에 폴더를 넣어 나눠요(', String(MAX_DEPTH), '단계까지). ↑↓로 순서를 바꾸고, ', h('b', {}, '옮기기'), '로 다른 폴더에 넣어요.'),
      bar, rows, h('h3', {}, `메뉴에 없는 앱 (${outside.length})`), outside.length ? loose : h('p', { class: 'aw-empty' }, '모든 앱이 메뉴에 있어요.')];
  }

  // 📦 꾸러미: 지금 깔린 것. 넣고 빼는 것은 apps 폴더의 zip으로 한다
  function tabPackages() {
    const size = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`);
    const rows = h('div', { class: 'tree' }, packages.map(p => h('div', { class: `tree-row${p.kind === 'basic' ? ' folder' : ''}`, title: p.description || '' },
      h('span', {}, p.icon || '📦'), h('span', { class: 'tree-name' }, p.title, ' ', h('small', {}, `${p.zip} · v${p.version} · ${size(p.size)}`)),
      h('small', {}, p.kind === 'basic' ? '바탕(늘 있음)' : p.ok ? '켜짐' : '켜지 못함'))));
    return [h('p', { class: 'aw-note' }, '기능은 꾸러미(zip) 단위로 깔려요. ', h('b', {}, 'apps 폴더'), '에 zip을 넣고 새로고침하면 그 기능이 생기고, zip을 빼면 사라져요. ', h('b', {}, 'basic'), '은 다른 꾸러미가 올라타는 바탕이에요.'),
      packages.length ? rows : h('p', { class: 'aw-empty' }, '꾸러미 목록을 읽지 못했어요. play.py로 띄웠는지 확인해 주세요.'),
      ...packages.filter(p => p.notice).map(p => h('p', { class: 'aw-note foot' }, h('b', {}, `${p.title}: `), p.notice))];
  }

  renderDesk();
  return {
    open: (id) => { if (id) tab = id; openMenu(); }, close: closeMenu, toast, refresh: syncRunning,
    run: (id) => { const a = appOf(id); return a ? run(a) : false; },
    setDesktop, toggleFavorite,
    getState: () => ({ open: !aw.hidden, tab, path: [...appPath], layout: clone(layout), running: apps.filter(isRunning).map(a => a.id) }),
  };
}
