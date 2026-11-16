// A corner gate arms with E; the next short click selects another docked ship.
import * as THREE from 'three';

export function createShipTransfer({canvas,camera,floorY,restY,getDecks,getPlayer,isBusy,canStand,onArm,onTravel}) {
  const root=document.getElementById('experience');
  const style=document.createElement('style');
  style.textContent=`.transfer-prompt{position:absolute;left:50%;bottom:204px;transform:translateX(-50%);z-index:11}.transfer-prompt[hidden]{display:none}.transfer-prompt button{display:grid;place-items:center;width:36px;height:36px;padding:0;border:1px solid #d2e6e6a0;border-radius:8px;background:#142c35df;color:#effcff;font:600 16px system-ui;box-shadow:0 3px 10px #0003;cursor:pointer}.transfer-prompt button[aria-pressed=true]{background:#c4f0ef;color:#183a42;border-color:#c4f0ef}.transfer-prompt button:focus-visible{outline:2px solid #c4f0ef;outline-offset:3px}body.transfer-aim #scene{cursor:crosshair}.transfer-notice{position:absolute;left:50%;top:105px;transform:translateX(-50%);z-index:12;padding:9px 15px;border-radius:8px;background:#142c35ed;color:#e8ffff;font:13px system-ui;pointer-events:none}.transfer-notice[hidden]{display:none}@media(max-width:580px){.transfer-prompt{bottom:205px}.transfer-notice{top:105px;max-width:90%;font-size:12px}}`;
  document.head.append(style);
  const prompt=document.createElement('div');prompt.className='transfer-prompt';prompt.hidden=true;
  const button=document.createElement('button');button.type='button';button.textContent='E';
  button.setAttribute('aria-label','비행선 이동 시작');button.setAttribute('aria-pressed','false');
  prompt.append(button);root.append(prompt);
  const notice=document.createElement('div');notice.className='transfer-notice';notice.hidden=true;notice.setAttribute('role','status');root.append(notice);
  let noticeUntil=0,source=null,near=null;
  const records=new Map(),raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
  function say(text){notice.textContent=text;notice.hidden=false;noticeUntil=performance.now()+2200;}
  function stop(){source=null;document.body.classList.remove('transfer-aim');}
  function freeSpot(deck){
    const k=deck.k||1;
    for(const [sx,sz] of [[1,-1],[-1,-1],[1,1],[-1,1]]){
      for(const inset of [0,.45,.9,1.35]){
        const x=deck.cx+sx*(2.85*k-inset),z=deck.cz+sz*(5.45*k-inset);
        if(canStand(x,z,deck.h))return {x,z,lx:(x-deck.cx)/k,lz:(z-deck.cz)/k};
      }
    }
    return null;
  }
  function anchor(deck,spot){
    const group=new THREE.Group();group.name=`TransferGate-${deck.key}`;
    group.position.set(spot.lx,floorY+.035,spot.lz);group.scale.set(1/(deck.k||1),1,1/(deck.k||1));
    deck.deck.add(group);return {deck,spot,group};
  }
  function remove(rec){rec.group.removeFromParent();}
  function update(){
    const present=new Set();
    for(const deck of getDecks()){
      if(!deck.available)continue;present.add(deck.key);
      let rec=records.get(deck.key);
      if(rec&&rec.deck.deck!==deck.deck){remove(rec);records.delete(deck.key);rec=null;}
      if(!rec){const spot=freeSpot(deck);if(!spot)continue;rec=anchor(deck,spot);records.set(deck.key,rec);}
      rec.deck=deck;
    }
    for(const [key,rec] of records)if(!present.has(key)){remove(rec);records.delete(key);}
    const player=getPlayer();near=null;
    if(!isBusy())for(const rec of records.values()){
      const d=Math.hypot(player.position.x-rec.spot.x,player.position.z-rec.spot.z);
      if(d<1.35&&Math.abs(player.position.y-restY-rec.deck.h)<.7){near=rec;break;}
    }
    if(source&&(!near||near.deck.key!==source||!records.has(source)))stop();
    prompt.hidden=!near;
    button.setAttribute('aria-pressed',String(Boolean(source)));
    button.setAttribute('aria-label',source?'비행선 이동 취소':'비행선 이동 시작');
    if(performance.now()>noticeUntil)notice.hidden=true;
  }
  function arm(){update();if(!near)return false;if(source){stop();return true;}source=near.deck.key;onArm();document.body.classList.add('transfer-aim');update();return true;}
  button.onclick=arm;
  addEventListener('keydown',e=>{
    if(e.isComposing||e.target instanceof Element&&e.target.matches('input,textarea,select,[contenteditable="true"]'))return;
    if(e.key==='Escape'&&source){stop();return;}
    if(['e','E','ㄷ'].includes(e.key)){
      update();if(!near&&!source)return;e.preventDefault();e.stopImmediatePropagation();if(!e.repeat)arm();
    }
  },{capture:true});
  function pick(x,y){
    const r=canvas.getBoundingClientRect();pointer.set((x-r.left)/r.width*2-1,-(y-r.top)/r.height*2+1);raycaster.setFromCamera(pointer,camera);
    let best=null;
    for(const rec of records.values()){
      // newgame: 배마다 선체 메시 목록(meshes)이 있으면 그것만 맞춘다 → 내 캐릭터·드론 그림·유리 난간 너머의 배도 고를 수 있다
      const hit=raycaster.intersectObjects(rec.deck.meshes??[rec.deck.deck],true).find(h=>{
        for(let o=h.object;o;o=o.parent)if(o.visible===false)return false;
        return true;
      });
      if(hit&&(!best||hit.distance<best.distance))best={rec,distance:hit.distance};
    }
    return best?.rec;
  }
  function click(x,y){
    if(!source)return false;
    const from=source;update();if(!source)return true;
    const rec=pick(x,y);
    if(!rec){say('정박한 다른 비행선의 선체나 데크를 클릭하세요.');return true;}
    if(rec.deck.key===from){say('현재 배가 아닌 다른 비행선을 클릭하세요.');return true;}
    if(!canStand(rec.spot.x,rec.spot.z,rec.deck.h)){say('도착 자리가 막혀 있어요. 잠시 후 다시 선택해 주세요.');return true;}
    onTravel({...rec.spot,h:rec.deck.h,heading:Math.atan2(rec.deck.cx-rec.spot.x,rec.deck.cz-rec.spot.z)});
    stop();say(`${rec.deck.title}에 도착했어요.`);update();return true;
  }
  return {update,active:()=>Boolean(source),click,cancel:stop,hitTest:(x,y)=>pick(x,y)?.deck.key??null,getState:()=>({armed:source,near:near?.deck.key??null,gates:[...records].map(([key,r])=>{const v=r.group.getWorldPosition(new THREE.Vector3()).project(camera);return {key,title:r.deck.title,x:r.spot.x,z:r.spot.z,h:r.deck.h,screen:[(v.x+1)*innerWidth/2,(1-v.y)*innerHeight/2]};})})};
}
