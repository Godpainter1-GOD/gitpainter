// g001 · basic 꾸러미(바탕) — bongsik/project-map/m003에서 핵심 기능만 옮긴 판.
// (2026-11-06 사용자: "핵심 기능만 가져와줘.. 겔러리, 모퉁이이동, 파리, 서울, 날씨조절, 기본비행선" →
//  "엡 기준으로 파일들을 분리한후 zip 형태로 묶어둔후 플레이 … basic는 안건들여지는 형태의 패키지 … 주종근 그림, 그림전시회가 빠진게 베이직이야")
// - basic = 기본 비행선(assets/airship.glb, 데크 + 리카 걷기) · 파리·서울 배경 · 날씨 조절(weather.js) · 모퉁이 이동(ship-transfer.js) · 바탕화면 ⚙ 메뉴(appshell.js).
// - 그림 전시회(gallery)와 주종근 그림(drawings)은 따로 묶은 꾸러미다. basic은 그 둘을 모른다 — packages.json에 적힌 꾸러미의 index.js를 불러
//   install(host)를 부르기만 한다. 꾸러미를 넣고 빼도 이 파일은 고치지 않는다(아래 "꾸러미가 붙는 자리").
// - 파리·서울: 원통 파노라마 5장(전체·앞·왼쪽·뒤·오른쪽)을 셰이더로 섞은 배경. 전망 버튼 글은 BACKGROUNDS[].views.
// - 모퉁이 이동: 모서리 가까이에서 E → 다른 비행선을 클릭. 갈 곳이 있어야 해서 기본 비행선을 한 척 더 띄웠다(SHIPS).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createWeather } from './weather.js';
import { createShipTransfer } from './ship-transfer.js';
import { createAppShell } from './appshell.js';

const $ = (id) => document.getElementById(id);
const canvas = $('scene');
const deg = THREE.MathUtils.degToRad;
const state = { ready:false, mode:'view', view:'tower', heading:-Math.PI, pitch:deg(7), orbit:0, zoom:1, viewHeight:0, gait:0, walking:false, stepRemaining:0, stepDirection:1, frames:0, elapsed:0 };
// Shift+위아래 드래그/휠: 내 카메라만 데크 기준 −60~200m 이동한다.
const VIEW_HEIGHT = { min:-60, max:200, dragScale:.06, wheelScale:.02 };
// 천장 파노라마의 이음새까지 올려다보지 않도록 제한한다.
const PITCH_MIN = deg(-85), PITCH_MAX = deg(35);
// 걸을 수 있는 데크: |x|≤3.55, |z|≤6.2, 모서리는 (2.7, 5.4) 중심 반지름 1.1(m003 deck-style.js WALK와 같은 값)
const WALK = { hx:3.55, hz:6.2, cx:2.7, cz:5.4, r:1.1 };
// 걷는 빠르기(m/s). 2026-11-06 사용자: "이동 속도 올려줘.. 지금의 뛰는 속도로" → 기본 1.1 → 1.85(전의 Shift 빠르기). Shift는 같은 비율로 3.1
const WALK_SPEED = 1.85, RUN_SPEED = 3.1;
// 리카 키 1.50m(원본 모델은 머리 포함 1.786m)
const RIKA_H = 1.50, RIKA_K = RIKA_H/1.786;
// 비행선: 내 배(0,0) + 앞쪽 아래 한 척(m003 도킹 자리 1번과 같은 곳: 앞 20m, 1.8m 낮게). 모퉁이 이동으로만 오간다
const SHIPS = [
 { key:'home', title:'1호 비행선', cx:0, cz:0, h:0 },
 { key:'ship2', title:'2호 비행선', cx:0, cz:-20, h:-1.8 },
];
const keys = new Set(), lookHolds = new Set();
let walkCameraMode = 'follow', lookMode = false, uiHidden = false, auto = null;
let renderer, root, player, character, fit, mixer, walkActions = [], idlePose = [], motion = 'idle', restPlayerY = 70.045, stride = 1.25*RIKA_K, walkDuration = 1;
let decks = [], currentDeck = null, floorY = 0, transfers = null, weather = null, shell = null, shipTemplate = null, homeName = '';
// 꾸러미가 붙는 자리(아래 host): 무대(다른 기능을 막는 상태) · 탈것(캐릭터와 카메라를 데려가는 것) · 누름 가로채기 · 알림 받기 · 강단 · 걷는 곳 · 비행선
const stages = [], drivers = [], taps = [], listeners = {}, packages = [];
// 꾸러미가 더한 걷는 곳(다리·계단 …). surface = {contains(x,z), height(x,z)} — 데크 좌표, 높이는 1호 데크 = 0. footing = 지금 밟고 있는 걷는 곳(데크 위면 null)
const surfaces = []; let footing = null;
const STEP_UP = .6;   // 이만큼(m)보다 높이 차가 큰 곳으로는 걸어서 못 넘어간다
let podiumOf = null;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(69,innerWidth/innerHeight,.03,20000);
const rig = new THREE.Group(); rig.name='ShipRig'; scene.add(rig);   // 태풍 때 weather.js가 이 묶음을 흔든다
const target = new THREE.Vector3(), desired = new THREE.Vector3(), forward = new THREE.Vector3();
const UP = new THREE.Vector3(0,1,0);
let previousTime = performance.now();
const loadingManager = new THREE.LoadingManager();
loadingManager.onProgress = (_url,loaded,total) => { $('load-text').textContent=`전망 데크를 준비하고 있어요 · ${loaded} / ${total}`; };
const textureLoader = new THREE.TextureLoader(loadingManager);

// 전망 카메라 자리: 앞(−z)·왼쪽(−x)·오른쪽(+x)·전체. 글은 배경마다 BACKGROUNDS[].views에서 채운다
const presets = {
 tower:{position:[2.4,1.65,-1],target:[0,2,-100],fov:69.4},
 yeouido:{position:[.5,1.65,-1.2],target:[-100,2,-1.2],fov:62},
 hangang:{position:[2.8,1.65,.5],target:[100,.5,-2],fov:59},
 overview:{position:[0,5,28],target:[0,7,-10],fov:73.7},
};
// 배경: 원통 그림 5장(전체·앞·왼쪽·뒤·오른쪽 순). views = [버튼, 작은 제목, 제목, 설명]. sun = 햇빛 색
const BACKGROUNDS = {
 paris:{short:'파리',name:'파리 상공',eyebrow:'PARIS · EIFFEL TOWER 360°',tagline:'세느강 위, 에펠탑과 파리 시내를 내려다보는 시간.',sun:0xffe4b5,
  files:['paris/paris-panorama-reference.png','paris/paris-eiffel.png','paris/paris-montmartre.png','paris/paris-west.png','paris/paris-river.png'],
  credit:'배경 그림: 파리 상공 파노라마(전체 1장 + 방향별 4장, AI로 그림)',
  views:{tower:['에펠탑','EIFFEL TOWER','파리의 상징 에펠탑.','유리 난간 너머, 센강과 장엄한 에펠탑을 바라보세요.'],
   yeouido:['몽마르트르','MONTMARTRE','언덕 위 사크레쾨르.','하얀 돔 성당이 파리 북쪽 하늘에 우뚝 서 있어요.'],
   hangang:['센강','SEINE RIVER','파리를 가로지르는 강.','유려하게 굽이치는 센강과 고풍스러운 오스만 지붕들.'],
   overview:['부유선 전체','THE AIRSHIP','우리만의 작은 전망대.','부유선이 파리 하늘 위에 고요히 머뭅니다.']}},
 seoul:{short:'서울',name:'서울 상공',eyebrow:'ABOVE THE HAN RIVER',tagline:'조금 천천히, 도시를 바라보는 시간.',sun:0xffd5a0,
  files:['seoul/seoul-panorama.png','seoul/seoul-tower.png','seoul/seoul-yeouido.png','seoul/seoul-gangnam.png','seoul/seoul-hangang.png'],
  credit:'배경 그림: 서울 상공 파노라마(전체 1장 + 방향별 4장, AI로 그림)',
  views:{tower:['남산타워','N SEOUL TOWER','눈앞에 펼쳐진 서울.','유리 난간 너머, 한강과 남산타워를 바라보세요.'],
   yeouido:['여의도','YEOUIDO','노을 속 금빛 빌딩.','한강 건너 여의도, 63빌딩을 찾아보세요.'],
   hangang:['한강','HANGANG','강을 따라 흐르는 오후.','다리를 지나 동쪽으로, 멀리 롯데월드타워까지 이어지는 한강.'],
   overview:['부유선 전체','THE AIRSHIP','우리만의 작은 전망대.','가벼운 부유선이 한강 위에 머뭅니다.']}},
};

function fail(error) {
 console.error(error); $('loading').hidden=true; $('error').hidden=false;
 $('error-message').textContent=error?.message || 'WebGL을 지원하는 브라우저에서 로컬 실행 주소로 다시 열어주세요.';
}
addEventListener('error',e=>{ if(!state.ready) fail(e.error||new Error(e.message)); });
addEventListener('unhandledrejection',e=>fail(e.reason));
try {
 renderer = new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
 renderer.setPixelRatio(Math.min(devicePixelRatio,1.5)); renderer.setSize(innerWidth,innerHeight);
 renderer.outputColorSpace=THREE.SRGBColorSpace; renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.05;
 renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFShadowMap;
} catch(error) { fail(new Error('이 브라우저에서 WebGL2를 시작하지 못했어요. Chrome 또는 Safari에서 다시 열어주세요.')); }

const hemi=new THREE.HemisphereLight(0xc9ddf5,0x6c5235,2.4);scene.add(hemi);
const sun=new THREE.DirectionalLight(0xfff2dc,3.0);sun.position.set(-25,45,35);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-10,right:10,top:12,bottom:-12,near:1,far:110});sun.shadow.bias=-.0003;sun.shadow.normalBias=.015;scene.add(sun);scene.add(sun.target);
const fill=new THREE.DirectionalLight(0xe1eaff,1.05);fill.position.set(8,12,-18);scene.add(fill);

// ---------- 배경(파리·서울 원통 파노라마) ----------
let backgroundKey=null, backgroundEnv=null, backgroundLoading=false;
const skies={};
function createCylinderSky(textures) {   // 전체 그림 위에 방향별 4장을 가장자리에서 섞어 덧입힌다
 const uniforms={baseMap:{value:textures[0]},eastMap:{value:textures[1]},northMap:{value:textures[2]},westMap:{value:textures[3]},southMap:{value:textures[4]}};
 const material=new THREE.ShaderMaterial({uniforms,side:THREE.BackSide,depthWrite:false,toneMapped:false,
 vertexShader:`varying vec3 vWorld;void main(){vec4 p=modelMatrix*vec4(position,1.);vWorld=p.xyz;gl_Position=projectionMatrix*viewMatrix*p;}`,
 fragmentShader:`
 varying vec3 vWorld;uniform sampler2D baseMap,eastMap,northMap,westMap,southMap;
 const float PI=3.141592653589793;const float TAU=6.283185307179586;
 float wrap(float a){return mod(a+PI,TAU)-PI;}
 vec3 panel(sampler2D image,float a,float center,float e,out float weight){float delta=wrap(a-center);vec2 uv=vec2(.5+delta/1.919862177,.5+e/1.396263402);weight=clamp((.5-abs(uv.x-.5))*7.,0.,1.);return texture2D(image,clamp(uv,0.,1.)).rgb;}
 void main(){vec3 d=vWorld-vec3(0.,1.65,0.);float a=atan(d.x,-d.z);float e=atan(d.y,length(d.xz));vec3 base=texture2D(baseMap,vec2(fract(.5+a/TAU),.5+e/PI)).rgb;float w1,w2,w3,w4;vec3 c1=panel(eastMap,a,0.,e,w1);vec3 c2=panel(northMap,a,-PI*.5,e,w2);vec3 c3=panel(westMap,a,PI,e,w3);vec3 c4=panel(southMap,a,PI*.5,e,w4);vec3 detail=(c1*w1+c2*w2+c3*w3+c4*w4)/max(w1+w2+w3+w4,.0001);float v=clamp((.5-abs(e/1.396263402))*16.,0.,1.);gl_FragColor=vec4(mix(base,detail,v),1.);
 #include <colorspace_fragment>
 }`});
 const group=new THREE.Group();
 const wall=new THREE.Mesh(new THREE.CylinderGeometry(1100,1100,12000,256,24,true),material);wall.renderOrder=-2;wall.frustumCulled=false;
 const caps=new THREE.Mesh(new THREE.SphereGeometry(9000,32,24),material);caps.renderOrder=-3;group.add(wall,caps);scene.add(group);return group;
}
function setEnvironment(texture) {   // 조명 반사는 전체 그림으로
 const envMap=texture.clone();envMap.mapping=THREE.EquirectangularReflectionMapping;const pmrem=new THREE.PMREMGenerator(renderer);const env=pmrem.fromEquirectangular(envMap);pmrem.dispose();envMap.dispose();
 backgroundEnv?.dispose();backgroundEnv=env.texture;scene.environment=env.texture;
 if(!backgroundKey)scene.environmentIntensity=.6;   // 처음 한 번만: 그 뒤 세기는 weather.js가 날씨에 맞춰 쥔다
}
async function useBackground(key) {
 const bg=BACKGROUNDS[key];if(!bg||backgroundLoading||key===backgroundKey)return;backgroundLoading=true;
 for(const b of document.querySelectorAll('[data-bg]'))b.disabled=true;
 try {
  if(!skies[key]){
   const textures=await Promise.all(bg.files.map(async name=>{const t=await textureLoader.loadAsync(`./assets/${name}`);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());return t;}));
   skies[key]={sky:createCylinderSky(textures),envTex:textures[0]};
  }
  for(const k of Object.keys(skies))skies[k].sky.visible=k===key;
  setEnvironment(skies[key].envTex);sun.color.set(bg.sun);
  backgroundKey=key;try{localStorage.setItem('newgame-background',key);}catch{}
  const identity=document.querySelector('.identity');identity.querySelector('.eyebrow').textContent=bg.eyebrow;identity.querySelector('h1').textContent=bg.name;identity.querySelector('p').textContent=bg.tagline;document.title=`${bg.name} · 부유선`;
  $('experience').setAttribute('aria-label',`${bg.name} 부유선 3D 전망 공간`);
  canvas.setAttribute('aria-label',`${bg.name} 360° 전망. 위로 드래그하면 올려다보고 아래로 드래그하면 내려다봅니다. Shift와 함께 위아래로 드래그하면 시점 고도를 조절합니다. WASD 또는 방향키로 산책합니다.`);
  for(const [name,[label,kicker,title,description]] of Object.entries(bg.views)){Object.assign(presets[name],{kicker,title,description});document.querySelector(`[data-view="${name}"]`).textContent=label;}
  $('bg-credit').textContent=bg.credit;
  for(const b of document.querySelectorAll('[data-bg]')){const active=b.dataset.bg===key;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));}
  if(state.mode==='view')showLocation(presets[state.view]);
  else if(state.ready&&state.mode!=='lecture')$('view-title').textContent=walkTitle(state.mode);
 } finally {backgroundLoading=false;for(const b of document.querySelectorAll('[data-bg]'))b.disabled=false;}
}
function showLocation({kicker,title,description}){$('view-kicker').textContent=kicker;$('view-title').textContent=title;$('view-description').textContent=description;}

// ---------- 비행선·캐릭터 ----------
function woodTexture() {
 const c=document.createElement('canvas');c.width=512;c.height=256;const ctx=c.getContext('2d');ctx.fillStyle='#b29970';ctx.fillRect(0,0,512,256);
 let seed=912;const rand=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
 for(let i=0;i<850;i++){const y=rand()*256;ctx.strokeStyle=`rgba(${rand()>.5?'80,54,28':'235,214,168'},${.015+rand()*.055})`;ctx.lineWidth=.4+rand()*.6;ctx.beginPath();ctx.moveTo(0,y);ctx.bezierCurveTo(150,y+rand()*3,350,y-rand()*3,512,y+rand()*2);ctx.stroke();}
 const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.anisotropy=renderer.capabilities.getMaxAnisotropy();return texture;
}
function buildIdlePose() {
 // 걷기의 반대쪽 두 순간을 평균해 서 있는 자세를 만든다(A/T 자세 차이를 피한다). 발이 바닥에 닿게 높이도 맞춘다
 for(const action of walkActions)action.play();mixer.setTime(0);root.updateMatrixWorld(true);
 const nodes=[];root.traverse(o=>{if(o.isBone || o===fit)nodes.push(o);});
 const first=nodes.map(o=>({object:o,position:o.position.clone(),quaternion:o.quaternion.clone(),scale:o.scale.clone()}));
 mixer.setTime(.5);root.updateMatrixWorld(true);
 const pose=first.map(t=>({object:t.object,position:t.position.lerp(t.object.position,.5),quaternion:t.quaternion.slerp(t.object.quaternion,.5),scale:t.scale.lerp(t.object.scale,.5)}));
 for(const action of walkActions)action.stop();
 for(const t of pose){t.object.position.copy(t.position);t.object.quaternion.copy(t.quaternion);t.object.scale.copy(t.scale);}
 root.updateMatrixWorld(true);character.skeleton.update();character.computeBoundingBox();const box=character.boundingBox.clone().applyMatrix4(character.matrixWorld);const lift=.045-box.min.y;
 const fitIdle=pose.find(t=>t.object===fit);fitIdle.position.y+=lift;fit.position.copy(fitIdle.position);root.updateMatrixWorld(true);
 return pose;
}
function animate(next,time) {   // 'idle' = 서 있는 자세, 'walk' = 걸음 위치(time)에 맞춘 걷기
 if(motion!==next){
  mixer.stopAllAction();
  for(const p of idlePose){p.object.position.copy(p.position);p.object.quaternion.copy(p.quaternion);p.object.scale.copy(p.scale);}
  if(next==='walk')for(const action of walkActions)action.play();
  motion=next;
 }
 if(motion==='walk')mixer.setTime(time);
}
// 기본 비행선(선체·난간·데크)을 한 척 더 띄운다. def = {key, title, cx, cz, h} — 데크 좌표의 중심과 높이(1호 = 0)
function addShip(def){
 const ship=shipTemplate.clone(true);ship.name=`Airship-${def.key}`;ship.position.set(def.cx,def.h,def.cz);root.add(ship);
 const rec={...def,deck:ship.getObjectByName(homeName)||ship,ship,meshes:deckMeshesOf(ship),available:true,k:1};decks.push(rec);return rec;
}
// 난간에 문 열기(다리·계단이 닿는 곳): 손잡이·유리에서 문 자리만 그리지 않는다. side = 'front'(−z) · 'back'(+z) · 'left'(−x) · 'right'(+x), 가운데에 폭 2·half.
// 배마다 재질을 따로 두고 문은 4개까지. 돌려주는 함수 = 문 닫기. 꾸러미가 배의 재질을 바꾼다면 문을 열기 전에 바꾼다
const GATE_AT={front:[0,-6.87,0,.25],back:[0,6.87,0,.25],left:[-4.22,0,.25,0],right:[4.22,0,.25,0]};
function gateMaterial(base,uniform){
 const m=base.clone();
 m.onBeforeCompile=(shader)=>{shader.uniforms.gates=uniform;
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vGate;').replace('#include <begin_vertex>','#include <begin_vertex>\nvGate=position;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vGate;uniform vec4 gates[4];').replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\nfor(int i=0;i<4;i++){if(abs(vGate.x-gates[i].x)<gates[i].z&&abs(vGate.z-gates[i].y)<gates[i].w)discard;}');};
 m.customProgramCacheKey=()=>'rail-gate';return m;
}
function openGate(rec,side,half=.6){
 const at=GATE_AT[side];if(!rec?.deck||!at)return ()=>{};
 if(!rec.gates){   // 처음 여는 배: 손잡이·유리에 문을 뚫을 수 있는 재질을 입힌다
  rec.gates=[];rec.gateUniform={value:[0,1,2,3].map(()=>new THREE.Vector4(0,0,-1,-1))};const made=new Map();
  rec.deck.traverse(o=>{if(!o.isMesh||!(o.name.startsWith('Clear_glass')||o.name.startsWith('Unbroken_slim_handrail')||o.name.startsWith('Small_flush_glass_clamp')))return;
   if(!made.has(o.material))made.set(o.material,gateMaterial(o.material,rec.gateUniform));o.material=made.get(o.material);});
 }
 const gate={x:at[0],z:at[1],hx:at[2]||half,hz:at[3]||half};rec.gates.push(gate);
 const sync=()=>rec.gateUniform.value.forEach((v,i)=>{const g=rec.gates[i];if(g)v.set(g.x,g.z,g.hx,g.hz);else v.set(0,0,-1,-1);});
 sync();return ()=>{const i=rec.gates.indexOf(gate);if(i>=0)rec.gates.splice(i,1);sync();};
}
const deckMeshesOf=(object)=>{const list=[];object.traverse(o=>{if(o.isMesh&&!o.isSkinnedMesh&&!o.name.startsWith('Clear_glass'))list.push(o);});return list;};

async function init() {
 if(!renderer)return;
 // 배경: 주소 ?bg=seoul > 이 브라우저의 마지막 선택 > 파리
 let saved=null;try{saved=localStorage.getItem('newgame-background');}catch{}
 const firstBackground=[new URLSearchParams(location.search).get('bg'),saved].find(k=>BACKGROUNDS[k])||'paris';
 const [gltf]=await Promise.all([new GLTFLoader(loadingManager).loadAsync('./assets/airship.glb'),useBackground(firstBackground)]);
 root=gltf.scene;rig.add(root);const raw=root.getObjectByName('Player');fit=root.getObjectByName('CharacterFit');character=root.getObjectByName('Character');
 if(!raw || !character || !fit)throw new Error('데크와 걷는 캐릭터를 읽지 못했어요. 모델 파일을 확인해주세요.');
 const homeDeck=raw.parent;   // 사람이 서는 데크 좌표계(glTF의 Airship 노드, 70m 아래로 내려 둔 노드)
 restPlayerY=raw.position.y;raw.scale.setScalar(raw.scale.x*RIKA_K);raw.position.set(0,restPlayerY,.8);
 const grain=woodTexture();const glass=new THREE.MeshBasicMaterial({color:0xd5e6ea,transparent:true,opacity:.065,side:THREE.DoubleSide,depthWrite:false});
 root.traverse(o=>{if(!o.isMesh)return;o.castShadow=!o.name.startsWith('Clear_glass')&&!o.name.startsWith('Flush_teak');o.receiveShadow=true;
  if(o.material?.name==='ClearGlass' || o.name.startsWith('Clear_glass')){o.material=glass;o.castShadow=false;}
  else if(o.material?.name.includes('Pale natural teak')) {o.material=o.material.clone();o.material.color.set('#ffffff');o.material.map=grain;o.material.roughness=.78;const position=o.geometry.attributes.position;const uvs=new Float32Array(position.count*2);for(let i=0;i<position.count;i++){uvs[i*2]=position.getX(i)*.24;uvs[i*2+1]=position.getZ(i)*3;}o.geometry.setAttribute('uv',new THREE.BufferAttribute(uvs,2));}
 });
 character.material=character.material.clone();character.material.metalness=0;character.material.roughness=.85;character.frustumCulled=false;
 // 바닥 높이는 데크에 위에서 광선을 쏴서 잰다
 const homeMeshes=deckMeshesOf(root);root.updateMatrixWorld(true);
 const probe=homeDeck.localToWorld(new THREE.Vector3(0,restPlayerY,-3));const hit=new THREE.Raycaster(probe.clone().setY(probe.y+5),new THREE.Vector3(0,-1,0),0,20).intersectObjects(homeMeshes,false)[0];
 floorY=homeDeck.worldToLocal((hit?hit.point:probe).clone()).y;
 // 사람을 태우기 전의 비행선을 복제해 둔다 → 다른 비행선(선체·난간·데크만)
 shipTemplate=root.clone(true);shipTemplate.getObjectByName('Player')?.removeFromParent();homeName=homeDeck.name;
 decks.push({...SHIPS[0],deck:homeDeck,ship:root,meshes:homeMeshes,available:true,k:1});
 for(const def of SHIPS.slice(1))addShip(def);
 currentDeck=decks[0];
 // 리카: 원본 Player는 뒤돌기(180°)가 Euler (π, 0, π)로 들어 있어 그 위에 rotation.y만 바꾸면 도는 방향이 거꾸로 된다.
 // 빈 묶음으로 한 번 감싸 바깥 묶음의 rotation.y(= 방향 + π) 하나로 돌린다
 mixer=new THREE.AnimationMixer(root);walkActions=gltf.animations.map(clip=>mixer.clipAction(clip));if(!walkActions.length)throw new Error('걷기 동작이 모델에 없습니다.');
 buildIdlePose();mixer.stopAllAction();mixer.uncacheRoot(root);
 player=new THREE.Group();player.name='RikaAvatar';homeDeck.add(player);player.add(raw);raw.position.set(0,0,0);raw.rotation.set(Math.PI,0,Math.PI);
 player.position.set(0,restPlayerY,.8);player.rotation.y=state.heading+Math.PI;
 idlePose=[];player.traverse(o=>{if(o.isBone||o===fit)idlePose.push({object:o,position:o.position.clone(),quaternion:o.quaternion.clone(),scale:o.scale.clone()});});
 mixer=new THREE.AnimationMixer(player);walkActions=gltf.animations.map(clip=>mixer.clipAction(clip));walkDuration=Math.max(...gltf.animations.map(clip=>clip.duration));

 state.ready=true;$('loading').hidden=true;setMode('follow');previousTime=performance.now();renderer.setAnimationLoop(tick);

 weather=createWeather({scene,camera,getShip:()=>rig});window.weather=weather;   // 날씨 아이콘 + 조절판(오른쪽 위)
 transfers=createShipTransfer({canvas,camera,floorY,restY:restPlayerY,getPlayer:()=>player,
  getDecks:()=>decks,
  isBusy:()=>busyExcept('corner'),
  canStand:(x,z,h)=>[[0,0],[.25,0],[-.25,0],[0,.25],[0,-.25]].every(([dx,dz])=>{const d=deckAt(x+dx,z+dz);return d&&Math.abs(d.h-h)<.1;}),
  onArm:stopWalking,
  onTravel:({x,z,h,heading})=>{
   stopWalking();
   currentDeck=deckAt(x,z)??currentDeck;footing=null;player.position.set(x,restPlayerY+h,z);state.heading=heading;player.rotation.y=heading+Math.PI;
   if(state.mode!=='first')setMode('follow');updateCamera(1,true);
  }});window.spaceTransfer=transfers;
 stages.push({name:'corner',active:()=>transfers.active(),modal:false});
 await loadPackages();   // 추가 꾸러미(그림 전시회 · 주종근 그림 …)
 shell=createAppShell({apps:APPS,defaults:appDefaults(),packages});window.appShell=shell;   // 바탕화면 · ⚙ 메뉴

 // 검수용
 window.spaceView={
  getState:()=>({ready:state.ready,mode:state.mode,view:state.view,background:backgroundKey,deck:currentDeck.key,footing:footing?.name??(footing?'surface':null),walking:state.walking,motion,
   heading:state.heading,pitch:state.pitch,orbit:state.orbit,zoom:state.zoom,viewHeight:state.viewHeight,gait:state.gait,
   player:[player.position.x,player.position.y-restPlayerY,player.position.z],camera:camera.position.toArray(),
   drawings:window.spaceDrawings?.getState().phase,packages:packages.map(p=>p.id),apps:shell?.getState().running,frames:state.frames,elapsed:state.elapsed,triangles:renderer.info.render.triangles,drawCalls:renderer.info.render.calls}),
  setView,setMode,togglePerspective,reset,useBackground,toggleUI,
  walk:(heading,distance)=>{state.heading=heading;player.rotation.y=heading+Math.PI;return [move(distance),player.position.x,player.position.z];},
  place:(x,z)=>placeAt(x,z),
  frame:(n=1)=>{for(let i=0;i<n;i++)tick(performance.now()+i*16);},   // 창이 가려져 그리기가 멈춘 브라우저에서 직접 그리기
 };
}

// ---------- 시점 ----------
function setView(name) {
 if(!state.ready||!presets[name])return;stopAuto();keys.clear();state.stepRemaining=0;setWalking(false);state.mode='view';state.view=name;state.orbit=0;state.pitch=0;state.zoom=1;
 showLocation(presets[name]);
 for(const b of document.querySelectorAll('[data-view]')){const active=b.dataset.view===name;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));}
 $('first-person').setAttribute('aria-pressed','false');$('follow').setAttribute('aria-pressed','false');updateCamera(1,true);
}
function walkTitle(mode) { const place=BACKGROUNDS[backgroundKey]?.short??''; return mode==='first'?`내 눈으로 걷는 ${place}.`:`리카의 ${place} 산책.`; }
function togglePerspective() { if(state.ready)setMode(state.mode==='first'?'follow':'first'); }
function setMode(mode) {
 if(!state.ready)return;if(mode==='first'||mode==='follow'){stopAuto();walkCameraMode=mode;}
 state.mode=mode;state.orbit=0;state.pitch=deg(7);state.zoom=1;
 $('first-person').setAttribute('aria-pressed',String(mode==='first'));$('follow').setAttribute('aria-pressed',String(mode==='follow'));$('btn-v').setAttribute('aria-pressed',String(mode==='first'));
 for(const b of document.querySelectorAll('[data-view]')){b.classList.remove('active');b.setAttribute('aria-pressed','false');}
 showLocation({kicker:mode==='first'?'MY WALK':'MY CHARACTER',title:walkTitle(mode),description:'W / S 또는 ↑ / ↓로 앞뒤 이동 · A / D 또는 ← / →로 방향 전환'});
 updateCamera(1,true);canvas.focus({preventScroll:true});
}
function toggleLookMode(forced){   // 둘러보기: 방향키로 걷는 대신 시선만 돌린다
 lookMode=forced!==undefined?forced:!lookMode;
 const stepBtn=$('step'),nav=document.querySelector('.navigation');
 stepBtn.setAttribute('aria-pressed',String(lookMode));stepBtn.textContent=lookMode?'둘러보기':'한 걸음';
 stepBtn.setAttribute('aria-label',lookMode?'시선 둘러보기 모드 · 다시 누르면 걷기 모드':'누르면 방향키로 시선 둘러보기');
 nav.classList.toggle('look-mode',lookMode);nav.setAttribute('aria-label',lookMode?'방향키로 시선 둘러보기':'클릭으로 걷기');
 for(const [key,walk,look,walkLabel,lookLabel] of [['ArrowUp','↑','▲','앞으로 걷기','위로 올려다보기'],['ArrowDown','↓','▼','뒤로 걷기','아래로 내려다보기'],['ArrowLeft','←','◀','왼쪽으로 돌기','왼쪽 둘러보기'],['ArrowRight','→','▶','오른쪽으로 돌기','오른쪽 둘러보기']]){
  const b=nav.querySelector(`[data-key="${key}"]`);b.textContent=lookMode?look:walk;b.setAttribute('aria-label',lookMode?lookLabel:walkLabel);
 }
 $('hint').textContent=lookMode?'방향키(↑↓←→)로 시선을 둘러보세요 · Shift+드래그로 고도 조절':'위아래 드래그·시선 ↑↓로 고개 돌리기 · Shift+드래그로 고도 조절 · WASD 산책';
}
function reset() {
 if(!state.ready||driving())return;lookHolds.clear();toggleLookMode(false);stopAuto();keys.clear();state.stepRemaining=0;setWalking(false);transfers?.cancel();
 emit('reset');state.heading=-Math.PI;state.pitch=deg(7);state.orbit=0;state.viewHeight=0;currentDeck=decks[0];footing=null;player.position.set(0,restPlayerY,.8);player.rotation.y=state.heading+Math.PI;
 if(state.mode!=='first')setMode('follow');updateCamera(1,true);
}
function changeViewHeight(delta) { if(state.ready)state.viewHeight=THREE.MathUtils.clamp(state.viewHeight+delta,VIEW_HEIGHT.min,VIEW_HEIGHT.max); }
function toggleUI(forced) {   // 화면 정리(H): 아이콘·글을 감추고 풍경만
 uiHidden=forced!==undefined?forced:!uiHidden;
 document.body.classList.toggle('ui-hidden',uiHidden);$('ui-restore-btn').hidden=!uiHidden;$('ui-toggle').setAttribute('aria-pressed',String(uiHidden));
}
function updateCamera(dt,immediate=false) {
 if(!state.ready)return;root.updateMatrixWorld(true);
 let ride=null;for(const d of drivers){ride=d.view?.();if(ride)break;}
 if(ride){   // 탈것(전시 벽 발판 등): 꾸러미가 정해 준 자리(eye)에서 정해 준 곳(aim)을 본다(데크 좌표)
  const deck=player.parent;deck.localToWorld(desired.copy(ride.eye));deck.localToWorld(target.copy(ride.aim));
  camera.position.lerp(desired,immediate?1:1-Math.exp(-dt*5));camera.up.set(0,1,0);camera.lookAt(target);camera.fov=ride.fov;camera.updateProjectionMatrix();character.visible=true;return;
 }
 player.getWorldPosition(target);forward.set(Math.sin(state.heading),0,Math.cos(state.heading));
 const podium=state.mode==='lecture'?podiumOf?.():null;
 if(podium){   // 강의: 발표 자리와 강단 뒤 큰 그림을 함께
  podium.parent.localToWorld(desired.set(0,podium.position.y+2.1,-.5));
  podium.parent.localToWorld(target.set(0,podium.position.y+2.7,9.8));
  const direction=target.clone().sub(desired).applyAxisAngle(UP,state.orbit);direction.y+=direction.length()*Math.tan(state.pitch);target.copy(desired).add(direction);
  camera.fov=THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(deg(58)/2)/Math.min(1,Math.max(camera.aspect,.4))));
 } else if(state.mode==='view'){
  const p=presets[state.view];desired.fromArray(p.position);const direction=new THREE.Vector3().fromArray(p.target).sub(desired);direction.applyAxisAngle(UP,state.orbit);direction.y+=direction.length()*Math.tan(state.pitch);target.copy(desired).add(direction);
  camera.fov=THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(deg(p.fov)/2)/Math.max(camera.aspect,1.35)))/state.zoom;
 } else if(state.mode==='first'){
  desired.copy(target).addScaledVector(forward,.36).add(new THREE.Vector3(0,RIKA_H-.12,0));target.copy(desired).addScaledVector(forward,20);target.y+=20*Math.tan(state.pitch);
  camera.fov=THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(deg(70)/2)/Math.max(camera.aspect,1.35)))/state.zoom;
 } else {
  // 주인공 따라가기: 카메라 높이는 고정하고 시선 방향만 돌린다(돌 때 시선이 출렁이지 않게)
  const followDirection=forward.clone().applyAxisAngle(UP,state.orbit);
  desired.copy(target).addScaledVector(followDirection,-4.2*state.zoom).add(new THREE.Vector3(0,RIKA_H*1.12+.45,0));
  target.y+=RIKA_H*.62;camera.fov=58;
  const direction=target.clone().sub(desired),horizontal=Math.hypot(direction.x,direction.z);
  direction.y=horizontal*Math.tan(THREE.MathUtils.clamp(Math.atan2(direction.y,horizontal)+state.pitch,PITCH_MIN,PITCH_MAX));target.copy(desired).add(direction);
 }
 // 기본 시점 각도까지 합친 실제 시선에도 상한을 적용한다.
 const sight=target.clone().sub(desired),horizontal=Math.hypot(sight.x,sight.z);
 sight.y=horizontal*Math.tan(THREE.MathUtils.clamp(Math.atan2(sight.y,horizontal),PITCH_MIN,PITCH_MAX));target.copy(desired).add(sight);
 desired.y+=state.viewHeight;target.y+=state.viewHeight;
 camera.position.lerp(desired,immediate?1:1-Math.exp(-dt*12));camera.lookAt(target);camera.updateProjectionMatrix();character.visible=state.mode!=='first';
}

// ---------- 걷기 ----------
function onDeck(x,z,cx,cz){const dx=Math.abs(x-cx),dz=Math.abs(z-cz);if(dx>WALK.hx+1e-6||dz>WALK.hz+1e-6)return false;return !(dx>WALK.cx&&dz>WALK.cz)||Math.hypot(dx-WALK.cx,dz-WALK.cz)<=WALK.r+1e-6;}
function clampDeck(x,z,cx,cz){
 let dx=THREE.MathUtils.clamp(x-cx,-WALK.hx,WALK.hx),dz=THREE.MathUtils.clamp(z-cz,-WALK.hz,WALK.hz);
 if(Math.abs(dx)>WALK.cx&&Math.abs(dz)>WALK.cz){const kx=Math.sign(dx)*WALK.cx,kz=Math.sign(dz)*WALK.cz,ex=dx-kx,ez=dz-kz,d=Math.hypot(ex,ez);if(d>WALK.r){dx=kx+ex/d*WALK.r;dz=kz+ez/d*WALK.r;}}
 return [cx+dx,cz+dz];
}
const deckAt=(x,z)=>decks.find(d=>onDeck(x,z,d.cx,d.cz))??null;
function setWalking(active) { state.walking=active; }
const groundH=()=>footing?footing.height(player.position.x,player.position.z):currentDeck.h;   // 지금 발밑 높이
// (x,z)에 설 수 있나 → {deck} 또는 {surface}. 지금 선 데크 → 꾸러미의 걷는 곳 → 다른 배의 데크 순서로 찾고, 높이가 이어지는 곳만 받는다
function standAt(x,z,h){
 if(!footing&&onDeck(x,z,currentDeck.cx,currentDeck.cz))return {deck:currentDeck};
 for(const s of surfaces)if(s.contains(x,z)&&Math.abs(s.height(x,z)-h)<=STEP_UP)return {surface:s};
 for(const d of decks)if(d.available&&onDeck(x,z,d.cx,d.cz)&&Math.abs(d.h-h)<=STEP_UP)return {deck:d};
 return null;
}
function move(distance) {   // 지금 선 데크 안, 그리고 꾸러미가 놓은 걷는 곳(다리·계단)과 그것이 닿는 다른 배까지 걷는다
 const x0=player.position.x,z0=player.position.z,h=groundH();
 const nx=x0+Math.sin(state.heading)*distance,nz=z0+Math.cos(state.heading)*distance;
 let x=nx,z=nz,spot=standAt(nx,nz,h);
 if(!spot){
  if(!footing){[x,z]=clampDeck(nx,nz,currentDeck.cx,currentDeck.cz);spot={deck:currentDeck};}   // 데크 끝(난간)을 따라 미끄러진다
  else for(const [tx,tz] of [[nx,z0],[x0,nz]]){spot=standAt(tx,tz,h);if(spot){x=tx;z=tz;break;}}   // 다리 난간: 갈 수 있는 축으로만
  if(!spot)return 0;
 }
 if(spot.deck){currentDeck=spot.deck;footing=null;}else footing=spot.surface;
 player.position.x=x;player.position.z=z;return Math.hypot(x-x0,z-z0);
}
// 꾸러미가 캐릭터를 다른 곳에 내려놓는다(점프대·미끄럼틀 …): 그 자리의 데크나 걷는 곳에 세운다. 설 곳이 아니면 false
function placeAt(x,z,heading){
 const s=surfaces.find(f=>f.contains(x,z)),d=s?null:deckAt(x,z);if(!s&&!d)return false;
 stopWalking();if(d)currentDeck=d;footing=s??null;
 player.position.set(x,restPlayerY+(s?s.height(x,z):d.h),z);if(heading!==undefined){state.heading=heading;player.rotation.y=heading+Math.PI;}
 return true;
}
function step(direction) {if(!state.ready)return;if(state.mode==='view')setMode(walkCameraMode);state.stepRemaining=.45;state.stepDirection=direction;}
function walkToPoint(x,z,onArrive) {   // 데크를 누르면 그곳으로 걸어간다
 stopAuto();keys.clear();state.stepRemaining=0;if(state.mode==='view')setMode(walkCameraMode);
 const [px,pz]=clampDeck(x,z,currentDeck.cx,currentDeck.cz);auto={path:[new THREE.Vector2(px,pz)],mode:'touch',stuck:0,onArrive};
}
function stopAuto(){if(!auto)return;const cancelled=auto.onCancel;auto=null;cancelled?.();}
function autoStep(dt){   // 다음 경유점을 향해 돌고 걷는다 → 이번 프레임에 걸을 거리
 const wp=auto.path[0],dx=wp.x-player.position.x,dz=wp.y-player.position.z,d=Math.hypot(dx,dz),last=auto.path.length===1;
 if(d<.06){
  if(!last){auto.path.shift();return 0;}
  const diff=auto.facing===undefined?0:Math.atan2(Math.sin(auto.facing-state.heading),Math.cos(auto.facing-state.heading));
  state.heading+=THREE.MathUtils.clamp(diff,-2.6*dt,2.6*dt);
  if(Math.abs(diff)<.02){const arrived=auto.onArrive;auto=null;arrived?.();}
  return 0;
 }
 const diff=Math.atan2(Math.sin(Math.atan2(dx,dz)-state.heading),Math.cos(Math.atan2(dx,dz)-state.heading));
 state.heading+=THREE.MathUtils.clamp(diff,-2.6*dt,2.6*dt);return Math.abs(diff)<.5?Math.min(WALK_SPEED*dt,d):0;
}

// ---------- 꾸러미가 붙는 자리 ----------
// 꾸러미의 index.js는 export function install(host, pkg) 하나를 내놓는다. basic은 꾸러미 이름을 모르고 아래 약속만 지킨다.
const emit=(name,...args)=>{for(const fn of listeners[name]??[])fn(...args);};
const busyExcept=(name)=>stages.some(s=>s.name!==name&&s.active());   // 나 말고 무대를 쓰는 기능이 있나
const modal=()=>stages.some(s=>s.modal&&s.active());                  // 시점·걷기를 바꾸면 안 되는 중인가(강의·전시 벽)
const driving=()=>drivers.some(d=>d.busy());                          // 탈것이 캐릭터를 데려가는 중인가
function stopWalking(){stopAuto();keys.clear();state.stepRemaining=0;setWalking(false);}
function takeover(on,info){   // 탈것이 화면을 넘겨받는다 / 돌려준다
 if(on){stopWalking();toggleLookMode(false);emit('takeover');shell?.close();$('help').hidden=true;document.body.classList.add('riding');return;}
 document.body.classList.remove('riding');if(info?.heading!==undefined)state.heading=info.heading;camera.up.set(0,1,0);
 if(state.mode!=='first')setMode('follow');else updateCamera(1,true);
}
const host={
 THREE,scene,camera,canvas,rig,state,
 get renderer(){return renderer;},get player(){return player;},get decks(){return decks;},get homeDeck(){return decks[0].deck;},get currentDeck(){return currentDeck;},
 get restY(){return restPlayerY;},get floorY(){return floorY;},get root(){return root;},WALK,
 notice,showLocation,setMode,setView,reset,deckAt,stopWalking,stopAuto,takeover,busyExcept,
 walkTo:(x,z,onArrive)=>walkToPoint(x,z,onArrive),
 autoWalk:(route)=>{auto={stuck:0,...route};},autoMode:()=>auto?.mode??null,       // route = {path:[Vector2(x,z)…], facing, mode, onArrive, onCancel}
 addApp:(app)=>{APPS.push(app);},refreshApps:()=>shell?.refresh(),                 // app = {id, icon, title, sub, run, running, folder, favorite, desktop}
 addStage:(name,active,{modal=true}={})=>{stages.push({name,active,modal});},      // active() = 지금 무대를 쓰는 중
 addSurface:(surface)=>{surfaces.push(surface);return ()=>{const i=surfaces.indexOf(surface);if(i>=0)surfaces.splice(i,1);if(footing===surface)footing=null;};},   // 걷는 곳 더하기: surface = {name, contains(x,z), height(x,z)} → 돌려주는 함수 = 치우기
 addShip:(def)=>addShip(def),                                                     // 기본 비행선 한 척 더: def = {key, title, cx, cz, h} → 배 기록(rec.ship = 선체 묶음, rec.deck = 데크 좌표계)
 addDeck:(deck)=>{const rec={available:true,k:1,meshes:[],...deck};decks.push(rec);return rec;},   // 꾸러미가 손수 만든 설 곳: deck = {key, title, cx, cz, h, deck(Object3D: 원점 = 데크 중심, y = floorY가 바닥), meshes} — 걷는 넓이는 기본 데크와 같다
 openGate,                                                                         // openGate(rec, side, half) = 그 배 난간에 문 열기 → 닫는 함수
 place:placeAt,get footing(){return footing;},groundAt:(x,z)=>{const s=surfaces.find(f=>f.contains(x,z));if(s)return s.height(x,z);return deckAt(x,z)?.h??null;},   // place(x,z,heading) = 그 자리에 세우기 · groundAt = 그 자리 바닥 높이(없으면 null)
 addDriver:(driver)=>{drivers.push(driver);},                                      // driver = {busy(), carry(player,dt), view()}
 setPodium:(fn)=>{podiumOf=fn;},                                                   // 'lecture' 시점이 바라볼 강단
 on:(name,fn)=>{(listeners[name]??=[]).push(fn);},                                 // 'tick'(dt) · 'escape' · 'takeover' · 'reset'
 onTap:(fn)=>{taps.push(fn);},                                                     // fn(x,y) → true면 그 누름으로 걷지 않는다
 addHelp:(html)=>{const p=document.createElement('p');p.innerHTML=html;$('help-extra').append(p);},
};
async function loadPackages(){   // packages.json = play.py가 apps/*.zip에서 읽어 적은 꾸러미 목록
 let list=[];try{list=await (await fetch('./packages.json',{cache:'no-store'})).json();}catch(error){console.warn('꾸러미 목록(packages.json)을 읽지 못했어요. 기본 기능만 켭니다.',error);}
 for(const pkg of list){
  const row={...pkg,ok:true};packages.push(row);
  if(pkg.kind!=='app'||!pkg.entry)continue;
  try{const mod=await import(new URL(`${pkg.base}${pkg.entry}`,document.baseURI).href);await mod.install(host,pkg);}
  catch(error){row.ok=false;console.warn(`꾸러미 「${pkg.title}」를 켜지 못했어요.`,error);}
 }
}

// ---------- 기능 = 앱(바탕화면 · ⚙ 메뉴가 연다) ----------
let noticeTimer=0;
function notice(text) { const el=$('notice');el.textContent=text;el.hidden=false;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>{el.hidden=true;},2600); }
function goToCorner() {   // 모퉁이 이동: 지금 배의 모서리(E 버튼이 뜨는 곳)까지 걸어간다
 if(!transfers||busyExcept('corner'))return false;
 if(transfers.active()){transfers.cancel();return true;}
 const gate=transfers.getState().gates.find(g=>g.key===currentDeck.key);if(!gate)return false;
 walkToPoint(gate.x,gate.z,()=>notice('E(또는 E 버튼)를 누른 뒤 이동할 다른 비행선을 누르세요'));
 notice('배 모서리로 걸어가는 중이에요');return true;
}
// 날씨 조절판은 바깥을 누르면 스스로 닫힌다 → 아이콘을 누르는 순간 열려 있었다면 그 누름이 이미 닫았으니 다시 열지 않는다
let weatherOpenAtPress=false;
addEventListener('pointerdown',()=>{const panel=$('weather-panel');weatherOpenAtPress=Boolean(panel&&!panel.hidden);},{capture:true});
addEventListener('keydown',()=>{weatherOpenAtPress=false;},{capture:true});
function toggleWeatherPanel() { const button=document.querySelector('.weather-btn');if(!button)return false;if(!weatherOpenAtPress)button.click();return true; }
const walkApp=(mode)=>()=>{if(modal())return false;setMode(mode);return true;};
const viewApp=(name)=>()=>{if(modal())return false;setView(name);return true;};
const weatherApp=(kind)=>()=>{if(!weather)return false;weather.choose(kind);return true;};
const BG='배경 · 전망',WX='날씨',MOVE='이동 · 시점',SCREEN='화면';
const APPS=[   // basic의 앱. 추가 꾸러미는 host.addApp으로 뒤에 붙인다
 {id:'bg-paris',icon:'🗼',title:'파리 상공',sub:'센강과 에펠탑',folder:BG,favorite:true,run:()=>{useBackground('paris');return true;},running:()=>backgroundKey==='paris'},
 {id:'bg-seoul',icon:'🏙',title:'서울 상공',sub:'한강과 남산타워',folder:BG,favorite:true,run:()=>{useBackground('seoul');return true;},running:()=>backgroundKey==='seoul'},
 {id:'view-tower',icon:'🔭',title:'앞 전망',sub:'에펠탑 · 남산타워',folder:BG,run:viewApp('tower'),running:()=>state.mode==='view'&&state.view==='tower'},
 {id:'view-yeouido',icon:'⬅️',title:'왼쪽 전망',sub:'몽마르트르 · 여의도',folder:BG,run:viewApp('yeouido'),running:()=>state.mode==='view'&&state.view==='yeouido'},
 {id:'view-hangang',icon:'➡️',title:'오른쪽 전망',sub:'센강 · 한강',folder:BG,run:viewApp('hangang'),running:()=>state.mode==='view'&&state.view==='hangang'},
 {id:'view-overview',icon:'🎈',title:'부유선 전체',sub:'멀리서 본 비행선',folder:BG,run:viewApp('overview'),running:()=>state.mode==='view'&&state.view==='overview'},
 {id:'weather',icon:'🌦',title:'날씨 조절',sub:'맑음 · 눈 · 비 · 태풍, 세기, 구름',folder:WX,desktop:true,run:toggleWeatherPanel,running:()=>{const panel=$('weather-panel');return Boolean(panel&&!panel.hidden);}},
 {id:'wx-clear',icon:'☀️',title:'맑음',folder:WX,run:weatherApp('clear'),running:()=>weather?.getState().kind==='clear'},
 {id:'wx-snow',icon:'❄️',title:'눈',folder:WX,run:weatherApp('snow'),running:()=>weather?.getState().kind==='snow'},
 {id:'wx-rain',icon:'☔',title:'비',folder:WX,run:weatherApp('rain'),running:()=>weather?.getState().kind==='rain'},
 {id:'wx-storm',icon:'🌀',title:'태풍',sub:'번개 · 천둥 · 배 흔들림',folder:WX,run:weatherApp('storm'),running:()=>weather?.getState().kind==='storm'},
 {id:'corner',icon:'🧭',title:'모퉁이 이동',sub:'모서리로 걸어가 E → 다른 비행선 클릭',folder:MOVE,desktop:true,run:goToCorner,running:()=>Boolean(transfers?.active())},
 {id:'first',icon:'👀',title:'내 눈으로 산책',sub:'1인칭',folder:MOVE,run:walkApp('first'),running:()=>state.mode==='first'},
 {id:'follow',icon:'🧍',title:'주인공 모드',sub:'캐릭터 뒤에서',folder:MOVE,run:walkApp('follow'),running:()=>state.mode==='follow'},
 {id:'home',icon:'↺',title:'처음 위치로',folder:MOVE,run:()=>{if(driving())return false;reset();return true;}},
 {id:'fullscreen',icon:'⛶',title:'전체 화면',folder:SCREEN,run:()=>{$('fullscreen').click();return true;},running:()=>Boolean(document.fullscreenElement||document.webkitFullscreenElement)},
 {id:'hide-ui',icon:'🙈',title:'아이콘 숨기기',sub:'H 또는 오른쪽 위 👁로 다시 보이기',folder:SCREEN,run:()=>{toggleUI(true);return true;}},
 {id:'help',icon:'❓',title:'조작 방법',folder:SCREEN,run:()=>{$('help-button').click();return true;},running:()=>!$('help').hidden},
];
// 처음 배치: 앱에 적힌 folder(폴더 이름) · favorite · desktop으로 만든다. 아래 순서의 폴더가 먼저, 처음 보는 폴더 이름은 뒤에 새로 생긴다
const FOLDERS=[['f-bg',BG],['f-weather',WX],['f-gallery','갤러리'],['f-move',MOVE],['f-screen',SCREEN]];
function appDefaults(){
 const folders=FOLDERS.map(([id,name])=>({type:'folder',id,name,children:[]})),loose=[];
 for(const app of APPS){
  if(!app.folder){loose.push({type:'app',id:app.id});continue;}
  let f=folders.find(x=>x.name===app.folder);if(!f){f={type:'folder',id:`f-${app.folder}`,name:app.folder,children:[]};folders.push(f);}
  f.children.push({type:'app',id:app.id});
 }
 const menu=[...folders.filter(f=>f.children.length),...loose],byId=new Map(APPS.map(a=>[a.id,a]));
 const ordered=menu.flatMap(n=>n.type==='folder'?n.children:[n]).map(n=>byId.get(n.id));
 return {menu,favorites:ordered.filter(a=>a.favorite||a.desktop).map(a=>a.id),desktop:ordered.filter(a=>a.desktop).map(a=>a.id)};
}

// ---------- 매 프레임 ----------
function tick(now) {
 if(!state.ready)return;const dt=Math.min(Math.max((now-previousTime)/1000,0),.08);previousTime=now;state.elapsed+=dt;state.frames++;
 const upKey=keys.has('w')||keys.has('ArrowUp'),downKey=keys.has('s')||keys.has('ArrowDown'),leftKey=keys.has('a')||keys.has('ArrowLeft'),rightKey=keys.has('d')||keys.has('ArrowRight');
 const pitchInput=(lookMode?Number(upKey)-Number(downKey):0)+Number(lookHolds.has('up'))-Number(lookHolds.has('down'));
 if(pitchInput)state.pitch=THREE.MathUtils.clamp(state.pitch+pitchInput*dt*1.1,PITCH_MIN,PITCH_MAX);
 if(driving()){setWalking(false);state.stepRemaining=0;}   // 탈것(전시 벽 발판 등)을 타는 동안은 탈것이 데려간다
 else if(lookMode){
  const orbitInput=Number(leftKey)-Number(rightKey);
  if(orbitInput){if(state.mode==='first')state.heading+=orbitInput*dt*1.65;else state.orbit+=orbitInput*dt*2.0;}
  setWalking(false);
 } else {
  const turn=Number(leftKey)-Number(rightKey),direction=Number(upKey)-Number(downKey);
  if(auto&&(turn||direction))stopAuto();
  if((turn||direction||state.stepRemaining>0)&&(state.mode==='view'||state.mode==='lecture'))setMode(walkCameraMode);
  if(turn)state.heading+=turn*dt*1.65;
  let distance=auto?autoStep(dt):direction*(keys.has('Shift')?RUN_SPEED:WALK_SPEED)*dt;
  if(state.stepRemaining>0){distance=state.stepDirection*Math.min(WALK_SPEED*dt,state.stepRemaining);state.stepRemaining=Math.max(0,state.stepRemaining-Math.abs(distance));}
  const moved=Math.abs(distance)>1e-6?move(distance):0;setWalking(moved>1e-5);
  if(auto?.mode==='touch'){auto.stuck=moved>1e-5||Math.abs(distance)<=1e-6?0:auto.stuck+dt;if(auto.stuck>.4)stopAuto();}   // 난간에 막히면 그만 걷는다
  if(moved>1e-5){state.gait=(state.gait+Math.sign(distance)*moved/stride)%1;if(state.gait<0)state.gait+=1;}
  if((moved>1e-5||turn)&&state.mode==='follow')state.orbit*=Math.exp(-dt*6);
 }
 emit('tick',dt);
 let carried=false;for(const d of drivers)if(d.carry?.(player,dt))carried=true;
 if(!carried){   // 발밑 높이: 데크 위는 바로, 꾸러미의 걷는 곳(계단·비탈)은 부드럽게 따라간다
  player.rotation.y=state.heading+Math.PI;const gy=restPlayerY+groundH();
  if(footing&&!footing.contains(player.position.x,player.position.z))footing=null;   // 밟고 있던 다리가 사라졌다
  player.position.y=footing||Math.abs(gy-player.position.y)<STEP_UP?player.position.y+(gy-player.position.y)*(1-Math.exp(-dt*14)):gy;
 }
 animate(state.walking?'walk':'idle',state.gait*walkDuration);
 transfers?.update();
 updateCamera(dt);
 const altitude=70+player.position.y-restPlayerY+(driving()?0:state.viewHeight);$('altitude').textContent=altitude.toFixed(Math.abs(altitude-Math.round(altitude))>.04?1:0);
 renderer.render(scene,camera);
}

// ---------- 입력 ----------
for(const b of document.querySelectorAll('[data-view]'))b.addEventListener('click',()=>setView(b.dataset.view));
for(const b of document.querySelectorAll('[data-bg]'))b.addEventListener('click',()=>useBackground(b.dataset.bg).catch(error=>console.warn('배경을 바꾸지 못했어요.',error)));
$('first-person').addEventListener('click',()=>setMode('first'));$('follow').addEventListener('click',()=>setMode('follow'));$('home').addEventListener('click',reset);
$('step').addEventListener('click',()=>toggleLookMode());$('btn-v').addEventListener('click',togglePerspective);$('ui-toggle').addEventListener('click',()=>toggleUI());$('ui-restore-btn').addEventListener('click',()=>toggleUI(false));
$('help-button').addEventListener('click',()=>{$('help').hidden=!$('help').hidden;$('help-button').setAttribute('aria-expanded',String(!$('help').hidden));});
$('close-help').addEventListener('click',()=>{$('help').hidden=true;$('help-button').setAttribute('aria-expanded','false');});
$('fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement||document.webkitFullscreenElement)await (document.exitFullscreen?.()??document.webkitExitFullscreen?.());else{const el=document.documentElement;await (el.requestFullscreen?.()??el.webkitRequestFullscreen?.());}}catch{notice('브라우저 메뉴에서 전체 화면을 선택해 주세요.');}});
$('reload').addEventListener('click',()=>location.reload());

// Esc = 시점 풀기: 전망·강의 시점과 자동 걷기를 풀고 마지막 걷기 시점(1인칭 또는 주인공)으로
function releaseViewing(){
 if(!state.ready)return;
 keys.clear();state.stepRemaining=0;stopAuto();setWalking(false);emit('escape');
 if(!['first','follow'].includes(state.mode))setMode(walkCameraMode);
}
addEventListener('keydown',e=>{if(e.key==='Escape'&&!e.isComposing)releaseViewing();},{capture:true});
const controlKeys=new Set(['w','a','s','d','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Shift']);
// 한글 입력 상태에서도 걷게: 두벌식 ㅈㅁㄴㅇ = wasd, ㅍ = v, ㅗ = h
const HANGUL={'ㅈ':'w','ㅁ':'a','ㄴ':'s','ㅇ':'d','ㅍ':'v','ㅗ':'h'};
const keyOf=e=>{const key=e.key.length===1?e.key.toLowerCase():e.key;return HANGUL[key]??key;};
addEventListener('keydown',e=>{
 if(e.target instanceof Element&&e.target.matches('input,textarea,select'))return;
 const key=keyOf(e);
 if(controlKeys.has(key)){e.preventDefault();keys.add(key);}
 if(key==='v'&&!e.repeat){e.preventDefault();togglePerspective();}
 if(key==='h'&&!e.repeat){e.preventDefault();toggleUI();}
});
addEventListener('keyup',e=>keys.delete(keyOf(e)));
const releaseKeys=()=>{keys.clear();lookHolds.clear();state.stepRemaining=0;setWalking(false);};
addEventListener('blur',releaseKeys);document.addEventListener('visibilitychange',()=>{if(document.hidden)releaseKeys();});
for(const b of document.querySelectorAll('[data-key]')){
 b.addEventListener('pointerdown',e=>{e.preventDefault();b.setPointerCapture(e.pointerId);keys.add(b.dataset.key);});
 for(const event of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(event,()=>keys.delete(b.dataset.key));
}
// 고개 들기·내리기: 걷기 모드를 바꾸지 않고 버튼을 누른 동안 시선만 돌린다.
for(const button of document.querySelectorAll('[data-look]')){
 button.addEventListener('pointerdown',event=>{event.preventDefault();if(!state.ready)return;stopAuto();keys.clear();state.stepRemaining=0;setWalking(false);button.setPointerCapture(event.pointerId);lookHolds.add(button.dataset.look);});
 for(const event of ['pointerup','pointercancel','lostpointercapture','blur'])button.addEventListener(event,()=>lookHolds.delete(button.dataset.look));
 button.addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();stopAuto();keys.clear();lookHolds.add(button.dataset.look);}});
 button.addEventListener('keyup',event=>{if(['Enter',' '].includes(event.key))lookHolds.delete(button.dataset.look);});
}
$('look-reset').addEventListener('click',()=>{lookHolds.clear();state.pitch=deg(7);});

// 데크를 짧게 누르면 그곳으로 걷는다. 모퉁이 이동을 고르는 중이면 그 누름은 목적지 배 선택이다
const tapRaycaster=new THREE.Raycaster(),tapPointer=new THREE.Vector2();
function handleCanvasTap(clientX,clientY) {
 if(!state.ready||state.mode==='lecture')return;
 const r=canvas.getBoundingClientRect();tapPointer.set((clientX-r.left)/r.width*2-1,-((clientY-r.top)/r.height)*2+1);tapRaycaster.setFromCamera(tapPointer,camera);
 const hit=tapRaycaster.intersectObjects(currentDeck.meshes,false)[0];if(!hit)return;
 const local=player.parent.worldToLocal(hit.point.clone());walkToPoint(local.x,local.z);
}
let drag=null;
canvas.addEventListener('pointerdown',e=>{drag={id:e.pointerId,x:e.clientX,y:e.clientY,x0:e.clientX,y0:e.clientY,t:performance.now(),heightGesture:e.shiftKey};canvas.setPointerCapture(e.pointerId);canvas.focus({preventScroll:true});});
canvas.addEventListener('pointermove',e=>{
 if(!drag||drag.id!==e.pointerId)return;
 const dx=e.clientX-drag.x,dy=e.clientY-drag.y;drag.x=e.clientX;drag.y=e.clientY;
 if(e.shiftKey||keys.has('Shift')){drag.heightGesture=true;changeViewHeight(-dy*VIEW_HEIGHT.dragScale);return;}
 if(state.mode==='first')state.heading-=dx*.004;else state.orbit-=dx*.004;
 state.pitch=THREE.MathUtils.clamp(state.pitch-dy*.003,PITCH_MIN,PITCH_MAX);
});
for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,e=>{
 if(!drag||drag.id!==e.pointerId)return;
 if(event==='pointerup'&&!drag.heightGesture&&Math.hypot(e.clientX-drag.x0,e.clientY-drag.y0)<8&&performance.now()-drag.t<350){
  if(transfers?.active()){transfers.click(e.clientX,e.clientY);e.preventDefault();}   // preventDefault: 그 누름으로 꾸러미의 표지판 같은 것까지 눌리지 않게
  else if(!taps.some(fn=>fn(e.clientX,e.clientY)))handleCanvasTap(e.clientX,e.clientY);
 }
 drag=null;
});
canvas.addEventListener('wheel',e=>{
 e.preventDefault();
 if(e.shiftKey||keys.has('Shift')){const unit=e.deltaMode===1?16:e.deltaMode===2?innerHeight:1;changeViewHeight(-(e.deltaY||e.deltaX)*unit*VIEW_HEIGHT.wheelScale);}
 else state.zoom=THREE.MathUtils.clamp(state.zoom*Math.exp(-e.deltaY*.0006),.7,1.6);
},{passive:false});
addEventListener('resize',()=>{if(!renderer)return;renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();});
init().catch(fail);
