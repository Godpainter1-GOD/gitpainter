// 🏙 서울 종로 거리 + 퓨어데이 센터 — 블렌더(bpy)로 지은 종로 네거리(assets/seoul.glb, 원본 gp001_seoul/blender/seoul.py)를 비행선 70m 아래에 둔다.
// (2026-11-14 대표님: "gp001_seoul로 만들고 … 종로(한옥 + 빌딩)" · "경복궁 옆에 브렌더로 3D로 퓨어데이 5층짜리 현대식 센터" ·
//  "홍콩거리의 빌딩형식과 만들기 방식을 같이해서 그 안에서 활동할수 있도록" · "그 안에 인테리어도 홍콩거리 만들기 방식과 같게" ·
//  "퓨어데이 센터에 퓨어데이의 각종 굿즈와 회차별 안내문까지 만들꺼에요 준비해주세요")
// - g005 홍콩 거리(city 꾸러미)와 같은 틀: basic은 고치지 않고 host 약속(addSurface · place · addDriver · addApp · on)만 쓴다.
// - 걷는 곳 = 한 장의 surface. 막힘 · 높이 · 센터 충돌은 블렌더가 함께 내보낸 assets/seoul_layout.json 에서 읽는다.
// - 퓨어데이 센터: 층 바닥 6장(1~5층 + 옥상)과 층마다 같은 자리의 계단. 발밑 높이는 "지금 리카 높이에 가장 가까운 바닥(또는 계단 경사)"을 고른다
//   → 계단을 걸어서 오르내린다. 🛗 앱은 층을 골라 엘리베이터 문 앞에 바로 선다.
// - 탈것: 우측 통행 · 가운데 버스 차로(정류장 섬에서 7초 정차) · 30초 신호. 행인 20명(g005 Mixamo).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createPerf } from './perf.js';
import { mergeCity } from './merge.js';
import { createWalkers } from './walkers.js';
import { createGallery } from './gallery.js';

function makeEnvironment(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer), env = new THREE.Scene();
  const geo = new THREE.SphereGeometry(50, 48, 24), pos = geo.attributes.position, colors = [];
  const sky = new THREE.Color('#9ec0e4'), horizon = new THREE.Color('#e8e2d4'), ground = new THREE.Color('#5d5a55'), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getY(i) / 50;
    if (t >= 0) c.copy(horizon).lerp(sky, Math.min(1, t * 1.5)); else c.copy(horizon).lerp(ground, Math.min(1, -t * 3));
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  env.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const texture = pmrem.fromScene(env, .02).texture; pmrem.dispose(); return texture;
}

// ── 질감(장난감 같은 평평한 색 줄이기): 텍스처 없이 월드 좌표 노이즈로 아스팔트 얼룩 · 보도블록 줄눈 · 벽의 빗물 자국과 아래쪽 때 ──
const GRIME_GLSL = `
uniform float uGround;
uniform vec2 uCity;
varying vec3 vHKWorld;
float hkH(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float hkN(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(hkH(i), hkH(i + vec2(1., 0.)), f.x), mix(hkH(i + vec2(0., 1.)), hkH(i + vec2(1., 1.)), f.x), f.y); }
float hkF(vec2 p){ float a = .5, s = 0.; for (int i = 0; i < 4; i++) { s += a * hkN(p); p *= 2.03; a *= .5; } return s; }
// 보도블록 0.4 × 0.2m 엇갈림 줄눈: x = 줄눈(0~1), y = 블록 번호 해시
vec2 hkPaver(vec2 xz){ vec2 q = xz / vec2(.4, .2); q.x += step(1., mod(floor(q.y), 2.)) * .5;
  vec2 g = abs(fract(q) - .5); return vec2(max(smoothstep(.45, .5, g.x), smoothstep(.42, .5, g.y)), hkH(floor(q))); }
float hkCrack(vec2 xz){   // 잔금: 낡은 구역(넓은 노이즈)에만, 가늘고 끊기게
  float zone = smoothstep(.62, .78, hkN(xz * .07 + 3.1)); float n = hkN(xz * 1.3) + .5 * hkN(xz * 3.7);
  return zone * (1. - smoothstep(.0, .012, abs(n - .75))) * step(.35, hkN(xz * 6.)); }
// 바퀴 자국: 거리 좌표(uCity 기준)의 차선 가운데 ±0.9m
float hkWheel(vec2 xz){ vec2 l = xz - uCity; float a = abs(abs(abs(l.y) - 6.6) - .9), b = abs(abs(abs(l.x) - 2.4) - .8);
  float w = abs(l.y) < 9. ? 1. - smoothstep(.12, .45, a) : 0.; w = max(w, abs(l.x) < 5. && abs(l.y) > 9. ? 1. - smoothstep(.12, .4, b) : 0.); return w; }
// 높이(요철, m) — 빛을 받는 범프
float hkHeight(int kind, vec2 xz){
  if (kind == 1) return .0016 * hkN(xz * 55.) + .0012 * hkN(xz * 13.) - .003 * hkCrack(xz);
  if (kind == 2) { vec2 pv = hkPaver(xz); return -.006 * pv.x + .0008 * hkN(xz * 30.); }
  if (kind == 4) { vec2 g = fract(xz / .06) - .5; return .004 * smoothstep(.32, .18, length(g)); }
  if (kind == 5) { vec2 j = abs(fract(xz) - .5); return -.004 * smoothstep(.485, .5, max(j.x, j.y)) + .0008 * hkN(xz * 40.); }
  if (kind == 7) { vec2 j = abs(fract(xz / 2.) - .5); return -.004 * smoothstep(.49, .5, max(j.x, j.y)) + .0012 * hkN(xz * 25.); }
  if (kind == 6) return .0008 * hkN(xz * 40.);
  return 0.;
}
vec3 hkGrime(vec3 c, int kind, vec3 wn){
  vec2 xz = vHKWorld.xz; float h = vHKWorld.y - uGround;
  if (kind == 1) {        // 아스팔트: 골재 알갱이 · 큰 얼룩 · 잔금 · 바퀴 자국(짙고 매끈)
    c *= .82 + .3 * hkF(xz * .22); c *= .9 + .2 * hkH(floor(xz * 45.)); c *= 1. - .28 * hkCrack(xz); c *= 1. - .14 * hkWheel(xz);
  } else if (kind == 2) { // 보도블록: 블록마다 다른 색 · 줄눈 · 때
    vec2 pv = hkPaver(xz); c *= (.84 + .2 * hkF(xz * .5)) * (.9 + .16 * pv.y); c *= 1. - pv.x * .35;
  } else if (kind == 4) { c *= .92 + .12 * hkF(xz * 2.);
  } else if (kind == 5) { c *= .86 + .18 * hkH(floor(xz * 60.)) * hkN(xz * 8.) + .1 * hkF(xz);   // 화강암 알갱이
  } else if (kind == 6) { // 닳은 노면 페인트: 아스팔트색이 군데군데 비친다
    float wear = smoothstep(.5, .78, hkF(xz * 1.4)) * .55 + .25 * hkWheel(xz);
    c = mix(c, vec3(.11, .11, .115), clamp(wear, 0., .8)) * (.92 + .1 * hkH(floor(xz * 40.)));
  } else if (kind == 7) { c *= .82 + .26 * hkF(xz * .6); vec2 j = abs(fract(xz / 2.) - .5); c *= 1. - .3 * smoothstep(.49, .5, max(j.x, j.y));
  } else if (kind == 3) { // 벽: 세로면은 빗물 자국 · 아래쪽 때, 윗면은 얼룩
    if (abs(wn.y) < .5) {
      float along = dot(xz, vec2(-wn.z, wn.x));
      float streak = smoothstep(.55, .95, hkN(vec2(along * 2.3, h * .06))) * .22 * (.5 + .5 * hkN(vec2(along * .7, h * .5)));
      float dirt = (1. - smoothstep(.2, 3.2, h)) * .22;
      c *= (1. - streak - dirt) * (.9 + .14 * hkF(vec2(along, h) * .45));
    } else c *= .82 + .26 * hkF(xz * .4);
  }
  return c;
}
vec3 hkBump(vec3 surfPos, vec3 n, float hgt){   // 미분으로 기울인 법선(three.js perturbNormalArb와 같은 식)
  vec3 sx = dFdx(surfPos), sy = dFdy(surfPos), r1 = cross(sy, n), r2 = cross(n, sx);
  float det = dot(sx, r1); vec2 dh = vec2(dFdx(hgt), dFdy(hgt));
  return normalize(abs(det) * n - sign(det) * (dh.x * r1 + dh.y * r2));
}`;
function grime(material, kind, uniforms) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uGround = uniforms.ground; shader.uniforms.uCity = uniforms.city;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vHKWorld;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvHKWorld = (modelMatrix * vec4(transformed, 1.)).xyz;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\n' + GRIME_GLSL)
      .replace('#include <color_fragment>', `#include <color_fragment>\n{ vec3 hkWn = inverseTransformDirection(normalize(vNormal), viewMatrix); diffuseColor.rgb = hkGrime(diffuseColor.rgb, ${kind}, hkWn); }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${kind === 3 || kind === 0 ? '' : `normal = hkBump(-vViewPosition, normal, hkHeight(${kind}, vHKWorld.xz));`}`);
  };
  material.customProgramCacheKey = () => `hk-grime2-${kind}`;
  material.needsUpdate = true;
}
const grimeKind = (name = '') => (/^아스팔트/.test(name) ? 1 : /^보도블록/.test(name) ? 2 : /^점자블록/.test(name) ? 4 : /^연석/.test(name) ? 5
  : /^노면_/.test(name) ? 6 : /^(도랑|궤도)_콘크리트/.test(name) ? 7 : /^(타일|콘크리트|석재)/.test(name) ? 3 : 0);


// ── 서울 종로 거리 + 퓨어데이 센터 ─────────────────────────────
const DROP = 70;                          // 비행선 갑판에서 거리까지(m)
const C = { x: 0, z: 0 };                 // 거리 원점의 1호 데크 좌표
const ROAD_Y = 11, ST_X = 5;
const WALK = { x0: -50, x1: 50, y0: -50, y1: 68 };   // 걷는 범위(블렌더 x · y)
const LAYOUT = await fetch(new URL('./assets/seoul_layout.json', import.meta.url)).then((r) => r.json());
const EPISODES = await fetch(new URL('./assets/center_episodes.json', import.meta.url)).then((r) => (r.ok ? r.json() : [])).catch(() => []);
const CEN = LAYOUT.center, FH = CEN.fh, ST = CEN.stair;
const zf = (k) => k * FH + CEN.base;      // k층 바닥(걷는 높이)
const FLOORS = ['1층 로비 · 카페 · 굿즈샵', '2층 회차 안내 홀', '3층 크리에이터 스튜디오', '4층 라이브러리 라운지', '5층 빛의 홀', '옥상 하늘 정원'];

export async function install(host) {
  const perf = createPerf(host);
  const gltf = await new GLTFLoader().loadAsync(new URL('./assets/seoul.glb', import.meta.url).href);
  const city = gltf.scene; city.name = 'SeoulJongno'; city.visible = false;
  const base = () => host.floorY - DROP;
  city.position.set(C.x, base(), C.z); host.homeDeck.add(city);

  const envMap = makeEnvironment(host.renderer);
  const shade = { ground: { value: 0 }, city: { value: new THREE.Vector2() } };
  const grimed = new Set();
  const vehicles = {};
  city.traverse((o) => {
    if (o.name.startsWith('VEH_')) vehicles[o.name.slice(4)] = o;
    if (!o.isMesh) return;
    const sky = o.name.startsWith('SKY_') || o.parent?.name?.startsWith('SKY_') || o.name.startsWith('FAR_산') || o.parent?.name?.startsWith('FAR_산');
    if (sky) {   // 하늘 · 산 능선은 빛 · 안개 없이 그림 그대로
      const m = o.material;
      o.material = new THREE.MeshBasicMaterial({ map: m.map ?? m.emissiveMap, fog: false, side: THREE.DoubleSide, alphaTest: m.map?.format === THREE.RGBAFormat && o.name.includes('산') ? .5 : 0, transparent: false });
      o.renderOrder = -1; o.castShadow = false; o.receiveShadow = false; o.frustumCulled = false; return;
    }
    const far = o.name.startsWith('FAR_') || o.parent?.name?.startsWith('FAR_');
    const m = o.material;
    o.castShadow = !far && !m.transparent && !o.name.startsWith('CITY_'); o.receiveShadow = true;
    if (/^CITY_노면/.test(o.name) || /^CITY_노면/.test(o.parent?.name ?? '')) {
      o.material = m.clone(); Object.assign(o.material, { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 }); o.castShadow = false;
    }
    if (m?.transparent) { m.depthWrite = false; m.side = THREE.DoubleSide; }
    const kind = grimeKind(m?.name);
    if (m) m.userData.hkKind = kind;
    if (kind && !grimed.has(m)) { grime(m, kind, shade); grimed.add(m); }
    if (m && !m.userData.hkEnv) { m.envMap = envMap; m.envMapIntensity = m.metalness > .5 ? .9 : .35; m.userData.hkEnv = true; m.needsUpdate = true; }
  });

  // ── 카메라 벽 상자(거리 좌표 = 블렌더 x, 위, −y) ──
  const box3 = (x0, x1, y0, y1, z0 = 0, z1 = 200) => new THREE.Box3(new THREE.Vector3(x0, z0, -y1), new THREE.Vector3(x1, z1, -y0));
  const wallBoxes = LAYOUT.walls.filter(([x0, x1, y0, y1]) => !(x0 === CEN.x0 && x1 === CEN.x1 && y0 === CEN.y0)).map(([x0, x1, y0, y1, z0, z1]) => box3(x0, x1, y0, y1, z0, z1));
  const topZ = zf(5) + 1.2;   // 센터: 큰 상자 대신 얇은 외벽 4장 + 층마다 바닥판(안에 있을 때도 카메라가 벽 · 천장 안쪽에 머문다)
  wallBoxes.push(box3(CEN.x0 - .4, CEN.x0 + .4, CEN.y0, CEN.y1, 0, topZ), box3(CEN.x0, CEN.x1, CEN.y1 - .4, CEN.y1 + .4, 0, topZ),
    box3(CEN.x0, CEN.x1, CEN.y0 - .2, CEN.y0 + .1, zf(1) - .5, topZ), box3(CEN.x1 - .1, CEN.x1 + .2, CEN.y0, CEN.y1, zf(1) - .5, topZ));
  for (let k = 1; k <= 5; k++) wallBoxes.push(box3(CEN.x0, CEN.x1, CEN.y0, CEN.y1, zf(k) - .35, zf(k) - .02));
  wallBoxes.push(box3(CEN.lift[0], CEN.lift[1], CEN.lift[2], CEN.lift[3] + .4, 0, topZ + 3), box3(ST.x0 - .6, ST.x1 + .4, 29.0, 29.3, zf(5), zf(5) + 3.3));   // 엘리베이터 통 · 옥상 계단실 벽
  // ── 합치기 ──
  const flags = new URLSearchParams(location.search);
  const mergeReport = flags.has('nomerge') ? null : mergeCity(city, {
    isStatic: (o) => { for (let p = o; p && p !== city; p = p.parent) if (p.name.startsWith('SKY_') || p.name.startsWith('FAR_산')) return false; return true; },
    prepareMaterial: (mat, first) => { const k = first.userData.hkKind; if (k) grime(mat, k, shade); mat.envMap = envMap; mat.envMapIntensity = first.envMapIntensity; },
  });

  // ── 거리 모드 켜고 끄기 ──
  let active = false, saved = null;
  const fog = new THREE.Fog(0xc6d2dc, 140, 700);
  const sunLight = host.scene.children.find((o) => o.isDirectionalLight && o.castShadow);
  const identity = document.querySelector('.identity');
  function setShadowMap(size) { if (!sunLight || sunLight.shadow.mapSize.x === size) return; sunLight.shadow.mapSize.set(size, size); sunLight.shadow.map?.dispose(); sunLight.shadow.map = null; }
  let shadowOff = [];
  function quietSky(on) {
    if (on) { const inside = (o, root) => { for (let p = o; p; p = p.parent) if (p === root) return true; return false; };
      host.root.traverse((o) => { if (o.isMesh && o.castShadow && !inside(o, city) && !inside(o, host.player)) { o.castShadow = false; shadowOff.push(o); } });
    } else { for (const o of shadowOff) o.castShadow = true; shadowOff = []; }
  }
  function setActive(on) {
    if (on === active) return;
    active = on; city.visible = on; document.body.classList.toggle('seoul-street', on); quietSky(on);
    if (on) {
      saved = { near: host.camera.near, far: host.camera.far, fog: host.scene.fog, tour: window.weather?.getState?.().tourMode ?? false,
        sun: sunLight && { bias: sunLight.shadow.bias, normalBias: sunLight.shadow.normalBias, pos: sunLight.position.clone(), tgt: sunLight.target.position.clone(), cam: ['left', 'right', 'top', 'bottom', 'near', 'far'].reduce((a, k) => ({ ...a, [k]: sunLight.shadow.camera[k] }), {}), map: sunLight.shadow.mapSize.x },
        text: identity && [...identity.children].map((e) => e.textContent), title: document.title };
      host.scene.fog = fog; window.weather?.setTourMode?.(true);
      host.camera.near = .12; host.camera.far = 2600; host.camera.updateProjectionMatrix();
      if (sunLight) { Object.assign(sunLight.shadow.camera, { left: -38, right: 38, top: 38, bottom: -38, near: 1, far: 260 }); sunLight.shadow.camera.updateProjectionMatrix(); setShadowMap(2048); sunLight.shadow.bias = -.0008; sunLight.shadow.normalBias = .045; }
      if (identity) { const [e, h, p] = identity.children; e.textContent = 'SEOUL · JONGNO × 경복궁'; h.textContent = '서울 종로 거리'; p.textContent = '한옥과 빌딩 사이, 퓨어데이 센터.'; }
      document.title = '서울 종로 거리 · 퓨어데이 센터';
    } else if (saved) {
      host.scene.fog = saved.fog; window.weather?.setTourMode?.(saved.tour);
      host.camera.near = saved.near; host.camera.far = saved.far; host.camera.updateProjectionMatrix();
      if (sunLight && saved.sun) { sunLight.position.copy(saved.sun.pos); sunLight.target.position.copy(saved.sun.tgt); Object.assign(sunLight.shadow.camera, saved.sun.cam); sunLight.shadow.camera.updateProjectionMatrix(); setShadowMap(saved.sun.map); sunLight.shadow.bias = saved.sun.bias; sunLight.shadow.normalBias = saved.sun.normalBias; }
      if (identity && saved.text) [...identity.children].forEach((e, i) => { e.textContent = saved.text[i]; });
      document.title = saved.title; saved = null;
    }
  }

  // ── 걷는 곳 ──
  const local = (x, z) => ({ bx: x - C.x, by: -(z - C.z) });        // 1호 데크 좌표 → 블렌더 거리 좌표
  const deckOf = (bx, by) => ({ x: C.x + bx, z: C.z - by });
  const inRect = (x, y, [x0, x1, y0, y1], pad = 0) => x > x0 - pad && x < x1 + pad && y > y0 - pad && y < y1 + pad;
  const inCenter = (bx, by) => bx > CEN.x0 && bx < CEN.x1 && by > CEN.y0 && by < CEN.y1;
  const inStair = (bx, by) => bx > ST.x0 && bx < ST.x1 && by > ST.y0 && by < ST.y1;
  let forceLevel = null;                    // 엘리베이터: 다음 몇 걸음 동안 이 층으로
  const myHeight = () => host.player.position.y - host.restY + DROP;   // 리카 발 높이(거리 좌표)
  function centerHeight(bx, by) {
    const cur = forceLevel !== null ? zf(forceLevel) : myHeight();
    const cands = [];
    if (inStair(bx, by)) for (let k = 0; k < 5; k++) cands.push(zf(k) + FH * (by - ST.y0) / (ST.y1 - ST.y0));
    else for (let k = 0; k <= 5; k++) cands.push(zf(k));
    let best = cands[0];
    for (const h of cands) if (Math.abs(h - cur) < Math.abs(best - cur)) best = h;
    return best;
  }
  const levelAt = (h) => Math.max(0, Math.min(5, Math.round((h - CEN.base) / FH)));
  function centerBlocked(bx, by, h) {
    const lvl = levelAt(h), onStair = inStair(bx, by);
    // 외벽: 안쪽 여유. 1층 문 두 곳은 지나간다
    const inner = bx > CEN.x0 + .5 && bx < CEN.x1 - .35 && by > CEN.y0 + .35 && by < CEN.y1 - .5;
    if (!inner) { if (lvl === 0 && CEN.doors.some((d) => inRect(bx, by, d))) return false; return true; }
    if (onStair) return false;
    // 계단 구멍(위층 바닥이 없는 곳): 계단이 아닌 높이로 들어서지 않게 — 계단 띠 바로 옆 유리 난간이 막는다
    for (const [x0, x1, y0, y1, l] of CEN.colliders) if (l === lvl && bx > x0 - .25 && bx < x1 + .25 && by > y0 - .25 && by < y1 + .25) return true;
    return false;
  }
  function streetBlocked(bx, by) {
    if (!Number.isFinite(bx) || !Number.isFinite(by) || bx < WALK.x0 || bx > WALK.x1 || by < WALK.y0 || by > WALK.y1) return true;
    for (const b of LAYOUT.blocks) if (inRect(bx, by, b, .3)) return true;
    for (const [x, y, r] of LAYOUT.obstacles) if (Math.hypot(bx - x, by - y) < r + .25) return true;
    return false;
  }
  function heightAt(bx, by) {
    if (inCenter(bx, by)) return centerHeight(bx, by);
    for (const [x0, x1, y0, y1, h] of LAYOUT.heights) if (bx > x0 && bx < x1 && by > y0 && by < y1) return h;
    if (Math.abs(by) <= ROAD_Y) return 0;
    if (Math.abs(bx) <= ST_X && by < ROAD_Y + 3.6) return 0;
    return .15;
  }
  function blocked(bx, by) {
    const nearCenter = bx > CEN.x0 - .6 && bx < CEN.x1 + .6 && by > CEN.y0 - .6 && by < CEN.y1 + .6;
    if (nearCenter) {
      const h = inCenter(bx, by) ? centerHeight(bx, by) : .15;
      // 바깥 띠(외벽 바로 바깥): 1층 문 앞만 지나간다
      if (!inCenter(bx, by)) return !CEN.doors.some((d) => inRect(bx, by, d));   // 외벽 바로 바깥 띠: 문 앞만 지나간다
      return centerBlocked(bx, by, h);
    }
    return streetBlocked(bx, by);
  }
  const surface = { name: 'seoul-street',
    contains: (x, z) => { if (!active) return false; const { bx, by } = local(x, z); return !blocked(bx, by); },
    height: (x, z) => { const { bx, by } = local(x, z); return -DROP + heightAt(bx, by); } };
  host.addSurface(surface);

  // ── 탈것: 우측 통행 · 신호 ──
  const lanes = {
    busE: { z: 3.0, dir: [1, 0], speed: 8, stop: -14.5, axis: 'ew', halt: 38 },
    busW: { z: -3.0, dir: [-1, 0], speed: 8, stop: -14.5, axis: 'ew', halt: -22 },
    carE: { z: 6.3, dir: [1, 0], speed: 10, stop: -14.5, axis: 'ew' },
    carW: { z: -6.3, dir: [-1, 0], speed: 10, stop: -14.5, axis: 'ew' },
    carE2: { z: 9.5, dir: [1, 0], speed: 11, stop: -14.5, axis: 'ew' },
    carW2: { z: -9.5, dir: [-1, 0], speed: 11, stop: -14.5, axis: 'ew' },
  };
  const LOOP = 130;
  const live = [];
  const add = (key, o, lane, s) => { if (!o) return; o.rotation.set(0, Math.atan2(-lane.dir[1], lane.dir[0]), 0); city.add(o); live.push({ key, o, lane, len: o.userData.length || 5, s, v: lane.speed, halted: 0, servedHalt: false }); };
  add('bus', vehicles.bus, lanes.busE, -40); add('bus2', vehicles.bus2, lanes.busW, -90);
  add('taxi', vehicles.taxi, lanes.carE, -60); add('car', vehicles.car, lanes.carW, -40);
  if (vehicles.taxi) add('taxi2', vehicles.taxi.clone(), lanes.carW2, -100);
  if (vehicles.car) add('car2', vehicles.car.clone(), lanes.carE2, -110);
  if (vehicles.taxi) add('taxi3', vehicles.taxi.clone(), lanes.carE, 20);
  if (vehicles.bus) add('bus3', vehicles.bus.clone(), lanes.busE, 60);
  const CYCLE = 30;
  const green = (axis, t) => { const k = t % CYCLE; return axis === 'ew' ? k < 16 : k >= 19 && k < 28; };
  const playerCity = () => { const p = host.player.position; return { gx: p.x - C.x, gz: p.z - C.z, on: active }; };
  let clock = 0, frozen = false;
  function drive(dt) {
    if (frozen) return;
    clock += dt;
    const me = playerCity();
    for (const c of live) {
      const { lane } = c, dx = lane.dir[0], dz = lane.dir[1];
      const front = c.s + c.len / 2;
      let target = lane.speed;
      for (const o of live) {
        if (o === c || o.lane !== lane) continue;
        let gap = (o.s - o.len / 2) - front; if (gap < -LOOP) gap += 2 * LOOP;
        if (gap > -c.len && gap < 30) target = Math.min(target, Math.max(0, gap - 3) * .8);
      }
      const toStop = lane.stop - 1 - front;
      if (!green(lane.axis, clock) && toStop > -0.5 && toStop < 30) target = Math.min(target, Math.max(0, toStop) * .9);
      if (lane.halt !== undefined) {
        const toHalt = lane.halt - front;
        if (!c.servedHalt && toHalt > -0.3 && toHalt < 25) { target = Math.min(target, Math.max(0, toHalt) * .7); if (toHalt < .4) { c.halted += dt; if (c.halted > 7) { c.servedHalt = true; c.halted = 0; } } }
      }
      if (me.on) {
        const ps = me.gx * dx + me.gz * dz, lat = me.gz - lane.z;
        const gap = ps - front;
        if (Math.abs(lat) < 1.7 && gap > 0 && gap < 12) target = Math.min(target, Math.max(0, gap - 2.5) * .8);
      }
      c.v += THREE.MathUtils.clamp(target - c.v, -6 * dt, 2.2 * dt);
      c.s += c.v * dt;
      if (c.s > LOOP) { c.s = -LOOP; c.servedHalt = false; }
      c.o.position.set(c.s * dx, 0, lane.z);
    }
  }

  // 🚶 행인 20명(g005 Mixamo 모델 그대로, 보도 좌표만 종로에 맞춤)
  const obstacleRects = [...LAYOUT.obstacles.map(([x, y, r]) => [x - r, x + r, y - r, y + r]), ...LAYOUT.blocks.filter(([x0, x1, y0, y1]) => (x1 - x0) * (y1 - y0) < 60)];
  const walkers = await createWalkers(host, city, { count: 20, envMap, obstacles: obstacleRects });
  const meCity = new THREE.Vector3();
  // 🖼 2층 회차 안내 홀: 카드 미리보기 → 본편 보기(웹툰 포털)
  const gallery = createGallery(host, city, { cards: CEN.cards || [], episodes: EPISODES, isActive: () => active,
    levelNow: () => { const { bx, by } = local(host.player.position.x, host.player.position.z); return inCenter(bx, by) ? levelAt(myHeight()) : -1; },
    toCity: () => local(host.player.position.x, host.player.position.z) });

  // ── 따라가기 카메라: 벽 · 천장 상자 앞으로 당긴다(g005와 같은 식) ──
  const RIKA_H = 1.5, PITCH = [THREE.MathUtils.degToRad(-85), THREE.MathUtils.degToRad(35)];
  const camRay = new THREE.Ray(), boxHit = new THREE.Vector3(), lPivot = new THREE.Vector3(), lEye = new THREE.Vector3(), fEye = new THREE.Vector3(), fAim = new THREE.Vector3(), wPivot = new THREE.Vector3(), wEye = new THREE.Vector3(), dirV = new THREE.Vector3();
  let pulled = 0;
  host.addDriver({ busy: () => false, view: () => {
    if (!active || host.state.mode !== 'follow' || host.busyExcept('seoul-follow')) return null;
    const s = host.state, p = host.player.position;
    const fwd = new THREE.Vector3(Math.sin(s.heading), 0, Math.cos(s.heading)).applyAxisAngle(new THREE.Vector3(0, 1, 0), s.orbit);
    fEye.copy(p).addScaledVector(fwd, -4.2 * s.zoom); fEye.y += RIKA_H * 1.12 + .45;
    fAim.copy(p); fAim.y += RIKA_H * .62;
    const d = fAim.clone().sub(fEye), hz = Math.hypot(d.x, d.z);
    d.y = hz * Math.tan(THREE.MathUtils.clamp(Math.atan2(d.y, hz) + s.pitch, PITCH[0], PITCH[1])); fAim.copy(fEye).add(d);
    const deck = host.player.parent;
    deck.localToWorld(wPivot.copy(p).setY(p.y + RIKA_H * .95)); deck.localToWorld(wEye.copy(fEye));
    city.worldToLocal(lPivot.copy(wPivot)); city.worldToLocal(lEye.copy(wEye));
    dirV.copy(lEye).sub(lPivot); const len = dirV.length(); dirV.normalize(); camRay.set(lPivot, dirV);
    let hit = null;
    for (const b of wallBoxes) { if (b.containsPoint(lPivot)) continue; if (camRay.intersectBox(b, boxHit)) { const dd = boxHit.distanceTo(lPivot); if (dd < len && (!hit || dd < hit.distance)) hit = { distance: dd }; } }
    if (hit) { const k = Math.max(.25, hit.distance - .35) / len; fEye.lerpVectors(deck.worldToLocal(wPivot.clone()), fEye, k); pulled = +(1 - k).toFixed(2); } else pulled = 0;
    return { eye: fEye, aim: fAim, fov: 58 };
  } });

  const fade = document.createElement('div'); fade.className = 'seoul-cloud'; document.getElementById('experience').append(fade);
  const css = document.createElement('style');
  css.textContent = 'body.seoul-street .views,body.seoul-street #bg-credit{display:none}.seoul-cloud{position:fixed;inset:0;pointer-events:none;z-index:20;opacity:0;background:radial-gradient(ellipse at 50% 40%,#fff,#e9eef3 60%,#d5dde6)}'
    + '.seoul-floor{position:fixed;left:12px;bottom:12px;z-index:15;background:rgba(14,22,34,.78);color:#fff;font:600 13px/1.4 system-ui,sans-serif;padding:8px 12px;border-radius:10px;pointer-events:none}.seoul-floor[hidden]{display:none}';
  document.head.append(css);
  // 첫 화면(비행선)에서 바로 보이는 입구 버튼 — 왼쪽 작은 아이콘만으로는 찾기 어렵다(2026-11-14 대표님: "서울 센터는 어떻게 가는거지? 첫화면에서 가는 방법을 모르겠어")
  css.textContent += '.seoul-go{position:fixed;left:50%;bottom:96px;transform:translateX(-50%);z-index:15;display:flex;gap:10px;flex-wrap:wrap;justify-content:center;max-width:calc(100vw - 32px)}.seoul-go[hidden]{display:none}'
    + '.seoul-go button{border:0;border-radius:14px;padding:12px 18px;font:700 15px/1.2 system-ui,sans-serif;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.28);display:flex;flex-direction:column;align-items:flex-start;gap:3px;text-align:left}'
    + '.seoul-go button small{font-weight:500;font-size:12px;opacity:.85}.seoul-go .go-street{background:#fbfaf6;color:#1f2a38}.seoul-go .go-center{background:#2878c8;color:#fff}'
    + '@media (max-width:640px){.seoul-go{bottom:150px}.seoul-go button{padding:10px 14px;font-size:14px}}';
  const go = document.createElement('div'); go.className = 'seoul-go';
  go.innerHTML = '<button class="go-street" type="button">🏙 서울 종로 거리로 내려가기<small>한옥 · 종루 · 경복궁 · 버스 다니는 큰길</small></button><button class="go-center" type="button">🏢 퓨어데이 센터 바로 가기<small>1층 로비 · 카페 · 굿즈샵 → 2층 회차 안내 홀</small></button>';
  go.querySelector('.go-street').onclick = () => enterDirect();
  go.querySelector('.go-center').onclick = () => goFloor(0);
  for (const ev of ['pointerdown', 'keydown']) go.addEventListener(ev, (e) => e.stopPropagation());
  document.body.append(go);
  const floorTag = document.createElement('div'); floorTag.className = 'seoul-floor'; floorTag.hidden = true; document.body.append(floorTag);
  let fading = false;
  function cloud(swap) {
    if (fading) return; fading = true;
    fade.style.transition = 'opacity .55s ease-in'; fade.style.opacity = '1';
    setTimeout(() => { swap(); fade.style.transition = 'opacity 1.4s ease-out'; fade.style.opacity = '0'; setTimeout(() => { fading = false; }, 1400); }, 600);
  }
  function enterDirect(spot) {
    if (active && !spot) return false;
    if (host.busyExcept('seoul-street')) return false;
    cloud(() => {
      setActive(true);
      const s = spot || { bx: -27.5, by: 14.2, heading: Math.PI, level: null };
      forceLevel = s.level ?? null;
      const d = deckOf(s.bx, s.by); host.place(d.x, d.z, s.heading); host.setMode('follow');
      host.notice(s.level != null ? `퓨어데이 센터 ${FLOORS[s.level]}` : '서울 종로 · 퓨어데이 센터 앞이에요. WASD로 걸어 보세요');
      setTimeout(() => { forceLevel = null; }, 600);
    });
    return true;
  }
  function leave() { if (!active) return false; cloud(() => { setActive(false); forceLevel = null; host.place(0, 1.2, -Math.PI); }); return true; }
  // 🛗 엘리베이터: 층 고르기(엘리베이터 문 앞에 선다)
  const liftSpot = (k) => ({ bx: (CEN.lift[0] + CEN.lift[1]) / 2 + 1.5, by: CEN.lift[2] - 3.0, heading: 0, level: k });   // 문 앞 3m, 층 안쪽(남쪽)을 본다
  function goFloor(k) { forceLevel = k; if (!active) return enterDirect(liftSpot(k)); cloud(() => { const s = liftSpot(k), d = deckOf(s.bx, s.by); forceLevel = k; host.place(d.x, d.z, s.heading); host.notice(`🛗 ${FLOORS[k]}`); setTimeout(() => { forceLevel = null; }, 600); }); return true; }

  host.on('tick', (dt) => {
    if (active) { drive(dt); const p = host.player.position; meCity.set(p.x - C.x, 0, p.z - C.z); walkers.update(dt, meCity); }
    if (active) { const a = new THREE.Vector3(); city.getWorldPosition(a); shade.ground.value = a.y; shade.city.value.set(a.x, a.z); }
    if (active) { const t = document.getElementById('view-title'); if (t && /파리|홍콩/.test(t.textContent)) t.textContent = t.textContent.replace(/파리|홍콩/, '서울'); }
    if (active && sunLight) { const a = new THREE.Vector3(); host.player.getWorldPosition(a); sunLight.target.position.copy(a); sunLight.position.copy(a).add(new THREE.Vector3(-55, 95, 40)); }
    // 지금 층 표시(센터 안에서만)
    const { bx, by } = local(host.player.position.x, host.player.position.z);
    const inside = active && inCenter(bx, by);
    floorTag.hidden = !inside;
    if (go.hidden !== active) go.hidden = active;   // 거리에 있을 때는 숨긴다(나가면 다시 보인다)
    gallery.update();
    if (inside) { const lvl = levelAt(myHeight()); const txt = `🏢 퓨어데이 센터 · ${FLOORS[lvl]}${inStair(bx, by) ? ' · 계단' : ''}`; if (floorTag.textContent !== txt) floorTag.textContent = txt; }
  });
  host.on('reset', () => { setActive(false); forceLevel = null; });

  host.addApp({ id: 'seoul-enter', icon: '🏙', title: '서울 종로 거리', sub: '퓨어데이 센터 앞 · 한옥 · 경복궁', folder: '서울 종로', desktop: true, favorite: true, run: () => (active ? leave() : enterDirect()), running: () => active });
  FLOORS.forEach((name, k) => host.addApp({ id: `seoul-floor-${k}`, icon: k === 5 ? '🌳' : '🛗', title: `퓨어데이 센터 ${k === 5 ? '옥상' : k + 1 + '층'}`, sub: name, folder: '퓨어데이 센터', desktop: k === 0, run: () => goFloor(k), running: () => false }));
  host.addHelp('<b>🏙 서울 종로 거리</b>는 비행선 70m 아래의 종로 네거리예요. 북동쪽 한옥 마을, 남동쪽 종루, 남서쪽 상가, 북쪽 끝에 경복궁 궐문, 북서쪽에 <b>퓨어데이 센터</b>(5층 + 옥상 정원)가 있어요. 버스 · 택시는 우측 통행으로 다니고 신호에 서요.');
  host.addHelp('<b>🖼 2층 회차 안내 홀</b>: 카드 앞에 서서 <b>F</b>(또는 카드 · 안내 누르기)로 미리보기 — 대표 컷 · 줄거리 · <b>📖 본편 보기</b>(퓨어데이 웹툰 페이지, 새 탭).');
  host.addHelp('<b>퓨어데이 센터</b>: 정문(종로 쪽)이나 동쪽 문으로 들어가요. 계단(서쪽 안쪽)을 걸어서 오르내리거나 앱 <b>🛗 퓨어데이 센터 N층</b>으로 바로 가요. 1층 로비 · 카페 · 굿즈샵, 2층 회차 안내 홀, 3층 스튜디오, 4층 라이브러리, 5층 빛의 홀, 옥상 하늘 정원.');

  const teleport = (bx, by, heading = 0, level = null) => { forceLevel = level; const d = deckOf(bx, by); const ok = host.place(d.x, d.z, heading); setTimeout(() => { forceLevel = null; }, 400); return ok; };   // 검사용
  window.spaceSeoul = { enterDirect, leave, goFloor, teleport, setActive, isActive: () => active, freeze: (on = true) => { frozen = on; }, merge: mergeReport, perf: () => perf.snapshot(),
    canStandAt: (bx, by) => !blocked(bx, by), heightAt, episodes: EPISODES, layout: LAYOUT, gallery,
    getState: () => { const { bx, by } = local(host.player.position.x, host.player.position.z); return { active, pulled, bx: +bx.toFixed(2), by: +by.toFixed(2), h: +myHeight().toFixed(2), level: inCenter(bx, by) ? levelAt(myHeight()) : null, footing: host.footing?.name ?? null, vehicles: live.map((c) => ({ key: c.key, s: +c.s.toFixed(1), v: +c.v.toFixed(1) })), walkers: walkers.count() }; } };
  const room = new URLSearchParams(location.search).get('room');
  if (room === 'seoul' || room === 'pureday') { const go = () => (host.state.ready ? (room === 'pureday' ? goFloor(0) : enterDirect()) : setTimeout(go, 200)); go(); }
}
