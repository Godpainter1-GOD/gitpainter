async function renderMingtoriBoards(strip,ep){
 const url=new URL(ep.panelDocument,location.href);
 try{const r=await fetch(url);if(!r.ok)throw new Error(r.status);const box=document.createElement('div');box.className='mt-final-comic';box.innerHTML=await r.text();for(const im of box.querySelectorAll('img')){im.loading=Number(im.closest('[data-cut]').dataset.cut)>4?'lazy':'eager';im.decoding='async';im.src=new URL(im.getAttribute('src'),url).href;}strip.appendChild(box);strip.dataset.ready='true';}
 catch(error){const p=document.createElement('p');p.setAttribute('role','alert');p.textContent='회차를 불러오지 못했습니다. 잠시 후 새로고침해 주세요.';strip.appendChild(p);strip.dataset.error='true';}
}
