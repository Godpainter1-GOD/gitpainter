// Aside u7의 Mixamo에서 받은 서로 다른 사람 20명. 같은 사람을 복제해 인원을 채우지 않는다.
// 네 모퉁이의 보도에서 목적지를 고르고 가게 앞에서 머물거나 서로 비켜 간다.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// 실제 사용할 명단은 assets/people/roster.json. 인덱스가 비어 조용히 0명이 되던 문제를 막는다.
const CORNERS = [[1, -1], [-1, -1], [1, 1], [-1, 1]];
// 종로(gp001_seoul): 큰길 보도 |z| 11~17 → 걷는 줄 13.8, 남북 길 보도 |x| 5~8 → 6.6 (게임 좌표, 네 모퉁이로 뒤집어 쓴다)
const POINTS = [[6.6, 13.8], [11.5, 13.8], [25.5, 14.6], [45, 13.8], [6.6, 18.5], [6.6, 30], [6.6, 46],
  [19.5, 15.6], [7.2, 24], [35, 15.4], [7.2, 38]];
const EDGES = [[0, 1], [1, 2], [2, 3], [0, 4], [4, 5], [5, 6]];
const NEIGHBORS = [[1, 4], [0, 2, 7], [1, 3, 7, 9], [2, 9], [0, 5, 8], [4, 6, 8, 10], [5, 10], [1, 2], [4, 5], [2, 3], [5, 6]];
const SPAWN_EDGES = [1, 0, 4, 2, 5];
function rng(seed) { let n = seed >>> 0; return () => { n = (Math.imul(n, 1664525) + 1013904223) >>> 0; return n / 4294967296; }; }
function point(w, node, out) { const p = POINTS[node]; return out.set(p[0] * w.sx, p[1] * w.sz); }
function sidewalk(x, z, w) {
  let a = x * w.sx, b = z * w.sz;
  if (a > 8) b = THREE.MathUtils.clamp(b, 12.4, 16.5);
  if (b > 16.5) a = THREE.MathUtils.clamp(a, 5.6, 7.6);
  return [Math.max(5.6, a) * w.sx, Math.max(12.4, b) * w.sz];
}

export async function createWalkers(host, city, { count = 20, groundY = .15, envMap = null, obstacles = [] } = {}) {
  const loader = new GLTFLoader(), walkers = [], failed = [];
  const response = await fetch(new URL('./assets/people/roster.json', import.meta.url), { cache: 'no-store' });
  if (!response.ok) throw new Error('거리 행인 명단을 읽지 못했어요.');
  const roster = await response.json();
  const seen = new Set();
  const wanted = roster.filter(person => { if (seen.has(person.key)) return false; seen.add(person.key); return true; }).slice(0, count);
  const models = new Array(wanted.length); let next = 0;
  await Promise.all(Array.from({ length: Math.min(3, wanted.length) }, async () => {
    while (next < wanted.length) {
      const i = next++, key = wanted[i].key;
      try { models[i] = await loader.loadAsync(new URL(`./assets/people/${key}.glb`, import.meta.url).href); }
      catch (error) { failed.push(key); console.warn(`행인 ${key}를 불러오지 못했어요.`, error); }
    }
  }));

  const bound = new THREE.Box3(), size = new THREE.Vector3(), materials = new Set();
  for (let i = 0; i < models.length; i++) {
    const gltf = models[i]; if (!gltf) continue;
    const { key, name } = wanted[i], rand = rng(7091 + i * 1039), visual = gltf.scene;
    const body = new THREE.Group(); body.name = `NPC_${key}`; body.userData.npc = { key, name, source: 'Mixamo/u7' };
    // 도시(하늘 아래 70m)에 붙이기 전에 잰다. 월드 높이를 발바닥 보정에 넣으면 사람이 하늘로 떠오른다.
    body.add(visual);
    visual.updateMatrixWorld(true); bound.setFromObject(visual); bound.getSize(size);
    // 모델별 단위·발바닥 원점을 정리한다. 한 명의 모델을 여러 번 복제하지 않는다.
    const height = THREE.MathUtils.clamp(size.y, 1.48, 1.95), scale = height / Math.max(.01, size.y);
    visual.scale.multiplyScalar(scale); visual.position.y -= bound.min.y * scale;
    city.add(body);
    const meshes = [];
    visual.traverse(o => {
      if (!o.isMesh) return;
      meshes.push(o); o.castShadow = false; o.receiveShadow = true; o.frustumCulled = false;
      for (const material of Array.isArray(o.material) ? o.material : [o.material]) if (!materials.has(material)) {
        materials.add(material);
        if (material.isMeshStandardMaterial) { material.envMap = envMap; material.envMapIntensity = .35; material.roughness = Math.max(.65, material.roughness); material.metalness = 0; }
      }
    });
    const clip = gltf.animations.find(a => a.name === 'walk') ?? gltf.animations[0];
    const mixer = new THREE.AnimationMixer(visual), action = clip ? mixer.clipAction(clip) : null;
    if (action) { action.play(); action.time = rand() * clip.duration; }
    const [sx, sz] = CORNERS[i % CORNERS.length], [a, b] = EDGES[SPAWN_EDGES[Math.floor(i / 4) % SPAWN_EDGES.length]];
    const w = { key, id: i, body, visual, meshes, mixer, action, rand, sx, sz, from: a, to: b,
      position: new THREE.Vector2(), heading: 0, speed: key === 'martha' ? .92 : 1.12 + rand() * .28,
      pause: 0, stroll: 10 + rand() * 20, animDt: 0, timeScale: 1, near: false };
    const A = point(w, a, new THREE.Vector2()), B = point(w, b, new THREE.Vector2()), dir = B.clone().sub(A).normalize();
    w.position.copy(A).lerp(B, .16 + rand() * .68).add(new THREE.Vector2(-dir.y, dir.x).multiplyScalar(.33));
    if (rand() > .5) { w.from = b; w.to = a; dir.negate(); }
    w.heading = Math.atan2(dir.x, dir.y); body.rotation.y = w.heading;
    body.position.set(w.position.x, groundY, w.position.y); walkers.push(w);
  }
  if (walkers.length === 0) throw new Error('거리 행인 모델이 없어요. seoul 꾸러미를 다시 확인해 주세요.');

  const target = new THREE.Vector2(), direction = new THREE.Vector2(), candidate = new THREE.Vector2(); let frame = 0;
  const footprints=obstacles.map(([a,b,c,d])=>[a-.23,b+.23,-d-.23,-c+.23]);
  const obstructed=(x,z)=>footprints.some(([a,b,c,d])=>x>a&&x<b&&z>c&&z<d);
  function clearSidewalk(x,z,w){
    [x,z]=sidewalk(x,z,w);
    for(let step=0;step<3;step++){
      const hit=footprints.find(([a,b,c,d])=>x>a&&x<b&&z>c&&z<d);if(!hit)return [x,z];
      const [a,b,c,d]=hit;
      const choices=[[a-.015,z],[b+.015,z],[x,c-.015],[x,d+.015]].map(p=>sidewalk(...p,w))
        .filter(p=>!obstructed(...p)).sort((p,q)=>Math.hypot(p[0]-x,p[1]-z)-Math.hypot(q[0]-x,q[1]-z));
      if(!choices.length)return [w.position.x,w.position.y];
      [x,z]=choices[0];
    }
    return [x,z];
  }
  function chooseNext(w) {
    const reached = w.to, choices = NEIGHBORS[reached].filter(node => node !== w.from);
    w.from = reached; w.to = choices.length ? choices[Math.floor(w.rand() * choices.length)] : NEIGHBORS[reached][0];
    if ([2, 3, 5, 6, 7, 8, 9, 10].includes(reached) && w.rand() < .35) w.pause = .7 + w.rand() * 2.1;
  }
  function update(dt, playerCity) {
    frame++;
    for (const w of walkers) {
      point(w, w.to, target); direction.subVectors(target, w.position);
      if (direction.lengthSq() < .26) { chooseNext(w); point(w, w.to, target); direction.subVectors(target, w.position); }
      direction.normalize(); candidate.copy(target);
      candidate.x += -direction.y * .33; candidate.y += direction.x * .33;
      direction.subVectors(candidate, w.position).normalize();
      w.stroll -= dt;
      if (w.stroll <= 0) { w.pause = .6 + w.rand() * 1.5; w.stroll = 18 + w.rand() * 25; }
      w.pause = Math.max(0, w.pause - dt);
      let speed = w.pause > 0 ? 0 : w.speed, dodge = 0;
      if (playerCity) {
        const dx = playerCity.x - w.position.x, dz = playerCity.z - w.position.y;
        const ahead = dx * direction.x + dz * direction.y, across = dx * -direction.y + dz * direction.x;
        if (ahead > 0 && ahead < 1.7 && Math.abs(across) < .72) {
          speed *= THREE.MathUtils.clamp((ahead - .55) / 1.15, 0, 1); dodge = across > 0 ? -.55 : .55;
        }
      }
      for (const other of walkers) {
        if (other === w) continue;
        const dx = other.position.x - w.position.x, dz = other.position.y - w.position.y, d2 = dx * dx + dz * dz;
        if (d2 > 2.25) continue;
        const ahead = dx * direction.x + dz * direction.y, across = dx * -direction.y + dz * direction.x;
        if (ahead > 0 && Math.abs(across) < .47) {
          speed = Math.min(speed, w.speed * THREE.MathUtils.clamp((Math.sqrt(d2) - .55) / .9, 0, 1));
          if (w.id > other.id) dodge += across > 0 ? -.3 : .3;
        }
      }
      candidate.copy(w.position).addScaledVector(direction, speed * dt);
      candidate.x += -direction.y * dodge * dt; candidate.y += direction.x * dodge * dt;
      const [x, z] = clearSidewalk(candidate.x, candidate.y, w); w.position.set(x, z); w.body.position.set(x, groundY, z);
      if (speed > .02) {
        const heading = Math.atan2(direction.x, direction.y), diff = Math.atan2(Math.sin(heading - w.heading), Math.cos(heading - w.heading));
        w.heading += diff * (1 - Math.exp(-dt * 7));
      }
      w.body.rotation.y = w.heading; w.timeScale = THREE.MathUtils.damp(w.timeScale, speed / 1.25, 9, dt);
      if (w.action) w.action.timeScale = w.timeScale;
      const distance = playerCity ? Math.hypot(x - playerCity.x, z - playerCity.z) : 0;
      w.body.visible = distance < 90; const rate = distance < 28 ? 1 : distance < 55 ? 2 : 4; w.animDt += dt;
      if (w.body.visible && frame % rate === w.id % rate) { w.mixer.update(w.animDt); w.animDt = 0; }
      else if (!w.body.visible) w.animDt = 0;
      const near = distance < 18;
      if (near !== w.near) { w.near = near; for (const mesh of w.meshes) mesh.castShadow = near; }
    }
  }
  return { walkers, update, count: () => walkers.length, loaded: () => walkers.map(w => w.key), failed: () => [...failed] };
}
