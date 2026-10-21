const COST_DEFAULTS={costAreaPct:100,costDistance:200,costGridMode:'overhead',costGridQuote:'',costInfraQuote:'',costDepositQuote:'',costSlope:'unknown',costConnections:1};
const COST_SOURCES={farm:'https://www.law.go.kr/법령/농지법시행령/제53조',forest:'https://www.law.go.kr/LSW/admRulInfoP.do?admRulSeq=2100000274292',restore:'https://www.law.go.kr/LSW/admRulInfoP.do?admRulSeq=2100000272664',kepco:'https://online.kepco.co.kr/PRM076D00',grid:'https://online.kepco.co.kr/EWM110D01',infra:'https://online.kepco.co.kr/EWM110D04'};
const COST_SPEC=[['costAreaPct','전용·일시사용 면적 비율 (%, 전체 필지 대비)'],['costDistance','한전 신설 연계거리 가정 (m, 실측 아님)'],['costGridMode','한전 공사 방식 가정','select',['overhead:공중 배전선로','underground:지중 배전선로']],['costConnections','별도 접속·감시제어 설비 수 (개, 사업 가정)'],['costSlope','산지 복구비 경사 구간 가정','select',['unknown:미확인 · 4개 구간 범위','low:10도 미만','mid:10도 이상 20도 미만','high:20도 이상 30도 미만','steep:30도 이상']],['costGridQuote','한전 접속공사비 견적 총액 (만원, 있으면 우선)'],['costInfraQuote','감시·제어 설치비 견적 총액 (만원, 있으면 우선)'],['costDepositQuote','산지 복구 예치금 고지액 (만원, 있으면 우선)']];
function parcelCosts(p){
  const ratio=Math.min(100,Math.max(0,+state.costAreaPct||0))/100;
  const farm=p.farm==='yes'||(p.farm!=='no'&&['전','답','과수원'].includes((p.use||'').trim()));
  const forest=!farm&&((p.use||'').trim()==='임야'||/준보전산지|임업용산지|공익용산지/.test(p.zone||''));
  let area=present(p.convert)&&farm?+p.convert:(+p.area||0)*ratio;
  area=Math.max(0,Math.min(+p.area||0,area));
  const price=present(p.price)?+p.price:null,relief=1-Math.min(100,Math.max(0,+p.relief||0))/100;
  let farmLow=0,farmHigh=0,forestLow=0,forestHigh=0,depositLow=0,depositHigh=0;
  const notes=[];let missing=!p.address||!p.use||!present(p.area);
  if(farm){
    const inside=p.agri==='inside'||/농업진흥구역|농업보호구역/.test(p.zone||''),outside=p.agri==='outside';
    if(price===null){farmLow=farmHigh=null;missing=true;notes.push('공시지가 미제공 · 농지보전부담금 산정 불가');}
    else {farmLow=area*Math.min(price*(inside?.3:.2),50000)*relief;farmHigh=area*Math.min(price*(outside?.2:.3),50000)*relief;}
    notes.push(p.farm==='yes'?'실제 농지로 입력된 조건':'지목으로 추정한 농지 · 실제 이용현황 확인 필요');
    notes.push(inside?'농업진흥지역 안 30%':outside?'농업진흥지역 밖 20%':'진흥지역 여부 미확인 · 20~30% 범위, 상한액을 예산에 반영');
  }
  if(forest){
    const zone=p.zone||'',restricted=/산지전용[·ㆍ・\s]*일시사용제한지역|산지전용제한지역/.test(zone),semi=/준보전산지/.test(zone),conserved=/임업용산지|공익용산지/.test(zone)||(/보전산지/.test(zone)&&!semi);
    let lo=restricted?16680:semi&&!conserved?8340:conserved&&!semi?10840:8340;
    let hi=restricted?16680:semi&&!conserved?8340:conserved&&!semi?10840:16680;
    if(price===null){forestLow=forestHigh=null;missing=true;notes.push('공시지가 미제공 · 대체산림자원조성비 산정 불가');}
    else {const add=Math.min(price*.001,8340);forestLow=area*(lo+add);forestHigh=area*(hi+add);}
    const recovery={low:8528.4,mid:25454.6,high:33695.3,steep:43868.1};
    const rate=recovery[state.costSlope];depositLow=area*(rate??8528.4);depositHigh=area*(rate??43868.1);
    notes.push('산지일시사용 관련 예산: 대체산림자원조성비 + 복구비 예치금');
    notes.push(lo!==hi?'산지 구분 미확인·혼재 · 단가 8,340~16,680원/㎡ 범위':'고시 기본단가 '+fmt(lo)+'원/㎡');
    notes.push('공시지가 0.1% 가산(가산액 상한 8,340원/㎡) · 감면 미반영');
    if(!rate)notes.push('경사 미확인 · 복구 예치금은 2026년 4개 경사구간 범위');
    notes.push('복구비 추가예치·감리비·임대료는 별도. 제한지역의 허가 가능성을 의미하지 않음');
  }
  if(!farm&&!forest)notes.push('장부상 농지·산지로 분류되지 않음 · 실제 현황에 따라 부담금 발생 가능');
  return {p,area,farm,forest,farmLow,farmHigh,forestLow,forestHigh,depositLow,depositHigh,notes,missing};
}
function standardGridCost(power,distance,mode){
  const kw=Math.ceil(Math.max(0,power));if(!kw)return 0;
  const underground=mode==='underground',high=kw>=100;
  const base=high?kw*(underground?50000:24000):(underground?588000:306000)+Math.max(0,kw-5)*(underground?141000:121000);
  const extra=Math.max(0,distance-(underground?50:200))*(underground?(high?137000:75000):(high?53000:53000));
  return base+extra;
}
function buildCostPlan(parcels,cap,ac){
  const items=parcels.map(parcelCosts),sum=k=>items.reduce((a,p)=>a+(p[k]??0),0),count=Math.max(1,Math.round(+state.costConnections||1));
  const quote=present(state.costGridQuote)?+state.costGridQuote*10000:(+state.connection>0?+state.connection*10000:null);
  const deficient=present(state.gridAvailable)&&+state.gridAvailable<ac;
  const standardEligible=ac>0&&Math.ceil(ac)<=1000&&!deficient&&count===1;
  const grid=quote!==null?quote:standardEligible?standardGridCost(ac,+state.costDistance||0,state.costGridMode):null;
  const infra=present(state.costInfraQuote)?+state.costInfraQuote*10000:(cap>=90?5400000*count:0);
  const deposit=present(state.costDepositQuote)?+state.costDepositQuote*10000:sum('depositHigh');
  const farm=sum('farmHigh'),forest=sum('forestHigh'),legal=farm+forest;
  const epc=cap*+state.epc*10000,land=present(state.landUnitPrice)?parcels.reduce((sum,p)=>sum+Math.max(0,+p.area||0),0)/3.3057851239669422*+state.landUnitPrice*10000:+state.landCost*10000,other=+state.extra*10000;
  const capex=epc+land+other+legal+(grid??0)+infra;
  const missing=items.some(i=>i.missing)||grid===null;
  return {items,farm,forest,legal,deposit,grid,infra,epc,land,other,capex,initial:capex+deposit,missing,standardEligible,gridQuoted:quote!==null,ac,count,
    farmLow:sum('farmLow'),forestLow:sum('forestLow'),depositLow:sum('depositLow')};
}
function costRange(lo,hi){return lo===null||hi===null?'산정 불가':Math.abs(lo-hi)<.01?fmt(hi/10000,1)+' 만원':fmt(lo/10000,1)+' ~ '+fmt(hi/10000,1)+' 만원';}
function renderCostSettings(){if($('costInputs'))$('costInputs').innerHTML=COST_SPEC.map(s=>field(s)).join('');}
function renderCosts(parcels,cap,ac){
  const b=buildCostPlan(parcels,cap,ac);if(!$('costResult'))return b;
  const card=(t,v,n)=>`<div class="metric"><small>${t}</small><strong>${v}</strong><em>${n}</em></div>`;
  if(!parcels.length||cap<=0){$('costResult').innerHTML='<p class="muted">필지를 조회하면 면적·지목·공시지가를 바탕으로 사업비가 자동 산정됩니다.</p>';return b;}
  const breakdown=[['태양광 EPC',b.epc,'설비 DC 용량 × EPC 단가 가정'],['농지보전부담금',b.farm,'진흥지역 미확인은 범위 상한 · 감면은 입력 조건'],['대체산림자원조성비',b.forest,'2026년 고시 · 산지 구분 미확인은 범위 상한'],['한전 접속공사비 / 시설부담금',b.grid,b.gridQuoted?'입력한 견적 총액 우선 반영':b.standardEligible?'표준시설부담금 잠정치 · 연계거리·공사방식 가정':'1MW 초과·계통보강·복수접속은 설계견적 필요 · 합계에서 제외'],['감시·제어 설비',b.infra,'90kW 이상: 540만원 × 접속설비 수 가정 · 조건부 접속·추가통신비 확인'],['토지 취득비',b.land,'전체 면적 ÷ 3.305785 × 입력 평당가격 · 공시지가와 별도'],['토목·설계·인허가·기타',b.other,'입력 합계 · EPC 포함 공종과 중복 주의']];
  const table=rows=>`<div class="tablewrap"><table><thead><tr><th>항목</th><th>예산 반영액</th><th>산정 조건</th></tr></thead><tbody>${rows.map(([t,v,n])=>`<tr><td>${esc(t)}</td><td>${v===null?'견적 필요':fmt(v/10000,1)+' 만원'}</td><td class="cost-note">${esc(n)}</td></tr>`).join('')}</tbody></table></div>`;
  $('costResult').innerHTML=`<div class="notice">잠정 예산 · 전용/일시사용면적은 ${fmt(+state.costAreaPct)}% 가정, 연계거리 ${fmt(+state.costDistance)}m는 조회값이 아닌 가정입니다. 농지·산지 허가 및 감면을 보장하지 않습니다. 모든 공사비는 VAT 별도입니다.</div><div class="metrics">${card('사업비 합계(예치금 제외)',fmt(b.capex/10000,1)+' 만원',b.missing?'미확정 비용 제외 · 아래 누락 항목 확인':'자동 추정 + 입력 가정')}${card('복구비 예치 필요자금',fmt(b.deposit/10000,1)+' 만원','산지 경사 미확인 시 상한 가정 · 현금예치 시나리오')}${card('초기 필요자금',fmt(b.initial/10000,1)+' 만원','사업비 + 현금 예치금 · 세금·미확정 비용 별도')}${card('한전 연계 예산',b.grid===null?'견적 필요':fmt(((b.grid??0)+b.infra)/10000,1)+' 만원','접속공사비 + 감시제어비 · 실제 청구액 아님')}</div>${table(breakdown)}<h3>필지별 농지·산지 비용</h3>${b.items.map(i=>`<article class="parcel"><b>${esc(i.p.address||'지번 미조회')}</b><p class="muted">적용면적 ${fmt(i.area,1)}㎡ · 지목 ${esc(i.p.use||'미확인')} · 공시지가 ${present(i.p.price)?fmt(+i.p.price)+'원/㎡':'미제공'}</p>${table([['농지보전부담금',i.farmHigh,i.farm?'범위 '+costRange(i.farmLow,i.farmHigh):'장부 기준 잠정 비대상'],['대체산림자원조성비',i.forestHigh,i.forest?'범위 '+costRange(i.forestLow,i.forestHigh):'장부 기준 잠정 비대상'],['복구비 예치금(사업비와 별도)',i.depositHigh,i.forest?'고시 기준 범위 '+costRange(i.depositLow,i.depositHigh):'장부 기준 잠정 비대상']])}<p class="muted">${i.notes.map(esc).join(' · ')}</p></article>`).join('')}<h3>한전 거리별 비교 · 신설 공사만 가정</h3><p class="muted">${Math.ceil(ac)>1000?'현재 설계는 1MW를 초과해 표준시설부담금을 적용하지 않습니다. 아래는 1MW 접속을 별도로 가정한 비교표이며 현재 사업 견적이 아닙니다.':'면적 기반 설계 AC '+fmt(ac,1)+'kW를 계약전력으로 가정했습니다. 신설·첨가 혼합, 원거리 접속, 배전망 보강 등은 실제 설계로 달라집니다.'}</p><div class="tablewrap"><table><tr><th>신설 거리 가정</th><th>공중 방식</th><th>지중 방식</th></tr>${[0,200,500,1000].map(d=>`<tr><td>${d}m</td><td>${fmt(standardGridCost(Math.min(ac,1000),d,'overhead')/10000,1)} 만원</td><td>${fmt(standardGridCost(Math.min(ac,1000),d,'underground')/10000,1)} 만원</td></tr>`).join('')}</table></div><p class="muted">복구비 예치금은 비용 지출과 구분해 자기자본에서 추가 확보하고, 운영 말기 복구 승인 후 전액 반환되는 현금예치 시나리오로 경제성에 반영합니다. 실제 철거·복구비는 잔존가치−철거비 항목에 별도 반영하세요. 보증보험 이용 시에는 보험료·갱신조건으로 다시 검토해야 합니다.</p><div class="check warn"><strong>별도 확인·견적 항목</strong>취득·등록 관련 세금, 개발부담금 해당 여부, 산지 임대료·사용료, 현장측량·토질·배수·진입로·환경·재해 검토, 복구비 추가예치·감리, 보강공사 및 전용선로, 추가 통신비, 금융수수료, VAT 운전자금. 미확정액을 0원 확정으로 보지 마세요.</div><p class="muted">근거 확인: 2026.10.20 · <a target="_blank" rel="noopener" href="${COST_SOURCES.farm}">농지법 시행령</a> · <a target="_blank" rel="noopener" href="${COST_SOURCES.forest}">2026 산림조성비 고시</a> · <a target="_blank" rel="noopener" href="${COST_SOURCES.restore}">2026 복구비 고시</a> · <a target="_blank" rel="noopener" href="${COST_SOURCES.kepco}">한전 표준시설부담금</a> · <a target="_blank" rel="noopener" href="${COST_SOURCES.grid}">발전 연계 산정기준</a> · <a target="_blank" rel="noopener" href="${COST_SOURCES.infra}">감시제어 설치비</a></p>`;
  return b;
}
