// 📊 성능 표시(HUD) — 영상 지시문 "화면 구석에 드로우콜 수와 프레임 시간(ms)을 띄워 줘"와 스킬 threejs-performance의 "재기 먼저".
// basic은 고치지 않는다: host.renderer.render를 바깥에서 한 겹 감싸 ① render() 안의 CPU 시간 ② GPU 시간(EXT_disjoint_timer_query_webgl2)
// ③ render() 직후의 renderer.info(드로우콜 · 삼각형 — 그림자 패스 포함)를 모은다. 60프레임 평균. F3 또는 앱 📊로 켜고 끈다.
export function createPerf(host) {
  const renderer = host.renderer, gl = renderer.getContext();
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  const acc = { frames: 0, cpu: 0, gpu: 0, gpuN: 0, interval: 0 };
  const last = { calls: 0, triangles: 0, cpu: 0, gpu: null, frame: 0, geometries: 0, textures: 0, programs: 0 };
  let pending = [], prevT = 0;
  const render = renderer.render.bind(renderer);
  renderer.render = (scene, camera) => {
    let q = null;
    if (ext && pending.length < 4) { q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); }
    const t0 = performance.now();
    render(scene, camera);
    const t1 = performance.now();
    if (q) { gl.endQuery(ext.TIME_ELAPSED_EXT); pending.push(q); }
    // 끝난 GPU 측정 거두기(몇 프레임 늦게 온다)
    while (pending.length && gl.getQueryParameter(pending[0], gl.QUERY_RESULT_AVAILABLE)) {
      const done = pending.shift();
      if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) { acc.gpu += gl.getQueryParameter(done, gl.QUERY_RESULT) / 1e6; acc.gpuN++; }
      gl.deleteQuery(done);
    }
    const info = renderer.info;
    last.calls = info.render.calls; last.triangles = info.render.triangles;
    last.geometries = info.memory.geometries; last.textures = info.memory.textures; last.programs = info.programs?.length ?? 0;
    acc.cpu += t1 - t0; acc.frames++;
    if (prevT) acc.interval += t0 - prevT; prevT = t0;
    if (acc.frames >= 60) {
      last.cpu = acc.cpu / acc.frames; last.frame = acc.interval / (acc.frames - 1 || 1); last.gpu = acc.gpuN ? acc.gpu / acc.gpuN : null;
      acc.frames = acc.cpu = acc.gpu = acc.gpuN = acc.interval = 0;
      if (box.style.display !== 'none') draw();
    }
  };

  const box = document.createElement('div');
  box.className = 'hk-perf'; box.style.display = 'none';
  document.getElementById('experience').append(box);
  const css = document.createElement('style');
  css.textContent = '.hk-perf{position:fixed;right:16px;top:86px;z-index:40;font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;color:#e8f3e8;background:rgba(10,14,12,.72);padding:8px 10px;border-radius:8px;pointer-events:none;white-space:pre;border:1px solid rgba(120,200,140,.35)}';
  document.head.append(css);
  function draw() {
    box.textContent = `드로우콜 ${last.calls}\n삼각형  ${last.triangles.toLocaleString()}\n프레임  ${last.frame.toFixed(1)} ms\nCPU 렌더 ${last.cpu.toFixed(2)} ms\nGPU    ${last.gpu == null ? '—' : last.gpu.toFixed(2) + ' ms'}\n지오메트리 ${last.geometries} · 텍스처 ${last.textures} · 셰이더 ${last.programs}`;
  }
  const toggle = (on = box.style.display === 'none') => { box.style.display = on ? '' : 'none'; if (on) draw(); return true; };
  addEventListener('keydown', (e) => { if (e.key === 'F3') { e.preventDefault(); toggle(); } });
  host.addApp({ id: 'hk-perf', icon: '📊', title: '성능 표시', sub: '드로우콜 · 삼각형 · ms (F3)', folder: '홍콩 거리', run: () => toggle(), running: () => box.style.display !== 'none' });
  if (new URLSearchParams(location.search).has('perf')) toggle(true);
  return { snapshot: () => ({ ...last, gpuTimer: Boolean(ext) }), toggle };
}
