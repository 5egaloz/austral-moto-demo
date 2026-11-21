// Baja de la CNE (Bencina en Línea, api.bencinaenlinea.cl) las bencineras de Aysén y del sur de Los Lagos,
// con qué combustible venden y su precio, y guarda data/bencina.json.
// Es la fuente oficial: las estaciones informan sus precios a la CNE. Correr antes de publicar:
//   node scripts/bencina-cne.mjs
import { writeFile } from 'node:fs/promises';

const r = await fetch('https://api.bencinaenlinea.cl/api/busqueda_estacion_filtro');
if (!r.ok) throw new Error('CNE respondió ' + r.status);
const j = await r.json();
const todas = Array.isArray(j) ? j : j.data;

const NOMBRE = {'93':'93', '95':'95', '97':'97', 'DI':'Diésel'};
const estaciones = todas
  .map(e => ({...e, lat:+e.latitud, lng:+e.longitud}))
  // Aysén completo y Los Lagos desde Chaitén al sur (Chaitén, Futaleufú, Palena)
  // (lng > -73.58 deja fuera Chiloé; Caleta Tortel está en -73.53)
  // más Hornopirén (-41.96), última bencina antes de las barcazas a Chaitén
  .filter(e => (e.lat < -42.6 || (e.lat < -41.9 && e.lat > -42.1 && e.lng > -72.6)) && e.lat > -49.5 && e.lng > -73.58 && e.lng < -71)
  .map(e => ({
    id: e.id,
    marca: e.marca,
    direccion: String(e.direccion || '').replace(/\s+0$/, '').trim(),
    comuna: e.comuna,
    lat: e.lat, lng: e.lng,
    horario: e.horario || '',
    comb: (e.combustibles || []).filter(c => c.suministra && NOMBRE[c.nombre_corto]).map(c => ({
      t: NOMBRE[c.nombre_corto], precio: Math.round(+c.precio), fecha: String(c.precio_fecha || '').slice(0, 10),
    })),
  }))
  // Precios de hace más de 90 días no sirven (en Cochrane hay una estación con datos de 2021 que no existe)
  .map(e => ({...e, comb: e.comb.filter(c => Date.now() - new Date(c.fecha) < 90 * 864e5)}))
  .filter(e => e.comb.length);

await writeFile(new URL('../data/bencina.json', import.meta.url),
  JSON.stringify({fuente:'CNE, Bencina en Línea (bencinaenlinea.cl)', generado:new Date().toISOString().slice(0, 10), estaciones}, null, 1));
console.log('Bencineras:', estaciones.length, '| con gasolina:', estaciones.filter(e => e.comb.some(c => c.t !== 'Diésel')).length);
