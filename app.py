"""Render WSGI entrypoint. Public read-only lookups; projects stay in the browser."""
import json
import mimetypes
import os
from pathlib import Path
from threading import BoundedSemaphore
from urllib.parse import parse_qs, unquote
import server
import search_records

ROOT=Path(__file__).resolve().parent
STATIC=ROOT/'dist'
SLOTS=BoundedSemaphore(4)

def application(environ,start_response):
    method=environ.get('REQUEST_METHOD','GET')
    path=unquote(environ.get('PATH_INFO','/'))
    def send(body,status=200,mime='application/json; charset=utf-8',extra=()):
        if isinstance(body,(dict,list)):body=json.dumps(body,ensure_ascii=False).encode()
        elif isinstance(body,str):body=body.encode()
        names={200:'OK',400:'Bad Request',403:'Forbidden',404:'Not Found',405:'Method Not Allowed',422:'Unprocessable Content',429:'Too Many Requests',502:'Bad Gateway',503:'Service Unavailable'}
        headers=[('Content-Type',mime),('Content-Length',str(len(body))),('Cache-Control','no-store' if path.startswith(('/api/','/admin')) else 'no-cache'),('X-Content-Type-Options','nosniff'),('Referrer-Policy','same-origin'),('X-Frame-Options','DENY'),*extra]
        start_response(str(status)+' '+names[status],headers)
        return [b'' if method=='HEAD' else body]
    host=environ.get('HTTP_HOST','').split(':')[0].lower()
    allowed={'localhost','127.0.0.1','solar.jinenergy.co.kr'}
    allowed.update(x.strip().lower() for x in os.getenv('ALLOWED_HOSTS','').split(',') if x.strip())
    if os.getenv('RENDER_EXTERNAL_HOSTNAME'):allowed.add(os.environ['RENDER_EXTERNAL_HOSTNAME'].lower())
    if host not in allowed:return send({'error':'Unknown host'},403)
    if path=='/admin/export':
        if method!='POST':return send('관리자 화면에서 비밀번호를 입력하세요.',405,'text/plain; charset=utf-8',extra=[('Allow','POST')])
        origin=environ.get('HTTP_ORIGIN')
        trusted_origins={'https://'+name for name in allowed if name not in {'localhost','127.0.0.1'}}
        if host in {'localhost','127.0.0.1'}:
            trusted_origins.update({'http://'+environ.get('HTTP_HOST',''),'https://'+environ.get('HTTP_HOST','')})
        if origin and origin not in trusted_origins:
            return send('허용되지 않은 요청입니다.',403,'text/plain; charset=utf-8')
        try:
            size=int(environ.get('CONTENT_LENGTH','0'))
            if not 0<size<=4096:raise ValueError()
            form=parse_qs(environ['wsgi.input'].read(size).decode())
            auth=search_records.authenticate(form.get('password',[''])[0])
        except (ValueError,UnicodeError):return send('잘못된 요청입니다.',400,'text/plain; charset=utf-8')
        if auth!='ok':
            status=429 if auth=='limited' else 503 if auth=='disabled' else 403
            message='잠시 후 다시 시도하세요.' if auth=='limited' else 'Render에 ADMIN_PASSWORD를 설정하세요.' if auth=='disabled' else '관리자 비밀번호가 일치하지 않습니다. 뒤로 가서 다시 입력하세요.'
            return send(message,status,'text/plain; charset=utf-8')
        try:
            body=search_records.workbook(search_records.addresses())
            return send(body,mime='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',extra=[('Content-Disposition','attachment; filename="SOLAR_JIN_parcels.xlsx"')])
        except Exception:return send('저장소 연결 실패: Render의 SUPABASE_URL·SUPABASE_SECRET_KEY와 Supabase의 parcel_search_events 표를 확인하세요.',502,'text/plain; charset=utf-8')
    if method not in ('GET','HEAD'):return send({'error':'GET only'},405,extra=[('Allow','GET, HEAD')])
    if path in ('/admin','/admin/'):
        return send((STATIC/'admin.html').read_bytes(),mime='text/html; charset=utf-8')
    if path=='/api/health':return send({'ok':True,'app':'SOLAR_JIN','version':'render-1'})
    if path.startswith('/api/'):
        if len(environ.get('QUERY_STRING',''))>6000:return send({'error':'Query too long'},400)
        q=parse_qs(environ.get('QUERY_STRING',''));get=lambda key,default='':q.get(key,[default])[0]
        known={'/api/search','/api/land','/api/grid','/api/map','/api/terrain','/api/housing','/api/layout'}
        if path not in known:return send({'error':'Unknown endpoint'},404)
        if not SLOTS.acquire(blocking=False):return send({'error':'조회 요청이 많습니다. 잠시 후 다시 시도하세요.'},503,extra=[('Retry-After','5')])
        try:
            pnu=get('pnu')
            if path=='/api/search':result=server.search_land(get('q'))
            elif path=='/api/land':
                result=dict(server.land_detail(pnu))
                if method=='GET':result['collectionStatus']=search_records.record(result.get('address'))
            elif path=='/api/terrain':result=server.terrain_detail(pnu)
            elif path=='/api/housing':result=server.housing_detail(pnu)
            elif path=='/api/layout':result=server.satellite_layout(get('pnus',pnu),float(get('usable','100')),float(get('density','7')),float(get('rowGap','1.32')))
            elif path=='/api/grid':
                land=server.land_detail(pnu);result=server.grid_detail(land['address'],land['pnu'])
            else:
                body=server.land_map(pnu,get('scale','auto'),refresh='retry' in q)
                mime='image/png' if body.startswith(b'\x89PNG') else 'image/gif' if body.startswith(b'GIF') else 'image/jpeg'
                return send(body,mime=mime)
            return send(result)
        except ValueError as error:return send({'error':str(error)},422)
        except Exception:return send({'error':'공식 조회 서비스 연결에 실패했습니다. 잠시 후 재조회하거나 원문을 확인하세요.'},502)
        finally:SLOTS.release()
    if '\x00' in path:return send('Not found',404,'text/plain; charset=utf-8')
    target=(STATIC/('index.html' if path=='/' else path.lstrip('/'))).resolve()
    if not target.is_relative_to(STATIC.resolve()) or not target.is_file() or any(x.startswith('.') for x in target.relative_to(STATIC).parts):return send('Not found',404,'text/plain; charset=utf-8')
    mime=mimetypes.guess_type(target.name)[0] or 'application/octet-stream'
    if target.suffix in ('.html','.js','.css','.svg'):mime+='; charset=utf-8'
    return send(target.read_bytes(),mime=mime)
