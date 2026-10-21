# SOLAR_JIN · Render 배포용

이 폴더의 내용물을 GitHub 저장소 루트에 올립니다. Windows용 ZIP·runtime은 올리지 않습니다.
파일 이름의 app.py, server.py, requirements.txt와 dist 폴더 구조를 유지하세요.

Render 설정:
- Source: GitHub 저장소
- Language: Python 3
- Build Command: pip install -r requirements.txt
- Start Command: gunicorn app:application --config gunicorn.conf.py
- Health Check: /api/health
- Environment: PYTHON_VERSION=3.13.16
- Region: Singapore
- 처음 테스트할 때 무료 플랜을 선택할 수 있습니다. 무료 서비스는 유휴 시 정지되어 첫 접속·재시작이 느릴 수 있고 외부 조회 서비스의 제한을 받을 수 있습니다.

배포 후:
1. Render 기본 주소에서 필지·한전·지형·주거지·위성 배치가 실제 조회되는지 확인합니다. 아직 클라우드 외부조회는 검증되지 않았습니다.
2. Render Settings → Custom Domains에 solar.jinenergy.co.kr을 등록합니다.
3. 호스팅케이알에서 호스트 solar의 CNAME에 Render에서 안내한 주소를 입력합니다.
4. Render에서 도메인과 HTTPS 인증서가 정상인지 확인합니다.

현재 모듈: 2382×1134mm / 650Wp, 부지 경계 2m, 행 사이 빈 간격 기본 1.32m.
EPC 기본 9억원/MW(DC), 평당 토지비 입력 지원.
공개자료 기반 사전검토로 인허가·계통 접속·실제 세대수·정밀 지형 및 배치를 확정하지 않습니다.
프로젝트는 각 기기의 브라우저에만 저장됩니다. 로그인·기기 간 동기화는 제공하지 않습니다.
GitHub 저장소에 회사·개인 프로젝트 입력자료나 비밀번호를 올리지 마세요.
