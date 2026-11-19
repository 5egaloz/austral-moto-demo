// Busca fotos libres en Wikimedia Commons para los lugares clásicos de la Carretera Austral.
// Escribe data/fotos-candidatas.json (varias opciones por lugar) para elegir a mano la correcta.
// Uso: node scripts/buscar-fotos.mjs
import { writeFile, mkdir } from 'node:fs/promises';

const UA = 'Ruta7Moto/0.1 (demo web Carretera Austral; github.com/5egaloz/austral-moto-demo)';
const COMMONS = 'https://commons.wikimedia.org/w/api.php';

export const LUGARES = [
  { id: 'capillas', n: 'Capillas de Mármol', sub: 'Lago General Carrera', loc: 'Puerto Río Tranquilo', lat: -46.648, lng: -72.617, q: 'Capillas de Marmol' },
  { id: 'queulat', n: 'Ventisquero Colgante', sub: 'Parque Nacional Queulat', loc: 'Puyuhuapi', lat: -44.465, lng: -72.54, q: 'Ventisquero Colgante Queulat' },
  { id: 'castillo', n: 'Cerro Castillo', sub: 'Parque Nacional Cerro Castillo', loc: 'Villa Cerro Castillo', lat: -46.06, lng: -72.16, q: 'Cerro Castillo Aysen' },
  { id: 'tortel', n: 'Caleta Tortel', sub: 'Pueblo de pasarelas', loc: 'Caleta Tortel', lat: -47.797, lng: -73.535, q: 'Caleta Tortel' },
  { id: 'confluencia', n: 'Confluencia del Baker y el Neff', sub: 'Río Baker', loc: 'Puerto Bertrand', lat: -47.06, lng: -72.79, q: 'Baker Neff confluence' },
  { id: 'baker', n: 'Río Baker', sub: 'El río más caudaloso de Chile', loc: 'Cochrane', lat: -47.1, lng: -72.75, q: 'Rio Baker Aysen' },
  { id: 'carrera', n: 'Lago General Carrera', sub: 'El lago más grande de Chile', loc: 'Chile Chico', lat: -46.5, lng: -72.3, q: 'Lago General Carrera' },
  { id: 'exploradores', n: 'Glaciar Exploradores', sub: 'Campo de Hielo Norte', loc: 'Puerto Río Tranquilo', lat: -46.5, lng: -73.18, q: 'Glaciar Exploradores' },
  { id: 'sanrafael', n: 'Laguna San Rafael', sub: 'Parque Nacional Laguna San Rafael', loc: 'Puerto Aysén', lat: -46.68, lng: -73.85, q: 'Laguna San Rafael glaciar' },
  { id: 'puyuhuapi', n: 'Puyuhuapi', sub: 'Pueblo junto al fiordo', loc: 'Puyuhuapi', lat: -44.326, lng: -72.557, q: 'Puyuhuapi' },
  { id: 'chacabuco', n: 'Valle Chacabuco', sub: 'Parque Nacional Patagonia', loc: 'Cochrane', lat: -47.13, lng: -72.48, q: 'Valle Chacabuco' },
  { id: 'jeinimeni', n: 'Reserva Nacional Lago Jeinimeni', sub: 'Lagunas y estepa', loc: 'Chile Chico', lat: -46.85, lng: -72.0, q: 'Lago Jeinimeni' },
  { id: 'bertrand', n: 'Lago Bertrand', sub: 'Agua turquesa', loc: 'Puerto Bertrand', lat: -46.95, lng: -72.8, q: 'Lago Bertrand' },
  { id: 'ohiggins', n: "Villa O'Higgins", sub: 'Fin de la Carretera Austral', loc: "Villa O'Higgins", lat: -48.467, lng: -72.56, q: "Villa O'Higgins" },
  { id: 'coyhaique', n: 'Coyhaique', sub: 'Capital regional', loc: 'Coyhaique', lat: -45.571, lng: -72.068, q: 'Coyhaique ciudad' },
  { id: 'indio', n: 'Piedra del Indio', sub: 'Formación rocosa sobre el río Simpson', loc: 'Coyhaique', lat: -45.56, lng: -72.08, q: 'Piedra del Indio Coyhaique' },
  { id: 'simpson', n: 'Valle del río Simpson', sub: 'Reserva Nacional Río Simpson', loc: 'Coyhaique', lat: -45.5, lng: -72.3, q: 'Rio Simpson Aysen' },
  { id: 'pumalin', n: 'Parque Pumalín', sub: 'Bosque de alerces y volcán Chaitén', loc: 'Chaitén', lat: -42.85, lng: -72.6, q: 'Pumalin' },
  { id: 'chaiten', n: 'Volcán Chaitén', sub: 'Parque Pumalín', loc: 'Chaitén', lat: -42.83, lng: -72.65, q: 'Volcan Chaiten' },
  { id: 'yungay', n: 'Balsa de Puerto Yungay', sub: 'Cruce a Río Bravo', loc: 'Puerto Yungay', lat: -47.962, lng: -73.383, q: 'Puerto Yungay ferry' },
  { id: 'roballos', n: 'Paso Roballos', sub: 'Paso fronterizo de ripio', loc: 'Cochrane', lat: -47.15, lng: -71.86, q: 'Paso Roballos' },
  { id: 'ruta', n: 'Carretera Austral', sub: 'Ruta 7', loc: null, lat: null, lng: null, q: 'Carretera Austral' },
  { id: 'ruta-ripio', n: 'Carretera Austral en ripio', sub: 'Ruta 7', loc: null, lat: null, lng: null, q: 'Carretera Austral gravel' },
  { id: 'moto', n: 'Moto en la Carretera Austral', sub: 'Ruta 7', loc: null, lat: null, lng: null, q: 'Carretera Austral motorcycle' },
];

const LIBRE = /^(cc0|cc[ -]by|public domain|pd|attribution|fal)/i;
const limpiar = s => (s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const espera = ms => new Promise(r => setTimeout(r, ms));

async function api(params) {
  const u = COMMONS + '?' + new URLSearchParams({ format: 'json', origin: '*', ...params });
  for (let i = 0; i < 5; i++) {
    const r = await fetch(u, { headers: { 'User-Agent': UA } });
    if (r.ok) return r.json();
    console.log('   HTTP', r.status, 'reintento', i + 1);
    await espera(10000 * (i + 1));
  }
  throw new Error('Falló ' + u);
}

const out = {};
for (const l of LUGARES) {
  let j;
  try { j = await api({
    action: 'query', generator: 'search', gsrsearch: l.q + ' filetype:bitmap', gsrnamespace: '6', gsrlimit: '12',
    prop: 'imageinfo', iiprop: 'url|extmetadata|mime|size', iiurlwidth: '1280',
  }); } catch (e) { console.log(l.id, 'sin respuesta, se salta'); continue; }
  const cand = Object.values(j.query?.pages || {})
    .sort((a, b) => a.index - b.index)
    .map(p => ({ p, ii: p.imageinfo?.[0] }))
    .filter(({ ii }) => ii && ii.mime === 'image/jpeg' && ii.width >= 1000 && ii.width > ii.height)
    .map(({ p, ii }) => {
      const m = ii.extmetadata || {};
      return {
        titulo: p.title,
        url: ii.thumburl,
        autor: limpiar(m.Artist?.value).slice(0, 80) || 'Autor desconocido',
        licencia: limpiar(m.LicenseShortName?.value),
        fuente: ii.descriptionurl,
      };
    })
    .filter(c => LIBRE.test(c.licencia))
    .slice(0, 4);
  out[l.id] = { ...l, cand };
  console.log(l.id.padEnd(13), cand.length, 'candidatas');
  await espera(1500);
}

await mkdir(new URL('../data/', import.meta.url), { recursive: true });
await writeFile(new URL('../data/fotos-candidatas.json', import.meta.url), JSON.stringify(out, null, 1));
