'use strict';
// =====================================================================
//  3D-Modus: begehbare Fabrik in der Ego-Perspektive (Three.js)
// =====================================================================


const T3 = 2;            // Weltgröße eines Feldes
const EYE = 1.7;         // Augenhöhe
const P_RADIUS = 0.35;   // Spielerradius
const REACH = 16;        // Bau-Reichweite

const v3 = {
  ready: false, renderer: null, scene: null, camera: null, sun: null,
  ground: null, groundTiles: null, objs: new Map(), itemPool: [], itemUsed: 0,
  ghost: null, ghostType: null, ghostDir: -1, highlight: null,
  player: { x: 0, y: 0, z: 0, vy: 0, yaw: 0, pitch: 0, onGround: true },
  locked: false, target: null, keys: {}, beltTex: null, mats: {}, geos: {}, itemMats: {}, itemGeos: {},
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
  scene.background = new THREE.Color(0x9cc8ec);
  scene.fog = new THREE.Fog(0x9cc8ec, 40, 120);
  v3.scene = scene;
  v3.camera = new THREE.PerspectiveCamera(70, 1, 0.05, 300);
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

  // Bodenmarkierung und Bauvorschau
  v3.highlight = new THREE.Mesh(new THREE.PlaneGeometry(T3 * 0.98, T3 * 0.98),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, depthWrite: false }));
  v3.highlight.rotation.x = -Math.PI / 2;
  v3.highlight.position.y = 0.02;
  scene.add(v3.highlight);

  v3.ray = new THREE.Raycaster();
  v3.ray.far = REACH;

  // Eingabe
  cv.addEventListener('click', () => {
    if (touchUI || v3.locked) return;
    try { const r = cv.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* nicht verfügbar */ }
  });
  setupTouch3d(cv);
  document.addEventListener('pointerlockchange', () => {
    if (touchUI) return;
    v3.locked = document.pointerLockElement === cv;
    document.getElementById('lockHint').classList.toggle('hidden', v3.locked || !mode3d);
    if (!v3.locked) v3.keys = {};
  });
  document.addEventListener('mousemove', e => {
    if (!v3.locked) return;
    const p = v3.player;
    p.yaw -= e.movementX * 0.0022;
    p.pitch = Math.max(-1.5, Math.min(1.5, p.pitch - e.movementY * 0.0022));
  });
  cv.addEventListener('mousedown', e => { if (v3.locked) on3dClick(e.button); });
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('wheel', e => {
    if (!v3.locked) return;
    e.preventDefault();
    const order = [null, ...BUILD_ORDER];
    let i = order.indexOf(tool) + (e.deltaY > 0 ? 1 : -1);
    i = (i + order.length) % order.length;
    selectTool(order[i]);
  }, { passive: false });
  addEventListener('keyup', e => { v3.keys[e.code] = false; });

  v3.ready = true;
  return true;
}

// Bodentextur aus der Karte erzeugen
function buildGround() {
  if (v3.ground) { v3.scene.remove(v3.ground); v3.ground.material.map.dispose(); v3.ground.geometry.dispose(); }
  const S = 16;
  const c = document.createElement('canvas'); c.width = MAP_W * S; c.height = MAP_H * S;
  const g = c.getContext('2d');
  const oreCol = { iron_ore: '#7d6f66', copper_ore: '#b5622f', coal: '#1e1e1e' };
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
    const t = tiles[y][x];
    const v = 70 + Math.floor(t.v * 14);
    g.fillStyle = `rgb(${v - 18},${v + 24},${v - 30})`;
    g.fillRect(x * S, y * S, S, S);
    if (t.ore) {
      g.fillStyle = 'rgba(60,45,30,.45)'; g.fillRect(x * S, y * S, S, S);
      g.fillStyle = oreCol[t.ore];
      const r = rng(x * 9973 + y * 31);
      for (let i = 0; i < 5; i++) { g.beginPath(); g.arc(x * S + 2 + r() * 12, y * S + 2 + r() * 12, 1.2 + r() * 1.8, 0, 7); g.fill(); }
    }
  }
  g.strokeStyle = 'rgba(0,0,0,.12)'; g.lineWidth = 1;
  g.beginPath();
  for (let x = 0; x <= MAP_W; x++) { g.moveTo(x * S + .5, 0); g.lineTo(x * S + .5, c.height); }
  for (let y = 0; y <= MAP_H; y++) { g.moveTo(0, y * S + .5); g.lineTo(c.width, y * S + .5); }
  g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 8;
  tex.magFilter = THREE.NearestFilter;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(MAP_W * T3, MAP_H * T3),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(MAP_W * T3 / 2, 0, MAP_H * T3 / 2);
  mesh.receiveShadow = true;
  v3.scene.add(mesh);
  v3.ground = mesh;
  v3.groundTiles = tiles;
  // vorhandene Gebäude-Objekte verwerfen
  for (const o of v3.objs.values()) v3.scene.remove(o);
  v3.objs.clear();
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

function makeModel(b) {
  const grp = new THREE.Group();
  const s = T3;
  grp.userData = { b, parts: {} };
  const P = grp.userData.parts;
  switch (b.type) {
    case 'belt': {
      const top = new THREE.Mesh(v3.geos.box, [v3.mats.beltSide, v3.mats.beltSide, v3.mats.belt, v3.mats.beltSide, v3.mats.beltSide, v3.mats.beltSide]);
      top.scale.set(s, 0.22, s * 0.86); top.position.y = 0.11; top.receiveShadow = true;
      grp.add(top);
      grp.add(part('box', 'dark', s, 0.3, 0.08, 0, 0.15, s * 0.45), part('box', 'dark', s, 0.3, 0.08, 0, 0.15, -s * 0.45));
      break;
    }
    case 'miner': {
      grp.add(part('box', 'minerBase', s * 0.9, 0.9, s * 0.9, 0, 0.45, 0));
      grp.add(part('box', 'dark', s * 0.5, 1.2, s * 0.5, 0, 1.4, 0));
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]])
        grp.add(part('box', 'metal', 0.1, 1.6, 0.1, dx * 0.55, 1.3, dz * 0.55));
      const drill = new THREE.Group();
      drill.position.y = 2.2;
      for (let i = 0; i < 3; i++) { const bl = part('box', 'metal', 0.9, 0.08, 0.16, 0, 0, 0); bl.rotation.y = i * Math.PI / 3; drill.add(bl); }
      grp.add(drill); P.drill = drill;
      grp.add(arrowPart(s * 0.5, 0.5));
      break;
    }
    case 'furnace': {
      grp.add(part('box', 'brick', s * 0.9, 1.5, s * 0.9, 0, 0.75, 0));
      grp.add(part('cyl', 'brick', 0.45, 1.3, 0.45, -0.35, 2.1, 0.35));
      const fire = part('box', new THREE.MeshBasicMaterial({ color: 0x222222 }), 0.05, 0.5, 0.8, s * 0.451, 0.55, 0);
      grp.add(fire); P.fire = fire;
      grp.add(arrowPart(s * 0.5, 1.2));
      break;
    }
    case 'assembler': {
      grp.add(part('box', 'asm', s * 0.94, 1.6, s * 0.94, 0, 0.8, 0));
      grp.add(part('box', 'asmTop', s * 0.7, 0.2, s * 0.7, 0, 1.7, 0));
      const icon = new THREE.Mesh(new THREE.PlaneGeometry(s * 0.55, s * 0.55), itemIcon(RECIPES[b.recipe]?.out || 'gear'));
      icon.rotation.x = -Math.PI / 2; icon.position.y = 1.81; grp.add(icon); P.icon = icon; P.recipe = b.recipe;
      const gear = part('gear', 'metal', 0.8, 0.12, 0.8, 0, 1.0, 0);
      gear.rotation.z = Math.PI / 2; gear.position.x = s * 0.48; grp.add(gear); P.gear = gear;
      grp.add(arrowPart(s * 0.5, 0.4));
      break;
    }
    case 'splitter': {
      grp.add(part('box', 'splitter', s * 0.9, 0.5, s * 0.9, 0, 0.25, 0));
      grp.add(arrowPart(s * 0.42, 0.6));
      for (const d of [1, -1]) { const a = part('cone', 'arrow', 0.25, 0.35, 0.25, 0, 0.6, d * s * 0.38); a.rotation.x = d * Math.PI / 2; grp.add(a); }
      break;
    }
    case 'seller': {
      grp.add(part('box', 'seller', s * 0.92, 1.2, s * 0.92, 0, 0.6, 0));
      grp.add(part('box', 'gold', s * 0.96, 0.12, s * 0.96, 0, 1.25, 0));
      const coin = part('cyl', 'gold', 0.9, 0.12, 0.9, 0, 2.0, 0);
      coin.rotation.x = Math.PI / 2; grp.add(coin); P.coin = coin;
      break;
    }
    case 'bin': {
      grp.add(part('cyl', 'bin', s * 0.6, 1.1, s * 0.6, 0, 0.55, 0));
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
    if (!o) { o = makeModel(b); v3.objs.set(b, o); v3.scene.add(o); }
    o.rotation.y = -b.dir * Math.PI / 2;
    const P = o.userData.parts;
    switch (b.type) {
      case 'miner': if (b.out.length < 2) P.drill.rotation.y += dt * 8; break;
      case 'furnace': {
        const on = !!b.job;
        if (on) P.fire.material.color.setRGB(1, 0.45 + Math.sin(simTime * 25 + b.x) * 0.1, 0.1);
        else P.fire.material.color.setHex(0x222222);
        break;
      }
      case 'assembler':
        if (b.job) P.gear.rotation.x += dt * 5;
        if (P.recipe !== b.recipe) { P.recipe = b.recipe; P.icon.material = itemIcon(RECIPES[b.recipe].out); }
        break;
      case 'seller':
        P.coin.rotation.z += dt * 2;
        P.coin.position.y = 2.0 + Math.sin(simTime * 2) * 0.12 + b.anim * 0.4;
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
    const k = b.type === 'belt' ? (b.p - 0.5) * T3 : 0;
    m.position.set(cx + DX[b.dir] * k, b.type === 'belt' ? 0.38 : 0.7, cz + DY[b.dir] * k);
    m.rotation.set(it.shape === 'wire' ? Math.PI / 2 : 0, b.dir * 0.7 + b.x, 0);
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

function playerInTile(x, y) {
  const p = v3.player, x0 = x * T3, z0 = y * T3;
  return p.x + P_RADIUS > x0 && p.x - P_RADIUS < x0 + T3 && p.z + P_RADIUS > z0 && p.z - P_RADIUS < z0 + T3;
}

function findTarget() {
  const cam = v3.camera;
  v3.ray.setFromCamera({ x: 0, y: 0 }, cam);
  const objs = [v3.ground, ...v3.objs.values()];
  const hit = v3.ray.intersectObjects(objs, true)[0];
  if (!hit) return null;
  let o = hit.object;
  while (o && !(o.userData && o.userData.b)) o = o.parent;
  if (o && o.userData.b && buildings.includes(o.userData.b)) return { x: o.userData.b.x, y: o.userData.b.y };
  const x = Math.floor(hit.point.x / T3), y = Math.floor(hit.point.z / T3);
  return inMap(x, y) ? { x, y } : null;
}

function on3dClick(button) {
  const t = v3.target;
  if (!t) return;
  if (button === 2 || (button === 0 && demolish)) { removeAt(t.x, t.y); return; }
  if (button !== 0) return;
  if (tool) {
    if (SOLID[tool] && playerInTile(t.x, t.y)) { toast('Hier stehst du gerade!', true); return; }
    place(tool, t.x, t.y, toolDir);
  } else {
    selected = bAt(t.x, t.y);
    renderInfo();
  }
}

// Tastatur im 3D-Modus. Rückgabe true = verarbeitet.
function on3dKey(e) {
  v3.keys[e.code] = true;
  const k = e.key.toLowerCase();
  if (k === ' ') { if (v3.player.onGround) { v3.player.vy = 6; v3.player.onGround = false; } e.preventDefault(); return true; }
  if (k === 'p') { paused = !paused; $('pause').classList.toggle('hidden', !paused); return true; }
  if (k === 'r' && !tool && v3.target) {
    const b = bAt(v3.target.x, v3.target.y);
    if (b) b.dir = (b.dir + (e.shiftKey ? 3 : 1)) % 4;
    return true;
  }
  if (k === 'q') {
    const b = v3.target && bAt(v3.target.x, v3.target.y);
    if (b) { selectTool(b.type); toolDir = b.dir; if (b.recipe) state.recipe = b.recipe; renderInfo(); }
    else selectTool(null);
    return true;
  }
  if (['w', 'a', 's', 'd', 'shift'].includes(k) || e.key.startsWith('Arrow')) return true;
  return false; // Rest (1–7, R mit Werkzeug, Esc) übernimmt game.js
}

// ---------- Spielerbewegung ----------
function solidAt(px, pz) {
  const x0 = Math.floor((px - P_RADIUS) / T3), x1 = Math.floor((px + P_RADIUS) / T3);
  const z0 = Math.floor((pz - P_RADIUS) / T3), z1 = Math.floor((pz + P_RADIUS) / T3);
  for (let y = z0; y <= z1; y++) for (let x = x0; x <= x1; x++) {
    if (!inMap(x, y)) return true;
    const b = tiles[y][x].b;
    if (b && SOLID[b.type]) {
      // Kreis gegen Box (Gebäude füllen ~92 % des Feldes)
      const m = T3 * 0.04;
      const nx = Math.max(x * T3 + m, Math.min(px, (x + 1) * T3 - m));
      const nz = Math.max(y * T3 + m, Math.min(pz, (y + 1) * T3 - m));
      if ((px - nx) ** 2 + (pz - nz) ** 2 < P_RADIUS * P_RADIUS) return true;
    }
  }
  return false;
}

function movePlayer(dt) {
  const p = v3.player, K = v3.keys;
  let f = 0, s = 0;
  if (K.KeyW || K.ArrowUp) f += 1;
  if (K.KeyS || K.ArrowDown) f -= 1;
  if (K.KeyD || K.ArrowRight) s += 1;
  if (K.KeyA || K.ArrowLeft) s -= 1;
  let speed = (K.ShiftLeft || K.ShiftRight) ? 9 : 5;
  if (v3.joy.x || v3.joy.y) {
    f = -v3.joy.y; s = v3.joy.x;
    const m = Math.min(1, Math.hypot(f, s));
    speed = m > 0.9 ? 8 : 5 * m / 0.9 + 0.01;
  }
  const len = Math.hypot(f, s) || 1;
  const sin = Math.sin(p.yaw), cos = Math.cos(p.yaw);
  let vx = (-sin * f + cos * s) / len * speed;
  let vz = (-cos * f - sin * s) / len * speed;
  // Förderbänder tragen den Spieler mit
  if (p.onGround) {
    const b = bAt(Math.floor(p.x / T3), Math.floor(p.z / T3));
    if (b && b.type === 'belt') { vx += DX[b.dir] * beltSpeed() * T3; vz += DY[b.dir] * beltSpeed() * T3; }
  }
  const nx = p.x + vx * dt;
  if (!solidAt(nx, p.z)) p.x = nx;
  const nz = p.z + vz * dt;
  if (!solidAt(p.x, nz)) p.z = nz;
  // Schwerkraft
  p.vy -= 18 * dt;
  p.y += p.vy * dt;
  const b = bAt(Math.floor(p.x / T3), Math.floor(p.z / T3));
  const floor = b && b.type === 'belt' ? 0.22 : 0;
  if (p.y <= floor) { p.y = floor; p.vy = 0; p.onGround = true; }
}

// ---------- Ein/Aus ----------
function set3d(on) {
  if (on && !init3d()) return;
  mode3d = on;
  document.getElementById('game').classList.toggle('hidden', on);
  document.getElementById('game3d').classList.toggle('hidden', !on);
  document.getElementById('crosshair').classList.toggle('hidden', !on);
  if (touchUI) v3.locked = on;
  document.getElementById('touch3d').classList.toggle('hidden', !on || !touchUI);
  document.getElementById('lockHint').classList.toggle('hidden', !on || v3.locked);
  document.getElementById('btn3d').textContent = on ? '2D' : '3D';
  if (on) {
    if (v3.groundTiles !== tiles) buildGround();
    // Spieler in die Bildmitte der 2D-Ansicht setzen
    const cxw = (cam.x + innerWidth / cam.zoom / 2) / TILE, cyw = (cam.y + innerHeight / cam.zoom / 2) / TILE;
    const p = v3.player;
    p.x = Math.max(1, Math.min(MAP_W - 1, cxw)) * T3; p.z = Math.max(1, Math.min(MAP_H - 1, cyw)) * T3;
    p.y = 0; p.vy = 0;
    // freien Platz suchen
    for (let r = 0; r < 20 && solidAt(p.x, p.z); r++) p.z += T3;
    resize3d();
  } else {
    if (document.pointerLockElement) document.exitPointerLock();
    // 2D-Kamera auf Spielerposition setzen
    cam.x = v3.player.x / T3 * TILE - innerWidth / cam.zoom / 2;
    cam.y = v3.player.z / T3 * TILE - innerHeight / cam.zoom / 2;
    clampCam();
  }
}

function resize3d() {
  if (!v3.ready) return;
  v3.renderer.setSize(innerWidth, innerHeight, false);
  v3.camera.aspect = innerWidth / innerHeight;
  v3.camera.updateProjectionMatrix();
}
addEventListener('resize', resize3d);

function render3d(dt) {
  if (v3.groundTiles !== tiles) buildGround();
  if (v3.locked) movePlayer(dt);
  const p = v3.player, cam3 = v3.camera;
  cam3.position.set(p.x, p.y + EYE, p.z);
  cam3.rotation.set(p.pitch, p.yaw, 0);
  v3.sun.position.set(p.x + 20, 40, p.z + 10);
  v3.sun.target.position.set(p.x, 0, p.z);

  if (!paused) v3.beltTex.offset.x -= beltSpeed() * dt / 2;
  syncBuildings(dt);
  syncItems();
  v3.target = v3.locked ? findTarget() : null;
  updateGhost();
  v3.renderer.render(v3.scene, cam3);
}

// ---------- Touch-Steuerung (3D) ----------
// Linker Joystick = laufen, auf dem Bild wischen = umsehen, kurz tippen = bauen/auswählen am Fadenkreuz.
function setupTouch3d(cv) {
  cv.addEventListener('touchstart', e => {
    e.preventDefault();
    enableTouchUI();
    if (mode3d && !v3.locked) { v3.locked = true; document.getElementById('lockHint').classList.add('hidden'); document.getElementById('touch3d').classList.remove('hidden'); }
    if (v3.look) return;
    const t = e.changedTouches[0];
    v3.look = { id: t.identifier, x: t.clientX, y: t.clientY, sx: t.clientX, sy: t.clientY, time: performance.now(), moved: false };
  }, { passive: false });
  cv.addEventListener('touchmove', e => {
    e.preventDefault();
    const L = v3.look;
    if (!L) return;
    for (const t of e.changedTouches) {
      if (t.identifier !== L.id) continue;
      const p = v3.player;
      p.yaw -= (t.clientX - L.x) * 0.006;
      p.pitch = Math.max(-1.5, Math.min(1.5, p.pitch - (t.clientY - L.y) * 0.006));
      L.x = t.clientX; L.y = t.clientY;
      if (Math.hypot(t.clientX - L.sx, t.clientY - L.sy) > 12) L.moved = true;
    }
  }, { passive: false });
  const end = e => {
    e.preventDefault();
    const L = v3.look;
    if (!L) return;
    for (const t of e.changedTouches) {
      if (t.identifier !== L.id) continue;
      if (e.type === 'touchend' && !L.moved && performance.now() - L.time < 350) {
        v3.target = findTarget();
        on3dClick(0);
        if (!tool && !demolish && selected) document.getElementById('side').classList.add('open');
      }
      v3.look = null;
    }
  };
  cv.addEventListener('touchend', end, { passive: false });
  cv.addEventListener('touchcancel', end, { passive: false });

  // Joystick
  const joy = document.getElementById('joy'), knob = document.getElementById('joyKnob');
  let jid = null;
  const setJoy = t => {
    const r = joy.getBoundingClientRect();
    const R = r.width / 2;
    let dx = t.clientX - (r.left + R), dy = t.clientY - (r.top + R);
    const d = Math.hypot(dx, dy);
    if (d > R) { dx *= R / d; dy *= R / d; }
    v3.joy.x = dx / R; v3.joy.y = dy / R;
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
  };
  joy.addEventListener('touchstart', e => {
    e.preventDefault();
    const t = e.changedTouches[0]; jid = t.identifier; setJoy(t);
  }, { passive: false });
  joy.addEventListener('touchmove', e => {
    e.preventDefault();
    for (const t of e.changedTouches) if (t.identifier === jid) setJoy(t);
  }, { passive: false });
  const jend = e => {
    e.preventDefault();
    for (const t of e.changedTouches) if (t.identifier === jid) {
      jid = null; v3.joy.x = v3.joy.y = 0; knob.style.transform = '';
    }
  };
  joy.addEventListener('touchend', jend, { passive: false });
  joy.addEventListener('touchcancel', jend, { passive: false });

  const jump = document.getElementById('btnJump');
  const doJump = e => { e.preventDefault(); const p = v3.player; if (p.onGround) { p.vy = 6; p.onGround = false; } };
  jump.addEventListener('touchstart', doJump, { passive: false });
  jump.addEventListener('click', doJump);
}
