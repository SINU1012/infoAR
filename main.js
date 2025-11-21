import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.159.0/build/three.module.js";
import { ARButton } from "https://cdn.jsdelivr.net/npm/three@0.159.0/examples/jsm/webxr/ARButton.js";

const TARGET_URL = "https://www.infocus1.co.kr/";
const HOLOGRAM_SIZE = { width: 1.2, height: 0.72 };

const ui = {
  siteWindow: document.getElementById("site-window"),
  siteFrame: document.getElementById("site-frame"),
  message: document.getElementById("message"),
};

ui.siteFrame.src = TARGET_URL.replace("http://", "https://");

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

(async () => {
  const supported = await checkSupport();
  if (supported) {
    attemptAutoStart();
  } else {
    showMessage("이 기기에서는 AR이 지원되지 않습니다. iOS Safari 17+ 또는 Android Chrome에서 열어주세요.");
  }
})();

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
      showMessage("화면을 한 번 탭해 AR을 시작하세요.");
      waitForUserGesture();
      return false;
    }
    return false;
  }
}

function attemptAutoStart() {
  startAR();
}

function waitForUserGesture() {
  const handler = () => {
    window.removeEventListener("pointerdown", handler);
    startAR();
  };
  window.addEventListener("pointerdown", handler, { once: true });
  showMessage("화면을 한 번 탭해 AR을 시작하세요.");
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
  hideMessage();
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
  state.autoplacePending = true;
  waitForUserGesture();
  showMessage("AR 세션이 종료되었습니다. 다시 시작하려면 화면을 탭하세요.");
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

  ctx.strokeStyle = "rgba(90,240,255,0.35)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(60, canvas.height - 140);
  ctx.lineTo(canvas.width - 60, canvas.height - 140);
  ctx.stroke();

  ctx.strokeStyle = "rgba(122,240,201,0.35)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(80, 150);
  ctx.lineTo(canvas.width - 80, 200);
  ctx.lineTo(canvas.width - 120, 260);
  ctx.lineTo(120, 220);
  ctx.closePath();
  ctx.stroke();

  ctx.fillStyle = "rgba(90,240,255,0.22)";
  ctx.fillRect(70, 90, canvas.width - 140, 30);
  ctx.fillRect(70, 260, canvas.width - 180, 26);

  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

async function checkSupport() {
  if (!navigator.xr || !navigator.xr.isSessionSupported) {
    return false;
  }

  const supported = await navigator.xr.isSessionSupported("immersive-ar");
  return Boolean(supported);
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

function showMessage(text) {
  if (!ui.message) return;
  ui.message.textContent = text;
  ui.message.classList.remove("hidden");
}

function hideMessage() {
  if (!ui.message) return;
  ui.message.classList.add("hidden");
}

// Provide an ARButton for browsers that require the built-in element.
const helperButton = ARButton.createButton(renderer, {
  requiredFeatures: ["hit-test"],
  optionalFeatures: ["dom-overlay"],
  domOverlay: { root: document.body },
});
helperButton.style.display = "none";
document.body.appendChild(helperButton);
