'use strict';
// =====================================================================
//  Fabrik-Simulator – ein kleines Fabrik-Aufbauspiel im Browser
// =====================================================================

const TILE = 32;
const MAP_W = 128, MAP_H = 96;
// Alte Spielstände hatten eine 64×48-Karte: sie wird unverändert in die Mitte der großen Karte gesetzt.
const LEGACY_W = 64, LEGACY_H = 48;
const LEGACY_OFF = [(MAP_W - LEGACY_W) / 2, (MAP_H - LEGACY_H) / 2];
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
  // neue Erze
  stone:        { name: 'Stein',        color: '#a09a90', shape: 'rock',   value: 1 },
  gold_ore:     { name: 'Golderz',      color: '#d8b040', shape: 'rock',   value: 4 },
  quartz:       { name: 'Quarz',        color: '#e8e0f0', shape: 'rock',   value: 3 },
  // neue Zwischenprodukte
  brick:        { name: 'Ziegel',       color: '#b0583a', shape: 'brick',  value: 3 },
  steel:        { name: 'Stahl',        color: '#5f6e7c', shape: 'plate',  value: 14 },
  gold_bar:     { name: 'Goldbarren',   color: '#f2c230', shape: 'bar',    value: 20 },
  silicon:      { name: 'Silizium',     color: '#4a5a78', shape: 'wafer',  value: 10 },
  // neue Endprodukte
  battery:      { name: 'Akku',         color: '#3fbf6a', shape: 'battery', value: 60 },
  solar:        { name: 'Solarmodul',   color: '#2a4a9a', shape: 'panel',  value: 120 },
  processor:    { name: 'Prozessor',    color: '#2a2e36', shape: 'cpu',    value: 260 },
  drone:        { name: 'Drohne',       color: '#e8eef4', shape: 'drone',  value: 1800 },
};
const ORES = ['iron_ore', 'copper_ore', 'coal', 'stone', 'gold_ore', 'quartz'];

// ---------- Bohrer: je Erzsorte ein eigener Typ (wird beim Bauen automatisch gewählt) ----------
const DRILLS = {
  iron_ore:   { name: 'Erzbohrer',   cost: 1.0, speed: 1.0 },
  copper_ore: { name: 'Erzbohrer',   cost: 1.0, speed: 1.0 },
  coal:       { name: 'Kohlebagger', cost: 1.0, speed: 1.1 },
  stone:      { name: 'Steinbruch',  cost: 0.8, speed: 1.3 },
  gold_ore:   { name: 'Goldwäscher', cost: 3.0, speed: 0.6 },
  quartz:     { name: 'Quarzlaser',  cost: 2.5, speed: 0.7 },
};
const MINE_RADIUS = 1; // Bohrer baut die Felder im Umkreis ab (3×3)

// ---------- Rezepte ----------
// need = wie viele Einheiten für ein Ergebnis nötig sind
const SMELT = {
  iron_ore:   { out: 'iron_plate',   time: 1.6 },
  copper_ore: { out: 'copper_plate', time: 1.6 },
  stone:      { out: 'brick',        time: 1.4 },
  gold_ore:   { out: 'gold_bar',     time: 2.6, need: 2 },
  quartz:     { out: 'silicon',      time: 2.2 },
  iron_plate: { out: 'steel',        time: 3.0, need: 3 },
};
const COAL_PER_FUEL = 4;

const RECIPES = {
  gear:    { name: 'Zahnrad',     in: { iron_plate: 2 }, out: 'gear', count: 1, time: 1.0 },
  wire:    { name: 'Kupferkabel', in: { copper_plate: 1 }, out: 'wire', count: 2, time: 0.8 },
  circuit: { name: 'Schaltkreis', in: { iron_plate: 1, wire: 3 }, out: 'circuit', count: 1, time: 2.0 },
  motor:   { name: 'Motor',       in: { gear: 2, circuit: 1, iron_plate: 2 }, out: 'motor', count: 1, time: 3.0 },
  robot:   { name: 'Roboter',     in: { motor: 2, circuit: 3 }, out: 'robot', count: 1, time: 5.0 },
  battery:   { name: 'Akku',        in: { steel: 1, copper_plate: 2, wire: 2 }, out: 'battery', count: 1, time: 2.5 },
  solar:     { name: 'Solarmodul',  in: { silicon: 3, steel: 1, wire: 4 }, out: 'solar', count: 1, time: 3.0 },
  processor: { name: 'Prozessor',   in: { circuit: 2, silicon: 2, gold_bar: 1 }, out: 'processor', count: 1, time: 4.0 },
  drone:     { name: 'Drohne',      in: { motor: 2, processor: 1, battery: 2, solar: 1 }, out: 'drone', count: 1, time: 6.0 },
};

// ---------- Gebäude ----------
const BUILDINGS = {
  belt:      { name: 'Förderband', cost: 2,   key: '1', desc: 'Transportiert Gegenstände in Pfeilrichtung.' },
  miner:     { name: 'Bohrer',     cost: 40,  key: '2', desc: 'Baut Erz im Umkreis (3×3) ab, bis das Vorkommen leer ist. Auf jedem Erz entsteht der passende Bohrer.' },
  furnace:   { name: 'Schmelzofen',cost: 80,  key: '3', desc: 'Schmilzt Erz (Platten, Ziegel, Goldbarren, Silizium) und 3 Eisenplatten zu Stahl. Braucht Kohle. 3 Eingänge (hinten, links, rechts – grüne Pfeile), 1 Ausgang vorne (gelber Pfeil).' },
  assembler: { name: 'Montierer',  cost: 200, key: '4', desc: 'Stellt Bauteile her. Rezept per Klick wählen. 3 Eingänge (hinten, links, rechts – grüne Pfeile), 1 Ausgang vorne (gelber Pfeil).' },
  splitter:  { name: 'Verteiler',  cost: 25,  key: '5', desc: 'Verteilt abwechselnd nach vorne/links/rechts.' },
  seller:    { name: 'Verkauf',    cost: 100, key: '6', desc: 'Verkauft alle angelieferten Gegenstände.' },
  bin:       { name: 'Mülleimer',  cost: 10,  key: '7', desc: 'Vernichtet Gegenstände (ohne Erlös).' },
};
const BUILD_ORDER = ['belt', 'miner', 'furnace', 'assembler', 'splitter', 'seller', 'bin'];

// ---------- Gebäude-Stufen (pro Gebäude aufrüstbar) ----------
// Stufe 1 = alt und rostig, Stufe 4 = Hightech. Höhere Stufen arbeiten schneller bzw. verkaufen teurer.
const LEVELS = [
  null,
  { name: 'Alt',           speed: 1.0, price: 1.0 },
  { name: 'Repariert',     speed: 1.4, price: 1.1 },
  { name: 'Modern',        speed: 1.9, price: 1.25 },
  { name: 'Hightech',      speed: 2.6, price: 1.45 },
  { name: 'Futuristisch',  speed: 3.6, price: 1.7 },
  { name: 'Quanten',       speed: 5.0, price: 2.0 },
];
const MAX_LEVEL = 6;
const LEVEL_COST = [0, 1.5, 4, 10, 25, 60]; // Faktor auf den Baupreis für Stufe n → n+1
const UPGRADABLE = { miner: 1, furnace: 1, assembler: 1, seller: 1 };
const lvSpeed = b => LEVELS[b.level || 1].speed;
// Baupreis: Bohrer kosten je nach Erz unterschiedlich viel
function buildCost(type, x, y) {
  if (type === 'miner') { const t = inMap(x, y) && tiles[y][x]; const ore = t && (t.ore || t.was); return Math.round(BUILDINGS.miner.cost * (ore ? DRILLS[ore].cost : 1)); }
  return BUILDINGS[type].cost;
}
function baseCost(b) { return b.type === 'miner' && b.ore ? Math.round(BUILDINGS.miner.cost * DRILLS[b.ore].cost) : BUILDINGS[b.type].cost; }
function levelUpCost(b) { return Math.round(baseCost(b) * LEVEL_COST[b.level]); }
function buildingName(b) { return b.type === 'miner' && b.ore ? DRILLS[b.ore].name : BUILDINGS[b.type].name; }
function upgradeBuilding(b) {
  if (!b || !UPGRADABLE[b.type]) return false;
  if (b.level >= MAX_LEVEL) { toast('Schon auf höchster Stufe!', true); return false; }
  const cost = levelUpCost(b);
  if (state.money < cost) { toast('Nicht genug Geld!', true); return false; }
  state.money -= cost; b.spent += cost; b.level++;
  toast(`${buildingName(b)} → Stufe ${b.level} (${LEVELS[b.level].name})`);
  if (selected === b) renderInfo();
  return true;
}

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
  { item: 'brick',        count: 80,  reward: 3000,  text: 'Verkaufe 80 Ziegel' },
  { item: 'steel',        count: 40,  reward: 6000,  text: 'Verkaufe 40 Stahl' },
  { item: 'gold_bar',     count: 30,  reward: 9000,  text: 'Verkaufe 30 Goldbarren' },
  { item: 'battery',      count: 30,  reward: 12000, text: 'Verkaufe 30 Akkus' },
  { item: 'solar',        count: 25,  reward: 20000, text: 'Verkaufe 25 Solarmodule' },
  { item: 'processor',    count: 25,  reward: 40000, text: 'Verkaufe 25 Prozessoren' },
  { item: 'drone',        count: 10,  reward: 80000, text: 'Verkaufe 10 Drohnen' },
  { item: 'robot',        count: 100, reward: 100000,text: 'Verkaufe 100 Roboter' },
  { item: 'drone',        count: 100, reward: 500000,text: 'Verkaufe 100 Drohnen – Fabrik-Tycoon!' },
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
    money: 1000,
    sold: {},
    mission: 0,
    upgrades: { belt: 0, miner: 0, craft: 0, price: 0 },
    recipe: 'gear',
    mined: {},     // "x,y" -> verbleibender Vorrat (nur abgebaute Felder)
    mapV: 2,       // Kartenformat (2 = große Karte)
    legacy: false, // true = Kern stammt von einer alten 64×48-Karte
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

// fester Zufallswert aus Zahlen (verbraucht keine Zufallsfolge → alte Karten bleiben gleich)
function hashN(a, b, c = 0) {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 982451653)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Grundvorrat pro Feld (Einheiten), wird mit der Reichhaltigkeit des Vorkommens multipliziert
const ORE_BASE = { iron_ore: 220, copper_ore: 220, coal: 200, stone: 300, gold_ore: 80, quartz: 110 };
let deposits = []; // [{ ore, rich, tiles: [[x,y],...] }]
let oreDirty = new Set(); // Felder, deren Vorrat sich geändert hat (für die 3D-Darstellung)

// Stein, Gold und Quarz nur auf bisher leere Felder setzen (bestehende Spielstände bleiben gültig)
function addExtraOres(seed) {
  const r = rng(seed + 333), cx = MAP_W / 2, cy = MAP_H / 2;
  const blob = (ore, bx, by, rad) => {
    for (let y = by - rad - 1; y <= by + rad + 1; y++) for (let x = bx - rad - 1; x <= bx + rad + 1; x++) {
      if (!inMap(x, y) || tiles[y][x].ore) continue;
      if (Math.hypot(x - bx, y - by) + r() * 1.2 <= rad) tiles[y][x].ore = ore;
    }
  };
  // ein Steinfeld in Startnähe
  const a = r() * Math.PI * 2;
  blob('stone', Math.round(cx + Math.cos(a) * 14), Math.round(cy + Math.sin(a) * 10), 3);
  const plan = [['stone', 14, 2, 3, 0.15], ['gold_ore', 9, 2, 2, 0.45], ['quartz', 9, 2, 2, 0.4]];
  for (const [ore, n, r0, rr, minFar] of plan) {
    for (let i = 0, k = 0; i < 300 && k < n; i++) {
      const x = Math.floor(r() * MAP_W), y = Math.floor(r() * MAP_H);
      const far = Math.hypot((x - cx) / MAP_W, (y - cy) / MAP_H) * 2;
      if (far < minFar) continue;
      blob(ore, x, y, r0 + Math.floor(r() * (rr + 1))); k++;
    }
  }
}

// Zusammenhängende Felder gleicher Sorte bilden ein Vorkommen mit eigener Reichhaltigkeit
function buildDeposits(seed) {
  deposits = [];
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
    const t = tiles[y][x];
    if (!t.ore || t.dep != null) continue;
    const id = deposits.length, ore = t.ore, list = [], stack = [[x, y]];
    t.dep = id;
    while (stack.length) {
      const [px, py] = stack.pop(); list.push([px, py]);
      for (let k = 0; k < 4; k++) {
        const nx = px + DX[k], ny = py + DY[k];
        if (inMap(nx, ny) && tiles[ny][nx].ore === ore && tiles[ny][nx].dep == null) { tiles[ny][nx].dep = id; stack.push([nx, ny]); }
      }
    }
    // Reichhaltigkeit 0,35 … 2,8 (wenige sehr reiche Vorkommen)
    const rich = 0.35 + Math.pow(hashN(x, y, seed), 1.6) * 2.45;
    for (const [px, py] of list) {
      const tt = tiles[py][px];
      tt.amt0 = tt.amt = Math.round(ORE_BASE[ore] * rich * (0.7 + 0.6 * hashN(px, py, seed + 1)));
    }
    deposits.push({ ore, rich, tiles: list });
  }
}
// ---------- Startfabrik (nur bei neuen Spielen) ----------
// Feste Erzfelder (Eisen + Kohle) und eine fertige Kette: Bohrer → Bänder → Schmelzofen → Verkauf.
// Die Position steht in state.starter, damit die Felder beim Laden gleich wiederhergestellt werden.
function addStarterOres() {
  if (!state.starter) return;
  const [ox, oy] = state.starter;
  for (let y = oy - 1; y <= oy + 7; y++) for (let x = ox - 1; x <= ox + 9; x++) if (inMap(x, y)) tiles[y][x].ore = null;
  for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) { tiles[oy + y][ox + x].ore = 'iron_ore'; tiles[oy + 4 + y][ox + x].ore = 'coal'; }
}
function boostStarterDeposits() { // Startvorkommen sind reich
  if (!state.starter) return;
  const [ox, oy] = state.starter;
  for (const d of deposits) {
    if (!d.tiles.some(([x, y]) => x >= ox && x < ox + 3 && y >= oy && y < oy + 7)) continue;
    d.rich = 2.2;
    for (const [x, y] of d.tiles) { const t = tiles[y][x]; t.amt0 = t.amt = Math.round(ORE_BASE[d.ore] * d.rich * (0.7 + 0.6 * hashN(x, y, state.seed + 1))); }
  }
}
function buildStarterFactory() {
  const [ox, oy] = state.starter;
  const P = (type, dx, dy, dir) => place(type, ox + dx, oy + dy, dir, true);
  // Eisen: Bohrer → 3 Bänder → Schmelzofen → 2 Bänder → Verkauf
  P('miner', 1, 1, 0);
  for (const dx of [2, 3, 4]) P('belt', dx, 1, 0);
  P('furnace', 5, 1, 0);
  for (const dx of [6, 7]) P('belt', dx, 1, 0);
  P('seller', 8, 1, 0);
  // Kohle: Bohrer → Bänder nach rechts und dann hoch in den Ofen
  P('miner', 1, 5, 0);
  for (const dx of [2, 3, 4]) P('belt', dx, 5, 0);
  for (const dy of [5, 4, 3, 2]) P('belt', 5, dy, 3);
}

function richName(r) { return r < 0.7 ? 'arm' : r < 1.2 ? 'mittel' : r < 2 ? 'reich' : 'sehr reich'; }
function depositLeft(d) { let a = 0, a0 = 0; for (const [x, y] of d.tiles) { a += tiles[y][x].amt; a0 += tiles[y][x].amt0; } return [a, a0]; }

// Abbau: ein Feld im Umkreis des Bohrers um 1 verringern. Liefert false, wenn nichts mehr da ist.
function mineTile(b) {
  const R = MINE_RADIUS, n = (2 * R + 1) ** 2;
  for (let i = 0; i < n; i++) {
    const k = (b.rr + i) % n, x = b.x + (k % (2 * R + 1)) - R, y = b.y + Math.floor(k / (2 * R + 1)) - R;
    if (!inMap(x, y)) continue;
    const t = tiles[y][x];
    if (t.ore !== b.ore || !(t.amt > 0)) continue;
    t.amt--;
    state.mined[x + ',' + y] = t.amt;
    if (t.amt <= 0) { t.was = t.ore; t.ore = null; }
    oreDirty.add(x + ',' + y);
    b.rr = (k + 1) % n;
    return true;
  }
  return false;
}
function minerLeft(b) {
  let a = 0; const R = MINE_RADIUS;
  for (let y = b.y - R; y <= b.y + R; y++) for (let x = b.x - R; x <= b.x + R; x++)
    if (inMap(x, y) && tiles[y][x].ore === b.ore) a += tiles[y][x].amt;
  return a;
}

function generateMap(seed) {
  tiles = [];
  const rv = rng(seed ^ 0x5bd1e995);
  for (let y = 0; y < MAP_H; y++) {
    tiles.push([]);
    for (let x = 0; x < MAP_W; x++) tiles[y].push({ ore: null, b: null, v: rv() });
  }
  // Erzfeld als unregelmäßiger Klecks; bounds = [x0, y0, x1, y1] begrenzt den Bereich
  const blob = (r, ore, cx, cy, rad, bounds = [0, 0, MAP_W, MAP_H]) => {
    for (let y = cy - rad - 1; y <= cy + rad + 1; y++)
      for (let x = cx - rad - 1; x <= cx + rad + 1; x++) {
        if (x < bounds[0] || y < bounds[1] || x >= bounds[2] || y >= bounds[3]) continue;
        const d = Math.hypot(x - cx, y - cy) + r() * 1.2;
        if (d <= rad) tiles[y][x].ore = ore;
      }
  };
  const ores = ['iron_ore', 'copper_ore', 'coal'];
  if (state.legacy) {
    // Außenring der großen Karte (der Kern bleibt frei)
    const r2 = rng(seed + 7), [ox, oy] = LEGACY_OFF;
    for (let i = 0, n = 0; i < 400 && n < 40; i++) {
      const x = Math.floor(r2() * MAP_W), y = Math.floor(r2() * MAP_H), rad = 2 + Math.floor(r2() * 4);
      if (x > ox - rad - 2 && x < ox + LEGACY_W + rad + 2 && y > oy - rad - 2 && y < oy + LEGACY_H + rad + 2) continue;
      blob(r2, ores[n % 3], x, y, rad); n++;
    }
    // Kern exakt wie die alte Karte (gleiche Zufallsfolge wie früher)
    const r = rng(seed);
    for (let y = 0; y < LEGACY_H; y++) for (let x = 0; x < LEGACY_W; x++) tiles[y + oy][x + ox].v = r();
    const core = [ox, oy, ox + LEGACY_W, oy + LEGACY_H];
    const lb = (ore, cx, cy, rad) => blob(r, ore, cx + ox, cy + oy, rad, core);
    ores.forEach((ore, i) => {
      const a = (i / 3) * Math.PI * 2 + r();
      lb(ore, Math.round(LEGACY_W / 2 + Math.cos(a) * 8), Math.round(LEGACY_H / 2 + Math.sin(a) * 6), 3);
    });
    for (let i = 0; i < 18; i++) lb(ores[i % 3], Math.floor(r() * LEGACY_W), Math.floor(r() * LEGACY_H), 2 + Math.floor(r() * 3));
    return;
  }
  const r = rng(seed);
  const cx = MAP_W / 2, cy = MAP_H / 2;
  // Startfelder in der Nähe der Mitte
  ores.forEach((ore, i) => {
    const a = (i / 3) * Math.PI * 2 + r();
    blob(r, ore, Math.round(cx + Math.cos(a) * 8), Math.round(cy + Math.sin(a) * 6), 3);
  });
  // weitere Felder über die ganze Karte, nach außen hin größer
  for (let i = 0; i < 52; i++) {
    const x = Math.floor(r() * MAP_W), y = Math.floor(r() * MAP_H);
    const far = Math.hypot((x - cx) / MAP_W, (y - cy) / MAP_H) * 2; // 0 = Mitte, ~1 = Rand
    blob(r, ores[i % 3], x, y, 2 + Math.floor(r() * 2.5 + far * 2));
  }
}

function inMap(x, y) { return x >= 0 && y >= 0 && x < MAP_W && y < MAP_H; }
function bAt(x, y) { return inMap(x, y) ? tiles[y][x].b : null; }

function makeBuilding(type, x, y, dir) {
  const b = { type, x, y, dir, inv: {}, out: [], prog: 0, item: null, p: 0, moved: false, rr: 0, fuel: 0, job: null, anim: 0,
    level: 1, spent: buildCost(type, x, y) };
  if (type === 'miner') { const t = tiles[y][x]; b.ore = t.ore || t.was; }
  if (type === 'assembler') b.recipe = state.recipe;
  return b;
}

function canPlace(type, x, y, loading = false) {
  if (!inMap(x, y)) return false;
  const t = tiles[y][x];
  if (t.b) return false;
  if (type === 'miner' && !t.ore && !(loading && t.was)) return false;
  return true;
}

function place(type, x, y, dir, free = false) {
  if (!canPlace(type, x, y, free)) return null;
  const cost = buildCost(type, x, y);
  if (!free && typeof blockedByPlayer === 'function' && blockedByPlayer(type, x, y)) { toast('Hier stehst du gerade!', true); return null; }
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
  state.money += Math.floor((b.spent || BUILDINGS[b.type].cost) * 0.75);
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
      if (dir === (b.dir + 2) % 4) return false; // vorne ist der Ausgang – Eingänge: hinten, links, rechts
      if (item === 'coal') {
        if ((b.inv.coal || 0) >= 10) return false;
      } else if (SMELT[item]) {
        if ((b.inv[item] || 0) >= 10) return false;
      } else return false;
      b.inv[item] = (b.inv[item] || 0) + 1;
      return true;
    }
    case 'assembler': {
      if (dir === (b.dir + 2) % 4) return false; // vorne ist der Ausgang
      const r = RECIPES[b.recipe];
      if (!r || !r.in[item]) return false;
      if ((b.inv[item] || 0) >= r.in[item] * 4) return false;
      b.inv[item] = (b.inv[item] || 0) + 1;
      return true;
    }
    case 'seller': {
      const v = Math.round(ITEMS[item].value * priceMult() * LEVELS[b.level || 1].price * 100) / 100;
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
        if (b.out.length < 2 && !b.empty) {
          b.prog += dt * lvSpeed(b) * DRILLS[b.ore].speed / minerTime();
          if (b.prog >= 1) {
            b.prog = 0;
            if (mineTile(b)) b.out.push(b.ore);
            else { b.empty = true; if (selected === b) renderInfo(); }
          }
          b.anim = (b.anim + dt * 4) % 1;
        }
        pushOutput(b);
        break;
      }
      case 'furnace': {
        if (!b.job && b.out.length < 4) {
          const ore = Object.keys(SMELT).find(o => (b.inv[o] || 0) >= (SMELT[o].need || 1));
          if (ore) {
            if (b.fuel <= 0 && b.inv.coal > 0) { b.inv.coal--; b.fuel += COAL_PER_FUEL; }
            if (b.fuel > 0) { b.fuel--; b.inv[ore] -= SMELT[ore].need || 1; b.job = SMELT[ore]; b.prog = 0; }
          }
        }
        if (b.job) {
          b.prog += dt * craftMult() * lvSpeed(b) / b.job.time;
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
          b.prog += dt * craftMult() * lvSpeed(b) / b.job.time;
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
let tool = null;     // ausgewählter Gebäudetyp
let toolDir = 0;
let selected = null; // angeklicktes Gebäude
let paused = false;
let demolish = false; // Abriss-Werkzeug aktiv
let touchUI = matchMedia('(pointer: coarse)').matches; // Touch-Bedienung (Handy/Tablet)

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
    case 'brick':
      c.fillRect(-s * .5, -s * .28, s, s * .56); c.strokeRect(-s * .5, -s * .28, s, s * .56);
      c.strokeStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.moveTo(-s * .5, 0); c.lineTo(s * .5, 0); c.moveTo(0, -s * .28); c.lineTo(0, 0); c.stroke();
      break;
    case 'bar':
      c.beginPath(); c.moveTo(-s * .5, s * .3); c.lineTo(s * .5, s * .3); c.lineTo(s * .32, -s * .25); c.lineTo(-s * .32, -s * .25); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = 'rgba(255,255,255,.45)'; c.fillRect(-s * .25, -s * .18, s * .5, s * .08);
      break;
    case 'wafer':
      c.beginPath(); c.arc(0, 0, s * .46, 0, 7); c.fill(); c.stroke();
      c.strokeStyle = 'rgba(160,190,255,.6)'; c.lineWidth = 1;
      for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(i * s * .15, -s * .4); c.lineTo(i * s * .15, s * .4); c.moveTo(-s * .4, i * s * .15); c.lineTo(s * .4, i * s * .15); c.stroke(); }
      break;
    case 'battery':
      c.fillRect(-s * .28, -s * .4, s * .56, s * .85); c.strokeRect(-s * .28, -s * .4, s * .56, s * .85);
      c.fillStyle = '#ddd'; c.fillRect(-s * .1, -s * .5, s * .2, s * .1);
      c.fillStyle = '#fff'; c.fillRect(-s * .05, -s * .15, s * .1, s * .35); c.fillRect(-s * .15, -s * .03, s * .3, s * .1);
      break;
    case 'panel':
      c.fillRect(-s * .5, -s * .35, s, s * .7); c.strokeRect(-s * .5, -s * .35, s, s * .7);
      c.strokeStyle = 'rgba(200,220,255,.55)'; c.lineWidth = 1;
      for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(-s * .5 + i * s / 4, -s * .35); c.lineTo(-s * .5 + i * s / 4, s * .35); c.stroke(); }
      c.beginPath(); c.moveTo(-s * .5, 0); c.lineTo(s * .5, 0); c.stroke();
      break;
    case 'cpu':
      c.fillStyle = '#c9a23a';
      for (let i = -2; i <= 2; i++) { c.fillRect(i * s * .15 - s * .03, -s * .5, s * .06, s); c.fillRect(-s * .5, i * s * .15 - s * .03, s, s * .06); }
      c.fillStyle = it.color; c.fillRect(-s * .38, -s * .38, s * .76, s * .76); c.strokeRect(-s * .38, -s * .38, s * .76, s * .76);
      c.fillStyle = '#9aa4b0'; c.fillRect(-s * .2, -s * .2, s * .4, s * .4);
      break;
    case 'drone':
      c.strokeStyle = '#555'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(-s * .35, -s * .35); c.lineTo(s * .35, s * .35); c.moveTo(s * .35, -s * .35); c.lineTo(-s * .35, s * .35); c.stroke();
      c.fillStyle = '#333';
      for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { c.beginPath(); c.arc(dx * s * .35, dy * s * .35, s * .15, 0, 7); c.fill(); }
      c.fillStyle = it.color; c.beginPath(); c.arc(0, 0, s * .2, 0, 7); c.fill(); c.strokeStyle = 'rgba(0,0,0,.6)'; c.lineWidth = 1.5; c.stroke();
      c.fillStyle = '#5ee0ff'; c.beginPath(); c.arc(0, 0, s * .07, 0, 7); c.fill();
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
  // Stufen-Anzeige
  if (b.level > 1) {
    const col = ['', '', '#c9c9c9', '#ffd75e', '#5ee0ff'][b.level];
    for (let i = 0; i < b.level - 1; i++) {
      c.fillStyle = '#000'; c.fillRect(px + 3 + i * 6, py + 3, 5, 5);
      c.fillStyle = col; c.fillRect(px + 4 + i * 6, py + 4, 3, 3);
    }
  }
  c.restore();
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
  // Sonderfelder: Abreißen und Drehen (vor allem für Touch)
  const special = (id, key, icon, label, onclick) => {
    const el = document.createElement('div');
    el.className = 'slot special'; el.dataset.special = id;
    el.innerHTML = `<span class="key">${key}</span><span class="icon">${icon}</span><span>${label}</span>`;
    el.onclick = onclick;
    hb.appendChild(el);
  };
  special('demolish', 'X', '✖', 'Abreißen', () => setDemolish(!demolish));
  special('rotate', 'R', '↻', 'Drehen', rotateAction);
}

function setDemolish(on) {
  demolish = on;
  if (on) { tool = null; selected = null; renderInfo(); }
  updateHotbar();
}

function rotateAction() {
  if (tool) toolDir = (toolDir + 1) % 4;
  else if (selected) selected.dir = (selected.dir + 1) % 4;
  else toast(touchUI ? 'Wähle zuerst ein Gebäude oder tippe eines an' : 'Wähle zuerst ein Gebäude (1–7) oder klicke eines an', true);
}

function updateHotbar() {
  for (const el of $('hotbar').children) {
    if (el.dataset.special) { el.classList.toggle('active', el.dataset.special === 'demolish' && demolish); continue; }
    el.classList.toggle('active', el.dataset.type === tool);
    el.classList.toggle('poor', state.money < BUILDINGS[el.dataset.type].cost);
  }
}

function selectTool(type) {
  tool = type;
  demolish = false;
  if (type) { selected = null; selectedTile = null; renderInfo(); }
  updateHotbar();
  $('game3d').style.cursor = type || demolish ? 'crosshair' : 'default';
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
let selectedTile = null; // angeklicktes Feld ohne Gebäude (für Erz-Infos)
function renderInfo(force = true) {
  const el = $('info');
  if (!selected) {
    if (tool) {
      const d = BUILDINGS[tool];
      el.innerHTML = `<b>${d.name}</b> (${d.cost} €)<br>${d.desc}<br><small>${touchUI ? '↻ Drehen unten in der Leiste' : 'R = drehen'}</small>`;
      if (tool === 'assembler') el.innerHTML += recipeButtons(state.recipe);
      if (tool === 'miner') el.innerHTML += '<br><small>Preis je Erz: ' + ORES.map(o => `${ITEMS[o].name} ${Math.round(BUILDINGS.miner.cost * DRILLS[o].cost)} €`).join(' · ') + '</small>';
    } else if (demolish) el.innerHTML = '<b>Abreißen</b><br>Gebäude antippen oder darüber ziehen. Du bekommst 75 % der Kosten zurück.';
    else if (selectedTile && tiles[selectedTile.y][selectedTile.x].dep != null) {
      // angeklicktes Erzvorkommen
      const t = tiles[selectedTile.y][selectedTile.x], d = deposits[t.dep], [left, total] = depositLeft(d);
      const pct = total ? left / total : 0;
      el.innerHTML = `<b>${ITEMS[d.ore].name}-Vorkommen</b><br>Reichhaltigkeit: <b>${richName(d.rich)}</b><br>` +
        `Felder: ${d.tiles.length}<br>Vorrat: ${fmt(left)} / ${fmt(total)}` +
        `<div class="bar"><div style="width:${pct * 100}%"></div></div>` +
        `<small>Dieses Feld: ${fmt(t.amt)} · passender Bohrer: ${DRILLS[d.ore].name} (${Math.round(BUILDINGS.miner.cost * DRILLS[d.ore].cost)} €)</small>`;
    }
    else el.innerHTML = touchUI ? 'Wähle unten ein Gebäude und tippe auf ein Feld. Tippe ein Gebäude an für Infos. Wischen dreht die Kamera, zwei Finger zoomen.'
      : 'Wähle unten ein Gebäude (1–7) und klicke auf ein Feld. Klicke ein Gebäude an für Infos.';
    bindRecipeButtons();
    return;
  }
  const b = selected, d = BUILDINGS[b.type];
  let h = `<b>${buildingName(b)}</b><br><small>${d.desc}</small><br>`;
  switch (b.type) {
    case 'miner': {
      const left = minerLeft(b);
      h += `Erz: ${ITEMS[b.ore].name}<br>Tempo: ${(60 * lvSpeed(b) * DRILLS[b.ore].speed / minerTime()).toFixed(0)} / min<br>`;
      h += b.empty || !left ? '<b style="color:#e05050">Vorkommen erschöpft – Bohrer abreißen und woanders bauen</b>' : `Vorrat im Umkreis: ${fmt(left)}`;
      break;
    }
    case 'furnace': h += `Brennstoff: ${b.fuel} Vorgänge<br>Lager: ${invText(b.inv)}<br>Ausgabe: ${b.out.length}`; break;
    case 'assembler': h += `Lager: ${invText(b.inv)}<br>Ausgabe: ${b.out.length}` + recipeButtons(b.recipe); break;
    case 'belt': case 'splitter': h += `Inhalt: ${b.item ? ITEMS[b.item].name : '–'}`; break;
    case 'seller': {
      h += '<small>Preise:</small><br>';
      h += Object.entries(ITEMS).map(([, it]) => `${it.name}: ${(it.value * priceMult() * LEVELS[b.level].price).toFixed(1)} €`).join('<br>');
      break;
    }
  }
  if ((b.type === 'miner' && b.out.length >= 2) || ((b.type === 'furnace' || b.type === 'assembler') && b.out.length >= 4))
    h += '<div class="warn">⚠ Ausgabe blockiert: In Pfeilrichtung (gelber/roter Pfeil am Boden) braucht es ein Förderband oder ein Gebäude, das die Ware annimmt. Mit <b>R</b> bzw. <b>↻</b> drehen.</div>';
  if (UPGRADABLE[b.type]) {
    const L = LEVELS[b.level];
    h += `<div class="level"><b>Stufe ${b.level}/${MAX_LEVEL}: ${L.name}</b><br><small>`;
    h += b.type === 'seller' ? `Preise ×${L.price.toFixed(2).replace('.', ',')}` : `Tempo ×${L.speed.toFixed(1).replace('.', ',')}`;
    h += '</small>';
    if (b.level < MAX_LEVEL) {
      const N = LEVELS[b.level + 1], cost = levelUpCost(b);
      const eff = b.type === 'seller' ? `Preise ×${N.price.toFixed(2).replace('.', ',')}` : `Tempo ×${N.speed.toFixed(1).replace('.', ',')}`;
      h += `<button id="btnLevelUp" ${state.money < cost ? 'disabled' : ''}>Aufrüsten → ${N.name} (${fmt(cost)} €)<br><small>${eff}${touchUI ? '' : ' · Taste U'}</small></button>`;
    }
    h += '</div>';
  }
  if (!force && h === infoKey) return;
  infoKey = h;
  el.innerHTML = h;
  bindRecipeButtons();
  const up = $('btnLevelUp');
  if (up) up.onclick = () => upgradeBuilding(selected);
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
let dragging = null; // Bau-Ziehen: { button, lastTx, lastTy, lastBelt }

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

function enableTouchUI() {
  if (touchUI && document.body.classList.contains('touch')) return;
  touchUI = true;
  document.body.classList.add('touch');
  renderInfo();
}

function togglePause() {
  paused = !paused;
  $('pause').classList.toggle('hidden', !paused);
  $('btnPause').classList.toggle('on', paused);
}

function closeModals() { for (const m of document.querySelectorAll('.modal')) m.classList.add('hidden'); }
for (const m of document.querySelectorAll('.modal')) {
  m.addEventListener('click', e => { if (e.target === m || e.target.classList.contains('close')) m.classList.add('hidden'); });
}
$('btnPause').onclick = () => { togglePause(); $('btnPause').blur(); };
$('btnMenu').onclick = () => $('side').classList.toggle('open');
$('btnCloseSide').onclick = () => $('side').classList.remove('open');
$('btnHelp').onclick = () => $('help').classList.remove('hidden');
$('btnUpgrades').onclick = () => { renderUpgrades(); $('upgrades').classList.remove('hidden'); };
$('btnNew').onclick = () => $('newGame').classList.remove('hidden');
$('btnNewYes').onclick = () => {
  $('newGame').classList.add('hidden');
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignorieren */ }
  startGame(null);
};

// =====================================================================
//  Speichern / Laden
// =====================================================================
function save() {
  try {
    const data = { state, buildings: buildings.map(b => [b.type, b.x, b.y, b.dir, b.recipe || null, b.level, b.spent]) };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch (e) { /* Speicher nicht verfügbar */ }
}
function load() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { return null; }
}

function startGame(data) {
  state = data ? Object.assign(newState(), data.state) : newState();
  // Spielstand von der alten, kleinen Karte: Kern übernehmen und Gebäude in die Mitte verschieben
  let off = [0, 0];
  if (data && !data.state.mapV) { state.legacy = true; off = LEGACY_OFF; }
  state.mapV = 2;
  state.mined = state.mined || {};
  if (!data) state.starter = [Math.floor(MAP_W / 2) + 3, Math.floor(MAP_H / 2) - 3];
  generateMap(state.seed);
  addExtraOres(state.seed);
  addStarterOres();
  buildDeposits(state.seed);
  boostStarterDeposits();
  // bereits abgebaute Mengen übernehmen
  for (const [k, v] of Object.entries(state.mined)) {
    const [x, y] = k.split(',').map(Number);
    if (!inMap(x, y) || !tiles[y][x].ore) continue;
    const t = tiles[y][x]; t.amt = v;
    if (v <= 0) { t.was = t.ore; t.ore = null; }
  }
  oreDirty = new Set();
  buildings = [];
  incomeLog = []; simTime = 0; selected = null;
  if (data) {
    for (const [type, x, y, dir, recipe, level, spent] of data.buildings) {
      const b = place(type, x + off[0], y + off[1], dir, true);
      if (b && recipe) b.recipe = recipe;
      if (b && level) { b.level = level; b.spent = spent || b.spent; }
    }
  }
  if (!data) buildStarterFactory();
  // Startbonus für ältere Spielstände (einmalig)
  if (data && !state.starterBonus) { state.money += 600; state.starterBonus = true; setTimeout(() => toast('Startbonus: +600 € 🎁'), 800); }
  state.starterBonus = true;
  resetPlayer();
  buildHotbar(); selectTool(null); renderMissions(); renderInfo();
  if (!data) { $('help').classList.remove('hidden'); setTimeout(() => toast('Deine Startfabrik läuft schon: Eisen + Kohle → Schmelzofen → Verkauf'), 600); }
}

// =====================================================================
//  Hauptschleife
// =====================================================================
let last = performance.now();
let uiTimer = 0, saveTimer = 0;
function frame(now) {
  let dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!paused) {
    // feste Teilschritte für stabile Simulation
    const steps = Math.ceil(dt / (1 / 60));
    for (let i = 0; i < steps; i++) update(dt / steps);
  }
  render3d(dt);

  uiTimer += dt; saveTimer += dt;
  if (uiTimer > 0.2) {
    uiTimer = 0;
    updateTopbar(); updateHotbar(); renderMissions();
    if (selected || selectedTile) renderInfo(false);
  }
  if (saveTimer > 5) { saveTimer = 0; save(); }
  requestAnimationFrame(frame);
}

addEventListener('load', () => {
  if (touchUI) document.body.classList.add('touch');
  if (!init3d()) return;
  startGame(load());
  addEventListener('beforeunload', save);
  last = performance.now();
  requestAnimationFrame(frame);
});
