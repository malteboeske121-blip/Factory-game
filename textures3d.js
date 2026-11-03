'use strict';
// =====================================================================
//  Prozedurale Texturen für den 3D-Modus
//  Alles wird zur Laufzeit auf Canvas gezeichnet (keine Bilddateien nötig).
//  "wear" 0..1 = Abnutzung: 1 = alt & rostig, 0 = neu.
// =====================================================================

const TEX_SIZE = 256;
const texCache = {};

function texRng(seed) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; };
}
function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function mixHex(a, b, t) {
  const A = hexRgb(a), B = hexRgb(b);
  return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`;
}
function newCanvas(w = TEX_SIZE, h = TEX_SIZE) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }

// Pixelrauschen über die ganze Fläche
function addNoise(g, amount, rnd, mono = true) {
  const w = g.canvas.width, h = g.canvas.height;
  const img = g.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() - 0.5) * amount;
    d[i] += n; d[i + 1] += mono ? n : (rnd() - 0.5) * amount; d[i + 2] += mono ? n : (rnd() - 0.5) * amount;
  }
  g.putImageData(img, 0, 0);
}

// unregelmäßiger Fleck (Rost, Schmutz, Ruß)
function blotch(g, x, y, r, color, alpha, rnd) {
  g.save();
  g.globalAlpha = alpha;
  g.fillStyle = color;
  for (let i = 0; i < 7; i++) {
    const a = rnd() * Math.PI * 2, d = rnd() * r * 0.6, rr = r * (0.3 + rnd() * 0.5);
    g.beginPath(); g.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, rr, 0, 7); g.fill();
  }
  g.restore();
}

function rust(g, bump, wear, rnd) {
  const n = Math.floor(wear * 26);
  const cols = ['#6b2e0e', '#8a4216', '#a65a22', '#5a2a10', '#7d3a14'];
  for (let i = 0; i < n; i++) {
    const x = rnd() * TEX_SIZE, y = rnd() * TEX_SIZE, r = 4 + rnd() * 22 * wear;
    blotch(g, x, y, r, cols[i % cols.length], 0.35 + rnd() * 0.5, rnd);
    if (bump) blotch(bump, x, y, r, '#a0a0a0', 0.4, rnd);
    // Rostläufer nach unten
    if (rnd() < 0.5) {
      const grd = g.createLinearGradient(x, y, x, y + 30 + rnd() * 60);
      grd.addColorStop(0, 'rgba(120,55,20,.55)'); grd.addColorStop(1, 'rgba(120,55,20,0)');
      g.fillStyle = grd; g.fillRect(x - 1.5 - rnd() * 2, y, 3 + rnd() * 3, 90);
    }
  }
}

function scratches(g, count, rnd, color = 'rgba(255,255,255,.25)') {
  g.strokeStyle = color; g.lineWidth = 0.8;
  for (let i = 0; i < count; i++) {
    const x = rnd() * TEX_SIZE, y = rnd() * TEX_SIZE, a = rnd() * Math.PI, l = 6 + rnd() * 30;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
}

function dirtBottom(g, strength) {
  const grd = g.createLinearGradient(0, TEX_SIZE * 0.55, 0, TEX_SIZE);
  grd.addColorStop(0, 'rgba(40,30,20,0)'); grd.addColorStop(1, `rgba(40,30,20,${strength})`);
  g.fillStyle = grd; g.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
}

function rivets(g, bump, pts, wear) {
  for (const [x, y] of pts) {
    g.fillStyle = wear > 0.5 ? '#5a3a20' : 'rgba(0,0,0,.45)';
    g.beginPath(); g.arc(x + 1, y + 1, 3.2, 0, 7); g.fill();
    g.fillStyle = wear > 0.5 ? '#8a6040' : 'rgba(255,255,255,.55)';
    g.beginPath(); g.arc(x - 0.5, y - 0.5, 2.2, 0, 7); g.fill();
    if (bump) { bump.fillStyle = '#fff'; bump.beginPath(); bump.arc(x, y, 3, 0, 7); bump.fill(); }
  }
}

function hazard(g, y, h) {
  g.save();
  g.beginPath(); g.rect(0, y, TEX_SIZE, h); g.clip();
  g.fillStyle = '#f2c230'; g.fillRect(0, y, TEX_SIZE, h);
  g.fillStyle = '#1a1a1a';
  for (let x = -h; x < TEX_SIZE + h; x += 28) {
    g.beginPath(); g.moveTo(x, y + h); g.lineTo(x + 14, y + h); g.lineTo(x + 14 + h, y); g.lineTo(x + h, y); g.fill();
  }
  g.restore();
}

function finish(canvas, repeat = 1) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  return t;
}

// ---------- Lackiertes Metall mit Blechen, Nieten, Rost ----------
// opts: { color, wear, stripes, glow (Farbe für Leuchtlinien), panels }
function paintedMetal(key, opts) {
  if (texCache[key]) return texCache[key];
  const { color, wear = 0, stripes = false, glow = null, panels = 2, seed = 1 } = opts;
  const rnd = texRng(seed + key.length * 7);
  const [c, g] = newCanvas(), [bc, b] = newCanvas();
  const base = wear > 0 ? mixHex(color, '#7a6a5a', wear * 0.45) : color;
  g.fillStyle = base; g.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
  b.fillStyle = '#808080'; b.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
  // feine Lackstruktur
  addNoise(g, 10 + wear * 30, rnd);
  // ungleichmäßig ausgeblichen
  for (let i = 0; i < 6 * wear; i++) blotch(g, rnd() * TEX_SIZE, rnd() * TEX_SIZE, 30 + rnd() * 40, rnd() < 0.5 ? '#ffffff' : '#000000', 0.06, rnd);
  // Bleche + Fugen
  const P = TEX_SIZE / panels;
  g.strokeStyle = 'rgba(0,0,0,.55)'; g.lineWidth = 2; b.strokeStyle = '#303030'; b.lineWidth = 3;
  for (let i = 0; i <= panels; i++) {
    for (const ctx2 of [g, b]) {
      ctx2.beginPath(); ctx2.moveTo(i * P, 0); ctx2.lineTo(i * P, TEX_SIZE); ctx2.moveTo(0, i * P); ctx2.lineTo(TEX_SIZE, i * P); ctx2.stroke();
    }
  }
  g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 1;
  for (let i = 0; i <= panels; i++) { g.beginPath(); g.moveTo(i * P + 2, 0); g.lineTo(i * P + 2, TEX_SIZE); g.moveTo(0, i * P + 2); g.lineTo(TEX_SIZE, i * P + 2); g.stroke(); }
  // Flicken (repariert)
  if (wear > 0.2 && wear < 0.8) {
    for (let i = 0; i < 3; i++) {
      const x = rnd() * (TEX_SIZE - 70), y = rnd() * (TEX_SIZE - 70), w = 35 + rnd() * 35, h = 30 + rnd() * 30;
      g.fillStyle = mixHex(color, '#9aa0a6', 0.5); g.fillRect(x, y, w, h);
      addRect(g, x, y, w, h);
      b.fillStyle = '#a0a0a0'; b.fillRect(x, y, w, h);
      rivets(g, b, [[x + 5, y + 5], [x + w - 5, y + 5], [x + 5, y + h - 5], [x + w - 5, y + h - 5]], 0.3);
      // Schweißnaht
      g.strokeStyle = 'rgba(60,50,40,.7)'; g.lineWidth = 2; g.setLineDash([2, 2]); g.strokeRect(x - 1, y - 1, w + 2, h + 2); g.setLineDash([]);
    }
  }
  // Nieten an den Blechecken
  if (!glow) {
    const pts = [];
    for (let i = 0; i <= panels; i++) for (let j = 0; j <= panels; j++)
      for (const [dx, dy] of [[8, 8], [-8, 8], [8, -8], [-8, -8]]) {
        const x = i * P + dx, y = j * P + dy;
        if (x > 0 && y > 0 && x < TEX_SIZE && y < TEX_SIZE) pts.push([x, y]);
      }
    rivets(g, b, pts, wear);
  }
  if (stripes) hazard(g, TEX_SIZE - 34, 26);
  if (wear > 0) { rust(g, b, wear, rnd); scratches(g, 40 * wear + 6, rnd); dirtBottom(g, 0.65 * wear); }
  else scratches(g, 4, rnd, 'rgba(255,255,255,.12)');
  let emissive = null;
  if (glow) {
    const [ec, e] = newCanvas();
    e.fillStyle = '#000'; e.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
    for (const ctx2 of [g, e]) {
      ctx2.strokeStyle = glow; ctx2.lineWidth = 3;
      ctx2.beginPath();
      ctx2.moveTo(0, TEX_SIZE * 0.2); ctx2.lineTo(TEX_SIZE * 0.35, TEX_SIZE * 0.2); ctx2.lineTo(TEX_SIZE * 0.45, TEX_SIZE * 0.3); ctx2.lineTo(TEX_SIZE, TEX_SIZE * 0.3);
      ctx2.moveTo(0, TEX_SIZE * 0.82); ctx2.lineTo(TEX_SIZE, TEX_SIZE * 0.82);
      ctx2.stroke();
      ctx2.fillStyle = glow;
      for (let i = 0; i < 4; i++) ctx2.fillRect(TEX_SIZE * 0.6 + i * 18, TEX_SIZE * 0.5, 10, 6);
    }
    emissive = finish(ec);
  }
  return (texCache[key] = { map: finish(c), bump: finish(bc), emissive });
}
function addRect(g, x, y, w, h) { g.strokeStyle = 'rgba(0,0,0,.4)'; g.lineWidth = 1.5; g.strokeRect(x, y, w, h); }

// ---------- Holzbretter ----------
function woodPlanks(key, wear, seed = 3) {
  if (texCache[key]) return texCache[key];
  const rnd = texRng(seed);
  const [c, g] = newCanvas(), [bc, b] = newCanvas();
  const n = 6, H = TEX_SIZE / n;
  for (let i = 0; i < n; i++) {
    const tone = wear > 0.5 ? mixHex('#8a7a66', '#6a6050', rnd()) : mixHex('#a8703a', '#8a5426', rnd());
    g.fillStyle = tone; g.fillRect(0, i * H, TEX_SIZE, H);
    // Maserung
    g.strokeStyle = 'rgba(40,25,10,.25)'; g.lineWidth = 1;
    for (let k = 0; k < 7; k++) {
      const y0 = i * H + rnd() * H;
      g.beginPath(); g.moveTo(0, y0);
      for (let x = 0; x <= TEX_SIZE; x += 16) g.lineTo(x, y0 + Math.sin(x * 0.03 + k) * 2.5);
      g.stroke();
    }
    // Astloch
    if (rnd() < 0.5) { g.fillStyle = 'rgba(50,30,15,.6)'; g.beginPath(); g.ellipse(rnd() * TEX_SIZE, i * H + H / 2, 6, 3.5, 0, 0, 7); g.fill(); }
    // Fuge
    g.fillStyle = 'rgba(20,12,5,.85)'; g.fillRect(0, i * H, TEX_SIZE, 2.5);
    b.fillStyle = '#909090'; b.fillRect(0, i * H, TEX_SIZE, H); b.fillStyle = '#202020'; b.fillRect(0, i * H, TEX_SIZE, 3);
    // Nägel
    for (const x of [14, TEX_SIZE - 14]) {
      g.fillStyle = wear > 0.5 ? '#5a3a1e' : '#444'; g.beginPath(); g.arc(x, i * H + H / 2, 2.3, 0, 7); g.fill();
      if (wear > 0.5) { g.fillStyle = 'rgba(110,50,15,.5)'; g.fillRect(x - 1, i * H + H / 2, 2, 14); }
    }
  }
  addNoise(g, 18, rnd);
  if (wear > 0.5) {
    for (let i = 0; i < 10; i++) blotch(g, rnd() * TEX_SIZE, rnd() * TEX_SIZE, 10 + rnd() * 20, '#2e3a22', 0.18, rnd); // Moos
    dirtBottom(g, 0.6);
    scratches(g, 30, rnd, 'rgba(30,20,10,.35)');
  }
  return (texCache[key] = { map: finish(c), bump: finish(bc) });
}

// ---------- Ziegel (mit Ruß) ----------
function bricks(key, wear, seed = 5) {
  if (texCache[key]) return texCache[key];
  const rnd = texRng(seed);
  const [c, g] = newCanvas(), [bc, b] = newCanvas();
  g.fillStyle = '#8a8478'; g.fillRect(0, 0, TEX_SIZE, TEX_SIZE); // Mörtel
  b.fillStyle = '#202020'; b.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
  const bw = 42, bh = 20;
  for (let r = 0; r * bh < TEX_SIZE; r++) {
    for (let x = -(r % 2) * bw / 2; x < TEX_SIZE; x += bw) {
      const tone = mixHex('#9a4a32', '#6e3424', rnd());
      g.fillStyle = tone; g.fillRect(x + 2, r * bh + 2, bw - 4, bh - 4);
      b.fillStyle = '#a0a0a0'; b.fillRect(x + 2, r * bh + 2, bw - 4, bh - 4);
      // abgeplatzte Ecken
      if (wear > 0.5 && rnd() < 0.3) { g.fillStyle = '#7a7268'; g.fillRect(x + 2 + rnd() * (bw - 12), r * bh + 2, 8, 6); }
    }
  }
  addNoise(g, 22, rnd);
  if (wear > 0) {
    // Ruß von oben
    const grd = g.createLinearGradient(0, 0, 0, TEX_SIZE);
    grd.addColorStop(0, `rgba(15,12,10,${0.75 * wear})`); grd.addColorStop(0.6, `rgba(15,12,10,${0.2 * wear})`); grd.addColorStop(1, 'rgba(15,12,10,0)');
    g.fillStyle = grd; g.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
    for (let i = 0; i < 12 * wear; i++) blotch(g, rnd() * TEX_SIZE, rnd() * TEX_SIZE, 10 + rnd() * 25, '#1a1612', 0.25, rnd);
    // Risse
    g.strokeStyle = 'rgba(20,15,10,.7)'; g.lineWidth = 1.2;
    for (let i = 0; i < 4 * wear; i++) {
      let x = rnd() * TEX_SIZE, y = rnd() * TEX_SIZE; g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 6; k++) { x += (rnd() - 0.5) * 20; y += 6 + rnd() * 10; g.lineTo(x, y); }
      g.stroke();
    }
  }
  return (texCache[key] = { map: finish(c), bump: finish(bc) });
}

// ---------- Beton ----------
function concrete(key, wear, seed = 9) {
  if (texCache[key]) return texCache[key];
  const rnd = texRng(seed);
  const [c, g] = newCanvas(), [bc, b] = newCanvas();
  g.fillStyle = wear > 0.3 ? '#9a978f' : '#b9b8b2'; g.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
  addNoise(g, 26, rnd);
  b.fillStyle = '#808080'; b.fillRect(0, 0, TEX_SIZE, TEX_SIZE); addNoise(b, 40, rnd);
  // Schalungsfugen + Ankerlöcher
  g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(0, TEX_SIZE / 2); g.lineTo(TEX_SIZE, TEX_SIZE / 2); g.moveTo(TEX_SIZE / 2, 0); g.lineTo(TEX_SIZE / 2, TEX_SIZE); g.stroke();
  g.fillStyle = 'rgba(0,0,0,.35)';
  for (const [x, y] of [[40, 40], [216, 40], [40, 216], [216, 216], [128, 80], [128, 176]]) { g.beginPath(); g.arc(x, y, 3.5, 0, 7); g.fill(); }
  if (wear > 0) {
    for (let i = 0; i < 14 * wear; i++) blotch(g, rnd() * TEX_SIZE, rnd() * TEX_SIZE, 15 + rnd() * 30, '#4a463e', 0.15, rnd);
    dirtBottom(g, 0.5 * wear);
  }
  return (texCache[key] = { map: finish(c), bump: finish(bc) });
}

// ---------- Wellblech ----------
function corrugated(key, wear, color = '#8f969c', seed = 11) {
  if (texCache[key]) return texCache[key];
  const rnd = texRng(seed);
  const [c, g] = newCanvas(), [bc, b] = newCanvas();
  for (let x = 0; x < TEX_SIZE; x++) {
    const s = Math.sin(x / TEX_SIZE * Math.PI * 2 * 12);
    g.fillStyle = mixHex(color, s > 0 ? '#ffffff' : '#000000', Math.abs(s) * 0.25);
    g.fillRect(x, 0, 1, TEX_SIZE);
    const v = Math.round(128 + s * 100); b.fillStyle = `rgb(${v},${v},${v})`; b.fillRect(x, 0, 1, TEX_SIZE);
  }
  addNoise(g, 12, rnd);
  if (wear > 0) { rust(g, null, wear * 1.3, rnd); dirtBottom(g, 0.4 * wear); }
  return (texCache[key] = { map: finish(c), bump: finish(bc) });
}

// ---------- Rolltor ----------
function shutter(key, wear, seed = 13) {
  if (texCache[key]) return texCache[key];
  const rnd = texRng(seed);
  const [c, g] = newCanvas(), [bc, b] = newCanvas();
  for (let y = 0; y < TEX_SIZE; y += 12) {
    const grd = g.createLinearGradient(0, y, 0, y + 12);
    grd.addColorStop(0, '#c8ccd0'); grd.addColorStop(0.5, '#9aa0a6'); grd.addColorStop(1, '#5e6266');
    g.fillStyle = grd; g.fillRect(0, y, TEX_SIZE, 12);
    b.fillStyle = '#c0c0c0'; b.fillRect(0, y, TEX_SIZE, 10); b.fillStyle = '#202020'; b.fillRect(0, y + 10, TEX_SIZE, 2);
  }
  addNoise(g, 10, rnd);
  if (wear > 0) { rust(g, null, wear, rnd); scratches(g, 25, rnd); }
  // Griff
  g.fillStyle = '#333'; g.fillRect(TEX_SIZE / 2 - 20, TEX_SIZE - 26, 40, 8);
  return (texCache[key] = { map: finish(c), bump: finish(bc) });
}

// ---------- Schild "VERKAUF" ----------
function signTex(level) {
  const key = 'sign' + level;
  if (texCache[key]) return texCache[key];
  const [c, g] = newCanvas(512, 128), [ec, e] = newCanvas(512, 128);
  e.fillStyle = '#000'; e.fillRect(0, 0, 512, 128);
  const rnd = texRng(17 + level);
  if (level === 1) {
    // handbemaltes Holzschild
    g.fillStyle = '#7a6448'; g.fillRect(0, 0, 512, 128);
    addNoise(g, 25, rnd);
    g.strokeStyle = 'rgba(30,20,10,.4)';
    for (let y = 0; y < 128; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(512, y); g.stroke(); }
    g.font = 'bold 70px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(235,225,200,.8)'; g.fillText('VERKAUF', 256, 68);
    for (let i = 0; i < 25; i++) blotch(g, rnd() * 512, rnd() * 128, 6 + rnd() * 10, '#7a6448', 0.6, rnd); // abgeblätterte Farbe
  } else if (level === 2) {
    g.fillStyle = '#e8e2d0'; g.fillRect(0, 0, 512, 128);
    addNoise(g, 14, rnd);
    g.strokeStyle = '#2f6a3a'; g.lineWidth = 10; g.strokeRect(8, 8, 496, 112);
    g.font = 'bold 66px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#2f6a3a'; g.fillText('VERKAUF €', 256, 68);
    for (let i = 0; i < 8; i++) blotch(g, rnd() * 512, rnd() * 128, 8 + rnd() * 10, '#8a5a30', 0.3, rnd);
  } else {
    const neon = level === 4;
    g.fillStyle = neon ? '#0d1218' : '#1d5a2c'; g.fillRect(0, 0, 512, 128);
    g.font = 'bold 72px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const ctx2 of [g, e]) {
      ctx2.fillStyle = neon ? '#5ee0ff' : '#ffffff';
      ctx2.font = g.font; ctx2.textAlign = 'center'; ctx2.textBaseline = 'middle';
      if (neon) { ctx2.shadowColor = '#5ee0ff'; ctx2.shadowBlur = 18; }
      ctx2.fillText(neon ? 'VERKAUF €' : 'VERKAUF', neon ? 256 : 220, 66);
      ctx2.shadowBlur = 0;
    }
    if (!neon) {
      for (const ctx2 of [g, e]) { ctx2.fillStyle = '#ffd75e'; ctx2.beginPath(); ctx2.arc(440, 64, 36, 0, 7); ctx2.fill(); }
      g.fillStyle = '#1d5a2c'; g.font = 'bold 50px Arial'; g.fillText('€', 440, 66);
      e.fillStyle = '#000'; e.font = 'bold 50px Arial'; e.fillText('€', 440, 66);
    }
  }
  const t = { map: finish(c), emissive: level >= 3 ? finish(ec) : null };
  t.map.wrapS = t.map.wrapT = THREE.ClampToEdgeWrapping;
  return (texCache[key] = t);
}

// ---------- Glasfront mit beleuchtetem Laden dahinter ----------
function shopWindow(key) {
  if (texCache[key]) return texCache[key];
  const rnd = texRng(21);
  const [c, g] = newCanvas(), [ec, e] = newCanvas();
  const grd = g.createLinearGradient(0, 0, 0, TEX_SIZE);
  grd.addColorStop(0, '#cfe6f2'); grd.addColorStop(1, '#8fb4c8');
  g.fillStyle = grd; g.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
  e.fillStyle = '#2a2f33'; e.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
  // Regale mit Waren
  for (let r = 0; r < 3; r++) {
    const y = 60 + r * 60;
    for (const ctx2 of [g, e]) { ctx2.fillStyle = '#6a6e72'; ctx2.fillRect(20, y, TEX_SIZE - 40, 5); }
    for (let x = 26; x < TEX_SIZE - 40; x += 16 + rnd() * 10) {
      const col = ['#e8904a', '#c2cad4', '#3fae4f', '#5a7fd0', '#d05ab0', '#9fb0bf'][Math.floor(rnd() * 6)];
      const h = 14 + rnd() * 22;
      g.fillStyle = col; g.fillRect(x, y - h, 12, h);
      e.fillStyle = mixHex(col, '#000000', 0.55); e.fillRect(x, y - h, 12, h);
    }
  }
  // Spiegelung
  g.fillStyle = 'rgba(255,255,255,.35)';
  g.beginPath(); g.moveTo(30, 0); g.lineTo(80, 0); g.lineTo(10, TEX_SIZE); g.lineTo(-40, TEX_SIZE); g.fill();
  // Rahmen
  for (const ctx2 of [g, e]) {
    ctx2.fillStyle = ctx2 === g ? '#2a2d30' : '#000';
    ctx2.fillRect(0, 0, TEX_SIZE, 8); ctx2.fillRect(0, TEX_SIZE - 8, TEX_SIZE, 8); ctx2.fillRect(0, 0, 8, TEX_SIZE); ctx2.fillRect(TEX_SIZE - 8, 0, 8, TEX_SIZE);
    ctx2.fillRect(TEX_SIZE / 2 - 3, 0, 6, TEX_SIZE);
  }
  return (texCache[key] = { map: finish(c), emissive: finish(ec) });
}

// ---------- Material-Fabrik ----------
const matCache = {};
function texMat(key, tex, opts = {}) {
  if (matCache[key]) return matCache[key];
  const m = new THREE.MeshStandardMaterial(Object.assign({
    map: tex.map, bumpMap: tex.bump || null, bumpScale: 0.025,
    roughness: 0.8, metalness: 0.2,
  }, opts));
  if (tex.emissive) { m.emissiveMap = tex.emissive; m.emissive = new THREE.Color(0xffffff); m.emissiveIntensity = opts.emissiveIntensity ?? 1; }
  return (matCache[key] = m);
}

// Verschleiß pro Stufe
const WEAR = [0, 1, 0.45, 0, 0];

// Gebäudefarbe + Stil pro Stufe
function metalMat(name, color, level, extra = {}) {
  const hi = level === 4;
  const tex = paintedMetal(`${name}-${level}`, {
    color: hi ? (extra.hiColor || '#2b3138') : color, wear: WEAR[level],
    stripes: level === 3 && extra.stripes !== false, glow: hi ? '#5ee0ff' : null,
    panels: extra.panels || 2, seed: name.length * 13 + level,
  });
  return texMat(`m-${name}-${level}`, tex, {
    roughness: [0, 0.95, 0.75, 0.5, 0.3][level],
    metalness: [0, 0.2, 0.25, 0.3, 0.35][level],
  });
}

// =====================================================================
//  Erze: Gestein mit Erzadern (Farbe) + Glanz-Maske (Metall/Rauheit)
// =====================================================================
const ORE_STYLE = {
  // Grundgestein, Adernfarben, Glanzfarbe, wie metallisch die Adern sind
  iron_ore:   { stone: ['#5e5a56', '#47423e'], vein: ['#8a3e22', '#a5532c', '#6b2c18'], fleck: '#c9ccd2', metal: 0.45 },
  copper_ore: { stone: ['#5c574f', '#45403a'], vein: ['#d98a2b', '#f0b040', '#b8641e'], fleck: '#ffd36a', metal: 0.5, patina: '#4e8a64' },
  coal:       { stone: ['#3a3836', '#2a2826'], vein: ['#0c0c0e', '#141416', '#1c1c20'], fleck: '#4a4e58', metal: 0.25 },
};

function oreTex(ore) {
  const key = 'ore-' + ore;
  if (texCache[key]) return texCache[key];
  const st = ORE_STYLE[ore], rnd = texRng(ore.length * 31 + 7);
  const [c, g] = newCanvas(), [mc, m] = newCanvas(), [bc, b] = newCanvas();
  // Grundgestein mit Schichtung
  const grd = g.createLinearGradient(0, 0, TEX_SIZE, TEX_SIZE);
  grd.addColorStop(0, st.stone[0]); grd.addColorStop(1, st.stone[1]);
  g.fillStyle = grd; g.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
  for (let i = 0; i < 40; i++) blotch(g, rnd() * TEX_SIZE, rnd() * TEX_SIZE, 10 + rnd() * 30, rnd() < 0.5 ? '#000' : '#fff', 0.05, rnd);
  addNoise(g, 34, rnd);
  // Glanzmaske: G = Rauheit (hell = rau), B = Metall (hell = metallisch)
  m.fillStyle = 'rgb(0,235,0)'; m.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
  b.fillStyle = '#808080'; b.fillRect(0, 0, TEX_SIZE, TEX_SIZE); addNoise(b, 60, rnd);
  // Risse im Gestein
  g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 1.3; b.strokeStyle = '#202020'; b.lineWidth = 2;
  for (let i = 0; i < 9; i++) {
    let x = rnd() * TEX_SIZE, y = rnd() * TEX_SIZE;
    for (const ctx2 of [g, b]) { ctx2.beginPath(); ctx2.moveTo(x, y); }
    for (let k = 0; k < 7; k++) { x += (rnd() - 0.5) * 34; y += (rnd() - 0.5) * 34; g.lineTo(x, y); b.lineTo(x, y); }
    g.stroke(); b.stroke();
  }
  // Erzadern: geschwungene, dicke Bänder
  const metalB = Math.round(st.metal * 255);
  for (let i = 0; i < 7; i++) {
    let x = rnd() * TEX_SIZE, y = rnd() * TEX_SIZE, a = rnd() * Math.PI * 2;
    const w = 4 + rnd() * 9, col = st.vein[i % st.vein.length];
    const pts = [[x, y]];
    for (let k = 0; k < 9; k++) { a += (rnd() - 0.5) * 1.1; x += Math.cos(a) * 18; y += Math.sin(a) * 18; pts.push([x, y]); }
    const stroke = (ctx2, style, lw) => {
      ctx2.strokeStyle = style; ctx2.lineWidth = lw; ctx2.lineCap = 'round'; ctx2.lineJoin = 'round';
      ctx2.beginPath(); pts.forEach(([px, py], j) => j ? ctx2.lineTo(px, py) : ctx2.moveTo(px, py)); ctx2.stroke();
    };
    stroke(g, 'rgba(0,0,0,.35)', w + 3);
    stroke(g, col, w);
    stroke(m, `rgb(0,${ore === 'coal' ? 40 : 90},${metalB})`, w);
    stroke(b, '#d0d0d0', w);
  }
  // Erzbrocken / Nester
  for (let i = 0; i < 26; i++) {
    const x = rnd() * TEX_SIZE, y = rnd() * TEX_SIZE, r = 3 + rnd() * 8, col = st.vein[i % st.vein.length];
    g.fillStyle = col; g.beginPath();
    for (let k = 0; k < 7; k++) { const aa = k / 7 * Math.PI * 2, rr = r * (0.6 + rnd() * 0.5); g.lineTo(x + Math.cos(aa) * rr, y + Math.sin(aa) * rr); }
    g.closePath(); g.fill();
    m.fillStyle = `rgb(0,${ore === 'coal' ? 30 : 80},${metalB})`; m.beginPath(); m.arc(x, y, r * 0.9, 0, 7); m.fill();
    b.fillStyle = '#e0e0e0'; b.beginPath(); b.arc(x, y, r, 0, 7); b.fill();
    // Lichtkante
    g.fillStyle = 'rgba(255,255,255,.25)'; g.beginPath(); g.arc(x - r * 0.3, y - r * 0.3, r * 0.35, 0, 7); g.fill();
  }
  // Glitzerpunkte
  for (let i = 0; i < 90; i++) {
    const x = rnd() * TEX_SIZE, y = rnd() * TEX_SIZE, r = 0.6 + rnd() * 1.6;
    g.fillStyle = st.fleck; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    m.fillStyle = `rgb(0,20,${metalB})`; m.beginPath(); m.arc(x, y, r + 0.5, 0, 7); m.fill();
  }
  // Kupfer: grüne Patina-Flecken
  if (st.patina) for (let i = 0; i < 6; i++) blotch(g, rnd() * TEX_SIZE, rnd() * TEX_SIZE, 3 + rnd() * 6, st.patina, 0.35, rnd);
  const t = { map: finish(c), rough: finish(mc), bump: finish(bc) };
  return (texCache[key] = t);
}

// Einfache Himmel-Umgebung, damit metallische Erzadern glänzen
let oreEnv = null;
function getOreEnv(renderer) {
  if (oreEnv) return oreEnv;
  const [c, g] = newCanvas(64, 32);
  const grd = g.createLinearGradient(0, 0, 0, 32);
  grd.addColorStop(0, '#d8ecff'); grd.addColorStop(0.48, '#9cc8ec'); grd.addColorStop(0.52, '#6a7a52'); grd.addColorStop(1, '#3a4630');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 32);
  const t = new THREE.CanvasTexture(c);
  t.mapping = THREE.EquirectangularReflectionMapping;
  const pm = new THREE.PMREMGenerator(renderer);
  oreEnv = pm.fromEquirectangular(t).texture;
  pm.dispose(); t.dispose();
  return oreEnv;
}

function oreMat(ore, renderer) {
  const key = 'oremat-' + ore;
  if (matCache[key]) return matCache[key];
  const t = oreTex(ore);
  const m = new THREE.MeshStandardMaterial({
    map: t.map, roughnessMap: t.rough, metalnessMap: t.rough, bumpMap: t.bump, bumpScale: 0.04,
    roughness: 1, metalness: 1, flatShading: true, envMap: getOreEnv(renderer), envMapIntensity: 0.22,
  });
  return (matCache[key] = m);
}

// glänzende Kristalle/Nuggets, die aus dem Gestein ragen
function nuggetMat(ore, renderer) {
  const key = 'nug-' + ore;
  if (matCache[key]) return matCache[key];
  const opts = {
    iron_ore:   { color: 0xa8aab0, metalness: 0.9, roughness: 0.32 },
    copper_ore: { color: 0xf0a238, metalness: 1.0, roughness: 0.22, emissive: 0x3a1e00 },
    coal:       { color: 0x18181c, metalness: 0.35, roughness: 0.12 },
  }[ore];
  const m = new THREE.MeshStandardMaterial(Object.assign({ flatShading: true, envMap: getOreEnv(renderer), envMapIntensity: 0.9 }, opts));
  return (matCache[key] = m);
}

// Unregelmäßiger Felsbrocken (Ecken werden nach Position verschoben, damit keine Löcher entstehen)
function rockGeometry(seed, detail = 1, amount = 0.28) {
  const geo = new THREE.IcosahedronGeometry(1, detail);
  const p = geo.attributes.position;
  const h = (x, y, z) => { const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + seed * 4.1) * 43758.5453; return s - Math.floor(s); };
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + (h(Math.round(x * 100), Math.round(y * 100), Math.round(z * 100)) - 0.5) * 2 * amount;
    p.setXYZ(i, x * k, y * k * 0.85, z * k);
  }
  geo.computeVertexNormals();
  return geo;
}
