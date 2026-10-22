/* Editable 2D CAD export in the original EPSG:5179 plane, drawing units metres. */
function buildLayoutDxf(layout,count){
  const g=layout.cadGeometry;
  if(!g||g.crs!=='EPSG:5179'||g.units!=='m')throw Error('CAD 좌표가 없는 이전 배치입니다. 다시 그리기를 누른 뒤 다운로드하세요.');
  if(!Number.isInteger(count)||count<0||count>g.panels.length)throw Error('모듈 수량을 확인하세요.');
  const pairs=[],put=(code,value)=>pairs.push(String(code),String(value));
  const num=v=>{if(!Number.isFinite(v))throw Error('도면 좌표를 확인할 수 없습니다.');return v.toFixed(6)};
  const ascii=s=>String(s).replace(/[\r\n]/g,' ').replace(/[^\x20-\x7e]/g,c=>'\\U+'+c.charCodeAt(0).toString(16).toUpperCase().padStart(4,'0'));
  let handle=256;const next=()=> (++handle).toString(16).toUpperCase();
  const points=g.outlines.flatMap(p=>p.flat());
  if(!points.length)throw Error('부지 경계가 없습니다.');
  const xmin=Math.min(...points.map(p=>p[0])),xmax=Math.max(...points.map(p=>p[0])),ymin=Math.min(...points.map(p=>p[1])),ymax=Math.max(...points.map(p=>p[1]));
  put(0,'SECTION');put(2,'HEADER');put(9,'$ACADVER');put(1,'AC1015');put(9,'$DWGCODEPAGE');put(3,'ANSI_1252');put(9,'$INSUNITS');put(70,6);put(9,'$MEASUREMENT');put(70,1);put(9,'$LUNITS');put(70,2);put(9,'$LUPREC');put(70,6);
  put(9,'$EXTMIN');put(10,num(xmin));put(20,num(ymin));put(30,0);put(9,'$EXTMAX');put(10,num(xmax));put(20,num(ymax+20));put(30,0);put(0,'ENDSEC');
  put(0,'SECTION');put(2,'TABLES');
  put(0,'TABLE');put(2,'LTYPE');put(5,next());put(100,'AcDbSymbolTable');put(70,1);put(0,'LTYPE');put(5,next());put(100,'AcDbSymbolTableRecord');put(100,'AcDbLinetypeTableRecord');put(2,'CONTINUOUS');put(70,0);put(3,'Solid line');put(72,65);put(73,0);put(40,0);put(0,'ENDTAB');
  const layers=[['0',7],['SITE_BOUNDARY',2],['SITE_HOLE',1],['PV_MODULE',5],['DESIGN_NOTES',7]];
  put(0,'TABLE');put(2,'LAYER');put(5,next());put(100,'AcDbSymbolTable');put(70,layers.length);
  for(const [name,color] of layers){put(0,'LAYER');put(5,next());put(100,'AcDbSymbolTableRecord');put(100,'AcDbLayerTableRecord');put(2,name);put(70,0);put(62,color);put(6,'CONTINUOUS')}
  put(0,'ENDTAB');put(0,'ENDSEC');put(0,'SECTION');put(2,'BLOCKS');put(0,'ENDSEC');put(0,'SECTION');put(2,'ENTITIES');
  function polygon(ring,layer){
    let pts=ring.slice();if(pts.length>1&&pts[0][0]===pts.at(-1)[0]&&pts[0][1]===pts.at(-1)[1])pts.pop();
    if(pts.length<3)throw Error('도면 경계의 점이 부족합니다.');
    put(0,'LWPOLYLINE');put(5,next());put(100,'AcDbEntity');put(8,layer);put(100,'AcDbPolyline');put(90,pts.length);put(70,1);
    for(const p of pts){put(10,num(p[0]));put(20,num(p[1]))}
  }
  for(const rings of g.outlines)rings.forEach((r,i)=>polygon(r,i?'SITE_HOLE':'SITE_BOUNDARY'));
  for(const panel of g.panels.slice(0,count))polygon(panel,'PV_MODULE');
  const notes=[
    'SOLAR_JIN / CONCEPT LAYOUT / NOT A SURVEY OR CONSTRUCTION DRAWING',
    'CRS EPSG:5179 / X Easting, Y Northing / 1 drawing unit = 1 metre / 2D plan projection',
    `MODULE ${g.moduleLengthMm} x ${g.moduleWidthMm} mm / ${g.moduleWp} Wp / COUNT ${count} / DC ${(count*g.moduleWp/1000).toFixed(3)} kWp`,
    `TILT ${g.tiltDeg} deg from horizontal / TIERS ${g.tiers} / SOLAR ALTITUDE 25 deg / SOUTH FACING`,
    `ROW CLEAR GAP ${g.rowGapM.toFixed(4)} m / ROW PITCH ${g.rowPitchM.toFixed(4)} m / SITE SETBACK 2 m`,
    'DEM REPRESENTATIVE TERRAIN / VERIFY BOUNDARIES AND FIELD OBSTACLES / SATELLITE IMAGE NOT EMBEDDED',
    'PNU '+(layout.pnus||[]).join(', ')
  ];
  notes.forEach((text,i)=>{put(0,'TEXT');put(5,next());put(100,'AcDbEntity');put(8,'DESIGN_NOTES');put(100,'AcDbText');put(10,num(xmin));put(20,num(ymax+18-i*2.5));put(30,0);put(40,1);put(1,ascii(text));put(50,0);put(100,'AcDbText')});
  put(0,'ENDSEC');put(0,'EOF');return pairs.join('\r\n')+'\r\n';
}
function downloadLayoutDxf(){
  try{
    const layout=currentCombinedLayout(unique().ps);
    if(layout?.status!=='ok')throw Error('배치를 완료한 뒤 다운로드하세요.');
    const tiers=+state.moduleTiers||1;
    const count=Math.min(layout.count,+state.capLimit>0?Math.floor(+state.capLimit/(layout.moduleWp/1000)/tiers+1e-8)*tiers:layout.count);
    const content=buildLayoutDxf(layout,count),blob=new Blob([content],{type:'application/dxf'}),url=URL.createObjectURL(blob),link=document.createElement('a');
    link.href=url;link.download='SOLAR_JIN_'+(layout.pnu||'layout')+'_'+count+'modules.dxf';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(error){alert(error.message)}
}
document.addEventListener('click',event=>{if(event.target.closest?.('[data-cad-download]'))downloadLayoutDxf()});
