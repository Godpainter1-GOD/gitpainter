// 🧱 거리 합치기 — 스킬 threejs-performance "Merge static geometry" + "Shadow maps: 캐스터 줄이기".
// 측정(2026-11-07, 큰길): 한 프레임 = 화면 58회 + 그림자 126회. 건물 하나가 재질마다 쪼개져 그림자를 20번씩 다시 그렸다.
// ① 화면용: 움직이지 않는 메시를 "재질 성격"(그림 · 발광은 재질 그대로, 나머지는 질감 종류 · 금속 · 거칠기 · 깊이 당김)으로 묶어 합친다.
//    색은 정점 색(color 속성)으로 넘기고 재질은 흰색 + vertexColors. 프러스텀 컬링은 묶음 단위가 된다(작은 동네라 괜찮다).
// ② 그림자용: 그림자를 내던 정적 메시를 위치만 가진 대역 하나로 합친다. 화면에는 아무것도 쓰지 않는 재질이라
//    그림자 패스는 이 대역 1회 + 움직이는 것(차 · 리카)만.
// ③ 차량은 차마다 같은 방법으로 몇 조각으로(차 노드는 그대로 움직인다).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const linear = new THREE.Color();

function keyOf(mat) {
  const special = mat.map || mat.emissiveMap || (mat.emissive && mat.emissive.getHex() !== 0 && mat.emissiveIntensity > 0) || mat.transparent || mat.alphaTest > 0;
  if (special) return `mat:${mat.uuid}`;   // 그림 · 발광 · 투명은 재질 그대로(같은 재질끼리만 합친다)
  const kind = mat.userData.hkKind ?? 0;
  return ['v', kind, mat.metalness > .5 ? 1 : 0, Math.round(mat.roughness * 5) / 5, mat.polygonOffset ? 1 : 0, mat.side].join('|');
}

// 지오메트리를 기준 좌표(toLocal × 메시 월드)로 옮기고, 비인덱스 · 같은 속성 집합(position · normal · [uv] · color)으로 맞춘다
function prep(mesh, toLocal, withUv, color) {
  let g = mesh.geometry.clone();
  g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(toLocal, mesh.matrixWorld));
  if (g.index) g = g.toNonIndexed();
  // Mapped retail geometry uses COLOR_0 to tint the shared cloth atlas.
  for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', ...(withUv ? ['color'] : [])].includes(name)) g.deleteAttribute(name);
  if (!g.attributes.normal) g.computeVertexNormals();
  if (withUv && !g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  if (!withUv && g.attributes.uv) g.deleteAttribute('uv');
  if (color) {
    const n = g.attributes.position.count, c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { c[i * 3] = color.r; c[i * 3 + 1] = color.g; c[i * 3 + 2] = color.b; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  }
  g.morphAttributes = {};
  return g;
}

function mergeGroup(meshes, toLocal, prepareMaterial) {
  const groups = new Map();
  for (const m of meshes) {
    const k = keyOf(m.material);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(m);
  }
  const out = [];
  for (const [k, list] of groups) {
    const first = list[0].material, vc = k.startsWith('v|'), withUv = !vc;
    const geos = list.map((m) => prep(m, toLocal, withUv, vc ? linear.copy(m.material.color) : null));
    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (!merged) continue;
    let mat = first;
    if (vc) {
      mat = first.clone();
      mat.color.set(0xffffff); mat.vertexColors = true;
      mat.name = `합침_${k}`; mat.userData = { ...first.userData };
      prepareMaterial?.(mat, first);
    }
    const mesh = new THREE.Mesh(merged, mat);
    mesh.name = `MERGED_${mat.name || k}`; mesh.receiveShadow = true; mesh.castShadow = false;
    out.push(mesh);
  }
  return out;
}

export function mergeCity(city, { isStatic, prepareMaterial }) {
  city.updateMatrixWorld(true);
  const toLocal = city.matrixWorld.clone().invert();
  const stat = [], casters = [], vehicles = new Map();
  city.traverse((o) => {
    if (!o.isMesh) return;
    let veh = null;
    for (let p = o; p && p !== city; p = p.parent) if (p.name.startsWith('VEH_')) veh = p;
    if (veh) { if (!vehicles.has(veh)) vehicles.set(veh, []); vehicles.get(veh).push(o); return; }
    if (!isStatic(o)) return;
    stat.push(o);
    if (o.castShadow) casters.push(o);
  });
  const before = { meshes: stat.length + [...vehicles.values()].reduce((a, l) => a + l.length, 0), casters: casters.length };

  // ① 화면용
  const merged = mergeGroup(stat, toLocal, prepareMaterial);
  // ② 그림자 대역(위치만)
  let proxy = null;
  if (casters.length) {
    const geos = casters.map((m) => { const g = prep(m, toLocal, false, null); g.deleteAttribute('normal'); return g; });
    const pg = mergeGeometries(geos, false); geos.forEach((g) => g.dispose());
    // three.js 그림자 패스는 레이어를 '화면 카메라' 기준으로 검사한다(WebGLShadowMap.renderObject) → 레이어로 숨길 수 없다.
    // 그래서 레이어 0에 두고, 화면에는 색도 깊이도 쓰지 않는 재질로 둔다(화면 패스 1회 · 픽셀 0, 그림자 패스 1회).
    proxy = new THREE.Mesh(pg, new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
    proxy.name = 'SHADOW_PROXY'; proxy.castShadow = true; proxy.receiveShadow = false; proxy.renderOrder = 999;
    // 화면 패스에서는 그리기 범위를 0으로(정점 9만여 개 계산도 건너뛴다 — 그리기 0개면 three.js가 호출 자체를 안 한다), 그림자 패스에서만 전부.
    // render() 안에서 그림자 지도가 화면보다 먼저 그려지므로 onBeforeShadow → 전부, onBeforeRender → 0 순서가 매 프레임 맞는다.
    proxy.onBeforeShadow = () => proxy.geometry.setDrawRange(0, Infinity);
    proxy.onBeforeRender = () => proxy.geometry.setDrawRange(0, 0);
  }
  for (const m of stat) m.removeFromParent();
  for (const m of merged) city.add(m);
  if (proxy) city.add(proxy);

  // ③ 차량
  let vehParts = 0;
  for (const [veh, list] of vehicles) {
    veh.updateMatrixWorld(true);
    const inv = veh.matrixWorld.clone().invert();
    const parts = mergeGroup(list, inv, prepareMaterial);
    for (const m of list) m.removeFromParent();
    for (const m of parts) { m.castShadow = true; veh.add(m); }
    vehParts += parts.length;
  }
  return { before, after: { meshes: merged.length + (proxy ? 1 : 0) + vehParts, merged: merged.length, vehicleParts: vehParts, proxyTriangles: proxy ? proxy.geometry.attributes.position.count / 3 : 0 }, proxy };
}
