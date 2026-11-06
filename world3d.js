'use strict';
// =====================================================================
//  Welt: realistischer Boden, Gras, Zaun, Wald, Seen, Berge, Himmel, Wolken
// =====================================================================

// ---------- Rauschen ----------
function hash2(ix, iy, seed) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 982451653)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y, seed) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy, seed), b = hash2(ix + 1, iy, seed), c = hash2(ix, iy + 1, seed), d = hash2(ix + 1, iy + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
function fbm(x, y, seed, oct = 4) {
  let v = 0, amp = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { v += vnoise(x * f, y * f, seed + i * 17) * amp; f *= 2; amp *= 0.5; }
  return v / (1 - Math.pow(0.5, oct));
}
// ---------- Instanzen in Bereiche (Chunks) aufteilen ----------
// Three.js prüft pro Mesh, ob es im Bild ist. Ein riesiges InstancedMesh würde immer komplett gezeichnet;
// aufgeteilt in Bereiche mit eigener Begrenzungskugel wird nur gezeichnet, was die Kamera (oder die Sonne für Schatten) sieht.
class Batch {
  constructor(geo, mat, chunk = 24, opts = {}) { this.geo = geo; this.mat = mat; this.chunk = chunk; this.opts = opts; this.items = new Map(); }
  add(matrix, color = null, tileKey = null) {
    const e = matrix.elements, k = Math.floor(e[12] / this.chunk) + ',' + Math.floor(e[14] / this.chunk);
    let l = this.items.get(k); if (!l) this.items.set(k, l = []);
    l.push([matrix.clone(), color, tileKey]);
  }
  build(parent, refs = null) {
    const base = this.geo;
    if (!base.boundingSphere) base.computeBoundingSphere();
    const gr = base.boundingSphere.radius + base.boundingSphere.center.length();
    const meshes = [], P = new THREE.Vector3(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), C = new THREE.Color();
    const share = src => { // neue Form, die die Daten mit src teilt
      const g = new THREE.BufferGeometry();
      for (const n in src.attributes) g.setAttribute(n, src.attributes[n]);
      if (src.index) g.setIndex(src.index);
      for (const gp of src.groups) g.addGroup(gp.start, gp.count, gp.materialIndex);
      return g;
    };
    for (const list of this.items.values()) {
      const g = share(base);
      const min = new THREE.Vector3(Infinity, Infinity, Infinity), max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
      let maxS = 0;
      for (const [m] of list) { m.decompose(P, Q, S); min.min(P); max.max(P); maxS = Math.max(maxS, S.x, S.y, S.z); }
      const center = min.clone().add(max).multiplyScalar(0.5);
      g.boundingSphere = new THREE.Sphere(center, center.distanceTo(max) + gr * maxS);
      const im = new THREE.InstancedMesh(g, this.mat, list.length);
      if (this.opts.lo) { // gröbere Form für weiter entfernte Bereiche
        const lo = share(this.opts.lo); lo.boundingSphere = g.boundingSphere;
        im.userData.hi = g; im.userData.lo = lo; im.userData.loDist = this.opts.loDist || 30;
      }
      im.userData.base = [];
      list.forEach(([m, col, key], i) => {
        im.setMatrixAt(i, m); im.userData.base.push(m);
        if (col != null) im.setColorAt(i, C.set(col));
        if (key && refs) { if (!refs.has(key)) refs.set(key, []); refs.get(key).push([im, i]); }
      });
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.castShadow = !!this.opts.cast; im.receiveShadow = this.opts.receive !== false;
      if (this.opts.renderOrder) im.renderOrder = this.opts.renderOrder;
      if (this.opts.cull) { im.userData.cull = this.opts.cull; (v3.cullList || (v3.cullList = [])).push(im); }
      parent.add(im); meshes.push(im);
    }
    return meshes;
  }
}

// nur Details in der Nähe zeichnen (Entfernung wächst mit dem Zoom)
function updateCulling() {
  if (!v3.cullList) return;
  const p = v3.player, extra = v3.cam.dist * 1.3;
  for (const m of v3.cullList) {
    const sp = m.geometry.boundingSphere;
    const d = Math.hypot(sp.center.x - p.x, sp.center.z - p.z) - sp.radius;
    m.visible = d < m.userData.cull + extra;
    if (m.userData.lo && m.visible) m.geometry = d < m.userData.loDist + extra * 0.4 ? m.userData.hi : m.userData.lo;
  }
}

// mehrere Formen zu einer zusammenfügen (weniger Zeichenaufrufe)
function mergeGeometries(parts) {
  const pos = [], nor = [];
  for (const [geo, mat] of parts) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(mat);
    pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return out;
}

const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---------- Texturen ----------
// nahtlos kachelbares Gras (Elemente am Rand werden auf der Gegenseite wiederholt)
function grassTexture() {
  if (texCache.grass) return texCache.grass;
  const S = 512, [c, g] = newCanvas(S, S), rnd = texRng(77);
  g.fillStyle = '#4c7a2f'; g.fillRect(0, 0, S, S);
  const wrap = (fn) => { for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) fn(ox, oy); };
  // weiche Farbflecken
  for (let i = 0; i < 70; i++) {
    const x = rnd() * S, y = rnd() * S, r = 20 + rnd() * 70;
    const col = ['rgba(90,130,50,.25)', 'rgba(50,85,30,.25)', 'rgba(120,140,60,.18)', 'rgba(70,100,40,.25)'][i % 4];
    wrap((ox, oy) => { const grd = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r); grd.addColorStop(0, col); grd.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = grd; g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2); });
  }
  addNoise(g, 22, rnd, false);
  // Erdkrümel und Steinchen
  for (let i = 0; i < 260; i++) {
    const x = rnd() * S, y = rnd() * S, r = 0.6 + rnd() * 1.6;
    g.fillStyle = rnd() < 0.7 ? 'rgba(80,60,35,.55)' : 'rgba(150,145,135,.6)';
    wrap((ox, oy) => { g.beginPath(); g.arc(x + ox, y + oy, r, 0, 7); g.fill(); });
  }
  // Grashalme
  const blades = ['#3d6a24', '#558a33', '#6a9c3c', '#2f5a1c', '#7aa848', '#4f8030'];
  g.lineCap = 'round';
  for (let i = 0; i < 9000; i++) {
    const x = rnd() * S, y = rnd() * S, l = 3 + rnd() * 6, a = -Math.PI / 2 + (rnd() - 0.5) * 1.2;
    g.strokeStyle = blades[Math.floor(rnd() * blades.length)]; g.lineWidth = 0.8 + rnd() * 0.9;
    g.globalAlpha = 0.55 + rnd() * 0.45;
    const ex = Math.cos(a) * l, ey = Math.sin(a) * l;
    wrap((ox, oy) => { if (x + ox > -10 && x + ox < S + 10 && y + oy > -10 && y + oy < S + 10) { g.beginPath(); g.moveTo(x + ox, y + oy); g.lineTo(x + ox + ex, y + oy + ey); g.stroke(); } });
  }
  g.globalAlpha = 1;
  const t = finish(c);
  t.anisotropy = 8;
  return (texCache.grass = { map: t, bump: t });
}

// Erdfleck unter Erzfeldern (mit weichem, durchsichtigem Rand)
function oreDirtTexture(ore) {
  const key = 'dirt-' + ore;
  if (texCache[key]) return texCache[key];
  const S = 128, [c, g] = newCanvas(S, S), rnd = texRng(ore.length * 13 + 3);
  const earth = { iron_ore: [78, 62, 50], copper_ore: [80, 66, 50], coal: [44, 39, 34] }[ore];
  const speck = { iron_ore: ['#7a4228', '#9a5a36'], copper_ore: ['#b07a2c', '#d8a040'], coal: ['#121214', '#26262a'] }[ore];
  const img = g.createImageData(S, S), d = img.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = (x - S / 2) / (S / 2), dy = (y - S / 2) / (S / 2);
    const r = Math.hypot(dx, dy) + (vnoise(x / 10, y / 10, 5) - 0.5) * 0.45;
    const a = 1 - smooth(0.55, 0.98, r);
    const n = (rnd() - 0.5) * 30 + (vnoise(x / 5, y / 5, 9) - 0.5) * 30;
    const i = (y * S + x) * 4;
    d[i] = earth[0] + n; d[i + 1] = earth[1] + n; d[i + 2] = earth[2] + n; d[i + 3] = a * 255;
  }
  g.putImageData(img, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  for (let i = 0; i < 90; i++) {
    const v = 90 + rnd() * 70;
    g.fillStyle = `rgba(${v},${v - 6},${v - 14},.7)`;
    g.beginPath(); g.arc(rnd() * S, rnd() * S, 0.6 + rnd() * 1.6, 0, 7); g.fill();
  }
  for (let i = 0; i < 40; i++) { g.fillStyle = speck[i % 2]; g.beginPath(); g.arc(rnd() * S, rnd() * S, 0.8 + rnd() * 1.6, 0, 7); g.fill(); }
  g.globalCompositeOperation = 'source-over';
  const t = new THREE.CanvasTexture(c);
  return (texCache[key] = t);
}

// graue Detail-Textur (Halme, Krümel) – die Farbe kommt von den Eckpunkten, so passt sie zu Gras, Fels und Schnee
function detailTexture() {
  if (texCache.detail) return texCache.detail;
  const S = 256, [c, g] = newCanvas(S, S), rnd = texRng(91);
  g.fillStyle = '#e0e0e0'; g.fillRect(0, 0, S, S);
  addNoise(g, 50, rnd);
  for (let i = 0; i < 40; i++) blotch(g, rnd() * S, rnd() * S, 10 + rnd() * 30, rnd() < 0.5 ? '#ffffff' : '#9a9a9a', 0.12, rnd);
  g.lineCap = 'round';
  for (let i = 0; i < 2500; i++) {
    const x = rnd() * S, y = rnd() * S, l = 2 + rnd() * 4, a = -Math.PI / 2 + (rnd() - 0.5) * 1.2, v = 150 + rnd() * 105;
    g.strokeStyle = `rgb(${v},${v},${v})`; g.lineWidth = 0.8; g.globalAlpha = 0.6;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  g.globalAlpha = 1;
  const t = finish(c); t.anisotropy = 8;
  return (texCache.detail = t);
}

function skyTexture() {
  const [c, g] = newCanvas(8, 256);
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, '#3f7fd0'); grd.addColorStop(0.42, '#8cbcea'); grd.addColorStop(0.5, '#d6e8f4'); grd.addColorStop(0.53, '#c8d8c8'); grd.addColorStop(1, '#8a9a80');
  g.fillStyle = grd; g.fillRect(0, 0, 8, 256);
  return new THREE.CanvasTexture(c);
}

// =====================================================================
//  Hauptboden der Karte
// =====================================================================
const WORLD_FOG = 0xcfe1ee;

function buildMainGround() {
  const Wm = MAP_W * T3, Hm = MAP_H * T3, seed = state.seed % 100000;
  const geo = new THREE.PlaneGeometry(Wm, Hm, MAP_W, MAP_H);
  geo.rotateX(-Math.PI / 2);
  geo.translate(Wm / 2, 0, Hm / 2);
  // großflächige Farbvariation über Eckpunktfarben (sattes Gras ↔ trockene Stellen)
  const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const n = fbm(x * 0.025, z * 0.025, seed), dry = smooth(0.62, 0.8, fbm(x * 0.012 + 40, z * 0.012, seed + 3));
    const k = 0.8 + n * 0.38;
    col[i * 3] = k * (1 + dry * 0.28); col[i * 3 + 1] = k * (1 + dry * 0.08); col[i * 3 + 2] = k * (1 - dry * 0.1);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const gt = grassTexture();
  const map = gt.map.clone(); map.needsUpdate = true; map.repeat.set(MAP_W / 4, MAP_H / 4);
  const mat = new THREE.MeshStandardMaterial({ map, bumpMap: map, bumpScale: 0.02, roughness: 1, vertexColors: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  v3.scene.add(mesh);
  v3.ground = mesh;

  // Erdflecken unter Erzfeldern
  v3.dirt = [];
  for (const ore of ['iron_ore', 'copper_ore', 'coal']) {
    const list = [];
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) if (tiles[y][x].ore === ore) list.push([x, y]);
    if (!list.length) continue;
    const m = new THREE.MeshStandardMaterial({ map: oreDirtTexture(ore), transparent: true, depthWrite: false, roughness: 1,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    const pg = new THREE.PlaneGeometry(T3 * 1.75, T3 * 1.75); pg.rotateX(-Math.PI / 2);
    const batch = new Batch(pg, m, 32, { renderOrder: 1, cull: 150 });
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (const [x, y] of list) {
      const r = rng(x * 31 + y * 977);
      Q.setFromAxisAngle(up, r() * Math.PI * 2); const sc = 0.9 + r() * 0.35;
      V.set((x + 0.5) * T3, 0.012, (y + 0.5) * T3); S.set(sc, 1, sc);
      M.compose(V, Q, S); batch.add(M);
    }
    v3.dirt.push(...batch.build(v3.scene));
  }

  // Raster (nur beim Bauen sichtbar)
  const [gc, gg] = newCanvas(64, 64);
  gg.strokeStyle = 'rgba(255,255,255,.9)'; gg.lineWidth = 2; gg.strokeRect(1, 1, 62, 62);
  const gtx = new THREE.CanvasTexture(gc); gtx.wrapS = gtx.wrapT = THREE.RepeatWrapping; gtx.repeat.set(MAP_W, MAP_H); gtx.anisotropy = 8;
  const grid = new THREE.Mesh(new THREE.PlaneGeometry(Wm, Hm),
    new THREE.MeshBasicMaterial({ map: gtx, transparent: true, opacity: 0.22, depthWrite: false }));
  grid.rotation.x = -Math.PI / 2; grid.position.set(Wm / 2, 0.02, Hm / 2); grid.renderOrder = 2; grid.visible = false;
  v3.scene.add(grid); v3.grid = grid;
}

// Grasbüschel und Blumen auf freien Feldern (werden unter Gebäuden ausgeblendet)
function buildGrassDeco() {
  if (!v3.tuftGeo) {
    // 3 gekreuzte Halm-Dreiecke, unten dunkel, oben hell
    const pos = [], colr = [];
    for (let k = 0; k < 5; k++) {
      const a = k / 5 * Math.PI, ox = Math.cos(a + 1) * 0.15, oz = Math.sin(a + 1) * 0.15, w = 0.09;
      const cx = Math.cos(a) * w, cz = Math.sin(a) * w, lean = 0.15 * (k % 2 ? 1 : -1);
      pos.push(ox - cx, 0, oz - cz, ox + cx, 0, oz + cz, ox + lean, 1, oz + lean * 0.5);
      colr.push(0.18, 0.32, 0.1, 0.18, 0.32, 0.1, 0.55, 0.75, 0.3);
    }
    v3.tuftGeo = new THREE.BufferGeometry();
    v3.tuftGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    v3.tuftGeo.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
    v3.tuftGeo.computeVertexNormals();
    v3.flowerGeo = new THREE.IcosahedronGeometry(1, 0);
  }
  const free = [];
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) if (!tiles[y][x].ore) free.push([x, y]);
  const dens = touchUI ? 0.35 : 0.7;
  const tuftList = [], flowerList = [];
  for (const [x, y] of free) {
    const r = rng(x * 7349 + y * 1931 + 5);
    const n = r() < dens ? 1 + Math.floor(r() * 3) : 0;
    for (let i = 0; i < n; i++) tuftList.push([x, y, r]);
    if (r() < 0.06) flowerList.push([x, y, r]);
  }
  const tuftB = new Batch(v3.tuftGeo, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.9 }), 24, { cull: 40 });
  const flowerB = new Batch(v3.flowerGeo, new THREE.MeshStandardMaterial({ roughness: 0.6 }), 24, { cull: 40 });
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  for (const [x, y, r] of tuftList) {
    Q.setFromAxisAngle(up, r() * Math.PI * 2);
    const h = 0.25 + r() * 0.35, w = 0.7 + r() * 0.8;
    V.set((x + 0.1 + r() * 0.8) * T3, 0, (y + 0.1 + r() * 0.8) * T3); S.set(w, h, w);
    M.compose(V, Q, S); tuftB.add(M, null, x + ',' + y);
  }
  const fcols = [0xffffff, 0xffe04a, 0xc87ae0, 0xff7a5a];
  for (const [x, y, r] of flowerList) {
    const c = fcols[Math.floor(r() * fcols.length)];
    for (let k = 0; k < 3; k++) {
      V.set((x + 0.2 + r() * 0.6) * T3, 0.18 + r() * 0.08, (y + 0.2 + r() * 0.6) * T3);
      const sc = 0.05 + r() * 0.03; S.set(sc, sc * 0.6, sc); Q.identity();
      M.compose(V, Q, S); flowerB.add(M, c, x + ',' + y);
    }
  }
  v3.ore.meshes.push(...tuftB.build(v3.scene, v3.ore.tileRefs), ...flowerB.build(v3.scene, v3.ore.tileRefs));
  v3.ore.sig = ''; v3.ore.hidden = new Set();
}

// =====================================================================
//  Umgebung außerhalb der Karte
// =====================================================================
function worldLakes() {
  const Wm = MAP_W * T3, Hm = MAP_H * T3, seed = state.seed % 100000;
  const r = rng(seed + 99);
  // je ein See an drei Seiten, ein Stück hinter dem Zaun
  return [
    [Wm * (0.25 + r() * 0.5), -26 - r() * 10, 12 + r() * 6],
    [Wm + 26 + r() * 10, Hm * (0.25 + r() * 0.5), 12 + r() * 6],
    [Wm * (0.25 + r() * 0.5), Hm + 26 + r() * 10, 12 + r() * 6],
  ];
}

function edgeDist(x, z) {
  const Wm = MAP_W * T3, Hm = MAP_H * T3;
  const dx = Math.max(0, -x, x - Wm), dz = Math.max(0, -z, z - Hm);
  return Math.hypot(dx, dz);
}

function terrainHeight(x, z, lakes) {
  const d = edgeDist(x, z);
  if (d <= 0) return -0.05;
  const seed = state.seed % 100000;
  let h = smooth(0, 30, d) * (1 + fbm(x * 0.03, z * 0.03, seed + 11) * 6);
  h += smooth(45, 150, d) * (20 + fbm(x * 0.008 + 3, z * 0.008, seed + 21) * 75);
  h += smooth(60, 160, d) * Math.pow(fbm(x * 0.02, z * 0.02, seed + 31), 2) * 30; // Felszacken
  for (const [lx, lz, lr] of lakes) {
    const k = 1 - smooth(lr * 0.6, lr * 1.5, Math.hypot(x - lx, z - lz));
    h = h * (1 - k) + (-2.2) * k;
  }
  return h - 0.05 * smooth(0, 1, d);
}

function buildSurroundings() {
  if (v3.world) { v3.scene.remove(v3.world); }
  const world = new THREE.Group();
  v3.world = world;
  const Wm = MAP_W * T3, Hm = MAP_H * T3, seed = state.seed % 100000, lakes = worldLakes();
  const MARGIN = 190;

  // ---------- Gelände: Hügel, Wald-Boden, Felsen, Schnee ----------
  const segX = touchUI ? 110 : 170, segZ = touchUI ? 90 : 140;
  const geo = new THREE.PlaneGeometry(Wm + MARGIN * 2, Hm + MARGIN * 2, segX, segZ);
  geo.rotateX(-Math.PI / 2);
  geo.translate(Wm / 2, 0, Hm / 2);
  const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
  const c = new THREE.Color(), grass = new THREE.Color(0x4a7a2e), forest = new THREE.Color(0x355a22), rock = new THREE.Color(0x8a857e),
    rockD = new THREE.Color(0x6a655e), snow = new THREE.Color(0xffffff), sand = new THREE.Color(0xc8b48a);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), h = terrainHeight(x, z, lakes), d = edgeDist(x, z);
    pos.setY(i, h);
    const n = fbm(x * 0.05, z * 0.05, seed + 41);
    c.copy(grass).lerp(forest, smooth(4, 20, d) * 0.8).multiplyScalar(0.85 + n * 0.3);
    if (h < 0.6 && d > 3) c.lerp(sand, smooth(0.6, -1.2, h)); // Ufer
    c.lerp(n > 0.5 ? rock : rockD, smooth(14, 26, h));
    c.lerp(snow, smooth(52 + n * 14, 64 + n * 14, h));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  // UVs für die Detail-Textur in Weltmaßstab (eine Wiederholung je 8 Einheiten)
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / 8, pos.getZ(i) / 8);
  const det = detailTexture().clone(); det.needsUpdate = true;
  const terrain = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, map: det }));
  terrain.receiveShadow = true;
  world.add(terrain);

  // ---------- Seen ----------
  const waterMat = new THREE.MeshStandardMaterial({ color: 0x2a5f80, roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.9,
    envMap: getOreEnv(v3.renderer), envMapIntensity: 0.45 });
  for (const [lx, lz, lr] of lakes) {
    const w = new THREE.Mesh(new THREE.CircleGeometry(lr * 1.25, 40), waterMat);
    w.rotation.x = -Math.PI / 2; w.position.set(lx, -0.35, lz);
    world.add(w);
  }
  v3.waterMat = waterMat;

  // ---------- Holzzaun um die Karte ----------
  const wood = woodMat(2);
  const perim = 2 * (MAP_W + MAP_H) + 4;
  const posts = new THREE.InstancedMesh(v3.geos.box, wood, perim);
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  let pi = 0;
  const post = (x, z) => { V.set(x, 0.55, z); S.set(0.16, 1.1, 0.16); Q.identity(); M.compose(V, Q, S); posts.setMatrixAt(pi++, M); };
  const off = 0.3;
  for (let x = 0; x <= MAP_W; x++) { post(x * T3, -off); post(x * T3, Hm + off); }
  for (let y = 1; y < MAP_H; y++) { post(-off, y * T3); post(Wm + off, y * T3); }
  posts.count = pi; posts.castShadow = true; posts.receiveShadow = true;
  world.add(posts);
  for (const yy of [0.45, 0.85]) {
    world.add(part('box', wood, Wm + 0.6, 0.1, 0.06, Wm / 2, yy, -off), part('box', wood, Wm + 0.6, 0.1, 0.06, Wm / 2, yy, Hm + off),
      part('box', wood, 0.06, 0.1, Hm + 0.6, -off, yy, Hm / 2), part('box', wood, 0.06, 0.1, Hm + 0.6, Wm + off, yy, Hm / 2));
  }

  // ---------- Wald ----------
  const r = rng(seed + 5);
  const pines = [], leafy = [], boulders = [];
  const N = touchUI ? 1400 : 2800;
  const inLake = (x, z) => lakes.some(([lx, lz, lr]) => Math.hypot(x - lx, z - lz) < lr * 1.45);
  for (let i = 0; i < N * 3 && pines.length + leafy.length < N; i++) {
    const x = -MARGIN + r() * (Wm + MARGIN * 2), z = -MARGIN + r() * (Hm + MARGIN * 2), d = edgeDist(x, z);
    if (d < 2.5 || d > 120 || inLake(x, z)) continue;
    const h = terrainHeight(x, z, lakes);
    if (h > 30) continue;
    // dichter direkt hinter dem Zaun, Lichtungen durch Rauschen
    const dens = (1 - smooth(20, 120, d)) * smooth(0.3, 0.55, fbm(x * 0.04, z * 0.04, seed + 51));
    if (r() > dens) continue;
    (h > 12 || r() < 0.6 ? pines : leafy).push([x, h, z, 0.8 + r() * 0.7, r() * Math.PI * 2, r()]);
  }
  for (let i = 0; i < (touchUI ? 120 : 240); i++) {
    const x = -MARGIN + r() * (Wm + MARGIN * 2), z = -MARGIN + r() * (Hm + MARGIN * 2), d = edgeDist(x, z);
    if (d < 3 || d > 90 || inLake(x, z)) continue;
    boulders.push([x, terrainHeight(x, z, lakes), z, 0.5 + r() * 1.4, r() * 6]);
  }
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a3e26, roughness: 0.95 });
  const needleMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, flatShading: true });
  const trunkGeo = new THREE.CylinderGeometry(0.12, 0.2, 1, 6);
  const coneGeo = new THREE.ConeGeometry(1, 1, 7);
  const crownGeo = rockGeometry(9, 1, 0.22), crownLo = rockGeometry(9, 0, 0.22);
  // Tanne: drei Nadel-Ebenen als eine Form (Einheitsgröße, Fuß bei y = 0)
  const L = (y, w, hh) => new THREE.Matrix4().compose(new THREE.Vector3(0, y, 0), new THREE.Quaternion(), new THREE.Vector3(w, hh, w));
  const pineGeo = mergeGeometries([[coneGeo, L(1.9, 1.5, 2.4)], [coneGeo, L(3.2, 1.15, 2.0)], [coneGeo, L(4.3, 0.75, 1.6)]]);
  const T = { cast: true, cull: 260 };
  const trunks = new Batch(trunkGeo, trunkMat, 96, T);
  const pinesB = new Batch(pineGeo, needleMat, 96, T);
  const crowns = new Batch(crownGeo, leafMat, 96, Object.assign({ lo: crownLo, loDist: 50 }, T));
  const C = new THREE.Color();
  for (const [x, h, z, s, rot, v] of pines) {
    Q.setFromAxisAngle(up, rot);
    V.set(x, h + 0.9 * s, z); S.set(s, 1.8 * s, s); M.compose(V, Q, S); trunks.add(M);
    C.setHSL(0.31 + v * 0.05, 0.45, 0.17 + v * 0.07);
    V.set(x, h, z); S.set(s, s, s); M.compose(V, Q, S); pinesB.add(M, C.getHex());
  }
  for (const [x, h, z, s, rot, v] of leafy) {
    Q.setFromAxisAngle(up, rot);
    V.set(x, h + 1.1 * s, z); S.set(s * 1.2, 2.2 * s, s * 1.2); M.compose(V, Q, S); trunks.add(M);
    // meist grün, ein paar Bäume herbstlich
    if (v > 0.88) C.setHSL(0.08 + (v - 0.88) * 0.6, 0.65, 0.42); else C.setHSL(0.24 + v * 0.08, 0.5, 0.25 + v * 0.1);
    V.set(x, h + 3.0 * s, z); S.set(1.6 * s, 1.5 * s, 1.6 * s); M.compose(V, Q, S); crowns.add(M, C.getHex());
  }
  for (const b of [trunks, pinesB, crowns]) b.build(world);
  // Findlinge
  const bmat = new THREE.MeshStandardMaterial({ color: 0x8a8680, roughness: 1, flatShading: true });
  const bb = new Batch(rockGeometry(4, 1, 0.3), bmat, 96, { cast: true, cull: 200 });
  for (const [x, h, z, s, rot] of boulders) { E3.set(0, rot, 0.2); Q.setFromEuler(E3); V.set(x, h + s * 0.3, z); S.set(s * 1.3, s, s); M.compose(V, Q, S); bb.add(M); }
  bb.build(world);

  // ---------- Himmel, Sonne, Wolken ----------
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 24, 16), new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.renderOrder = -1;
  v3.sky = sky; world.add(sky);
  const [sc, sg] = newCanvas(128, 128);
  const sgr = sg.createRadialGradient(64, 64, 0, 64, 64, 64);
  sgr.addColorStop(0, 'rgba(255,255,240,1)'); sgr.addColorStop(0.18, 'rgba(255,250,220,1)'); sgr.addColorStop(0.4, 'rgba(255,240,200,.35)'); sgr.addColorStop(1, 'rgba(255,240,200,0)');
  sg.fillStyle = sgr; sg.fillRect(0, 0, 128, 128);
  const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(sc), fog: false, depthWrite: false, transparent: true }));
  sun.scale.set(160, 160, 1); v3.sunSprite = sun; world.add(sun);
  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, fog: false, flatShading: true, emissive: 0x9aa4b0 });
  v3.clouds = [];
  const cr = rng(seed + 123);
  for (let i = 0; i < 18; i++) {
    const cg = new THREE.Group();
    const n = 4 + Math.floor(cr() * 4);
    for (let k = 0; k < n; k++) {
      const puff = new THREE.Mesh(v3.geos.sphere, cloudMat);
      const s = 10 + cr() * 14;
      puff.scale.set(s * 1.4, s * 0.6, s);
      puff.position.set((k - n / 2) * 9 + cr() * 6, cr() * 4, cr() * 10 - 5);
      cg.add(puff);
    }
    cg.position.set(-300 + cr() * (Wm + 600), 95 + cr() * 50, -300 + cr() * (Hm + 600));
    cg.userData.speed = 1.5 + cr() * 2;
    v3.clouds.push(cg); world.add(cg);
  }
  v3.scene.add(world);
}
const E3 = new THREE.Euler();

// pro Bild: Himmel folgt der Kamera, Wolken ziehen
function updateWorld(dt) {
  if (!v3.world) return;
  const cam = v3.camera.position;
  v3.sky.position.copy(cam);
  // Sonne in Richtung des Sonnenlichts
  v3.sunSprite.position.set(cam.x + 20 * 14, cam.y + 40 * 14 * 0.55, cam.z + 10 * 14);
  const Wm = MAP_W * T3;
  for (const c of v3.clouds) {
    c.position.x += c.userData.speed * dt;
    if (c.position.x > Wm + 320) c.position.x = -320;
  }
  if (v3.grid) v3.grid.visible = !!(tool || demolish);
  updateCulling();
}
