#!/usr/bin/env node
// Builds the bundled chart data in public/data from public-domain sources:
//   - Natural Earth 1:10m land + minor islands (coastlines)    https://www.naturalearthdata.com
//   - Natural Earth 1:10m ports                                 (public domain)
//   - UN/LOCODE code list (port function, coordinates, names)  https://unece.org/trade/uncefact/unlocode
//
//   node scripts/build-data.mjs          downloads sources into .cache/data, writes public/data
//
// Output
//   public/data/land.json    quantised, delta-encoded polygons  { q, polys: [[ring, ...], ...] }  (1:10m)
//   public/data/land50.json  the same for 1:50m, drawn when the chart is zoomed out
//   public/data/ports.json  { v, ports: [[id, name, region, cc, lat, lon, size], ...] }

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cacheDir = path.join(root, '.cache', 'data');
const outDir = path.join(root, 'public', 'data');
fs.mkdirSync(cacheDir, { recursive: true });
fs.mkdirSync(outDir, { recursive: true });

const NE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/';
const LOCODE = 'https://raw.githubusercontent.com/datasets/un-locode/main/data/';
const sources = {
  land: NE + 'ne_10m_land.geojson',
  land50: NE + 'ne_50m_land.geojson',
  islands: NE + 'ne_10m_minor_islands.geojson',
  ports: NE + 'ne_10m_ports.geojson',
  locode: LOCODE + 'code-list.csv',
  subdivisions: LOCODE + 'subdivision-codes.csv',
};

async function fetchCached(key) {
  const url = sources[key];
  const file = path.join(cacheDir, path.basename(url));
  if (!fs.existsSync(file)) {
    process.stdout.write(`downloading ${url}\n`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  return fs.readFileSync(file, 'utf8');
}

// ---------- geometry helpers ----------

const toRad = (d) => (d * Math.PI) / 180;
function km(lat1, lon1, lat2, lon2) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(a)));
}

// Douglas–Peucker on a closed ring (planar, degrees).
function simplify(ring, tol) {
  if (ring.length <= 8) return ring;
  const keep = new Uint8Array(ring.length);
  keep[0] = keep[ring.length - 1] = 1;
  const stack = [[0, ring.length - 1]];
  const tol2 = tol * tol;
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = ring[a];
    const [bx, by] = ring[b];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let maxD = -1;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = ring[i];
      let d2;
      if (len2 === 0) d2 = (px - ax) ** 2 + (py - ay) ** 2;
      else {
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
        d2 = (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2;
      }
      if (d2 > maxD) {
        maxD = d2;
        idx = i;
      }
    }
    if (maxD > tol2 && idx > 0) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  return ring.filter((_, i) => keep[i]);
}

function polygonsOf(fc) {
  const out = [];
  for (const f of fc.features) {
    const g = f.geometry;
    if (!g) continue;
    if (g.type === 'Polygon') out.push(g.coordinates);
    else if (g.type === 'MultiPolygon') out.push(...g.coordinates);
  }
  return out;
}

// ---------- land ----------

const Q = 1e4; // 0.0001° ≈ 11 m
const TOL = 0.0008; // ≈ 90 m simplification tolerance

function encodeRing(ring) {
  const out = [];
  let px = 0;
  let py = 0;
  let prevX = null;
  let prevY = null;
  for (const [lon, lat] of ring) {
    const x = Math.round(lon * Q);
    const y = Math.round(lat * Q);
    if (x === prevX && y === prevY) continue;
    out.push(x - px, y - py);
    px = x;
    py = y;
    prevX = x;
    prevY = y;
  }
  return out.length >= 8 ? out : null;
}

const landFC = JSON.parse(await fetchCached('land'));
const islandsFC = JSON.parse(await fetchCached('islands'));
const allPolys = [...polygonsOf(landFC), ...polygonsOf(islandsFC)];

// Spatial hash of coast vertices (unsimplified) for the "is this port on the coast" check.
const CELL = 0.1;
const coastHash = new Map();
function hashKey(lat, lon) {
  return `${Math.floor(lat / CELL)}:${Math.floor(lon / CELL)}`;
}
for (const poly of allPolys) {
  for (const ring of poly) {
    for (let i = 0; i < ring.length; i += 2) {
      const [lon, lat] = ring[i];
      const k = hashKey(lat, lon);
      let arr = coastHash.get(k);
      if (!arr) coastHash.set(k, (arr = []));
      arr.push(lat, lon);
    }
  }
}
function coastDistanceKm(lat, lon) {
  let best = Infinity;
  const cy = Math.floor(lat / CELL);
  const cx = Math.floor(lon / CELL);
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const arr = coastHash.get(`${cy + dy}:${cx + dx}`);
      if (!arr) continue;
      for (let i = 0; i < arr.length; i += 2) {
        const d = km(lat, lon, arr[i], arr[i + 1]);
        if (d < best) best = d;
      }
    }
  }
  return best;
}

let vertsIn = 0;
let vertsOut = 0;
const encoded = [];
for (const poly of allPolys) {
  const rings = [];
  for (const ring of poly) {
    vertsIn += ring.length;
    const simple = simplify(ring, TOL);
    const enc = encodeRing(simple);
    if (enc) {
      rings.push(enc);
      vertsOut += enc.length / 2;
    }
  }
  if (rings.length) encoded.push(rings);
}
const landOut = JSON.stringify({
  source: 'Natural Earth 1:10m land + minor islands (public domain)',
  q: Q,
  polys: encoded,
});
fs.writeFileSync(path.join(outDir, 'land.json'), landOut);
console.log(`land: ${encoded.length} polygons, ${vertsIn} → ${vertsOut} vertices, ${(landOut.length / 1e6).toFixed(2)} MB`);

{
  const fc50 = JSON.parse(await fetchCached('land50'));
  const enc50 = [];
  let n50 = 0;
  for (const poly of polygonsOf(fc50)) {
    const rings = [];
    for (const ring of poly) {
      const enc = encodeRing(simplify(ring, 0.004));
      if (enc) {
        rings.push(enc);
        n50 += enc.length / 2;
      }
    }
    if (rings.length) enc50.push(rings);
  }
  const out50 = JSON.stringify({ source: 'Natural Earth 1:50m land (public domain)', q: Q, polys: enc50 });
  fs.writeFileSync(path.join(outDir, 'land50.json'), out50);
  console.log(`land50: ${enc50.length} polygons, ${n50} vertices, ${(out50.length / 1e6).toFixed(2)} MB`);
}

// ---------- ports ----------

function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [head, ...body] = rows;
  return body.filter((r) => r.length === head.length).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

function parseLocodeCoord(s) {
  const m = /^(\d{2})(\d{2})([NS])\s+(\d{3})(\d{2})([EW])$/.exec(s.trim());
  if (!m) return null;
  let lat = +m[1] + +m[2] / 60;
  let lon = +m[4] + +m[5] / 60;
  if (m[3] === 'S') lat = -lat;
  if (m[6] === 'W') lon = -lon;
  if (+m[2] >= 60 || +m[5] >= 60 || Math.abs(lat) > 85) return null;
  return [lat, lon];
}

const norm = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ø/gi, 'o')
    .replace(/æ/gi, 'ae')
    .replace(/å/gi, 'a')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

// English names for places better known by them.
const EXONYMS = {
  'København': 'Copenhagen',
  'Göteborg': 'Gothenburg',
  'Lisboa': 'Lisbon',
  'Napoli': 'Naples',
  'Venezia': 'Venice',
  'Genova': 'Genoa',
  'Sevilla': 'Seville',
  'Livorno': 'Livorno',
  'Antwerpen': 'Antwerp',
  'Gdańsk': 'Gdańsk',
  'Pireas': 'Piraeus',
  'Piraiévs': 'Piraeus',
  'Thessaloníki': 'Thessaloniki',
  'Iraklion (Heraklion)': 'Heraklion',
  'Den Haag': 'The Hague',
};

const REGION_CLEAN = [
  [/ län$/, ''],
  [/s$/, ''], // Swedish genitive ("Hallands" → "Halland") — applied only to SE below
];

const subRows = parseCSV(await fetchCached('subdivisions'));
const subdivisions = new Map();
for (const r of subRows) {
  let name = r.SUName;
  if (r.SUCountry === 'SE') {
    name = name.replace(/ län$/, '');
    if (!/^(Kalmar|Uppsala|Örebro|Skåne|Gotland)/.test(name)) name = name.replace(/s$/, '');
    if (name === 'Kronoborg') name = 'Kronoberg';
    if (name === 'Dalarne') name = 'Dalarna';
    if (name === 'Gotland') name = 'Gotland';
  }
  name = name.replace(/\s*\[.*?\]\s*/g, ' ').replace(/\s*\(.*?\)\s*/g, ' ').trim();
  subdivisions.set(`${r.SUCountry}-${r.SUCode}`, name);
}
void REGION_CLEAN;

const locodeRows = parseCSV(await fetchCached('locode'));
// All coordinates (any function) for country lookup; port-function rows as candidates.
const allLoc = [];
const locPorts = [];
for (const r of locodeRows) {
  if (!r.Coordinates || !r.Location) continue;
  const c = parseLocodeCoord(r.Coordinates);
  if (!c) continue;
  const item = {
    id: r.Country + r.Location,
    cc: r.Country,
    name: (EXONYMS[r.Name] ?? r.Name).split('/')[0].replace(/\s*\(.*?\)\s*$/, '').trim(),
    nameNorm: norm(r.NameWoDiacritics || r.Name),
    region: r.Subdivision ? subdivisions.get(`${r.Country}-${r.Subdivision}`) ?? '' : '',
    lat: c[0],
    lon: c[1],
    port: r.Function[0] === '1',
  };
  allLoc.push(item);
  if (item.port) locPorts.push(item);
}

// Simple grid index over all LOCODE points.
const LG = 0.5;
const locHash = new Map();
for (const l of allLoc) {
  const k = `${Math.floor(l.lat / LG)}:${Math.floor(l.lon / LG)}`;
  let a = locHash.get(k);
  if (!a) locHash.set(k, (a = []));
  a.push(l);
}
function nearbyLoc(lat, lon, radiusKm) {
  const out = [];
  const cy = Math.floor(lat / LG);
  const cx = Math.floor(lon / LG);
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const a = locHash.get(`${cy + dy}:${cx + dx}`);
      if (!a) continue;
      for (const l of a) {
        const d = km(lat, lon, l.lat, l.lon);
        if (d <= radiusKm) out.push([d, l]);
      }
    }
  return out.sort((a, b) => a[0] - b[0]);
}
function countryAt(lat, lon) {
  const near = nearbyLoc(lat, lon, 60).slice(0, 7);
  if (!near.length) return '';
  const votes = new Map();
  for (const [d, l] of near) votes.set(l.cc, (votes.get(l.cc) ?? 0) + 1 / (1 + d));
  return [...votes].sort((a, b) => b[1] - a[1])[0][0];
}

// Hand-checked harbours: the design's home waters plus well-known sailing harbours.
// [name, region, cc, lat, lon, size]
const CURATED = [
  ['Copenhagen', 'Hovedstaden', 'DK', 55.693, 12.599, 5],
  ['Klintholm', 'Møn', 'DK', 54.952, 12.468, 2],
  ['Gilleleje', 'Hovedstaden', 'DK', 56.1265, 12.311, 2],
  ['Helsingør', 'Hovedstaden', 'DK', 56.036, 12.615, 3],
  ['Dragør', 'Hovedstaden', 'DK', 55.593, 12.672, 2],
  ['Ystad', 'Skåne', 'SE', 55.424, 13.824, 3],
  ['Simrishamn', 'Skåne', 'SE', 55.556, 14.359, 2],
  ['Rønne', 'Bornholm', 'DK', 55.1, 14.692, 3],
  ['Halmstad', 'Halland', 'SE', 56.663, 12.854, 3],
  ['Marstrand', 'Västra Götaland', 'SE', 57.887, 11.587, 2],
  ['Sandhamn', 'Stockholm', 'SE', 59.287, 18.912, 2],
  ['Visby', 'Gotland', 'SE', 57.642, 18.287, 3],
  ['Mariehamn', 'Åland', 'AX', 60.097, 19.934, 3],
  ['Heiligenhafen', 'Schleswig-Holstein', 'DE', 54.374, 11.006, 2],
  ['Laboe', 'Schleswig-Holstein', 'DE', 54.404, 10.224, 2],
  ['Helgoland', 'Schleswig-Holstein', 'DE', 54.178, 7.89, 2],
  ['Den Helder', 'Noord-Holland', 'NL', 52.962, 4.779, 3],
  ['IJmuiden', 'Noord-Holland', 'NL', 52.462, 4.599, 3],
  ['Scheveningen', 'Zuid-Holland', 'NL', 52.103, 4.265, 2],
  ['Harlingen', 'Friesland', 'NL', 53.174, 5.414, 2],
  ['Vlieland', 'Friesland', 'NL', 53.295, 5.092, 2],
  ['West-Terschelling', 'Friesland', 'NL', 53.359, 5.219, 2],
  ['Ostend', 'West Flanders', 'BE', 51.233, 2.922, 3],
  ['Dover', 'Kent', 'GB', 51.117, 1.32, 4],
  ['Brighton Marina', 'East Sussex', 'GB', 50.811, -0.102, 2],
  ['Cowes', 'Isle of Wight', 'GB', 50.762, -1.297, 3],
  ['Lymington', 'Hampshire', 'GB', 50.757, -1.537, 2],
  ['Dartmouth', 'Devon', 'GB', 50.35, -3.577, 2],
  ['Falmouth', 'Cornwall', 'GB', 50.154, -5.066, 3],
  ['St Peter Port', 'Guernsey', 'GG', 49.456, -2.534, 3],
  ['Cherbourg', 'Normandy', 'FR', 49.645, -1.617, 3],
  ['Saint-Malo', 'Brittany', 'FR', 48.645, -2.025, 3],
  ['La Rochelle', 'Nouvelle-Aquitaine', 'FR', 46.155, -1.152, 3],
  ['Saint-Tropez', 'Var', 'FR', 43.272, 6.638, 2],
  ['Antibes', 'Alpes-Maritimes', 'FR', 43.585, 7.129, 2],
  ['Monaco', '', 'MC', 43.735, 7.423, 3],
  ['Portofino', 'Liguria', 'IT', 44.303, 9.21, 2],
  ['Palma', 'Mallorca', 'ES', 39.565, 2.633, 4],
  ['Ibiza', 'Balearic Islands', 'ES', 38.91, 1.44, 3],
  ['Mahón', 'Menorca', 'ES', 39.889, 4.265, 3],
  ['Porto Cervo', 'Sardinia', 'IT', 41.137, 9.536, 2],
  ['Split', 'Dalmatia', 'HR', 43.504, 16.44, 4],
  ['Hvar', 'Dalmatia', 'HR', 43.172, 16.441, 2],
  ['Dubrovnik', 'Dalmatia', 'HR', 42.661, 18.086, 3],
  ['Mykonos', 'Cyclades', 'GR', 37.45, 25.328, 2],
  ['Lefkada', 'Ionian Islands', 'GR', 38.832, 20.712, 2],
  ['Bodrum', 'Muğla', 'TR', 37.033, 27.429, 3],
  ['Valletta', '', 'MT', 35.897, 14.513, 4],
  ['Horta', 'Azores', 'PT', 38.532, -28.626, 2],
  ['Funchal', 'Madeira', 'PT', 32.644, -16.912, 3],
  ['Las Palmas', 'Gran Canaria', 'ES', 28.13, -15.425, 4],
  ['Mindelo', 'São Vicente', 'CV', 16.887, -24.99, 2],
  ['English Harbour', 'Antigua', 'AG', 17.007, -61.764, 2],
  ['Bridgetown', '', 'BB', 13.097, -59.617, 3],
  ['Newport', 'Rhode Island', 'US', 41.487, -71.316, 3],
  ['Annapolis', 'Maryland', 'US', 38.977, -76.484, 3],
  ['Nantucket', 'Massachusetts', 'US', 41.286, -70.095, 2],
  ['Key West', 'Florida', 'US', 24.556, -81.806, 3],
  ['Sausalito', 'California', 'US', 37.859, -122.485, 2],
  ['Arendal', 'Agder', 'NO', 58.461, 8.77, 2],
  ['Kristiansand', 'Agder', 'NO', 58.144, 7.995, 3],
  ['Bergen', 'Vestland', 'NO', 60.397, 5.321, 4],
  ['Ålesund', 'Møre og Romsdal', 'NO', 62.473, 6.153, 3],
  ['Svolvær', 'Lofoten', 'NO', 68.234, 14.568, 2],
  ['Auckland', 'Auckland', 'NZ', -36.84, 174.753, 4],
  ['Hobart', 'Tasmania', 'AU', -42.883, 147.336, 3],
  ['Chalong', 'Phuket', 'TH', 7.82, 98.347, 2],
  ['Papeete', 'Tahiti', 'PF', -17.535, -149.569, 3],
];

const candidates = [];
for (const [name, region, cc, lat, lon, size] of CURATED) {
  candidates.push({ id: 'x-' + norm(name).replace(/ /g, '-'), name, region, cc, lat, lon, size, prio: 0, maxCoastKm: 12 });
}

// Natural Earth entries that duplicate a curated harbour under another name.
const NE_SKIP = new Set(['Tuborg']);

const portsFC = JSON.parse(await fetchCached('ports'));
const SIZE_BY_RANK = { 3: 6, 4: 5, 5: 4, 6: 3, 7: 2, 8: 2 };
for (const f of portsFC.features) {
  const [lon, lat] = f.geometry.coordinates;
  const p = f.properties;
  if (NE_SKIP.has(p.name)) continue;
  const nn = norm(p.name.split('/')[0]);
  const cc = countryAt(lat, lon);
  // Borrow the accented name and subdivision from a matching UN/LOCODE port.
  const match = nearbyLoc(lat, lon, 40).find(([, l]) => l.cc === cc && l.nameNorm === nn);
  candidates.push({
    id: 'ne' + p.ne_id,
    name: match ? match[1].name : p.name.split('/')[0].trim(),
    region: match ? match[1].region : '',
    cc,
    lat,
    lon,
    size: SIZE_BY_RANK[p.scalerank] ?? 2,
    prio: 1,
    maxCoastKm: 10,
    locode: match ? match[1].id : null,
  });
}
const usedLocodes = new Set(candidates.map((c) => c.locode).filter(Boolean));
for (const l of locPorts) {
  if (usedLocodes.has(l.id)) continue;
  candidates.push({ id: l.id, name: l.name, region: l.region, cc: l.cc, lat: l.lat, lon: l.lon, size: 1, prio: 2, maxCoastKm: 3.5 });
}

candidates.sort((a, b) => a.prio - b.prio || b.size - a.size);
const kept = [];
const keptHash = new Map();
let droppedInland = 0;
let droppedDup = 0;
for (const c of candidates) {
  if (!c.name || /^[^A-Za-zÀ-ž]/.test(c.name)) continue;
  const coast = coastDistanceKm(c.lat, c.lon);
  if (coast > c.maxCoastKm) {
    droppedInland++;
    continue;
  }
  const k = `${Math.floor(c.lat / LG)}:${Math.floor(c.lon / LG)}`;
  let dup = false;
  const cy = Math.floor(c.lat / LG);
  const cx = Math.floor(c.lon / LG);
  outer: for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      for (const o of keptHash.get(`${cy + dy}:${cx + dx}`) ?? []) {
        const d = km(c.lat, c.lon, o.lat, o.lon);
        if (d < 2.5 || (d < 15 && norm(o.name) === norm(c.name))) {
          dup = true;
          break outer;
        }
      }
    }
  if (dup) {
    droppedDup++;
    continue;
  }
  kept.push(c);
  let a = keptHash.get(k);
  if (!a) keptHash.set(k, (a = []));
  a.push(c);
}

kept.sort((a, b) => b.size - a.size || a.name.localeCompare(b.name));
const portsOut = JSON.stringify({
  v: 1,
  source: 'Natural Earth ports, UN/LOCODE, hand-checked harbours',
  fields: ['id', 'name', 'region', 'cc', 'lat', 'lon', 'size'],
  ports: kept.map((c) => [c.id, c.name, c.region || '', c.cc || '', +c.lat.toFixed(4), +c.lon.toFixed(4), c.size]),
});
fs.writeFileSync(path.join(outDir, 'ports.json'), portsOut);
console.log(`ports: ${kept.length} kept (${droppedInland} inland, ${droppedDup} duplicates), ${(portsOut.length / 1e6).toFixed(2)} MB`);
