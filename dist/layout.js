let combinedLayout=null,combinedJobKey=null;
function layoutSignature(pnus=''){return JSON.stringify([+state.usable,+state.density,+state.rowGap||0,+state.moduleLength,+state.moduleWidth,+state.module,2,'union-v1'])+'|'+pnus}
function combinedParcelIds(parcels){return [...new Set(parcels.map(p=>p.pnu))].sort()}
function combinedLayoutKey(parcels){return layoutSignature(combinedParcelIds(parcels).join(','))}
function currentCombinedLayout(parcels){return combinedLayout?.key===combinedLayoutKey(parcels)?combinedLayout:null}
function scheduleSatelliteLayouts(parcels){
  const ids=combinedParcelIds(parcels),key=combinedLayoutKey(parcels);
  if(![state.moduleLength,state.moduleWidth,state.module].every(v=>Number.isFinite(+v)&&+v>0)){combinedJobKey=null;combinedLayout={status:'error',key,message:'모듈 규격과 출력을 0보다 큰 숫자로 입력하세요.'};return}
  if(!parcels.length||parcels.some(p=>!/^\d{19}$/.test(p.pnu||''))){combinedJobKey=null;combinedLayout={status:'waiting',key};return}
  if(combinedLayout?.key===key||combinedJobKey===key)return;
  combinedJobKey=key;combinedLayout={status:'loading',key};
  lookupApi('/api/layout?pnus='+encodeURIComponent(ids.join(','))+'&usable='+encodeURIComponent(state.usable)+'&density='+encodeURIComponent(state.density)+'&rowGap='+encodeURIComponent(state.rowGap??1.32)+'&moduleLength='+encodeURIComponent(state.moduleLength)+'&moduleWidth='+encodeURIComponent(state.moduleWidth)+'&moduleWp='+encodeURIComponent(state.module)).then(r=>{if(combinedJobKey!==key||combinedLayoutKey(unique().ps)!==key)return;if(JSON.stringify(r.pnus)!==JSON.stringify(ids))throw Error('통합 배치의 필지 목록이 요청과 일치하지 않습니다.');combinedLayout={...r,key};calculate()}).catch(e=>{if(combinedJobKey!==key||combinedLayoutKey(unique().ps)!==key)return;combinedLayout={status:'error',key,message:e.message};calculate()});
}
function renderSatelliteLayouts(parcels){
  const el=$('satelliteLayouts');if(!el)return;
  let remain=+state.capLimit>0?Math.floor(+state.capLimit/(+state.module/1000)+1e-8):Infinity;
  const groups=parcels.length?[{pnu:'combined',address:parcels.length>1?'전체 '+parcels.length+'필지 통합 배치':parcels[0].address}]:[];
  const content=groups.map(p=>{
    const l=currentCombinedLayout(parcels);
    if(l?.status==='waiting')return '<div class="check warn"><strong>전체 필지 조회 대기</strong>추가한 모든 필지의 지번 조회를 완료하면 하나의 통합 부지로 배치합니다.</div>';
    if(!l||l.status==='loading')return `<div class="check"><strong>${esc(p.address)} · 위성사진 배치 작성 중</strong>전체 필지 경계를 합쳐 공통 경계를 제거한 뒤 외곽 2m 여유를 적용하고 있습니다.</div>`;
    if(l.status!=='ok')return `<div class="check warn"><strong>${esc(p.address)} · 위성사진 배치 확인 필요</strong>${esc(l.message)} <button type="button" data-layout-retry="${esc(p.pnu)}">다시 그리기</button></div>`;
    const n=Math.min(l.count,remain);remain-=n;
    const path=rings=>rings.map(r=>'M'+r.map(pt=>pt.join(',')).join('L')+'Z').join('');
    return `<article class="satellite-layout"><h3>${esc(p.address)}</h3><div class="satellite-toolbar"><strong>${fmt(n)}장 · ${fmt(n*l.moduleWp/1000,2)}kWp</strong><span>${fmt(l.moduleLengthMm)} × ${fmt(l.moduleWidthMm)}mm · ${fmt(l.moduleWp)}Wp · 경계 여유 2m</span><button type="button" data-layout-zoom="in">확대 +</button><button type="button" data-layout-zoom="out">축소 −</button><button type="button" data-layout-zoom="reset">전체 보기</button></div><div class="satellite-viewport"><svg class="satellite-svg" viewBox="0 0 1200 900" role="img" aria-label="${esc(p.address)} 위성사진 위 모듈 개념 배치">${l.imageTiles?.length?l.imageTiles.map(t=>`<image href="${esc(t.url)}" x="${t.x}" y="${t.y}" width="${t.width}" height="${t.height}" preserveAspectRatio="none"/>`).join(''):`<image href="${esc(l.imageUrl)}" width="1200" height="900" preserveAspectRatio="none"/>`}${l.outlines.map(rings=>`<path d="${path(rings)}" fill="#ffdd0015" fill-rule="evenodd" stroke="#ffe15b" stroke-width="3" vector-effect="non-scaling-stroke"/>`).join('')}${l.panels.slice(0,n).map(r=>`<polygon points="${r.map(pt=>pt.join(',')).join(' ')}" fill="#147ad9" fill-opacity=".8" stroke="#a9e8ff" stroke-width=".55"/>`).join('')}<rect x="1010" y="15" width="175" height="60" rx="6" fill="#102d29dd"/><text x="1097" y="40" text-anchor="middle" fill="white" font-size="20">N ↑</text><text x="1097" y="61" text-anchor="middle" fill="white" font-size="13">지도상 북쪽</text></svg></div><p class="imagery-credit">${esc(l.attribution)} · <a href="${esc(l.imagerySource)}" target="_blank" rel="noopener">영상 출처</a></p><p class="muted">노란 선: 통합 부지 외곽·빈 땅 경계 / 파란 사각형: 모듈. 모듈 사이 ${fmt(l.moduleGapMm)}mm · 행 사이 빈 간격 ${fmt(l.rowGapM*1000)}mm · 배치 대상 면적 비율 ${fmt(l.usablePct)}% 적용. ${esc(l.limitation)}</p></article>`;
  }).join('')||'<p class="muted">지번을 조회하면 위성사진 위에 필지 경계와 모듈 개념 배치를 자동으로 그립니다.</p>';
  if(el._layoutHTML!==content){el.innerHTML=content;el._layoutHTML=content}
}
document.addEventListener('click',e=>{const retry=e.target.closest?.('[data-layout-retry]');if(retry){combinedLayout=null;combinedJobKey=null;calculate();return}const b=e.target.closest?.('[data-layout-zoom]');if(!b)return;const svg=b.closest('.satellite-layout').querySelector('svg');let [x,y,w,h]=svg.getAttribute('viewBox').split(' ').map(Number);if(b.dataset.layoutZoom==='reset'){svg.setAttribute('viewBox','0 0 1200 900');return}const factor=b.dataset.layoutZoom==='in'?.7:1/.7;let nw=Math.max(120,Math.min(1200,w*factor)),nh=nw*.75;svg.setAttribute('viewBox',[Math.max(0,Math.min(1200-nw,x+(w-nw)/2)),Math.max(0,Math.min(900-nh,y+(h-nh)/2)),nw,nh].join(' '))});
