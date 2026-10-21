const layoutJobs=new WeakMap();
function layoutSignature(pnu=''){return JSON.stringify([+state.usable,+state.density,+state.rowGap||0,2382,1134,650,2])+'|'+pnu}
function scheduleSatelliteLayouts(parcels){
  for(const p of parcels){
    const key=layoutSignature(p.pnu);
    if(!/^\d{19}$/.test(p.pnu||''))continue;
    if(p.layout?.key===key||layoutJobs.get(p)===key)continue;
    layoutJobs.set(p,key);p.layout={status:'loading',key};
    lookupApi('/api/layout?pnu='+encodeURIComponent(p.pnu)+'&usable='+encodeURIComponent(state.usable)+'&density='+encodeURIComponent(state.density)+'&rowGap='+encodeURIComponent(state.rowGap??1.32)).then(r=>{if(!state.parcels.includes(p)||layoutJobs.get(p)!==key||layoutSignature(p.pnu)!==key)return;p.layout={...r,key};calculate()}).catch(e=>{if(!state.parcels.includes(p)||layoutJobs.get(p)!==key)return;p.layout={status:'error',key,message:e.message};calculate()});
  }
}
function renderSatelliteLayouts(parcels){
  const el=$('satelliteLayouts');if(!el)return;
  let remain=+state.capLimit>0?Math.floor(+state.capLimit/.65):Infinity;
  const content=parcels.filter(p=>p.pnu).map(p=>{
    const l=p.layout;
    if(!l||l.status==='loading')return `<div class="check"><strong>${esc(p.address)} · 위성사진 배치 작성 중</strong>필지 경계를 불러와 2m 여유와 모듈 규격을 적용하고 있습니다.</div>`;
    if(l.status!=='ok')return `<div class="check warn"><strong>${esc(p.address)} · 위성사진 배치 확인 필요</strong>${esc(l.message)} <button type="button" data-layout-retry="${esc(p.pnu)}">다시 그리기</button></div>`;
    const n=Math.min(l.count,remain);remain-=n;
    const path=rings=>rings.map(r=>'M'+r.map(pt=>pt.join(',')).join('L')+'Z').join('');
    return `<article class="satellite-layout"><h3>${esc(p.address)}</h3><div class="satellite-toolbar"><strong>${fmt(n)}장 · ${fmt(n*.65,2)}kWp</strong><span>2382 × 1134mm · 650Wp · 경계 여유 2m</span><button type="button" data-layout-zoom="in">확대 +</button><button type="button" data-layout-zoom="out">축소 −</button><button type="button" data-layout-zoom="reset">전체 보기</button></div><div class="satellite-viewport"><svg class="satellite-svg" viewBox="0 0 1200 900" role="img" aria-label="${esc(p.address)} 위성사진 위 모듈 개념 배치"><image href="${esc(l.imageUrl)}" width="1200" height="900" preserveAspectRatio="none"/>${l.outlines.map(rings=>`<path d="${path(rings)}" fill="#ffdd0015" fill-rule="evenodd" stroke="#ffe15b" stroke-width="3" vector-effect="non-scaling-stroke"/>`).join('')}${l.panels.slice(0,n).map(r=>`<polygon points="${r.map(pt=>pt.join(',')).join(' ')}" fill="#147ad9" fill-opacity=".8" stroke="#a9e8ff" stroke-width=".55"/>`).join('')}<rect x="1010" y="15" width="175" height="60" rx="6" fill="#102d29dd"/><text x="1097" y="40" text-anchor="middle" fill="white" font-size="20">N ↑</text><text x="1097" y="61" text-anchor="middle" fill="white" font-size="13">지도상 북쪽</text></svg></div><p class="imagery-credit">${esc(l.attribution)} · <a href="${esc(l.imagerySource)}" target="_blank" rel="noopener">영상 출처</a></p><p class="muted">노란 선: 필지 경계 / 파란 사각형: 모듈. 모듈 사이 ${fmt(l.moduleGapMm)}mm · 행 사이 빈 간격 ${fmt(l.rowGapM*1000)}mm · 배치 대상 면적 비율 ${fmt(l.usablePct)}% 적용. ${esc(l.limitation)}</p></article>`;
  }).join('')||'<p class="muted">지번을 조회하면 위성사진 위에 필지 경계와 모듈 개념 배치를 자동으로 그립니다.</p>';
  if(el._layoutHTML!==content){el.innerHTML=content;el._layoutHTML=content}
}
document.addEventListener('click',e=>{const retry=e.target.closest?.('[data-layout-retry]');if(retry){const p=state.parcels.find(p=>p.pnu===retry.dataset.layoutRetry);if(p){p.layout=null;layoutJobs.delete(p);calculate()}return}const b=e.target.closest?.('[data-layout-zoom]');if(!b)return;const svg=b.closest('.satellite-layout').querySelector('svg');let [x,y,w,h]=svg.getAttribute('viewBox').split(' ').map(Number);if(b.dataset.layoutZoom==='reset'){svg.setAttribute('viewBox','0 0 1200 900');return}const factor=b.dataset.layoutZoom==='in'?.7:1/.7;let nw=Math.max(120,Math.min(1200,w*factor)),nh=nw*.75;svg.setAttribute('viewBox',[Math.max(0,Math.min(1200-nw,x+(w-nw)/2)),Math.max(0,Math.min(900-nh,y+(h-nh)/2)),nw,nh].join(' '))});
