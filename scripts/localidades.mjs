// Pueblos de la Ruta 7 que OpenStreetMap no marca como city/town/village.
// Sin ellos, los negocios de Villa Santa Lucía quedaban en "Futaleufú", los de Amengual en
// "Puerto Cisnes" y los de Bertrand en "Puerto Guadal". actualizar-datos.mjs los suma a la lista.
// Corrido solo, vuelve a calcular la localidad de data/lugares.json sin bajar nada:
//   node scripts/localidades.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const PUEBLOS_EXTRA = [
  { n: 'Villa Santa Lucía', lat: -43.413, lng: -72.364, peso: 1 },
  { n: 'Villa Amengual', lat: -44.746, lng: -72.208, peso: 1 },
  { n: 'Puerto Bertrand', lat: -46.995, lng: -72.823, peso: 1 },
  { n: 'Puerto Yungay', lat: -47.962, lng: -73.383, peso: 1 },
];

const km = (a, b) => {
  const r = Math.PI / 180, x = Math.sin((b.lat - a.lat) * r / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin((b.lng - a.lng) * r / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(x));
};

// Pueblo más cercano; los grandes ganan un poco de margen (mismo criterio que actualizar-datos.mjs)
export function localidad(punto, pueblos){
  let cerca = null, dist = Infinity;
  for (const p of pueblos) {
    const d = km(punto, p) - (p.peso || 1) * 1.5;
    if (d < dist) { dist = d; cerca = p; }
  }
  return cerca ? { loc: cerca.n, kmLoc: Math.round(km(punto, cerca)) } : { loc: null, kmLoc: null };
}

export function sumarExtra(pueblos){
  const ya = new Set(pueblos.map(p => p.n));
  return pueblos.concat(PUEBLOS_EXTRA.filter(p => !ya.has(p.n)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const ruta = new URL('../data/lugares.json', import.meta.url);
  const datos = JSON.parse(await readFile(ruta, 'utf8'));
  // Solo se mueve un lugar si uno de los pueblos agregados le queda más cerca que su localidad actual
  let cambios = 0;
  for (const l of datos.lugares) {
    for (const p of PUEBLOS_EXTRA) {
      const d = km(l, p);
      if (l.loc !== p.n && (l.kmLoc == null || d < l.kmLoc)) { l.loc = p.n; l.kmLoc = Math.round(d); cambios++; }
    }
  }
  datos.pueblos = sumarExtra(datos.pueblos).map(({ n, lat, lng }) => ({ n, lat, lng }));
  await writeFile(ruta, JSON.stringify(datos, null, 1));
  console.log('Localidades cambiadas:', cambios);
}
