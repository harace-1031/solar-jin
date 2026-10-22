// Public-data lookup UI. Functions are invoked after app.js initializes state.
const lookupRevisions=new WeakMap(),lookupResults=new WeakMap(),lookupTimers=new WeakMap();
function parcelSummary(p){
  if(!p.pnu&&!p.area)return '<p class="muted">지번을 검색하면 토지 정보와 한전 선로 여유가 여기에 표시됩니다.</p>';
  const d=p.date||'확인일 없음';
  return `<div class="parcel-facts"><strong>${esc(p.address)}</strong><div class="facts"><span>지목<b>${esc(p.use||'미제공')}</b></span><span>면적<b>${present(p.area)?fmt(+p.area)+' ㎡':'미제공'}</b></span><span>개별공시지가<b>${present(p.price)?fmt(+p.price)+' 원/㎡':'미제공'}</b></span><span>공시 기준<b>${esc(p.pricePeriod||'출처 확인')}</b></span></div><p><small>용도지역·지구</small><br>${esc(p.zone||'제공 자료 없음')}</p><p class="muted">조회일 ${esc(d)} · ${esc(p.source||'직접 입력')} ${p.pnu?`<a href="https://www.eum.go.kr/web/ar/lu/luLandDet.jsp?mode=search&selGbn=umd&isNoScr=script&pnu=${encodeURIComponent(p.pnu)}" target="_blank" rel="noopener">토지이음 원문 ↗</a>`:''}</p></div>${gridSummary(p.grid)}`;
}
function gridSummary(g){
  if(!g)return '<div class="grid-summary muted">한전 선로 정보 · 검색 시 함께 조회합니다.</div>';
  if(g.status!=='ok')return `<div class="grid-summary"><strong>한전 선로 · 확인 필요</strong><p>${esc(g.message||'조회하지 못했습니다.')}</p><a href="https://online.kepco.co.kr/EWM092D00" target="_blank" rel="noopener">한전ON 원문 확인 ↗</a></div>`;
  return `<div class="grid-summary"><strong>⚡ 한전 배전망 조회 결과</strong><p class="muted">${g.substituted?'요청 지번':'동일 지번'} ${esc(g.address)} · 조회 ${esc(g.queriedAt)} · 단위 kW</p>${g.substituted?`<div class="check warn"><strong>동일 지번 선로 미제공 · 위치 확인 후보 중 가장 가까운 등록 지번으로 대체 조회</strong>대체 주소: ${esc(g.substitution.matchedAddress)}<br>직선거리 약 ${fmt(g.substitution.distanceM,1)}m · ${esc(g.substitution.scope)} ${fmt(g.substitution.locatedCount)}/${fmt(g.substitution.candidateCount)}개 비교<br>${esc(g.substitution.distanceBasis)} · 지적도 기준 ${esc(g.substitution.mapVersion)}<p>인근 필지의 참고 여유입니다. 사업 필지의 접속 선로·여유용량으로 자동 확정하지 않습니다.</p></div>`:''}${g.rows.map((r,i)=>`<div class="line-result"><b>${esc(r.substation)} / 주변압기 #${esc(r.transformer)} / ${esc(r.line)} 선로</b><div class="tablewrap"><table><tr><th>설비</th><th>기준용량</th><th>접수기준 여유</th><th>접속계획 반영 여유</th></tr>${r.levels.map(l=>`<tr><td>${esc(l.label)}</td><td>${l.capacity===null?'미제공':fmt(+l.capacity)}</td><td>${l.available===null?'미제공':fmt(+l.available)}</td><td>${l.planAvailable===null?'미제공':fmt(+l.planAvailable)}</td></tr>`).join('')}</table></div></div>`).join('')}<p class="muted">여러 필지의 여유를 합산하지 않습니다. 위 수치는 특고압 22.9kV 기준 참고자료이며, 송전망·접속 조건과 공사 가능 시점은 한전 확인이 필요합니다.</p><a href="https://online.kepco.co.kr/EWM092D00" target="_blank" rel="noopener">한전ON 원문 ↗</a></div>`;
}
async function lookupApi(path){
  const base=location.protocol==='file:'?'http://127.0.0.1:8765':'';
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),(path.startsWith('/api/grid')||path.startsWith('/api/layout'))?240000:65000);
  try{const res=await fetch(base+path,{signal:controller.signal,cache:'no-store'}),data=await res.json();if(!res.ok)throw Error(data.error||'조회 실패');return data}
  catch(e){if(e instanceof TypeError)throw Error('자동조회 프로그램이 실행되지 않았습니다. 함께 제공된 SOLAR_JIN 실행 파일을 열어주세요.');if(e.name==='AbortError')throw Error('조회 응답이 지연됩니다. 잠시 후 다시 검색하세요.');throw e}
  finally{clearTimeout(timer)}
}
function lookupStatus(p,text){let i=state.parcels.indexOf(p);if(i>=0&&$('lookup-status-'+i))$('lookup-status-'+i).textContent=text}
function updateParcelCard(p){const i=state.parcels.indexOf(p);if(i<0)return;const parent=$('parcel-summary-'+i);if(parent)parent.innerHTML=parcelSummary(p);const block=parent?.closest('.parcel');if(block){for(const input of block.querySelectorAll('[data-key]')){if(Object.hasOwn(p,input.dataset.key))input.value=p[input.dataset.key]??''}const address=block.querySelector('[data-search]');if(address)address.value=p.query??p.address}}
async function selectLookup(p,item,revision){
  lookupStatus(p,'토지이음·지형·한전 조회 중입니다. 인근 선로 대체 비교는 시간이 걸릴 수 있습니다…');
  const i=state.parcels.indexOf(p);if(i<0)return;
  $('lookup-results-'+i).innerHTML='';
  const results=await Promise.allSettled([lookupApi('/api/land?pnu='+encodeURIComponent(item.pnu)),lookupApi('/api/grid?pnu='+encodeURIComponent(item.pnu)),lookupApi('/api/terrain?pnu='+encodeURIComponent(item.pnu)),lookupApi('/api/housing?pnu='+encodeURIComponent(item.pnu))]);
  if(!state.parcels.includes(p)||lookupRevisions.get(p)!==revision)return;
  const land=results[0],grid=results[1],terrain=results[2],housing=results[3];
  if(land.status==='fulfilled'){
    const d=land.value;
    // Fail closed if the upstream page returns a different parcel address.
    const norm=s=>s.replace(/\s|번지/g,'');
    if(norm(d.address)!==norm(item.address)){
      lookupStatus(p,'토지이음 응답 주소가 선택한 필지와 다릅니다. 원문을 확인하고 재조회하세요.');return;
    }
    Object.assign(p,{pnu:d.pnu,address:d.address,query:d.address,use:d.use,area:d.area,zone:d.zone,price:d.price??'',pricePeriod:d.pricePeriod,source:'토지이음 · '+d.pricePeriod+' 공시지가',date:d.queriedAt.slice(0,10),agri:d.agri,farm:'unknown',convert:'',relief:0});
    p.housing=housing.status==='fulfilled'?housing.value:{status:'error',message:housing.reason.message};
    p.terrain=terrain.status==='fulfilled'?terrain.value:{status:'error',message:terrain.reason.message};
    p.grid=grid.status==='fulfilled'&&norm(grid.value.address||'')===norm(d.address)?{...grid.value,pnu:d.pnu}:{status:'error',message:grid.status==='rejected'?grid.reason.message:'한전 응답 주소가 토지이음 필지와 일치하지 않습니다.'};
    lookupStatus(p,'토지 정보 '+(d.price===null?'일부 조회 완료 · 공시지가 재확인 필요':'조회 완료')+' / 한전 '+(p.grid.status==='ok'?'조회 완료':'확인 필요'));
    clearAppliedGrid();

    updateParcelCard(p);calculate();
    // Save the latest official result, retaining local-only project storage.
    try{localStorage.setItem('solar-site-v1',JSON.stringify(state,(k,v)=>k==='layout'?undefined:v))}catch{}
  }else{lookupStatus(p,land.reason.message)}
}
async function searchParcel(p){
  clearTimeout(lookupTimers.get(p));
  const query=(p.query??p.address).trim();if(!query){lookupStatus(p,'읍·면·동(리)과 지번을 입력하세요.');return}
  const revision=(lookupRevisions.get(p)||0)+1;lookupRevisions.set(p,revision);
  lookupStatus(p,'토지이음에서 지번을 검색하고 있습니다…');
  try{const data=await lookupApi('/api/search?q='+encodeURIComponent(query));if(!state.parcels.includes(p)||lookupRevisions.get(p)!==revision)return;
    lookupResults.set(p,data.results);if(data.results.length===1){await selectLookup(p,data.results[0],revision);return}
    const i=state.parcels.indexOf(p);$('lookup-results-'+i).innerHTML=data.results.map((r,j)=>`<button data-candidate="${j}" data-owner="${i}">${esc(r.address)}　→</button>`).join('');
    lookupStatus(p,data.results.length?`${data.results.length}개 주소가 있습니다. 정확한 필지를 선택하세요.`:'일치하는 지번이 없습니다. 읍·면·동(리)과 지번을 확인하세요.');
  }catch(e){if(lookupRevisions.get(p)===revision)lookupStatus(p,e.message)}
}
function clearAppliedGrid(){if(!state.gridAuto)return;state.gridAvailable='';state.gridSource='';state.gridDate='';state.gridAuto=null;for(const k of ['gridAvailable','gridSource','gridDate']){const el=document.querySelector(`[data-key="${k}"]:not([data-parcel])`);if(el)el.value=''}}
function applyGrid(p,index){const g=p.grid,r=g?.rows?.[index];if(!r)return;const vals=r.levels.map(l=>l.available);if(vals.some(v=>v===null||!Number.isFinite(+v))){alert('여유용량이 일부 제공되지 않아 적용할 수 없습니다.');return}state.gridAvailable=Math.max(0,Math.min(...vals));state.gridSource=`한전ON ${p.address} · ${r.substation} / #${r.transformer} / ${r.line} · 접수기준 3설비 최소값`;state.gridDate=g.queriedAt.slice(0,10);state.gridAuto={pnu:p.pnu,line:r.lineCode,substation:r.substationCode};for(const k of ['gridAvailable','gridSource','gridDate']){const el=document.querySelector(`[data-key="${k}"]:not([data-parcel])`);if(el)el.value=state[k]}calculate()}
document.addEventListener('input',e=>{const el=e.target;if(el.dataset.search!==undefined){let p=state.parcels[+el.dataset.search];if(!p)return;p.query=el.value;lookupRevisions.set(p,(lookupRevisions.get(p)||0)+1);if(p.pnu||p.area){clearAppliedGrid();for(const k of ['pnu','address','area','use','zone','price','source','date','convert','pricePeriod'])p[k]='';p.farm='unknown';p.agri='unknown';p.layout=null;p.grid=null;p.terrain=null;p.housing=null;p.relief=0;const i=state.parcels.indexOf(p);$('parcel-summary-'+i).innerHTML=parcelSummary(p);$('lookup-results-'+i).innerHTML='';const block=el.closest('.parcel');for(const input of block.querySelectorAll('[data-key]'))input.value=p[input.dataset.key]??'';calculate()}lookupStatus(p,'지번 입력 후 지번 검색 또는 Enter를 누르세요.')}
  if(el.dataset.parcel!==undefined&&['pnu','area','use','zone','price'].includes(el.dataset.key)){const p=state.parcels[+el.dataset.parcel];if(p){if(el.dataset.key==='pnu'){p.grid=null;clearAppliedGrid()}setTimeout(()=>updateParcelCard(p),0)}}});
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.dataset.search!==undefined){e.preventDefault();searchParcel(state.parcels[+e.target.dataset.search])}});
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.lookup!==undefined)searchParcel(state.parcels[+b.dataset.lookup]);if(b.dataset.candidate!==undefined){const p=state.parcels[+b.dataset.owner],item=lookupResults.get(p)?.[+b.dataset.candidate];if(item)selectLookup(p,item,lookupRevisions.get(p))}if(b.dataset.useGrid!==undefined){const p=state.parcels.find(p=>p.pnu===b.dataset.gridPnu);if(p)applyGrid(p,+b.dataset.useGrid)}if(b.dataset.delete!==undefined)clearAppliedGrid()});
document.addEventListener('DOMContentLoaded',()=>{if(location.protocol==='file:')$('notice').textContent='자동조회를 사용하려면 함께 제공된 SOLAR_JIN 실행 파일을 먼저 여세요. 지번 검색 시 토지이음·한전ON으로 조회합니다.'});
document.addEventListener('input',e=>{if(e.target.dataset.search===undefined)return;const p=state.parcels[+e.target.dataset.search];if(!p)return;clearTimeout(lookupTimers.get(p));const query=(p.query||'').trim();if(/[가-힣].*\d(?:\s*)$/.test(query)&&query.length>=4){lookupStatus(p,'입력한 지번을 자동 검색합니다…');lookupTimers.set(p,setTimeout(()=>searchParcel(p),850))}});

const supplementJobs=new WeakMap();
function scheduleSupplementalLookups(parcels){
  for(const p of parcels){
    if(!/^\d{19}$/.test(p.pnu||''))continue;
    const requested=p.pnu,jobs=supplementJobs.get(p)||new Set();supplementJobs.set(p,jobs);
    for(const name of ['terrain','housing']){
      const key=requested+'/'+name;if(p[name]||jobs.has(key))continue;jobs.add(key);
      lookupApi('/api/'+name+'?pnu='+encodeURIComponent(requested)).then(r=>{if(state.parcels.includes(p)&&p.pnu===requested){p[name]=r;calculate();try{localStorage.setItem('solar-site-v1',JSON.stringify(state,(k,v)=>k==='layout'?undefined:v))}catch{}}}).catch(e=>{if(state.parcels.includes(p)&&p.pnu===requested){p[name]={status:'error',message:e.message};calculate()}});
    }
  }
}
