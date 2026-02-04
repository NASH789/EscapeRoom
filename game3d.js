import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";
import { PointerLockControls } from "https://unpkg.com/three@0.160.0/examples/jsm/controls/PointerLockControls.js";

const canvas = document.getElementById("c");
const overlay = document.getElementById("overlay");
const startBtn = document.getElementById("startBtn");
const hint = document.getElementById("centerHint");
const inventoryEl = document.getElementById("inventory");
const photoNote = document.getElementById("photoNote");

const url = new URL(location.href);
const seed = (url.searchParams.get("g") || "").toUpperCase();
if (!seed) {
  overlay.querySelector("h1").textContent = "Missing game code";
  overlay.querySelector("p").textContent = "Go back to the main page and open Player 1/2 from there.";
}

const role = location.pathname.toLowerCase().includes("p2") ? "p2" : "p1";

// deterministic short code helper (seed-based)
function codeFrom(label) {
  const str = `${seed}::${label}`;
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  let x = (h >>> 0);
  for (let i = 0; i < 6; i++) {
    out += alphabet[x % alphabet.length];
    x = Math.floor(x / alphabet.length);
  }
  return out;
}

// simple local save
const saveKey = `haunted_${role}_${seed}`;
const state = JSON.parse(localStorage.getItem(saveKey) || "{}");
function save() { localStorage.setItem(saveKey, JSON.stringify(state)); }

// ---------- Three.js setup ----------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x08120e, 2, 22);

const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 60);
camera.position.set(0, 1.6, 6);

const controls = new PointerLockControls(camera, canvas);

window.addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// lighting (haunted vibe)
scene.add(new THREE.AmbientLight(0x88aa99, 0.25));
const moon = new THREE.DirectionalLight(0xcfe9ff, 0.7);
moon.position.set(4, 8, 2);
scene.add(moon);

const candle = new THREE.PointLight(0xffcc88, 0.9, 10, 2);
candle.position.set(-1.8, 1.2, 0.5);
scene.add(candle);

// room
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(18, 18),
  new THREE.MeshStandardMaterial({ color: 0x0f3a2a, roughness: 0.95, metalness: 0.0 })
);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

const wallMat = new THREE.MeshStandardMaterial({ color: 0x0b2a1f, roughness: 0.9 });
const room = new THREE.Mesh(new THREE.BoxGeometry(18, 6, 18), wallMat);
room.position.y = 3;
room.material.side = THREE.BackSide;
scene.add(room);

// spooky props
const table = new THREE.Mesh(
  new THREE.BoxGeometry(2.2, 0.12, 1.2),
  new THREE.MeshStandardMaterial({ color: 0x2b1d12, roughness: 0.95 })
);
table.position.set(-1.8, 0.9, 0.5);
scene.add(table);

const rug = new THREE.Mesh(
  new THREE.PlaneGeometry(3.6, 2.6),
  new THREE.MeshStandardMaterial({ color: 0x2a0f19, roughness: 1.0 })
);
rug.rotation.x = -Math.PI / 2;
rug.position.set(2.2, 0.01, 1.2);
scene.add(rug);

// locked door
const door = new THREE.Mesh(
  new THREE.BoxGeometry(1.8, 3.0, 0.12),
  new THREE.MeshStandardMaterial({ color: 0x1f120a, roughness: 0.8 })
);
door.position.set(0, 1.5, -8.94);
scene.add(door);

// ---------- Interactable items ----------
const interactables = [];
function addItem({ name, pos, color, label, onPick }) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 0.22, 0.22),
    new THREE.MeshStandardMaterial({ color, roughness: 0.6 })
  );
  mesh.position.copy(pos);
  mesh.userData = { name, label, onPick };
  scene.add(mesh);
  interactables.push(mesh);
  if (state[name] === "picked") mesh.visible = false;
  return mesh;
}

// Items differ per role (so each player has unique clue/object)
addItem({
  name: role === "p1" ? "bone_key" : "rust_key",
  pos: role === "p1" ? new THREE.Vector3(-1.8, 1.15, 0.5) : new THREE.Vector3(2.2, 0.18, 1.2),
  color: role === "p1" ? 0xe8e1d3 : 0xa89478,
  label: role === "p1" ? "Pick up: Bone Key" : "Pick up: Rusty Key",
  onPick: () => {
    // show draggable note after first pickup
    photoNote.style.display = "block";
    const secret = document.getElementById(role === "p1" ? "p1secret" : "p2secret");
    secret.textContent = codeFrom(role === "p1" ? "P1_CLUE" : "P2_CLUE");
  }
});

addItem({
  name: "candle",
  pos: new THREE.Vector3(-2.3, 1.05, 0.2),
  color: 0xffcc88,
  label: "Pick up: Candle",
  onPick: () => {}
});

// Inventory UI
const inventory = state.inventory || [];
state.inventory = inventory;

function renderInventory() {
  inventoryEl.innerHTML = "";
  const max = 6;
  for (let i = 0; i < max; i++) {
    const slot = document.createElement("div");
    slot.className = "slot";
    const item = inventory[i];
    slot.innerHTML = item ? `<small>${item}</small>` : `<small>—</small>`;
    inventoryEl.appendChild(slot);
  }
}
renderInventory();

// Raycast + click
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2(0, 0);

function setHint(text, show = true) {
  hint.textContent = text;
  hint.style.display = show ? "block" : "none";
}

function pick(mesh) {
  const { name, onPick } = mesh.userData;
  mesh.visible = false;
  state[name] = "picked";
  if (!inventory.includes(name)) inventory.push(name);
  save();
  renderInventory();
  onPick?.();

  // Door rule (prototype): open if you have both keys by “sharing” clue manually
  // For now: each player can open only after collecting their key AND typing partner code (later we add a keypad)
}

// Hover hint
function updateInteractHint() {
  if (!controls.isLocked) { setHint("", false); return; }
  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObjects(interactables.filter(m => m.visible));
  if (hits.length) {
    setHint(`${hits[0].object.userData.label} (click)`, true);
  } else {
    setHint("", false);
  }
}

window.addEventListener("click", () => {
  if (!controls.isLocked) return;
  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObjects(interactables.filter(m => m.visible));
  if (hits.length) pick(hits[0].object);
});

// Movement
const keys = { w:false, a:false, s:false, d:false };
window.addEventListener("keydown", (e) => {
  if (e.code === "KeyW") keys.w = true;
  if (e.code === "KeyA") keys.a = true;
  if (e.code === "KeyS") keys.s = true;
  if (e.code === "KeyD") keys.d = true;
});
window.addEventListener("keyup", (e) => {
  if (e.code === "KeyW") keys.w = false;
  if (e.code === "KeyA") keys.a = false;
  if (e.code === "KeyS") keys.s = false;
  if (e.code === "KeyD") keys.d = false;
});

let vel = new THREE.Vector3();
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  if (controls.isLocked) {
    const speed = 3.2;
    vel.set(0,0,0);
    if (keys.w) vel.z -= 1;
    if (keys.s) vel.z += 1;
    if (keys.a) vel.x -= 1;
    if (keys.d) vel.x += 1;
    vel.normalize().multiplyScalar(speed * dt);

    controls.moveRight(vel.x);
    controls.moveForward(vel.z);

    // keep within room bounds
    camera.position.x = THREE.MathUtils.clamp(camera.position.x, -8.2, 8.2);
    camera.position.z = THREE.MathUtils.clamp(camera.position.z, -8.2, 8.2);

    // candle flicker
    candle.intensity = 0.85 + Math.sin(performance.now() * 0.01) * 0.08;
  }

  updateInteractHint();
  renderer.render(scene, camera);
}
animate();

startBtn?.addEventListener("click", () => {
  overlay.style.display = "none";
  overlay.style.pointerEvents = "none";

  canvas.requestPointerLock?.();
  controls.lock();
});

controls.addEventListener("unlock", () => {
  overlay.style.display = "grid";
  overlay.style.pointerEvents = "auto";
});

// Draggable photo/letter that reveals code when moved
let dragging = false, ox = 0, oy = 0;
photoNote.addEventListener("mousedown", (e) => {
  dragging = true;
  const r = photoNote.getBoundingClientRect();
  ox = e.clientX - r.left;
  oy = e.clientY - r.top;
});
window.addEventListener("mouseup", () => dragging = false);
window.addEventListener("mousemove", (e) => {
  if (!dragging) return;
  photoNote.style.left = (e.clientX - ox) + "px";
  photoNote.style.top = (e.clientY - oy) + "px";
  photoNote.style.right = "auto";
  photoNote.style.bottom = "auto";

  // reveal secret once you move it far enough (cute “aha”)
  const secret = photoNote.querySelector(".secret");
  secret.style.display = "block";
});
