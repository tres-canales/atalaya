// Lee cada hora lo que Atalaya Vigía no alcanza, porque no tiene permiso para
// conectarse fuera de Google: las búsquedas en alza del RSS público de Google
// Trends y la miniatura de cada video propio, para anotar cuándo cambia.
// Sin dependencias. Uso: node tareas/externos.mjs <carpeta de la rama «datos»>
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const FUENTE = 'https://script.google.com/macros/s/AKfycbxdRWV_5JxbMyXQ3rAZdO7gWQhOay_ecISRB9x05wuZzLOQ5dTqOuPunSJeYnksXPZKTg/exec?datos=1';
const PAISES = ['DO', 'MX', 'ES', 'CO', 'AR', 'US'];
const HORA = 3600000, DIA = 86400000;
const carpeta = process.argv[2] || 'datos';
const ahora = Date.now();

async function leerJson(nombre, siFalta) {
  try { return JSON.parse(await readFile(join(carpeta, nombre), 'utf8')); } catch (error) { return siFalta; }
}
async function pedir(url) {
  const respuesta = await fetch(url, { signal: AbortSignal.timeout(20000), headers: { 'user-agent': 'atalaya (github.com/tres-canales/atalaya)' } });
  if (!respuesta.ok) throw new Error(url.split('?')[0] + ' respondió ' + respuesta.status);
  return respuesta;
}

function texto(xml) {
  return String(xml || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (m, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&amp;/g, '&')
    .trim();
}
function campo(xml, etiqueta) {
  const m = new RegExp('<' + etiqueta + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + etiqueta + '>').exec(xml);
  return m ? texto(m[1]) : '';
}

// Las búsquedas en alza de un país: consulta (q), volumen aproximado tal como
// lo da Google (n), desde cuándo (p) y la primera noticia que la acompaña.
async function busquedasDe(pais) {
  const xml = await (await pedir('https://trends.google.com/trending/rss?geo=' + pais)).text();
  const lista = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const item = m[1];
    const q = campo(item, 'title');
    if (!q) continue;
    const noticia = (/<ht:news_item>([\s\S]*?)<\/ht:news_item>/.exec(item) || [])[1] || '';
    const enlace = campo(noticia, 'ht:news_item_url');
    lista.push({
      q: q.slice(0, 120), n: campo(item, 'ht:approx_traffic').slice(0, 20), p: Date.parse(campo(item, 'pubDate')) || 0,
      nt: campo(noticia, 'ht:news_item_title').slice(0, 200), nu: /^https?:\/\//.test(enlace) ? enlace : '', nf: campo(noticia, 'ht:news_item_source').slice(0, 60),
    });
  }
  if (!lista.length) throw new Error('el RSS de ' + pais + ' llegó sin búsquedas');
  return { leido: ahora, t: lista.slice(0, 20) };
}

// Un cambio de miniatura se anota cuando dos lecturas seguidas dan la misma
// imagen nueva: una sola lectura distinta puede ser otro servidor de YouTube.
// En las primeras seis horas de un video no cuenta, porque YouTube pasa de la
// imagen automática a la subida.
async function miniaturas(estado, cambios) {
  const datos = await (await pedir(FUENTE)).json();
  for (const v of datos.videos || []) {
    if (!/^[\w-]{11}$/.test(v.id)) continue;
    let huella;
    try {
      const imagen = Buffer.from(await (await pedir('https://i.ytimg.com/vi/' + v.id + '/mqdefault.jpg')).arrayBuffer());
      huella = createHash('sha1').update(imagen).digest('hex');
    } catch (error) {
      console.error('miniatura ' + v.id + ': ' + error.message);
      continue;
    }
    const conocida = estado.miniaturas[v.id];
    if (!conocida || ahora - Date.parse(v.publicado) < 6 * HORA) { estado.miniaturas[v.id] = huella; delete estado.pendientes[v.id]; continue; }
    if (huella === conocida) { delete estado.pendientes[v.id]; continue; }
    const pendiente = estado.pendientes[v.id];
    if (pendiente && pendiente.huella === huella) {
      cambios.push([pendiente.t, v.id, 'miniatura']);
      estado.miniaturas[v.id] = huella;
      delete estado.pendientes[v.id];
    } else {
      estado.pendientes[v.id] = { huella: huella, t: ahora };
    }
  }
}

const previo = await leerJson('externos.json', {});
const estado = await leerJson('estado.json', {});
estado.miniaturas = estado.miniaturas || {};
estado.pendientes = estado.pendientes || {};

const google = previo.google || {};
let leidos = 0;
for (const pais of PAISES) {
  // Si un país falla se queda con su lectura anterior.
  try { google[pais] = await busquedasDe(pais); leidos++; } catch (error) { console.error('google ' + pais + ': ' + error.message); }
}

const cambios = (Array.isArray(previo.cambios) ? previo.cambios : []).filter((c) => Array.isArray(c) && c[0] > ahora - 30 * DIA);
try { await miniaturas(estado, cambios); } catch (error) { console.error('miniaturas: ' + error.message); }

await writeFile(join(carpeta, 'externos.json'), JSON.stringify({ leido: leidos ? ahora : previo.leido || 0, google: google, cambios: cambios }));
await writeFile(join(carpeta, 'estado.json'), JSON.stringify(estado));
console.log('países leídos: ' + leidos + ' de ' + PAISES.length + '; miniaturas seguidas: ' + Object.keys(estado.miniaturas).length + '; cambios anotados: ' + cambios.length);
