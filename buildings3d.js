'use strict';
// =====================================================================
//  Gebäude-Modelle: eigene Bohrer je Erzsorte, Detailteile,
//  und die futuristischen Stufen 5 (Futuristisch) und 6 (Quanten)
//  Alle Modelle zeigen nach +x (Ausgabeseite), Feld = 2 × 2 Einheiten.
// =====================================================================

// ---------- kleine Bausteine ----------
const BC = { cyl8: null };
function cylGeo() { return BC.cyl8 || (BC.cyl8 = new THREE.CylinderGeometry(0.5, 0.5, 1, 10)); }
function rod(mat, x1, y1, z1, x2, y2, z2, r = 0.05) { // Stab zwischen zwei Punkten
  const a = new THREE.Vector3(x1, y1, z1), b = new THREE.Vector3(x2, y2, z2), d = b.clone().sub(a);
  const m = new THREE.Mesh(cylGeo(), mat);
  m.scale.set(r * 2, d.length(), r * 2);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  m.castShadow = true;
  return m;
}
function ladder(mat, x, z, y0, y1, face = 1) { // Leiter an einer Wand (face: +1 = +z-Seite)
  const g = new THREE.Group();
  g.add(rod(mat, x - 0.14, y0, z, x - 0.14, y1, z, 0.02), rod(mat, x + 0.14, y0, z, x + 0.14, y1, z, 0.02));
  for (let y = y0 + 0.15; y < y1; y += 0.25) g.add(rod(mat, x - 0.14, y, z, x + 0.14, y, z, 0.015));
  return g;
}
function railing(mat, y, half, sides = [1, 1, 1, 1]) { // Geländer um eine Plattform
  const g = new THREE.Group(), h = half;
  const edges = [[-h, -h, h, -h], [h, -h, h, h], [h, h, -h, h], [-h, h, -h, -h]];
  edges.forEach(([x1, z1, x2, z2], i) => {
    if (!sides[i]) return;
    g.add(rod(mat, x1, y + 0.35, z1, x2, y + 0.35, z2, 0.02), rod(mat, x1, y + 0.18, z1, x2, y + 0.18, z2, 0.015));
    g.add(rod(mat, x1, y, z1, x1, y + 0.35, z1, 0.02));
  });
  return g;
}
function lamp(grp, P, x, y, z, color = 0xffa030) { // Warnlampe (blinkt bei Betrieb)
  const m = new THREE.Mesh(v3.geos.sphere, new THREE.MeshBasicMaterial({ color }));
  m.scale.set(0.14, 0.14, 0.14); m.position.set(x, y, z);
  grp.add(m); (P.lamps || (P.lamps = [])).push(m); m.userData.color = color;
  return m;
}
function oreSign(grp, ore, x, y, z) { // Schild mit dem Erz, das abgebaut wird
  const s = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), itemIcon(ore));
  s.position.set(x, y, z); s.rotation.y = Math.PI / 2;
  grp.add(s);
}
function vents(grp, mat, y, n = 2) {
  for (let i = 0; i < n; i++) {
    const v = part('cyl', mat, 0.22, 0.25, 0.22, -0.45 + i * 0.45, y + 0.12, -0.5);
    grp.add(v, part('cyl', 'dark', 0.26, 0.04, 0.26, -0.45 + i * 0.45, y + 0.26, -0.5));
  }
}

// Material je Stufe für Bohrer-Rahmen/-Körper (Stufe 1 rostig/holzig … 4 Hightech)
const drillCol = { iron_ore: '#6b7a3a', copper_ore: '#7a5a3a', coal: '#d8a21c', stone: '#8a8a82', gold_ore: '#2f6a5a', quartz: '#5a4a8a' };
function bodyMat(name, color, L, hi) { return metalMat(name, color, L, { hiColor: hi || '#2b3138' }); }
const steelMat = L => metalMat('steel', '#767d86', L, { stripes: false, panels: 4 });

// =====================================================================
//  Bohrer je Erzsorte
// =====================================================================
function buildDrill(grp, P, L, ore) {
  switch (ore) {
    case 'coal': return buildExcavator(grp, P, L, ore);
    case 'stone': return buildQuarry(grp, P, L, ore);
    case 'gold_ore': return buildGoldWasher(grp, P, L, ore);
    case 'quartz': return buildLaser(grp, P, L, ore);
    default: return buildDerrick(grp, P, L, ore);
  }
}

// Erzbohrer: Bohrturm mit Plattform, Leiter und Bohrkopf (Eisen/Kupfer)
function buildDerrick(grp, P, L, ore) {
  const s = T3, col = drillCol[ore];
  const base = L === 1 ? woodMat(1) : bodyMat('drill-' + ore, L === 2 ? col : L === 3 ? '#d8a21c' : col, L);
  const frame = L === 1 ? woodMat(1) : steelMat(L);
  const drillM = metalMat('drill', '#9aa0a8', L, { stripes: false, panels: 1 });
  grp.add(part('box', base, s * 0.9, 0.7, s * 0.9, 0, 0.35, 0));
  // Fundament-Füße
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) grp.add(part('box', 'dark', 0.3, 0.1, 0.3, dx * 0.72, 0.05, dz * 0.72));
  const H = L >= 3 ? 2.6 : 2.3;
  if (L < 4) {
    // Gittermast: vier Pfosten, Querstreben, Diagonalen
    const top = 0.7 + H, w0 = 0.62, w1 = 0.32;
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    corners.forEach(([dx, dz]) => grp.add(rod(frame, dx * w0, 0.7, dz * w0, dx * w1, top, dz * w1, L === 1 ? 0.07 : 0.045)));
    const lv = L >= 3 ? [0.25, 0.5, 0.75] : [0.33, 0.66];
    for (const f of lv) {
      const y = 0.7 + H * f, w = w0 + (w1 - w0) * f;
      for (let i = 0; i < 4; i++) { const [ax, az] = corners[i], [bx, bz] = corners[(i + 1) % 4]; grp.add(rod(frame, ax * w, y, az * w, bx * w, y, bz * w, 0.025)); }
    }
    if (L >= 2) for (let i = 0; i < 4; i++) { // Kreuzverstrebung
      const [ax, az] = corners[i], [bx, bz] = corners[(i + 1) % 4], y1 = 0.7, y2 = 0.7 + H * 0.5, wa = w0, wb = w0 + (w1 - w0) * 0.5;
      grp.add(rod(frame, ax * wa, y1, az * wa, bx * wb, y2, bz * wb, 0.018));
    }
    grp.add(part('box', L === 1 ? woodMat(1) : frame, 0.9, 0.1, 0.9, 0, top, 0));
    if (L >= 2) grp.add(railing(steelMat(L), top + 0.05, 0.42, [1, 0, 1, 1]));
    grp.add(ladder(frame, -0.3, 0.52, 0.7, top - 0.1));
    if (L >= 3) lamp(grp, P, 0.35, top + 0.25, 0.35);
  } else {
    grp.add(part('cyl', frame, 0.9, H, 0.9, 0, 0.7 + H / 2, 0));
    const ring = new THREE.Mesh(v3.geos.torus, glowMat(0x5ee0ff));
    ring.rotation.x = Math.PI / 2; ring.position.y = 1.6; ring.scale.set(0.62, 0.62, 0.62);
    grp.add(ring); P.ring = ring;
  }
  // Antrieb (Motor + Seiltrommel) oben
  grp.add(part('box', L === 1 ? drillM : base, 0.6, 0.4, 0.5, 0, 1.05 + H, 0));
  if (L >= 2) { const drum = part('cyl', drillM, 0.3, 0.5, 0.3, 0.32, 1.05 + H, 0); drum.rotation.x = Math.PI / 2; grp.add(drum); }
  // Bohrgestänge + Bohrkopf (dreht sich)
  const drill = new THREE.Group(); drill.position.y = 1.15;
  drill.add(part('cyl', drillM, 0.16, H, 0.16, 0, H / 2 - 0.2, 0));
  for (let i = 0; i < 3; i++) { const bl = part('box', drillM, 0.85, 0.06, 0.14, 0, 0, 0); bl.rotation.y = i * Math.PI / 3; bl.rotation.x = 0.25; drill.add(bl); }
  if (L === 4) { const c = part('cone', glowMat(0x5ee0ff), 0.18, 0.3, 0.18, 0, -0.2, 0); c.rotation.x = Math.PI; drill.add(c); }
  grp.add(drill); P.drill = drill; P.axis = 'y'; P.spin = 4;
  // Auswurf-Rutsche, Schild, Fässer/Schaltkasten, Kabel
  const chute = part('box', drillM, 0.5, 0.12, 0.45, s * 0.42, 0.55, 0); chute.rotation.z = -0.35; grp.add(chute);
  grp.add(arrowPart(s * 0.5, 0.9));
  oreSign(grp, ore, s * 0.451, 0.42, 0.5);
  if (L === 1) { const f = part('cyl', metalMat('barrel', '#7a5030', 1, { stripes: false, panels: 1 }), 0.32, 0.5, 0.32, -0.7, 0.95, 0.68); f.rotation.z = 0.1; grp.add(f); }
  if (L >= 3) {
    grp.add(part('box', metalMat('cab', '#8a9096', L, { stripes: false }), 0.35, 0.55, 0.22, -0.68, 0.98, -0.72));
    grp.add(rod(M_cable(), -0.68, 1.2, -0.72, 0, 1.05 + H, -0.2, 0.025));
  }
}
function M_cable() { return v3.mats.cable || (v3.mats.cable = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6 })); }

// Kohlebagger: Raupenfahrwerk, Führerhaus, Ausleger mit drehendem Schaufelrad
function buildExcavator(grp, P, L, ore) {
  const s = T3;
  const body = bodyMat('bagger', L === 2 ? '#c8782a' : '#d8a21c', L);
  const dark = metalMat('track', '#2a2c30', Math.min(L, 2), { stripes: false, panels: 4 });
  const steel = steelMat(L);
  // Raupenketten
  for (const z of [-0.62, 0.62]) {
    grp.add(part('box', dark, s * 0.85, 0.32, 0.36, -0.1, 0.16, z));
    for (let i = 0; i < 5; i++) { const w = part('cyl', steel, 0.22, 0.38, 0.22, -0.75 + i * 0.32, 0.16, z); w.rotation.x = Math.PI / 2; grp.add(w); }
  }
  // Drehkranz + Oberwagen
  grp.add(part('cyl', steel, 1.0, 0.15, 1.0, -0.15, 0.4, 0));
  grp.add(part('box', body, 1.2, 0.6, 1.1, -0.25, 0.78, 0));
  // Führerhaus mit Fenster
  grp.add(part('box', body, 0.55, 0.6, 0.5, 0.15, 1.38, 0.28));
  const glass = v3.mats.glassCab || (v3.mats.glassCab = new THREE.MeshStandardMaterial({ color: 0x8ab4d0, roughness: 0.1, metalness: 0.4, envMap: getOreEnv(v3.renderer), envMapIntensity: 0.8 }));
  grp.add(plane(glass, 0.45, 0.35, 0.43, 1.45, 0.28));
  if (L >= 3) lamp(grp, P, 0.15, 1.75, 0.28);
  grp.add(part('box', 'dark', 0.4, 0.3, 0.9, -0.75, 1.2, 0)); // Gegengewicht/Motor
  if (L === 1) grp.add(part('cyl', 'dark', 0.12, 0.6, 0.12, -0.7, 1.5, -0.35)); // Auspuff
  // Ausleger nach vorne
  const boom = new THREE.Group(); boom.position.set(0.2, 1.0, -0.25);
  boom.add(rod(steel, 0, 0, 0, 0.75, -0.25, 0, 0.09), rod(steel, 0, 0.25, 0, 0.75, -0.05, 0, 0.06));
  grp.add(boom);
  // Schaufelrad (dreht sich um die Querachse)
  const wheel = new THREE.Group(); wheel.position.set(0.95, 0.75, -0.25);
  const rim = new THREE.Mesh(v3.geos.torus, steel); rim.scale.set(0.42, 0.42, 1.6); wheel.add(rim);
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2, bk = part('box', dark, 0.2, 0.16, 0.24, Math.cos(a) * 0.45, Math.sin(a) * 0.45, 0);
    bk.rotation.z = a; wheel.add(bk);
    wheel.add(rod(steel, 0, 0, 0, Math.cos(a) * 0.4, Math.sin(a) * 0.4, 0, 0.025));
  }
  grp.add(wheel); P.drill = wheel; P.axis = 'z'; P.spin = -2.5;
  // Kohlehaufen unter dem Rad
  const coalM = oreMat('coal', v3.renderer);
  for (let i = 0; i < 4; i++) { const r = new THREE.Mesh(v3.rockLo || rockGeometry(1, 0, 0.3), coalM); r.scale.set(0.2, 0.14, 0.18); r.position.set(0.75 + (i % 2) * 0.2, 0.08, -0.6 + i * 0.25); grp.add(r); }
  grp.add(arrowPart(s * 0.5, 0.35));
  oreSign(grp, ore, -0.84, 0.8, 0); // Schild hinten
}

// Steinbruch: Trichter, Brecher, Steinsäge, Schotterhaufen
function buildQuarry(grp, P, L, ore) {
  const s = T3;
  const body = bodyMat('quarry', L === 2 ? '#8a7a5a' : L === 3 ? '#e0a020' : '#8a8a82', L);
  const steel = steelMat(L);
  grp.add(part('box', L === 1 ? woodMat(1) : concreteMat(Math.max(2, L)), s * 0.9, 0.35, s * 0.9, 0, 0.17, 0));
  // Brecherhaus
  grp.add(part('box', body, 0.9, 0.8, 0.9, -0.3, 0.75, -0.25));
  // Trichter oben (umgedrehte Pyramide)
  const hop = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.25, 0.6, 4), body);
  hop.rotation.y = Math.PI / 4; hop.position.set(-0.3, 1.45, -0.25); hop.castShadow = true; grp.add(hop);
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) grp.add(rod(steel, -0.3 + dx * 0.4, 0.35, -0.25 + dz * 0.4, -0.3 + dx * 0.4, 1.2, -0.25 + dz * 0.4, 0.03));
  // große Kreissäge (dreht sich)
  const saw = new THREE.Group(); saw.position.set(0.45, 0.85, 0.45);
  const blade = part('cyl', metalMat('blade', '#c8ccd0', L, { stripes: false, panels: 1 }), 1.0, 0.04, 1.0, 0, 0, 0); blade.rotation.x = Math.PI / 2; saw.add(blade);
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, t = part('box', steel, 0.08, 0.08, 0.05, Math.cos(a) * 0.52, Math.sin(a) * 0.52, 0); t.rotation.z = a + 0.6; saw.add(t); }
  saw.add(part('cyl', 'dark', 0.2, 0.08, 0.2, 0, 0, 0).rotateX(Math.PI / 2));
  grp.add(saw); P.drill = saw; P.axis = 'z'; P.spin = -6;
  grp.add(part('box', body, 0.15, 0.7, 0.6, 0.45, 1.2, 0.45)); // Sägeschutz
  // Steinblock, der zersägt wird, und Schotterhaufen
  const stoneM = oreMat('stone', v3.renderer);
  grp.add(part('box', stoneM, 0.7, 0.4, 0.5, 0.45, 0.55, 0.45));
  for (let i = 0; i < 6; i++) { const r = new THREE.Mesh(v3.rockLo || rockGeometry(1, 0, 0.3), stoneM); const k = 0.1 + (i % 3) * 0.04; r.scale.set(k, k * 0.7, k); r.position.set(-0.55 + (i % 3) * 0.15, 0.4 + Math.floor(i / 3) * 0.08, 0.55 + (i % 2) * 0.12); grp.add(r); }
  // Förderrutsche zum Ausgang
  const ch = part('box', steel, 0.8, 0.06, 0.35, 0.55, 0.5, -0.4); ch.rotation.z = -0.25; grp.add(ch);
  if (L >= 3) lamp(grp, P, -0.3, 1.85, -0.25);
  grp.add(arrowPart(s * 0.5, 0.6));
  oreSign(grp, ore, s * 0.451, 0.3, 0.0);
}

// Goldwäscher: Wassertank, drehende Waschtrommel, Rinne mit Wasser
function buildGoldWasher(grp, P, L, ore) {
  const s = T3;
  const frame = L === 1 ? woodMat(1) : steelMat(L);
  const body = bodyMat('washer', L === 2 ? '#3a6a5a' : L === 3 ? '#2f7a6a' : '#2f6a5a', L);
  grp.add(part('box', L === 1 ? woodMat(1) : body, s * 0.9, 0.25, s * 0.9, 0, 0.12, 0));
  // Gerüst
  for (const [x, z] of [[-0.7, -0.6], [0.5, -0.6], [-0.7, 0.6], [0.5, 0.6]]) grp.add(rod(frame, x, 0.25, z, x, 1.25, z, L === 1 ? 0.06 : 0.04));
  grp.add(part('box', frame, 1.4, 0.08, 1.35, -0.1, 1.25, 0));
  // Waschtrommel (dreht sich um die Längsachse)
  const drum = new THREE.Group(); drum.position.set(-0.1, 1.6, 0);
  const shell = part('cyl', body, 0.7, 1.3, 0.7, 0, 0, 0); shell.rotation.z = Math.PI / 2; drum.add(shell);
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; drum.add(rod(steelMat(L), -0.66, Math.cos(a) * 0.36, Math.sin(a) * 0.36, 0.66, Math.cos(a) * 0.36, Math.sin(a) * 0.36, 0.025)); }
  for (const x of [-0.6, 0.6]) { const r = new THREE.Mesh(v3.geos.torus, steelMat(L)); r.rotation.y = Math.PI / 2; r.scale.set(0.37, 0.37, 1.2); r.position.x = x; drum.add(r); }
  grp.add(drum); P.drill = drum; P.axis = 'x'; P.spin = 2;
  // Wassertank
  const tank = part('cyl', L === 1 ? woodMat(1) : metalMat('tank', '#5a7a9a', L, { stripes: false }), 0.6, 0.9, 0.6, -0.65, 0.7, -0.6);
  grp.add(tank);
  const waterM = v3.waterMat || new THREE.MeshStandardMaterial({ color: 0x2a6a90, roughness: 0.1, transparent: true, opacity: 0.85 });
  grp.add(part('cyl', waterM, 0.56, 0.02, 0.56, -0.65, 1.15, -0.6));
  grp.add(rod(steelMat(L), -0.65, 1.15, -0.6, -0.6, 1.6, -0.3, 0.04)); // Wasserrohr
  // Waschrinne mit fließendem Wasser
  const sl = new THREE.Group(); sl.position.set(0.35, 0.7, 0.2); sl.rotation.z = -0.3;
  sl.add(part('box', frame, 1.0, 0.05, 0.45, 0, 0, 0), part('box', frame, 1.0, 0.15, 0.04, 0, 0.07, 0.22), part('box', frame, 1.0, 0.15, 0.04, 0, 0.07, -0.22));
  const w = part('box', waterM, 0.95, 0.02, 0.4, 0, 0.04, 0); sl.add(w);
  for (let i = 0; i < 5; i++) sl.add(part('box', 'gold', 0.04, 0.03, 0.4, -0.4 + i * 0.2, 0.05, 0)); // Riffel mit Goldflitter
  grp.add(sl);
  // Goldwanne
  grp.add(part('cyl', 'gold', 0.4, 0.06, 0.4, 0.75, 0.3, -0.55));
  if (L >= 3) lamp(grp, P, 0.5, 1.4, 0.6, 0xffe060);
  grp.add(arrowPart(s * 0.5, 0.4));
  oreSign(grp, ore, s * 0.451, 0.6, 0.62);
}

// Quarzlaser: Portal mit Laserkopf, pulsierender Strahl auf das Gestein
function buildLaser(grp, P, L, ore) {
  const s = T3;
  const body = bodyMat('laser', L === 2 ? '#5a5a7a' : L === 3 ? '#4a4ab0' : '#5a4a8a', L, '#e9edf0');
  const steel = steelMat(L);
  grp.add(part('box', body, s * 0.9, 0.3, s * 0.9, 0, 0.15, 0));
  // Portalrahmen
  for (const z of [-0.7, 0.7]) { grp.add(part('box', body, 0.18, 1.9, 0.18, -0.6, 1.25, z), part('box', body, 0.18, 1.9, 0.18, 0.6, 1.25, z)); }
  grp.add(part('box', body, 1.4, 0.18, 0.18, 0, 2.2, -0.7), part('box', body, 1.4, 0.18, 0.18, 0, 2.2, 0.7));
  grp.add(part('box', steel, 0.22, 0.14, 1.6, 0, 2.25, 0)); // Laufschiene
  // Laserkopf (dreht sich langsam) mit Strahl
  const head = new THREE.Group(); head.position.set(0, 1.95, 0);
  head.add(part('box', steel, 0.4, 0.35, 0.4, 0, 0, 0));
  const lens = part('cyl', glowMat(L <= 2 ? 0xff4040 : 0xd070ff), 0.14, 0.12, 0.14, 0, -0.22, 0); head.add(lens);
  for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) head.add(part('box', 'dark', 0.06, 0.25, 0.06, Math.cos(a) * 0.22, -0.05, Math.sin(a) * 0.22));
  grp.add(head); P.drill = head; P.axis = 'y'; P.spin = 1.2;
  const beamM = new THREE.MeshBasicMaterial({ color: L <= 2 ? 0xff5050 : 0xe090ff, transparent: true, opacity: 0.7, depthWrite: false });
  const beam = part('cyl', beamM, 0.06, 1.45, 0.06, 0, 1.08, 0); beam.castShadow = false; grp.add(beam); P.beam = beam;
  // Kristall unter dem Laser + Glühen
  const qm = nuggetMat('quartz', v3.renderer);
  const cr = new THREE.Mesh(v3.nugGeo ? v3.nugGeo.quartz : new THREE.OctahedronGeometry(1, 0), qm); cr.scale.set(0.16, 0.16, 0.16); cr.position.set(0, 0.32, 0); grp.add(cr);
  const glow = part('cyl', new THREE.MeshBasicMaterial({ color: 0xffd0ff, transparent: true, opacity: 0.5, depthWrite: false }), 0.35, 0.02, 0.35, 0, 0.31, 0);
  glow.castShadow = false; grp.add(glow); P.glow = glow;
  // Kühlleitungen + Steuerpult
  grp.add(rod(M_cable(), -0.6, 0.4, 0.7, -0.6, 2.1, 0.7, 0.04), rod(M_cable(), -0.6, 2.2, 0.7, -0.1, 2.25, 0.1, 0.03));
  grp.add(part('box', metalMat('panel', '#3a3e44', L, { stripes: false, panels: 1 }), 0.3, 0.5, 0.4, 0.75, 0.55, -0.6));
  const scr = part('box', glowMat(L === 1 ? 0x204020 : 0x40ff80), 0.02, 0.22, 0.3, 0.91, 0.65, -0.6); scr.castShadow = false; grp.add(scr);
  grp.add(arrowPart(s * 0.5, 0.45));
  oreSign(grp, ore, s * 0.451, 0.8, 0.45);
}

// =====================================================================
//  Detailteile für Ofen und Montierer (je nach Stufe)
// =====================================================================
function addDetails(grp, P, L, type) {
  const steel = steelMat(Math.min(L, 4));
  if (type === 'furnace') {
    grp.add(ladder(steel, -0.5, -0.92, 0.1, 1.55));
    if (L >= 2) grp.add(railing(steel, 1.62, 0.85, [0, 0, 1, 1]));
    if (L >= 3) lamp(grp, P, 0.75, 1.75, 0.75, 0xff6020);
    // Kohle-Einfüllschacht
    grp.add(part('box', 'dark', 0.4, 0.3, 0.4, -0.9, 0.95, 0.5));
  }
  if (type === 'assembler') {
    vents(grp, metalMat('vent', '#8a9096', Math.min(L, 4), { stripes: false, panels: 1 }), 1.66);
    grp.add(rod(steel, -0.95, 0.3, 0.6, -0.95, 1.3, 0.6, 0.06), rod(steel, -0.95, 1.3, 0.6, -0.95, 1.3, -0.3, 0.06)); // Rohr
    if (L >= 2) lamp(grp, P, 0.8, 1.75, -0.8, L >= 4 ? 0x5ee0ff : 0x40ff60);
  }
}

// =====================================================================
//  Stufe 5 (Futuristisch) und 6 (Quanten): Schwebe-Bauweise mit Energiekern
// =====================================================================
function futureMats(L) {
  const k = 'fut' + L;
  if (v3.mats[k]) return v3.mats[k];
  const env = getOreEnv(v3.renderer);
  const glow = L === 5 ? 0x5ee0ff : 0xc070ff;
  return (v3.mats[k] = {
    light: new THREE.MeshStandardMaterial({ color: L === 5 ? 0xeef3f8 : 0xf4f0ff, metalness: 0.55, roughness: 0.22, envMap: env, envMapIntensity: 0.9 }),
    dark: new THREE.MeshStandardMaterial({ color: L === 5 ? 0x1e2630 : 0x1a1426, metalness: 0.8, roughness: 0.25, envMap: env, envMapIntensity: 0.8,
      emissive: glow, emissiveIntensity: 0.08 }),
    glow: new THREE.MeshBasicMaterial({ color: glow }),
    glowT: new THREE.MeshBasicMaterial({ color: glow, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }),
    color: glow,
  });
}

function futurize(grp, P, L) {
  const F = futureMats(L);
  // 1) Materialien tauschen: große Teile hell und glatt, kleine Teile dunkel mit Leuchtkante, Leuchtteile in Stufenfarbe
  const body = new THREE.Group();
  const kids = grp.children.slice();
  for (const c of kids) { grp.remove(c); body.add(c); }
  body.traverse(o => {
    if (!o.isMesh) return;
    if (o.material === v3.mats.arrow) { o.material = F.glow; return; } // Ausgabe-Pfeil bleibt gut sichtbar
    if (o.material && o.material.isMeshBasicMaterial) { if (!o.material.map) o.material = o.material.transparent ? F.glowT : F.glow; return; }
    if (o.material && o.material.map && (o.geometry.type === 'PlaneGeometry')) return; // Schilder/Symbole behalten
    if (Array.isArray(o.material)) return; // Förderband-Oberflächen u. ä.
    const sc = o.scale, vol = Math.abs(sc.x * sc.y * sc.z);
    o.material = vol > 0.08 ? F.light : F.dark;
  });
  // 2) Gebäude schwebt über einer Landeplattform
  body.position.y = 0.35;
  grp.add(body); P.hover = body;
  const pad = part('cyl', F.dark, T3 * 0.95, 0.12, T3 * 0.95, 0, 0.06, 0); grp.add(pad);
  const padRing = new THREE.Mesh(v3.geos.torus, F.glow); padRing.rotation.x = Math.PI / 2; padRing.scale.set(0.9, 0.9, 1); padRing.position.y = 0.13; grp.add(padRing);
  // Lichtsäulen an den Ecken
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const pil = part('cyl', F.dark, 0.12, 0.5, 0.12, dx * 0.8, 0.3, dz * 0.8); grp.add(pil);
    const tip = part('sphere', F.glow, 0.12, 0.12, 0.12, dx * 0.8, 0.6, dz * 0.8); tip.castShadow = false; grp.add(tip);
  }
  // 3) Energiekern über dem Gebäude + Hologramm-Ringe
  const bb = new THREE.Box3().setFromObject(body);
  const top = Math.min(4.5, Math.max(1.6, bb.max.y - grp.position.y)) + 0.5;
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 0), F.glow);
  core.position.y = top; grp.add(core); P.core = core;
  const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(0.34, 1), F.glowT); shell.position.y = top; grp.add(shell); P.shell = shell;
  P.rings = [];
  for (let i = 0; i < (L === 6 ? 3 : 2); i++) {
    const r = new THREE.Mesh(v3.geos.torus, F.glowT);
    const rad = 1.05 + i * 0.18; r.scale.set(rad, rad, 1.5);
    r.position.y = 0.9 + i * 0.45; r.rotation.x = Math.PI / 2 + (i - 1) * 0.25;
    r.castShadow = false; grp.add(r); P.rings.push(r);
  }
  // 4) Quanten-Stufe: kreisende Energiekugeln und Lichtsäule
  if (L === 6) {
    P.orbs = [];
    for (let i = 0; i < 4; i++) { const o = part('sphere', F.glow, 0.12, 0.12, 0.12, 0, top, 0); o.castShadow = false; grp.add(o); P.orbs.push(o); }
    const beam = part('cyl', F.glowT, 0.18, 6, 0.18, 0, top + 3.2, 0); beam.castShadow = false; grp.add(beam); P.qbeam = beam;
  }
}

// pro Bild: Animation der Zusatzteile (Lampen, Strahl, Schweben, Kern, Ringe)
function animateExtras(b, P, dt) {
  const working = b.type === 'miner' ? !b.empty && b.out.length < 2 : !!b.job;
  if (P.lamps) for (const m of P.lamps) {
    if (b.type === 'miner' && b.empty) m.material.color.setHex(0xff2020);
    else m.material.color.setHex(working && Math.sin(simTime * 8 + b.x) > 0 ? m.userData.color : 0x333333);
  }
  if (P.beam) { P.beam.visible = working; P.beam.material.opacity = 0.45 + Math.sin(simTime * 30) * 0.25; if (P.glow) P.glow.visible = working; }
  if (P.hover) P.hover.position.y = 0.35 + Math.sin(simTime * 1.6 + b.x) * 0.06;
  if (P.core) { P.core.rotation.y += dt * 2; P.core.rotation.x += dt * 1.3; P.shell.rotation.y -= dt * 0.8; P.core.position.y = P.shell.position.y = P.shell.position.y; }
  if (P.rings) P.rings.forEach((r, i) => { r.rotation.z += dt * (0.6 + i * 0.35) * (i % 2 ? -1 : 1); });
  if (P.orbs) P.orbs.forEach((o, i) => {
    const a = simTime * 1.8 + i * Math.PI / 2;
    o.position.set(Math.cos(a) * 1.2, P.core.position.y - 0.4 + Math.sin(a * 2) * 0.3, Math.sin(a) * 1.2);
  });
  if (P.qbeam) P.qbeam.material.opacity = 0.2 + Math.sin(simTime * 3) * 0.1;
}

// =====================================================================
//  Ausgabe-Pfeile auf dem Boden: zeigen deutlich, wohin ein Gebäude ausgibt
//  gelb = läuft, rot = Ausgabe blockiert (nichts in Pfeilrichtung, das annimmt)
// =====================================================================
function chevronGeo() {
  if (BC.chev) return BC.chev;
  const sh = new THREE.Shape();
  sh.moveTo(-0.16, 0.42); sh.lineTo(0.2, 0); sh.lineTo(-0.16, -0.42); sh.lineTo(-0.34, -0.42); sh.lineTo(0.02, 0); sh.lineTo(-0.34, 0.42); sh.closePath();
  const g = new THREE.ShapeGeometry(sh); g.rotateX(-Math.PI / 2);
  const o = new THREE.Shape(); // dunkler Rand für Kontrast auf Gras
  o.moveTo(-0.2, 0.52); o.lineTo(0.3, 0); o.lineTo(-0.2, -0.52); o.lineTo(-0.44, -0.52); o.lineTo(-0.04, 0); o.lineTo(-0.44, 0.52); o.closePath();
  const go = new THREE.ShapeGeometry(o); go.rotateX(-Math.PI / 2);
  return (BC.chev = { g, go });
}
function addOutArrows(grp, P, dirs = [0]) {
  const { g, go } = chevronGeo();
  const mat = new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0.95, depthWrite: false });
  const edge = new THREE.MeshBasicMaterial({ color: 0x1a1406, transparent: true, opacity: 0.6, depthWrite: false });
  P.outArrows = []; P.outMat = mat; P.outEdge = edge;
  for (const d of dirs) {
    const holder = new THREE.Group(); holder.rotation.y = -d * Math.PI / 2; // lokale Richtung (0 = +x)
    for (let k = 0; k < 2; k++) {
      const c = new THREE.Group();
      const e = new THREE.Mesh(go, edge); e.position.y = 0.3; e.renderOrder = 3; // schwebt über dem Gras
      const m = new THREE.Mesh(g, mat); m.position.y = 0.31; m.renderOrder = 4;
      c.add(e, m); holder.add(c); P.outArrows.push(c);
    }
    grp.add(holder);
  }
}
function outputBlocked(b) {
  if (b.type === 'miner') return b.out.length >= 2;
  if (b.type === 'furnace' || b.type === 'assembler') return b.out.length >= 4;
  if (b.type === 'splitter') return !!b.item && b.p >= 1;
  return false;
}
function animateOutArrows(b, P) {
  if (!P.outArrows) return;
  const blocked = b.inv ? outputBlocked(b) : false;
  P.outMat.color.setHex(blocked ? 0xff3a2a : 0xffd23a);
  const ph = (simTime * 1.1) % 1;
  P.outArrows.forEach((c, i) => {
    const f = (ph + (i % 2) * 0.5) % 1; // zwei Pfeile wandern nach außen
    c.position.x = 0.9 + f * 0.85;
    const sc = 1.6 * (0.85 + Math.sin(f * Math.PI) * 0.2); c.scale.set(sc, 1, sc);
  });
  P.outMat.opacity = blocked ? 0.75 + Math.sin(simTime * 10) * 0.25 : 0.95;
}

// grüne Eingangs-Pfeile (zeigen zum Gebäude hin): hinten, links, rechts
function addInArrows(grp, P, dirs = [1, 2, 3]) {
  const { g, go } = chevronGeo();
  const mat = new THREE.MeshBasicMaterial({ color: 0x4ee06a, transparent: true, opacity: 0.9, depthWrite: false });
  const edge = new THREE.MeshBasicMaterial({ color: 0x06140a, transparent: true, opacity: 0.55, depthWrite: false });
  P.inArrows = [];
  for (const d of dirs) {
    const holder = new THREE.Group(); holder.rotation.y = -d * Math.PI / 2;
    const c = new THREE.Group(); c.rotation.y = Math.PI; // Spitze zeigt zum Gebäude
    const e = new THREE.Mesh(go, edge); e.position.y = 0.28; e.renderOrder = 3;
    const m = new THREE.Mesh(g, mat); m.position.y = 0.29; m.renderOrder = 4;
    c.add(e, m); holder.add(c); P.inArrows.push(c);
    grp.add(holder);
  }
}
function animateInArrows(P) {
  if (!P.inArrows) return;
  const f = (simTime * 0.9) % 1;
  for (const c of P.inArrows) { c.position.x = 1.55 - f * 0.5; const sc = 1.15 * (0.85 + Math.sin(f * Math.PI) * 0.2); c.scale.set(sc, 1, sc); }
}
