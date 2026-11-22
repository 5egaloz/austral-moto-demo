// Traza las rutas laterales de data/ramales.json: camino y km con OSRM, y % de ripio con la superficie
// de las vías en OpenStreetMap (Overpass). Guarda lo que va saliendo, así se puede volver a correr si
// Overpass falla (pasa seguido): solo calcula lo que falta.
//   node scripts/trazar-ramales.mjs            (solo lo que falta)
//   node scripts/trazar-ramales.mjs --todo     (recalcula todo)
import { readFile, writeFile } from 'node:fs/promises';

const archivo = new URL('../data/ramales.json', import.meta.url);
const R = JSON.parse(await readFile(archivo, 'utf8'));
const TODO = process.argv.includes('--todo');
const UA = {'User-Agent': 'Ruta7Moto/1.0 (github.com/5egaloz/austral-moto-demo) trazar-ramales.mjs'};
const OVERPASS = process.argv.includes('--solo-camino') ? [] : ['https://overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.private.coffee/api/interpreter', 'https://lz4.overpass-api.de/api/interpreter'];
const AUSTRAL = JSON.parse(await readFile(new URL('../data/ruta.json', import.meta.url), 'utf8')).linea;
// km de un punto a la línea de la Austral (a cada trazo, no solo a sus vértices: la línea está simplificada)
function aLaAustral(p){
  const fx = 111.32 * Math.cos(p[0] * Math.PI / 180), fy = 110.57; let min = Infinity;
  for (let i = 1; i < AUSTRAL.length; i++) {
    const [ay, ax] = AUSTRAL[i - 1], [by, bx] = AUSTRAL[i];
    const x1 = (ax - p[1]) * fx, y1 = (ay - p[0]) * fy, x2 = (bx - p[1]) * fx, y2 = (by - p[0]) * fy;
    const dx = x2 - x1, dy = y2 - y1, t = Math.max(0, Math.min(1, -(x1 * dx + y1 * dy) / ((dx * dx + dy * dy) || 1)));
    min = Math.min(min, Math.hypot(x1 + t * dx, y1 + t * dy));
  }
  return min;
}
const RIPIO = /^(gravel|fine_gravel|unpaved|dirt|ground|pebblestone|compacted|earth|sand|grass|rock)$/;
const PAV = /^(asphalt|paved|concrete|concrete:plates|paving_stones|chipseal|sett)$/;
const espera = ms => new Promise(r => setTimeout(r, ms));
const km = (a, b) => { const r = Math.PI / 180, x = Math.sin((b[0] - a[0]) * r / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin((b[1] - a[1]) * r / 2) ** 2; return 12742 * Math.asin(Math.sqrt(x)); };

// Douglas-Peucker en grados: 0,0004 son unos 40 m, suficiente para el mapa
function simplificar(pts, tol){
  if (pts.length < 3) return pts;
  const [a, b] = [pts[0], pts[pts.length - 1]]; let max = 0, idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const [y, x] = pts[i], dx = b[1] - a[1], dy = b[0] - a[0];
    const d = Math.abs(dy * x - dx * y + b[1] * a[0] - b[0] * a[1]) / (Math.hypot(dx, dy) || 1);
    if (d > max) { max = d; idx = i; }
  }
  if (max <= tol) return [a, b];
  return simplificar(pts.slice(0, idx + 1), tol).slice(0, -1).concat(simplificar(pts.slice(idx), tol));
}

async function overpass(q){
  for (let ronda = 0; ronda < (OVERPASS.length ? 4 : 0); ronda++) for (const ep of OVERPASS) {
    try {
      const r = await fetch(ep, {method:'POST', headers:{...UA, 'Content-Type':'application/x-www-form-urlencoded'}, body:'data=' + encodeURIComponent(q), signal:AbortSignal.timeout(120000)});
      if (r.ok) return await r.json();
      console.log('  Overpass', r.status, ep);
    } catch (e) { console.log('  Overpass', e.message, ep); }
    await espera(15000);
  }
  return null;
}

for (const r of R.ramales) {
  if (!TODO && r.km && r.ripio !== undefined) continue;
  if (!TODO && r.km && r.linea && process.argv.includes('--solo-camino')) continue;
  const o = await (await fetch('https://router.project-osrm.org/route/v1/driving/' + r.puntos.map(p => p[1] + ',' + p[0]).join(';') + '?overview=full&geometries=geojson&steps=true', {headers:UA})).json();
  if (o.code !== 'Ok') { console.log(r.id, 'OSRM', o.code); continue; }
  const ruta = o.routes[0];
  r.km = Math.round(ruta.distance / 1000);
  r.balsa = ruta.legs.some(l => l.steps.some(s => s.mode === 'ferry'));
  // km de cada pueblo desde el cruce con la Austral
  let acc = 0; const pts = ruta.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
  const kmPunto = pts.map((p, i) => (acc += i ? km(pts[i - 1], p) : 0));
  r.pueblos.forEach(pb => { let mejor = 0, d = Infinity; pts.forEach((p, i) => { const k = km(p, [pb.lat, pb.lng]); if (k < d) { d = k; mejor = i; } }); pb.km = Math.round(kmPunto[mejor]); });
  // Solo se dibuja desde 'dibujarDesde' (índice de 'puntos' o [lat, lng]) (para no repetir un tramo que ya dibuja otro ramal)
  let ini = 0, fin = pts.length - 1;
  if (r.dibujarDesde) { let d = Infinity; pts.forEach((p, i) => { const k = km(p, Array.isArray(r.dibujarDesde) ? r.dibujarDesde : r.puntos[r.dibujarDesde]); if (k < d) { d = k; ini = i; } }); }
  // 'recortar': el ramal sale de un pueblo pero comparte un trozo con la Austral; se dibuja desde
  // donde se separa de ella (a más de 300 m), y ese punto queda como el cruce
  if (r.recortar) {
    ini = pts.findIndex(p => aLaAustral(p) > 0.3);
    ini = Math.max(0, ini - 1);
    r.cruce = {lat:+pts[ini][0].toFixed(5), lng:+pts[ini][1].toFixed(5), km:Math.round(kmPunto[ini])};
    // Ramal que vuelve a la Austral ('hasta' es un pueblo de la ruta): tampoco se dibuja el trozo final compartido
    if (r.hasta) {
      for (fin = pts.length - 1; fin > ini && aLaAustral(pts[fin]) <= 0.3; fin--);
      fin = Math.min(pts.length - 1, fin + 1);
      r.vuelta = {lat:+pts[fin][0].toFixed(5), lng:+pts[fin][1].toFixed(5), km:Math.round(kmPunto[fin])};
    }
  }
  r.linea = simplificar(pts.slice(ini, fin + 1), 0.0004).map(([a, b]) => [+a.toFixed(5), +b.toFixed(5)]);
  await writeFile(archivo, JSON.stringify(R, null, 1));   // camino y km quedan guardados aunque Overpass falle
  // Ripio: superficie de la vía OSM más cercana a cada trozo del camino
  const las = pts.map(p => p[0]), los = pts.map(p => p[1]);
  const w = await overpass(`[out:json][timeout:90];way[highway~"^(trunk|primary|secondary|tertiary|unclassified)$"](${Math.min(...las) - .01},${Math.min(...los) - .01},${Math.max(...las) + .01},${Math.max(...los) + .01});out tags geom;`);
  if (!w) { console.log(r.id, r.km, 'km; sin ripio (Overpass no respondió)'); await writeFile(archivo, JSON.stringify(R, null, 1)); continue; }
  const refs = {};
  const vias = w.elements.map(e => ({ref: e.tags.ref || '', s: e.tags.surface || '', g: e.geometry.map(n => [n.lat, n.lon])}));
  let rip = 0, pav = 0, sin = 0;
  for (let i = 1; i < pts.length; i++) {
    const m = [(pts[i - 1][0] + pts[i][0]) / 2, (pts[i - 1][1] + pts[i][1]) / 2], largo = km(pts[i - 1], pts[i]);
    if (r.recortar && (i <= ini || i > fin)) continue;   // el trozo compartido con la Austral no cuenta
    let s = '', d = 0.3, ref = '';
    vias.forEach(v => v.g.forEach(n => { const k = km(m, n); if (k < d) { d = k; s = v.s; ref = v.ref; } }));
    refs[ref || 'sin ref'] = (refs[ref || 'sin ref'] || 0) + largo;
    if (RIPIO.test(s)) rip += largo; else if (PAV.test(s)) pav += largo; else sin += largo;
  }
  // Si menos de 2/3 del camino tiene dato de superficie, no se publica un porcentaje
  r.ripio = (rip + pav) / (rip + pav + sin) >= 2 / 3 ? Math.round(100 * rip / (rip + pav)) : null;
  r.ripioDato = Math.round(100 * (rip + pav) / (rip + pav + sin));
  r.generado = new Date().toISOString().slice(0, 10);
  console.log(r.id, r.km, 'km, ripio', r.ripio, '% (con dato:', r.ripioDato, '%)', r.balsa ? 'con balsa' : '', r.pueblos.map(p => p.n + ' km ' + p.km).join(', '), r.cruce ? '| cruce km ' + r.cruce.km : '', '| rutas OSM:', Object.entries(refs).map(([k, v]) => k + ' ' + Math.round(v)).join(', '));
  await writeFile(archivo, JSON.stringify(R, null, 1));
  await espera(3000);
}
