import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.159.0/build/three.module.js";
import { ARButton } from "https://cdn.jsdelivr.net/npm/three@0.159.0/examples/jsm/webxr/ARButton.js";

const TARGET_URL = "https://www.infocus1.co.kr/";
const HOLOGRAM_SIZE = { width: 1.2, height: 0.72 };

const ui = {
  siteWindow: document.getElementById("site-window"),
  siteFrame: document.getElementById("site-frame"),
  unsupported: document.getElementById("unsupported"),
  status: document.getElementById("status-pill"),
};

ui.siteFrame.src = TARGET_URL.replace("http://", "https://");
setStatus("AR 준비 중...");

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  70,
  window.innerWidth / window.innerHeight,
  0.01,
  20
);

scene.add(new THREE.HemisphereLight(0xaaddee, 0x0b1623, 1.25));
const dirLight = new THREE.DirectionalLight(0x83faff, 0.35);
dirLight.position.set(0.8, 1.1, 0.2);
scene.add(dirLight);

const controller = renderer.xr.getController(0);
controller.addEventListener("select", onSelect);
scene.add(controller);

const reticle = new THREE.Mesh(
  new THREE.RingGeometry(0.08, 0.12, 40).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({
    color: 0x5af0ff,
    opacity: 0.85,
    transparent: true,
  })
);
reticle.matrixAutoUpdate = false;
reticle.visible = false;
scene.add(reticle);

const state = {
  session: null,
  hitTestSource: null,
  referenceSpace: null,
  hologram: null,
  autoplacePending: true,
};

const tempVec = new THREE.Vector3();
const tempPos = new THREE.Vector3();
const overlayEl = ui.siteWindow;

window.addEventListener("resize", onWindowResize);

checkSupport();
attemptAutoStart();

async function startAR() {
  if (!navigator.xr) {
    showUnsupported("이 기기는 WebXR AR을 지원하지 않습니다.");
    return false;
  }

  if (state.session) return true;

  try {
    const sessionInit = {
      requiredFeatures: ["hit-test"],
      optionalFeatures: ["dom-overlay"],
      domOverlay: { root: document.body },
    };

    const session = await navigator.xr.requestSession("immersive-ar", sessionInit);
    onSessionStarted(session);
    return true;
  } catch (err) {
    console.error("AR 세션 시작 실패", err);
    if (err && typeof err.message === "string" && err.message.toLowerCase().includes("gesture")) {
      state.needsGesture = true;
      setStatus("화면을 한 번 탭해 카메라를 켜주세요.");
      waitForUserGesture();
      return false;
    }
    showUnsupported("AR 세션을 시작할 수 없습니다. HTTPS 환경과 호환 기기를 확인하세요.");
    return false;
  }
}

function attemptAutoStart() {
  setStatus("카메라 권한 요청 중...");
  startAR();
}

function waitForUserGesture() {
  const handler = () => {
    window.removeEventListener("pointerdown", handler);
    setStatus("AR 시작 중...");
    startAR();
  };
  window.addEventListener("pointerdown", handler, { once: true });
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

async function onSessionStarted(session) {
  state.session = session;
  session.addEventListener("end", onSessionEnded);

  renderer.xr.setReferenceSpaceType("local");
  await renderer.xr.setSession(session);

  const viewerSpace = await session.requestReferenceSpace("viewer");
  state.referenceSpace = await session.requestReferenceSpace("local");
  state.hitTestSource = await session.requestHitTestSource({ space: viewerSpace });

  overlayEl.classList.add("hidden");
  setStatus("바닥을 인식 중... 기기 앞쪽을 천천히 움직여 주세요.");
  renderer.setAnimationLoop(onXRFrame);
}

function onSessionEnded() {
  state.hitTestSource = null;
  state.referenceSpace = null;
  state.session = null;

  reticle.visible = false;
  hideSiteWindow();
  if (state.hologram) {
    scene.remove(state.hologram);
    state.hologram = null;
  }
  renderer.setAnimationLoop(null);
  setStatus("AR 세션이 종료되었습니다. 다시 시작하려면 화면을 탭하세요.");
  state.autoplacePending = true;
  waitForUserGesture();
}

function onSelect() {
  if (!reticle.visible) return;
  placeHologramFromReticle();
}

function onXRFrame(time, frame) {
  const session = renderer.xr.getSession();
  if (!session) return;

  const referenceSpace = state.referenceSpace;
  const hitTestSource = state.hitTestSource;

  if (frame && hitTestSource && referenceSpace) {
    const hitTestResults = frame.getHitTestResults(hitTestSource);
    if (hitTestResults.length) {
      const pose = hitTestResults[0].getPose(referenceSpace);
      reticle.visible = true;
      if (pose) {
        reticle.matrix.fromArray(pose.transform.matrix);
      }
      if (state.autoplacePending) {
        placeHologramFromReticle();
        state.autoplacePending = false;
      }
    } else {
      reticle.visible = false;
    }
  }

  animateHologram(time);
  updateOverlay(screenCamera());
  renderer.render(scene, camera);
}

function placeHologramFromReticle() {
  if (!reticle.visible) return;

  if (!state.hologram) {
    state.hologram = createHologram();
    scene.add(state.hologram);
  }

  reticle.matrix.decompose(
    state.hologram.position,
    state.hologram.quaternion,
    state.hologram.scale
  );
  state.hologram.userData.baseY = state.hologram.position.y;
  showSiteWindow();
  setStatus("홈페이지를 둘러보세요. 패널을 탭하면 위치를 다시 잡습니다.");
}

function animateHologram(time = 0) {
  if (!state.hologram) return;
  const baseY = state.hologram.userData.baseY ?? state.hologram.position.y;
  const hover = Math.sin(time / 520) * 0.01 + 0.004;
  state.hologram.position.y = baseY + hover;

  const glow = state.hologram.userData.glow;
  if (glow) {
    glow.material.opacity = 0.22 + Math.sin(time / 380) * 0.07;
  }
}

function createHologram() {
  const group = new THREE.Group();

  const board = new THREE.Mesh(
    new THREE.PlaneGeometry(HOLOGRAM_SIZE.width, HOLOGRAM_SIZE.height),
    new THREE.MeshBasicMaterial({
      color: 0x0a111a,
      transparent: true,
      opacity: 0.82,
    })
  );
  board.renderOrder = 1;
  group.add(board);

  const border = new THREE.Mesh(
    new THREE.PlaneGeometry(HOLOGRAM_SIZE.width + 0.05, HOLOGRAM_SIZE.height + 0.05),
    new THREE.MeshBasicMaterial({
      color: 0x5af0ff,
      transparent: true,
      opacity: 0.25,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    })
  );
  border.position.z = -0.002;
  group.add(border);

  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(HOLOGRAM_SIZE.width + 0.25, HOLOGRAM_SIZE.height + 0.25),
    new THREE.MeshBasicMaterial({
      color: 0x5af0ff,
      transparent: true,
      opacity: 0.22,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    })
  );
  glow.position.z = -0.08;
  group.add(glow);
  group.userData.glow = glow;

  const textPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(HOLOGRAM_SIZE.width * 0.95, HOLOGRAM_SIZE.height * 0.95),
    new THREE.MeshBasicMaterial({
      map: makeLabelTexture(),
      transparent: true,
      alphaTest: 0.02,
    })
  );
  textPlane.position.z = 0.001;
  group.add(textPlane);

  const stand = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.02, 0.08, 24),
    new THREE.MeshBasicMaterial({ color: 0x0f1925 })
  );
  stand.position.y = -HOLOGRAM_SIZE.height / 2 - 0.04;
  group.add(stand);

  const baseGlow = new THREE.Mesh(
    new THREE.RingGeometry(0.08, 0.16, 40).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({
      color: 0x5af0ff,
      transparent: true,
      opacity: 0.32,
      blending: THREE.AdditiveBlending,
    })
  );
  baseGlow.position.y = stand.position.y - 0.04;
  group.add(baseGlow);

  return group;
}

function makeLabelTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 640;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#0c1421";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, "rgba(90,240,255,0.18)");
  gradient.addColorStop(1, "rgba(122,240,201,0.14)");
  ctx.fillStyle = gradient;
  ctx.fillRect(16, 16, canvas.width - 32, canvas.height - 32);

  ctx.strokeStyle = "rgba(90,240,255,0.4)";
  ctx.lineWidth = 4;
  ctx.strokeRect(32, 32, canvas.width - 64, canvas.height - 64);

  ctx.fillStyle = "#5bf0ff";
  ctx.font = "bold 70px 'Space Grotesk', 'Pretendard', sans-serif";
  ctx.fillText("InFocus AR Window", 60, 130);

  ctx.fillStyle = "#b6c7e0";
  ctx.font = "40px 'Space Grotesk', 'Pretendard', sans-serif";
  const text = "실제 사이트가 여기에 투사됩니다. 배치 후 패널을 터치해서 웹을 탐색하세요.";
  wrapText(ctx, text, 60, 210, canvas.width - 120, 48);

  ctx.fillStyle = "#89f0c9";
  ctx.font = "32px 'Space Grotesk', 'Pretendard', sans-serif";
  ctx.fillText("Tip: 패널을 다시 탭하면 위치를 옮길 수 있습니다.", 60, 300);

  ctx.strokeStyle = "rgba(90,240,255,0.35)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(60, canvas.height - 140);
  ctx.lineTo(canvas.width - 60, canvas.height - 140);
  ctx.stroke();

  ctx.font = "30px 'Space Grotesk', 'Pretendard', sans-serif";
  ctx.fillStyle = "#c9d7ed";
  ctx.fillText("AR이 활성화되면 상단 패널에 실제 사이트가 동기화됩니다.", 60, canvas.height - 90);

  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(" ");
  let line = "";
  for (let n = 0; n < words.length; n += 1) {
    const testLine = `${line}${words[n]} `;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && n > 0) {
      ctx.fillText(line, x, y);
      line = `${words[n]} `;
      y += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, y);
}

async function checkSupport() {
  if (!navigator.xr || !navigator.xr.isSessionSupported) {
    showUnsupported("이 브라우저는 WebXR을 지원하지 않습니다.");
    return;
  }

  const supported = await navigator.xr.isSessionSupported("immersive-ar");
  if (!supported) {
    showUnsupported("AR 모드를 지원하지 않는 기기/브라우저입니다.");
    return;
  }
  setStatus("카메라 권한을 허용해 주세요.");
}

function showUnsupported(message) {
  ui.unsupported.textContent = message;
  ui.unsupported.classList.remove("hidden");
  setStatus("AR을 지원하지 않는 환경입니다.");
}

function showSiteWindow() {
  overlayEl.classList.remove("hidden");
}

function hideSiteWindow() {
  overlayEl.classList.add("hidden");
}

function screenCamera() {
  const xrCam = renderer.xr.getCamera ? renderer.xr.getCamera() : null;
  if (xrCam && xrCam.cameras && xrCam.cameras.length) {
    return xrCam.cameras[0];
  }
  return xrCam || camera;
}

function updateOverlay(currentCamera) {
  if (!state.hologram || overlayEl.classList.contains("hidden")) return;
  tempPos.setFromMatrixPosition(state.hologram.matrixWorld);

  // Project AR anchor position to screen space for DOM overlay placement.
  const worldPos = tempPos.clone();
  const distance = currentCamera.position.distanceTo(worldPos);
  tempVec.copy(worldPos).project(currentCamera);

  const x = (tempVec.x * 0.5 + 0.5) * window.innerWidth;
  const y = (-tempVec.y * 0.5 + 0.5) * window.innerHeight;

  const scale = THREE.MathUtils.clamp(1 / Math.max(distance, 0.1), 0.35, 1.2);

  overlayEl.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px) scale(${scale})`;
}

function setStatus(text) {
  if (!ui.status) return;
  ui.status.textContent = text;
}

// Provide an ARButton for browsers that require the built-in element.
const helperButton = ARButton.createButton(renderer, {
  requiredFeatures: ["hit-test"],
  optionalFeatures: ["dom-overlay"],
  domOverlay: { root: document.body },
});
helperButton.style.display = "none";
document.body.appendChild(helperButton);
