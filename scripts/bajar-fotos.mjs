// Guarda en fotos/ una copia de 500 px de cada foto de Wikimedia Commons que usa la página.
// Así la página no depende de que Wikimedia deje cargar ~50 fotos seguidas (responde 429 si son muchas).
// Las fotos grandes del visor siguen viniendo de Wikimedia, de a una.
//   node scripts/bajar-fotos.mjs      (solo baja las que faltan)
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';

const raiz = new URL('../', import.meta.url);
const leer = async f => JSON.parse(await readFile(new URL(f, raiz), 'utf8'));
const F = await leer('data/fotos.json'), L = await leer('data/lugares.json'), D = await leer('data/desvios.json');

// Mismo nombre que calcula index.html (función archivoLocal)
export const archivoLocal = u => decodeURIComponent(u.split('?')[0].split('/').pop().replace(/^\d+px-/, ''))
  .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_').slice(-120);
// upload.wikimedia.org: thumb.wikimedia.org responde 429 mucho antes
const a500 = u => u.split('?')[0].replace('//thumb.wikimedia.org/', '//upload.wikimedia.org/').replace(/\/\d+px-/, '/500px-');

const urls = new Set([
  ...F.lugares.map(l => l.foto?.url),
  ...Object.values(F.ruta || {}).map(f => f.url),
  ...Object.values(F.pueblos || {}).map(f => f.url),
  ...L.lugares.map(l => l.foto?.url),
  ...D.desvios.flatMap(d => (d.fotos || []).map(f => f.url)),
].filter(Boolean));

await mkdir(new URL('fotos/', raiz), { recursive: true });
// Wikimedia pide identificarse con una forma de contacto y no hacer ráfagas
const UA = 'Ruta7Moto/1.0 (https://github.com/5egaloz/austral-moto-demo) bajar-fotos.mjs';
const espera = ms => new Promise(r => setTimeout(r, ms));
let nuevas = 0, fallas = [];
for (const u of urls) {
  const destino = new URL('fotos/' + archivoLocal(u), raiz);
  try { await access(destino); continue; } catch {}
  let ok = false;
  for (let intento = 0; intento < 5 && !ok; intento++) {
    const r = await fetch(a500(u), { headers: { 'User-Agent': UA } });
    if (r.status === 429) { await espera(20000 * (intento + 1)); continue; }
    if (!r.ok) { fallas.push(r.status + ' ' + u); break; }
    await writeFile(destino, Buffer.from(await r.arrayBuffer()));
    ok = true; nuevas++;
  }
  await espera(3000);
}
console.log('Fotos:', urls.size, '| nuevas:', nuevas, '| fallas:', fallas.length);
fallas.forEach(f => console.log('  ', f));
