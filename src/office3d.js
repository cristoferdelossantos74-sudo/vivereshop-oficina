// Oficina 3D con Three.js — liviana para laptops sencillas y teléfonos
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { STATE_INFO, ROLES, avatarOf } from './agents.js';

const V = (x, z, y = 0) => new THREE.Vector3(x, y, z);
const CORR = -1.2; // pasillo principal
const ROW_Z = [-7, -3.5, 2.6, 6.1];
const COL_X = [0, 2.6, 5.2, 7.8, 10.4];

const matCache = new Map();
function mat(color, opts = {}) {
  const k = color + JSON.stringify(opts);
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshLambertMaterial({ color, ...opts }));
  return matCache.get(k);
}
// Geometrías compartidas (menos memoria y menos trabajo para la tarjeta de video)
const geoCache = new Map();
const G = (k, f) => { if (!geoCache.has(k)) geoCache.set(k, f()); return geoCache.get(k); };
const boxG = (w, h, d) => G(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
const cylG = (a, b, h, s = 12) => G(`y${a},${b},${h},${s}`, () => new THREE.CylinderGeometry(a, b, h, s));
const sphG = (r, ws = 14, hs = 10, ps = 0, pl = Math.PI * 2, ts = 0, tl = Math.PI) => G(`s${r},${ws},${hs},${ps},${pl},${ts},${tl}`, () => new THREE.SphereGeometry(r, ws, hs, ps, pl, ts, tl));
const capG = (r, l, cs = 4, rs = 10) => G(`c${r},${l},${cs},${rs}`, () => new THREE.CapsuleGeometry(r, l, cs, rs));

function box(w, h, d, color, x = 0, y = 0, z = 0, opts) {
  const m = new THREE.Mesh(boxG(w, h, d), mat(color, opts));
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
  return m;
}
function cyl(rt, rb, h, color, x = 0, y = 0, z = 0, seg = 12) {
  const m = new THREE.Mesh(cylG(rt, rb, h, seg), mat(color));
  m.position.set(x, y, z); m.castShadow = true;
  return m;
}

/**
 * Hornea un grupo: une todas sus piezas en muy pocas mallas.
 * Las piezas de color sólido se juntan en UNA sola malla con colores por vértice.
 * Esto baja las llamadas de dibujo de cientos a unas pocas (clave en laptops sencillas).
 */
const vcLambert = new THREE.MeshLambertMaterial({ vertexColors: true });
let toonGrad = null;
function toonMat() {
  if (!toonGrad) {
    toonGrad = new THREE.DataTexture(new Uint8Array([110, 190, 255]), 3, 1, THREE.RedFormat);
    toonGrad.minFilter = toonGrad.magFilter = THREE.NearestFilter; toonGrad.needsUpdate = true;
  }
  return new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGrad });
}
const vcToon = toonMat();
const _inv = new THREE.Matrix4(), _m = new THREE.Matrix4();
function bake(root, { toon = false, keep = [] } = {}) {
  root.updateMatrixWorld(true);
  _inv.copy(root.matrixWorld).invert();
  const buckets = new Map();
  const pickData = root.userData.pick;
  root.traverse((o) => {
    if (!o.isMesh || !o.visible || keep.includes(o)) return;
    let p = o.parent; while (p && p !== root) { if (keep.includes(p)) return; p = p.parent; }
    const m = o.material;
    const solid = (m.isMeshLambertMaterial || m.isMeshToonMaterial) && !m.map && !m.transparent && !m.vertexColors && (!m.emissive || m.emissive.getHex() === 0) && !m.flatShading;
    const key = solid ? 'vc' : m.uuid;
    if (!buckets.has(key)) buckets.set(key, { mat: solid ? (toon ? vcToon : vcLambert) : m, geos: [], cast: false, recv: false, vc: solid });
    const b = buckets.get(key);
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const n of Object.keys(g.attributes)) if (n !== 'position' && n !== 'normal' && (solid || n !== 'uv')) g.deleteAttribute(n);
    g.applyMatrix4(_m.multiplyMatrices(_inv, o.matrixWorld));
    if (solid) {
      const c = m.color, n = g.attributes.position.count, arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    }
    b.geos.push(g); b.cast ||= o.castShadow; b.recv ||= o.receiveShadow;
  });
  // quitar piezas viejas (menos las que se conservan)
  [...root.children].forEach((c) => { if (!keep.includes(c)) root.remove(c); });
  for (const b of buckets.values()) {
    const merged = mergeGeometries(b.geos, false);
    b.geos.forEach((g) => g.dispose());
    const mesh = new THREE.Mesh(merged, b.mat);
    mesh.castShadow = b.cast; mesh.receiveShadow = b.recv;
    if (pickData) mesh.userData.pick = pickData;
    root.add(mesh);
  }
  return root;
}
function freeze(obj) { obj.updateMatrixWorld(true); obj.traverse((o) => { o.matrixAutoUpdate = false; }); }

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d'); draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 2;
  t.userData = { canvas: c, ctx };
  return t;
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
const FONT = '"Nunito", "Segoe UI", system-ui, sans-serif';

// ---------------- Personaje (estilo muñequito, cabeza grande) ----------------
const HIP = 0.62;
const SIT_Y = 0.565 - HIP, SOFA_Y = 0.5 - HIP;
const shade = (hex, k) => { const c = new THREE.Color(hex); c.lerp(new THREE.Color(k > 0 ? '#ffffff' : '#000000'), Math.abs(k)); return '#' + c.getHexString(); };
const blobGeo = new THREE.CircleGeometry(0.38, 20);
const blobMat = new THREE.MeshBasicMaterial({ color: '#0b3d20', transparent: true, opacity: 0.16, depthWrite: false });

function makeCharacter(shirt, av) {
  const f = av.gender === 'f';
  const skin = av.skin, hairC = av.hairColor;
  const g = new THREE.Group();
  const P = (geo, color, x, y, z, parent, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat(color)); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.rotation.set(rx, ry, rz); parent.add(m); return m;
  };
  const top = av.suit ? '#1e293b' : shirt;
  const pants = f ? skin : (av.suit ? '#1e293b' : '#334155');
  const shoe = f ? shade(shirt, -0.35) : '#1f2937';

  // Piernas
  const leg = (x) => {
    const p = new THREE.Group(); p.position.set(x, HIP, 0);
    P(capG(0.075, 0.42), pants, 0, -0.29, 0, p);
    if (f) P(capG(0.078, 0.12), shade(shirt, -0.25), 0, -0.47, 0, p); // botines
    P(sphG(0.085, 12, 8), shoe, 0, -0.58, 0.04, p, 1, 0.6, 1.5);
    g.add(p); return p;
  };
  const lLeg = leg(-0.1), rLeg = leg(0.1);

  // Cuerpo
  const torso = new THREE.Group(); torso.position.y = HIP; g.add(torso);
  P(capG(0.2, 0.26, 6, 14), top, 0, 0.29, 0, torso, f ? 0.9 : 1, 1, f ? 0.88 : 1);
  if (f) {
    P(cylG(0.17, 0.3, 0.32, 16), shade(shirt, -0.12), 0, 0.02, 0, torso);   // falda / vestido
    P(cylG(0.172, 0.172, 0.04, 16), shade(shirt, -0.4), 0, 0.17, 0, torso); // correa
  } else {
    P(cylG(0.2, 0.205, 0.16, 16), pants, 0, 0.04, 0, torso);
    P(cylG(0.205, 0.205, 0.035, 16), '#111827', 0, 0.12, 0, torso);
  }
  if (av.suit) {
    P(boxG(0.13, 0.26, 0.02), '#ffffff', 0, 0.36, 0.185, torso, 1, 1, 1, -0.12);
    P(boxG(0.045, 0.2, 0.02), shirt, 0, 0.34, 0.2, torso, 1, 1, 1, -0.12);
  } else {
    P(cylG(0.09, 0.11, 0.05, 12), shade(top, 0.25), 0, 0.53, 0, torso); // cuello de camisa
  }
  P(cylG(0.06, 0.065, 0.1, 10), skin, 0, 0.58, 0, torso); // cuello

  // Cabeza
  const head = new THREE.Group(); head.position.y = 1.43; g.add(head);
  P(sphG(0.24, 20, 16), skin, 0, 0, 0, head, 1, 0.97, 0.95);
  P(sphG(0.05, 10, 8), skin, -0.235, -0.01, 0, head, 0.6, 1, 1);
  P(sphG(0.05, 10, 8), skin, 0.235, -0.01, 0, head, 0.6, 1, 1);
  const eye = (x) => {
    P(sphG(0.048, 12, 10), '#ffffff', x, 0.0, 0.2, head, 1, f ? 1.15 : 1, 0.5);
    P(sphG(0.032, 12, 10), '#2b1a10', x, -0.004, 0.218, head, 1, f ? 1.15 : 1.05, 0.5);
    P(sphG(0.011, 8, 6), '#ffffff', x + 0.012, 0.014, 0.232, head);
    if (f) P(boxG(0.085, 0.016, 0.02), '#111111', x, 0.052, 0.21, head, 1, 1, 1, -0.3, 0, x < 0 ? 0.15 : -0.15); // pestañas
    P(boxG(0.075, 0.016, 0.02), shade(hairC, -0.1), x, f ? 0.092 : 0.085, 0.208, head, 1, 1, 1, -0.3, 0, x < 0 ? -0.12 : 0.12); // cejas
  };
  eye(-0.085); eye(0.085);
  P(sphG(0.024, 8, 6), shade(skin, -0.12), 0, -0.035, 0.232, head);
  const mouth = new THREE.Mesh(G('mouth', () => new THREE.TorusGeometry(0.036, 0.009, 6, 12, Math.PI)), mat(f ? '#db2777' : '#8b3a1a'));
  mouth.position.set(0, -0.08, 0.215); mouth.rotation.set(-0.25, 0, Math.PI); head.add(mouth);
  P(sphG(0.036, 10, 8), '#fb7185', -0.135, -0.055, 0.185, head, 1, 0.7, 0.35);
  P(sphG(0.036, 10, 8), '#fb7185', 0.135, -0.055, 0.185, head, 1, 0.7, 0.35);

  // Cabello
  const H = (geo, x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) => P(geo, hairC, x, y, z, head, sx, sy, sz, rx, ry, rz);
  const cap = (tl) => H(sphG(0.256, 20, 14, 0, Math.PI * 2, 0, Math.PI * tl), 0, 0.015, -0.012, 1, 1, 1, -0.38);
  if (f) {
    cap(0.6);
    H(sphG(0.16, 14, 10), -0.05, 0.155, 0.16, 1.45, 0.5, 0.7, 0.2, 0, -0.35); // flequillo
    H(sphG(0.12, 12, 10), 0.1, 0.165, 0.15, 1.2, 0.45, 0.7, 0.2, 0, 0.3);
    H(capG(0.06, 0.22), -0.205, -0.11, 0.06, 1, 1, 1, 0, 0, 0.1);           // mechones a los lados
    H(capG(0.06, 0.22), 0.205, -0.11, 0.06, 1, 1, 1, 0, 0, -0.1);
    if (av.hairStyle === 'largo') H(capG(0.21, 0.36, 6, 14), 0, -0.25, -0.11, 1.1, 1, 0.55);
    if (av.hairStyle === 'cola') {
      P(sphG(0.045, 10, 8), shirt, 0, 0.1, -0.245, head);
      H(capG(0.085, 0.3, 4, 12), 0, -0.13, -0.3, 1, 1, 1, 0.35);
    }
    if (av.hairStyle === 'mono') {
      H(sphG(0.13, 14, 12), 0, 0.23, -0.12, 1, 0.9, 1);
      P(cylG(0.11, 0.11, 0.03, 14), shirt, 0, 0.2, -0.12, head, 1, 1, 1, 0.35);
    }
    if (av.hairStyle === 'rizos') {
      for (let k = 0; k < 14; k++) {
        const a = (k / 14) * Math.PI * 2; const r = 0.24;
        H(sphG(0.09, 10, 8), Math.sin(a) * r, 0.08 + (k % 2) * 0.06, Math.cos(a) * r * 0.8 - 0.06, 1, 1, 1);
      }
      H(capG(0.19, 0.18, 4, 12), 0, -0.2, -0.12, 1.15, 1, 0.6);
    }
    P(sphG(0.022, 8, 6), '#fbbf24', -0.245, -0.075, 0.02, head); // aretes
    P(sphG(0.022, 8, 6), '#fbbf24', 0.245, -0.075, 0.02, head);
    P(sphG(0.04, 10, 8), shirt, 0.17, 0.17, 0.12, head, 1.3, 0.8, 0.6); // ganchito
  } else {
    if (av.hairStyle === 'afro') {
      H(sphG(0.31, 18, 14), 0, 0.09, -0.04, 1, 0.85, 0.95);
    } else {
      cap(av.hairStyle === 'rapado' ? 0.45 : 0.52);
      if (av.hairStyle === 'corto') H(sphG(0.13, 12, 10), 0.04, 0.17, 0.15, 1.6, 0.5, 0.8, 0.25, 0, 0.25);
      if (av.hairStyle === 'tupe') H(sphG(0.14, 12, 10), 0, 0.2, 0.13, 1.55, 0.6, 1.0, 0.45);
      H(boxG(0.03, 0.09, 0.05), 0.235, 0.03, 0.06, 1, 1, 1); H(boxG(0.03, 0.09, 0.05), -0.235, 0.03, 0.06, 1, 1, 1); // patillas
    }
  }

  // Brazos (manga + antebrazo + mano)
  const sh = f ? 0.245 : 0.275;
  const arm = (x) => {
    const p = new THREE.Group(); p.position.set(x, HIP + 0.46, 0);
    P(sphG(0.075, 10, 8), top, 0, 0, 0, p);
    P(capG(0.068, 0.16), top, 0, -0.12, 0, p);
    P(capG(0.055, 0.2), av.suit ? top : skin, 0, -0.32, 0, p);
    P(sphG(0.062, 10, 8), skin, 0, -0.47, 0.01, p);
    g.add(p); return p;
  };
  const lArm = arm(-sh), rArm = arm(sh);

  // Hornear cada parte móvil en 1 sola malla
  [lLeg, rLeg, torso, head, lArm, rArm].forEach((part) => { bake(part, { toon: true }); part.children.forEach((m) => { m.castShadow = true; }); });

  const cup = new THREE.Group();
  cup.add(new THREE.Mesh(cylG(0.05, 0.04, 0.11, 10), mat('#ffffff')));
  const coffee = new THREE.Mesh(cylG(0.045, 0.045, 0.01, 10), mat('#5b3a1e')); coffee.position.y = 0.05; cup.add(coffee);
  bake(cup);
  cup.position.set(0, -0.52, 0.06); cup.visible = false; rArm.add(cup);

  const blob = new THREE.Mesh(blobGeo, blobMat); blob.rotation.x = -Math.PI / 2; blob.position.y = 0.02; g.add(blob);
  return { g, lLeg, rLeg, lArm, rArm, head, torso, cup, blob };
}

function labelSprite() {
  const tex = canvasTex(512, 128, () => {});
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(2.7, 0.675, 1); s.renderOrder = 10; s.position.y = 2.2;
  s.userData.tex = tex;
  return s;
}
function drawLabel(sprite, text, color, sub) {
  const { ctx, canvas } = sprite.userData.tex.userData;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = `800 44px ${FONT}`;
  const w = Math.min(500, ctx.measureText(text).width + 48);
  const x = (512 - w) / 2;
  ctx.fillStyle = 'rgba(255,255,255,0.94)'; roundRect(ctx, x, 14, w, 72, 36); ctx.fill();
  ctx.lineWidth = 6; ctx.strokeStyle = color; ctx.stroke();
  ctx.fillStyle = '#0f1f17'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 52, 470);
  if (sub) { ctx.font = `700 26px ${FONT}`; ctx.fillStyle = '#0f7a37'; ctx.fillText(sub, 256, 108, 470); }
  sprite.userData.tex.needsUpdate = true;
}

// Calidad: "alta" en PCs buenas, "baja" (ligera) en teléfonos y laptops sencillas
export function getQuality() {
  try { const q = localStorage.getItem('viverehq-quality'); if (q) return q; } catch {}
  const cores = navigator.hardwareConcurrency || 4, mem = navigator.deviceMemory || 8;
  const mobile = /Android|iPhone|iPad|Mobi/i.test(navigator.userAgent);
  return mobile || cores <= 4 || mem <= 4 ? 'baja' : 'alta';
}

// =================================================================
export function createOffice(container, { onPick } = {}) {
  const quality = getQuality();
  let hi = quality === 'alta';
  const dpr = window.devicePixelRatio || 1;
  const renderer = new THREE.WebGLRenderer({ antialias: hi, powerPreference: 'high-performance', stencil: false });
  renderer.setPixelRatio(Math.min(dpr, hi ? 1.75 : 1.25));
  renderer.shadowMap.enabled = hi; renderer.shadowMap.type = THREE.PCFShadowMap; renderer.shadowMap.autoUpdate = true;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const stat = new THREE.Group(); scene.add(stat); // todo lo que no se mueve
  scene.background = new THREE.Color('#dff3e6');
  scene.fog = new THREE.Fog('#dff3e6', 40, 75);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.maxPolarAngle = 1.32; controls.minPolarAngle = 0.25;
  controls.minDistance = 5; controls.maxDistance = 48;
  controls.target.set(-0.5, 0, -0.5);

  // Luces
  const hemi = new THREE.HemisphereLight('#ffffff', '#b7d7c2', 1.6); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff6e5', 1.7);
  sun.position.set(10, 22, 14); sun.castShadow = hi;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -18, right: 18, top: 16, bottom: -16, near: 1, far: 60 });
  sun.shadow.bias = -0.0008;
  scene.add(sun);

  const pickables = [];
  const pick = (obj, data) => { obj.traverse((o) => { o.userData.pick = data; }); pickables.push(obj); };

  // ---------------- Edificio ----------------
  const floor = box(25, 0.2, 19, '#f3efe7', 0, -0.1, 0); floor.castShadow = false; stat.add(floor);
  const wood = box(15, 0.02, 13, '#e8d9c0', 5.5, 0.01, -2.5); wood.castShadow = false; stat.add(wood);
  const ceoCarpet = box(9.6, 0.02, 5.8, '#cfe9d8', -7.2, 0.012, -6); ceoCarpet.castShadow = false; stat.add(ceoCarpet);
  const rug = new THREE.Mesh(new THREE.CircleGeometry(2.6, 32), mat('#b9e4c9')); rug.rotation.x = -Math.PI / 2; rug.position.set(-8.6, 0.015, 6.2); rug.receiveShadow = true; stat.add(rug);

  // Paredes (casa de muñecas: solo fondo e izquierda)
  stat.add(box(25, 3.4, 0.25, '#ffffff', 0, 1.7, -9.5));
  stat.add(box(0.25, 3.4, 19, '#ffffff', -12.5, 1.7, 0));
  stat.add(box(25, 0.18, 0.3, '#16a34a', 0, 3.45, -9.5));
  stat.add(box(0.3, 0.18, 19, '#16a34a', -12.5, 3.45, 0));
  // Ventanas
  for (let i = 0; i < 4; i++) {
    const w = box(2.2, 1.5, 0.05, '#bfe3ff', 1.4 + i * 3, 1.9, -9.36, { emissive: '#7cc4f5', emissiveIntensity: 0.35 });
    w.castShadow = false; stat.add(w);
  }
  for (let i = 0; i < 2; i++) {
    const w = box(0.05, 1.5, 2.4, '#bfe3ff', -12.36, 1.9, 2 + i * 3.6, { emissive: '#7cc4f5', emissiveIntensity: 0.35 });
    w.castShadow = false; stat.add(w);
  }
  // Logo
  const logoTex = canvasTex(1536, 256, (ctx, w, h) => {
    ctx.fillStyle = '#ffffff'; roundRect(ctx, 0, 0, w, h, 40); ctx.fill();
    ctx.textBaseline = 'middle'; ctx.font = `900 150px ${FONT}`;
    const a1 = 'Vivere', a2 = 'Shop'; const w1 = ctx.measureText(a1).width, w2 = ctx.measureText(a2).width;
    const x0 = (w - w1 - w2) / 2;
    ctx.fillStyle = '#16a34a'; ctx.fillText(a1, x0, h / 2 + 8);
    ctx.fillStyle = '#0f1f17'; ctx.fillText(a2, x0 + w1, h / 2 + 8);
  });
  const logo = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 0.9), new THREE.MeshBasicMaterial({ map: logoTex, transparent: true }));
  logo.position.set(6, 2.9, -9.36); stat.add(logo);

  // Oficina CEO (vidrio)
  const glassMat = new THREE.MeshLambertMaterial({ color: '#a7e3c0', transparent: true, opacity: 0.22, depthWrite: false });
  const glass = (w, d, x, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, 2.6, d), glassMat); m.position.set(x, 1.3, z); stat.add(m); };
  glass(7.4, 0.06, -8.8, -3); // frente (puerta a la derecha)
  glass(0.06, 6.4, -2.5, -6.3);
  stat.add(box(10, 0.08, 0.1, '#16a34a', -7.5, 2.62, -3));
  stat.add(box(0.1, 0.08, 6.4, '#16a34a', -2.5, 2.62, -6.3));
  const ceoSign = canvasTex(512, 96, (ctx, w, h) => {
    ctx.fillStyle = '#16a34a'; roundRect(ctx, 0, 0, w, h, 30); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = `900 50px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('👑 OFICINA CEO', w / 2, h / 2 + 2);
  });
  const ceoPlate = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.45), new THREE.MeshBasicMaterial({ map: ceoSign, transparent: true }));
  ceoPlate.position.set(-8.6, 2.95, -2.94); stat.add(ceoPlate);

  // Mesa de juntas + pantalla grande
  stat.add(box(1.6, 0.08, 3.4, '#ffffff', -7, 0.76, -6.1));
  stat.add(box(0.9, 0.72, 2.2, '#16a34a', -7, 0.36, -6.1));
  const screenTex = canvasTex(1024, 576, () => {});
  const screenFrame = box(4.2, 2.4, 0.12, '#0f172a', -7, 1.95, -9.28);
  scene.add(screenFrame);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(3.95, 2.18), new THREE.MeshBasicMaterial({ map: screenTex }));
  screen.position.set(-7, 1.95, -9.21); scene.add(screen);
  pick(screen, { type: 'screen' }); pick(screenFrame, { type: 'screen' });
  let screenOn = false;
  function drawScreen(areas = []) {
    const { ctx, canvas } = screenTex.userData; const w = canvas.width, h = canvas.height;
    if (!screenOn) {
      const gr = ctx.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#0b1f14'); gr.addColorStop(1, '#0f3b22');
      ctx.fillStyle = gr; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#22c55e'; ctx.font = `900 64px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('⏻  Toca para encender', w / 2, h / 2 - 20);
      ctx.fillStyle = '#86efac'; ctx.font = `700 34px ${FONT}`; ctx.fillText('Dashboard VivereShop', w / 2, h / 2 + 50);
      screenTex.needsUpdate = true; return;
    }
    ctx.fillStyle = '#f6faf7'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#16a34a'; ctx.fillRect(0, 0, w, 80);
    ctx.fillStyle = '#fff'; ctx.font = `900 42px ${FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText('Dashboard VivereShop', 30, 42);
    const cols = 4; const cw = (w - 60) / cols;
    areas.slice(0, 8).forEach((a, i) => {
      const x = 30 + (i % cols) * cw, y = 110 + Math.floor(i / cols) * 220;
      ctx.fillStyle = '#fff'; roundRect(ctx, x + 6, y, cw - 12, 200, 24); ctx.fill();
      ctx.fillStyle = a.color || '#16a34a'; roundRect(ctx, x + 6, y, cw - 12, 14, 7); ctx.fill();
      ctx.textAlign = 'center'; ctx.font = `64px ${FONT}`; ctx.fillStyle = '#000'; ctx.fillText(a.emoji || '📁', x + cw / 2, y + 85);
      ctx.font = `800 28px ${FONT}`; ctx.fillStyle = '#0f1f17'; ctx.fillText((a.name || '').slice(0, 18), x + cw / 2, y + 160);
    });
    screenTex.needsUpdate = true;
  }
  drawScreen();

  // Asientos de los socios
  const MEMBER_SEATS = [
    { x: -7, z: -4.0, yaw: Math.PI },
    { x: -8.15, z: -5.5, yaw: Math.PI / 2 },
    { x: -5.85, z: -5.5, yaw: -Math.PI / 2 },
    { x: -8.15, z: -6.8, yaw: Math.PI / 2 },
    { x: -5.85, z: -6.8, yaw: -Math.PI / 2 }
  ];
  MEMBER_SEATS.forEach((s) => stat.add(makeChair(s.x, s.z, s.yaw, '#0f172a')));

  // Zona café
  stat.add(box(0.9, 1.0, 3.6, '#ffffff', -11.8, 0.5, 0.4));
  stat.add(box(0.95, 0.06, 3.7, '#16a34a', -11.8, 1.02, 0.4));
  const machine = new THREE.Group();
  machine.add(box(0.5, 0.6, 0.45, '#1f2937', 0, 0.3, 0));
  machine.add(box(0.2, 0.08, 0.05, '#ef4444', 0, 0.45, 0.24, { emissive: '#ef4444', emissiveIntensity: 0.8 }));
  machine.position.set(-11.8, 1.05, -0.6); stat.add(machine);
  for (let i = 0; i < 3; i++) stat.add(cyl(0.05, 0.04, 0.11, '#ffffff', -11.7, 1.11, 0.4 + i * 0.25, 10));
  const cafeTex = canvasTex(512, 128, (ctx, w, h) => {
    ctx.fillStyle = '#16a34a'; roundRect(ctx, 0, 0, w, h, 40); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = `900 64px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('☕ Cafecito', w / 2, h / 2 + 4);
  });
  const cafe = new THREE.Mesh(new THREE.PlaneGeometry(2, 0.5), new THREE.MeshBasicMaterial({ map: cafeTex, transparent: true }));
  cafe.position.set(-12.36, 2.4, 0.4); cafe.rotation.y = Math.PI / 2; stat.add(cafe);
  // Sofás
  const sofa = (x, z, yaw, len) => {
    const g = new THREE.Group();
    g.add(box(len, 0.42, 0.85, '#16a34a', 0, 0.21, 0));
    g.add(box(len, 0.6, 0.22, '#15803d', 0, 0.62, -0.34));
    g.add(box(0.2, 0.55, 0.85, '#15803d', -len / 2, 0.38, 0));
    g.add(box(0.2, 0.55, 0.85, '#15803d', len / 2, 0.38, 0));
    g.position.set(x, 0, z); g.rotation.y = yaw; stat.add(g);
  };
  sofa(-11.6, 5.7, Math.PI / 2, 3.4);
  sofa(-8.2, 8.75, Math.PI, 3.4);
  stat.add(box(1.2, 0.35, 0.7, '#ffffff', -9.4, 0.18, 6.6));
  // Pista de baile
  const floorTex = canvasTex(256, 256, () => {});
  const danceFloor = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshBasicMaterial({ map: floorTex }));
  danceFloor.rotation.x = -Math.PI / 2; danceFloor.position.set(-5.4, 0.03, 3.1); scene.add(danceFloor);
  function drawFloor(t, on) {
    const { ctx } = floorTex.userData;
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      ctx.fillStyle = on ? `hsl(${((t * 0.6 + (i * 4 + j) * 0.13) % 1) * 360},90%,${55 + 8 * Math.sin(t * 8 + i + j)}%)` : ((i + j) % 2 ? '#334155' : '#3f4d63');
      ctx.fillRect(i * 64 + 2, j * 64 + 2, 60, 60);
    }
    floorTex.needsUpdate = true;
  }
  drawFloor(0, false);
  const disco = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35, 1), new THREE.MeshLambertMaterial({ color: '#e5e7eb', emissive: '#94a3b8', emissiveIntensity: 0.4, flatShading: true }));
  disco.position.set(-5.4, 3.0, 3.1); disco.visible = false; scene.add(disco);
  const discoString = box(0.02, 0.5, 0.02, '#64748b', -5.4, 3.4, 3.1); discoString.visible = false; scene.add(discoString);

  // Plantas
  const plant = (x, z, s = 1) => {
    const g = new THREE.Group();
    g.add(cyl(0.22 * s, 0.17 * s, 0.4 * s, '#ffffff', 0, 0.2 * s, 0));
    const f = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42 * s, 0), mat('#22c55e', { flatShading: true }));
    f.position.y = 0.75 * s; f.castShadow = true; g.add(f);
    const f2 = f.clone(); f2.scale.setScalar(0.7); f2.position.set(0.15 * s, 1.1 * s, 0.05); g.add(f2);
    g.position.set(x, 0, z); stat.add(g);
  };
  plant(-12, -8.8); plant(-3, -8.8, 0.9); plant(12, -8.8); plant(-12, 8.8, 1.2); plant(-2.9, 8.6); plant(12, 3.2, 0.9);

  // Kiosco de Recursos Humanos (contratar)
  const hr = new THREE.Group();
  hr.add(box(1.8, 1.0, 0.8, '#ffffff', 0, 0.5, 0));
  hr.add(box(1.85, 0.08, 0.85, '#16a34a', 0, 1.02, 0));
  hr.add(box(0.08, 2.4, 0.08, '#16a34a', -0.8, 1.2, -0.3));
  hr.add(box(0.08, 2.4, 0.08, '#16a34a', 0.8, 1.2, -0.3));
  const hrTex = canvasTex(512, 160, (ctx, w, h) => {
    ctx.fillStyle = '#16a34a'; roundRect(ctx, 0, 0, w, h, 30); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `900 58px ${FONT}`; ctx.fillText('🤝 CONTRATAR', w / 2, 62);
    ctx.font = `700 32px ${FONT}`; ctx.fillText('Recursos Humanos', w / 2, 120);
  });
  const hrSign = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.56), new THREE.MeshBasicMaterial({ map: hrTex, transparent: true }));
  hrSign.position.set(0, 2.2, -0.25); hr.add(hrSign);
  hr.position.set(10.4, 0, 8.3); hr.rotation.y = -0.35; scene.add(hr);
  bake(hr); pick(hr, { type: 'hire' });
  bake(stat); freeze(stat); freeze(hr);

  // ---------------- Escritorios ----------------
  function makeChair(x, z, yaw, color = '#334155') {
    const g = new THREE.Group();
    g.add(box(0.5, 0.08, 0.5, color, 0, 0.45, 0));
    g.add(box(0.5, 0.55, 0.08, color, 0, 0.75, -0.24));
    g.add(cyl(0.03, 0.03, 0.42, '#94a3b8', 0, 0.22, 0, 6));
    g.add(cyl(0.25, 0.25, 0.04, '#64748b', 0, 0.03, 0, 10));
    g.position.set(x, 0, z); g.rotation.y = yaw; return g;
  }
  const desks = [];
  function deskSpot(i) {
    const row = Math.floor(i / COL_X.length), col = i % COL_X.length;
    const x = COL_X[col], z = ROW_Z[row] ?? ROW_Z[ROW_Z.length - 1] + 3.5;
    return { x, z, chairZ: z - 0.85 };
  }
  function ensureDesk(i) {
    if (desks[i]) return desks[i];
    const s = deskSpot(i);
    const g = new THREE.Group(); g.position.set(s.x, 0, s.z);
    g.add(box(1.5, 0.06, 0.78, '#ffffff', 0, 0.74, 0));
    [[-0.68, -0.32], [0.68, -0.32], [-0.68, 0.32], [0.68, 0.32]].forEach(([a, b]) => g.add(box(0.05, 0.72, 0.05, '#94a3b8', a, 0.36, b)));
    g.add(box(1.5, 0.4, 0.04, '#e2e8f0', 0, 0.5, 0.37));
    const mon = box(0.7, 0.42, 0.04, '#0f172a', 0, 1.06, 0.18); g.add(mon);
    g.add(box(0.06, 0.2, 0.06, '#0f172a', 0, 0.86, 0.2));
    g.add(box(0.5, 0.02, 0.16, '#cbd5e1', 0, 0.78, -0.12));
    const scrTex = canvasTex(256, 160, () => {});
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.64, 0.37), new THREE.MeshBasicMaterial({ map: scrTex }));
    scr.position.set(0, 1.06, 0.155); scr.rotation.y = Math.PI; g.add(scr);
    const plateTex = canvasTex(512, 128, () => {});
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.32), new THREE.MeshBasicMaterial({ map: plateTex, transparent: true }));
    plate.position.set(0, 0.5, 0.395); g.add(plate);
    const lamp = new THREE.Group(); lamp.add(cyl(0.012, 0.012, 0.35, '#64748b', 0, 0.95, 0, 6));
    lamp.add(cyl(0.05, 0.1, 0.1, '#16a34a', 0, 1.13, 0.02, 10)); lamp.position.set(0.6, 0, 0.2); g.add(lamp);
    const chair = makeChair(s.x, s.chairZ, 0);
    scene.add(g); scene.add(chair); bake(g); bake(chair); freeze(g); freeze(chair);
    const d = { i, g, scrTex, plateTex, spot: s, agentId: null, plateKey: '', scrKey: '' };
    pick(g, { type: 'desk', index: i });
    desks[i] = d; drawPlate(d, null); drawDeskScreen(d, null, 'off', 0);
    return d;
  }
  function drawPlate(d, a) {
    const key = a ? a.name + a.color + a.role : 'free';
    if (d.plateKey === key) return; d.plateKey = key;
    const { ctx, canvas } = d.plateTex.userData; const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = a ? a.color : 'rgba(22,163,74,0.12)'; roundRect(ctx, 4, 4, w - 8, h - 8, 26); ctx.fill();
    if (!a) { ctx.setLineDash([14, 10]); ctx.lineWidth = 5; ctx.strokeStyle = '#16a34a'; ctx.stroke(); ctx.setLineDash([]); }
    ctx.fillStyle = a ? '#fff' : '#15803d'; ctx.font = `900 54px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(a ? `${ROLES[a.role]?.icon || '🤖'} ${a.name}` : '＋ Puesto libre', w / 2, h / 2 + 3, w - 30);
    d.plateTex.needsUpdate = true;
  }
  function drawDeskScreen(d, a, state, t) {
    const k = (a ? a.id + a.color + a.role : '-') + state;
    if (state !== 'work' && d.scrKey === k) return; d.scrKey = k;
    const { ctx, canvas } = d.scrTex.userData; const w = canvas.width, h = canvas.height;
    if (!a || state === 'off') { ctx.fillStyle = '#0b1220'; ctx.fillRect(0, 0, w, h); d.scrTex.needsUpdate = true; return; }
    ctx.fillStyle = state === 'work' ? '#ecfdf3' : '#0f3b22'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = a.color; ctx.fillRect(0, 0, w, 30);
    ctx.fillStyle = '#fff'; ctx.font = `800 18px ${FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(ROLES[a.role]?.screen || 'Trabajando', 10, 16);
    if (state === 'work') {
      for (let k = 0; k < 4; k++) {
        const len = 60 + ((Math.sin(t * 2 + k * 1.7 + d.i) + 1) / 2) * 150;
        ctx.fillStyle = k % 2 ? '#86efac' : '#16a34a'; roundRect(ctx, 12, 46 + k * 26, len, 14, 7); ctx.fill();
      }
    } else {
      ctx.fillStyle = '#86efac'; ctx.font = `800 26px ${FONT}`; ctx.textAlign = 'center';
      ctx.fillText(state === 'dance' ? '🎉 FIESTA 🎉' : 'Vuelvo enseguida ☕', w / 2, h / 2 + 15);
    }
    d.scrTex.needsUpdate = true;
  }

  // ---------------- Lugares a donde caminan ----------------
  const COFFEE = [
    { x: -10.8, z: -1.0, yaw: -Math.PI / 2 }, { x: -10.8, z: 0.2, yaw: -Math.PI / 2 }, { x: -10.8, z: 1.4, yaw: -Math.PI / 2 },
    { x: -9.7, z: -0.4, yaw: -2.2 }, { x: -9.7, z: 0.9, yaw: -1.0 }, { x: -9.9, z: 2.3, yaw: -0.8 }
  ];
  const SOFA = [
    { x: -11.25, z: 4.6, yaw: Math.PI / 2 }, { x: -11.25, z: 5.7, yaw: Math.PI / 2 }, { x: -11.25, z: 6.8, yaw: Math.PI / 2 },
    { x: -9.3, z: 8.4, yaw: Math.PI }, { x: -8.2, z: 8.4, yaw: Math.PI }, { x: -7.1, z: 8.4, yaw: Math.PI }
  ];
  const DANCE = [];
  for (let k = 0; k < 12; k++) {
    const r = k < 1 ? 0 : k < 7 ? 1.05 : 1.7; const a = (k * 2.4);
    DANCE.push({ x: -5.4 + Math.cos(a) * r, z: 3.1 + Math.sin(a) * r, yaw: 0 });
  }
  const zoneOf = (p) => (p.x < -2.8 && p.z > -2 ? 'lounge' : 'work');

  // ---------------- Agentes ----------------
  const agents = new Map();
  let celebrating = false;

  function spotFor(a) {
    const idx = a.slot;
    switch (a.state) {
      case 'work': case 'off': { const d = desks[a.desk]; return { kind: 'desk', x: d.spot.x, z: d.spot.chairZ, yaw: 0, pose: a.state === 'off' ? 'sleep' : 'type' }; }
      case 'coffee': { const s = COFFEE[idx % COFFEE.length]; return { kind: 'coffee', ...s, pose: 'cup' }; }
      case 'rest': { const s = SOFA[idx % SOFA.length]; return { kind: 'sofa', ...s, pose: 'relax' }; }
      case 'dance': { const s = DANCE[idx % DANCE.length]; return { kind: 'dance', ...s, pose: 'dance' }; }
      default: return { kind: 'free', x: 3, z: CORR, yaw: 0, pose: 'stand' };
    }
  }
  function exitPts(spot) {
    if (!spot) return [];
    if (spot.kind === 'desk') return [V(spot.x + 1.3, spot.z)];
    if (spot.kind === 'sofa') return [V(spot.x + (spot.yaw === Math.PI ? 0 : 0.9), spot.z - (spot.yaw === Math.PI ? 0.9 : 0))];
    return [];
  }
  function buildPath(a, to) {
    const pts = a.spot && !a.path.length ? exitPts(a.spot) : [];
    const start = pts.length ? pts[pts.length - 1] : a.char.g.position.clone();
    const ent = exitPts(to).reverse();
    const end = ent.length ? ent[0] : V(to.x, to.z);
    if (!(zoneOf(start) === 'lounge' && zoneOf(end) === 'lounge')) {
      pts.push(V(start.x, CORR), V(end.x, CORR));
    }
    pts.push(...ent, V(to.x, to.z));
    return pts;
  }

  function setAgents(list) {
    const seen = new Set();
    list.forEach((info, n) => {
      seen.add(info.id);
      const desk = Math.max(0, info.desk ?? n);
      ensureDesk(desk);
      let a = agents.get(info.id);
      const av = avatarOf(info, 'agent'); const avKey = JSON.stringify(av) + info.color;
      if (!a) {
        const d = desks[desk];
        const home = { kind: 'desk', x: d.spot.x, z: d.spot.chairZ, yaw: 0, pose: 'type' };
        a = { id: info.id, char: null, label: labelSprite(), path: [], spot: home, target: home, pose: 'stand', state: null, slot: n, desk, labelKey: '' };
        agents.set(info.id, a);
      }
      if (a.avKey !== avKey) { // crear o cambiar el muñequito
        const old = a.char;
        const char = makeCharacter(info.color, av); char.g.add(a.label);
        if (old) { char.g.position.copy(old.g.position); char.g.rotation.y = old.g.rotation.y; scene.remove(old.g); const i = pickables.indexOf(old.g); if (i >= 0) pickables.splice(i, 1); }
        else { const d = desks[desk]; char.g.position.set(d.spot.x, 0, d.spot.chairZ); }
        pick(char.g, { type: 'agent', id: info.id }); scene.add(char.g);
        a.char = char; a.avKey = avKey;
      }
      if (a.desk !== desk) { if (desks[a.desk]?.agentId === a.id) desks[a.desk].agentId = null; a.desk = desk; a.state = null; }
      desks[desk].agentId = info.id;
      Object.assign(a, { name: info.name, color: info.color, role: info.role, slot: n, info });
      drawPlate(desks[desk], info);
      const st = info.state || 'work';
      if (st !== a.state) {
        a.state = st;
        const to = spotFor(a);
        const here = a.spot && !a.path.length && a.spot.kind === to.kind && Math.abs(a.spot.x - to.x) < 0.01 && Math.abs(a.spot.z - to.z) < 0.01;
        if (here) { a.target = to; a.spot = to; }
        else { a.path = buildPath(a, to); a.target = to; a.spot = null; }
      }
      const key = `${STATE_INFO[st]?.emoji} ${info.name}|${info.sub || ''}|${info.color}`;
      if (key !== a.labelKey) { a.labelKey = key; drawLabel(a.label, `${STATE_INFO[st]?.emoji || ''} ${info.name}`, info.color, info.sub); }
    });
    // Despedidos
    for (const [id, a] of agents) {
      if (!seen.has(id)) {
        scene.remove(a.char.g); agents.delete(id);
        const i = pickables.indexOf(a.char.g); if (i >= 0) pickables.splice(i, 1);
        if (desks[a.desk]?.agentId === id) { desks[a.desk].agentId = null; drawPlate(desks[a.desk], null); drawDeskScreen(desks[a.desk], null, 'off', 0); }
      }
    }
    for (let i = 0; i < 10; i++) ensureDesk(i);
  }

  // ---------------- Socios (CEO y socias) ----------------
  const members = new Map();
  function setMembers(list) {
    const seen = new Set();
    list.slice(0, MEMBER_SEATS.length).forEach((m, i) => {
      seen.add(m.id);
      let o = members.get(m.id);
      const av = avatarOf(m, 'member'); const avKey = JSON.stringify(av) + (m.color || '');
      if (!o) { o = { char: null, label: labelSprite(), key: '' }; members.set(m.id, o); }
      if (o.avKey !== avKey) {
        if (o.char) { scene.remove(o.char.g); const k = pickables.indexOf(o.char.g); if (k >= 0) pickables.splice(k, 1); }
        o.char = makeCharacter(m.color || '#16a34a', av); o.char.g.add(o.label); o.char.blob.visible = false;
        pick(o.char.g, { type: 'member', id: m.id }); scene.add(o.char.g); o.avKey = avKey;
      }
      const s = MEMBER_SEATS[i];
      o.char.g.position.set(s.x, SIT_Y, s.z); o.char.g.rotation.y = s.yaw; o.seat = i;
      applyPose(o.char, 'sit', 0, i);
      const key = `${m.name}|${m.online}|${m.role}`;
      if (key !== o.key) {
        o.key = key;
        drawLabel(o.label, `${m.role === 'ceo' ? '👑' : '💎'} ${m.name}`, m.online ? '#22c55e' : '#94a3b8', m.online ? '● en línea' : 'desconectad' + (m.role === 'ceo' ? 'o' : 'a'));
      }
    });
    for (const [id, o] of members) if (!seen.has(id)) { scene.remove(o.char.g); const k = pickables.indexOf(o.char.g); if (k >= 0) pickables.splice(k, 1); members.delete(id); }
  }

  // ---------------- Poses ----------------
  function applyPose(c, pose, t, seed = 0) {
    const s = Math.sin, ph = seed * 1.3;
    c.lLeg.rotation.set(0, 0, 0); c.rLeg.rotation.set(0, 0, 0);
    c.lArm.rotation.set(0, 0, 0); c.rArm.rotation.set(0, 0, 0);
    c.head.rotation.set(0, 0, 0); c.torso.rotation.set(0, 0, 0); c.cup.visible = false;
    switch (pose) {
      case 'walk': {
        const k = s(t * 9 + ph) * 0.6;
        c.lLeg.rotation.x = k; c.rLeg.rotation.x = -k; c.lArm.rotation.x = -k * 0.8; c.rArm.rotation.x = k * 0.8; break;
      }
      case 'sit': case 'type': case 'relax': case 'sleep': {
        c.lLeg.rotation.x = -Math.PI / 2; c.rLeg.rotation.x = -Math.PI / 2;
        if (pose === 'type') {
          c.lArm.rotation.x = -1.15 + s(t * 22 + ph) * 0.07; c.rArm.rotation.x = -1.15 + s(t * 22 + ph + 1.5) * 0.07;
          c.head.rotation.x = 0.12 + s(t * 0.8 + ph) * 0.04;
        } else if (pose === 'sleep') {
          c.lArm.rotation.x = -1.3; c.rArm.rotation.x = -1.3; c.head.rotation.x = 0.6; c.torso.rotation.x = 0.25;
        } else if (pose === 'relax') {
          c.lArm.rotation.z = 0.35; c.rArm.rotation.z = -0.35; c.head.rotation.y = s(t * 0.6 + ph) * 0.4; c.head.rotation.x = -0.1;
        } else {
          c.lArm.rotation.x = -0.6; c.rArm.rotation.x = -0.6 + s(t * 1.2 + ph) * 0.15; c.head.rotation.y = s(t * 0.5 + ph) * 0.35;
        }
        break;
      }
      case 'cup': {
        const sip = (s(t * 0.9 + ph) + 1) / 2;
        c.cup.visible = true; c.rArm.rotation.x = -0.6 - sip * 1.4; c.rArm.rotation.z = 0.1 * sip;
        c.head.rotation.x = -0.15 * sip; c.lArm.rotation.z = 0.12; break;
      }
      case 'dance': {
        c.lArm.rotation.z = 2.5 + s(t * 8 + ph) * 0.5; c.rArm.rotation.z = -2.5 - s(t * 8 + ph + 1) * 0.5;
        c.lLeg.rotation.x = s(t * 8 + ph) * 0.35; c.rLeg.rotation.x = -s(t * 8 + ph) * 0.35;
        c.head.rotation.z = s(t * 4 + ph) * 0.25; break;
      }
      default: break;
    }
  }

  // ---------------- Interacción ----------------
  const ray = new THREE.Raycaster(); const ndc = new THREE.Vector2();
  let down = null;
  renderer.domElement.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    const dt = performance.now() - down.t; down = null;
    if (moved > 8 || dt > 600) return;
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(pickables, true).find((h) => h.object.userData.pick);
    if (hit) {
      const p = hit.object.userData.pick;
      if (p.type === 'desk' && desks[p.index]?.agentId) onPick?.({ type: 'agent', id: desks[p.index].agentId });
      else onPick?.(p);
    }
  });
  renderer.domElement.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || down) return;
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(pickables, true).find((h) => h.object.userData.pick);
    renderer.domElement.style.cursor = hit ? 'pointer' : 'grab';
  });

  // ---------------- Cámara ----------------
  let camAnim = null;
  function resetCamera(animated = true) {
    const w = container.clientWidth || innerWidth, h = container.clientHeight || innerHeight;
    const aspect = w / h;
    const portrait = aspect < 0.8;
    const dist = portrait ? 44 : aspect < 1.2 ? 27 : 21;
    const target = portrait ? V(-0.5, -0.5, 0) : V(-0.3, -1.0, 0);
    const dir = portrait ? new THREE.Vector3(1.0, 1.75, 0.3) : new THREE.Vector3(0.55, 0.78, 0.82);
    const pos = target.clone().add(dir.normalize().multiplyScalar(dist));
    if (!animated) { camera.position.copy(pos); controls.target.copy(target); return; }
    camAnim = { fromP: camera.position.clone(), toP: pos, fromT: controls.target.clone(), toT: target, t: 0 };
  }
  function focusPoint(p, dist = 9) {
    const dir = camera.position.clone().sub(controls.target).normalize();
    const toT = V(p.x, p.z, 0.8);
    camAnim = { fromP: camera.position.clone(), toP: toT.clone().add(dir.multiplyScalar(dist)), fromT: controls.target.clone(), toT, t: 0 };
  }
  function focus(id) {
    const a = agents.get(id); if (a) focusPoint(a.char.g.position);
  }
  function focusCEO() { focusPoint(V(-7, -6), 10); }

  function resize() {
    const w = container.clientWidth || innerWidth, h = container.clientHeight || innerHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize); ro.observe(container); resize(); resetCamera(false);

  // ---------------- Bucle ----------------
  let prevT = performance.now(), elapsed = 0;
  let last = 0, screenTimer = 0, floorTimer = 0, running = true;
  const tmp = new THREE.Vector3();
  let fpsCap = hi ? 0 : 30, lastDraw = 0, fpsFrames = 0, fpsStart = performance.now(), slowStrikes = 0;
  function lowerQuality() {
    if (hi) {
      hi = false; renderer.shadowMap.enabled = false; sun.castShadow = false;
      renderer.setPixelRatio(Math.min(dpr, 1.25)); fpsCap = 30; resize();
      scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
    } else if (renderer.getPixelRatio() > 1) { renderer.setPixelRatio(1); resize(); }
  }
  function frame() {
    if (!running) return;
    requestAnimationFrame(frame);
    if (document.hidden) return;
    const nowT = performance.now();
    if (fpsCap && nowT - lastDraw < 1000 / fpsCap - 2) return;
    lastDraw = nowT;
    // Medidor: si va lento varias veces seguidas, baja la calidad sola
    fpsFrames++;
    if (nowT - fpsStart > 3000) {
      const fps = (fpsFrames * 1000) / (nowT - fpsStart); fpsFrames = 0; fpsStart = nowT;
      if (fps < (hi ? 28 : 20)) { if (++slowStrikes >= 2) { slowStrikes = 0; lowerQuality(); } } else slowStrikes = 0;
    }
    const dt = Math.min((nowT - prevT) / 1000, 0.05); prevT = nowT; elapsed += dt; const t = elapsed;
    controls.update();
    if (camAnim) {
      camAnim.t = Math.min(1, camAnim.t + dt * 1.6); const k = 1 - Math.pow(1 - camAnim.t, 3);
      camera.position.lerpVectors(camAnim.fromP, camAnim.toP, k); controls.target.lerpVectors(camAnim.fromT, camAnim.toT, k);
      if (camAnim.t >= 1) camAnim = null;
    }
    // Agentes
    for (const a of agents.values()) {
      const g = a.char.g;
      if (a.path.length) {
        const p = a.path[0]; tmp.set(p.x, 0, p.z).sub(g.position); tmp.y = 0;
        const dist = tmp.length(); const step = 1.9 * dt;
        if (dist <= step) { g.position.set(p.x, 0, p.z); a.path.shift(); }
        else {
          tmp.normalize(); g.position.addScaledVector(tmp, step);
          const yaw = Math.atan2(tmp.x, tmp.z); g.rotation.y += ((yaw - g.rotation.y + Math.PI * 3) % (Math.PI * 2) - Math.PI) * Math.min(1, dt * 10);
        }
        g.position.y = 0; a.char.blob.visible = true; applyPose(a.char, 'walk', t, a.slot);
        if (!a.path.length) { a.spot = a.target; g.rotation.y = a.target.yaw; }
      } else {
        const pose = a.target?.pose || 'stand';
        const seated = ['type', 'relax', 'sleep'].includes(pose);
        g.position.y = seated ? (pose === 'relax' ? SOFA_Y : SIT_Y) : 0;
        a.char.blob.visible = !seated;
        if (pose === 'dance') { g.position.y = Math.abs(Math.sin(t * 6 + a.slot)) * 0.28; g.rotation.y += dt * 2.2; }
        applyPose(a.char, pose, t, a.slot);
      }
    }
    for (const [, o] of members) {
      applyPose(o.char, celebrating ? 'dance' : 'sit', t, o.seat + 3);
      o.char.g.position.y = celebrating ? SIT_Y + Math.abs(Math.sin(t * 6 + o.seat)) * 0.12 : SIT_Y;
      if (celebrating) { o.char.lLeg.rotation.x = -Math.PI / 2; o.char.rLeg.rotation.x = -Math.PI / 2; }
    }
    // Pantallas de escritorio (2 veces por segundo)
    screenTimer += dt;
    if (screenTimer > 1) {
      screenTimer = 0;
      desks.forEach((d) => { const a = d && agents.get(d.agentId); if (d) drawDeskScreen(d, a?.info, a?.state || 'off', t); });
    }
    // Fiesta
    if (celebrating) {
      floorTimer += dt; if (floorTimer > 0.12) { floorTimer = 0; drawFloor(t, true); }
      disco.rotation.y += dt * 1.5; hemi.color.setHSL((t * 0.15) % 1, 0.35, 0.85);
    }
    renderer.render(scene, camera);
    last = t;
  }
  frame();
  window.__vhq = { cam: (x, y, z, tx, ty, tz) => { camAnim = null; camera.position.set(x, y, z); controls.target.set(tx, ty, tz); }, info: () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles, quality: hi ? 'alta' : 'baja', pr: renderer.getPixelRatio() }) };

  function setCelebrate(on) {
    if (on === celebrating) return;
    celebrating = on; disco.visible = on; discoString.visible = on;
    if (!on) { drawFloor(0, false); hemi.color.set('#ffffff'); }
  }

  function screenPos(id) {
    const a = agents.get(id) || null; if (!a) return null;
    const p = a.char.g.position.clone(); p.y += 2.4; p.project(camera);
    const r = renderer.domElement.getBoundingClientRect();
    return { x: (p.x + 1) / 2 * r.width + r.left, y: (1 - p.y) / 2 * r.height + r.top, visible: p.z < 1 && Math.abs(p.x) < 1.1 && Math.abs(p.y) < 1.1 };
  }

  return {
    setAgents, setMembers, setCelebrate, focus, focusCEO, resetCamera, screenPos,
    setScreen(on, areas) { screenOn = on; drawScreen(areas); },
    setQuality(q) { try { localStorage.setItem('viverehq-quality', q); } catch {} location.reload(); },
    get quality() { return hi ? 'alta' : 'baja'; },
    dispose() { running = false; ro.disconnect(); renderer.dispose(); }
  };
}
