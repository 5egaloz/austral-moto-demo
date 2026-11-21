// Trazado real de la Ruta 7 entre los pueblos de la hoja y km por camino desde Chaitén.
// Usa OSRM (router.project-osrm.org, datos de OpenStreetMap) y guarda data/ruta.json.
//   node scripts/trazar-ruta.mjs
// Los pueblos se leen de la constante PUEBLOS de index.html, así hay una sola lista.
import { readFile, writeFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const PUEBLOS = Function('return ' + html.match(/const PUEBLOS = (\[[\s\S]*?\]);/)[1])();

const coords = PUEBLOS.map(p => p.lng + ',' + p.lat).join(';');
const r = await fetch('https://router.project-osrm.org/route/v1/driving/' + coords + '?overview=full&geometries=geojson');
const j = await r.json();
if (j.code !== 'Ok') throw new Error('OSRM: ' + j.code + ' ' + (j.message || ''));

// Douglas-Peucker en grados: 0,0004 son unos 40 m, suficiente para el mapa
function simplificar(pts, tol){
  if (pts.length < 3) return pts;
  const [a, b] = [pts[0], pts[pts.length - 1]];
  let max = 0, idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const [x, y] = pts[i], dx = b[0] - a[0], dy = b[1] - a[1];
    const d = Math.abs(dy * x - dx * y + b[0] * a[1] - b[1] * a[0]) / (Math.hypot(dx, dy) || 1);
    if (d > max) { max = d; idx = i; }
  }
  if (max <= tol) return [a, b];
  return simplificar(pts.slice(0, idx + 1), tol).slice(0, -1).concat(simplificar(pts.slice(idx), tol));
}
const linea = simplificar(j.routes[0].geometry.coordinates, 0.0004).map(([lng, lat]) => [+lat.toFixed(5), +lng.toFixed(5)]);

let acc = 0;
const km = { [PUEBLOS[0].n]: 0 };
j.routes[0].legs.forEach((l, i) => { acc += l.distance / 1000; km[PUEBLOS[i + 1].n] = Math.round(acc); });

await writeFile(new URL('../data/ruta.json', import.meta.url), JSON.stringify({
  generado: new Date().toISOString().slice(0, 10),
  fuente: 'OSRM sobre OpenStreetMap',
  km, linea,
}));
console.log('Puntos:', j.routes[0].geometry.coordinates.length, '→', linea.length);
console.log(km);
