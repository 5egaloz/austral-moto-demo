// Guía offline pagada: un GPX (ruta, rutas laterales y puntos) y un PDF para imprimir o llevar en el teléfono.
// Sale FUERA del repo público, en ../ruta7moto-guia/, porque es lo que se vende.
// Uso: node scripts/guia-offline.mjs   (el PDF lo imprime Chrome o Edge sin ventana)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const salida = resolve(raiz, '..', 'ruta7moto-guia');
mkdirSync(salida, { recursive: true });
const leer = f => JSON.parse(readFileSync(join(raiz, 'data', f), 'utf8'));
const ruta = leer('ruta.json'), ramales = leer('ramales.json').ramales, bencina = leer('bencina.json'), lugares = leer('lugares.json').lugares;

// PUEBLOS y TRAMOS viven en index.html: se leen de ahí para no tener dos copias
const html = readFileSync(join(raiz, 'index.html'), 'utf8');
const bloque = nombre => {
  const i = html.indexOf('const ' + nombre + ' = ['), f = html.indexOf('\n];', i);
  return new Function('t', 'return ' + html.slice(i + nombre.length + 9, f + 3))(s => s);
};
const PUEBLOS = bloque('PUEBLOS'), TRAMOS = bloque('TRAMOS');
const kmDe = n => PUEBLOS.find(p => p.n === n).km;
TRAMOS.forEach(t => t.km = kmDe(t.b) - kmDe(t.a));

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
const precios = e => e.comb.map(c => c.t + ' $' + c.precio.toLocaleString('es-CL')).join(' · ');
const fechaPrecios = bencina.generado;
// Balsas que importan para la ruta (el resto de lugares.json son muelles y caletas)
const BALSAS = ['Puerto Yungay', 'Río Bravo', 'Ferry a Chile Chico', 'Embarcadero Chile Chico', 'Caleta Gonzalo', 'Barcaza Rio Palena'];
const balsas = lugares.filter(l => l.cat === 'balsa' && BALSAS.includes(l.n));
const talleres = lugares.filter(l => l.cat === 'taller');

/* ---------- GPX ---------- */
const wpt = (lat, lng, nombre, desc, sym) =>
  `  <wpt lat="${lat}" lon="${lng}"><name>${esc(nombre)}</name>${desc ? `<desc>${esc(desc)}</desc>` : ''}<sym>${sym}</sym></wpt>`;
const trk = (nombre, desc, linea) =>
  `  <trk><name>${esc(nombre)}</name><desc>${esc(desc)}</desc><trkseg>\n${linea.map(([la, lo]) => `    <trkpt lat="${la}" lon="${lo}"/>`).join('\n')}\n  </trkseg></trk>`;
const gpx = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<gpx version="1.1" creator="Ruta 7 Moto" xmlns="http://www.topografix.com/GPX/1/1">',
  `  <metadata><name>Carretera Austral en moto, Chaitén a Villa O'Higgins</name><desc>Ruta 7 Moto. Camino: OpenStreetMap (ODbL). Bencina: CNE, precios al ${fechaPrecios}.</desc></metadata>`,
  ...PUEBLOS.map(p => wpt(p.lat, p.lng, `${p.n} (km ${p.km})`, p.t, 'City')),
  ...bencina.estaciones.map(e => wpt(e.lat, e.lng, 'Bencina ' + e.comuna, [e.direccion, precios(e), e.horario].filter(Boolean).join('. '), 'Gas Station')),
  ...talleres.map(l => wpt(l.lat, l.lng, l.n, [l.sub, l.loc, l.tel].filter(Boolean).join('. '), 'Car Repair')),
  ...balsas.map(l => wpt(l.lat, l.lng, 'Balsa ' + l.n, [l.loc, l.aviso].filter(Boolean).join('. '), 'Anchor')),
  trk('Carretera Austral (Ruta 7)', `Chaitén a Villa O'Higgins, ${kmDe("Villa O'Higgins")} km`, ruta.linea),
  ...ramales.filter(r => r.linea).map(r => trk(r.n, `${r.ruta}, ${r.km} km desde ${r.desde}`, r.linea)),
  '</gpx>', ''
].join('\n');
writeFileSync(join(salida, 'ruta7moto.gpx'), gpx);

/* ---------- PDF (HTML impreso por el navegador) ---------- */
// Bencineras a menos de 4 km del pueblo (la comuna de la CNE no siempre es el nombre del pueblo)
const kmEntre = (a, b) => { const r = Math.PI / 180, x = Math.sin((b.lat - a.lat) * r / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin((b.lng - a.lng) * r / 2) ** 2; return 12742 * Math.asin(Math.sqrt(x)); };
const bencinaDe = p => bencina.estaciones.filter(e => kmEntre(p, e) < 4);
// Alojamientos con nombre propio primero, y los que tienen teléfono antes
const GENERICO = /^(hospedaje|hostal|cabañas?|camping( libre)?|refugio|campamento|hostel( casa)?)$/i;
const ordenar = ls => ls.filter(l => !GENERICO.test(l.n.trim())).sort((a, b) => !!b.tel - !!a.tel);
const deCat = (cat, loc) => lugares.filter(l => l.cat === cat && l.loc === loc);
const fichaPueblo = p => {
  const b = bencinaDe(p), tl = deCat('taller', p.n), al = ordenar(deCat('alojamiento', p.n));
  return `<section class="pueblo"><h3><span>km ${p.km}</span> ${esc(p.n)}</h3>
    ${p.t ? `<p>${esc(p.t)}</p>` : ''}
    <p><b>Bencina:</b> ${b.length ? b.map(e => `${esc(e.direccion)}: ${esc(precios(e))}${e.horario ? ` (${esc(e.horario)})` : ''}`).join('<br>') : p.diesel ? 'solo diésel' : p.balsa ? 'no hay, es la balsa' : 'no hay'}</p>
    ${tl.length ? `<p><b>Talleres:</b> ${tl.map(l => esc(l.n) + (l.tel ? ' ' + esc(l.tel) : '')).join(' · ')}</p>` : ''}
    ${al.length ? `<p><b>Alojamiento:</b> ${al.slice(0, 12).map(l => esc(l.n) + (l.tel ? ' ' + esc(l.tel) : '')).join(' · ')}${al.length > 12 ? ` y ${al.length - 12} más en el directorio` : ''}</p>` : ''}
  </section>`;
};
const fichaTramo = t => `<section class="tramo"><h2>${esc(t.a)} a ${esc(t.b)}</h2>
  <p class="datos">${t.km} km · cerca de ${t.ripio}% ripio · dificultad ${esc(t.dif)} · mejor de ${esc(t.temp)}</p>
  <ul>${t.ojo.map(o => `<li>${esc(o)}</li>`).join('')}</ul>
  ${PUEBLOS.filter(p => (p.km > kmDe(t.a) || p.km === kmDe(t.a) && p.km === 0) && p.km <= kmDe(t.b)).map(fichaPueblo).join('')}
  ${ramales.filter(r => { const k = kmDe(r.desde); return k >= kmDe(t.a) && k < kmDe(t.b); }).map(r =>
    `<section class="ramal"><h3>Ruta lateral: ${esc(r.n)}</h3><p class="datos">${esc(r.ruta)} · ${r.km} km desde ${esc(r.desde)} · ${r.ripio != null ? `cerca de ${r.ripio}% ripio` : 'ripio por confirmar'}${r.balsa ? ' · con balsa' : ''}</p>
    <p>Pueblos: ${r.pueblos.map(p => `${esc(p.n)} (km ${p.km}${p.bencina ? ', bencina' : ''})`).join(', ')}</p></section>`).join('')}
</section>`;
const doc = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Ruta 7 Moto: guía offline</title><style>
@page{size:A4;margin:14mm 13mm}
body{font:10.5pt/1.45 "Segoe UI",Arial,sans-serif;color:#1E2124}
h1{font-size:24pt;margin:0 0 4mm;color:#0B5D3B}
h2{font-size:15pt;margin:8mm 0 1mm;padding-top:2mm;border-top:3px solid #0B5D3B;break-after:avoid}
h3{font-size:11.5pt;margin:4mm 0 1mm;break-after:avoid}
h3 span{display:inline-block;min-width:16mm;color:#0B5D3B}
p{margin:0 0 1.5mm}.datos{color:#555}
ul{margin:1mm 0 2mm;padding-left:5mm}li{margin:.5mm 0}
.pueblo,.ramal{break-inside:avoid}.ramal{border-left:3px solid #E0A800;padding-left:3mm;margin:3mm 0}
table{border-collapse:collapse;width:100%;margin:2mm 0}td,th{border-bottom:1px solid #ccc;padding:1mm 2mm;text-align:left}
.pie{font-size:8.5pt;color:#666;margin-top:8mm}
</style></head><body>
<h1>Carretera Austral en moto</h1>
<p><b>Chaitén a Villa O'Higgins, ${kmDe("Villa O'Higgins")} km.</b> Guía offline de Ruta 7 Moto: lo que necesitas cuando no hay señal. Úsala junto al archivo <b>ruta7moto.gpx</b> (ábrelo en OsmAnd, Organic Maps, Gaia o tu GPS).</p>
<h2>Bencina: distancia a la siguiente</h2>
<table><tr><th>Desde</th><th>Hasta</th><th>km sin bencina</th></tr>
${PUEBLOS.filter(p => p.bencina).map((p, i, a) => a[i + 1] ? `<tr><td>${esc(p.n)}</td><td>${esc(a[i + 1].n)}</td><td>${a[i + 1].km - p.km}</td></tr>` : '').join('')}
</table>
<p>Entre Cochrane y Villa O'Higgins: <b>carga en Caleta Tortel</b>, la única bencina en esos 230 km. Es ir a cargar y volver, sin balsa: el cruce está 103 km al sur de Cochrane, antes de Puerto Yungay, y son 23 km hasta el pueblo.</p>
${TRAMOS.map(fichaTramo).join('')}
<p class="pie">Precios de bencina: CNE, Bencina en Línea, al ${fechaPrecios}. Camino, km y lugares: © colaboradores de OpenStreetMap (ODbL). Horarios, precios y teléfonos cambian: confirma antes de ir. Ruta 7 Moto, Coyhaique.</p>
</body></html>`;
const htmlGuia = join(salida, 'guia.html');
writeFileSync(htmlGuia, doc);

const nav = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
if (nav) {
  execFileSync(nav, ['--headless=new', '--disable-gpu', '--no-pdf-header-footer', '--print-to-pdf=' + join(salida, 'ruta7moto-guia.pdf'), 'file:///' + htmlGuia.replace(/\\/g, '/')], { stdio: 'ignore' });
  console.log('PDF listo');
} else console.log('No encontré Chrome ni Edge: abre guia.html y guárdalo como PDF');
console.log('GPX:', PUEBLOS.length + bencina.estaciones.length + talleres.length + balsas.length, 'puntos,', 1 + ramales.filter(r => r.linea).length, 'trazados. Salida en', salida);
