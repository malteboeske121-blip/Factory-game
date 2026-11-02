'use strict';
// =====================================================================
//  Fabrik-Simulator – ein kleines Fabrik-Aufbauspiel im Browser
// =====================================================================

const TILE = 32;
const MAP_W = 64, MAP_H = 48;
const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1];
const SAVE_KEY = 'fabrik-sim-save-v1';

// ---------- Gegenstände ----------
const ITEMS = {
  iron_ore:     { name: 'Eisenerz',     color: '#8c7b70', shape: 'rock',   value: 1 },
  copper_ore:   { name: 'Kupfererz',    color: '#c06a35', shape: 'rock',   value: 1 },
  coal:         { name: 'Kohle',        color: '#2a2a2a', shape: 'rock',   value: 1 },
  iron_plate:   { name: 'Eisenplatte',  color: '#c2cad4', shape: 'plate',  value: 3 },
  copper_plate: { name: 'Kupferplatte', color: '#ef9550', shape: 'plate',  value: 3 },
  gear:         { name: 'Zahnrad',      color: '#9fb0bf', shape: 'gear',   value: 8 },
  wire:         { name: 'Kupferkabel',  color: '#ffb070', shape: 'wire',   value: 2 },
  circuit:      { name: 'Schaltkreis',  color: '#3fae4f', shape: 'chip',   value: 25 },
  motor:        { name: 'Motor',        color: '#5a7fd0', shape: 'motor',  value: 110 },
  robot:        { name: 'Roboter',      color: '#d05ab0', shape: 'robot',  value: 600 },
};

// ---------- Rezepte ----------
const SMELT = {
  iron_ore: { out: 'iron_plate', time: 1.6 },
  copper_ore: { out: 'copper_plate', time: 1.6 },
};
const COAL_PER_FUEL = 4;

const RECIPES = {
  gear:    { name: 'Zahnrad',     in: { iron_plate: 2 }, out: 'gear', count: 1, time: 1.0 },
  wire:    { name: 'Kupferkabel', in: { copper_plate: 1 }, out: 'wire', count: 2, time: 0.8 },
  circuit: { name: 'Schaltkreis', in: { iron_plate: 1, wire: 3 }, out: 'circuit', count: 1, time: 2.0 },
  motor:   { name: 'Motor',       in: { gear: 2, circuit: 1, iron_plate: 2 }, out: 'motor', count: 1, time: 3.0 },
  robot:   { name: 'Roboter',     in: { motor: 2, circuit: 3 }, out: 'robot', count: 1, time: 5.0 },
};

// ---------- Gebäude ----------
const BUILDINGS = {
  belt:      { name: 'Förderband', cost: 2,   key: '1', desc: 'Transportiert Gegenstände in Pfeilrichtung.' },
  miner:     { name: 'Bohrer',     cost: 40,  key: '2', desc: 'Baut Erz ab. Nur auf Erzfeldern.' },
  furnace:   { name: 'Schmelzofen',cost: 80,  key: '3', desc: 'Erz → Platte. Braucht Kohle.' },
  assembler: { name: 'Montierer',  cost: 200, key: '4', desc: 'Stellt Bauteile her. Rezept per Klick wählen.' },
  splitter:  { name: 'Verteiler',  cost: 25,  key: '5', desc: 'Verteilt abwechselnd nach vorne/links/rechts.' },
  seller:    { name: 'Verkauf',    cost: 100, key: '6', desc: 'Verkauft alle angelieferten Gegenstände.' },
  bin:       { name: 'Mülleimer',  cost: 10,  key: '7', desc: 'Vernichtet Gegenstände (ohne Erlös).' },
};
const BUILD_ORDER = ['belt', 'miner', 'furnace', 'assembler', 'splitter', 'seller', 'bin'];

// ---------- Upgrades ----------
const UPGRADES = {
  belt:  { name: 'Schnellere Förderbänder', desc: '+25 % Bandgeschwindigkeit', base: 300, mult: 2.2, max: 6 },
  miner: { name: 'Bessere Bohrköpfe',       desc: '+25 % Abbaugeschwindigkeit', base: 250, mult: 2.0, max: 8 },
  craft: { name: 'Effizientere Maschinen',  desc: '+20 % Schmelz- & Montagetempo', base: 400, mult: 2.2, max: 8 },
  price: { name: 'Bessere Handelsverträge', desc: '+15 % Verkaufspreise', base: 500, mult: 2.4, max: 10 },
};

// ---------- Aufträge ----------
const MISSIONS = [
  { item: 'iron_ore',     count: 25,  reward: 100,   text: 'Verkaufe 25 Eisenerz' },
  { item: 'coal',         count: 25,  reward: 100,   text: 'Verkaufe 25 Kohle' },
  { item: 'iron_plate',   count: 40,  reward: 300,   text: 'Verkaufe 40 Eisenplatten' },
  { item: 'copper_plate', count: 40,  reward: 300,   text: 'Verkaufe 40 Kupferplatten' },
  { item: 'gear',         count: 30,  reward: 600,   text: 'Verkaufe 30 Zahnräder' },
  { item: 'wire',         count: 100, reward: 600,   text: 'Verkaufe 100 Kupferkabel' },
  { item: 'circuit',      count: 30,  reward: 2000,  text: 'Verkaufe 30 Schaltkreise' },
  { item: 'motor',        count: 20,  reward: 6000,  text: 'Verkaufe 20 Motoren' },
  { item: 'robot',        count: 10,  reward: 25000, text: 'Verkaufe 10 Roboter' },
  { item: 'robot',        count: 100, reward: 100000,text: 'Verkaufe 100 Roboter – Fabrik-Tycoon!' },
];

// =====================================================================
//  Zustand
// =====================================================================
let state;
let tiles;        // tiles[y][x] = { ore, b }
let buildings;    // Array aller Gebäude

function newState(seed) {
  return {
    seed: seed ?? Math.floor(Math.random() * 1e9),
    money: 400,
    sold: {},
    mission: 0,
    upgrades: { belt: 0, miner: 0, craft: 0, price: 0 },
    recipe: 'gear',
  };
}

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateMap(seed) {
  const r = rng(seed);
  tiles = [];
  for (let y = 0; y < MAP_H; y++) {
    tiles.push([]);
    for (let x = 0; x < MAP_W; x++) tiles[y].push({ ore: null, b: null, v: r() });
  }
  const blob = (ore, cx, cy, rad) => {
    for (let y = cy - rad - 1; y <= cy + rad + 1; y++)
      for (let x = cx - rad - 1; x <= cx + rad + 1; x++) {
        if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) continue;
        const d = Math.hypot(x - cx, y - cy) + r() * 1.2;
        if (d <= rad) tiles[y][x].ore = ore;
      }
  };
  const cx = MAP_W / 2, cy = MAP_H / 2;
  // Startfelder in der Nähe der Mitte
  const ores = ['iron_ore', 'copper_ore', 'coal'];
  ores.forEach((ore, i) => {
    const a = (i / 3) * Math.PI * 2 + r();
    blob(ore, Math.round(cx + Math.cos(a) * 8), Math.round(cy + Math.sin(a) * 6), 3);
  });
  // weitere Felder zufällig verteilt
  for (let i = 0; i < 18; i++) {
    const ore = ores[i % 3];
    blob(ore, Math.floor(r() * MAP_W), Math.floor(r() * MAP_H), 2 + Math.floor(r() * 3));
  }
}

function inMap(x, y) { return x >= 0 && y >= 0 && x < MAP_W && y < MAP_H; }
function bAt(x, y) { return inMap(x, y) ? tiles[y][x].b : null; }

function makeBuilding(type, x, y, dir) {
  const b = { type, x, y, dir, inv: {}, out: [], prog: 0, item: null, p: 0, moved: false, rr: 0, fuel: 0, job: null, anim: 0 };
  if (type === 'assembler') b.recipe = state.recipe;
  return b;
}

function canPlace(type, x, y) {
  if (!inMap(x, y)) return false;
  const t = tiles[y][x];
  if (t.b) return false;
  if (type === 'miner' && !t.ore) return false;
  return true;
}

function place(type, x, y, dir, free = false) {
  if (!canPlace(type, x, y)) return null;
  const cost = BUILDINGS[type].cost;
  if (!free) {
    if (state.money < cost) { toast('Nicht genug Geld!', true); return null; }
    state.money -= cost;
  }
  const b = makeBuilding(type, x, y, dir);
  tiles[y][x].b = b;
  buildings.push(b);
  return b;
}

function removeAt(x, y) {
  const b = bAt(x, y);
  if (!b) return;
  tiles[y][x].b = null;
  buildings.splice(buildings.indexOf(b), 1);
  state.money += Math.floor(BUILDINGS[b.type].cost * 0.75);
  if (selected === b) { selected = null; renderInfo(); }
}

// =====================================================================
//  Simulation
// =====================================================================
const beltSpeed = () => 1.6 * (1 + 0.25 * state.upgrades.belt);
const minerTime = () => 2.0 / (1 + 0.25 * state.upgrades.miner);
const craftMult = () => 1 + 0.2 * state.upgrades.craft;
const priceMult = () => 1 + 0.15 * state.upgrades.price;

let incomeLog = []; // [time, amount]
let simTime = 0;

function countInv(b) { let n = 0; for (const k in b.inv) n += b.inv[k]; return n; }

// Versucht, einen Gegenstand in Gebäude b einzufügen. dir = Bewegungsrichtung des Gegenstands.
function accept(b, item, dir) {
  if (!b) return false;
  switch (b.type) {
    case 'belt':
      if (b.item || b.dir === (dir + 2) % 4) return false;
      b.item = item; b.p = 0; b.moved = true;
      return true;
    case 'splitter':
      if (b.item) return false;
      b.item = item; b.p = 0;
      return true;
    case 'furnace': {
      if (item === 'coal') {
        if ((b.inv.coal || 0) >= 10) return false;
      } else if (SMELT[item]) {
        if ((b.inv[item] || 0) >= 10) return false;
      } else return false;
      b.inv[item] = (b.inv[item] || 0) + 1;
      return true;
    }
    case 'assembler': {
      const r = RECIPES[b.recipe];
      if (!r || !r.in[item]) return false;
      if ((b.inv[item] || 0) >= r.in[item] * 4) return false;
      b.inv[item] = (b.inv[item] || 0) + 1;
      return true;
    }
    case 'seller': {
      const v = Math.round(ITEMS[item].value * priceMult() * 100) / 100;
      state.money += v;
      state.sold[item] = (state.sold[item] || 0) + 1;
      incomeLog.push([simTime, v]);
      b.anim = 1;
      checkMissions();
      return true;
    }
    case 'bin':
      b.anim = 1;
      return true;
  }
  return false;
}

function pushOutput(b) {
  if (!b.out.length) return;
  const t = bAt(b.x + DX[b.dir], b.y + DY[b.dir]);
  if (accept(t, b.out[0], b.dir)) b.out.shift();
}

function update(dt) {
  simTime += dt;
  const bs = beltSpeed();
  for (const b of buildings) b.moved = false;

  for (const b of buildings) {
    if (b.anim > 0) b.anim = Math.max(0, b.anim - dt * 3);
    switch (b.type) {
      case 'belt': {
        if (!b.item || b.moved) break;
        b.p += bs * dt;
        if (b.p >= 1) {
          b.p = 1;
          const t = bAt(b.x + DX[b.dir], b.y + DY[b.dir]);
          if (accept(t, b.item, b.dir)) b.item = null;
        }
        break;
      }
      case 'splitter': {
        if (!b.item) break;
        b.p += bs * 2 * dt;
        if (b.p < 1) break;
        b.p = 1;
        const order = [b.dir, (b.dir + 3) % 4, (b.dir + 1) % 4];
        for (let i = 0; i < 3; i++) {
          const d = order[(b.rr + i) % 3];
          const t = bAt(b.x + DX[d], b.y + DY[d]);
          if (accept(t, b.item, d)) { b.item = null; b.rr = (b.rr + i + 1) % 3; break; }
        }
        break;
      }
      case 'miner': {
        if (b.out.length < 2) {
          b.prog += dt / minerTime();
          if (b.prog >= 1) { b.prog = 0; b.out.push(tiles[b.y][b.x].ore); }
          b.anim = (b.anim + dt * 4) % 1;
        }
        pushOutput(b);
        break;
      }
      case 'furnace': {
        if (!b.job && b.out.length < 4) {
          const ore = ['iron_ore', 'copper_ore'].find(o => b.inv[o] > 0);
          if (ore) {
            if (b.fuel <= 0 && b.inv.coal > 0) { b.inv.coal--; b.fuel += COAL_PER_FUEL; }
            if (b.fuel > 0) { b.fuel--; b.inv[ore]--; b.job = SMELT[ore]; b.prog = 0; }
          }
        }
        if (b.job) {
          b.prog += dt * craftMult() / b.job.time;
          if (b.prog >= 1) { b.out.push(b.job.out); b.job = null; b.prog = 0; }
        }
        pushOutput(b);
        break;
      }
      case 'assembler': {
        const r = RECIPES[b.recipe];
        if (r && !b.job && b.out.length < 4) {
          const ok = Object.entries(r.in).every(([k, n]) => (b.inv[k] || 0) >= n);
          if (ok) {
            for (const [k, n] of Object.entries(r.in)) b.inv[k] -= n;
            b.job = r; b.prog = 0;
          }
        }
        if (b.job) {
          b.prog += dt * craftMult() / b.job.time;
          if (b.prog >= 1) {
            for (let i = 0; i < b.job.count; i++) b.out.push(b.job.out);
            b.job = null; b.prog = 0;
          }
        }
        pushOutput(b);
        break;
      }
    }
  }
  while (incomeLog.length && incomeLog[0][0] < simTime - 10) incomeLog.shift();
}

function checkMissions() {
  const m = MISSIONS[state.mission];
  if (!m) return;
  if ((state.sold[m.item] || 0) >= m.count) {
    state.money += m.reward;
    state.mission++;
    toast(`Auftrag erfüllt: ${m.text}  +${fmt(m.reward)} €`);
    renderMissions();
  }
}

// =====================================================================
//  Darstellung
// =====================================================================
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const cam = { x: 0, y: 0, zoom: 1.25 };
let mouse = { sx: 0, sy: 0, tx: 0, ty: 0, inside: false };
let tool = null;     // ausgewählter Gebäudetyp
let toolDir = 0;
let selected = null; // angeklicktes Gebäude
let paused = false;
let mode3d = false; // 3D-Modus (siehe three3d.js)

function resize() {
  canvas.width = innerWidth * devicePixelRatio;
  canvas.height = innerHeight * devicePixelRatio;
  canvas.style.width = innerWidth + 'px';
  canvas.style.height = innerHeight + 'px';
}
addEventListener('resize', resize);

const ORE_COLORS = { iron_ore: '#7d6f66', copper_ore: '#b5622f', coal: '#262626' };

function drawItem(c, item, x, y, s) {
  const it = ITEMS[item];
  c.save();
  c.translate(x, y);
  c.fillStyle = it.color;
  c.strokeStyle = 'rgba(0,0,0,.6)';
  c.lineWidth = 1.5;
  switch (it.shape) {
    case 'rock':
      c.beginPath();
      c.moveTo(-s * .5, s * .1); c.lineTo(-s * .2, -s * .45); c.lineTo(s * .35, -s * .35);
      c.lineTo(s * .5, s * .2); c.lineTo(0, s * .5); c.closePath(); c.fill(); c.stroke();
      break;
    case 'plate':
      c.fillRect(-s * .5, -s * .35, s, s * .7); c.strokeRect(-s * .5, -s * .35, s, s * .7);
      c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(-s * .4, -s * .25, s * .8, s * .12);
      break;
    case 'gear': {
      c.beginPath();
      for (let i = 0; i < 16; i++) {
        const a = i / 16 * Math.PI * 2, r = i % 2 ? s * .5 : s * .36;
        c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      c.closePath(); c.fill(); c.stroke();
      c.fillStyle = '#333'; c.beginPath(); c.arc(0, 0, s * .14, 0, 7); c.fill();
      break;
    }
    case 'wire':
      c.lineWidth = s * .18; c.strokeStyle = it.color;
      c.beginPath(); c.arc(0, 0, s * .32, 0, Math.PI * 1.7); c.stroke();
      break;
    case 'chip':
      c.fillRect(-s * .45, -s * .45, s * .9, s * .9); c.strokeRect(-s * .45, -s * .45, s * .9, s * .9);
      c.fillStyle = '#e8d060';
      for (let i = -1; i <= 1; i++) c.fillRect(-s * .3, i * s * .25 - s * .04, s * .6, s * .08);
      break;
    case 'motor':
      c.beginPath(); c.arc(0, 0, s * .45, 0, 7); c.fill(); c.stroke();
      c.fillStyle = '#ddd'; c.fillRect(-s * .08, -s * .5, s * .16, s * .3);
      c.fillStyle = '#223'; c.beginPath(); c.arc(0, s * .05, s * .18, 0, 7); c.fill();
      break;
    case 'robot':
      c.fillRect(-s * .4, -s * .3, s * .8, s * .75); c.strokeRect(-s * .4, -s * .3, s * .8, s * .75);
      c.fillStyle = '#fff'; c.fillRect(-s * .25, -s * .15, s * .15, s * .15); c.fillRect(s * .1, -s * .15, s * .15, s * .15);
      c.fillStyle = it.color; c.fillRect(-s * .05, -s * .5, s * .1, s * .2);
      break;
  }
  c.restore();
}

function drawArrow(c, x, y, dir, size, color) {
  c.save();
  c.translate(x, y); c.rotate(dir * Math.PI / 2);
  c.fillStyle = color;
  c.beginPath(); c.moveTo(size, 0); c.lineTo(-size * .4, -size * .7); c.lineTo(-size * .4, size * .7); c.closePath(); c.fill();
  c.restore();
}

function drawBuilding(c, b, px, py, ghost) {
  const T = TILE, cx = px + T / 2, cy = py + T / 2;
  c.save();
  if (ghost) c.globalAlpha = 0.55;
  switch (b.type) {
    case 'belt': {
      c.fillStyle = '#3a3d42'; c.fillRect(px + 1, py + 1, T - 2, T - 2);
      c.save(); c.translate(cx, cy); c.rotate(b.dir * Math.PI / 2);
      c.fillStyle = '#2b2d31'; c.fillRect(-T / 2 + 1, -T / 2 + 3, T - 2, 4); c.fillRect(-T / 2 + 1, T / 2 - 7, T - 2, 4);
      const off = ((simTime * beltSpeed() * T) % (T / 2));
      c.strokeStyle = '#d8b44a'; c.lineWidth = 2;
      c.beginPath();
      c.rect(-T / 2 + 1, -T / 2 + 1, T - 2, T - 2); c.clip();
      c.beginPath();
      for (let i = -1; i < 3; i++) {
        const xx = -T / 2 + i * T / 2 + off;
        c.moveTo(xx - 4, -6); c.lineTo(xx + 2, 0); c.lineTo(xx - 4, 6);
      }
      c.stroke();
      c.restore();
      break;
    }
    case 'miner': {
      c.fillStyle = '#5c6b3a'; c.fillRect(px + 2, py + 2, T - 4, T - 4);
      c.strokeStyle = '#2e3520'; c.lineWidth = 2; c.strokeRect(px + 2, py + 2, T - 4, T - 4);
      c.save(); c.translate(cx, cy); c.rotate((b.anim || 0) * Math.PI * 2);
      c.fillStyle = '#ccc';
      for (let i = 0; i < 3; i++) { c.rotate(Math.PI * 2 / 3); c.fillRect(-2, 0, 4, 10); }
      c.restore();
      drawArrow(c, cx + DX[b.dir] * 11, cy + DY[b.dir] * 11, b.dir, 5, '#ffd75e');
      break;
    }
    case 'furnace': {
      c.fillStyle = '#7a4a3a'; c.fillRect(px + 2, py + 2, T - 4, T - 4);
      c.strokeStyle = '#3a2018'; c.lineWidth = 2; c.strokeRect(px + 2, py + 2, T - 4, T - 4);
      const lit = !!b.job;
      c.fillStyle = lit ? `rgba(255,${140 + Math.sin(simTime * 20) * 40},40,1)` : '#222';
      c.fillRect(cx - 7, cy - 4, 14, 10);
      drawArrow(c, cx + DX[b.dir] * 11, cy + DY[b.dir] * 11, b.dir, 5, '#ffd75e');
      break;
    }
    case 'assembler': {
      c.fillStyle = '#3a5a7a'; c.fillRect(px + 2, py + 2, T - 4, T - 4);
      c.strokeStyle = '#1d2d3d'; c.lineWidth = 2; c.strokeRect(px + 2, py + 2, T - 4, T - 4);
      const r = RECIPES[b.recipe];
      if (r) drawItem(c, r.out, cx, cy, 14);
      if (b.job) { c.fillStyle = '#5cc85c'; c.fillRect(px + 4, py + T - 7, (T - 8) * b.prog, 3); }
      drawArrow(c, cx + DX[b.dir] * 11, cy + DY[b.dir] * 11, b.dir, 5, '#ffd75e');
      break;
    }
    case 'splitter': {
      c.fillStyle = '#4a4f58'; c.fillRect(px + 2, py + 2, T - 4, T - 4);
      for (const d of [b.dir, (b.dir + 1) % 4, (b.dir + 3) % 4])
        drawArrow(c, cx + DX[d] * 9, cy + DY[d] * 9, d, 4, d === b.dir ? '#ffd75e' : '#c9a940');
      break;
    }
    case 'seller': {
      c.fillStyle = '#2f6a3a'; c.fillRect(px + 2, py + 2, T - 4, T - 4);
      c.strokeStyle = '#ffd75e'; c.lineWidth = 2; c.strokeRect(px + 2, py + 2, T - 4, T - 4);
      c.fillStyle = '#ffd75e'; c.font = `bold ${16 + (b.anim || 0) * 6}px sans-serif`;
      c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('€', cx, cy + 1);
      break;
    }
    case 'bin': {
      c.fillStyle = '#555'; c.fillRect(px + 7, py + 8, T - 14, T - 12);
      c.fillStyle = '#777'; c.fillRect(px + 5, py + 5, T - 10, 4);
      c.strokeStyle = '#333'; c.lineWidth = 1.5;
      for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(px + 11 + i * 5, py + 11); c.lineTo(px + 11 + i * 5, py + T - 7); c.stroke(); }
      break;
    }
  }
  c.restore();
}

function render() {
  const dpr = devicePixelRatio;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#14171b';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(dpr * cam.zoom, 0, 0, dpr * cam.zoom, -cam.x * dpr * cam.zoom, -cam.y * dpr * cam.zoom);

  const vw = innerWidth / cam.zoom, vh = innerHeight / cam.zoom;
  const x0 = Math.max(0, Math.floor(cam.x / TILE)), y0 = Math.max(0, Math.floor(cam.y / TILE));
  const x1 = Math.min(MAP_W - 1, Math.floor((cam.x + vw) / TILE)), y1 = Math.min(MAP_H - 1, Math.floor((cam.y + vh) / TILE));

  // Boden
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const t = tiles[y][x];
    const g = 46 + Math.floor(t.v * 8);
    ctx.fillStyle = `rgb(${g - 6},${g + 10},${g - 10})`;
    ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
    if (t.ore) {
      ctx.fillStyle = ORE_COLORS[t.ore];
      const r = rng(x * 9973 + y * 31);
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.arc(x * TILE + 5 + r() * 22, y * TILE + 5 + r() * 22, 2.5 + r() * 3, 0, 7);
        ctx.fill();
      }
    }
  }
  // Gitter
  ctx.strokeStyle = 'rgba(0,0,0,.12)'; ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = x0; x <= x1 + 1; x++) { ctx.moveTo(x * TILE, y0 * TILE); ctx.lineTo(x * TILE, (y1 + 1) * TILE); }
  for (let y = y0; y <= y1 + 1; y++) { ctx.moveTo(x0 * TILE, y * TILE); ctx.lineTo((x1 + 1) * TILE, y * TILE); }
  ctx.stroke();

  // Gebäude
  for (const b of buildings) {
    if (b.x < x0 - 1 || b.x > x1 + 1 || b.y < y0 - 1 || b.y > y1 + 1) continue;
    drawBuilding(ctx, b, b.x * TILE, b.y * TILE, false);
  }
  // Gegenstände auf Bändern / Verteilern
  for (const b of buildings) {
    if (!b.item) continue;
    const cx = b.x * TILE + TILE / 2, cy = b.y * TILE + TILE / 2;
    const k = b.type === 'belt' ? (b.p - 0.5) * TILE : 0;
    drawItem(ctx, b.item, cx + DX[b.dir] * k, cy + DY[b.dir] * k, 13);
  }
  // Auswahl
  if (selected) {
    ctx.strokeStyle = '#ffd75e'; ctx.lineWidth = 2;
    ctx.strokeRect(selected.x * TILE + 1, selected.y * TILE + 1, TILE - 2, TILE - 2);
  }
  // Vorschau
  if (mouse.inside && inMap(mouse.tx, mouse.ty)) {
    const px = mouse.tx * TILE, py = mouse.ty * TILE;
    if (tool) {
      const ok = canPlace(tool, mouse.tx, mouse.ty) && state.money >= BUILDINGS[tool].cost;
      drawBuilding(ctx, { type: tool, dir: toolDir, recipe: state.recipe, anim: 0 }, px, py, true);
      ctx.strokeStyle = ok ? '#5cc85c' : '#e05050';
    } else {
      ctx.strokeStyle = 'rgba(255,255,255,.5)';
    }
    ctx.lineWidth = 2;
    ctx.strokeRect(px + 1, py + 1, TILE - 2, TILE - 2);
  }
}

// =====================================================================
//  UI
// =====================================================================
const $ = id => document.getElementById(id);
function fmt(n) { return Math.floor(n).toLocaleString('de-DE'); }

let toastTimer;
function toast(msg, bad = false) {
  const t = $('toast');
  t.textContent = msg; t.className = 'show' + (bad ? ' bad' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.className = '', 2200);
}

function buildHotbar() {
  const hb = $('hotbar');
  hb.innerHTML = '';
  for (const type of BUILD_ORDER) {
    const def = BUILDINGS[type];
    const el = document.createElement('div');
    el.className = 'slot'; el.dataset.type = type;
    el.title = `${def.name} – ${def.desc}`;
    const cv = document.createElement('canvas');
    cv.width = 64; cv.height = 64;
    const c = cv.getContext('2d'); c.scale(2, 2);
    drawBuilding(c, { type, dir: 0, recipe: 'gear', anim: 0 }, 0, 0, false);
    el.innerHTML = `<span class="key">${def.key}</span>`;
    el.appendChild(cv);
    el.insertAdjacentHTML('beforeend', `<span>${def.name}</span><span class="cost">${def.cost} €</span>`);
    el.onclick = () => selectTool(tool === type ? null : type);
    hb.appendChild(el);
  }
}

function updateHotbar() {
  for (const el of $('hotbar').children) {
    el.classList.toggle('active', el.dataset.type === tool);
    el.classList.toggle('poor', state.money < BUILDINGS[el.dataset.type].cost);
  }
}

function selectTool(type) {
  tool = type;
  if (type) { selected = null; renderInfo(); }
  updateHotbar();
  canvas.style.cursor = type ? 'crosshair' : 'default';
}

function renderMissions() {
  const el = $('missions');
  el.innerHTML = '';
  const start = Math.max(0, state.mission - 1);
  for (let i = start; i < Math.min(MISSIONS.length, state.mission + 3); i++) {
    const m = MISSIONS[i];
    const have = Math.min(m.count, state.sold[m.item] || 0);
    const done = i < state.mission;
    const d = document.createElement('div');
    d.className = 'mission' + (done ? ' done' : '');
    d.innerHTML = `${m.text}<br><small>Belohnung: ${fmt(m.reward)} € · ${done ? m.count : have}/${m.count}</small>` +
      (i === state.mission ? `<div class="bar"><div style="width:${have / m.count * 100}%"></div></div>` : '');
    el.appendChild(d);
  }
  if (state.mission >= MISSIONS.length) el.insertAdjacentHTML('beforeend', '<div class="mission">🏆 Alle Aufträge erfüllt!</div>');
}

function invText(inv) {
  const parts = Object.entries(inv).filter(([, n]) => n > 0).map(([k, n]) => `${ITEMS[k].name} ×${n}`);
  return parts.length ? parts.join(', ') : '–';
}

let infoKey = '';
function renderInfo(force = true) {
  const el = $('info');
  if (!selected) {
    if (tool) {
      const d = BUILDINGS[tool];
      el.innerHTML = `<b>${d.name}</b> (${d.cost} €)<br>${d.desc}<br><small>R = drehen</small>`;
      if (tool === 'assembler') el.innerHTML += recipeButtons(state.recipe);
    } else el.innerHTML = 'Wähle ein Gebäude unten aus oder klicke auf ein platziertes Gebäude.';
    bindRecipeButtons();
    return;
  }
  const b = selected, d = BUILDINGS[b.type];
  let h = `<b>${d.name}</b><br><small>${d.desc}</small><br>`;
  switch (b.type) {
    case 'miner': h += `Erz: ${ITEMS[tiles[b.y][b.x].ore].name}<br>Tempo: ${(60 / minerTime()).toFixed(0)} / min`; break;
    case 'furnace': h += `Brennstoff: ${b.fuel} Vorgänge<br>Lager: ${invText(b.inv)}<br>Ausgabe: ${b.out.length}`; break;
    case 'assembler': h += `Lager: ${invText(b.inv)}<br>Ausgabe: ${b.out.length}` + recipeButtons(b.recipe); break;
    case 'belt': case 'splitter': h += `Inhalt: ${b.item ? ITEMS[b.item].name : '–'}`; break;
    case 'seller': {
      h += '<small>Preise:</small><br>';
      h += Object.entries(ITEMS).map(([, it]) => `${it.name}: ${(it.value * priceMult()).toFixed(1)} €`).join('<br>');
      break;
    }
  }
  if (!force && h === infoKey) return;
  infoKey = h;
  el.innerHTML = h;
  bindRecipeButtons();
}

function recipeButtons(active) {
  let h = '<div class="recipes"><small>Rezept wählen:</small>';
  for (const [k, r] of Object.entries(RECIPES)) {
    const ins = Object.entries(r.in).map(([i, n]) => `${n}× ${ITEMS[i].name}`).join(' + ');
    h += `<button data-recipe="${k}" class="${k === active ? 'active' : ''}">${r.count > 1 ? r.count + '× ' : ''}${r.name}<br><small>${ins} · ${r.time}s</small></button>`;
  }
  return h + '</div>';
}
function bindRecipeButtons() {
  for (const btn of $('info').querySelectorAll('[data-recipe]')) {
    btn.onclick = () => {
      const k = btn.dataset.recipe;
      state.recipe = k;
      if (selected && selected.type === 'assembler' && selected.recipe !== k) {
        selected.recipe = k; selected.inv = {}; selected.job = null; selected.prog = 0;
      }
      renderInfo();
    };
  }
}

function upgradeCost(k) { const u = UPGRADES[k]; return Math.round(u.base * Math.pow(u.mult, state.upgrades[k])); }
function renderUpgrades() {
  const el = $('upgradeList');
  el.innerHTML = '';
  for (const [k, u] of Object.entries(UPGRADES)) {
    const lv = state.upgrades[k], maxed = lv >= u.max, cost = upgradeCost(k);
    const d = document.createElement('div');
    d.className = 'upg';
    d.innerHTML = `<div><b>${u.name}</b> (Stufe ${lv}/${u.max})<br><small>${u.desc}</small></div>`;
    const btn = document.createElement('button');
    btn.textContent = maxed ? 'Maximal' : `${fmt(cost)} €`;
    btn.disabled = maxed || state.money < cost;
    btn.onclick = () => {
      if (state.money < cost || maxed) return;
      state.money -= cost; state.upgrades[k]++;
      toast(`${u.name} → Stufe ${state.upgrades[k]}`);
      renderUpgrades();
    };
    d.appendChild(btn);
    el.appendChild(d);
  }
}

function updateTopbar() {
  $('money').textContent = fmt(state.money) + ' €';
  const sum = incomeLog.reduce((a, e) => a + e[1], 0);
  $('income').textContent = (sum / Math.min(10, Math.max(1, simTime))).toFixed(1).replace('.', ',') + ' €/s';
}

// =====================================================================
//  Eingabe
// =====================================================================
const keys = {};
let dragging = null; // { button, lastTx, lastTy, lastBelt }
let panning = null;

function screenToTile(sx, sy) {
  const wx = sx / cam.zoom + cam.x, wy = sy / cam.zoom + cam.y;
  return [Math.floor(wx / TILE), Math.floor(wy / TILE)];
}

canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('mousemove', e => {
  mouse.sx = e.clientX; mouse.sy = e.clientY; mouse.inside = true;
  [mouse.tx, mouse.ty] = screenToTile(e.clientX, e.clientY);
  if (panning) {
    cam.x = panning.cx - (e.clientX - panning.sx) / cam.zoom;
    cam.y = panning.cy - (e.clientY - panning.sy) / cam.zoom;
    clampCam();
    return;
  }
  if (dragging) dragTo(mouse.tx, mouse.ty);
});
canvas.addEventListener('mouseleave', () => { mouse.inside = false; });
canvas.addEventListener('mousedown', e => {
  const [tx, ty] = screenToTile(e.clientX, e.clientY);
  if (e.button === 1 || (e.button === 0 && !tool && !bAt(tx, ty) && e.shiftKey)) {
    panning = { sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y }; e.preventDefault(); return;
  }
  if (e.button === 2) {
    dragging = { button: 2 };
    removeAt(tx, ty);
    return;
  }
  if (e.button === 0) {
    if (tool) {
      dragging = { button: 0, lastTx: tx, lastTy: ty, lastBelt: null };
      const b = place(tool, tx, ty, toolDir);
      if (b && tool === 'belt') dragging.lastBelt = b;
    } else {
      selected = bAt(tx, ty);
      renderInfo();
      if (!selected) panning = { sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y };
    }
  }
});
addEventListener('mouseup', () => { dragging = null; panning = null; });

function dragTo(tx, ty) {
  if (dragging.button === 2) { removeAt(tx, ty); return; }
  if (tx === dragging.lastTx && ty === dragging.lastTy) return;
  // Schrittweise entlang einer Achse laufen, damit keine Lücken entstehen
  while (dragging.lastTx !== tx || dragging.lastTy !== ty) {
    let dir;
    if (dragging.lastTx !== tx) dir = tx > dragging.lastTx ? 0 : 2;
    else dir = ty > dragging.lastTy ? 1 : 3;
    const nx = dragging.lastTx + DX[dir], ny = dragging.lastTy + DY[dir];
    if (tool === 'belt') {
      toolDir = dir;
      if (dragging.lastBelt) dragging.lastBelt.dir = dir;
      const b = place('belt', nx, ny, dir);
      dragging.lastBelt = b;
    } else {
      place(tool, nx, ny, toolDir);
    }
    dragging.lastTx = nx; dragging.lastTy = ny;
  }
}

canvas.addEventListener('wheel', e => {
  e.preventDefault();
  const wx = e.clientX / cam.zoom + cam.x, wy = e.clientY / cam.zoom + cam.y;
  cam.zoom = Math.min(3, Math.max(0.4, cam.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
  cam.x = wx - e.clientX / cam.zoom; cam.y = wy - e.clientY / cam.zoom;
  clampCam();
}, { passive: false });

function clampCam() {
  const vw = innerWidth / cam.zoom, vh = innerHeight / cam.zoom;
  cam.x = Math.max(-vw / 2, Math.min(MAP_W * TILE - vw / 2, cam.x));
  cam.y = Math.max(-vh / 2, Math.min(MAP_H * TILE - vh / 2, cam.y));
}

addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  const k = e.key.toLowerCase();
  if (k === 'v') { set3d(!mode3d); return; }
  if (mode3d && on3dKey(e)) return;
  keys[k] = true;
  const idx = BUILD_ORDER.findIndex(t => BUILDINGS[t].key === e.key);
  if (idx >= 0) selectTool(tool === BUILD_ORDER[idx] ? null : BUILD_ORDER[idx]);
  else if (k === 'r') {
    if (tool) toolDir = (toolDir + (e.shiftKey ? 3 : 1)) % 4;
    else if (mouse.inside) { const b = bAt(mouse.tx, mouse.ty); if (b) b.dir = (b.dir + (e.shiftKey ? 3 : 1)) % 4; }
  } else if (k === 'escape') { selectTool(null); selected = null; renderInfo(); closeModals(); }
  else if (k === ' ') { paused = !paused; $('pause').classList.toggle('hidden', !paused); e.preventDefault(); }
  else if (k === 'q') {
    const b = mouse.inside && bAt(mouse.tx, mouse.ty);
    if (b) { selectTool(b.type); toolDir = b.dir; if (b.recipe) state.recipe = b.recipe; renderInfo(); }
  }
});
addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

function closeModals() { for (const m of document.querySelectorAll('.modal')) m.classList.add('hidden'); }
for (const m of document.querySelectorAll('.modal')) {
  m.addEventListener('click', e => { if (e.target === m || e.target.classList.contains('close')) m.classList.add('hidden'); });
}
$('btn3d').onclick = () => { set3d(!mode3d); $('btn3d').blur(); };
$('btnHelp').onclick = () => $('help').classList.remove('hidden');
$('btnUpgrades').onclick = () => { renderUpgrades(); $('upgrades').classList.remove('hidden'); };
$('btnNew').onclick = () => {
  if (!confirm('Wirklich ein neues Spiel starten? Der aktuelle Fortschritt geht verloren.')) return;
  localStorage.removeItem(SAVE_KEY);
  startGame(null);
};

// =====================================================================
//  Speichern / Laden
// =====================================================================
function save() {
  try {
    const data = { state, buildings: buildings.map(b => [b.type, b.x, b.y, b.dir, b.recipe || null]) };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch (e) { /* Speicher nicht verfügbar */ }
}
function load() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { return null; }
}

function startGame(data) {
  state = data ? Object.assign(newState(), data.state) : newState();
  generateMap(state.seed);
  buildings = [];
  incomeLog = []; simTime = 0; selected = null;
  if (data) {
    for (const [type, x, y, dir, recipe] of data.buildings) {
      const b = place(type, x, y, dir, true);
      if (b && recipe) b.recipe = recipe;
    }
  }
  cam.x = MAP_W * TILE / 2 - innerWidth / cam.zoom / 2;
  cam.y = MAP_H * TILE / 2 - innerHeight / cam.zoom / 2;
  buildHotbar(); selectTool(null); renderMissions(); renderInfo();
  if (!data) $('help').classList.remove('hidden');
}

// =====================================================================
//  Hauptschleife
// =====================================================================
let last = performance.now();
let uiTimer = 0, saveTimer = 0;
function frame(now) {
  let dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (mode3d) {
    if (!paused) { const steps = Math.ceil(dt / (1 / 60)); for (let i = 0; i < steps; i++) update(dt / steps); }
    render3d(dt);
  } else {
  // Kamera per Tastatur
  const sp = 500 / cam.zoom * dt;
  if (keys['w'] || keys['arrowup']) cam.y -= sp;
  if (keys['s'] || keys['arrowdown']) cam.y += sp;
  if (keys['a'] || keys['arrowleft']) cam.x -= sp;
  if (keys['d'] || keys['arrowright']) cam.x += sp;
  clampCam();
  if (mouse.inside) [mouse.tx, mouse.ty] = screenToTile(mouse.sx, mouse.sy);

  if (!paused) {
    // feste Teilschritte für stabile Simulation
    const steps = Math.ceil(dt / (1 / 60));
    for (let i = 0; i < steps; i++) update(dt / steps);
  }
  render();
  }

  uiTimer += dt; saveTimer += dt;
  if (uiTimer > 0.2) {
    uiTimer = 0;
    updateTopbar(); updateHotbar(); renderMissions();
    if (selected) renderInfo(false);
  }
  if (saveTimer > 5) { saveTimer = 0; save(); }
  requestAnimationFrame(frame);
}

addEventListener('load', () => {
  resize();
  startGame(load());
  addEventListener('beforeunload', save);
  last = performance.now();
  requestAnimationFrame(frame);
});
