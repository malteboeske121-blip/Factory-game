'use strict';
// =====================================================================
//  3D-Welt: Darstellung, Spielfigur, Kamera und Steuerung (Three.js)
// =====================================================================


const T3 = 2;            // Weltgröße eines Feldes
const P_RADIUS = 0.35;   // Spielerradius

const v3 = {
  ready: false, renderer: null, scene: null, camera: null, sun: null,
  ground: null, groundTiles: null, objs: new Map(), itemPool: [], itemUsed: 0,
  ghost: null, ghostType: null, ghostDir: -1, highlight: null,
  player: { x: 0, y: 0, z: 0, vy: 0, face: 0, walk: 0, onGround: true },
  cam: { yaw: 0, pitch: 0.85, dist: 16 }, // Kamera schaut der Figur von schräg oben zu
  pointer: { x: 0, y: 0, inside: false },  // Maus/Finger auf dem Bild
  target: null, keys: {}, beltTex: null, mats: {}, geos: {}, itemMats: {}, itemGeos: {},
  ray: null, iconCache: {}, joy: { x: 0, y: 0 }, look: null,
};

const tileCenter = (x, y) => [(x + 0.5) * T3, (y + 0.5) * T3];
const SOLID = { miner: 1, furnace: 1, assembler: 1, seller: 1, bin: 1, splitter: 0, belt: 0 };

// ---------- Initialisierung ----------
function init3d() {
  if (v3.ready) return true;
  if (typeof THREE === 'undefined') { toast('3D-Bibliothek konnte nicht geladen werden', true); return false; }
  const cv = document.getElementById('game3d');
  const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
  r.setPixelRatio(Math.min(touchUI ? 1.5 : 2, devicePixelRatio));
  r.shadowMap.enabled = true;
  r.shadowMap.type = THREE.PCFSoftShadowMap;
  v3.renderer = r;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(WORLD_FOG);
  scene.fog = new THREE.Fog(WORLD_FOG, 80, 400);
  v3.scene = scene;
  v3.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 2000);
  v3.camera.rotation.order = 'YXZ';

  scene.add(new THREE.HemisphereLight(0xdfefff, 0x4a5a3a, 0.75));
  const sun = new THREE.DirectionalLight(0xfff2d8, 0.85);
  sun.position.set(20, 40, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(touchUI ? 1024 : 2048, touchUI ? 1024 : 2048);
  const sc = sun.shadow.camera;
  sc.left = -35; sc.right = 35; sc.top = 35; sc.bottom = -35; sc.near = 1; sc.far = 120;
  sun.shadow.bias = -0.0008;
  scene.add(sun, sun.target);
  v3.sun = sun;

  // Laufband-Textur (Pfeile), wird animiert
  const bc = document.createElement('canvas'); bc.width = 64; bc.height = 64;
  const g = bc.getContext('2d');
  g.fillStyle = '#34373c'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#25272b'; g.fillRect(0, 0, 64, 6); g.fillRect(0, 58, 64, 6);
  g.strokeStyle = '#d8b44a'; g.lineWidth = 5;
  for (const ox of [8, 40]) { g.beginPath(); g.moveTo(ox, 16); g.lineTo(ox + 14, 32); g.lineTo(ox, 48); g.stroke(); }
  v3.beltTex = new THREE.CanvasTexture(bc);
  v3.beltTex.wrapS = THREE.RepeatWrapping;
  v3.beltTex.anisotropy = 4;

  const M = (color, extra = {}) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.75, metalness: 0.1 }, extra));
  v3.mats = {
    belt: new THREE.MeshStandardMaterial({ map: v3.beltTex, roughness: 0.9 }),
    beltSide: M(0x2a2c30), arrow: M(0xffd75e, { emissive: 0x332200 }),
    minerBase: M(0x5c6b3a), metal: M(0xb8bec6, { metalness: 0.6, roughness: 0.4 }), dark: M(0x2c2f34),
    brick: M(0x8a4a38), fire: new THREE.MeshBasicMaterial({ color: 0x222222 }),
    asm: M(0x3a5a7a), asmTop: M(0x2a4058), splitter: M(0x4a4f58),
    seller: M(0x2f6a3a), gold: M(0xffd75e, { metalness: 0.7, roughness: 0.3, emissive: 0x332200 }),
    bin: M(0x60656c, { metalness: 0.5 }),
  };
  v3.geos = {
    box: new THREE.BoxGeometry(1, 1, 1),
    cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 20),
    cone: new THREE.ConeGeometry(0.5, 1, 16),
    gear: new THREE.CylinderGeometry(0.5, 0.5, 1, 10),
    plane: new THREE.PlaneGeometry(1, 1),
    torus: new THREE.TorusGeometry(1, 0.06, 8, 32),
    sphere: new THREE.SphereGeometry(0.5, 10, 8),
  };

  // Gegenstands-Formen
  const ig = v3.itemGeos;
  ig.rock = new THREE.DodecahedronGeometry(0.22);
  ig.plate = new THREE.BoxGeometry(0.46, 0.1, 0.36);
  ig.gear = new THREE.CylinderGeometry(0.24, 0.24, 0.1, 8);
  ig.wire = new THREE.TorusGeometry(0.17, 0.05, 6, 14);
  ig.chip = new THREE.BoxGeometry(0.4, 0.08, 0.4);
  ig.motor = new THREE.CylinderGeometry(0.2, 0.2, 0.36, 14);
  ig.robot = new THREE.BoxGeometry(0.36, 0.48, 0.3);
  for (const [k, it] of Object.entries(ITEMS)) v3.itemMats[k] = M(it.color, { metalness: it.shape === 'plate' ? 0.5 : 0.15 });
  for (const ore of ['iron_ore', 'copper_ore', 'coal']) v3.itemMats[ore] = oreMat(ore, r);
  ig.rock = rockGeometry(5, 1, 0.3); ig.rock.scale(0.22, 0.24, 0.22);

  // Bodenmarkierung und Bauvorschau
  v3.highlight = new THREE.Mesh(new THREE.PlaneGeometry(T3 * 0.98, T3 * 0.98),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, depthWrite: false }));
  v3.highlight.rotation.x = -Math.PI / 2;
  v3.highlight.position.y = 0.02;
  scene.add(v3.highlight);

  v3.ray = new THREE.Raycaster();

  // Markierung für das ausgewählte Gebäude (gelber Rahmen)
  const mc = document.createElement('canvas'); mc.width = mc.height = 64;
  const mg = mc.getContext('2d'); mg.strokeStyle = '#ffd75e'; mg.lineWidth = 6; mg.strokeRect(3, 3, 58, 58);
  v3.selMark = new THREE.Mesh(new THREE.PlaneGeometry(T3, T3),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(mc), transparent: true, depthWrite: false }));
  v3.selMark.rotation.x = -Math.PI / 2; v3.selMark.position.y = 0.04; v3.selMark.visible = false;
  scene.add(v3.selMark);

  v3.avatar = makeAvatar();
  scene.add(v3.avatar);
  setupInput(cv);
  resize3d();

  v3.ready = true;
  return true;
}

// Bodentextur aus der Karte erzeugen
function buildGround() {
  for (const m of [v3.ground, v3.grid, ...(v3.dirt || [])]) if (m) { v3.scene.remove(m); }
  v3.cullList = [];
  buildMainGround();   // world3d.js
  v3.groundTiles = tiles;
  buildOreRocks();
  buildGrassDeco();    // world3d.js
  buildSurroundings(); // world3d.js: Zaun, Wald, Seen, Berge, Himmel
  // vorhandene Gebäude-Objekte verwerfen
  for (const o of v3.objs.values()) v3.scene.remove(o);
  v3.objs.clear();
}

// ---------- Erzbrocken, die aus dem Boden ragen ----------
// Pro Erzsorte ein InstancedMesh für Felsen und eins für glänzende Nuggets/Kristalle.
function buildOreRocks() {
  if (v3.ore) for (const m of v3.ore.meshes) { v3.scene.remove(m); m.dispose && m.dispose(); }
  if (!v3.rockGeo) {
    v3.rockGeo = rockGeometry(1, 1, 0.3);
    v3.rockLo = rockGeometry(1, 0, 0.3);
    v3.nugGeo = { iron_ore: rockGeometry(2, 0, 0.35), copper_ore: rockGeometry(3, 0, 0.45), coal: new THREE.OctahedronGeometry(1, 0) };
  }
  const per = { iron_ore: [], copper_ore: [], coal: [] };
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) if (tiles[y][x].ore) per[tiles[y][x].ore].push([x, y]);
  const meshes = [], tileRefs = new Map(); // "x,y" -> [[mesh, index], ...]
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), V = new THREE.Vector3(), Sc = new THREE.Vector3();
  const rocksPer = touchUI ? 1 : 2, nugsPer = touchUI ? 1 : 2;
  for (const ore of Object.keys(per)) {
    const list = per[ore];
    if (!list.length) continue;
    const rocks = new Batch(v3.rockGeo, oreMat(ore, v3.renderer), 24, { cast: true, cull: 65, lo: v3.rockLo, loDist: 22 });
    const nugs = new Batch(v3.nugGeo[ore], nuggetMat(ore, v3.renderer), 24, { cull: 30 });
    for (const [x, y] of list) {
      const r = rng(x * 7919 + y * 104729 + ore.length), key = x + ',' + y;
      for (let k = 0; k < rocksPer; k++) {
        const px = (x + 0.18 + r() * 0.64) * T3, pz = (y + 0.18 + r() * 0.64) * T3;
        const w = (0.22 + r() * 0.3) * (touchUI ? 1.3 : 1), hgt = 0.16 + r() * 0.28;
        E.set(r() * 0.5, r() * Math.PI * 2, r() * 0.5); Q.setFromEuler(E);
        V.set(px, hgt * 0.35, pz); Sc.set(w, hgt, w * (0.7 + r() * 0.5));
        M.compose(V, Q, Sc); rocks.add(M, null, key);
        // Kristalle/Nuggets, schräg aus der Oberfläche ragend
        for (let j = 0; j < nugsPer; j++) {
          const a = r() * Math.PI * 2, ns = (ore === 'coal' ? 0.07 : 0.06) + r() * 0.07;
          V.set(px + Math.cos(a) * w * 0.55, hgt * 0.35 + hgt * (0.45 + r() * 0.4), pz + Math.sin(a) * w * 0.55);
          E.set(r() * 3, r() * 3, r() * 3); Q.setFromEuler(E);
          Sc.set(ns, ns * (ore === 'coal' ? 1.6 : 1.1), ns);
          M.compose(V, Q, Sc); nugs.add(M, null, key);
        }
      }
    }
    meshes.push(...rocks.build(v3.scene, tileRefs), ...nugs.build(v3.scene, tileRefs));
  }
  v3.ore = { meshes, tileRefs, hidden: new Set(), sig: '' };
}

// Erzbrocken unter Gebäuden ausblenden (sonst ragen sie durch den Boden der Maschinen)
const ZERO_M = new THREE.Matrix4().makeScale(0, 0, 0);
function updateOreVisibility() {
  const O = v3.ore;
  if (!O) return;
  let sig = buildings.length + ':';
  let h = 0;
  for (const b of buildings) h = (h * 31 + b.x * 977 + b.y) | 0;
  sig += h;
  if (sig === O.sig) return;
  O.sig = sig;
  const now = new Set();
  for (const b of buildings) now.add(b.x + ',' + b.y);
  const touched = new Set();
  for (const k of now) if (!O.hidden.has(k) && O.tileRefs.has(k)) { for (const [m, i] of O.tileRefs.get(k)) { m.setMatrixAt(i, ZERO_M); touched.add(m); } }
  for (const k of O.hidden) if (!now.has(k) && O.tileRefs.has(k)) { for (const [m, i] of O.tileRefs.get(k)) { m.setMatrixAt(i, m.userData.base[i]); touched.add(m); } }
  for (const m of touched) m.instanceMatrix.needsUpdate = true;
  O.hidden = now;
}

// ---------- Gebäudemodelle (zeigen nach +x) ----------
function part(geo, mat, sx, sy, sz, x, y, z) {
  const m = new THREE.Mesh(v3.geos[geo], v3.mats[mat] || mat);
  m.scale.set(sx, sy, sz); m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
function arrowPart(x, y) {
  const a = part('cone', 'arrow', 0.35, 0.45, 0.35, x, y, 0);
  a.rotation.z = -Math.PI / 2; a.castShadow = false;
  return a;
}
function itemIcon(item) {
  if (v3.iconCache[item]) return v3.iconCache[item];
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#1d2d3d'; g.fillRect(0, 0, 64, 64);
  drawItem(g, item, 32, 32, 40);
  const t = new THREE.CanvasTexture(c);
  return (v3.iconCache[item] = new THREE.MeshBasicMaterial({ map: t }));
}

// ---------- Gebäudemodelle (zeigen nach +x), Aussehen abhängig von der Stufe ----------
const woodMat = L => texMat('wood' + L, woodPlanks('wood' + L, WEAR[L] > 0.5 ? 1 : 0.2, 3), { roughness: 0.95, metalness: 0 });
const brickMat = L => texMat('brick' + L, bricks('brick' + L, WEAR[L]), { roughness: 0.95, metalness: 0 });
const concreteMat = L => texMat('conc' + L, concrete('conc' + L, L === 3 ? 0.25 : WEAR[L]), { roughness: 0.95, metalness: 0 });
const corrMat = L => texMat('corr' + L, corrugated('corr' + L, WEAR[L]), { roughness: 0.7, metalness: 0.4 });
const shutterMat = L => texMat('shut' + L, shutter('shut' + L, WEAR[L]), { roughness: 0.6, metalness: 0.5 });
function plane(mat, w, h, x, y, z, ry = Math.PI / 2) {
  const m = new THREE.Mesh(v3.geos.plane, mat);
  m.scale.set(w, h, 1); m.position.set(x, y, z); m.rotation.y = ry;
  return m;
}
function glowMat(color) {
  const k = 'glow' + color;
  return v3.mats[k] || (v3.mats[k] = new THREE.MeshBasicMaterial({ color }));
}

function buildMiner(grp, P, L) {
  const s = T3;
  const base = L === 1 ? woodMat(1) : metalMat('miner', L === 2 ? '#6b7a3a' : '#d8a21c', L);
  const frame = L === 1 ? woodMat(1) : metalMat('steel', '#767d86', L, { stripes: false, panels: 4 });
  const drillM = metalMat('drill', '#9aa0a8', L, { stripes: false, panels: 1 });
  grp.add(part('box', base, s * 0.9, 0.7, s * 0.9, 0, 0.35, 0));
  // Turm
  const H = L >= 3 ? 2.6 : 2.3;
  if (L < 4) {
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const post = part('box', frame, 0.14, H, 0.14, dx * 0.55, 0.7 + H / 2, dz * 0.55);
      if (L === 1) post.rotation.set(dz * 0.06, 0, -dx * 0.06); // schiefer Holzturm
      grp.add(post);
    }
    // Querstreben
    for (const y of L >= 3 ? [1.3, 2.0, 2.7] : [1.4, 2.4]) for (const r of [0, Math.PI / 2]) for (const sgn of [1, -1]) {
      const br = part('box', frame, 1.2, 0.09, 0.09, 0, y, sgn * 0.55);
      br.rotation.y = r; if (r) { br.position.set(sgn * 0.55, y, 0); }
      grp.add(br);
    }
    if (L >= 3) for (const sgn of [1, -1]) { // Diagonalen
      const d = part('box', frame, 0.07, 1.5, 0.07, 0, 1.75, sgn * 0.56); d.rotation.z = 0.75; grp.add(d);
    }
    grp.add(part('box', L === 1 ? woodMat(1) : frame, 1.35, 0.14, 1.35, 0, 0.7 + H, 0));
  } else {
    grp.add(part('cyl', frame, 0.9, H, 0.9, 0, 0.7 + H / 2, 0));
    const ring = new THREE.Mesh(v3.geos.torus, glowMat(0x5ee0ff));
    ring.rotation.x = Math.PI / 2; ring.position.y = 1.6; ring.scale.set(0.62, 0.62, 0.62);
    grp.add(ring); P.ring = ring;
  }
  // Antrieb oben
  grp.add(part('box', L === 1 ? metalMat('drill', '#9aa0a8', 1, { stripes: false, panels: 1 }) : base, 0.6, 0.45, 0.5, 0, 1.0 + H, 0));
  if (L === 3) grp.add(part('box', glowMat(0xffa030), 0.16, 0.12, 0.16, 0.25, 1.3 + H, 0.18));
  // Bohrkopf (dreht sich)
  const drill = new THREE.Group();
  drill.position.y = 1.15;
  drill.add(part('cyl', drillM, 0.16, H, 0.16, 0, H / 2 - 0.2, 0));
  for (let i = 0; i < 3; i++) {
    const bl = part('box', drillM, 0.85, 0.06, 0.14, 0, 0, 0); bl.rotation.y = i * Math.PI / 3; bl.rotation.x = 0.25; drill.add(bl);
  }
  if (L === 4) { const c = part('cone', glowMat(0x5ee0ff), 0.18, 0.3, 0.18, 0, -0.2, 0); c.rotation.x = Math.PI; drill.add(c); }
  grp.add(drill); P.drill = drill;
  // Auswurf-Rutsche
  const chute = part('box', drillM, 0.5, 0.12, 0.45, s * 0.42, 0.55, 0); chute.rotation.z = -0.35; grp.add(chute);
  grp.add(arrowPart(s * 0.5, 0.9));
  // alte Fässer / neue Elektrokästen
  if (L === 1) { const f = part('cyl', metalMat('barrel', '#7a5030', 1, { stripes: false, panels: 1 }), 0.32, 0.5, 0.32, -0.7, 0.95, 0.68); f.rotation.z = 0.1; grp.add(f); }
  if (L >= 3) grp.add(part('box', metalMat('cab', '#8a9096', L, { stripes: false }), 0.35, 0.55, 0.22, -0.68, 0.98, -0.72));
}

function buildFurnace(grp, P, L) {
  const s = T3;
  let body, chim;
  if (L <= 2) { body = brickMat(L); chim = brickMat(L); }
  else { body = metalMat('furnace', '#7a2e22', L, { hiColor: '#e4e8ec' }); chim = metalMat('pipe', '#8a9096', L, { stripes: false, panels: 1 }); }
  grp.add(part('box', body, s * 0.9, 1.5, s * 0.9, 0, 0.75, 0));
  // Ofenkappe
  grp.add(part('box', L <= 2 ? metalMat('cap', '#5a5e64', L, { stripes: false }) : body, s * 0.95, 0.14, s * 0.95, 0, 1.55, 0));
  // Schornstein
  if (L <= 2) grp.add(part('box', chim, 0.5, 1.5, 0.5, -0.4, 2.3, 0.4));
  else grp.add(part('cyl', chim, 0.38, 1.7, 0.38, -0.45, 2.45, 0.45));
  if (L === 2) for (const y of [0.35, 1.2]) grp.add(part('box', metalMat('band', '#4a4e54', 2, { stripes: false, panels: 1 }), s * 0.92, 0.08, s * 0.92, 0, y, 0));
  if (L === 3) { // Rohrleitungen
    const pipe = metalMat('pipe', '#8a9096', 3, { stripes: false, panels: 1 });
    grp.add(part('cyl', pipe, 0.14, 1.2, 0.14, -0.5, 0.9, -0.95));
    const p2 = part('cyl', pipe, 0.14, 1.0, 0.14, 0, 1.45, -0.95); p2.rotation.z = Math.PI / 2; grp.add(p2);
  }
  if (L === 4) { // Induktionsspulen
    for (const y of [0.45, 0.8, 1.15]) {
      const r = new THREE.Mesh(v3.geos.torus, glowMat(0x5ee0ff)); r.rotation.x = Math.PI / 2; r.position.set(-0.3, y, 0.3); r.scale.set(0.55, 0.55, 0.55);
      grp.add(r);
    }
  }
  // Ofentür mit Feuerfenster
  grp.add(part('box', metalMat('door', '#3a3c40', L, { stripes: false, panels: 1 }), 0.08, 0.8, 1.0, s * 0.45, 0.6, 0));
  const fire = part('box', new THREE.MeshBasicMaterial({ color: 0x1a1a1a }), 0.05, 0.42, 0.7, s * 0.46 + 0.03, 0.6, 0);
  fire.castShadow = false;
  grp.add(fire); P.fire = fire;
  grp.add(arrowPart(s * 0.5, 1.2));
  // Rauch (nur bei Kohle-Öfen)
  if (L <= 3) {
    const smoke = new THREE.Group();
    const top = L <= 2 ? [-0.4, 3.1, 0.4] : [-0.45, 3.35, 0.45];
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(v3.geos.sphere, new THREE.MeshStandardMaterial({ color: L === 1 ? 0x2a2a2a : 0x8a8a8a, transparent: true, opacity: 0, depthWrite: false }));
      m.position.set(...top); m.userData.phase = i / 4; smoke.add(m);
    }
    smoke.userData.top = top;
    grp.add(smoke); P.smoke = smoke;
  }
}

function buildAssembler(grp, P, L, b) {
  const s = T3;
  const col = ['', '#5d6b5a', '#4f6a72', '#2f6aa8', '#2f6aa8'][L];
  const body = metalMat('asm', col, L, { hiColor: '#e9edf0' });
  grp.add(part('box', body, s * 0.94, 1.5, s * 0.94, 0, 0.75, 0));
  grp.add(part('box', metalMat('asmtop', '#3a3e44', L, { stripes: false }), s * 0.75, 0.16, s * 0.75, 0, 1.58, 0));
  const icon = new THREE.Mesh(new THREE.PlaneGeometry(s * 0.5, s * 0.5), itemIcon(RECIPES[b.recipe]?.out || 'gear'));
  icon.rotation.x = -Math.PI / 2; icon.position.y = 1.67; grp.add(icon); P.icon = icon; P.recipe = b.recipe;
  // Zahnrad an der Seite
  const gear = part('gear', metalMat('drill', '#9aa0a8', L, { stripes: false, panels: 1 }), 0.8, 0.12, 0.8, s * 0.48, 1.0, 0);
  gear.rotation.z = Math.PI / 2; grp.add(gear); P.gear = gear;
  // Bedienpult mit Bildschirm
  grp.add(part('box', metalMat('panel', '#3a3e44', L, { stripes: false, panels: 1 }), 0.5, 0.5, 0.12, 0.3, 0.9, s * 0.48));
  const scr = part('box', L === 1 ? new THREE.MeshStandardMaterial({ color: 0x1a2a1a, roughness: 0.3 }) : glowMat([0, 0, 0x2a8a3a, 0x40ff80, 0x5ee0ff][L]),
    0.36, 0.26, 0.02, 0.3, 0.95, s * 0.48 + 0.07);
  scr.castShadow = false; grp.add(scr); P.screen = scr;
  // Roboterarm (ab Stufe 3)
  if (L >= 3) {
    const arm = new THREE.Group(); arm.position.set(-0.45, 1.66, -0.45);
    const am = metalMat('arm', L === 4 ? '#e9edf0' : '#f2b01e', 3, { stripes: false, panels: 1 });
    arm.add(part('cyl', am, 0.22, 0.2, 0.22, 0, 0.1, 0));
    const a1 = part('box', am, 0.12, 0.7, 0.12, 0, 0.5, 0); a1.rotation.z = 0.4; arm.add(a1);
    const a2 = part('box', am, 0.6, 0.1, 0.1, 0.3, 0.8, 0); arm.add(a2);
    grp.add(arm); P.arm = arm;
  }
  if (L === 1) { // altes Rohr mit Rost
    const pipe = part('cyl', metalMat('pipe', '#8a9096', 1, { stripes: false, panels: 1 }), 0.12, 1.4, 0.12, -0.7, 0.9, -s * 0.47);
    grp.add(pipe);
  }
  grp.add(arrowPart(s * 0.5, 0.35));
}

function buildSeller(grp, P, L) {
  const s = T3, F = s * 0.46; // Vorderseite bei +x
  if (L <= 2) {
    // Holzschuppen mit Wellblechdach
    const wood = woodMat(L);
    grp.add(part('box', wood, s * 0.8, 1.5, s * 0.86, -0.1, 0.75, 0));
    const roof = part('box', corrMat(L), s * 0.98, 0.06, s * 0.98, 0, 1.68, 0); roof.rotation.z = -0.2; grp.add(roof);
    // Verkaufstheke vorne
    grp.add(part('box', wood, 0.35, 0.85, s * 0.86, F - 0.2, 0.43, 0));
    grp.add(part('box', woodMat(2), 0.45, 0.06, s * 0.9, F - 0.18, 0.88, 0));
    // dunkle Öffnung bzw. Rolltor
    if (L === 1) grp.add(plane(new THREE.MeshStandardMaterial({ color: 0x1a140e }), 1.3, 0.55, F - 0.39, 1.2, 0));
    else grp.add(plane(shutterMat(2), 1.4, 0.6, F - 0.39, 1.22, 0));
    // Stützpfosten
    for (const z of [-0.8, 0.8]) grp.add(part('box', wood, 0.1, 1.6, 0.1, F, 0.8, z));
    // Schild
    const sign = plane(new THREE.MeshStandardMaterial({ map: signTex(L).map, roughness: 0.9 }), 1.6, 0.4, F + 0.02, 1.62, 0);
    sign.rotation.z = 0; grp.add(sign); P.sign = sign;
    // Kisten und Fass
    const crate = woodMat(1);
    grp.add(part('box', crate, 0.42, 0.42, 0.42, -0.62, 0.21, -0.98 + 0.21));
    grp.add(part('box', crate, 0.34, 0.34, 0.34, -0.6, 0.59, -0.98 + 0.2));
    if (L === 1) grp.add(part('cyl', metalMat('barrel', '#7a5030', 1, { stripes: false, panels: 1 }), 0.34, 0.55, 0.34, 0.15, 0.28, 0.98 - 0.2));
  } else {
    const walls = L === 3 ? concreteMat(3) : metalMat('shop', '#30363e', 4, { stripes: false, hiColor: '#30363e', panels: 3 });
    grp.add(part('box', walls, s * 0.88, 1.7, s * 0.9, -0.04, 0.85, 0));
    // Dach mit Kante
    grp.add(part('box', metalMat('roof', '#5a5e64', L, { stripes: false }), s * 0.94, 0.12, s * 0.96, -0.02, 1.76, 0));
    if (L === 3) {
      // Rolltor + Laderampe + Lampe
      grp.add(plane(shutterMat(3), 1.1, 1.1, F - 0.01, 0.75, 0.15));
      grp.add(part('box', concreteMat(3), 0.3, 0.2, 1.3, F + 0.05, 0.1, 0.15));
      grp.add(part('box', glowMat(0xfff0b0), 0.12, 0.06, 0.3, F + 0.06, 1.42, 0.15));
      // Palette mit Kartons
      grp.add(part('box', woodMat(2), 0.55, 0.1, 0.55, F - 0.05, 0.05, -0.68));
      const cardboard = v3.mats.cardboard || (v3.mats.cardboard = new THREE.MeshStandardMaterial({ color: 0xb08850, roughness: 0.95 }));
      grp.add(part('box', cardboard, 0.24, 0.24, 0.24, F - 0.15, 0.22, -0.78), part('box', cardboard, 0.24, 0.24, 0.24, F + 0.1, 0.22, -0.6),
        part('box', cardboard, 0.24, 0.22, 0.24, F - 0.05, 0.45, -0.68));
    } else {
      // Glasfront mit beleuchtetem Laden + Leuchtstreifen
      const win = texMat('shopwin', shopWindow('shopwin'), { roughness: 0.15, metalness: 0.3, emissiveIntensity: 0.9 });
      grp.add(plane(win, 1.6, 1.2, F - 0.01, 0.75, 0));
      grp.add(part('box', glowMat(0x5ee0ff), 0.04, 0.05, s * 0.92, F + 0.02, 1.62, 0));
      grp.add(part('box', glowMat(0x5ee0ff), 0.04, 0.04, s * 0.92, F + 0.02, 0.06, 0));
    }
    // Leuchtschild auf dem Dach
    const st = signTex(L);
    const signMat = new THREE.MeshStandardMaterial({ map: st.map, emissiveMap: st.emissive, emissive: new THREE.Color(0xffffff), emissiveIntensity: 0.8, roughness: 0.5 });
    grp.add(part('box', metalMat('roof', '#5a5e64', L, { stripes: false }), 0.12, 0.6, 1.7, F - 0.25, 2.12, 0));
    const sign = plane(signMat, 1.65, 0.45, F - 0.18, 2.12, 0); grp.add(sign); P.sign = sign; P.signMat = signMat;
  }
  // Münze, die beim Verkauf hochsteigt
  const coin = part('cyl', 'gold', 0.4, 0.06, 0.4, 0, 2.3, 0);
  coin.rotation.x = Math.PI / 2; coin.visible = false; grp.add(coin); P.coin = coin;
}

// ---------- Förderband-Kurven ----------
// Liefert 0 (gerade), -1 (Kurve, Zulauf von links) oder +1 (Zulauf von rechts).
// Links/rechts gilt in Laufrichtung des Bandes; ein Zulauf von hinten macht das Band immer gerade.
function feedsInto(n, toDir) { // gibt Nachbar n etwas in Richtung toDir aus?
  if (!n) return false;
  if (n.type === 'belt' || n.type === 'miner' || n.type === 'furnace' || n.type === 'assembler') return n.dir === toDir;
  if (n.type === 'splitter') return n.dir === toDir || (n.dir + 1) % 4 === toDir || (n.dir + 3) % 4 === toDir;
  return false;
}
function beltShape(b) {
  const from = k => { const n = bAt(b.x + DX[k], b.y + DY[k]); return feedsInto(n, (k + 2) % 4); };
  if (from((b.dir + 2) % 4)) return 0;
  const left = from((b.dir + 3) % 4), right = from((b.dir + 1) % 4);
  if (left && !right) return -1;
  if (right && !left) return 1;
  return 0;
}

// Ringsegment um die Innenecke (lokal, Feldmitte = 0: Ausgang bei +x, Ecke bei (1, side) in halben Feldbreiten).
// Gruppe 0 = Oberseite (u läuft entlang des Bogens), Gruppe 1 = Innen-/Außenwand.
function arcGeometry(rIn, rOut, y0, y1, side, uLen) {
  const N = 14, h = T3 / 2, pos = [], uv = [], idx = [], g1 = [];
  const pt = (r, i) => { const phi = Math.PI + side * (i / N) * Math.PI / 2; return [(1 + r * Math.cos(phi)) * h, (side + r * Math.sin(phi)) * h]; };
  const quad = (a, b2, c, d, list) => list.push(a, b2, c, a, c, d);
  let v = 0;
  const top = [], walls = [];
  // Oberseite
  for (let i = 0; i <= N; i++) {
    const [xi, zi] = pt(rIn, i), [xo, zo] = pt(rOut, i);
    pos.push(xi, y1, zi, xo, y1, zo); uv.push(i / N * uLen, 0, i / N * uLen, 1);
  }
  for (let i = 0; i < N; i++) quad(i * 2, i * 2 + 1, i * 2 + 3, i * 2 + 2, top);
  v = (N + 1) * 2;
  // Wände (innen und außen)
  for (const r of [rIn, rOut]) {
    const base = v;
    for (let i = 0; i <= N; i++) {
      const [x, z] = pt(r, i);
      pos.push(x, y0, z, x, y1, z); uv.push(i / N, 0, i / N, 1);
    }
    for (let i = 0; i < N; i++) quad(base + i * 2, base + i * 2 + 1, base + i * 2 + 3, base + i * 2 + 2, walls);
    v += (N + 1) * 2;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex([...top, ...walls]);
  geo.addGroup(0, top.length, 0);
  geo.addGroup(top.length, walls.length, 1);
  geo.computeVertexNormals();
  return geo;
}

function buildCurveBelt(grp, side) {
  const key = 'curve' + side;
  if (!v3.geos[key]) {
    // Bandfläche: Mittellinie hat Radius 1 (halbe Feldbreite) → Länge π/2·h; Textur so skaliert, dass sie gleich schnell läuft wie gerade
    v3.geos[key] = {
      top: arcGeometry(0.14, 1.86, 0, 0.22, side, Math.PI / 4),
      inner: arcGeometry(0.06, 0.14, 0, 0.3, side, 1),
      outer: arcGeometry(1.86, 1.94, 0, 0.3, side, 1),
    };
    v3.mats.beltCurve = v3.mats.beltCurve || Object.assign(v3.mats.belt.clone(), { side: THREE.DoubleSide });
    v3.mats.beltSideCurve = v3.mats.beltSideCurve || Object.assign(v3.mats.beltSide.clone(), { side: THREE.DoubleSide });
  }
  const G = v3.geos[key];
  const rail = metalMat('rail', '#6a7078', 2, { stripes: false, panels: 1 });
  v3.mats.railCurve = v3.mats.railCurve || Object.assign(rail.clone(), { side: THREE.DoubleSide });
  const top = new THREE.Mesh(G.top, [v3.mats.beltCurve, v3.mats.beltSideCurve]);
  top.receiveShadow = true;
  const inner = new THREE.Mesh(G.inner, v3.mats.railCurve), outer = new THREE.Mesh(G.outer, v3.mats.railCurve);
  for (const m of [inner, outer]) { m.castShadow = true; m.receiveShadow = true; }
  grp.add(top, inner, outer);
}

function makeModel(b) {
  const grp = new THREE.Group();
  const s = T3, L = b.level || 1;
  grp.userData = { b, parts: {}, level: L };
  const P = grp.userData.parts;
  switch (b.type) {
    case 'belt': {
      const side = b.inv ? beltShape(b) : 0; // 0 = gerade, -1/+1 = Kurve von links/rechts
      grp.userData.shape = side;
      if (side) { buildCurveBelt(grp, side); break; }
      const top = new THREE.Mesh(v3.geos.box, [v3.mats.beltSide, v3.mats.beltSide, v3.mats.belt, v3.mats.beltSide, v3.mats.beltSide, v3.mats.beltSide]);
      top.scale.set(s, 0.22, s * 0.86); top.position.y = 0.11; top.receiveShadow = true;
      grp.add(top);
      const rail = metalMat('rail', '#6a7078', 2, { stripes: false, panels: 1 });
      grp.add(part('box', rail, s, 0.3, 0.08, 0, 0.15, s * 0.45), part('box', rail, s, 0.3, 0.08, 0, 0.15, -s * 0.45));
      break;
    }
    case 'miner': buildMiner(grp, P, L); break;
    case 'furnace': buildFurnace(grp, P, L); break;
    case 'assembler': buildAssembler(grp, P, L, b); break;
    case 'seller': buildSeller(grp, P, L); break;
    case 'splitter': {
      grp.add(part('box', metalMat('split', '#4a4f58', 2, { stripes: false }), s * 0.9, 0.5, s * 0.9, 0, 0.25, 0));
      grp.add(arrowPart(s * 0.42, 0.6));
      for (const d of [1, -1]) { const a = part('cone', 'arrow', 0.25, 0.35, 0.25, 0, 0.6, d * s * 0.38); a.rotation.x = d * Math.PI / 2; grp.add(a); }
      break;
    }
    case 'bin': {
      grp.add(part('cyl', metalMat('bin', '#60656c', 2, { stripes: false, panels: 1 }), s * 0.6, 1.1, s * 0.6, 0, 0.55, 0));
      grp.add(part('cyl', 'dark', s * 0.66, 0.1, s * 0.66, 0, 1.12, 0));
      break;
    }
  }
  const [cx, cz] = tileCenter(b.x, b.y);
  grp.position.set(cx, 0, cz);
  grp.rotation.y = -b.dir * Math.PI / 2;
  return grp;
}

function syncBuildings(dt) {
  const seen = new Set();
  for (const b of buildings) {
    seen.add(b);
    let o = v3.objs.get(b);
    if (o && b.type === 'belt' && o.userData.shape !== beltShape(b)) { // Band wird zur Kurve oder wieder gerade
      v3.scene.remove(o); o = makeModel(b); v3.objs.set(b, o); v3.scene.add(o);
    }
    if (o && o.userData.level !== (b.level || 1)) { // aufgerüstet → neues Modell
      v3.scene.remove(o); o = null;
      const n = makeModel(b); n.userData.pop = 1; v3.objs.set(b, n); v3.scene.add(n); o = n;
    }
    if (!o) { o = makeModel(b); v3.objs.set(b, o); v3.scene.add(o); }
    o.rotation.y = -b.dir * Math.PI / 2;
    if (o.userData.pop > 0) {
      o.userData.pop = Math.max(0, o.userData.pop - dt * 1.5);
      const k = 1 + Math.sin(o.userData.pop * Math.PI) * 0.18;
      o.scale.set(k, k, k);
    }
    const P = o.userData.parts;
    switch (b.type) {
      case 'miner':
        if (b.out.length < 2) P.drill.rotation.y += dt * 4 * lvSpeed(b);
        if (P.ring) P.ring.position.y = 1.6 + Math.sin(simTime * 3) * 0.6;
        break;
      case 'furnace': {
        const on = !!b.job;
        if (on) P.fire.material.color.setRGB(1, 0.45 + Math.sin(simTime * 25 + b.x) * 0.1, 0.1);
        else P.fire.material.color.setHex(0x1a1a1a);
        if (P.smoke) for (const m of P.smoke.children) {
          m.userData.phase = (m.userData.phase + dt * 0.5) % 1;
          const ph = m.userData.phase, top = P.smoke.userData.top;
          m.position.set(top[0] + ph * 0.4, top[1] + ph * 1.8, top[2]);
          const sc = 0.25 + ph * 0.6; m.scale.set(sc, sc, sc);
          m.material.opacity = on ? (1 - ph) * 0.45 : Math.max(0, m.material.opacity - dt);
        }
        break;
      }
      case 'assembler':
        if (b.job) { P.gear.rotation.x += dt * 5; if (P.arm) P.arm.rotation.y = Math.sin(simTime * 3) * 1.2; }
        if (P.recipe !== b.recipe) { P.recipe = b.recipe; P.icon.material = itemIcon(RECIPES[b.recipe].out); }
        break;
      case 'seller':
        P.coin.visible = b.anim > 0;
        if (b.anim > 0) { P.coin.position.y = 2.0 + (1 - b.anim) * 1.0; P.coin.rotation.z += dt * 8; }
        if (P.signMat) P.signMat.emissiveIntensity = 0.8 + b.anim * 0.8;
        break;
    }
  }
  for (const [b, o] of v3.objs) if (!seen.has(b)) { v3.scene.remove(o); v3.objs.delete(b); }
}

function syncItems() {
  let n = 0;
  for (const b of buildings) {
    if (!b.item) continue;
    let m = v3.itemPool[n];
    if (!m) { m = new THREE.Mesh(); m.castShadow = true; v3.scene.add(m); v3.itemPool.push(m); }
    m.visible = true;
    const it = ITEMS[b.item];
    m.geometry = v3.itemGeos[it.shape]; m.material = v3.itemMats[b.item];
    const [cx, cz] = tileCenter(b.x, b.y);
    const side = b.type === 'belt' ? beltShape(b) : 0;
    if (side) {
      // auf dem Bogen: Mittellinie mit Radius einer halben Feldbreite um die Innenecke
      const phi = Math.PI + side * b.p * Math.PI / 2, h = T3 / 2;
      const lx = (1 + Math.cos(phi)) * h, lz = (side + Math.sin(phi)) * h;
      const r = (b.dir + 1) % 4; // lokale +z-Richtung in der Welt
      m.position.set(cx + DX[b.dir] * lx + DX[r] * lz, 0.38, cz + DY[b.dir] * lx + DY[r] * lz);
      m.rotation.set(it.shape === 'wire' ? Math.PI / 2 : 0, -b.dir * Math.PI / 2 - side * b.p * Math.PI / 2 + b.x, 0);
    } else {
      const k = b.type === 'belt' ? (b.p - 0.5) * T3 : 0;
      m.position.set(cx + DX[b.dir] * k, b.type === 'belt' ? 0.38 : 0.7, cz + DY[b.dir] * k);
      m.rotation.set(it.shape === 'wire' ? Math.PI / 2 : 0, b.dir * 0.7 + b.x, 0);
    }
    n++;
  }
  for (let i = n; i < v3.itemPool.length; i++) v3.itemPool[i].visible = false;
}

// ---------- Bauvorschau ----------
function updateGhost() {
  if (v3.ghostType !== tool || (tool === 'assembler' && v3.ghost && v3.ghost.userData.b.recipe !== state.recipe)) {
    if (v3.ghost) v3.scene.remove(v3.ghost);
    v3.ghost = null; v3.ghostType = tool;
    if (tool) {
      const g = makeModel({ type: tool, x: 0, y: 0, dir: 0, recipe: state.recipe });
      g.traverse(o => {
        o.castShadow = false;
        if (o.isMesh) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          o.material = mats.map(m => { const c = m.clone(); c.transparent = true; c.opacity = 0.5; c.depthWrite = false; return c; });
          if (o.material.length === 1) o.material = o.material[0];
        }
      });
      v3.ghost = g; v3.scene.add(g);
    }
  }
  const t = v3.target;
  v3.highlight.visible = !!t;
  if (v3.ghost) v3.ghost.visible = !!t && !bAt(t.x, t.y);
  if (!t) return;
  const [cx, cz] = tileCenter(t.x, t.y);
  v3.highlight.position.x = cx; v3.highlight.position.z = cz;
  let ok = true;
  if (tool) ok = canPlace(tool, t.x, t.y) && state.money >= BUILDINGS[tool].cost && !(SOLID[tool] && playerInTile(t.x, t.y));
  v3.highlight.material.color.setHex(demolish ? 0xff3030 : tool ? (ok ? 0x5cc85c : 0xe05050) : 0xffffff);
  v3.highlight.material.opacity = demolish ? 0.45 : 0.25;
  if (v3.ghost) { v3.ghost.position.set(cx, 0, cz); v3.ghost.rotation.y = -toolDir * Math.PI / 2; }
}


// =====================================================================
//  Spielfigur (Bauarbeiter mit Helm), schaut nach +x
// =====================================================================
function makeAvatar() {
  const g = new THREE.Group();
  const M = (c, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.7 }, o));
  const pants = M(0x2a3a5a), vest = M(0xff8a1e), skin = M(0xe8b890), helmet = M(0xffd23a, { roughness: 0.35 }),
    boots = M(0x3a2a1a), refl = M(0xeeeeee, { emissive: 0x666666 }), eye = M(0x111111);
  const box = (m, sx, sy, sz, x, y, z) => { const b = new THREE.Mesh(v3.geos.box, m); b.scale.set(sx, sy, sz); b.position.set(x, y, z); b.castShadow = true; return b; };
  const leg = z => { const l = new THREE.Group(); l.position.set(0, 0.8, z); l.add(box(pants, 0.2, 0.68, 0.2, 0, -0.34, 0), box(boots, 0.28, 0.14, 0.24, 0.04, -0.73, 0)); return l; };
  const arm = z => { const a = new THREE.Group(); a.position.set(0, 1.36, z); a.add(box(vest, 0.15, 0.5, 0.15, 0, -0.24, 0), box(skin, 0.13, 0.13, 0.13, 0, -0.54, 0)); return a; };
  const legL = leg(-0.13), legR = leg(0.13), armL = arm(-0.33), armR = arm(0.33);
  const head = new THREE.Mesh(v3.geos.sphere, skin); head.scale.set(0.34, 0.36, 0.34); head.position.y = 1.62; head.castShadow = true;
  const hat = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), helmet);
  hat.scale.set(0.42, 0.34, 0.42); hat.position.y = 1.68; hat.castShadow = true;
  g.add(legL, legR, armL, armR, head, hat,
    box(vest, 0.32, 0.58, 0.5, 0, 1.1, 0), box(refl, 0.33, 0.06, 0.51, 0, 1.0, 0), box(refl, 0.33, 0.06, 0.51, 0, 1.22, 0),
    box(helmet, 0.22, 0.03, 0.4, 0.17, 1.68, 0),
    box(eye, 0.02, 0.05, 0.05, 0.17, 1.64, -0.07), box(eye, 0.02, 0.05, 0.05, 0.17, 1.64, 0.07));
  g.userData = { legL, legR, armL, armR };
  return g;
}

function playerInTile(x, y) {
  const p = v3.player, x0 = x * T3, z0 = y * T3;
  return p.x + P_RADIUS > x0 && p.x - P_RADIUS < x0 + T3 && p.z + P_RADIUS > z0 && p.z - P_RADIUS < z0 + T3;
}
// wird von place() in game.js abgefragt
function blockedByPlayer(type, x, y) { return !!SOLID[type] && playerInTile(x, y); }

// Spieler in die Kartenmitte (freies Feld) setzen
function resetPlayer() {
  const p = v3.player;
  p.x = MAP_W * T3 / 2; p.z = MAP_H * T3 / 2; p.y = 0; p.vy = 0;
  for (let r = 0; r < 30 && solidAt(p.x, p.z); r++) p.z += T3;
}

// Welches Feld liegt unter Maus/Finger?
const _ndc = new THREE.Vector2();
function tileAtScreen(sx, sy) {
  _ndc.set(sx / innerWidth * 2 - 1, -(sy / innerHeight) * 2 + 1);
  v3.ray.setFromCamera(_ndc, v3.camera);
  const hit = v3.ray.intersectObjects([v3.ground, ...v3.objs.values()], true)[0];
  if (!hit) return null;
  let o = hit.object;
  while (o && !(o.userData && o.userData.b)) o = o.parent;
  if (o && o.userData.b && buildings.includes(o.userData.b)) return { x: o.userData.b.x, y: o.userData.b.y };
  const x = Math.floor(hit.point.x / T3), y = Math.floor(hit.point.z / T3);
  return inMap(x, y) ? { x, y } : null;
}

// ---------- Bauen / Abreißen / Auswählen ----------
function startBuild(t) {
  if (!t) return;
  if (demolish) { dragging = { button: 2 }; removeAt(t.x, t.y); return; }
  dragging = { button: 0, lastTx: t.x, lastTy: t.y, lastBelt: null };
  const b = place(tool, t.x, t.y, toolDir);
  if (b && tool === 'belt') dragging.lastBelt = b;
}
function selectAt(t) {
  selected = t ? bAt(t.x, t.y) : null;
  renderInfo();
  if (selected && touchUI) document.getElementById('side').classList.add('open');
}
function rotateCam(dx, dy) {
  const c = v3.cam;
  c.yaw -= dx * 0.008;
  c.pitch = Math.max(0.3, Math.min(1.45, c.pitch + dy * 0.006));
}
function zoomCam(f) { v3.cam.dist = Math.max(5, Math.min(90, v3.cam.dist * f)); }

// =====================================================================
//  Eingabe: Maus, Tastatur, Touch
// =====================================================================
// Maus:   Linksklick = bauen / Gebäude anklicken · ziehen = Bänder legen (mit Gebäude) bzw. Kamera drehen (ohne)
//         Rechtsklick = abreißen · rechts ziehen = Kamera drehen · Mausrad = zoomen
// Touch:  Joystick = laufen · tippen = bauen/anklicken · ziehen = Bänder legen bzw. Kamera drehen · 2 Finger = zoomen
function setupInput(cv) {
  const P = v3.pointer;
  let md = null; // gedrückte Maustaste { button, sx, sy, moved }

  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('mousemove', e => {
    P.x = e.clientX; P.y = e.clientY; P.inside = true;
    if (!md) return;
    const dx = e.clientX - md.lx, dy = e.clientY - md.ly;
    md.lx = e.clientX; md.ly = e.clientY;
    if (Math.hypot(e.clientX - md.sx, e.clientY - md.sy) > 6) md.moved = true;
    if (md.build) {
      const t = tileAtScreen(e.clientX, e.clientY);
      if (t && dragging) dragTo(t.x, t.y);
    } else if (md.moved) rotateCam(dx, dy);
  });
  cv.addEventListener('mouseleave', () => { P.inside = false; });
  cv.addEventListener('mousedown', e => {
    P.x = e.clientX; P.y = e.clientY; P.inside = true;
    md = { button: e.button, sx: e.clientX, sy: e.clientY, lx: e.clientX, ly: e.clientY, moved: false, build: false };
    if (e.button === 0 && (tool || demolish)) { md.build = true; startBuild(tileAtScreen(e.clientX, e.clientY)); }
  });
  addEventListener('mouseup', e => {
    if (!md) return;
    if (!md.moved && !md.build) {
      const t = tileAtScreen(md.sx, md.sy);
      if (md.button === 0) selectAt(t);
      else if (md.button === 2 && t) removeAt(t.x, t.y);
    }
    md = null; dragging = null;
  });
  cv.addEventListener('wheel', e => { e.preventDefault(); zoomCam(e.deltaY > 0 ? 1.12 : 1 / 1.12); }, { passive: false });

  // ---------- Tastatur ----------
  addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    const k = e.key.toLowerCase();
    v3.keys[e.code] = true;
    const idx = BUILD_ORDER.findIndex(t => BUILDINGS[t].key === e.key);
    const hover = () => (v3.target && bAt(v3.target.x, v3.target.y)) || selected;
    if (idx >= 0) selectTool(tool === BUILD_ORDER[idx] ? null : BUILD_ORDER[idx]);
    else if (k === 'r') {
      if (tool) toolDir = (toolDir + (e.shiftKey ? 3 : 1)) % 4;
      else { const b = hover(); if (b) b.dir = (b.dir + (e.shiftKey ? 3 : 1)) % 4; }
    }
    else if (k === 'x') setDemolish(!demolish);
    else if (k === 'u') upgradeBuilding(hover());
    else if (k === 'p') togglePause();
    else if (k === ' ') { const p = v3.player; if (p.onGround) { p.vy = 6; p.onGround = false; } e.preventDefault(); }
    else if (k === 'escape') { selectTool(null); setDemolish(false); selected = null; renderInfo(); closeModals(); }
    if (e.key.startsWith('Arrow')) e.preventDefault();
  });
  addEventListener('keyup', e => { v3.keys[e.code] = false; });
  addEventListener('blur', () => { v3.keys = {}; });

  // ---------- Touch auf dem Bild ----------
  let tc = null; // { id, sx, sy, lx, ly, moved, build, tile } oder { pinch, dist }
  const tdist = ts => Math.hypot(ts[0].clientX - ts[1].clientX, ts[0].clientY - ts[1].clientY);
  cv.addEventListener('touchstart', e => {
    e.preventDefault();
    enableTouchUI();
    if (e.touches.length >= 2) { dragging = null; tc = { pinch: true, dist: tdist(e.touches) }; P.inside = false; return; }
    const t = e.changedTouches[0];
    P.x = t.clientX; P.y = t.clientY; P.inside = true;
    tc = { id: t.identifier, sx: t.clientX, sy: t.clientY, lx: t.clientX, ly: t.clientY, moved: false, build: !!(tool || demolish), tile: tileAtScreen(t.clientX, t.clientY), started: false };
  }, { passive: false });
  cv.addEventListener('touchmove', e => {
    e.preventDefault();
    if (!tc) return;
    if (tc.pinch) { if (e.touches.length >= 2) { const d = tdist(e.touches); zoomCam(tc.dist / d); tc.dist = d; } return; }
    for (const t of e.changedTouches) {
      if (t.identifier !== tc.id) continue;
      P.x = t.clientX; P.y = t.clientY;
      const dx = t.clientX - tc.lx, dy = t.clientY - tc.ly;
      tc.lx = t.clientX; tc.ly = t.clientY;
      if (Math.hypot(t.clientX - tc.sx, t.clientY - tc.sy) > 10) tc.moved = true;
      if (tc.build) {
        const tile = tileAtScreen(t.clientX, t.clientY);
        if (!tc.started && tile && tc.tile && (tile.x !== tc.tile.x || tile.y !== tc.tile.y)) { tc.started = true; startBuild(tc.tile); }
        if (tc.started && tile && dragging) dragTo(tile.x, tile.y);
      } else if (tc.moved) rotateCam(dx * 1.3, dy * 1.3);
    }
  }, { passive: false });
  const tend = e => {
    e.preventDefault();
    if (!tc) return;
    if (tc.pinch) { if (e.touches.length === 0) tc = null; return; }
    if (e.type === 'touchend') {
      if (tc.build && !tc.started) startBuild(tc.tile);
      else if (!tc.build && !tc.moved) selectAt(tc.tile);
    }
    tc = null; dragging = null; P.inside = false;
  };
  cv.addEventListener('touchend', tend, { passive: false });
  cv.addEventListener('touchcancel', tend, { passive: false });

  // ---------- Joystick zum Laufen ----------
  const joy = document.getElementById('joy'), knob = document.getElementById('joyKnob');
  let jid = null;
  const setJoy = t => {
    const r = joy.getBoundingClientRect(), R = r.width / 2;
    let dx = t.clientX - (r.left + R), dy = t.clientY - (r.top + R);
    const d = Math.hypot(dx, dy);
    if (d > R) { dx *= R / d; dy *= R / d; }
    v3.joy.x = dx / R; v3.joy.y = dy / R;
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
  };
  joy.addEventListener('touchstart', e => { e.preventDefault(); enableTouchUI(); const t = e.changedTouches[0]; jid = t.identifier; setJoy(t); }, { passive: false });
  joy.addEventListener('touchmove', e => { e.preventDefault(); for (const t of e.changedTouches) if (t.identifier === jid) setJoy(t); }, { passive: false });
  const jend = e => {
    e.preventDefault();
    for (const t of e.changedTouches) if (t.identifier === jid) { jid = null; v3.joy.x = v3.joy.y = 0; knob.style.transform = ''; }
  };
  joy.addEventListener('touchend', jend, { passive: false });
  joy.addEventListener('touchcancel', jend, { passive: false });
}

// =====================================================================
//  Bewegung
// =====================================================================
function solidAt(px, pz) {
  const x0 = Math.floor((px - P_RADIUS) / T3), x1 = Math.floor((px + P_RADIUS) / T3);
  const z0 = Math.floor((pz - P_RADIUS) / T3), z1 = Math.floor((pz + P_RADIUS) / T3);
  for (let y = z0; y <= z1; y++) for (let x = x0; x <= x1; x++) {
    if (!inMap(x, y)) return true;
    const b = tiles[y][x].b;
    if (b && SOLID[b.type]) {
      const m = T3 * 0.04;
      const nx = Math.max(x * T3 + m, Math.min(px, (x + 1) * T3 - m));
      const nz = Math.max(y * T3 + m, Math.min(pz, (y + 1) * T3 - m));
      if ((px - nx) ** 2 + (pz - nz) ** 2 < P_RADIUS * P_RADIUS) return true;
    }
  }
  return false;
}

function movePlayer(dt) {
  const p = v3.player, K = v3.keys, c = v3.cam;
  // Kamera mit Q/E drehen
  if (K.KeyQ) c.yaw += dt * 2;
  if (K.KeyE) c.yaw -= dt * 2;
  let f = 0, s = 0;
  if (K.KeyW || K.ArrowUp) f += 1;
  if (K.KeyS || K.ArrowDown) f -= 1;
  if (K.KeyD || K.ArrowRight) s += 1;
  if (K.KeyA || K.ArrowLeft) s -= 1;
  let speed = (K.ShiftLeft || K.ShiftRight) ? 10 : 6;
  if (v3.joy.x || v3.joy.y) {
    f = -v3.joy.y; s = v3.joy.x;
    speed = Math.min(1, Math.hypot(f, s)) * 8;
  }
  const len = Math.hypot(f, s);
  // Laufrichtung relativ zur Kamera
  const fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw), rx = Math.cos(c.yaw), rz = -Math.sin(c.yaw);
  let vx = 0, vz = 0;
  if (len > 0.01) {
    vx = (fx * f + rx * s) / Math.max(1, len) * speed;
    vz = (fz * f + rz * s) / Math.max(1, len) * speed;
    // Figur dreht sich weich in Laufrichtung
    const want = Math.atan2(-vz, vx);
    let d = want - p.face; d = Math.atan2(Math.sin(d), Math.cos(d));
    p.face += d * Math.min(1, dt * 12);
    p.walk += dt * Math.hypot(vx, vz) * 1.6;
  } else p.walk *= 0.85;
  // Förderbänder tragen die Figur mit
  if (p.onGround) {
    const b = bAt(Math.floor(p.x / T3), Math.floor(p.z / T3));
    if (b && b.type === 'belt') { vx += DX[b.dir] * beltSpeed() * T3; vz += DY[b.dir] * beltSpeed() * T3; }
  }
  const nx = p.x + vx * dt;
  if (!solidAt(nx, p.z)) p.x = nx;
  const nz = p.z + vz * dt;
  if (!solidAt(p.x, nz)) p.z = nz;
  p.vy -= 18 * dt;
  p.y += p.vy * dt;
  const b = bAt(Math.floor(p.x / T3), Math.floor(p.z / T3));
  const floor = b && b.type === 'belt' ? 0.22 : 0;
  if (p.y <= floor) { p.y = floor; p.vy = 0; p.onGround = true; }
}

function resize3d() {
  if (!v3.ready && !v3.renderer) return;
  v3.renderer.setSize(innerWidth, innerHeight, false);
  v3.camera.aspect = innerWidth / innerHeight;
  v3.camera.updateProjectionMatrix();
}
addEventListener('resize', resize3d);

// =====================================================================
//  Bild zeichnen
// =====================================================================
function render3d(dt) {
  if (v3.groundTiles !== tiles) buildGround();
  movePlayer(dt);
  const p = v3.player, c = v3.cam, cam3 = v3.camera;
  // Figur
  const A = v3.avatar;
  A.position.set(p.x, p.y, p.z);
  A.rotation.y = p.face;
  const sw = Math.sin(p.walk) * Math.min(1, Math.abs(Math.sin(p.walk)) + 0.3) * 0.7;
  A.userData.legL.rotation.z = sw; A.userData.legR.rotation.z = -sw;
  A.userData.armL.rotation.z = -sw * 0.8; A.userData.armR.rotation.z = sw * 0.8;
  // Kamera von schräg oben hinter der Figur
  const tx = p.x, ty = p.y + 1.2, tz = p.z;
  cam3.position.set(
    tx + Math.sin(c.yaw) * Math.cos(c.pitch) * c.dist,
    ty + Math.sin(c.pitch) * c.dist,
    tz + Math.cos(c.yaw) * Math.cos(c.pitch) * c.dist);
  cam3.lookAt(tx, ty, tz);
  v3.scene.fog.near = c.dist + 70; v3.scene.fog.far = c.dist + 380;
  updateWorld(dt);
  v3.sun.position.set(p.x + 20, 40, p.z + 10);
  v3.sun.target.position.set(p.x, 0, p.z);

  if (!paused) v3.beltTex.offset.x -= beltSpeed() * dt / 2;
  syncBuildings(dt);
  updateOreVisibility();
  syncItems();
  v3.target = v3.pointer.inside ? tileAtScreen(v3.pointer.x, v3.pointer.y) : null;
  updateGhost();
  // ausgewähltes Gebäude markieren
  v3.selMark.visible = !!selected;
  if (selected) { const [sx, sz] = tileCenter(selected.x, selected.y); v3.selMark.position.x = sx; v3.selMark.position.z = sz; }
  v3.renderer.render(v3.scene, cam3);
}
