# InFocus AR Hologram

간단한 WebXR AR 페이지입니다. 모바일 브라우저에서 카메라를 켜고 바닥을 인식한 뒤 탭하면 InFocus 사이트가 홀로그램 패널처럼 떠서 보입니다.

## 실행 방법
- HTTPS 환경에서 열어야 합니다. 로컬에서 테스트할 땐 `npx http-server -S -C cert.pem -K key.pem .` 처럼 임시 인증서를 사용하거나, `npm create vite@latest`의 `--https` dev 서버를 활용하세요.
- 모바일 Chrome/Edge(Android) 또는 Safari 17+(iOS)에서 접속 후 `AR 시작` 버튼을 누르면 카메라 권한을 요청합니다.
- 바닥에 나타난 링 reticle 위에서 탭하면 홀로그램 창이 배치되고, 상단 패널의 iframe에서 실제 사이트가 로드됩니다.

## 참고 및 한계
- `TARGET_URL`은 `main.js` 상단에서 변경할 수 있습니다. Mixed content를 피하기 위해 HTTP 주소는 자동으로 HTTPS로 치환합니다.
- 외부 사이트가 `X-Frame-Options`나 CSP로 iframe을 막아둔 경우 빈 화면이 보일 수 있습니다. 그런 경우 해당 사이트의 스크린샷 이미지를 대신 텍스처로 사용하거나, 동일 출처 프록시를 거쳐야 합니다.
- AR 세션이 종료되면 홀로그램과 사이트 패널이 함께 닫힙니다. 패널을 탭하면 위치를 다시 지정할 수 있습니다.

## 구조
- `index.html` – UI 스켈레톤과 WebXR 스크립트 로더
- `style.css` – AR/HUD 스타일, 홀로그래픽 느낌의 패널 연출
- `main.js` – WebXR AR hit-test 로직, 홀로그램 생성 및 패널 동기화
