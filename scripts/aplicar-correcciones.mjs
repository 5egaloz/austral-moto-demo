// Aplica a data/lugares.json las correcciones verificadas a mano (data/correcciones.json).
// Lo llama actualizar-datos.mjs al final; también se puede correr solo:
//   node scripts/aplicar-correcciones.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const norm = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function aplicarCorrecciones(lugares, correcciones) {
  let n = 0;
  for (const c of correcciones) {
    for (const l of lugares) {
      if (c.id && l.id !== c.id) continue;
      if (c.cat && l.cat !== c.cat) continue;
      if (c.loc && norm(l.loc) !== norm(c.loc)) continue;
      if (c.nombre && norm(l.n) !== norm(c.nombre)) continue;
      if (c.quitar) l._quitar = true;
      else if (c.sinFoto) delete l.foto;
      else Object.assign(l, c.cambios);
      n++;
    }
  }
  for (let i = lugares.length - 1; i >= 0; i--) if (lugares[i]._quitar) lugares.splice(i, 1);
  return n;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const ruta = new URL('../data/lugares.json', import.meta.url);
  const datos = JSON.parse(await readFile(ruta, 'utf8'));
  const corr = JSON.parse(await readFile(new URL('../data/correcciones.json', import.meta.url), 'utf8'));
  console.log('Correcciones aplicadas:', aplicarCorrecciones(datos.lugares, corr));
  await writeFile(ruta, JSON.stringify(datos, null, 1));
}
