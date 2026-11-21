// Baja de OpenStreetMap los lugares útiles para motoqueros en Aysén (y la provincia de Palena),
// busca fotos libres en Wikimedia Commons para los atractivos y escribe data/lugares.json.
// Uso: node scripts/actualizar-datos.mjs
import { sumarExtra } from './localidades.mjs';
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { aplicarCorrecciones } from './aplicar-correcciones.mjs';

const UA = 'Ruta7Moto/0.1 (demo web Carretera Austral; github.com/5egaloz/austral-moto-demo)';
const OVERPASS = [
  'https://lz4.overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const COMMONS = 'https://commons.wikimedia.org/w/api.php';
const WIKIDATA = 'https://www.wikidata.org/w/api.php';

// Polígono aproximado del lado chileno: provincia de Palena + Región de Aysén (lat lng).
// Se usa en vez de buscar la región por nombre porque algunos servidores no tienen ese índice.
// El borde oeste del norte va por el golfo de Ancud para dejar fuera Chiloé.
const POLY_PTS = [
  [-42.55,-73.2],[-42.55,-72.05],[-43.0,-71.72],[-43.6,-71.72],[-44.1,-71.68],[-44.5,-71.45],
  [-45.0,-71.33],[-45.6,-71.33],[-46.0,-71.6],[-46.3,-71.66],[-46.7,-71.68],[-47.0,-71.9],
  [-47.3,-71.95],[-47.7,-72.25],[-48.1,-72.35],[-48.6,-72.5],[-49.25,-73.1],[-49.25,-75.9],[-46.5,-75.9],[-43.6,-75.0],[-43.6,-73.2],
];
const POLY = POLY_PTS.map(p => p.join(' ')).join(' ');

// Punto dentro del polígono (sirve también para filtrar lo que ya está en caché)
function dentro(lat, lng) {
  let ok = false;
  for (let i = 0, j = POLY_PTS.length - 1; i < POLY_PTS.length; j = i++) {
    const [yi, xi] = POLY_PTS[i], [yj, xj] = POLY_PTS[j];
    if ((yi > lat) !== (yj > lat) && lng < (xj - xi) * (lat - yi) / (yj - yi) + xi) ok = !ok;
  }
  return ok;
}

// Consultas chicas por separado: los servidores públicos rechazan una sola consulta grande
const PARTES = [
  `node["place"~"^(city|town|village)$"](poly:"${POLY}");`,
  `nwr["amenity"~"^(fuel|ferry_terminal|car_repair)$"](poly:"${POLY}");nwr["shop"~"^(car_repair|tyres|motorcycle|motorcycle_repair)$"](poly:"${POLY}");`,
  `nwr["tourism"~"^(hotel|hostel|guest_house|motel|camp_site|chalet|apartment|alpine_hut)$"](poly:"${POLY}");`,
  `nwr["tourism"~"^(viewpoint|attraction|museum)$"]["name"](poly:"${POLY}");nwr["natural"~"^(waterfall|glacier|hot_spring|cave_entrance)$"]["name"](poly:"${POLY}");nwr["waterway"="waterfall"]["name"](poly:"${POLY}");`,
  `nwr["leisure"="nature_reserve"]["name"](poly:"${POLY}");nwr["boundary"~"^(national_park|protected_area)$"]["name"](poly:"${POLY}");nwr["natural"~"^(peak|volcano)$"]["wikidata"](poly:"${POLY}");`,
];

const espera = ms => new Promise(r => setTimeout(r, ms));
const sh = promisify(execFile);

// Se usa curl porque el fetch de Node corta la conexión a los 10 s y Overpass suele tardar más en aceptar
async function consulta(cuerpo) {
  const q = '[out:json][timeout:180];(' + cuerpo + ');out tags center qt;';
  for (let intento = 0; intento < 4; intento++) {
    for (const url of OVERPASS) {
      try {
        const { stdout } = await sh('curl', ['-s', '-m', '240', '-A', UA, url, '--data-urlencode', 'data=' + q], { maxBuffer: 64 << 20 });
        if (stdout.startsWith('{')) { const j = JSON.parse(stdout); if (!j.remark?.includes('error') && j.elements.length) return j.elements; }
        console.log('  ', url, stdout.slice(0, 60).replace(/s+/g, ' '));
      } catch (e) { console.log('  ', url, e.message.slice(0, 60)); }
    }
    await espera(20_000 * (intento + 1));
  }
  throw new Error('Ningún servidor Overpass respondió');
}

async function overpass() {
  const todo = [];
  // Cada parte se guarda en data/.cache: si el proceso se corta, al volver a correrlo sigue donde quedó
  const cache = new URL('../data/.cache/', import.meta.url);
  await mkdir(cache, { recursive: true });
  for (const [i, p] of PARTES.entries()) {
    const archivo = new URL('parte-' + (i + 1) + '.json', cache);
    let els;
    try { els = JSON.parse(await readFile(archivo, 'utf8')); console.log('Parte', i + 1, 'desde caché'); }
    catch { els = await consulta(p); await writeFile(archivo, JSON.stringify(els)); }
    console.log('Parte', i + 1, 'de', PARTES.length + ':', els.length, 'elementos');
    todo.push(...els);
  }
  return todo;
}

async function api(base, params) {
  const u = base + '?' + new URLSearchParams({ format: 'json', origin: '*', ...params });
  for (let i = 0; i < 5; i++) {
    try {
      const r = await fetch(u, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60_000) });
      if (r.ok) return await r.json();
    } catch { /* corte de red: se reintenta */ }
    await espera(10000 * (i + 1));
  }
  console.log('   sin respuesta de', base.split('/')[2], '- se salta');
  return {};
}

// Distancia en km entre dos puntos
function km(a, b) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function clasificar(t) {
  if (t.amenity === 'fuel') return ['bencina', 'Bencinera'];
  if (t.amenity === 'ferry_terminal') return ['balsa', 'Terminal de balsa'];
  if (t.shop === 'tyres') return ['taller', 'Gomería'];
  if (t.shop === 'motorcycle' || t.shop === 'motorcycle_repair') return ['taller', 'Motos'];
  if (t.shop === 'car_repair' || t.amenity === 'car_repair') return ['taller', 'Taller mecánico'];
  const aloj = { hotel: 'Hotel', hostel: 'Hostal', guest_house: 'Hospedaje', motel: 'Motel', camp_site: 'Camping', chalet: 'Cabañas', apartment: 'Departamento', alpine_hut: 'Refugio' };
  if (aloj[t.tourism]) return ['alojamiento', aloj[t.tourism]];
  if (t.tourism === 'viewpoint') return ['atractivo', 'Mirador'];
  if (t.tourism === 'museum') return ['atractivo', 'Museo'];
  if (t.natural === 'waterfall' || t.waterway === 'waterfall') return ['atractivo', 'Cascada'];
  if (t.natural === 'glacier') return ['atractivo', 'Glaciar'];
  if (t.natural === 'hot_spring') return ['atractivo', 'Termas'];
  if (t.natural === 'cave_entrance') return ['atractivo', 'Cueva'];
  if (t.natural === 'peak' || t.natural === 'volcano') return ['atractivo', t.natural === 'volcano' ? 'Volcán' : 'Cerro'];
  if (t.leisure === 'nature_reserve' || t.boundary) return ['atractivo', 'Parque o reserva'];
  if (t.tourism === 'attraction') return ['atractivo', 'Atractivo'];
  return [null];
}

// --- Fotos ---------------------------------------------------------------
const limpiarHtml = s => (s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const LIBRE = /^(cc0|cc[ -]by|public domain|pd|attribution|gfdl|fal)/i;

async function infoArchivos(titulos) {
  const out = {};
  for (let i = 0; i < titulos.length; i += 40) {
    const j = await api(COMMONS, {
      action: 'query', titles: titulos.slice(i, i + 40).join('|'),
      prop: 'imageinfo', iiprop: 'url|extmetadata|mime', iiurlwidth: '720',
    });
    const norms = Object.fromEntries((j.query?.normalized || []).map(n => [n.to, n.from]));
    for (const p of Object.values(j.query?.pages || {})) {
      const ii = p.imageinfo?.[0];
      if (!ii || !/^image\/(jpeg|png|webp)/.test(ii.mime)) continue;
      const m = ii.extmetadata || {};
      const lic = limpiarHtml(m.LicenseShortName?.value);
      if (!LIBRE.test(lic)) continue;
      out[norms[p.title] || p.title] = out[p.title] = {
        url: ii.thumburl || ii.url,
        autor: limpiarHtml(m.Artist?.value).slice(0, 80) || 'Autor desconocido',
        licencia: lic,
        fuente: ii.descriptionurl,
      };
    }
    await espera(1000);
  }
  return out;
}

async function fotos(atractivos) {
  // Lo encontrado se guarda en data/.cache/fotos.json: volver a correr no repite la búsqueda
  const archivoCache = new URL('../data/.cache/fotos.json', import.meta.url);
  let previo = {};
  try { previo = JSON.parse(await readFile(archivoCache, 'utf8')); } catch {}
  if (previo.titulos) {
    console.log('Fotos desde caché');
    const info = previo.info;
    let n = 0;
    for (const a of atractivos) { const f = info[previo.titulos[a.id]]; if (f) { a.foto = f; n++; } }
    return n;
  }
  const titulo = new Map(); // id -> 'File:...'

  // 1. Wikidata P18
  const conWd = atractivos.filter(a => a._wd);
  for (let i = 0; i < conWd.length; i += 50) {
    const lote = conWd.slice(i, i + 50);
    const j = await api(WIKIDATA, { action: 'wbgetentities', ids: lote.map(a => a._wd).join('|'), props: 'claims' });
    for (const a of lote) {
      const f = j.entities?.[a._wd]?.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
      if (f) titulo.set(a.id, 'File:' + f);
    }
    await espera(1000);
  }

  // 2. Etiqueta wikimedia_commons o image apuntando a Commons
  for (const a of atractivos) {
    if (titulo.has(a.id)) continue;
    const wc = a._commons || '';
    if (wc.startsWith('File:')) titulo.set(a.id, wc);
    else if (wc.startsWith('Category:')) {
      const j = await api(COMMONS, { action: 'query', list: 'categorymembers', cmtitle: wc, cmtype: 'file', cmlimit: '5' });
      const f = j.query?.categorymembers?.find(m => /\.(jpe?g|png|webp)$/i.test(m.title));
      if (f) titulo.set(a.id, f.title);
      await espera(200);
    } else if (/commons\.wikimedia\.org\/wiki\/File:/.test(a._image || '')) {
      titulo.set(a.id, decodeURIComponent(a._image.split('/wiki/')[1]).replace(/_/g, ' '));
    }
  }

  // 3. Fotos geolocalizadas cerca del punto cuyo título nombra el lugar
  for (const a of atractivos) {
    if (titulo.has(a.id)) continue;
    const palabras = norm(a.n).split(/[^a-z0-9]+/).filter(w => w.length > 3 && !['cerro', 'mirador', 'parque', 'nacional', 'reserva', 'salto', 'cascada', 'lago', 'glaciar', 'ventisquero', 'puerto', 'villa', 'monumento', 'natural'].includes(w));
    if (!palabras.length) continue;
    const j = await api(COMMONS, { action: 'query', list: 'geosearch', gscoord: a.lat + '|' + a.lng, gsradius: '2000', gsnamespace: '6', gslimit: '30' });
    const f = (j.query?.geosearch || []).find(g => /\.(jpe?g|png|webp)$/i.test(g.title) && palabras.some(w => norm(g.title).includes(w)));
    if (f) titulo.set(a.id, f.title);
    await espera(1200);
  }

  const info = await infoArchivos([...new Set(titulo.values())]);
  await writeFile(archivoCache, JSON.stringify({ titulos: Object.fromEntries(titulo), info }));
  let n = 0;
  for (const a of atractivos) {
    const f = info[titulo.get(a.id)];
    if (f) { a.foto = f; n++; }
  }
  return n;
}

// --- Principal -----------------------------------------------------------
const els = (await overpass()).filter(e => { const lat = e.lat ?? e.center?.lat, lng = e.lon ?? e.center?.lon; return lat != null && dentro(lat, lng); });
console.log('Elementos OSM:', els.length);

const pueblos = sumarExtra(els
  .filter(e => e.tags?.place && e.tags.name)
  .map(e => ({ n: e.tags.name, lat: e.lat ?? e.center.lat, lng: e.lon ?? e.center.lon, peso: { city: 3, town: 2, village: 1 }[e.tags.place] })));

const vistos = new Set();
const lugares = [];
for (const e of els) {
  const t = e.tags || {};
  if (t.place) continue;
  const [cat, sub] = clasificar(t);
  if (!cat) continue;
  const lat = e.lat ?? e.center?.lat, lng = e.lon ?? e.center?.lon;
  if (lat == null) continue;
  let n = t.name || (cat === 'bencina' ? 'Bencinera' + (t.brand ? ' ' + t.brand : '') : null);
  if (!n) continue;
  const clave = norm(n) + '|' + lat.toFixed(2) + lng.toFixed(2);
  if (vistos.has(clave)) continue;
  vistos.add(clave);

  // Pueblo más cercano (los grandes ganan un poco de margen)
  let cerca = null, dist = Infinity;
  for (const p of pueblos) {
    const d = km({ lat, lng }, p) - p.peso * 1.5;
    if (d < dist) { dist = d; cerca = p; }
  }
  const dReal = cerca ? km({ lat, lng }, cerca) : null;

  const l = {
    id: e.type[0] + e.id, cat, sub, n,
    lat: +lat.toFixed(5), lng: +lng.toFixed(5),
    loc: cerca?.n || null,
    kmLoc: dReal != null ? Math.round(dReal) : null,
  };
  const tel = t.phone || t['contact:phone'];
  if (tel) l.tel = tel;
  const web = t.website || t['contact:website'];
  if (web) l.web = web;
  if (t.opening_hours) l.horario = t.opening_hours;
  if (t.brand && cat === 'bencina') l.marca = t.brand;
  if (t.description) l.desc = t.description.slice(0, 220);
  if (t.wikipedia) l.wiki = t.wikipedia;
  if (cat === 'atractivo') {
    l._wd = t.wikidata; l._commons = t.wikimedia_commons; l._image = t.image;
  }
  lugares.push(l);
}

const atractivos = lugares.filter(l => l.cat === 'atractivo');
console.log('Buscando fotos para', atractivos.length, 'atractivos...');
const conFoto = await fotos(atractivos);
for (const a of atractivos) { delete a._wd; delete a._commons; delete a._image; }

const corr = JSON.parse(await readFile(new URL('../data/correcciones.json', import.meta.url), 'utf8'));
console.log('Correcciones aplicadas:', aplicarCorrecciones(lugares, corr));

const resumen = {};
lugares.forEach(l => resumen[l.cat] = (resumen[l.cat] || 0) + 1);

await mkdir(new URL('../data/', import.meta.url), { recursive: true });
await writeFile(new URL('../data/lugares.json', import.meta.url), JSON.stringify({
  generado: new Date().toISOString().slice(0, 10),
  fuente: 'Datos © colaboradores de OpenStreetMap (ODbL). Fotos: Wikimedia Commons, autor y licencia en cada una.',
  pueblos: pueblos.map(({ n, lat, lng }) => ({ n, lat: +lat.toFixed(4), lng: +lng.toFixed(4) })),
  lugares,
}, null, 1));
console.log('Listo:', lugares.length, 'lugares', resumen, '| atractivos con foto:', conFoto);
