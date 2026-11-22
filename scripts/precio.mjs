// Carga un precio real de un local de comida en data/precios.json.
// Uso:
//   node scripts/precio.mjs "Ada's Restaurant" Cochrane 12000 20000 local
//   node scripts/precio.mjs "Café Tero" Cochrane 6000 9000 viajero "menú del día"
//   node scripts/precio.mjs --ver "Café Tero" Cochrane
//   node scripts/precio.mjs --quitar "Café Tero" Cochrane
// fuente: "local" (lo informó el negocio) o "viajero" (lo pagó alguien que comió ahí).
// "que" (opcional) es a qué corresponde el precio; por defecto "por persona".
import { readFile, writeFile } from 'node:fs/promises';

const RAIZ = new URL('../data/', import.meta.url);
const norm = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const args = process.argv.slice(2);
const modo = args[0] === '--ver' || args[0] === '--quitar' ? args.shift() : '--agregar';
const [nombre, pueblo, min, max, fuente = 'viajero', que = 'por persona'] = args;
if (!nombre || !pueblo || (modo === '--agregar' && !(+min > 0))) {
  console.log('Uso: node scripts/precio.mjs "Nombre del local" Pueblo MIN MAX [local|viajero] ["por persona"]');
  process.exit(1);
}

const { lugares } = JSON.parse(await readFile(new URL('lugares.json', RAIZ), 'utf8'));
const candidatos = lugares.filter(l => l.cat === 'comida' && norm(l.loc || '') === norm(pueblo) && norm(l.n).includes(norm(nombre)));
if (candidatos.length !== 1) {
  console.log(candidatos.length ? 'Hay varios, escribe el nombre más completo:' : 'No encontré "' + nombre + '" en ' + pueblo + '. Locales de comida ahí:');
  (candidatos.length ? candidatos : lugares.filter(l => l.cat === 'comida' && norm(l.loc || '') === norm(pueblo))).forEach(l => console.log('  ' + l.n + ' (' + l.sub + ')'));
  process.exit(1);
}
const l = candidatos[0];

const archivo = new URL('precios.json', RAIZ);
let datos = { precios: {} };
try { datos = JSON.parse(await readFile(archivo, 'utf8')); } catch {}

if (modo === '--ver') { console.log(l.n, JSON.stringify(datos.precios[l.id] || 'sin precios', null, 1)); process.exit(0); }
if (modo === '--quitar') delete datos.precios[l.id];
else {
  if (!['local', 'viajero'].includes(fuente)) { console.log('La fuente es "local" o "viajero"'); process.exit(1); }
  const a = Math.round(+min), b = Math.round(+(max || min));
  const e = datos.precios[l.id] || (datos.precios[l.id] = { n: l.n, loc: l.loc, reportes: [] });
  // Del local vale solo el último; de viajeros se juntan todos
  if (fuente === 'local') e.reportes = e.reportes.filter(r => r.fuente !== 'local');
  e.reportes.push({ min: Math.min(a, b), max: Math.max(a, b), que, fuente, fecha: new Date().toISOString().slice(0, 7) });
}
datos.actualizado = new Date().toISOString().slice(0, 10);
await writeFile(archivo, JSON.stringify(datos, null, 1) + '\n');
console.log(modo === '--quitar' ? 'Quitado:' : 'Guardado:', l.n, '(' + l.loc + ')', modo === '--quitar' ? '' : JSON.stringify(datos.precios[l.id].reportes.at(-1)));
