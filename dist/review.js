function parcelMap(p){
  if(!/^\d{19}$/.test(p.pnu||''))return '';
  const eum='https://www.eum.go.kr/web/mp/mpMapDet.jsp?pnu='+encodeURIComponent(p.pnu)+'&sId=selectaddr';
  return `<div class="parcel-map"><div class="map-heading"><strong>필지 주변 지적·지역지구 지도</strong><span>토지이음 이음지도 · 확대·축소 및 이동</span></div><iframe class="parcel-live-map" src="${eum}" title="${esc(p.address)} 지적·지역지구 지도" loading="lazy" allowfullscreen></iframe><div class="map-actions"><a class="button" href="${eum}" target="_blank" rel="noopener">지도 크게 열기 ↗</a><button type="button" data-map-fullscreen>전체화면</button><button type="button" data-map-retry>필지 위치로 돌아가기</button></div><p class="muted">지도 위에서 마우스 휠로 확대·축소하고 드래그로 이동하세요. 토지이음의 ‘연속지적도만 보기’에서 지적 경계를 확인할 수 있습니다. 출처: 국토교통부 토지이음. 지도는 참고자료이며 경계·거리·인허가 조건은 별도 확인이 필요합니다.</p></div>`;
}
document.addEventListener('click',async e=>{const b=e.target.closest?.('[data-map-retry],[data-map-fullscreen]');if(!b)return;const box=b.closest('.parcel-map'),frame=box.querySelector('iframe');if(b.hasAttribute('data-map-retry'))frame.src=frame.getAttribute('src');else{try{if(document.fullscreenElement)await document.exitFullscreen();else await box.requestFullscreen()}catch{window.open(frame.src,'_blank','noopener')}}});
function terrainSummary(p){
  const t=p.terrain;
  if(!t)return '<div class="check warn"><strong>지형 자동분석 대기</strong>지번을 다시 조회하면 표고·경사·사면 방향을 분석합니다.</div>';
  if(t.status!=='ok')return `<div class="check warn"><strong>지형 조회 확인 필요</strong>${esc(t.message||'표고자료 조회 실패')} · 지번을 재조회하세요.</div>`;
  return `<div class="terrain-summary"><h3>지형 자동분석 · 대표점 주변 추정</h3><div class="metrics"><div class="metric"><small>대표 경사</small><strong>${fmt(t.slope,1)}°</strong><em>필지 전체 평균·최대경사 아님</em></div><div class="metric"><small>주 사면 방향</small><strong>${esc(t.direction)}</strong><em>${t.aspect===null?'경사 1° 미만':fmt(t.aspect,1)+'° · 북 0° / 남 180°'}</em></div><div class="metric"><small>대표점 표고</small><strong>${fmt(t.elevation,1)}m</strong><em>SRTM 표고</em></div><div class="metric"><small>자료 해상도</small><strong>약 30m</strong><em>2000년 관측 기반</em></div></div><p class="muted">${esc(t.method)} · ${esc(t.limitation)}</p><a href="${esc(t.sourceUrl)}" target="_blank" rel="noopener">표고자료 출처 ↗</a><p class="muted">조회 ${esc(t.queriedAt)} · 경계도 기준 ${esc(t.mapVersion)}</p></div>`;
}
function housingSummary(p){
  const h=p.housing;
  if(!h||h.status!=='ok')return `<div class="check warn"><strong>200m 이내 주거지 · 확인 필요</strong>${esc(h?.message||'지번을 다시 조회하면 공개 건물자료를 확인합니다.')} · 주거지가 없는 것으로 판정하지 않습니다.</div>`;
  return `<div class="housing-summary"><h3>필지 경계 200m 이내 · 주거지 후보</h3><div class="metrics"><div class="metric"><small>주거형 건물 태그 확인</small><strong>${h.records.length?fmt(h.residentialCount)+'동':'자료 없음'}</strong><em>공개자료 확인분 · 전체 동수 미확정</em></div><div class="metric"><small>용도 미확인 건물</small><strong>${h.records.length?fmt(h.unknownCount)+'동':'자료 없음'}</strong><em>주거 여부 별도 확인</em></div><div class="metric"><small>그 밖의 건물 태그</small><strong>${h.records.length?fmt(h.otherCount)+'동':'자료 없음'}</strong><em>실제 사용 용도 확인 필요</em></div><div class="metric"><small>실제 거주 세대 수</small><strong>확인 필요</strong><em>건물 동수와 세대·호수는 다름</em></div></div><p class="muted">${esc(h.method)} · ${esc(h.limitation)}</p><details><summary>확인된 건물과 거리 보기</summary>${h.records.length?`<div class="tablewrap"><table><thead><tr><th>건물</th><th>분류</th><th>경계 간 거리</th><th>자료</th></tr></thead><tbody>${h.records.map(r=>`<tr><td>${esc(r.name||r.id)}</td><td>${esc(r.building)} · ${r.category==='residential'?'주거형':r.category==='unknown'?'미확인':'기타'}</td><td>${fmt(r.distanceM,1)}m</td><td><a href="${esc(r.url)}" target="_blank" rel="noopener">원문 ↗</a></td></tr>`).join('')}</tbody></table></div>`:'<p class="muted">공개자료에 등록된 건물이 없습니다. 위성사진·건축물대장 및 현장 확인이 필요합니다.</p>'}</details><p class="muted"><a href="${esc(h.sourceUrl)}" target="_blank" rel="noopener">${esc(h.source)}</a> · 조회 ${esc(h.queriedAt)} · 자료 ${esc(h.dataTimestamp)}</p></div>`;
}
function syncAutoGrid(parcels){
  // Every reviewed parcel must have one exact-address route. Shared routes
  // are counted once; capacities on different routes are never added.
  state.gridAvailable='';state.gridSource='';state.gridDate='';state.gridAuto=null;
  if(!parcels.length||parcels.some(p=>!p.pnu||p.grid?.status!=='ok'||p.grid?.substituted||p.grid.rows?.length!==1))return;
  const keys=parcels.map(p=>{const r=p.grid.rows[0];return [r.substationCode,r.transformer,r.lineCode].join('/')});
  if(new Set(keys).size!==1)return;
  const vals=parcels.flatMap(p=>p.grid.rows[0].levels.map(l=>l.available));
  if(vals.some(v=>v===null||v===''||!Number.isFinite(+v)))return;
  const p=parcels[0],r=p.grid.rows[0];
  state.gridAvailable=Math.max(0,Math.min(...vals));
  state.gridSource=`한전ON · ${r.substation} / #${r.transformer} / ${r.line} · 접수기준 최소 여유`;
  state.gridDate=parcels.map(p=>p.grid.queriedAt.slice(0,10)).sort()[0];
  state.gridAuto={route:keys[0]};
}
function renderAutoReview(parcels,ac){
  const place=(title,value,note)=>`<div class="metric"><small>${title}</small><strong>${value}</strong><em>${note}</em></div>`;
  const settings=`<div class="metrics">${place('도로 이격','미적용','사용자 지정 조건')}${place('주거지 이격 기준','200 m','사용자 지정 기준 · 법적 기준 검증 전')}${place('200m 이내 주거지',parcels.some(p=>p.housing?.status==='ok')?'아래 후보 집계':'조회 대기','공개자료 확인분 · 총 세대수 미확정')}${place('경사도·사면 향',parcels.some(p=>p.terrain?.status==='ok')?'분석값 아래 표시':'조회 대기','30m DEM 대표점 추정 · 현장 확인 필요')}</div>`;
  const cards=parcels.map(p=>`<article class="auto-review-parcel"><h3>${esc(p.address||'지번 조회 대기')}</h3><div class="check"><strong>용도지역·지구 · ${p.zone?'조회 자료 자동 반영':'조회 대기'}</strong>${esc(p.zone||'필지 조회 후 표시됩니다.')}<p class="muted">${esc(p.source||'')}${p.date?' · 확인일 '+esc(p.date):''}</p></div><div class="check warn"><strong>개발행위·전용 검토 · 관할청 확인 필요</strong>${p.use?'지목 '+esc(p.use)+' · ':''}${p.agri==='inside'?'농업진흥지역 지정 확인 · 전용 제한 검토 필요. ':''}${p.use==='임야'?'산지전용·일시사용 및 복구 의무 검토 필요. ':''}조회된 지역·지구의 행위제한, 환경·재해·진입로·배수 조건을 종합해야 하므로 자동으로 허가 가능을 확정하지 않습니다.</div>${parcelMap(p)}${terrainSummary(p)}${housingSummary(p)}${gridSummary(p.grid)}</article>`).join('');
  const known=present(state.gridAvailable),msg=known?`동일 접속경로의 접수기준 최소 여유 ${fmt(+state.gridAvailable)}kW AC / 면적 기반 설계 AC ${fmt(ac,1)}kW → ${+state.gridAvailable>=ac?'수치상 용량 범위 내':'조회 여유보다 설계용량이 큼'}. 접속 승인은 별도입니다.`:'계통 조회 결과를 필지별로 표시합니다. 여러 접속경로·미조회 필지는 하나의 사업 여유용량으로 합산하지 않습니다.';
  const container=$('reviewInputs'),signature=JSON.stringify(parcels.map(({layout,...parcel})=>parcel));
  const capacity=container.querySelector?.('[data-capacity-message]');
  if(container._parcelSignature===signature&&capacity){capacity.textContent=msg;return}
  container._parcelSignature=signature;
  $('reviewInputs').className='auto-review';
  $('reviewInputs').innerHTML=settings+(cards||'<p class="muted">1번 사업 부지에서 지번을 조회하면 입지·규제·계통 자료가 여기에 자동으로 표시됩니다.</p>')+`<div class="check ${known&&+state.gridAvailable<ac?'bad':'warn'}"><strong>사업 용량 자동 비교</strong><span data-capacity-message>${esc(msg)}</span></div>`;
}
