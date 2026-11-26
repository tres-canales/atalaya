// Atalaya: lee las cifras de Kilometraje Real y El Banco de la Plaza que
// entrega Atalaya Vigía (Cloud Run) y las dibuja. Sin dependencias. Todo
// texto que viene de YouTube entra al documento como texto, nunca como HTML.
'use strict';

// Atalaya Vigía, versión 12 (Cloud Run, proyecto prod-canales-gcp).
const VIGIA = 'https://vigia-593964998100.us-east1.run.app';
// Vigía lee YouTube como mucho cada 45 s; el panel cambia cada 10 minutos.
const CADA_MS = 60000;
const CADA_PANEL_MS = 5 * 60000;
const ESPERA_MS = 25000;
const HORA = 3600000;
const DIA = 86400000;

// El orden es el de Vigía (índice de canal en «historia», «mov» y «analytics»)
// y fija el color de cada serie.
const CANALES = [
  { id: 'UCNxn2eOfVDo8lwp0BCR_-VQ', clave: 'kr', nombre: 'Kilometraje Real', corto: 'Kilometraje' },
  { id: 'UCO988qGZH9ApN8vCq91aenQ', clave: 'bdp', nombre: 'El Banco de la Plaza', corto: 'El Banco' },
];
const PERIODOS = {
  '24h': { nombre: '24 horas', cubos: 24, unidad: 'hora' },
  '7d': { nombre: '7 días', cubos: 7, unidad: 'día' },
  '30d': { nombre: '30 días', cubos: 30, unidad: 'día' },
};
const VISTAS = ['hoy', 'crecimiento', 'videos', 'radar'];

// Búsquedas de Google Trends y cambios de miniatura: los escribe cada hora la
// tarea «Datos externos» del repositorio en la rama «datos».
const EXTERNOS = 'https://raw.githubusercontent.com/tres-canales/atalaya/datos/externos.json';
const CADA_EXTERNOS_MS = 10 * 60000;
// Programa de socios de YouTube. Horas de largos públicos de los últimos 12
// meses: la meta del dueño es la regla que rige desde el 01/02/2027 (13 de Atalaya).
const META_SUBS = 1000;
const META_HORAS = 8000;
const PAISES = [['DO', 'Rep. Dominicana'], ['MX', 'México'], ['ES', 'España'], ['CO', 'Colombia'], ['AR', 'Argentina'], ['US', 'EE. UU.']];
const CATEGORIAS = {
  1: 'Cine y animación', 2: 'Autos', 10: 'Música', 15: 'Mascotas y animales', 17: 'Deportes', 19: 'Viajes',
  20: 'Videojuegos', 22: 'Gente y blogs', 23: 'Comedia', 24: 'Entretenimiento', 25: 'Noticias y política',
  26: 'Consejos y estilo', 27: 'Educación', 28: 'Ciencia y tecnología', 29: 'Activismo',
};

const estado = {
  vivo: null,
  panel: null,
  etagPanel: '',
  modelo: null,
  externos: null,
  vista: 'hoy',
  tend: 'ref',
  tendCanal: '',
  tendFormato: '',
  tendSin: '',
  pais: 'DO',
  firmaTend: '',
  periodo: '24h',
  orden: { campo: 'periodo', sentido: -1 },
  canal: '',
  tipo: '',
  ultimoIntento: 0,
  ultimoPanel: 0,
  reloj: 0,
  pulso: null,
};

/* ---------- Utilidades ---------- */


const $ = (selector, raiz) => (raiz || document).querySelector(selector);
const sinMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)');

function recordar(clave) {
  try { return localStorage.getItem('atalaya.' + clave); } catch (error) { return null; }
}
function guardar(clave, valor) {
  try {
    if (valor === null) localStorage.removeItem('atalaya.' + clave);
    else localStorage.setItem('atalaya.' + clave, valor);
  } catch (error) {
    // Almacenamiento lleno o bloqueado: la página sigue sin recordar la preferencia.
  }
}
function esDueno() { return document.documentElement.hasAttribute('data-dueno'); }

function agregar(nodo, hijos) {
  for (const h of hijos) {
    if (h === null || h === undefined || h === false) continue;
    if (Array.isArray(h)) agregar(nodo, h);
    else nodo.append(h instanceof Node ? h : document.createTextNode(String(h)));
  }
  return nodo;
}
function crear(etiqueta, atributos, ...hijos) {
  const nodo = document.createElement(etiqueta);
  for (const k in atributos) {
    const v = atributos[k];
    if (v === null || v === undefined || v === false) continue;
    if (k === 'clase') nodo.className = v;
    else if (k === 'datos') Object.assign(nodo.dataset, v);
    // La política de contenido bloquea el atributo «style»: las medidas se ponen por propiedad.
    else if (k === 'estilo') for (const propiedad in v) nodo.style.setProperty(propiedad, v[propiedad]);
    else nodo.setAttribute(k, v === true ? '' : v);
  }
  return agregar(nodo, hijos);
}
function trazar(etiqueta, atributos, ...hijos) {
  const nodo = document.createElementNS('http://www.w3.org/2000/svg', etiqueta);
  for (const k in atributos) {
    if (atributos[k] !== null && atributos[k] !== undefined) nodo.setAttribute(k, atributos[k]);
  }
  return agregar(nodo, hijos);
}
function reemplazar(nodo, hijos) {
  nodo.textContent = '';
  return agregar(nodo, hijos);
}
function enlaceExterno(href, hijos, atributos) {
  return crear('a', Object.assign({ href: href, target: '_blank', rel: 'noopener noreferrer' }, atributos), hijos);
}

const numero = new Intl.NumberFormat('es-DO');
const horaMinuto = new Intl.DateTimeFormat('es-DO', { hour: 'numeric', minute: '2-digit' });
const horaSola = new Intl.DateTimeFormat('es-DO', { hour: 'numeric' });
const fechaNumerica = new Intl.DateTimeFormat('es-DO', { day: '2-digit', month: '2-digit', year: 'numeric' });
const fechaConHora = new Intl.DateTimeFormat('es-DO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const diaYMes = new Intl.DateTimeFormat('es-DO', { day: 'numeric', month: 'short' });
const diaDeSemana = new Intl.DateTimeFormat('es-DO', { weekday: 'short', day: 'numeric' });
const diaCompleto = new Intl.DateTimeFormat('es-DO', { weekday: 'long', day: 'numeric', month: 'long' });

const fmt = (n) => numero.format(n);
function cuantos(n, uno, varios) { return fmt(n) + ' ' + (n === 1 ? uno : varios); }
// «la 1:05 p. m.» o «las 11:59 p. m.»
function laHora(t) {
  const texto = horaMinuto.format(t);
  return (/^1:/.test(texto) ? 'la ' : 'las ') + texto;
}
// Una lectura guardada o fallida puede ser de otro día: entonces lleva su fecha.
function momento(t, preposicion) {
  const hoy = new Date(), dia = new Date(t);
  if (hoy.toDateString() === dia.toDateString()) return preposicion + ' ' + laHora(t);
  return (preposicion === 'de' ? 'del ' : preposicion + ' el ') + fechaNumerica.format(t) + ' a ' + laHora(t);
}
// Mientras el registro por hora tenga menos de un día, decir «24 horas» sería inexacto.
function ventanaDeUnDia(m) {
  if (!m.bitacoraDesde || m.ahora - m.bitacoraDesde >= DIA) return 'en las últimas 24 horas';
  const ahora = new Date(m.ahora), inicio = new Date(m.bitacoraDesde);
  if (ahora.toDateString() === inicio.toDateString()) return 'desde ' + laHora(m.bitacoraDesde);
  const ayer = new Date(m.ahora - DIA);
  if (ayer.toDateString() === inicio.toDateString()) return 'desde ayer a ' + laHora(m.bitacoraDesde);
  return 'desde el ' + fechaNumerica.format(m.bitacoraDesde) + ' a ' + laHora(m.bitacoraDesde);
}
function lapso(ms) {
  const minutos = Math.max(1, Math.round(ms / 60000));
  if (minutos < 60) return cuantos(minutos, 'minuto', 'minutos');
  const horas = Math.round(ms / HORA);
  if (horas < 48) return cuantos(horas, 'hora', 'horas');
  return cuantos(Math.round(ms / DIA), 'día', 'días');
}
function duracion(segundos) {
  if (segundos < 60) return segundos + ' s';
  const m = Math.floor(segundos / 60), s = segundos % 60;
  return m + ':' + (s < 10 ? '0' : '') + s;
}
function primerParrafo(texto) {
  const parrafo = String(texto).split(/\n\s*\n/)[0].trim();
  if (parrafo.length <= 150) return parrafo;
  const corte = parrafo.slice(0, 150);
  const punto = corte.lastIndexOf('. ');
  return punto > 40 ? corte.slice(0, punto + 1) : corte.replace(/\s+\S*$/, '') + '…';
}
function sumar(lista) { return lista.reduce((a, b) => a + b, 0); }
// 2.8, o 12 cuando el decimal ya no dice nada.
function unaCifra(n) { return fmt(n >= 10 ? Math.round(n) : Math.round(n * 10) / 10); }
// «▲ 4» o «▼ 1»: la dirección va en el signo, no en el color.
function conSigno(n) { return (n > 0 ? '▲ ' : '▼ ') + fmt(Math.abs(n)); }
function fechaLocal(texto) {
  const p = texto.split('-').map(Number);
  return new Date(p[0], p[1] - 1, p[2]);
}
// «p. m.» ya termina en punto: no se escribe otro.
function conPunto(texto) { return /\.$/.test(texto) ? texto : texto + '.'; }

/* ---------- Modelo: de la respuesta de Vigía a lo que se dibuja ---------- */

function preparar(d) {
  const ahora = Date.parse(d.hora) || Date.now();
  const porNombre = {};
  const canales = CANALES.map(function (c, ci) {
    const s = (d.canales || []).find((x) => x.id === c.id) || {};
    porNombre[s.nombre || c.nombre] = ci;
    const usuario = s.usuario && s.usuario.charAt(0) === '@' ? s.usuario : '';
    return {
      ci: ci, id: c.id, clave: c.clave, nombre: c.nombre, corto: c.corto,
      falta: !s.id || !!s.error,
      subs: Number(s.subs) || 0,
      vistasCanal: Number(s.vistas) || 0,
      total: Number(s.videos) || 0,
      logo: s.logo || '',
      usuario: usuario,
      url: usuario ? 'https://www.youtube.com/' + usuario : 'https://www.youtube.com/channel/' + c.id,
      descripcion: primerParrafo(s.descripcion || ''),
    };
  });

  const videos = [];
  for (const v of d.videos || []) {
    const ci = porNombre[v.canal];
    if (ci === undefined || !v.id) continue;
    // Mismo criterio que la hoja de cálculo: hasta 3 minutos es un Short.
    const corto = Number(v.seg) <= 180;
    videos.push({
      id: v.id, ci: ci, titulo: String(v.titulo || ''), publicado: Date.parse(v.publicado) || 0,
      seg: Number(v.seg) || 0, corto: corto,
      vistas: Number(v.vistas) || 0, likes: Number(v.likes) || 0, coms: Number(v.coms) || 0,
      url: corto ? 'https://www.youtube.com/shorts/' + v.id : 'https://www.youtube.com/watch?v=' + v.id,
    });
  }
  for (const c of canales) {
    const suyos = videos.filter((v) => v.ci === c.ci);
    // El total del canal que da YouTube llega con horas de retraso respecto de
    // sus videos; se muestra el mayor de los dos.
    c.vistas = Math.max(c.vistasCanal, sumar(suyos.map((v) => v.vistas)));
    c.ultimo = suyos.reduce((a, v) => (!a || v.publicado > a.publicado ? v : a), null);
    c.ultimoLargo = suyos.filter((v) => !v.corto).reduce((a, v) => (!a || v.publicado > a.publicado ? v : a), null);
  }

  const mov = d.mov || {};
  const diario = {};
  let registroDesde = Infinity;
  for (const id in d.vdia || {}) {
    const fila = d.vdia[id];
    if (!Array.isArray(fila) || typeof fila[0] !== 'number' || !Array.isArray(fila[1])) continue;
    const puntos = fila[1].map((p) => ({ t: p[0] * 60000, v: Number(p[1]) || 0 })).sort((a, b) => a.t - b.t);
    if (!puntos.length) continue;
    diario[id] = { ci: fila[0], puntos: puntos };
    registroDesde = Math.min(registroDesde, puntos[0].t);
  }

  return {
    ahora: ahora, canales: canales, videos: videos,
    historia: (d.historia || []).filter((f) => Array.isArray(f) && f.length >= 3),
    bitacoraDesde: Number(mov.desde) || 0,
    h1: mov.h1 || {}, h24: mov.h24 || {},
    porHora: mov.porHora || [],
    cambiosSubs: mov.subs || [],
    diario: diario,
    registroDesde: registroDesde,
    nichos: d.nichos && Array.isArray(d.nichos.familias) ? d.nichos : null,
    tendencias: d.tendencias && Array.isArray(d.tendencias.ref) && d.tendencias.leido ? d.tendencias : null,
    comentarios: d.comentarios && Array.isArray(d.comentarios.lista) && d.comentarios.lista.length ? d.comentarios : null,
    cambios: (Array.isArray(d.cambios) ? d.cambios : []).filter((f) => Array.isArray(f) && f.length >= 4),
    analytics: d.analytics && Array.isArray(d.analytics.canales) ? d.analytics : null,
  };
}

// Vistas ganadas por cubo (hora o día) y canal. En 24 horas salen de la
// bitácora; en 7 y 30 días, de la lectura diaria de cada video.
function cubosDeVistas(m, clave) {
  const cubos = [];
  const n = PERIODOS[clave].cubos;
  if (clave === '24h') {
    const ultima = Math.floor(m.ahora / HORA) * HORA;
    for (let i = n - 1; i >= 0; i--) cubos.push({ t: ultima - i * HORA, fin: ultima - i * HORA + HORA, valores: CANALES.map(() => 0) });
    const posicion = {};
    cubos.forEach(function (c, i) { posicion[c.t] = i; });
    for (const f of m.porHora) {
      const i = posicion[f[0]];
      if (i !== undefined && cubos[i].valores[f[1]] !== undefined) cubos[i].valores[f[1]] += Number(f[2]) || 0;
    }
    return cubos;
  }
  const hoy = new Date(m.ahora);
  hoy.setHours(0, 0, 0, 0);
  for (let i = n - 1; i >= 0; i--) {
    const dia = new Date(hoy);
    dia.setDate(hoy.getDate() - i);
    cubos.push({ t: dia.getTime(), fin: 0, valores: CANALES.map(() => 0) });
  }
  cubos.forEach(function (c, i) { c.fin = i + 1 < cubos.length ? cubos[i + 1].t : m.ahora; });
  const anotar = function (t, ci, cantidad) {
    if (t < cubos[0].t || cantidad <= 0 || ci >= CANALES.length) return;
    let i = cubos.length - 1;
    while (i > 0 && cubos[i].t > t) i--;
    cubos[i].valores[ci] += cantidad;
  };
  const vivos = {};
  for (const v of m.videos) vivos[v.id] = v;
  for (const id in m.diario) {
    const s = m.diario[id], vivo = vivos[id];
    const serie = s.puntos.slice();
    if (vivo) serie.push({ t: m.ahora, v: vivo.vistas });
    // La diferencia entre dos lecturas se anota en el día de la primera.
    for (let k = 1; k < serie.length; k++) anotar(serie[k - 1].t, s.ci, serie[k].v - serie[k - 1].v);
    // Un video publicado con el registro ya en marcha: lo que sumó antes de su primera lectura.
    if (vivo && vivo.publicado > m.registroDesde) anotar(vivo.publicado, s.ci, serie[0].v);
  }
  for (const v of m.videos) {
    if (!m.diario[v.id] && v.publicado > m.registroDesde) anotar(v.publicado, v.ci, v.vistas);
  }
  return cubos;
}

// Vistas que un video ganó en el período, con la misma cuenta que las columnas.
function ganado(m, v, clave, inicio) {
  if (clave === '24h') return m.h24[v.id] || 0;
  if (v.publicado >= inicio && v.publicado > m.registroDesde) return v.vistas;
  const s = m.diario[v.id];
  if (!s) return null;
  const base = s.puntos.find((p) => p.t >= inicio) || s.puntos[s.puntos.length - 1];
  return Math.max(0, v.vistas - base.v);
}

// Antes de que el servidor estabilizara las lecturas, YouTube alternaba entre
// dos valores con minutos de diferencia. Una lectura que vuelve al valor
// anterior en menos de 15 minutos no es un cambio real.
function sinRebotes(filas) {
  const limpias = [];
  for (let i = 0; i < filas.length; i++) {
    const previa = limpias[limpias.length - 1], siguiente = filas[i + 1];
    if (previa && siguiente && filas[i].v !== previa.v && siguiente.v === previa.v && siguiente.t - filas[i].t < 15 * 60000) continue;
    limpias.push(filas[i]);
  }
  return limpias;
}

function seriesDeSubs(m, inicio) {
  return m.canales.map(function (c) {
    const filas = m.historia.filter((f) => f[1] === c.ci).map((f) => ({ t: f[0], v: Number(f[2]) || 0 })).sort((a, b) => a.t - b.t);
    const cambios = [];
    for (const f of sinRebotes(filas)) {
      if (!cambios.length || cambios[cambios.length - 1].v !== f.v) cambios.push(f);
    }
    const puntos = [];
    let anterior = null;
    for (const f of cambios) {
      if (f.t < inicio) anterior = f;
      else puntos.push(f);
    }
    if (anterior) puntos.unshift({ t: inicio, v: anterior.v });
    if (!c.falta && (!puntos.length || puntos[puntos.length - 1].v !== c.subs)) puntos.push({ t: m.ahora, v: c.subs });
    return { ci: c.ci, puntos: puntos };
  });
}

/* ---------- Trazas pequeñas ---------- */

function netosDeSubs(m) {
  const netos = CANALES.map(() => 0);
  for (const f of m.cambiosSubs) if (netos[f[1]] !== undefined) netos[f[1]] += Number(f[2]) || 0;
  return netos;
}

// Suma de los suscriptores de los canales en cada momento en que alguno cambió.
function totalDeSubs(m, inicio) {
  const series = seriesDeSubs(m, inicio).filter((s) => s.puntos.length);
  const tiempos = Array.from(new Set([].concat.apply([], series.map((s) => s.puntos.map((p) => p.t))))).sort((a, b) => a - b);
  return tiempos.map(function (t) {
    let v = 0;
    for (const s of series) {
      let ultimo = s.puntos[0].v;
      for (const p of s.puntos) { if (p.t <= t) ultimo = p.v; else break; }
      v += ultimo;
    }
    return { t: t, v: v };
  });
}

// Las trazas de las tarjetas no llevan ejes ni rótulos: dan la forma de la
// serie y la cifra exacta está en la gráfica grande. Se estiran al ancho de
// la tarjeta, por eso el trazo no escala con el dibujo.
const TRAZA = { ancho: 168, alto: 40 };
function lienzoDeTraza() {
  return trazar('svg', { class: 'traza', viewBox: '0 0 ' + TRAZA.ancho + ' ' + TRAZA.alto, preserveAspectRatio: 'none', focusable: 'false' });
}
// Columnas: la última, que es el período en curso, va resaltada.
function trazaDeColumnas(valores) {
  const svg = lienzoDeTraza();
  const hueco = TRAZA.ancho / valores.length;
  const grosor = Math.min(14, hueco * 0.68);
  const maximo = Math.max(1, Math.max.apply(null, valores));
  valores.forEach(function (v, i) {
    const h = v > 0 ? Math.max(2, (v / maximo) * (TRAZA.alto - 2)) : 1;
    svg.append(trazar('rect', {
      class: i === valores.length - 1 ? 'actual' : null,
      x: (i * hueco + (hueco - grosor) / 2).toFixed(2), y: (TRAZA.alto - h).toFixed(2), width: grosor.toFixed(2), height: h.toFixed(2),
    }));
  });
  return svg;
}
// Escalones de una serie [{t, v}] entre dos momentos.
function trazaDeEscalones(puntos, inicio, fin) {
  const svg = lienzoDeTraza();
  if (!puntos.length || fin <= inicio) return svg;
  const valores = puntos.map((p) => p.v);
  const min = Math.min.apply(null, valores), max = Math.max.apply(null, valores);
  const x = (t) => TRAZA.ancho * Math.max(0, (t - inicio) / (fin - inicio));
  const y = (v) => (max === min ? TRAZA.alto / 2 : 3 + (TRAZA.alto - 6) * (1 - (v - min) / (max - min)));
  let d = 'M' + x(puntos[0].t).toFixed(1) + ',' + y(puntos[0].v).toFixed(1);
  for (let k = 1; k < puntos.length; k++) d += 'H' + x(puntos[k].t).toFixed(1) + 'V' + y(puntos[k].v).toFixed(1);
  svg.append(trazar('path', { class: 'linea', d: d + 'H' + TRAZA.ancho }));
  return svg;
}
// Una barra frente a una marca: el valor de ahora y su referencia.
function trazaDeComparacion(valor, referencia) {
  const svg = lienzoDeTraza();
  const tope = Math.max(valor, referencia * 2, 1);
  const y = TRAZA.alto / 2 - 4;
  svg.append(trazar('rect', { class: 'pista', x: 0, y: y, width: TRAZA.ancho, height: 8 }));
  if (valor > 0) svg.append(trazar('rect', { class: 'actual', x: 0, y: y, width: Math.max(2, (valor / tope) * TRAZA.ancho).toFixed(2), height: 8 }));
  if (referencia > 0) {
    const x = ((referencia / tope) * TRAZA.ancho).toFixed(2);
    svg.append(trazar('line', { class: 'marca', x1: x, x2: x, y1: y - 7, y2: y + 15 }));
  }
  return svg;
}

// «a las 14 horas», «a los 3 días».
function alCabo(ms) {
  const horas = Math.max(1, Math.round(ms / HORA));
  if (horas < 48) return horas === 1 ? 'a la hora' : 'a las ' + horas + ' horas';
  return 'a los ' + Math.round(ms / DIA) + ' días';
}

// Señales: lo que conviene mirar ya. Un video propio que en la última hora
// triplicó su promedio del día, y un video de un canal de referencia que pasó
// de 1.6 veces la mediana de su canal (el umbral del estudio de reenfoque).
function pintarSenales(m) {
  const senales = [];
  for (const v of m.videos) {
    const h1 = Number(m.h1[v.id]) || 0, resto = (Number(m.h24[v.id]) || 0) - h1;
    if (h1 < 20 || m.ahora - m.bitacoraDesde < 6 * HORA) continue;
    if (resto <= 0) senales.push({ peso: h1, nodo: [enlaceExterno(v.url, v.titulo), ' sumó ' + fmt(h1) + ' vistas en la última hora, las únicas del día.'] });
    else if (h1 >= 3 * (resto / 23)) senales.push({ peso: h1, nodo: [enlaceExterno(v.url, v.titulo), ' sumó ' + fmt(h1) + ' vistas en la última hora, ' + unaCifra(h1 / (resto / 23)) + ' veces su promedio del día.'] });
  }
  const propias = senales.sort((a, b) => b.peso - a.peso).slice(0, 2);
  const ajenas = [];
  for (const v of m.tendencias ? m.tendencias.ref : []) {
    if (!(v.med > 0) || Math.round((10 * v.n) / v.med) < 16) continue;
    ajenas.push({ peso: v.n / v.med, nodo: [
      enlaceExterno('https://www.youtube.com/watch?v=' + encodeURIComponent(v.id), v.t), ', de ' + v.c + ', va ' + unaCifra(v.n / v.med) + ' veces sobre la mediana de su canal ' + alCabo(m.ahora - v.p) + ' de publicado. ',
      crear('a', { href: '#tendencias' }, 'Ver en el radar'),
    ] });
  }
  const lista = propias.concat(ajenas.sort((a, b) => b.peso - a.peso).slice(0, 3));
  $('#senales').hidden = lista.length === 0;
  reemplazar($('#senales-lista'), lista.map((s) => crear('li', null, s.nodo)));
}

function ponerCifra(nodo, valor) {
  const antes = nodo.dataset.valor === undefined ? null : Number(nodo.dataset.valor);
  nodo.dataset.valor = valor;
  if (antes === null || antes === valor || sinMovimiento.matches) {
    nodo.textContent = fmt(valor);
    return;
  }
  // Reinicia el subrayado aunque la clase ya estuviera puesta.
  nodo.classList.remove('cambio');
  void nodo.offsetWidth;
  nodo.classList.add('cambio');
  const inicio = performance.now();
  const cuadro = function (t) {
    const k = Math.min(1, (t - inicio) / 700);
    const meta = Number(nodo.dataset.valor);
    if (k >= 1 || meta !== valor) { nodo.textContent = fmt(meta); return; }
    nodo.textContent = fmt(Math.round(antes + (valor - antes) * (1 - Math.pow(1 - k, 3))));
    requestAnimationFrame(cuadro);
  };
  requestAnimationFrame(cuadro);
}

function miniatura(v, clase, tamano) {
  const img = crear('img', { src: 'https://i.ytimg.com/vi/' + v.id + '/' + tamano + '.jpg', alt: '', loading: 'lazy', decoding: 'async' });
  // La miniatura va junto al título, que ya es un enlace al mismo video.
  return enlaceExterno(v.url, img, { clase: clase + (v.corto ? ' short' : ''), tabindex: '-1', 'aria-hidden': 'true' });
}

function cifraDeVideo(v, texto, seccion) {
  if (!esDueno()) return texto;
  return enlaceExterno('https://studio.youtube.com/video/' + v.id + '/' + seccion, texto);
}

/* ---------- Hoy: el titular ---------- */

function analiticaDe(m, ci) {
  return m.analytics && m.analytics.canales ? m.analytics.canales[ci] || null : null;
}

// Una frase que resume el día con las cifras de la bitácora.
function pintarResumen(m) {
  const hoy = new Date(m.ahora);
  $('#fecha-hoy').textContent = diaCompleto.format(hoy).replace(/^./, (l) => l.toUpperCase());
  const partes = [];
  const cubos = cubosDeVistas(m, '24h');
  const vistas = CANALES.map((c, ci) => sumar(cubos.map((x) => x.valores[ci])));
  const netos = netosDeSubs(m);
  const ventana = ventanaDeUnDia(m);
  if (!m.bitacoraDesde) {
    reemplazar($('#resumen'), ['Vigía empezó a registrar hace poco: el movimiento del día aparece con las próximas lecturas.']);
    return;
  }
  const total = sumar(vistas), subs = sumar(netos);
  partes.push(conMayuscula(ventana) + ', los dos canales sumaron ', crear('strong', null, cuantos(total, 'vista', 'vistas')));
  partes.push(subs > 0 ? [' y ', crear('strong', null, cuantos(subs, 'suscriptor nuevo', 'suscriptores nuevos'))] : subs < 0 ? [' y perdieron ', crear('strong', null, cuantos(-subs, 'suscriptor', 'suscriptores'))] : ', sin cambio de suscriptores');
  const lider = m.videos.filter((v) => m.h24[v.id] > 0).sort((a, b) => m.h24[b.id] - m.h24[a.id])[0];
  if (lider) partes.push('. Lo que más empuja: ', enlaceExterno(lider.url, '«' + lider.titulo + '»'), ', de ' + m.canales[lider.ci].nombre + ', con ' + cuantos(m.h24[lider.id], 'vista', 'vistas') + '.');
  else partes.push('.');
  reemplazar($('#resumen'), partes);
}
function conMayuscula(texto) { return texto.charAt(0).toUpperCase() + texto.slice(1); }

/* ---------- Hoy: los dos canales ---------- */

function medidor(nodo, valor, meta, rotulo, pie) {
  const pct = Math.min(100, (100 * valor) / meta);
  reemplazar(nodo, [
    crear('div', { clase: 'meta-fila' }, crear('span', null, rotulo), crear('span', { clase: 'meta-cifra' }, crear('strong', null, fmt(valor)), ' de ' + fmt(meta))),
    crear('div', { clase: 'medidor', role: 'img', 'aria-label': rotulo + ': ' + fmt(valor) + ' de ' + fmt(meta) }, crear('span', { estilo: { width: Math.max(0.8, pct).toFixed(1) + '%' } })),
    pie ? crear('p', { clase: 'meta-pie' }, pie) : null,
  ]);
}

function ritmoDeSubs(m, c) {
  const filas = m.historia.filter((f) => f[1] === c.ci).sort((a, b) => a[0] - b[0]);
  const a = analiticaDe(m, c.ci);
  // Con Analytics, el ritmo sale de los últimos 28 días; si no, de la historia de Vigía.
  if (a && a.subsGanados28 - a.subsPerdidos28 > 0) {
    const porDia = (a.subsGanados28 - a.subsPerdidos28) / 28;
    return unaCifra(porDia * 7) + ' por semana en los últimos 28 días; a ese ritmo llegaría el ' + fechaNumerica.format(m.ahora + ((META_SUBS - c.subs) / porDia) * DIA) + '.';
  }
  if (filas.length && (m.ahora - filas[0][0]) / DIA >= 3) {
    const ganados = c.subs - Number(filas[0][2]);
    if (ganados > 0) {
      const porDia = ganados / ((m.ahora - filas[0][0]) / DIA);
      return 'A ' + unaCifra(porDia) + ' por día llegaría el ' + fechaNumerica.format(m.ahora + ((META_SUBS - c.subs) / porDia) * DIA) + '.';
    }
  }
  return '';
}

function pintarInsignias(m) {
  const cubos = cubosDeVistas(m, '24h');
  const netos = netosDeSubs(m);
  const ventana = ventanaDeUnDia(m);
  const deCanal = {};
  for (const v of m.videos) deCanal[v.id] = v.ci;
  const ultimaHora = CANALES.map(() => 0);
  for (const id in m.h1) if (ultimaHora[deCanal[id]] !== undefined) ultimaHora[deCanal[id]] += Number(m.h1[id]) || 0;

  for (const c of m.canales) {
    const bloque = document.querySelector('.insignia[data-canal="' + c.id + '"]');
    if (!bloque) continue;
    const campo = (nombre) => $('[data-campo="' + nombre + '"]', bloque);
    bloque.querySelectorAll('[data-campo="canal"]').forEach((a) => { a.href = c.url; });
    const logo = campo('logo');
    if (c.logo && logo.getAttribute('src') !== c.logo) { logo.src = c.logo; logo.hidden = false; }
    if (c.falta) { campo('aviso').textContent = 'YouTube no devolvió este canal en la última lectura; se muestran las cifras anteriores.'; continue; }
    campo('aviso').textContent = '';

    ponerCifra(campo('subs'), c.subs);
    reemplazar(campo('subs-delta'), m.bitacoraDesde ? (netos[c.ci] ? [crear('strong', null, conSigno(netos[c.ci])), ' ' + ventana] : ['Sin cambio ' + ventana]) : []);

    const a = analiticaDe(m, c.ci);
    medidor(campo('meta-subs'), c.subs, META_SUBS, 'Meta de suscriptores', ritmoDeSubs(m, c));
    if (a) medidor(campo('meta-horas'), Math.round(a.horasLargos365), META_HORAS, 'Meta de horas de largos',
      'Últimos 12 meses. Los Shorts suman aparte ' + fmt(Math.round(a.horas365 - a.horasLargos365)) + ' horas, que no cuentan para esta meta.');
    else reemplazar(campo('meta-horas'), [crear('p', { clase: 'meta-pie' }, 'Las horas de reproducción llegan con la primera lectura de YouTube Analytics.')]);

    const vistas24 = sumar(cubos.map((x) => x.valores[c.ci]));
    const datos = [
      ['vistas en 24 horas', m.bitacoraDesde ? fmt(vistas24) : '–'],
      ['en la última hora', m.bitacoraDesde ? fmt(ultimaHora[c.ci]) : '–'],
      ['vistas en 28 días', a ? fmt(a.vistas28) : '–'],
      ['horas vistas en 28 días', a ? fmt(Math.round(a.minutos28 / 60)) : '–'],
    ];
    reemplazar(campo('datos'), datos.map((d) => crear('div', null, crear('dt', null, d[0]), crear('dd', null, d[1]))));

    // Vistas por día de los últimos 30 días, de Analytics.
    const dias = a ? a.dias : [];
    const figura = campo('dias');
    figura.hidden = dias.length < 2;
    if (dias.length >= 2) {
      const valores = dias.map((d) => d[1]);
      reemplazar($('.ins-traza', figura), [trazaDeColumnas(valores)]);
      const mejor = dias.reduce((x, d) => (d[1] > x[1] ? d : x), dias[0]);
      $('figcaption', figura).textContent = 'Vistas por día, últimos ' + dias.length + ' días. Mejor día: ' + fmt(mejor[1]) + ', el ' + diaYMes.format(fechaLocal(mejor[0])) + '.';
    }

    const caja = campo('ultimo');
    const v = c.ultimoLargo || c.ultimo;
    if (!v) { reemplazar(caja, [crear('p', { clase: 'ultimo-dato' }, 'Sin videos públicos.')]); caja.dataset.video = ''; continue; }
    if (caja.dataset.video !== v.id) {
      caja.dataset.video = v.id;
      reemplazar(caja, [
        crear('h3', null, v.corto ? 'Último Short' : 'Último largo'),
        crear('div', { clase: 'ultimo' }, miniatura(v, 'ultimo-mini', 'hq720'),
          crear('div', { clase: 'ultimo-texto' }, crear('p', { clase: 'ultimo-titulo' }, enlaceExterno(v.url, v.titulo)), crear('p', { clase: 'ultimo-dato' }))),
      ]);
    }
    const an = a && a.videos ? a.videos[v.id] : null;
    reemplazar($('.ultimo-dato', caja), [
      duracion(v.seg) + ', hace ' + lapso(m.ahora - v.publicado) + '. ',
      cifraDeVideo(v, cuantos(v.vistas, 'vista', 'vistas'), 'analytics/tab-overview/period-default'),
      m.h24[v.id] > 0 ? ', ' + fmt(m.h24[v.id]) + ' en 24 horas' : '',
      an && an[3] ? '. Vista media: ' + duracion(an[2]) + ' (' + unaCifra(an[3]) + ' %)' : '', '.',
    ]);
  }
}

// Los cinco videos que más vistas ganaron en la última hora o, si ninguno se
// movió, en las últimas 24.
function pintarMueve(m) {
  const porHora = m.videos.some((v) => m.h1[v.id] > 0);
  const medida = (v) => Number((porHora ? m.h1 : m.h24)[v.id]) || 0;
  const lista = m.videos.filter((v) => medida(v) > 0).sort((a, b) => medida(b) - medida(a) || b.publicado - a.publicado).slice(0, 5);
  const ventana = ventanaDeUnDia(m);
  $('#mueve-nota').textContent = lista.length
    ? (porHora ? 'Vistas ganadas en la última hora.' : conPunto('En la última hora no se movió ningún contador: van las vistas ganadas ' + ventana))
    : (m.bitacoraDesde ? conPunto('Ningún contador se movió ' + ventana) : 'Aparece con las próximas lecturas de Vigía.');
  const tope = lista.length ? medida(lista[0]) : 1;
  reemplazar($('#mueve-lista'), lista.map(function (v) {
    const c = m.canales[v.ci];
    const enElDia = porHora && m.h24[v.id] > 0 ? fmt(m.h24[v.id]) + ' en 24 horas' : fmt(v.vistas) + ' en total';
    return crear('li', { datos: { serie: c.clave } },
      miniatura(v, 'mini', 'mqdefault'),
      crear('div', { clase: 'mueve-texto' },
        enlaceExterno(v.url, v.titulo, { clase: 'video-titulo' }),
        crear('span', { clase: 'video-dato' }, crear('span', { clase: 'clave' }), c.nombre + ' · ' + (v.corto ? 'Short' : 'Largo') + ' · ' + publicadoHace(m, v))),
      crear('div', { clase: 'mueve-cifra' },
        crear('strong', null, '+' + fmt(medida(v))),
        crear('span', { clase: 'barra', 'aria-hidden': 'true' }, crear('span', { estilo: { width: Math.max(3, Math.round(100 * medida(v) / tope)) + '%' } })),
        crear('span', { clase: 'tenue' }, enElDia)));
  }));
}

/* ---------- Crecimiento: gráficas de YouTube Analytics ---------- */

function cubosDeAnalytics(m, indice) {
  const fechas = new Set();
  for (const ci in CANALES) { const a = analiticaDe(m, Number(ci)); if (a) for (const d of a.dias) fechas.add(d[0]); }
  const lista = Array.from(fechas).sort();
  return lista.map(function (f, i) {
    const t = fechaLocal(f).getTime();
    return {
      t: t, fin: i + 1 < lista.length ? fechaLocal(lista[i + 1]).getTime() : t + DIA,
      valores: CANALES.map(function (c, ci) {
        const a = analiticaDe(m, ci);
        const d = a ? a.dias.find((x) => x[0] === f) : null;
        return d ? Math.max(0, Number(indice(d)) || 0) : 0;
      }),
    };
  });
}

function graficaDeAnalytics(m, id, indice, cfg) {
  const cubos = cubosDeAnalytics(m, indice);
  const seccion = $('#' + id);
  seccion.hidden = !m.analytics;
  if (!cubos.length) return;
  const totales = CANALES.map((c, ci) => sumar(cubos.map((x) => x.valores[ci])));
  $('#' + id + '-nota').textContent = cfg.nota(sumar(totales), cubos.length);
  reemplazar($('#' + id + '-leyenda'), m.canales.map((c) => itemDeLeyenda(c, '', fmt(totales[c.ci]))));
  graficaColumnas($('#' + id + '-lienzo'), cubos, {
    descripcion: cfg.descripcion,
    desde: 0, marcas: [], vacio: 'Sin datos de Analytics en este período.',
    titulo: (c) => diaCompleto.format(c.t),
    rotulo: (c) => diaYMes.format(c.t),
    conRotulo: (c, i, w) => (cubos.length - 1 - i) % (w < 420 ? 7 : 5) === 0,
  });
  reemplazar($('#' + id + '-tabla'), [tablaDeDatos(
    [{ texto: 'Día' }].concat(CANALES.map((c) => ({ texto: c.nombre, num: true })), [{ texto: 'Total', num: true }]),
    cubos.slice().reverse().map((c) => [diaCompleto.format(c.t)].concat(c.valores.map(fmt), [fmt(sumar(c.valores))])))]);
}

function pintarAnalytics(m) {
  const leido = m.analytics ? ' Lectura de YouTube Analytics del ' + fechaNumerica.format(m.analytics.leido) + ' a ' + laHora(m.analytics.leido) + '; los dos últimos días suelen venir incompletos.' : '';
  graficaDeAnalytics(m, 'an-vistas', (d) => d[1], {
    descripcion: 'Vistas por día y canal, según YouTube Analytics. Con las flechas se recorre cada día.',
    nota: (total, dias) => cuantos(total, 'vista', 'vistas') + ' en ' + dias + ' días.' + leido,
  });
  graficaDeAnalytics(m, 'an-horas', (d) => Math.round(d[2] / 60), {
    descripcion: 'Horas vistas por día y canal, según YouTube Analytics.',
    nota: (total, dias) => cuantos(total, 'hora vista', 'horas vistas') + ' en ' + dias + ' días, largos y Shorts juntos.',
  });
  graficaDeAnalytics(m, 'an-subs', (d) => d[3], {
    descripcion: 'Suscriptores ganados por día y canal, según YouTube Analytics.',
    nota: function (total, dias) {
      const perdidos = sumar(CANALES.map((c, ci) => { const a = analiticaDe(m, ci); return a ? sumar(a.dias.map((d) => d[4])) : 0; }));
      return cuantos(total, 'suscriptor ganado', 'suscriptores ganados') + ' y ' + cuantos(perdidos, 'perdido', 'perdidos') + ' en ' + dias + ' días.';
    },
  });
}

/* ---------- Videos: retención ---------- */

function graficaRetencion(lienzo, curva, clave, nombre) {
  const ancho = Math.max(240, Math.round(lienzo.clientWidth)), alto = 170;
  const tope = Math.max(1, Math.ceil(Math.max(...curva.map((p) => p[1])) * 5) / 5);
  const margen = { izq: 40, der: 10, arr: 12, aba: 24 };
  const w = ancho - margen.izq - margen.der, h = alto - margen.arr - margen.aba;
  const px = (x) => margen.izq + x * w, py = (y) => margen.arr + h - (y / tope) * h;
  const raiz = trazar('svg', { viewBox: '0 0 ' + ancho + ' ' + alto, role: 'img', tabindex: '0', 'aria-label': 'Retención de ' + nombre + '. Con las flechas se recorre el video.' });
  for (const v of marcasEntre(0, tope, tope > 1 ? 0.5 : 0.25)) {
    raiz.append(trazar('line', { class: v === 0 ? 'base' : 'rejilla', x1: margen.izq, x2: ancho - margen.der, y1: Math.round(py(v)) + 0.5, y2: Math.round(py(v)) + 0.5 }),
      trazar('text', { x: margen.izq - 6, y: py(v) + 4, 'text-anchor': 'end' }, fmt(Math.round(v * 100)) + ' %'));
  }
  for (const x of [0, 0.5, 1]) raiz.append(trazar('text', { x: px(x), y: alto - 6, 'text-anchor': x === 0 ? 'start' : x === 1 ? 'end' : 'middle' }, x === 0 ? 'inicio' : x === 1 ? 'final' : 'mitad'));
  const d = curva.map((p, i) => (i ? 'L' : 'M') + px(p[0]).toFixed(1) + ',' + py(p[1]).toFixed(1)).join('');
  raiz.append(trazar('path', { class: 'trazo', 'data-serie': clave, d: d }));
  const mira = trazar('line', { class: 'mira', y1: margen.arr, y2: py(0), visibility: 'hidden' });
  const punto = trazar('circle', { class: 'punto', 'data-serie': clave, r: 4.5, visibility: 'hidden' });
  raiz.append(mira, punto);
  const globo = globoDe(lienzo);
  globo.hidden = true;
  interaccion(raiz, lienzo, {
    ancho: ancho, primera: 0, ultima: curva.length - 1,
    dePuntero: (x) => Math.max(0, Math.min(curva.length - 1, Math.round(((x - margen.izq) / w) * (curva.length - 1)))),
    vecina: (i, salto) => Math.max(0, Math.min(curva.length - 1, i + salto * 5)),
    mover: function (i) {
      if (i === null) { mira.setAttribute('visibility', 'hidden'); punto.setAttribute('visibility', 'hidden'); globo.hidden = true; return; }
      const p = curva[i], x = px(p[0]);
      mira.setAttribute('x1', x); mira.setAttribute('x2', x); mira.setAttribute('visibility', 'visible');
      punto.setAttribute('cx', x); punto.setAttribute('cy', py(p[1])); punto.setAttribute('visibility', 'visible');
      reemplazar(globo, [crear('p', { clase: 'globo-titulo' }, 'Al ' + fmt(Math.round(p[0] * 100)) + ' % del video'),
        crear('ul', null, filaDeGlobo(clave, fmt(Math.round(p[1] * 100)) + ' %', 'siguen viendo'))]);
      colocarGlobo(lienzo, globo, x * (lienzo.clientWidth / ancho), 0);
    },
  });
  const previo = $('svg', lienzo);
  if (previo) previo.replaceWith(raiz); else lienzo.prepend(raiz);
}

function pintarRetencion(m) {
  const seccion = $('#retencion');
  const fichas = [];
  for (const c of m.canales) {
    const a = analiticaDe(m, c.ci);
    for (const r of a ? a.retencion : []) fichas.push({ c: c, r: r, v: m.videos.find((x) => x.id === r.id), an: a.videos[r.id] });
  }
  seccion.hidden = !fichas.length;
  if (!fichas.length) return;
  const firma = fichas.map((f) => f.r.id + f.r.curva.length).join('|') + '|' + Math.round($('#retencion-lista').clientWidth / 40);
  if (seccion.dataset.firma === firma) return;
  seccion.dataset.firma = firma;
  reemplazar($('#retencion-lista'), fichas.map(function (f) {
    const titulo = f.v ? f.v.titulo : 'Video ' + f.r.id;
    const url = f.v ? f.v.url : 'https://www.youtube.com/watch?v=' + encodeURIComponent(f.r.id);
    const lienzo = crear('div', { clase: 'lienzo lienzo-chico' });
    const li = crear('li', { datos: { serie: f.c.clave } },
      crear('p', { clase: 'video-dato' }, crear('span', { clase: 'clave' }), f.c.nombre),
      crear('p', { clase: 'ret-titulo' }, enlaceExterno(url, titulo)),
      f.an ? crear('p', { clase: 'video-dato' }, cuantos(f.an[0], 'vista', 'vistas') + ' en 12 meses · vista media ' + duracion(f.an[2]) + ' (' + unaCifra(f.an[3]) + ' %)') : null,
      lienzo);
    requestAnimationFrame(() => graficaRetencion(lienzo, f.r.curva, f.c.clave, titulo));
    return li;
  }));
}

/* ---------- Vistas: Hoy, Crecimiento, Videos y Radar ---------- */

function mostrarVista(nombre, desdeHistoria) {
  if (VISTAS.indexOf(nombre) < 0) nombre = 'hoy';
  estado.vista = nombre;
  for (const v of document.querySelectorAll('.vista')) v.hidden = v.dataset.vista !== nombre;
  for (const a of document.querySelectorAll('.pestanas a')) {
    if (a.dataset.vista === nombre) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  }
  if (!desdeHistoria && location.hash !== '#' + nombre) history.replaceState(null, '', '#' + nombre);
  // Las gráficas miden su contenedor: se dibujan cuando la vista ya está visible.
  if (estado.modelo) pintar();
}

function vistaDeEnlace(hash) {
  const id = (hash || '').replace('#', '');
  if (VISTAS.indexOf(id) >= 0) return id;
  const nodo = id ? document.getElementById(id) : null;
  const vista = nodo ? nodo.closest('.vista') : null;
  return vista ? vista.dataset.vista : 'hoy';
}


/* ---------- Gráficas ---------- */

function pasoLimpio(alcance, cortes) {
  const bruto = alcance / cortes;
  const potencia = Math.pow(10, Math.floor(Math.log10(bruto)));
  const f = bruto / potencia;
  return Math.max(1, (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * potencia);
}
function marcasEntre(desde, hasta, paso) {
  const marcas = [];
  for (let v = desde; v <= hasta + paso / 1000; v += paso) marcas.push(v);
  return marcas;
}
function rotuloDeEje(tope) {
  // Un solo estilo por eje: completo hasta 9,999; compacto si el eje llega a 10,000.
  if (tope >= 1000000) return (v) => (v === 0 ? '0' : fmt(v / 1000000) + ' M');
  return tope >= 10000 ? (v) => (v === 0 ? '0' : fmt(v / 1000) + ' mil') : fmt;
}
function anchoDeRotulos(rotulos) {
  return Math.max.apply(null, rotulos.map((r) => r.length)) * 7.4 + 12;
}
function medidas(lienzo) {
  const ancho = Math.max(260, Math.round(lienzo.clientWidth));
  return { ancho: ancho, alto: ancho < 520 ? 250 : 310 };
}

// Globo de una gráfica: se crea una vez y se reutiliza entre lecturas.
function globoDe(lienzo) {
  let globo = $('.globo', lienzo);
  if (!globo) {
    globo = crear('div', { clase: 'globo', role: 'status', hidden: true });
    lienzo.append(globo);
  }
  return globo;
}
function filaDeGlobo(clave, valor, nombre) {
  return crear('li', clave ? { datos: { serie: clave } } : { clase: 'total' },
    clave ? crear('span', { clase: 'clave' }) : crear('span'),
    crear('span', { clase: 'nombre' }, nombre),
    crear('strong', null, valor));
}
function colocarGlobo(lienzo, globo, x, anchoZona) {
  globo.hidden = false;
  const ancho = lienzo.clientWidth;
  let izquierda = x + anchoZona / 2 + 10;
  if (izquierda + globo.offsetWidth > ancho) izquierda = x - anchoZona / 2 - 10 - globo.offsetWidth;
  globo.style.left = Math.max(0, izquierda) + 'px';
  globo.style.top = '26px';
}

// Puntero y teclado comparten una misma «posición activa». mover(null) la quita.
function interaccion(raiz, lienzo, opciones) {
  let activa = null;
  const fijar = function (posicion) {
    activa = posicion;
    opciones.mover(posicion);
  };
  raiz.addEventListener('pointermove', function (e) {
    const caja = raiz.getBoundingClientRect();
    fijar(opciones.dePuntero((e.clientX - caja.left) * (opciones.ancho / caja.width)));
  });
  raiz.addEventListener('pointerdown', function (e) {
    const caja = raiz.getBoundingClientRect();
    fijar(opciones.dePuntero((e.clientX - caja.left) * (opciones.ancho / caja.width)));
  });
  // En pantallas táctiles el globo se queda hasta que se toca fuera de la gráfica.
  raiz.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') fijar(null); });
  raiz.addEventListener('blur', function () { fijar(null); });
  raiz.addEventListener('focus', function () { if (raiz.matches(':focus-visible')) fijar(opciones.ultima); });
  raiz.addEventListener('keydown', function (e) {
    const actual = activa === null ? opciones.ultima : activa;
    let nueva = null;
    if (e.key === 'ArrowLeft') nueva = opciones.vecina(actual, -1);
    else if (e.key === 'ArrowRight') nueva = opciones.vecina(actual, 1);
    else if (e.key === 'Home') nueva = opciones.primera;
    else if (e.key === 'End') nueva = opciones.ultima;
    else if (e.key === 'Escape') { fijar(null); return; }
    else return;
    e.preventDefault();
    fijar(nueva);
  });
}
document.addEventListener('pointerdown', function (e) {
  for (const globo of document.querySelectorAll('.globo:not([hidden])')) {
    if (!globo.parentNode.contains(e.target)) { globo.hidden = true; }
  }
});

function lienzoVacio(lienzo, texto) {
  const previo = $('.lienzo-vacio', lienzo);
  if (previo) previo.remove();
  if (texto) lienzo.append(crear('p', { clase: 'lienzo-vacio' }, texto));
}

function graficaColumnas(lienzo, cubos, cfg) {
  const { ancho, alto } = medidas(lienzo);
  const totales = cubos.map((c) => sumar(c.valores));
  const maximo = Math.max.apply(null, totales);
  const paso = maximo > 0 ? pasoLimpio(Math.max(maximo, 4), 4) : 1;
  const tope = maximo > 0 ? Math.ceil(maximo / paso) * paso : 4;
  const marcas = marcasEntre(0, tope, paso);
  const rotular = rotuloDeEje(tope);
  const margen = { izq: anchoDeRotulos(marcas.map(rotular)), der: 4, arr: 36, aba: 28 };
  const w = ancho - margen.izq - margen.der, h = alto - margen.arr - margen.aba;
  const hueco = w / cubos.length;
  const grosor = Math.max(3, Math.min(24, Math.floor(hueco * 0.64)));
  const py = (v) => margen.arr + h - (v / tope) * h;
  const centro = (i) => margen.izq + (i + 0.5) * hueco;

  const raiz = trazar('svg', { viewBox: '0 0 ' + ancho + ' ' + alto, role: 'img', tabindex: '0', 'aria-label': cfg.descripcion });
  for (const v of marcas) {
    raiz.append(
      trazar('line', { class: v === 0 ? 'base' : 'rejilla', x1: margen.izq, x2: ancho - margen.der, y1: Math.round(py(v)) + 0.5, y2: Math.round(py(v)) + 0.5 }),
      trazar('text', { x: margen.izq - 8, y: py(v) + 4, 'text-anchor': 'end' }, rotular(v)));
  }
  const franja = trazar('rect', { class: 'franja', y: margen.arr, width: hueco, height: h, visibility: 'hidden' });
  raiz.append(franja);

  cubos.forEach(function (c, i) {
    const x0 = centro(i) - grosor / 2, x1 = x0 + grosor;
    const conValor = CANALES.map((canal, ci) => ci).filter((ci) => c.valores[ci] > 0);
    let abajo = py(0);
    conValor.forEach(function (ci, k) {
      const esCima = k === conValor.length - 1;
      const altura = Math.max(1, (c.valores[ci] / tope) * h);
      // Los segmentos apilados se separan con 2 px de fondo, no con un borde.
      const arriba = abajo - altura + (esCima || altura < 4 ? 0 : 2);
      const r = esCima ? Math.min(4, grosor / 2, abajo - arriba) : 0;
      const d = 'M' + x0 + ',' + abajo + 'V' + (arriba + r) + 'Q' + x0 + ',' + arriba + ' ' + (x0 + r) + ',' + arriba +
        'H' + (x1 - r) + 'Q' + x1 + ',' + arriba + ' ' + x1 + ',' + (arriba + r) + 'V' + abajo + 'Z';
      raiz.append(trazar('path', { class: 'barra', 'data-serie': CANALES[ci].clave, d: d }));
      abajo -= altura;
    });
  });

  // Solo se rotula la columna más alta; las demás se leen en el eje, el globo o la tabla.
  if (maximo > 0) {
    const i = totales.indexOf(maximo);
    const x = Math.min(Math.max(centro(i), margen.izq + 14), ancho - 14);
    raiz.append(trazar('text', { class: 'valor', x: x, y: py(maximo) - 7, 'text-anchor': 'middle' }, fmt(maximo)));
  }
  cubos.forEach(function (c, i) {
    if (cfg.conRotulo(c, i, w)) raiz.append(trazar('text', { x: centro(i), y: alto - 8, 'text-anchor': 'middle' }, cfg.rotulo(c)));
  });

  if (cfg.desde > cubos[0].t && cfg.desde < cubos[cubos.length - 1].fin) {
    let i = cubos.length - 1;
    while (i > 0 && cubos[i].t > cfg.desde) i--;
    const x = Math.round(margen.izq + (i + (cfg.desde - cubos[i].t) / (cubos[i].fin - cubos[i].t)) * hueco) + 0.5;
    const aLaDerecha = x < ancho * 0.6;
    raiz.append(
      trazar('line', { class: 'anotacion-linea', x1: x, x2: x, y1: 16, y2: py(0) }),
      trazar('text', { class: 'anotacion', x: x + (aLaDerecha ? 6 : -6), y: 14, 'text-anchor': aLaDerecha ? 'start' : 'end' }, 'Empieza el registro'));
  }

  // Un rombo sobre la columna en la que cambió un título o una miniatura.
  const rombos = {};
  for (const marca of cfg.marcas || []) {
    if (marca.t < cubos[0].t || marca.t >= cubos[cubos.length - 1].fin) continue;
    let i = cubos.length - 1;
    while (i > 0 && cubos[i].t > marca.t) i--;
    (rombos[i] = rombos[i] || []).push(marca.texto);
  }
  for (const i in rombos) {
    const x = centro(Number(i)), y = margen.arr - 16;
    raiz.append(trazar('path', { class: 'rombo', d: 'M' + x + ',' + (y - 5) + 'l5,5l-5,5l-5,-5z' }));
  }

  const globo = globoDe(lienzo);
  globo.hidden = true;
  interaccion(raiz, lienzo, {
    ancho: ancho, primera: 0, ultima: cubos.length - 1,
    dePuntero: (x) => Math.max(0, Math.min(cubos.length - 1, Math.floor((x - margen.izq) / hueco))),
    vecina: (i, salto) => Math.max(0, Math.min(cubos.length - 1, i + salto)),
    mover: function (i) {
      if (i === null) { franja.setAttribute('visibility', 'hidden'); globo.hidden = true; return; }
      franja.setAttribute('x', margen.izq + i * hueco);
      franja.setAttribute('visibility', 'visible');
      const lista = crear('ul');
      CANALES.forEach(function (canal, ci) { lista.append(filaDeGlobo(canal.clave, fmt(cubos[i].valores[ci]), canal.nombre)); });
      lista.append(filaDeGlobo('', fmt(totales[i]), 'Total'));
      for (const texto of rombos[i] || []) lista.append(crear('li', { clase: 'nota' }, texto));
      reemplazar(globo, [crear('p', { clase: 'globo-titulo' }, cfg.titulo(cubos[i])), lista]);
      colocarGlobo(lienzo, globo, centro(i) * (lienzo.clientWidth / ancho), hueco);
    },
  });

  const previo = $('svg', lienzo);
  if (previo) previo.replaceWith(raiz); else lienzo.prepend(raiz);
  lienzoVacio(lienzo, maximo > 0 ? '' : cfg.vacio);
}

function marcasDeTiempo(inicio, fin, cuantas) {
  const pasos = [HORA / 4, HORA / 2, HORA, 2 * HORA, 3 * HORA, 6 * HORA, 12 * HORA, DIA, 2 * DIA, 5 * DIA, 7 * DIA, 14 * DIA];
  const paso = pasos.find((p) => (fin - inicio) / p <= cuantas) || 30 * DIA;
  const marcas = [];
  const d = new Date(inicio);
  if (paso < HORA) {
    const minutos = paso / 60000;
    d.setSeconds(0, 0);
    d.setMinutes(Math.ceil(d.getMinutes() / minutos) * minutos);
    for (; d.getTime() <= fin; d.setMinutes(d.getMinutes() + minutos)) marcas.push({ t: d.getTime(), texto: horaMinuto.format(d) });
  } else if (paso < DIA) {
    const horas = paso / HORA;
    d.setMinutes(0, 0, 0);
    if (d.getTime() < inicio) d.setHours(d.getHours() + 1);
    while (d.getHours() % horas !== 0) d.setHours(d.getHours() + 1);
    for (; d.getTime() <= fin; d.setHours(d.getHours() + horas)) marcas.push({ t: d.getTime(), texto: d.getHours() === 0 ? diaYMes.format(d) : horaSola.format(d) });
  } else {
    const dias = paso / DIA;
    d.setHours(0, 0, 0, 0);
    if (d.getTime() < inicio) d.setDate(d.getDate() + 1);
    for (; d.getTime() <= fin; d.setDate(d.getDate() + dias)) marcas.push({ t: d.getTime(), texto: diaYMes.format(d) });
  }
  return marcas;
}

function graficaEscalones(lienzo, series, inicio, fin, cfg) {
  const { ancho, alto } = medidas(lienzo);
  const conDatos = series.filter((s) => s.puntos.length);
  const valores = [].concat.apply([], conDatos.map((s) => s.puntos.map((p) => p.v)));
  const raiz = trazar('svg', { viewBox: '0 0 ' + ancho + ' ' + alto, role: 'img', tabindex: '0', 'aria-label': cfg.descripcion });
  const previo = $('svg', lienzo);
  const globo = globoDe(lienzo);
  globo.hidden = true;
  if (!valores.length || fin <= inicio) {
    if (previo) previo.replaceWith(raiz); else lienzo.prepend(raiz);
    lienzoVacio(lienzo, cfg.vacio);
    return;
  }
  let bajo = Math.max(0, Math.min.apply(null, valores) - 1), alto2 = Math.max.apply(null, valores) + 1;
  const paso = pasoLimpio(alto2 - bajo, 4);
  bajo = Math.floor(bajo / paso) * paso;
  alto2 = Math.ceil(alto2 / paso) * paso;
  const marcas = marcasEntre(bajo, alto2, paso);
  const rotular = rotuloDeEje(alto2);
  const margen = { izq: anchoDeRotulos(marcas.map(rotular)), der: 14 + anchoDeRotulos(conDatos.map((s) => fmt(s.puntos[s.puntos.length - 1].v))), arr: 36, aba: 28 };
  const w = ancho - margen.izq - margen.der, h = alto - margen.arr - margen.aba;
  const px = (t) => margen.izq + ((t - inicio) / (fin - inicio)) * w;
  const py = (v) => margen.arr + h - ((v - bajo) / (alto2 - bajo)) * h;

  for (const v of marcas) {
    raiz.append(
      trazar('line', { class: v === 0 ? 'base' : 'rejilla', x1: margen.izq, x2: margen.izq + w, y1: Math.round(py(v)) + 0.5, y2: Math.round(py(v)) + 0.5 }),
      trazar('text', { x: margen.izq - 8, y: py(v) + 4, 'text-anchor': 'end' }, rotular(v)));
  }
  for (const marca of marcasDeTiempo(inicio, fin, Math.max(2, Math.floor(w / 72)))) {
    if (px(marca.t) < margen.izq + 12 || px(marca.t) > margen.izq + w - 12) continue;
    raiz.append(trazar('text', { x: px(marca.t), y: alto - 8, 'text-anchor': 'middle' }, marca.texto));
  }

  const mira = trazar('line', { class: 'mira', y1: margen.arr - 6, y2: py(bajo), visibility: 'hidden' });
  raiz.append(mira);
  const finales = [];
  for (const s of conDatos) {
    const clave = CANALES[s.ci].clave;
    let d = 'M' + px(s.puntos[0].t).toFixed(1) + ',' + py(s.puntos[0].v).toFixed(1);
    for (let k = 1; k < s.puntos.length; k++) d += 'H' + px(s.puntos[k].t).toFixed(1) + 'V' + py(s.puntos[k].v).toFixed(1);
    d += 'H' + px(fin).toFixed(1);
    const ultimo = s.puntos[s.puntos.length - 1].v;
    raiz.append(trazar('path', { class: 'trazo', 'data-serie': clave, d: d }));
    finales.push({ s: s, clave: clave, v: ultimo, y: py(ultimo), yTexto: py(ultimo) });
  }
  // Rótulos de final de línea: si dos quedan a menos de 14 px, se apartan lo justo.
  finales.sort((a, b) => a.y - b.y);
  for (let k = 1; k < finales.length; k++) {
    const falta = 14 - (finales[k].yTexto - finales[k - 1].yTexto);
    if (falta > 0 && finales[k].v !== finales[k - 1].v) { finales[k - 1].yTexto -= falta / 2; finales[k].yTexto += falta / 2; }
  }
  const marcadores = {};
  for (const f of finales) {
    raiz.append(trazar('circle', { class: 'punto', 'data-serie': f.clave, cx: px(fin), cy: f.y, r: 5 }));
    raiz.append(trazar('text', { class: 'valor', x: px(fin) + 11, y: f.yTexto + 4.5 }, fmt(f.v)));
    marcadores[f.s.ci] = trazar('circle', { class: 'punto', 'data-serie': f.clave, r: 5, visibility: 'hidden' });
    raiz.append(marcadores[f.s.ci]);
  }
  const valorEn = function (s, t) {
    let v = null;
    for (const p of s.puntos) { if (p.t <= t) v = p.v; else break; }
    return v;
  };
  const salto = (fin - inicio) / 48;
  interaccion(raiz, lienzo, {
    ancho: ancho, primera: inicio, ultima: fin,
    dePuntero: (x) => Math.max(inicio, Math.min(fin, inicio + ((x - margen.izq) / w) * (fin - inicio))),
    vecina: (t, direccion) => Math.max(inicio, Math.min(fin, t + direccion * salto)),
    mover: function (t) {
      if (t === null) {
        mira.setAttribute('visibility', 'hidden');
        for (const ci in marcadores) marcadores[ci].setAttribute('visibility', 'hidden');
        globo.hidden = true;
        return;
      }
      const x = Math.round(px(t)) + 0.5;
      mira.setAttribute('x1', x);
      mira.setAttribute('x2', x);
      mira.setAttribute('visibility', 'visible');
      const lista = crear('ul');
      for (const s of series) {
        const v = valorEn(s, t);
        lista.append(filaDeGlobo(CANALES[s.ci].clave, v === null ? '–' : fmt(v), CANALES[s.ci].nombre));
        if (!marcadores[s.ci]) continue;
        if (v === null) { marcadores[s.ci].setAttribute('visibility', 'hidden'); continue; }
        marcadores[s.ci].setAttribute('cx', x);
        marcadores[s.ci].setAttribute('cy', py(v));
        marcadores[s.ci].setAttribute('visibility', 'visible');
      }
      reemplazar(globo, [crear('p', { clase: 'globo-titulo' }, fechaConHora.format(t)), lista]);
      colocarGlobo(lienzo, globo, x * (lienzo.clientWidth / ancho), 0);
    },
  });
  if (previo) previo.replaceWith(raiz); else lienzo.prepend(raiz);
  lienzoVacio(lienzo, '');
}

function itemDeLeyenda(c, claseDeClave, valor, extra) {
  return crear('li', { datos: { serie: c.clave } },
    crear('span', { clase: 'clave ' + claseDeClave }),
    c.logo ? crear('img', { src: c.logo, alt: '', width: 20, height: 20, loading: 'lazy' }) : null,
    enlaceExterno(c.url, c.nombre), ' ', crear('strong', null, valor),
    extra ? crear('span', { clase: 'tenue' }, extra) : null);
}

function tablaDeDatos(cabeceras, filas) {
  return crear('table', null,
    crear('thead', null, crear('tr', null, cabeceras.map((c, i) => crear('th', { scope: 'col', clase: i > 0 && c.num ? 'num' : '' }, c.texto)))),
    crear('tbody', null, filas.map((f) => crear('tr', null, f.map((celda, i) =>
      i === 0 ? crear('th', { scope: 'row' }, celda) : crear('td', { clase: cabeceras[i].num ? 'num' : '' }, celda))))));
}

function pintarTablero(m) {
  const clave = estado.periodo, periodo = PERIODOS[clave];
  const cubos = cubosDeVistas(m, clave);
  const inicio = cubos[0].t;
  const porHoras = clave === '24h';
  const desde = porHoras ? m.bitacoraDesde : (isFinite(m.registroDesde) ? m.registroDesde : 0);

  $('#periodo-nota').textContent = desde > inicio
    ? conPunto((porHoras ? 'Las vistas por hora se registran desde el ' : 'El registro empezó el ') + fechaNumerica.format(desde) + ' a ' + laHora(desde))
    : '';

  // Vistas ganadas
  const totalPorCanal = CANALES.map((c, ci) => sumar(cubos.map((cubo) => cubo.valores[ci])));
  const total = sumar(totalPorCanal);
  const marcas = cambiosDe(m).map((c) => ({ t: c.t, texto: (c.tipo === 'titulo' ? 'Cambio de título: ' : 'Cambio de miniatura: ') + c.video.titulo }));
  const conMarca = marcas.some((x) => x.t >= inicio);
  $('#vistas-nota').textContent = (total > 0 ? cuantos(total, 'vista', 'vistas') + ' en ' + periodo.nombre + ', por ' + periodo.unidad + '.' : '')
    + (conMarca ? ' El rombo marca un cambio de título o de miniatura.' : '');
  reemplazar($('#vistas-leyenda'), m.canales.map((c) => itemDeLeyenda(c, '', fmt(totalPorCanal[c.ci]))));
  const rotuloLargo = function (c) {
    if (!porHoras) return diaCompleto.format(c.t);
    return diaYMes.format(c.t) + ', de ' + horaSola.format(c.t) + ' a ' + horaSola.format(c.fin);
  };
  graficaColumnas($('#vistas-lienzo'), cubos, {
    descripcion: 'Vistas ganadas por ' + periodo.unidad + ' y canal en ' + periodo.nombre + '. Con las flechas se recorre cada ' + periodo.unidad + '; la tabla tiene las mismas cifras.',
    desde: desde,
    marcas: marcas,
    vacio: 'Sin vistas registradas en este período.',
    titulo: rotuloLargo,
    rotulo: (c) => (porHoras ? horaSola.format(c.t) : clave === '7d' ? diaDeSemana.format(c.t).replace(',', '') : diaYMes.format(c.t)),
    conRotulo: function (c, i, w) {
      if (porHoras) return new Date(c.t).getHours() % (w < 420 ? 6 : 3) === 0;
      if (clave === '7d') return w >= 340 || (cubos.length - 1 - i) % 2 === 0;
      return (cubos.length - 1 - i) % (w < 420 ? 7 : 5) === 0;
    },
  });
  reemplazar($('#vistas-tabla'), [tablaDeDatos(
    [{ texto: porHoras ? 'Hora' : 'Día' }].concat(CANALES.map((c) => ({ texto: c.nombre, num: true })), [{ texto: 'Total', num: true }]),
    cubos.slice().reverse().map((c) => [rotuloLargo(c)].concat(c.valores.map(fmt), [fmt(sumar(c.valores))])))]);

  // Suscriptores
  const series = seriesDeSubs(m, inicio);
  const primeros = series.filter((s) => s.puntos.length).map((s) => s.puntos[0].t);
  const inicioSubs = primeros.length ? Math.max(inicio, Math.min.apply(null, primeros)) : inicio;
  $('#subs-nota').textContent = 'Cada escalón es un cambio publicado por YouTube.';
  reemplazar($('#subs-leyenda'), m.canales.map(function (c) {
    if (c.falta) return itemDeLeyenda(c, 'clave-linea', 'sin lectura', '');
    const s = series[c.ci];
    const cambio = s.puntos.length ? c.subs - s.puntos[0].v : 0;
    return itemDeLeyenda(c, 'clave-linea', fmt(c.subs), cambio ? ' (' + (cambio > 0 ? '+' : '−') + fmt(Math.abs(cambio)) + ')' : '');
  }));
  graficaEscalones($('#subs-lienzo'), series, inicioSubs, m.ahora, {
    descripcion: 'Suscriptores de cada canal en ' + periodo.nombre + '. Con las flechas se recorre el tiempo; la tabla tiene las mismas cifras.',
    vacio: 'Sin lecturas de suscriptores en este período.',
  });
  const filas = [];
  for (const s of series) for (const p of s.puntos) filas.push({ t: p.t, ci: s.ci, v: p.v });
  filas.sort((a, b) => b.t - a.t || a.ci - b.ci);
  reemplazar($('#subs-tabla'), [tablaDeDatos(
    [{ texto: 'Fecha y hora' }, { texto: 'Canal' }, { texto: 'Suscriptores', num: true }],
    filas.map((f) => [fechaConHora.format(f.t), CANALES[f.ci].nombre, fmt(f.v)]))]);

  $('#col-periodo').textContent = 'En ' + periodo.nombre;
  return inicio;
}

// Vistas por día de un video antes y después de un momento, con la lectura
// diaria. Entre dos lecturas se reparte parejo, así que es una aproximación.
function ritmoAlrededor(m, v, t) {
  const s = m.diario[v.id];
  if (!s) return null;
  const serie = s.puntos.concat([{ t: m.ahora, v: v.vistas }]);
  const en = function (x) {
    if (x <= serie[0].t) return null;
    for (let k = 1; k < serie.length; k++) {
      if (x <= serie[k].t) return serie[k - 1].v + (serie[k].v - serie[k - 1].v) * ((x - serie[k - 1].t) / (serie[k].t - serie[k - 1].t));
    }
    return serie[serie.length - 1].v;
  };
  const alCambio = en(t);
  if (alCambio === null) return null;
  const inicio = Math.max(serie[0].t, t - 2 * DIA);
  const antes = t - inicio >= DIA / 2 ? (alCambio - (en(inicio) === null ? serie[0].v : en(inicio))) / ((t - inicio) / DIA) : null;
  const despues = m.ahora - t >= DIA ? (v.vistas - alCambio) / ((m.ahora - t) / DIA) : null;
  return { antes: antes, despues: despues };
}

function fraseDeCambio(m, c) {
  const que = c.tipo === 'titulo' ? 'Título cambiado ' : 'Miniatura cambiada ';
  const r = ritmoAlrededor(m, c.video, c.t);
  let ritmo = '';
  if (r && r.antes !== null && r.despues !== null) ritmo = ': antes, ' + fmt(Math.round(r.antes)) + ' vistas por día; después, ' + fmt(Math.round(r.despues));
  else if (r && r.despues === null) ritmo = ': la comparación sale al cumplirse un día';
  const cuando = new Date(c.t).toDateString() === new Date(m.ahora).toDateString() ? 'hoy a ' + laHora(c.t) : 'el ' + fechaNumerica.format(c.t) + ' a ' + laHora(c.t);
  return conPunto(que + cuando + ritmo);
}

/* ---------- Tendencias: lo que se mueve fuera de los canales ---------- */

function videoAjeno(v) {
  const corto = v.s > 0 && v.s <= 180;
  return { id: v.id, corto: corto, url: (corto ? 'https://www.youtube.com/shorts/' : 'https://www.youtube.com/watch?v=') + encodeURIComponent(v.id) };
}
// Vistas que el video sumó en una hora, con sus dos últimas lecturas.
function porHoraDe(v) {
  if (v.a === undefined || !(v.m >= 20)) return null;
  return Math.max(0, Math.round(((v.n - v.a) * 60) / v.m));
}
function segmentos(nombre, opciones, actual) {
  return crear('div', { clase: 'segmentos', datos: { n: String(opciones.length) } }, opciones.map((o) => crear('label', null,
    crear('input', { type: 'radio', name: nombre, value: o[0], checked: o[0] === actual }), crear('span', null, o[1]))));
}
function filtroDe(rotulo, nombre, opciones, actual) {
  return crear('fieldset', { clase: 'filtro' }, crear('legend', null, rotulo), segmentos(nombre, opciones, actual));
}

function filaDeVideoAjeno(m, v, puesto, tope, extra) {
  const a = videoAjeno(v);
  const ph = porHoraDe(v);
  const dato = [v.c];
  if (v.k && CATEGORIAS[v.k] && !extra) dato.push(CATEGORIAS[v.k]);
  if (v.p) dato.push('hace ' + lapso(m.ahora - v.p));
  if (v.s) dato.push(a.corto ? 'Short' : duracion(v.s));
  return crear('li', null,
    puesto ? crear('span', { clase: 'puesto', 'aria-hidden': 'true' }, String(puesto)) : null,
    miniatura(a, 'mini', 'mqdefault'),
    crear('div', { clase: 'tend-texto' },
      enlaceExterno(a.url, v.t, { clase: 'video-titulo' }),
      crear('span', { clase: 'video-dato' }, dato.join(' · '))),
    crear('div', { clase: 'tend-cifra' },
      crear('span', null, crear('strong', null, fmt(v.n)), crear('span', { clase: 'tenue' }, v.n === 1 ? ' vista' : ' vistas')),
      extra || crear('span', { clase: 'barra', 'aria-hidden': 'true' }, crear('span', { estilo: { width: Math.max(2, Math.round((100 * v.n) / tope)) + '%' } })),
      ph ? crear('span', { clase: 'video-ahora' }, '+' + fmt(ph) + ' en la última hora') : null));
}

function panelDeReferencia(m, t) {
  const filas = t.ref.filter((v) => !estado.tendCanal || v.ni === estado.tendCanal)
    .map((v) => ({ v: v, razon: v.med > 0 ? v.n / v.med : 0 })).sort((a, b) => b.razon - a.razon);
  if (!filas.length) return [crear('p', { clase: 'vacio' }, 'Los canales de referencia no publicaron videos largos en los últimos 10 días.')];
  // La barra llega a 3 veces la mediana; la raya marca 1 vez.
  const tope = 3;
  const lista = crear('ol', { clase: 'tend-lista' }, filas.map(function (f) {
    // El umbral se aplica a la cifra que se muestra, redondeada a un decimal.
    const pasa = Math.round(f.razon * 10) >= 16;
    const frente = f.razon >= 1 ? unaCifra(f.razon) + (f.razon === 1 ? ' vez' : ' veces') + ' la mediana' : fmt(Math.round(f.razon * 100)) + ' % de la mediana';
    return filaDeVideoAjeno(m, f.v, 0, 1, crear('span', { clase: 'frente' + (pasa ? ' pasa' : '') },
      crear('span', { clase: 'medidor-razon', 'aria-hidden': 'true' }, crear('span', { estilo: { width: Math.max(1.5, Math.min(100, (100 * f.razon) / tope)).toFixed(1) + '%' } })),
      (pasa ? '▲ ' : '') + frente + ' de su canal (' + fmt(f.v.med) + ')'));
  }));
  const canales = t.canales.filter((c) => !estado.tendCanal || c.nicho === estado.tendCanal).sort((a, b) => b.subs - a.subs);
  return [lista, crear('p', { clase: 'tend-pie' },
    cuantos(canales.length, 'canal', 'canales') + ': ',
    canales.map((c, i) => [i ? ', ' : '', enlaceExterno('https://www.youtube.com/channel/' + encodeURIComponent(c.id), c.nombre), ' (' + fmt(c.subs) + ')']), '.')];
}

function panelDeYouTube(m, t) {
  const vistos = {};
  let lista = t.viral.concat(t.largos).filter(function (v) {
    if (vistos[v.id]) return false;
    vistos[v.id] = true;
    return true;
  });
  if (estado.tendFormato === 'largo') lista = lista.filter((v) => v.s > 180);
  if (estado.tendFormato === 'short') lista = lista.filter((v) => v.s <= 180);
  if (estado.tendSin) lista = lista.filter((v) => v.k !== '10' && v.k !== '20');
  lista.sort((a, b) => b.n - a.n);
  lista = lista.slice(0, 30);
  if (!lista.length) return [crear('p', { clase: 'vacio' }, 'Sin videos con ese filtro.')];
  const tope = lista[0].n || 1;
  return [crear('ol', { clase: 'tend-lista' }, lista.map((v, i) => filaDeVideoAjeno(m, v, i + 1, tope, null)))];
}

function panelDeGoogle(m) {
  const g = estado.externos && estado.externos.google ? estado.externos.google[estado.pais] : null;
  if (!g || !Array.isArray(g.t) || !g.t.length) return [crear('p', { clase: 'vacio' }, 'Todavía no hay lectura de Google Trends para este país.')];
  return [crear('ol', { clase: 'tend-lista google' }, g.t.map(function (b, i) {
    return crear('li', null,
      crear('span', { clase: 'puesto', 'aria-hidden': 'true' }, String(i + 1)),
      crear('div', { clase: 'tend-texto' },
        crear('span', { clase: 'video-titulo' }, b.q),
        b.nt ? crear('span', { clase: 'video-dato' }, b.nu ? enlaceExterno(b.nu, b.nt) : b.nt, b.nf ? ' · ' + b.nf : '') : null),
      crear('div', { clase: 'tend-cifra' },
        b.n ? crear('span', null, crear('strong', null, b.n), crear('span', { clase: 'tenue' }, ' búsquedas')) : null,
        b.p ? crear('span', { clase: 'tenue' }, 'hace ' + lapso(Math.max(60000, m.ahora - b.p))) : null,
        enlaceExterno('https://www.youtube.com/results?search_query=' + encodeURIComponent(b.q), 'Buscar en YouTube', { clase: 'video-ahora' })));
  }))];
}

function panelOficial(m, t) {
  const lista = (t.oficial[estado.pais] || []).slice().sort((a, b) => b.n - a.n);
  if (!lista.length) return [crear('p', { clase: 'vacio' }, 'YouTube no devolvió la lista de este país en la última lectura.')];
  const tope = lista[0].n || 1;
  return [crear('ol', { clase: 'tend-lista' }, lista.map((v, i) => filaDeVideoAjeno(m, v, i + 1, tope, null)))];
}

function pintarTendencias(m, forzar) {
  const t = m.tendencias;
  const externos = estado.externos;
  const hayGoogle = !!(externos && externos.google);
  if (!t && !hayGoogle) { $('#tendencias').hidden = true; return; }
  $('#tendencias').hidden = false;
  if (!t && estado.tend !== 'google') { estado.tend = 'google'; marcar('tend', 'google'); }
  // La sección solo se rehace cuando cambia la lectura o un filtro: así no se
  // pierde el lugar ni el foco con la lectura de cada minuto.
  const firma = [estado.tend, estado.tendCanal, estado.tendFormato, estado.tendSin, estado.pais, t ? t.leido : 0, externos ? externos.leido : 0].join('|');
  if (!forzar && firma === estado.firmaTend) return;
  estado.firmaTend = firma;

  const leido = estado.tend === 'google' ? (externos ? externos.leido : 0) : (t ? t.leido : 0);
  const notas = {
    ref: 'Videos largos que los canales de referencia publicaron en los últimos 10 días, frente a la mediana de vistas de su propio canal. Desde 1.6 veces, el video despega.',
    yt: 'Lo más visto en YouTube entre lo publicado en las últimas 24 horas (48 en los largos), en español y sin transmisiones en vivo. El idioma se deduce del título cuando el video no lo declara.',
    google: 'Las búsquedas que más crecen en Google en cada país, según su RSS público. Mide Google, no YouTube: el enlace lleva a lo que YouTube tiene sobre cada una.',
    oficial: 'La lista oficial de YouTube por país. Desde julio de 2025 solo trae música, tráileres y videojuegos.',
  };
  $('#tend-nota').textContent = notas[estado.tend] + (leido ? ' ' + conPunto('Se lee cada hora; última lectura, ' + fechaConHora.format(leido)) : '');

  const barra = [];
  if (estado.tend === 'ref') barra.push(filtroDe('Nicho', 'tend-canal', [['', 'Los dos'], ['kr_ref', 'Autos'], ['bdp_ref', 'Relatos']], estado.tendCanal));
  if (estado.tend === 'yt') {
    barra.push(filtroDe('Formato', 'tend-formato', [['', 'Todos'], ['largo', 'Largos'], ['short', 'Shorts']], estado.tendFormato));
    barra.push(filtroDe('Categorías', 'tend-sin', [['', 'Todas'], ['1', 'Sin música ni videojuegos']], estado.tendSin));
  }
  if (estado.tend === 'google' || estado.tend === 'oficial') barra.push(filtroDe('País', 'tend-pais', PAISES, estado.pais));
  reemplazar($('#tend-barra'), barra);

  let cuerpo;
  if (estado.tend === 'google') cuerpo = panelDeGoogle(m);
  else if (!t) cuerpo = [crear('p', { clase: 'vacio' }, 'Todavía no hay lectura de tendencias.')];
  else if (estado.tend === 'yt') cuerpo = panelDeYouTube(m, t);
  else if (estado.tend === 'oficial') cuerpo = panelOficial(m, t);
  else cuerpo = panelDeReferencia(m, t);
  reemplazar($('#tend-cuerpo'), cuerpo);
}

/* ---------- Comentarios de los canales en otros videos ---------- */

// Los anota vía «?anotar=» quien publica el comentario; Atalaya Vigía los relee cada hora
// y guarda «me gusta», respuestas y si el comentario sigue visible.
function pintarComentarios(m) {
  const c = m.comentarios;
  $('#comentarios').hidden = !c;
  if (!c) return;
  const r = c.resumen || {};
  $('#com-nota').textContent = 'Comentarios que los canales dejaron en videos de otros canales de su nicho. Se releen cada hora; última lectura el ' + fechaNumerica.format(c.leido) + ' a las ' + horaMinuto.format(c.leido).replace(/\.$/, '') + '.';
  const oculto = c.lista.filter((x) => x.ok === false).length;
  const dato = (valor, rotulo) => crear('div', { clase: 'com-dato' }, crear('strong', null, fmt(valor)), crear('span', null, rotulo));
  reemplazar($('#com-resumen'), [
    dato(r.total || c.lista.length, 'publicados'),
    dato(r.conRespuesta || 0, 'con respuesta'),
    dato(r.respuestas || 0, 'respuestas'),
    dato(r.megusta || 0, '«me gusta»'),
    dato(oculto, 'ya no aparecen'),
  ]);
  const estado = m.estadoComentarios || (m.estadoComentarios = { filtro: 'todos' });
  const filtros = [['todos', 'Todos'], ['respuesta', 'Con respuesta'], ['oculto', 'Ya no aparecen']];
  reemplazar($('#com-barra'), [segmentos('com', filtros, estado.filtro)]);
  $('#com-barra').onchange = function (e) {
    estado.filtro = e.target.value;
    pintarComentarios(m);
  };
  const visibles = c.lista.filter((x) => estado.filtro === 'respuesta' ? x.n > 0 : estado.filtro === 'oculto' ? x.ok === false : true);
  const dos = (n) => String(n).padStart(2, '0');
  const fechaHora = (t) => { const d = new Date(t); return dos(d.getDate()) + '/' + dos(d.getMonth() + 1) + ' ' + horaMinuto.format(d); };
  if (!visibles.length) {
    reemplazar($('#com-lista'), [crear('li', { clase: 'com-vacio tenue' }, 'Ningún comentario cumple ese filtro.')]);
    return;
  }
  reemplazar($('#com-lista'), visibles.map(function (x) {
    const canal = CANALES[x.ci] || CANALES[0];
    const enlace = 'https://www.youtube.com/watch?v=' + encodeURIComponent(x.v) + '&lc=' + encodeURIComponent(x.id);
    return crear('li', { datos: { serie: canal.clave }, clase: x.ok === false ? 'sin-rastro' : null },
      crear('div', { clase: 'com-cabeza' },
        crear('span', { clase: 'video-dato' }, crear('span', { clase: 'clave' }), canal.nombre),
        crear('span', { clase: 'tenue' }, fechaHora(x.t)),
        x.ok === false ? crear('span', { clase: 'com-aviso' }, 'Ya no aparece') : null),
      crear('p', { clase: 'com-texto' }, x.x),
      crear('p', { clase: 'com-donde' }, 'En ', enlaceExterno(enlace, x.vt || 'el video'), x.vc ? ', de ' + x.vc : '', '. ',
        fmt(x.l || 0) + ' «me gusta», ' + fmt(x.n || 0) + (x.n === 1 ? ' respuesta' : ' respuestas') + '.'),
      (x.r || []).length ? crear('ul', { clase: 'com-respuestas' }, x.r.map(function (y) {
        return crear('li', null, crear('strong', null, y.a || 'Alguien'), ' · ' + fechaHora(y.t), crear('p', null, y.x));
      })) : null);
  }));
}

/* ---------- Nichos: interés por familias de temas ---------- */

// «Calor» de una familia: vistas sumadas de los 10 videos de más de 4 minutos
// más vistos entre los publicados sobre ella en los últimos 30 días. El
// servidor lo mide una vez al día y entrega la serie como [ms, calor, videos].

// Cambio entre la última medición y la más cercana a siete días atrás. Con
// una sola medición, o si la base es cero, no hay cambio que mostrar.
function cambioDeNicho(serie) {
  if (serie.length < 2) return null;
  const ultimo = serie[serie.length - 1];
  const meta = ultimo[0] - 7 * DIA;
  let base = null;
  for (const p of serie) {
    if (p[0] > ultimo[0] - DIA / 2) continue;
    if (!base || Math.abs(p[0] - meta) < Math.abs(base[0] - meta)) base = p;
  }
  if (!base || !base[1]) return null;
  return { dias: Math.max(1, Math.round((ultimo[0] - base[0]) / DIA)), razon: (ultimo[1] - base[1]) / base[1] };
}

function textoDeCambio(c) {
  if (!c) return crear('span', { clase: 'tenue' }, 'primera medición');
  const pct = Math.round(Math.abs(c.razon) * 100);
  const lapsoTexto = c.dias === 1 ? 'desde ayer' : 'en ' + c.dias + ' días';
  if (pct === 0) return crear('span', { clase: 'tenue' }, 'igual ' + lapsoTexto);
  return crear('span', { clase: c.razon > 0 ? 'sube' : 'baja' }, (c.razon > 0 ? '▲ sube ' : '▼ baja ') + fmt(pct) + ' % ' + lapsoTexto);
}

// Línea de 30 días sin ejes: la forma de la serie, con el último punto marcado.
function chispa(serie) {
  const ancho = 132, alto = 30, borde = 4;
  // Con una sola medición no hay línea que dibujar.
  if (serie.length < 2) return null;
  const svg = trazar('svg', { class: 'chispa', viewBox: '0 0 ' + ancho + ' ' + alto, width: ancho, height: alto, 'aria-hidden': 'true' });
  const t0 = serie[0][0], t1 = serie[serie.length - 1][0];
  const valores = serie.map((p) => p[1]);
  const min = Math.min(...valores), max = Math.max(...valores);
  const x = (t) => borde + (ancho - 2 * borde) * (t1 === t0 ? 1 : (t - t0) / (t1 - t0));
  const y = (v) => (max === min ? alto / 2 : borde + (alto - 2 * borde) * (1 - (v - min) / (max - min)));
  const puntos = serie.map((p) => x(p[0]).toFixed(1) + ',' + y(p[1]).toFixed(1)).join(' ');
  return agregar(svg, [
    trazar('polyline', { class: 'trazo', points: puntos }),
    trazar('circle', { class: 'punto', cx: x(t1).toFixed(1), cy: y(valores[valores.length - 1]).toFixed(1), r: 3 }),
  ]);
}

function pintarNichos(m) {
  const seccion = $('#nichos');
  const n = m.nichos;
  if (!n || !n.familias.length) { seccion.hidden = true; return; }
  seccion.hidden = false;
  const dias = new Set();
  for (const id in n.serie) for (const p of n.serie[id]) dias.add(new Date(p[0]).toDateString());
  $('#nichos-nota').textContent = 'Calor de cada familia de temas: vistas sumadas de los 10 videos de más de 4 minutos más vistos entre los publicados en los últimos 30 días. '
    + conPunto('Se mide una vez al día' + (n.leido ? '; última medición, ' + fechaConHora.format(n.leido) : '')) + ' '
    + (dias.size < 2 ? 'La subida o la bajada de cada familia se ve desde la segunda medición.' : 'La línea es el calor de cada día medido, hasta 30.');
  const grupos = CANALES.map(function (c) {
    const filas = n.familias.filter((f) => f.canal === c.nombre).map(function (f) {
      const serie = (n.serie[f.id] || []).slice().sort((a, b) => a[0] - b[0]);
      const ultimo = serie[serie.length - 1];
      return { f: f, serie: serie, calor: ultimo ? ultimo[1] : 0, top: (n.top[f.id] || [])[0] };
    }).sort((a, b) => b.calor - a.calor);
    if (!filas.length) return null;
    const tope = filas[0].calor || 1;
    return crear('section', { clase: 'nichos-grupo', datos: { serie: c.clave } },
      crear('h3', null, c.nombre),
      crear('ul', { clase: 'nichos-lista' }, filas.map(function (fila) {
        const t = fila.top;
        return crear('li', null,
          crear('div', { clase: 'nicho-nombre' },
            crear('strong', null, fila.f.nombre),
            t && t.id ? crear('p', { clase: 'nicho-top' }, 'Lo más visto del mes: ',
              enlaceExterno('https://www.youtube.com/watch?v=' + encodeURIComponent(t.id), t.t || 'video'),
              ' · ' + t.c + ' · ' + cuantos(t.n, 'vista', 'vistas')) : null),
          crear('div', { clase: 'nicho-linea' }, chispa(fila.serie)),
          crear('div', { clase: 'nicho-cifra' },
            crear('span', { clase: 'nicho-calor' }, fmt(fila.calor)),
            crear('span', { clase: 'nicho-barra', 'aria-hidden': 'true' }, crear('span', { estilo: { width: Math.max(2, Math.round(100 * fila.calor / tope)) + '%' } })),
            textoDeCambio(cambioDeNicho(fila.serie))));
      })));
  });
  reemplazar($('#nichos-grupos'), grupos);
}

/* ---------- Tabla de videos ---------- */

const COMPARAR = {
  titulo: (a, b) => a.titulo.localeCompare(b.titulo, 'es'),
  canal: (a, b) => a.ci - b.ci,
  publicado: (a, b) => a.publicado - b.publicado,
  vistas: (a, b) => a.vistas - b.vistas,
  periodo: (a, b) => (a.ganado === null ? -1 : a.ganado) - (b.ganado === null ? -1 : b.ganado),
  visto: (a, b) => (a.visto === null ? -1 : a.visto) - (b.visto === null ? -1 : b.visto),
  likes: (a, b) => a.likes - b.likes,
  coms: (a, b) => a.coms - b.coms,
};

function publicadoHace(m, v) {
  const edad = m.ahora - v.publicado;
  return edad < 7 * DIA ? 'hace ' + lapso(edad) : fechaNumerica.format(v.publicado);
}

function pintarVideos(m, inicio) {
  const periodo = PERIODOS[estado.periodo];
  const cambios = cambiosDe(m);
  const lista = m.videos
    .filter((v) => estado.canal === '' || v.ci === Number(estado.canal))
    .filter((v) => estado.tipo === '' || (estado.tipo === 'short') === v.corto);
  for (const v of lista) {
    v.ganado = ganado(m, v, estado.periodo, inicio);
    const a = analiticaDe(m, v.ci);
    v.an = a && a.videos ? a.videos[v.id] || null : null;
    v.visto = v.an ? v.an[3] : null;
  }
  const comparar = COMPARAR[estado.orden.campo] || COMPARAR.publicado;
  lista.sort((a, b) => estado.orden.sentido * comparar(a, b) || b.publicado - a.publicado);

  const cuerpo = $('#videos-cuerpo');
  const foco = document.activeElement && cuerpo.contains(document.activeElement) ? document.activeElement.dataset.foco : '';
  const dueno = esDueno();
  reemplazar(cuerpo, lista.map(function (v) {
    const c = m.canales[v.ci];
    const estudio = 'https://studio.youtube.com/video/' + v.id + '/';
    const dato = [(v.corto ? 'Short de ' : 'Largo de ') + duracion(v.seg),
      crear('span', { clase: 'solo-movil' }, ', ', c.nombre, ', ' + publicadoHace(m, v))];
    if (dueno) dato.push('. ', enlaceExterno(estudio + 'edit', 'Editar en Studio', { datos: { foco: 'e' + v.id } }));
    const sube = v.ganado === null ? '–' : (v.ganado > 0 ? '+' : '') + fmt(v.ganado);
    const ahora = m.h1[v.id] > 0 ? crear('span', { clase: 'video-ahora' }, '+' + fmt(m.h1[v.id]) + ' en la última hora') : null;
    const visto = v.an ? [crear('span', { clase: 'pct' }, unaCifra(v.an[3]) + ' %'), crear('span', { clase: 'tenue celda-sub' }, duracion(v.an[2]))] : '–';
    return crear('tr', { datos: { serie: c.clave } },
      crear('td', { clase: 'celda-video' }, crear('div', { clase: 'video' },
        miniatura(v, 'mini', 'mqdefault'),
        crear('div', { clase: 'video-texto' },
          enlaceExterno(v.url, v.titulo, { clase: 'video-titulo', datos: { foco: 't' + v.id } }),
          crear('span', { clase: 'video-dato' }, dato), ahora,
          cambios.filter((x) => x.id === v.id).map((x) => crear('span', { clase: 'video-dato video-cambio' }, fraseDeCambio(m, x)))))),
      crear('td', { clase: 'solo-ancho' }, crear('span', { clase: 'celda-canal' }, crear('span', { clase: 'clave' }), c.corto)),
      crear('td', { clase: 'solo-ancho' }, crear('time', { datetime: new Date(v.publicado).toISOString(), title: fechaConHora.format(v.publicado) }, publicadoHace(m, v))),
      crear('td', { clase: 'num', datos: { etiqueta: 'vistas' } }, dueno ? enlaceExterno(estudio + 'analytics/tab-overview/period-default', fmt(v.vistas), { datos: { foco: 'v' + v.id } }) : fmt(v.vistas)),
      crear('td', { clase: 'num ' + (v.ganado ? 'sube' : 'nada'), datos: { etiqueta: 'en ' + periodo.nombre } }, sube),
      crear('td', { clase: 'num', datos: { etiqueta: 'visto en promedio' } }, visto),
      crear('td', { clase: 'num', datos: { etiqueta: 'me gusta' } }, dueno ? enlaceExterno(estudio + 'analytics/tab-engagement/period-default', fmt(v.likes), { datos: { foco: 'l' + v.id } }) : fmt(v.likes)),
      crear('td', { clase: 'num', datos: { etiqueta: v.coms === 1 ? 'comentario' : 'comentarios' } }, dueno ? enlaceExterno(estudio + 'comments', fmt(v.coms), { datos: { foco: 'm' + v.id } }) : fmt(v.coms)));
  }));
  if (foco) {
    const mismo = cuerpo.querySelector('[data-foco="' + foco + '"]');
    if (mismo) mismo.focus({ preventScroll: true });
  }
  const conFiltro = estado.canal !== '' || estado.tipo !== '';
  $('#videos-vacio').hidden = lista.length > 0;
  $('#videos-vacio-texto').textContent = conFiltro ? 'Sin videos con ese filtro.' : 'YouTube no devolvió videos en la última lectura.';
  $('#quitar-filtros').hidden = !conFiltro;
  $('#tabla-videos').hidden = lista.length === 0;
  const recortado = m.canales.some((c) => c.total > m.videos.filter((v) => v.ci === c.ci).length);
  $('#videos-nota').textContent = lista.length === 0 && !conFiltro ? '' : cuantos(lista.length, 'video', 'videos') + (recortado ? ', de los 15 más recientes de cada canal.' : '.')
    + (m.analytics ? ' «Visto en promedio» es el porcentaje medio del video que se ve y la duración media de cada vista, de YouTube Analytics en los últimos 12 meses.' : '');
  $('#orden-periodo').textContent = 'Más vistas en ' + periodo.nombre;
  for (const th of document.querySelectorAll('#tabla-videos th')) {
    if (th.dataset.campo === estado.orden.campo) th.setAttribute('aria-sort', estado.orden.sentido > 0 ? 'ascending' : 'descending');
    else th.removeAttribute('aria-sort');
  }
  const selector = $('#orden-movil');
  selector.value = [].some.call(selector.options, (o) => o.value === estado.orden.campo) ? estado.orden.campo : 'publicado';
}

/* ---------- Pintado general ---------- */

function pintarDatos() {
  const m = estado.modelo;
  if (!m) return;
  if (estado.vista === 'crecimiento') {
    pintarTablero(m);
    try { pintarAnalytics(m); } catch (error) { console.error('analytics: ' + error); }
  }
  if (estado.vista === 'videos') {
    const inicio = cubosDeVistas(m, estado.periodo)[0].t;
    pintarVideos(m, inicio);
    try { pintarRetencion(m); } catch (error) { console.error('retención: ' + error); }
  }
}

function pintar() {
  const m = estado.modelo;
  if (!m) return;
  document.body.classList.add('con-datos');
  // Cada parte es independiente: si una falla, el resto queda dibujado.
  const partes = {
    hoy: [pintarResumen, pintarInsignias, pintarMueve, pintarSenales],
    radar: [pintarTendencias, pintarNichos, pintarComentarios],
  };
  for (const f of partes[estado.vista] || []) {
    try { f(m); } catch (error) { console.error(f.name + ': ' + error); }
  }
  pintarDatos();
  if (estado.vista === 'radar' && window.dibujarAtipicos) window.dibujarAtipicos();
  for (const a of document.querySelectorAll('.radar-indice a')) { const s = document.getElementById(a.getAttribute('href').slice(1)); if (a.getAttribute('href') !== '#atipicos') a.hidden = !s || s.hidden; }
}

/* ---------- Cambios de título y de miniatura ---------- */

function cambiosDe(m) {
  const lista = m.cambios.map((f) => ({ t: f[0], id: f[2], tipo: f[3], despues: f[5] || '' }));
  const externos = estado.externos && Array.isArray(estado.externos.cambios) ? estado.externos.cambios : [];
  for (const f of externos) if (Array.isArray(f) && f.length >= 3) lista.push({ t: f[0], id: f[1], tipo: f[2], despues: '' });
  const propios = {};
  for (const v of m.videos) propios[v.id] = v;
  return lista.filter((c) => propios[c.id] && c.t > m.ahora - 30 * DIA).sort((a, b) => a.t - b.t)
    .map((c) => Object.assign(c, { video: propios[c.id] }));
}

/* ---------- Lectura ---------- */

async function pedir(ruta, etag) {
  const control = new AbortController();
  const tope = setTimeout(() => control.abort(), ESPERA_MS);
  try {
    const opciones = { signal: control.signal, cache: 'no-store', credentials: 'omit' };
    if (etag) opciones.headers = { 'If-None-Match': etag };
    const respuesta = await fetch(VIGIA + ruta, opciones);
    if (respuesta.status === 304) return { igual: true };
    if (!respuesta.ok) throw new Error('Vigía respondió con el código ' + respuesta.status);
    let datos;
    try { datos = await respuesta.json(); } catch (error) { throw new Error('Vigía devolvió una respuesta que no se pudo interpretar'); }
    return { datos: datos, etag: respuesta.headers.get('ETag') || '' };
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('Vigía tardó más de ' + ESPERA_MS / 1000 + ' segundos');
    if (error instanceof TypeError) throw new Error(navigator.onLine === false ? 'este dispositivo no tiene conexión' : 'no hubo conexión con Vigía');
    throw error;
  } finally {
    clearTimeout(tope);
  }
}

function armarModelo() {
  if (!estado.vivo) return;
  estado.modelo = preparar(Object.assign({}, estado.panel || {}, estado.vivo));
}

function avanzarPulso(ms) {
  const barra = $('#pulso');
  if (estado.pulso) estado.pulso.cancel();
  if (sinMovimiento.matches || !barra.animate) return;
  estado.pulso = barra.animate(
    [{ transform: 'scaleX(' + (1 - ms / CADA_MS) + ')' }, { transform: 'scaleX(1)' }],
    { duration: ms, easing: 'linear', fill: 'forwards' });
}

function programar(ms) {
  clearTimeout(estado.reloj);
  if (document.hidden) return;
  estado.reloj = setTimeout(leer, ms);
  avanzarPulso(ms);
}

async function leer() {
  clearTimeout(estado.reloj);
  estado.ultimoIntento = Date.now();
  const marca = $('#estado');
  try {
    const tocaPanel = !estado.panel || Date.now() - estado.ultimoPanel >= CADA_PANEL_MS;
    const [vivo, panel] = await Promise.all([pedir('/vivo'), tocaPanel ? pedir('/panel', estado.etagPanel) : Promise.resolve({ igual: true })]);
    if (!vivo.datos || !Array.isArray(vivo.datos.canales)) throw new Error('la respuesta llegó sin los canales');
    estado.vivo = vivo.datos;
    if (tocaPanel) estado.ultimoPanel = Date.now();
    if (panel.datos) { estado.panel = panel.datos; estado.etagPanel = panel.etag; guardar('panel', JSON.stringify(panel.datos)); }
    guardar('vivo', JSON.stringify(vivo.datos));
    armarModelo();
    pintar();
    marca.textContent = 'Leído a ' + laHora(estado.modelo.ahora);
    marca.classList.remove('falla');
    $('#aviso').hidden = true;
  } catch (error) {
    const previa = estado.modelo ? ' ' + conPunto('Se muestra la lectura ' + momento(estado.modelo.ahora, 'de')) : '';
    marca.textContent = estado.modelo ? 'Sin lectura ' + momento(estado.modelo.ahora, 'desde') : 'Sin lectura';
    marca.classList.add('falla');
    $('#aviso-texto').textContent = 'No se leyeron las cifras: ' + error.message + '.' + previa + ' Se intenta de nuevo cada minuto.';
    $('#aviso').hidden = false;
  }
  programar(CADA_MS);
}

async function leerExternos() {
  try {
    const respuesta = await fetch(EXTERNOS, { cache: 'no-store', credentials: 'omit' });
    if (!respuesta.ok) throw new Error('código ' + respuesta.status);
    const datos = await respuesta.json();
    if (!datos || typeof datos !== 'object') throw new Error('respuesta vacía');
    estado.externos = datos;
    guardar('externos', JSON.stringify(datos));
    if (estado.modelo) { estado.firmaTend = ''; pintar(); }
  } catch (error) {
    // Sin esta lectura la página sigue: faltan las búsquedas de Google y los cambios de miniatura.
    console.warn('externos: ' + error.message);
  }
}

/* ---------- Controles ---------- */

function temaActual() {
  return document.documentElement.dataset.tema || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'oscuro' : 'claro');
}
function rotularTema() {
  $('#tema-texto').textContent = temaActual() === 'oscuro' ? 'Usar tema claro' : 'Usar tema oscuro';
}
function marcar(nombre, valor) {
  const radio = document.querySelector('input[name="' + nombre + '"][value="' + valor + '"]');
  if (radio) radio.checked = true;
}

function conectarControles() {
  const guardado = recordar('periodo');
  if (PERIODOS[guardado]) { estado.periodo = guardado; marcar('periodo', guardado); }
  const lista = recordar('tend');
  if (['ref', 'yt', 'google', 'oficial'].indexOf(lista) >= 0) { estado.tend = lista; marcar('tend', lista); }
  const pais = recordar('pais');
  if (PAISES.some((p) => p[0] === pais)) estado.pais = pais;
  const orden = (recordar('orden') || '').split(':');
  if (COMPARAR[orden[0]]) estado.orden = { campo: orden[0], sentido: orden[1] === '1' ? 1 : -1 };

  // Pestañas: cada vista tiene su dirección (#hoy, #crecimiento, #videos, #radar).
  document.addEventListener('click', function (e) {
    const a = e.target.closest('a[href^="#"]');
    if (!a || a.classList.contains('salto')) return;
    const vista = vistaDeEnlace(a.getAttribute('href'));
    if (vista !== estado.vista) {
      e.preventDefault();
      mostrarVista(vista);
      const destino = a.getAttribute('href').slice(1);
      const nodo = VISTAS.indexOf(destino) < 0 ? document.getElementById(destino) : null;
      if (nodo) requestAnimationFrame(() => nodo.scrollIntoView({ behavior: sinMovimiento.matches ? 'auto' : 'smooth' }));
      else window.scrollTo({ top: 0 });
    }
  });
  window.addEventListener('hashchange', () => mostrarVista(vistaDeEnlace(location.hash), true));
  document.addEventListener('keydown', function (e) {
    if (e.altKey || e.ctrlKey || e.metaKey || /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName)) return;
    const i = ['1', '2', '3', '4'].indexOf(e.key);
    if (i >= 0) { mostrarVista(VISTAS[i]); window.scrollTo({ top: 0 }); }
  });

  $('#periodo').addEventListener('change', function (e) {
    estado.periodo = e.target.value;
    guardar('periodo', estado.periodo);
    pintarDatos();
  });
  $('#filtro-canal').addEventListener('change', function (e) { estado.canal = e.target.value; pintarDatos(); });
  $('#filtro-tipo').addEventListener('change', function (e) { estado.tipo = e.target.value; pintarDatos(); });
  $('#quitar-filtros').addEventListener('click', function () {
    estado.canal = ''; estado.tipo = '';
    marcar('canal', ''); marcar('tipo', '');
    pintarDatos();
  });
  // «Ver sus videos» de cada canal lleva a la tabla ya filtrada.
  for (const a of document.querySelectorAll('[data-filtro]')) {
    a.addEventListener('click', function () {
      estado.canal = a.dataset.filtro; estado.tipo = '';
      marcar('canal', estado.canal); marcar('tipo', '');
    });
  }
  $('#tabla-videos thead').addEventListener('click', function (e) {
    const th = e.target.closest('th[data-campo]');
    if (!th) return;
    const campo = th.dataset.campo;
    if (estado.orden.campo === campo) estado.orden.sentido *= -1;
    else estado.orden = { campo: campo, sentido: campo === 'titulo' || campo === 'canal' ? 1 : -1 };
    guardar('orden', estado.orden.campo + ':' + estado.orden.sentido);
    pintarDatos();
  });
  $('#orden-movil').addEventListener('change', function (e) {
    estado.orden = { campo: e.target.value, sentido: -1 };
    guardar('orden', estado.orden.campo + ':-1');
    pintarDatos();
  });

  $('#tend-lista').addEventListener('change', function (e) {
    estado.tend = e.target.value;
    guardar('tend', estado.tend);
    if (estado.modelo) pintarTendencias(estado.modelo);
  });
  $('#tend-barra').addEventListener('change', function (e) {
    if (e.target.name === 'tend-formato') estado.tendFormato = e.target.value;
    else if (e.target.name === 'tend-sin') estado.tendSin = e.target.value;
    else if (e.target.name === 'tend-canal') estado.tendCanal = e.target.value;
    else if (e.target.name === 'tend-pais') { estado.pais = e.target.value; guardar('pais', estado.pais); }
    if (estado.modelo) pintarTendencias(estado.modelo);
    const elegido = document.querySelector('#tend-barra input[name="' + e.target.name + '"]:checked');
    if (elegido) elegido.focus({ preventScroll: true });
  });

  for (const nombre of ['vistas', 'subs', 'an-vistas', 'an-horas', 'an-subs']) {
    const boton = $('#' + nombre + '-tabla-boton');
    if (!boton) continue;
    boton.addEventListener('click', function () {
      const enTabla = $('#' + nombre + '-tabla').hidden;
      boton.textContent = enTabla ? 'Ver como gráfica' : 'Ver como tabla';
      $('#' + nombre + '-tabla').hidden = !enTabla;
      $('#' + nombre + '-lienzo').hidden = enTabla;
      if (!enTabla) pintarDatos();
    });
  }

  $('#tema').addEventListener('click', function () {
    const nuevo = temaActual() === 'oscuro' ? 'claro' : 'oscuro';
    document.documentElement.dataset.tema = nuevo;
    guardar('tema', nuevo);
    rotularTema();
  });
  rotularTema();

  const botonDueno = $('#dueno-boton');
  const rotularDueno = function () { botonDueno.textContent = esDueno() ? 'Desactivar el modo dueño' : 'Activar el modo dueño'; };
  botonDueno.addEventListener('click', function () {
    const activar = !esDueno();
    guardar('dueno', activar ? '1' : null);
    document.documentElement.toggleAttribute('data-dueno', activar);
    rotularDueno();
    pintar();
  });
  rotularDueno();
  $('#aviso-boton').addEventListener('click', leer);

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      clearTimeout(estado.reloj);
      if (estado.pulso) estado.pulso.pause();
      return;
    }
    const falta = CADA_MS - (Date.now() - estado.ultimoIntento);
    if (falta <= 0) leer(); else programar(falta);
  });

  // Las gráficas se dibujan a la medida del contenedor: al cambiar el ancho se rehacen.
  if ('ResizeObserver' in window) {
    let ancho = 0, pendiente = 0;
    new ResizeObserver(function (entradas) {
      const nuevo = Math.round(entradas[0].contentRect.width);
      if (nuevo === ancho) return;
      ancho = nuevo;
      cancelAnimationFrame(pendiente);
      pendiente = requestAnimationFrame(pintarDatos);
    }).observe($('main'));
  }
}

function iniciar() {
  conectarControles();
  try { estado.externos = JSON.parse(recordar('externos') || 'null'); } catch (error) { guardar('externos', null); }
  try {
    const vivo = JSON.parse(recordar('vivo') || 'null'), panel = JSON.parse(recordar('panel') || 'null');
    if (vivo && Array.isArray(vivo.canales)) {
      estado.vivo = vivo; estado.panel = panel;
      armarModelo();
      $('#estado').textContent = 'Lectura guardada ' + momento(estado.modelo.ahora, 'de');
    }
  } catch (error) {
    guardar('vivo', null); guardar('panel', null);
  }
  mostrarVista(vistaDeEnlace(location.hash), true);
  leer();
  leerExternos();
  setInterval(function () { if (!document.hidden) leerExternos(); }, CADA_EXTERNOS_MS);
}

iniciar();
