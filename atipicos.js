// Atípicos del nicho: videos de canales chicos que van muy por encima de la
// mediana de su propio canal. Los mide Atalaya Vigía una vez al día
// (leerAtipicos) y los entrega aparte, con ?atipicos=1. Usa las utilidades de
// atalaya.js, que se carga antes.
'use strict';

const FUENTE_ATI = FUENTE.replace('datos=1', 'atipicos=1');
const CADA_ATI_MS = 10 * 60000;
const GRUPOS_ATI = [['top', 'Los 10 mayores'], ['pd', 'Peso Duro'], ['evl', 'Esto Viene de Lejos'], ['pa', 'Psique Ajena'], ['ref', 'Referencia']];
// Palabras que no dicen de qué trata un video: no cuentan como tema repetido.
const COMUNES_ATI = new Set(('para como esta este esto estos estas pero porque sobre entre desde hasta cuando donde quien quienes cual cuales todo toda todos todas '
  + 'nada nadie algo otro otra otros otras mismo misma solo sola sido fue fueron eran tiene tienen hacer hizo hace puede pueden asi aqui alla '
  + 'historia historias video videos verdad real reales caso casos mundo vida anos dias parte capitulo documental explicado explicada completo completa '
  + 'nunca siempre gran grande grandes nuevo nueva mejor mejores peor peores increible impactante secreto secretos misterio oscuro oscura sabias '
  + 'pasado paso pasa queda quedo vez veces primer primera ultimo ultima despues antes ahora hoy tambien muy mas menos tan tanto realmente '
  + 'cosa cosas forma manera tiempo nombre gente persona personas hombre mujer ellos ellas nosotros usted cuenta cuentan dice dicen sera '
  + 'minutos horas sabe saben cada rico rica ricos pobre pobres explica explicacion explicados explicadas resumen').split(' '));

function claveDeNicho(ni) {
  if (ni === 'ref') return 'ref';
  return ni.indexOf('pd_') === 0 ? 'pd' : ni.indexOf('vl_') === 0 ? 'evl' : ni.indexOf('pa_') === 0 ? 'pa' : 'ref';
}

function palabrasDe(texto) {
  return Array.from(new Set(texto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9ñ]+/).filter((p) => (p.length >= 4 || /^\d{4}$/.test(p)) && !COMUNES_ATI.has(p))));
}

// Una palabra es tema repetido si sale en títulos de dos canales o más y no
// en casi todos (entonces es una palabra del nicho, no un tema).
function temasRepetidos(lista) {
  const canales = {};
  for (const v of lista) for (const p of palabrasDe(v.t)) (canales[p] = canales[p] || new Set()).add(v.ci);
  const tope = Math.max(3, Math.ceil(lista.length * 0.4));
  return Object.keys(canales).map((p) => ({ p: p, n: canales[p].size, total: lista.filter((v) => palabrasDe(v.t).includes(p)).length }))
    .filter((x) => x.n >= 2 && x.total <= tope).sort((a, b) => b.n - a.n || b.total - a.total).slice(0, 8);
}

function filaDeAtipico(a, v, puesto, temas) {
  const ahora = Date.now();
  const corto = { id: v.id, corto: false, url: 'https://www.youtube.com/watch?v=' + encodeURIComponent(v.id) };
  const familia = a.familias[v.ni];
  const dato = [
    enlaceExterno('https://www.youtube.com/channel/' + encodeURIComponent(v.ci), v.c),
    ' · ' + cuantos(v.s, 'suscriptor', 'suscriptores'),
    v.p ? ' · hace ' + lapso(Math.max(HORA, ahora - v.p)) : '',
    v.d ? ' · ' + duracion(v.d) : '',
    familia ? ' · ' + familia : '',
  ];
  const propios = palabrasDe(v.t);
  const repetido = temas.filter((x) => propios.includes(x.p)).map((x) => x.p);
  // «Nuevo hoy» solo tiene sentido desde la segunda lectura.
  const nuevo = v.desde === a.leido && a.primera > 0 && a.primera < a.leido;
  return crear('li', { datos: { serie: claveDeNicho(v.ni) } },
    puesto ? crear('span', { clase: 'puesto', 'aria-hidden': 'true' }, String(puesto)) : null,
    miniatura(corto, 'mini', 'mqdefault'),
    crear('div', { clase: 'tend-texto' },
      enlaceExterno(corto.url, v.t, { clase: 'video-titulo' }),
      crear('span', { clase: 'video-dato' }, crear('span', { clase: 'clave' }), dato),
      (nuevo || repetido.length) ? crear('span', { clase: 'ati-marcas' },
        nuevo ? crear('span', { clase: 'ati-marca' }, 'Nuevo hoy') : null,
        repetido.length ? crear('span', { clase: 'ati-marca repetido' }, 'Tema repetido: ' + repetido.join(', ')) : null) : null),
    crear('div', { clase: 'tend-cifra ati-cifra' },
      crear('span', null, crear('strong', null, unaCifra(v.x) + ' veces'), crear('span', { clase: 'tenue' }, ' su mediana')),
      crear('span', { clase: 'tenue' }, cuantos(v.n, 'vista', 'vistas') + ' contra ' + fmt(v.med)),
      crear('span', { clase: 'video-ahora' }, fmt(v.vd) + ' por día')));
}

function pintarAtipicos() {
  const a = estado.atipicos;
  const seccion = $('#atipicos');
  if (!a || !Array.isArray(a.lista)) { seccion.hidden = true; return; }
  seccion.hidden = false;
  a.familias = {};
  for (const n of a.nichos || []) a.familias[n.id] = n.nombre;
  a.familias.ref = 'Canal de referencia';
  const c = a.criterios || {};
  const r = a.resumen || {};
  const partes = ['Videos de canales con menos de ' + fmt(c.maxSubs || 50000) + ' suscriptores que van ' + fmt(c.veces || 5)
    + ' veces o más sobre la mediana de sus otros largos, publicados en los últimos ' + fmt(c.dias || 90) + ' días, de 4 minutos o más, en español y con '
    + fmt(c.minVistas || 5000) + ' vistas como mínimo.'];
  if (a.leido) partes.push('Se mide cada día a las 7 a. m.; última lectura, ' + fechaConHora.format(a.leido) + (r.leidos ? ', con ' + cuantos(r.leidos, 'canal revisado', 'canales revisados') : '') + '.');
  partes.push('La familia es la búsqueda de nicho en la que apareció el canal.');
  $('#ati-nota').textContent = partes.join(' ');

  const grupo = estado.atiGrupo || 'top';
  const temas = temasRepetidos(a.lista);
  reemplazar($('#ati-barra'), [segmentos('ati', GRUPOS_ATI, grupo)]);
  $('#ati-barra').onchange = function (e) {
    if (e.target.name !== 'ati') return;
    estado.atiGrupo = e.target.value;
    estado.atiPalabra = '';
    pintarAtipicos();
  };
  reemplazar($('#ati-temas'), temas.length ? [crear('span', { clase: 'ati-temas-rotulo' }, 'Temas que se repiten en varios canales:'),
    temas.map((x) => crear('button', { type: 'button', clase: 'ati-tema' + (estado.atiPalabra === x.p ? ' activo' : ''), 'aria-pressed': estado.atiPalabra === x.p ? 'true' : 'false', datos: { palabra: x.p } },
      x.p + ' · ' + x.n + ' canales'))] : []);
  $('#ati-temas').onclick = function (e) {
    const b = e.target.closest('.ati-tema');
    if (!b) return;
    estado.atiPalabra = estado.atiPalabra === b.dataset.palabra ? '' : b.dataset.palabra;
    pintarAtipicos();
  };

  let lista = a.lista.slice().sort((x, y) => y.x - x.x);
  if (estado.atiPalabra) lista = lista.filter((v) => palabrasDe(v.t).includes(estado.atiPalabra));
  if (!a.lista.length) {
    reemplazar($('#ati-cuerpo'), [crear('p', { clase: 'vacio' }, a.leido ? 'La última lectura no encontró videos que cumplan los criterios.' : 'Todavía no hay lectura de atípicos.')]);
    return;
  }
  let cuerpo;
  if (grupo === 'top' || estado.atiPalabra) {
    cuerpo = [crear('ol', { clase: 'tend-lista ati-lista' }, lista.slice(0, estado.atiPalabra ? 30 : 10).map((v, i) => filaDeAtipico(a, v, i + 1, temas)))];
  } else {
    const porFamilia = {};
    for (const v of lista) if (claveDeNicho(v.ni) === grupo) (porFamilia[v.ni] = porFamilia[v.ni] || []).push(v);
    const familias = Object.keys(porFamilia).sort((x, y) => porFamilia[y][0].x - porFamilia[x][0].x);
    cuerpo = familias.length ? familias.map((ni) => crear('div', { clase: 'ati-grupo' },
      crear('h3', null, a.familias[ni] || ni, crear('span', { clase: 'tenue' }, ' · ' + cuantos(porFamilia[ni].length, 'video', 'videos'))),
      crear('ol', { clase: 'tend-lista ati-lista' }, porFamilia[ni].slice(0, 10).map((v, i) => filaDeAtipico(a, v, i + 1, temas)))))
      : [crear('p', { clase: 'vacio' }, 'Hoy no hay atípicos en las familias de este canal.')];
  }
  reemplazar($('#ati-cuerpo'), cuerpo);
}

async function leerAtipicos() {
  try {
    const respuesta = await fetch(FUENTE_ATI, { cache: 'no-store', credentials: 'omit' });
    if (!respuesta.ok) throw new Error('código ' + respuesta.status);
    const datos = await respuesta.json();
    if (!datos || !Array.isArray(datos.lista)) throw new Error('respuesta sin lista');
    estado.atipicos = datos;
    guardar('atipicos', JSON.stringify(datos));
  } catch (error) {
    // Sin esta lectura la página sigue; se muestra la guardada, si la hay.
    console.warn('atípicos: ' + error.message);
  }
  try { pintarAtipicos(); } catch (error) { console.error('atípicos: ' + error); $('#atipicos').hidden = true; }
}

(function () {
  try { estado.atipicos = JSON.parse(recordar('atipicos') || 'null'); } catch (error) { guardar('atipicos', null); }
  if (estado.atipicos) {
    try { pintarAtipicos(); } catch (error) { console.error('atípicos: ' + error); }
  }
  leerAtipicos();
  setInterval(function () { if (!document.hidden) leerAtipicos(); }, CADA_ATI_MS);
})();
