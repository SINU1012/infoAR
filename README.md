# InFocus AR Hologram

주소에 접속하면 즉시 AR 세션을 시도하고, 바닥을 인식하면 InFocus 사이트가 홀로그램 패널처럼 떠서 보입니다. 가시적 UI/멘트 없이 바로 실행됩니다. 기기가 제스처를 요구하면 화면을 한 번 탭해 주세요.

## 실행 방법
- HTTPS 환경에서 열어야 합니다. 로컬에서 테스트할 땐 `npx http-server -S -C cert.pem -K key.pem .` 처럼 임시 인증서를 사용하거나, `npm create vite@latest`의 `--https` dev 서버를 활용하세요.
- 모바일 Chrome/Edge(Android) 또는 Safari 17+(iOS)에서 접속하면 자동으로 카메라 권한을 요청합니다. “제스처 필요”가 뜨면 화면을 한 번 탭하세요.
- 바닥이 인식되면 자동 배치합니다. 화면을 탭하면 위치를 다시 잡습니다. AR을 지원하지 않는 경우엔 자동으로 일반 iframe 뷰로 대체됩니다.

## 참고 및 한계
- `TARGET_URL`은 `main.js` 상단에서 변경할 수 있습니다. Mixed content를 피하기 위해 HTTP 주소는 자동으로 HTTPS로 치환합니다.
- 외부 사이트가 `X-Frame-Options`나 CSP로 iframe을 막아둔 경우 빈 화면이 보일 수 있습니다. 그런 경우 해당 사이트의 스크린샷 이미지를 대신 텍스처로 사용하거나, 동일 출처 프록시를 거쳐야 합니다.
- AR 세션이 종료되면 홀로그램과 사이트 패널이 함께 닫힙니다. 패널을 탭하면 위치를 다시 지정할 수 있습니다.

## 구조
- `index.html` – UI 스켈레톤과 WebXR 스크립트 로더
- `style.css` – AR/HUD 스타일, 홀로그래픽 느낌의 패널 연출
- `main.js` – WebXR AR hit-test 로직, 홀로그램 생성 및 패널 동기화
