"""Export editable CAD with a georeferenced, relatively linked satellite raster."""
import io
import json
import math
import re
import zipfile
from concurrent.futures import ThreadPoolExecutor
from threading import BoundedSemaphore
import server

EXPORT_SLOTS=BoundedSemaphore(1)
SERVICE='https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer'

def satellite_raster(layout):
    from PIL import Image, ImageDraw
    from pyproj import Transformer
    extent=layout['extent']
    tiles=server.satellite_tiles(extent,SERVICE)
    entries=[]
    for tile in tiles:
        match=re.fullmatch(re.escape(SERVICE)+r'/tile/(\d+)/(\d+)/(\d+)',tile['url'])
        if not match:raise ValueError('위성영상 주소를 확인할 수 없습니다.')
        z,row,col=map(int,match.groups());entries.append((z,row,col,tile['url']))
    def load(entry):
        image=Image.open(io.BytesIO(server.fetch(entry[3])));image.load()
        if image.size!=(256,256):raise ValueError('위성 타일 크기를 확인하세요.')
        return entry,image.convert('RGB')
    with ThreadPoolExecutor(max_workers=4) as pool:loaded=list(pool.map(load,entries))
    z=entries[0][0];r0=min(e[1] for e in entries);r1=max(e[1] for e in entries);c0=min(e[2] for e in entries);c1=max(e[2] for e in entries)
    source=Image.new('RGB',((c1-c0+1)*256,(r1-r0+1)*256),'white')
    for entry,image in loaded:source.paste(image,((entry[2]-c0)*256,(entry[1]-r0)*256))
    radius=20037508.342789244;span=2*radius/(2**z)
    sx=-radius+c0*span;sy=radius-r0*span;resolution=span/256
    to_tm=Transformer.from_crs(3857,5179,always_xy=True)
    to_merc=Transformer.from_crs(5179,3857,always_xy=True)
    corners=[to_tm.transform(x,y) for x in (extent[0],extent[2]) for y in (extent[1],extent[3])]
    xmin=min(p[0] for p in corners);xmax=max(p[0] for p in corners);ymin=min(p[1] for p in corners);ymax=max(p[1] for p in corners)
    width=1200;height=900
    def pixel(x,y):
        mx,my=to_merc.transform(xmin+x/width*(xmax-xmin),ymax-y/height*(ymax-ymin))
        return (mx-sx)/resolution,(sy-my)/resolution
    mesh=[]
    for y in range(0,height,30):
        for x in range(0,width,30):
            x2=min(x+30,width);y2=min(y+30,height)
            mesh.append(((x,y,x2,y2),sum((pixel(a,b) for a,b in [(x,y),(x,y2),(x2,y2),(x2,y)]),())))
    output=source.transform((width,height),Image.Transform.MESH,mesh,resample=Image.Resampling.BICUBIC,fillcolor='white')
    draw=ImageDraw.Draw(output);draw.rectangle((0,height-19,width,height),fill='white')
    draw.text((5,height-16),'Tiles (c) Esri | Esri, Vantor, Earthstar Geographics and GIS User Community',fill='black')
    buffer=io.BytesIO();output.save(buffer,format='JPEG',quality=94)
    return buffer.getvalue(),(xmin,ymin,xmax,ymax),(width,height)

def prepare(data):
    import ezdxf
    from ezdxf.lldxf.const import VSF_LOCK_ZOOM
    if not isinstance(data,dict):raise ValueError('잘못된 다운로드 요청입니다.')
    token=data.get('token');count=data.get('count')
    if not isinstance(token,str) or not 16<=len(token)<=100:raise ValueError('배치도에서 다시 그리기를 누른 뒤 다운로드하세요.')
    layout=next((v for v in list(server.LAYOUT_CACHE.values()) if v.get('cadToken')==token),None)
    if layout is None:raise ValueError('서버의 배치 정보가 만료됐습니다. 배치도에서 다시 그리기를 누른 뒤 다운로드하세요.')
    tiers=layout['spacing']['tiers']
    if type(count) is not int or not 0<=count<=layout['count'] or count%tiers:raise ValueError('다운로드 모듈 수량을 확인하세요.')
    if not EXPORT_SLOTS.acquire(False):raise ValueError('다른 CAD 사진 묶음을 작성 중입니다. 잠시 후 다시 다운로드하세요.')
    try:
        jpeg,bounds,pixels=satellite_raster(layout)
        g=layout['cadGeometry'];doc=ezdxf.new('R2000');doc.units=6
        for name,color in [('SATELLITE',7),('SITE_BOUNDARY',2),('SITE_HOLE',1),('PV_MODULE',5),('DESIGN_NOTES',7)]:doc.layers.new(name,dxfattribs={'color':color})
        doc.layers.new('VIEWPORT_FRAME',dxfattribs={'color':8,'plot':0})
        model=doc.modelspace();xmin,ymin,xmax,ymax=bounds
        definition=doc.add_image_def(filename='satellite.jpg',size_in_pixel=pixels)
        raster=model.add_image(insert=(xmin,ymin),size_in_units=(xmax-xmin,ymax-ymin),image_def=definition,dxfattribs={'layer':'SATELLITE'})
        for rings in g['outlines']:
            for i,ring in enumerate(rings):model.add_lwpolyline(ring,close=True,dxfattribs={'layer':'SITE_HOLE' if i else 'SITE_BOUNDARY'})
        for panel in g['panels'][:count]:model.add_lwpolyline(panel,close=True,dxfattribs={'layer':'PV_MODULE'})
        points=[p for rings in g['outlines'] for ring in rings for p in ring]
        bx0=min(p[0] for p in points);by0=min(p[1] for p in points);bx1=max(p[0] for p in points);by1=max(p[1] for p in points)
        notes=[
            'SOLAR_JIN / CONCEPT PLAN / EPSG:5179 / MODEL UNITS: METRES',
            f"MODULE {g['moduleLengthMm']:g} x {g['moduleWidthMm']:g} mm | {g['moduleWp']:g} Wp | COUNT {count} | DC {count*g['moduleWp']/1000:.3f} kWp",
            f"TILT {g['tiltDeg']:g} deg | TIERS {g['tiers']} | SUN ALTITUDE 25 deg | SOUTH FACING",
            f"BOUNDARY SETBACK {g['boundarySetbackM']:g} m | ROW GAP {g['rowGapM']:.4f} m | PITCH {g['rowPitchM']:.4f} m",
            '2D PROJECTED MODULES / DEM REPRESENTATIVE SLOPE / VERIFY ACTUAL BOUNDARIES AND OBSTACLES',
            'Tiles (c) Esri | Esri, Vantor, Earthstar Geographics and GIS User Community',
            'PNU '+', '.join(layout['pnus']),
        ]
        for i,text in enumerate(notes):model.add_text(text,dxfattribs={'height':1,'insert':(bx0,by1+18-i*2.5),'layer':'DESIGN_NOTES'})
        # Image is explicitly ordered behind the editable geometry and annotations.
        model.set_redraw_order([(e.dxf.handle,str(i+1)) for i,e in enumerate(model)])
        paper=doc.layouts.get('Layout1');doc.layouts.rename('Layout1','PRINT_1_1000')
        sizes=[('A3',420,297),('A2',594,420),('A1',841,594),('A0',1189,841)]
        label,w,h=next((s for s in sizes if bx1-bx0<=s[1]-40 and by1-by0+40<=s[2]-60),sizes[-1])
        paper.page_setup(size=(w,h),margins=(0,0,0,0),units='mm',scale=(1,1),name='ISO '+label+' landscape',device='DWG To PDF.pc3')
        paper.add_viewport(center=(w/2,h/2+5),size=(w-30,h-50),view_center_point=((bx0+bx1)/2,(by0+by1)/2+10),view_height=h-50,dxfattribs={'layer':'VIEWPORT_FRAME','flags':VSF_LOCK_ZOOM})
        paper.add_text('SOLAR_JIN | PLAN 1:1000 | '+label+' | PRINT LAYOUT AT 1:1',dxfattribs={'height':3,'insert':(15,12),'layer':'DESIGN_NOTES'})
        doc.set_modelspace_vport(max(by1-by0+50,(bx1-bx0+50)/1.5),center=((bx0+bx1)/2,(by0+by1)/2+10))
        doc.set_raster_variables(frame=0,quality=1,units='m')
        output=io.StringIO();doc.write(output)
        lines=output.getvalue().splitlines()
        handles=[int(lines[i+1].strip(),16) for i in range(0,len(lines)-1,2) if lines[i].strip() in ('5','105') and lines[i+1].strip()]
        for i in range(0,len(lines)-1,2):
            if lines[i].strip()=='9' and lines[i+1].strip()=='$HANDSEED':lines[i+3]=format(max(handles)+1,'X')
        dxf=('\r\n'.join(lines)+'\r\n').encode('cp1252',errors='backslashreplace')
        readme='압축을 모두 풀고 layout.dxf를 여세요. satellite.jpg는 도면과 같은 폴더에 두고 이름을 바꾸지 마세요.\n사진이 안 보이면 AutoCAD 외부참조(XREF)에서 satellite.jpg 경로를 같은 폴더로 지정하세요.\nSATELLITE 레이어를 끄면 사진만 숨길 수 있습니다. 모듈·부지 경계는 별도 레이어에서 편집 가능합니다.\n단위는 m, 인쇄 배치 PRINT_1_1000은 1:1000입니다. 인쇄 시 배치 용지 배율 1:1, 용지에 맞춤 해제.\n사진과 도형은 EPSG:5179로 정렬했지만 원본 지적·영상의 위치 오차는 남습니다. 정밀측량 자료가 아닙니다.\n영상 출처: '+layout['attribution']+'\n'+SERVICE+'\n'
        result=io.BytesIO()
        with zipfile.ZipFile(result,'w',zipfile.ZIP_DEFLATED) as archive:
            archive.writestr('layout.dxf',dxf);archive.writestr('satellite.jpg',jpeg);archive.writestr('사용안내.txt',readme.encode('utf-8'))
        return result.getvalue()
    finally:EXPORT_SLOTS.release()
