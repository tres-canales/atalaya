// Atalaya: lee las cifras públicas de tres canales de YouTube y las dibuja.
// Sin dependencias. Todo texto que viene de YouTube (títulos, descripciones)
// entra al documento como texto, nunca como HTML.
'use strict';

// Aplicación web de Apps Script que consulta la YouTube Data API y responde en JSON.
const FUENTE = 'https://script.google.com/macros/s/AKfycbxdRWV_5JxbMyXQ3rAZdO7gWQhOay_ecISRB9x05wuZzLOQ5dTqOuPunSJeYnksXPZKTg/exec?datos=1';
// El servidor guarda cada lectura 45 s: leer más seguido devolvería lo mismo.
const CADA_MS = 60000;
const ESPERA_MS = 25000;
const HORA = 3600000;
const DIA = 86400000;

// El orden es el del servidor (índice de canal en «historia» y «mov») y fija
// el color de cada serie: un canal conserva su color aunque otro falte.
const CANALES = [
  { id: 'UC4wVH_TILBbXgOyWX1ySK5Q', clave: 'pd', nombre: 'Peso Duro' },
  { id: 'UCO988qGZH9ApN8vCq91aenQ', clave: 'evl', nombre: 'Esto Viene de Lejos' },
  { id: 'UCBBsfQy7mpbIWgSIsLwQVLw', clave: 'pa', nombre: 'Psique Ajena' },
];
const PERIODOS = {
  '24h': { nombre: '24 horas', cubos: 24, unidad: 'hora' },
  '7d': { nombre: '7 días', cubos: 7, unidad: 'día' },
  '30d': { nombre: '30 días', cubos: 30, unidad: 'día' },
};

// Lo que no viene de Atalaya Vigía: las búsquedas en alza de Google y los
// cambios de miniatura. Una tarea del repositorio los escribe cada hora en la
// rama «datos».
const EXTERNOS = 'https://raw.githubusercontent.com/tres-canales/atalaya/datos/externos.json';
const CADA_EXTERNOS_MS = 10 * 60000;
// Suscriptores que pide el Programa de socios de YouTube.
const META_SUBS = 1000;
const PAISES = [['DO', 'Rep. Dominicana'], ['MX', 'México'], ['ES', 'España'], ['CO', 'Colombia'], ['AR', 'Argentina'], ['US', 'EE. UU.']];
const CATEGORIAS = {
  1: 'Cine y animación', 2: 'Autos', 10: 'Música', 15: 'Mascotas y animales', 17: 'Deportes', 19: 'Viajes',
  20: 'Videojuegos', 22: 'Gente y blogs', 23: 'Comedia', 24: 'Entretenimiento', 25: 'Noticias y política',
  26: 'Consejos y estilo', 27: 'Educación', 28: 'Ciencia y tecnología', 29: 'Activismo',
};

// Familias de temas de cada canal, en el orden de CANALES. La mediana es la de
// los 15 primeros resultados de la búsqueda de YouTube de sus temas (estudio
// de reenfoque). Un largo entra en la primera familia cuyo patrón aparece en
// su título; es una aproximación y así se dice en la página.
const FAMILIAS_FECHA = '10/11/2026';
const FAMILIAS = [
  [
    { nombre: 'Tesoros', mediana: 92594, patron: /tesoro|gale[oó]n|pirata|bot[ií]n|naufragio/i },
    { nombre: 'Estafas', mediana: 54507, patron: /estafa|fraude|ponzi|pir[aá]mide/i },
    { nombre: 'Robos y hackeos', mediana: 52084, patron: /\brob[oó]|hacke|atraco|asalto|ladr[oó]n/i },
    { nombre: 'Fortunas', mediana: 427174, patron: /fortuna|millonario|loter[ií]a|m[aá]s rico|riqueza/i },
    { nombre: 'Crisis', mediana: 5401, patron: /crisis|quiebra|corralito|hiperinflaci[oó]n|devaluaci[oó]n/i },
    { nombre: 'Precio de territorios', mediana: 3371, patron: /alquil|territorio|compr[oó]|vendi[oó]|guant[aá]namo/i },
  ],
  [
    { nombre: 'Fiestas y tradiciones', mediana: 32679, patron: /navidad|reyes magos|halloween|san valent[ií]n|tradici[oó]n|se celebra/i },
    { nombre: 'Caribe y República Dominicana', mediana: 57412, patron: /hait[ií]|dominican|caribe|trujillo|cuba|puerto rico/i },
    { nombre: 'Objetos y costumbres', mediana: 1146, patron: /invento|por qu[eé] usamos/i },
    { nombre: 'Historia detrás de un titular', mediana: 126416, patron: /./ },
  ],
  [
    { nombre: 'Supervivencia', mediana: 323684, patron: /sobreviv|andes|rescat|atrapad|n[aá]ufrag/i },
    { nombre: 'Experimentos', mediana: 116007, patron: /experimento|psicol[oó]g|obediencia|stanford|milgram/i },
    { nombre: 'Tragedias y misterios', mediana: 273840, patron: /tragedia|misterio|accidente|masacre|secta|desaparec/i },
  ],
];

// Fechas que mueven búsquedas en los temas de los canales, con la demanda
// medida el 10/11/2026 (mediana de vistas de los 15 primeros resultados).
// «hasta» marca el final cuando la fecha es un intervalo.
const CALENDARIO = [
  { dia: '2026-11-19', que: 'Estreno de «The Altruists», la serie sobre FTX', ci: 0, demanda: 91380 },
  { dia: '2026-11-25', que: 'Hermanas Mirabal (1960), origen del día contra la violencia hacia la mujer', ci: 1, demanda: 82062 },
  { dia: '2026-12-01', hasta: '2026-12-08', que: 'Por qué la Navidad es el 25 de diciembre: días para publicarlo', ci: 1, demanda: 137061 },
  { dia: '2026-12-01', hasta: '2026-12-19', que: '25 años del corralito argentino', ci: 0, demanda: 179758 },
  { dia: '2026-12-02', que: '25 años de la quiebra de Enron', ci: 0, demanda: 111740 },
  { dia: '2026-12-26', que: '35 años del fin de la URSS', ci: 1, demanda: 460897 },
  { dia: '2027-01-01', que: '25 años del euro en la calle', ci: 0, demanda: 0 },
  { dia: '2027-01-06', que: 'Reyes Magos', ci: 1, demanda: 69852 },
  { dia: '2027-02-01', hasta: '2027-02-28', que: 'Paso Dyatlov (febrero de 1959)', ci: 2, demanda: 273840 },
  { dia: '2027-02-14', que: 'San Valentín', ci: 1, demanda: 90152 },
  { dia: '2027-02-27', que: 'Independencia dominicana', ci: 1, demanda: 91931 },
  { dia: '2027-03-27', que: '50 años del accidente de Tenerife', ci: 2, demanda: 117344 },
];

const estado = {
  modelo: null,
  externos: null,
  tend: 'ref',
  tendFormato: '',
  tendSin: '',
  pais: 'DO',
  firmaTend: '',
  periodo: '24h',
  orden: { campo: 'periodo', sentido: -1 },
  canal: '',
  tipo: '',
  ultimoIntento: 0,
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

/* ---------- Modelo: de la respuesta del servidor a lo que se dibuja ---------- */

function preparar(d) {
  const ahora = Date.parse(d.hora) || Date.now();
  const porNombre = {};
  const canales = CANALES.map(function (c, ci) {
    const s = (d.canales || []).find((x) => x.id === c.id) || {};
    porNombre[s.nombre || c.nombre] = ci;
    const usuario = s.usuario && s.usuario.charAt(0) === '@' ? s.usuario : '';
    return {
      ci: ci, id: c.id, clave: c.clave, nombre: c.nombre,
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
  };
}

// Vistas ganadas por cubo (hora o día) y canal. En 24 horas salen de la
// bitácora; en 7 y 30 días, de la lectura diaria de cada video.
function cubosDeVistas(m, clave) {
  const cubos = [];
  const n = PERIODOS[clave].cubos;
  if (clave === '24h') {
    const ultima = Math.floor(m.ahora / HORA) * HORA;
    for (let i = n - 1; i >= 0; i--) cubos.push({ t: ultima - i * HORA, fin: ultima - i * HORA + HORA, valores: [0, 0, 0] });
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
    cubos.push({ t: dia.getTime(), fin: 0, valores: [0, 0, 0] });
  }
  cubos.forEach(function (c, i) { c.fin = i + 1 < cubos.length ? cubos[i + 1].t : m.ahora; });
  const anotar = function (t, ci, cantidad) {
    if (t < cubos[0].t || cantidad <= 0 || ci > 2) return;
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

/* ---------- Ahora: cuatro cifras, lo que se mueve y la meta ---------- */

function netosDeSubs(m) {
  const netos = [0, 0, 0];
  for (const f of m.cambiosSubs) if (netos[f[1]] !== undefined) netos[f[1]] += Number(f[2]) || 0;
  return netos;
}

// Suma de los suscriptores de los tres canales en cada momento en que alguno cambió.
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

// Barra fina partida por canal. Las cifras de cada parte están en el bloque
// de su canal, justo debajo; aquí van en el rótulo accesible y al pasar el cursor.
function pintarReparto(nodo, valores, de) {
  const total = sumar(valores);
  nodo.hidden = total <= 0;
  if (total <= 0) { nodo.textContent = ''; return; }
  nodo.setAttribute('aria-label', 'Reparto de ' + de + ' por canal: ' + CANALES.map((c, ci) => c.nombre + ', ' + fmt(valores[ci])).join('; ') + '.');
  reemplazar(nodo, CANALES.map(function (c, ci) {
    if (valores[ci] <= 0) return null;
    return crear('span', {
      datos: { serie: c.clave }, title: c.nombre + ': ' + fmt(valores[ci]) + ' (' + Math.round(100 * valores[ci] / total) + ' %)',
      estilo: { 'flex-grow': String(valores[ci]) },
    });
  }));
}

function ponerTarjeta(id, t) {
  const tarjeta = $('#' + id);
  const campo = (nombre) => $('[data-campo="' + nombre + '"]', tarjeta);
  ponerCifra(campo('valor'), t.valor);
  campo('valor').setAttribute('aria-label', fmt(t.valor) + ' ' + t.de);
  reemplazar(campo('delta'), t.delta);
  reemplazar(campo('traza'), [t.traza]);
  campo('pie').textContent = t.pie;
  pintarReparto(campo('reparto'), t.reparto, t.de);
}

function pintarCifras(m) {
  const vivos = m.canales.filter((c) => !c.falta);
  const ventana = ventanaDeUnDia(m);
  const horas = cubosDeVistas(m, '24h');
  const dias = cubosDeVistas(m, '7d');
  const porHora = horas.map((c) => sumar(c.valores));
  const total24 = sumar(porHora);

  const neto = sumar(netosDeSubs(m));
  const inicio7 = m.ahora - 7 * DIA;
  const serie = totalDeSubs(m, inicio7);
  const desde = serie.length ? Math.max(inicio7, serie[0].t) : inicio7;
  ponerTarjeta('cifra-subs', {
    valor: sumar(vivos.map((c) => c.subs)), de: 'suscriptores',
    delta: !m.bitacoraDesde ? [] : neto ? [crear('strong', null, conSigno(neto)), ' ' + ventana] : ['Sin cambio ' + ventana],
    traza: trazaDeEscalones(serie, desde, m.ahora),
    pie: serie.length < 2 ? '' : desde > inicio7 + HORA ? 'Desde el ' + diaYMes.format(desde) : 'Últimos 7 días',
    reparto: m.canales.map((c) => (c.falta ? 0 : c.subs)),
  });

  ponerTarjeta('cifra-vistas', {
    valor: sumar(vivos.map((c) => c.vistas)), de: 'vistas',
    delta: !m.bitacoraDesde ? [] : total24 ? [crear('strong', null, conSigno(total24)), ' ' + ventana] : ['Sin vistas nuevas ' + ventana],
    traza: trazaDeColumnas(porHora),
    pie: 'Por hora, últimas 24 horas',
    reparto: m.canales.map((c) => (c.falta ? 0 : c.vistas)),
  });

  // La última hora va contra el promedio por hora del día. Con menos de seis
  // horas de registro el promedio todavía no dice nada.
  const deCanal = {};
  for (const v of m.videos) deCanal[v.id] = v.ci;
  for (const id in m.diario) if (deCanal[id] === undefined) deCanal[id] = m.diario[id].ci;
  const ultima = [0, 0, 0];
  for (const id in m.h1) if (ultima[deCanal[id]] !== undefined) ultima[deCanal[id]] += Number(m.h1[id]) || 0;
  const entradas = sumar(ultima);
  const promedio = total24 / 24;
  const conPromedio = total24 > 0 && m.bitacoraDesde > 0 && m.ahora - m.bitacoraDesde >= 6 * HORA;
  let comparacion = [];
  if (conPromedio) {
    const razon = entradas / promedio;
    comparacion = razon >= 1.15 ? [crear('strong', null, '▲ ' + unaCifra(razon) + ' veces'), ' el promedio del día']
      : razon <= 0.85 ? [crear('strong', null, '▼ ' + fmt(Math.round(razon * 100)) + ' %'), ' del promedio del día']
        : ['En el promedio del día'];
  }
  ponerTarjeta('cifra-hora', {
    valor: entradas, de: 'vistas en la última hora',
    delta: comparacion,
    traza: trazaDeComparacion(entradas, conPromedio ? promedio : 0),
    pie: conPromedio ? 'La marca es el promedio: ' + fmt(Math.round(promedio)) + ' por hora' : '',
    reparto: ultima,
  });

  const hoy = dias[dias.length - 1], ayer = dias[dias.length - 2];
  // Ayer solo sirve de comparación si el registro lo cubre entero.
  const conAyer = isFinite(m.registroDesde) && m.registroDesde <= ayer.t;
  ponerTarjeta('cifra-hoy', {
    valor: sumar(hoy.valores), de: 'vistas de hoy',
    delta: conAyer ? ['Ayer, ', crear('strong', null, fmt(sumar(ayer.valores))), ' en el día']
      : isFinite(m.registroDesde) ? ['El registro por día empezó el ' + diaYMes.format(m.registroDesde)] : [],
    traza: trazaDeColumnas(dias.map((c) => sumar(c.valores))),
    pie: 'Por día, últimos 7 días',
    reparto: hoy.valores,
  });
}

// Los cinco videos propios que más vistas ganaron en la última hora o, si
// ninguno se movió, en las últimas 24.
function pintarMueve(m) {
  const porHora = m.videos.some((v) => m.h1[v.id] > 0);
  const medida = (v) => Number((porHora ? m.h1 : m.h24)[v.id]) || 0;
  const lista = m.videos.filter((v) => medida(v) > 0).sort((a, b) => medida(b) - medida(a) || b.publicado - a.publicado).slice(0, 5);
  const ventana = ventanaDeUnDia(m);
  $('#mueve-nota').textContent = lista.length
    ? (porHora ? 'Vistas ganadas en la última hora.' : conPunto('En la última hora no se movió ningún contador: van las vistas ganadas ' + ventana))
    : (m.bitacoraDesde ? conPunto('Ningún contador se movió ' + ventana) : '');
  const tope = lista.length ? medida(lista[0]) : 1;
  reemplazar($('#mueve-lista'), lista.map(function (v) {
    const c = m.canales[v.ci];
    const enElDia = porHora && m.h24[v.id] > 0 ? fmt(m.h24[v.id]) + ' en 24 horas' : fmt(v.vistas) + ' en total';
    return crear('li', { datos: { serie: c.clave } },
      miniatura(v, 'mini', 'mqdefault'),
      crear('div', { clase: 'mueve-texto' },
        enlaceExterno(v.url, v.titulo, { clase: 'video-titulo' }),
        crear('span', { clase: 'video-dato' }, crear('span', { clase: 'clave' }), c.nombre + ' · ' + (v.corto ? 'Short' : 'Video') + ' · ' + publicadoHace(m, v))),
      crear('div', { clase: 'mueve-cifra' },
        crear('strong', null, '+' + fmt(medida(v))),
        crear('span', { clase: 'barra', 'aria-hidden': 'true' }, crear('span', { estilo: { width: Math.max(3, Math.round(100 * medida(v) / tope)) + '%' } })),
        crear('span', { clase: 'tenue' }, enElDia)));
  }));
}

// Suscriptores de cada canal frente a la meta. La fecha estimada es una
// proyección del ritmo registrado y solo aparece con tres días de historia.
function pintarMeta(m) {
  const netos = netosDeSubs(m);
  const ventana = ventanaDeUnDia(m);
  $('#meta-nota').textContent = 'El Programa de socios de YouTube pide ' + fmt(META_SUBS) + ' suscriptores. También pide horas de reproducción, que no son públicas.';
  reemplazar($('#meta-lista'), m.canales.map(function (c) {
    if (c.falta) return null;
    const filas = m.historia.filter((f) => f[1] === c.ci).sort((a, b) => a[0] - b[0]);
    let ritmo = '';
    if (filas.length && c.subs < META_SUBS) {
      const dias = (m.ahora - filas[0][0]) / DIA;
      const ganados = c.subs - Number(filas[0][2]);
      if (dias >= 3 && ganados > 0) {
        const porDia = ganados / dias;
        ritmo = 'Al ritmo registrado desde el ' + diaYMes.format(filas[0][0]) + ' (' + unaCifra(porDia) + ' por día), llegaría el ' + fechaNumerica.format(m.ahora + ((META_SUBS - c.subs) / porDia) * DIA) + '.';
      }
    }
    const pct = Math.min(100, (100 * c.subs) / META_SUBS);
    return crear('li', { datos: { serie: c.clave } },
      crear('div', { clase: 'meta-fila' },
        crear('span', { clase: 'meta-nombre' }, crear('span', { clase: 'clave' }), enlaceExterno(c.url, c.nombre)),
        crear('span', { clase: 'meta-cifra' }, crear('strong', null, fmt(c.subs)), ' de ' + fmt(META_SUBS))),
      crear('div', { clase: 'medidor', role: 'img', 'aria-label': c.nombre + ': ' + fmt(c.subs) + ' de ' + fmt(META_SUBS) + ' suscriptores' },
        crear('span', { estilo: { width: Math.max(0.8, pct).toFixed(1) + '%' } })),
      crear('p', { clase: 'meta-ritmo' },
        unaCifra(pct) + ' % de la meta',
        netos[c.ci] ? ' · ' + conSigno(netos[c.ci]) + ' ' + ventana : '',
        ritmo ? '. ' + ritmo : ''));
  }));
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
      crear('a', { href: '#tendencias' }, 'Ver tendencias'),
    ] });
  }
  const lista = propias.concat(ajenas.sort((a, b) => b.peso - a.peso).slice(0, 3));
  $('#senales').hidden = lista.length === 0;
  reemplazar($('#senales-lista'), lista.map((s) => crear('li', null, s.nodo)));
}

function pintarAhora(m) {
  pintarCifras(m);
  pintarMueve(m);
  pintarMeta(m);
  pintarSenales(m);
}

/* ---------- Tríptico de canales ---------- */

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

function pintarCanales(m) {
  const cubos = cubosDeVistas(m, '24h');
  const netos = [0, 0, 0];
  for (const f of m.cambiosSubs) if (netos[f[1]] !== undefined) netos[f[1]] += Number(f[2]) || 0;
  const ventana = ventanaDeUnDia(m);
  for (const c of m.canales) {
    const bloque = document.querySelector('[data-canal="' + c.id + '"]');
    if (!bloque) continue;
    const campo = (nombre) => bloque.querySelectorAll('[data-campo="' + nombre + '"]');
    if (c.falta) {
      // Las cifras que hubiera se quedan; el aviso dice que no son de esta lectura.
      campo('movimiento')[0].textContent = 'YouTube no devolvió este canal en la última lectura.';
      continue;
    }
    const vistasDelDia = sumar(cubos.map((cubo) => cubo.valores[c.ci]));
    const ganado = [];
    if (vistasDelDia > 0) ganado.push(cuantos(vistasDelDia, 'vista', 'vistas'));
    if (netos[c.ci] > 0) ganado.push(cuantos(netos[c.ci], 'suscriptor', 'suscriptores'));
    let movimiento = '';
    if (m.bitacoraDesde) {
      movimiento = conPunto((ganado.length ? 'Ganó ' + ganado.join(' y ') + ' ' : 'Sin vistas nuevas ') + ventana);
      if (netos[c.ci] < 0) movimiento += ' Perdió ' + cuantos(-netos[c.ci], 'suscriptor', 'suscriptores') + '.';
    }
    campo('movimiento')[0].textContent = movimiento;
    campo('canal').forEach(function (a) { a.href = c.url; });
    const logo = campo('logo')[0];
    if (c.logo && logo.getAttribute('src') !== c.logo) { logo.src = c.logo; logo.hidden = false; }
    if (c.usuario) campo('usuario')[0].textContent = c.usuario;
    campo('descripcion')[0].textContent = c.descripcion;
    const cifras = [['subs', c.subs, 'suscriptor', 'suscriptores'], ['vistas', c.vistas, 'vista', 'vistas'], ['videos', c.total, 'video', 'videos']];
    let caracteres = 0;
    for (const [nombre, valor, uno, varios] of cifras) {
      const nodo = campo(nombre)[0];
      ponerCifra(nodo, valor);
      nodo.closest('div').querySelector('dt').textContent = valor === 1 ? uno : varios;
      // El enlace solo muestra el número; el nombre accesible dice de qué es.
      nodo.setAttribute('aria-label', fmt(valor) + ' ' + (valor === 1 ? uno : varios));
      // Una cifra corta ocupa al menos lo que su rótulo, que mide unos tres dígitos.
      caracteres += Math.max(fmt(valor).length, 3);
    }
    bloque.querySelector('.canal-cifras').style.setProperty('--n', caracteres);

    const caja = campo('ultimo')[0];
    const v = c.ultimo;
    if (!v) {
      reemplazar(caja, [crear('p', { clase: 'ultimo-dato' }, c.total > 0 ? 'YouTube no devolvió los videos de este canal en la última lectura.' : 'Sin videos publicados.')]);
      caja.dataset.video = '';
      continue;
    }
    if (caja.dataset.video !== v.id) {
      caja.dataset.video = v.id;
      reemplazar(caja, [
        crear('h3', null, 'Lo último'),
        crear('div', { clase: 'ultimo' },
          miniatura(v, 'ultimo-mini', 'hq720'),
          crear('div', { clase: 'ultimo-texto' },
            crear('p', { clase: 'ultimo-titulo' }, enlaceExterno(v.url, v.titulo)),
            crear('p', { clase: 'ultimo-dato' }))),
      ]);
    }
    reemplazar($('.ultimo-dato', caja), [
      (v.corto ? 'Short de ' : 'Video de ') + duracion(v.seg) + ', hace ' + lapso(m.ahora - v.publicado) + '. ',
      cifraDeVideo(v, cuantos(v.vistas, 'vista', 'vistas'), 'analytics/tab-overview/period-default'),
      m.h1[v.id] > 0 ? ', ' + fmt(m.h1[v.id]) + ' en la última hora' : '', '.',
    ]);
  }
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

/* ---------- Tabla de videos ---------- */

const COMPARAR = {
  titulo: (a, b) => a.titulo.localeCompare(b.titulo, 'es'),
  canal: (a, b) => a.ci - b.ci,
  publicado: (a, b) => a.publicado - b.publicado,
  vistas: (a, b) => a.vistas - b.vistas,
  periodo: (a, b) => (a.ganado === null ? -1 : a.ganado) - (b.ganado === null ? -1 : b.ganado),
  likes: (a, b) => a.likes - b.likes,
  coms: (a, b) => a.coms - b.coms,
};

function publicadoHace(m, v) {
  const edad = m.ahora - v.publicado;
  return edad < 7 * DIA ? 'hace ' + lapso(edad) : fechaNumerica.format(v.publicado);
}

// Familia de temas de un largo y la demanda medida de esa familia. La mediana
// de la familia son vistas acumuladas durante años por los primeros resultados
// de la búsqueda, así que no se divide entre las vistas de un video nuevo: esa
// proporción siempre salía por debajo del 1 % y no decía nada del video.
function familiaDelVideo(v) {
  if (v.corto) return null;
  const familia = (FAMILIAS[v.ci] || []).find((f) => f.patron.test(v.titulo));
  if (!familia) return null;
  return crear('span', { clase: 'video-dato video-familia' },
    'Familia «' + familia.nombre + '». Demanda del tema: ' + fmt(familia.mediana) + ' vistas de mediana en la búsqueda');
}

function pintarVideos(m, inicio) {
  const periodo = PERIODOS[estado.periodo];
  const cambios = cambiosDe(m);
  const lista = m.videos
    .filter((v) => estado.canal === '' || v.ci === Number(estado.canal))
    .filter((v) => estado.tipo === '' || (estado.tipo === 'short') === v.corto);
  for (const v of lista) v.ganado = ganado(m, v, estado.periodo, inicio);
  const comparar = COMPARAR[estado.orden.campo];
  lista.sort((a, b) => estado.orden.sentido * comparar(a, b) || b.publicado - a.publicado);

  const cuerpo = $('#videos-cuerpo');
  const foco = document.activeElement && cuerpo.contains(document.activeElement) ? document.activeElement.dataset.foco : '';
  const dueno = esDueno();
  reemplazar(cuerpo, lista.map(function (v) {
    const c = m.canales[v.ci];
    const estudio = 'https://studio.youtube.com/video/' + v.id + '/';
    const dato = [(v.corto ? 'Short de ' : 'Video de ') + duracion(v.seg),
      crear('span', { clase: 'solo-movil' }, ', ', enlaceExterno(c.url, c.nombre), ', ' + publicadoHace(m, v))];
    if (dueno) dato.push('. ', enlaceExterno(estudio + 'edit', 'Editar en Studio', { datos: { foco: 'e' + v.id } }));
    const sube = v.ganado === null ? '–' : (v.ganado > 0 ? '+' : '') + fmt(v.ganado);
    const ahora = m.h1[v.id] > 0 ? crear('span', { clase: 'video-ahora' }, '+' + fmt(m.h1[v.id]) + ' en la última hora') : null;
    return crear('tr', null,
      crear('td', { clase: 'celda-video' }, crear('div', { clase: 'video' },
        miniatura(v, 'mini', 'mqdefault'),
        crear('div', { clase: 'video-texto' },
          enlaceExterno(v.url, v.titulo, { clase: 'video-titulo', datos: { foco: 't' + v.id } }),
          crear('span', { clase: 'video-dato' }, dato), ahora,
          familiaDelVideo(v),
          cambios.filter((x) => x.id === v.id).map((x) => crear('span', { clase: 'video-dato video-cambio' }, fraseDeCambio(m, x)))))),
      crear('td', { clase: 'solo-ancho' }, enlaceExterno(c.url, [c.logo ? crear('img', { src: c.logo, alt: '', width: 24, height: 24, loading: 'lazy' }) : null, c.nombre], { clase: 'celda-canal', datos: { foco: 'c' + v.id } })),
      crear('td', { clase: 'solo-ancho' }, crear('time', { datetime: new Date(v.publicado).toISOString(), title: fechaConHora.format(v.publicado) }, publicadoHace(m, v))),
      crear('td', { clase: 'num', datos: { etiqueta: 'vistas' } }, dueno ? enlaceExterno(estudio + 'analytics/tab-overview/period-default', fmt(v.vistas), { datos: { foco: 'v' + v.id } }) : fmt(v.vistas)),
      crear('td', { clase: 'num ' + (v.ganado ? 'sube' : 'nada'), datos: { etiqueta: 'en ' + periodo.nombre } }, sube),
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
    + (lista.some((v) => !v.corto) ? ' Cada largo muestra su familia de temas, asignada por las palabras del título, y la demanda de esa familia: la mediana de vistas acumuladas por los 15 primeros resultados de la búsqueda de YouTube, medida el ' + FAMILIAS_FECHA + '. Mide el interés por el tema y no es una meta de vistas para un video nuevo.' : '');
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
  const inicio = pintarTablero(m);
  pintarVideos(m, inicio);
}
function pintar() {
  const m = estado.modelo;
  if (!m) return;
  // Antes de dibujar: una gráfica en un contenedor oculto mide 0 de ancho.
  $('#datos').hidden = false;
  $('#radar').hidden = false;
  pintarCanales(m);
  pintarDatos();
  // Cada sección que sigue es independiente: si una falla, el resto de la página queda dibujado.
  try { pintarAhora(m); } catch (error) { console.error('ahora: ' + error); }
  try { pintarTendencias(m); } catch (error) { console.error('tendencias: ' + error); $('#tendencias').hidden = true; }
  try { pintarNichos(m); } catch (error) { console.error('nichos: ' + error); $('#nichos').hidden = true; }
  try { pintarComentarios(m); } catch (error) { console.error('comentarios: ' + error); $('#comentarios').hidden = true; }
  try { pintarCalendario(m); } catch (error) { console.error('calendario: ' + error); $('#calendario').hidden = true; }
}
/* ---------- Cambios de título y de miniatura ---------- */

// Los de título los anota Atalaya Vigía; los de miniatura, la tarea del
// repositorio, que compara la imagen cada hora.
function cambiosDe(m) {
  const lista = m.cambios.map((f) => ({ t: f[0], id: f[2], tipo: f[3], despues: f[5] || '' }));
  const externos = estado.externos && Array.isArray(estado.externos.cambios) ? estado.externos.cambios : [];
  for (const f of externos) if (Array.isArray(f) && f.length >= 3) lista.push({ t: f[0], id: f[1], tipo: f[2], despues: '' });
  const propios = {};
  for (const v of m.videos) propios[v.id] = v;
  return lista.filter((c) => propios[c.id] && c.t > m.ahora - 30 * DIA).sort((a, b) => a.t - b.t)
    .map((c) => Object.assign(c, { video: propios[c.id] }));
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

/* ---------- Tendencias: lo que se mueve fuera de los tres canales ---------- */

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
  const filas = t.ref.map((v) => ({ v: v, razon: v.med > 0 ? v.n / v.med : 0 })).sort((a, b) => b.razon - a.razon);
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
  const canales = t.canales.slice().sort((a, b) => b.subs - a.subs);
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
  const firma = [estado.tend, estado.tendFormato, estado.tendSin, estado.pais, t ? t.leido : 0, externos ? externos.leido : 0].join('|');
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

/* ---------- Calendario ---------- */

/* ---------- Comentarios de los canales en otros videos ---------- */

// Los anota vía «?anotar=» quien publica el comentario; Atalaya Vigía los relee cada hora
// y guarda «me gusta», respuestas y si el comentario sigue visible.
function pintarComentarios(m) {
  const c = m.comentarios;
  $('#comentarios').hidden = !c;
  if (!c) return;
  const r = c.resumen || {};
  $('#com-nota').textContent = 'Comentarios que los tres canales dejaron en videos de otros canales de su nicho. Se releen cada hora; última lectura el ' + fechaNumerica.format(c.leido) + ' a las ' + horaMinuto.format(c.leido).replace(/\.$/, '') + '.';
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

function pintarCalendario(m) {
  const hoy = new Date(m.ahora);
  hoy.setHours(0, 0, 0, 0);
  const filas = CALENDARIO.map((e) => ({ e: e, inicio: fechaLocal(e.dia), fin: fechaLocal(e.hasta || e.dia) }))
    .filter((f) => f.fin >= hoy).sort((a, b) => a.inicio - b.inicio || a.fin - b.fin);
  $('#calendario').hidden = filas.length === 0;
  if (!filas.length) return;
  $('#cal-nota').textContent = 'Fechas que mueven búsquedas en los temas de los canales. La demanda es la mediana de vistas de los 15 primeros resultados de la búsqueda de YouTube, medida el ' + FAMILIAS_FECHA + '.';
  const tope = Math.max.apply(null, filas.map((f) => f.e.demanda)) || 1;
  const conAno = (d) => (d.getFullYear() === hoy.getFullYear() ? diaYMes.format(d) : diaYMes.format(d) + ' ' + d.getFullYear());
  reemplazar($('#cal-lista'), filas.map(function (f) {
    const c = CANALES[f.e.ci];
    const faltan = Math.round((f.inicio - hoy) / DIA);
    const cuando = faltan > 1 ? 'faltan ' + faltan + ' días' : faltan === 1 ? 'mañana' : faltan === 0 ? 'hoy' : 'en curso';
    const mismoMes = f.inicio.getMonth() === f.fin.getMonth() && f.inicio.getFullYear() === f.fin.getFullYear();
    const fecha = f.fin > f.inicio ? (mismoMes ? f.inicio.getDate() : conAno(f.inicio)) + ' al ' + conAno(f.fin) : conAno(f.inicio);
    return crear('li', { datos: { serie: c.clave }, clase: faltan <= 14 ? 'cerca' : null },
      crear('div', { clase: 'cal-fecha' },
        crear('time', { datetime: f.e.dia }, fecha),
        crear('span', { clase: 'cal-cuando' }, cuando)),
      crear('div', { clase: 'cal-que' },
        crear('strong', null, f.e.que),
        crear('span', { clase: 'video-dato' }, crear('span', { clase: 'clave' }), c.nombre)),
      crear('div', { clase: 'cal-demanda' },
        f.e.demanda ? [crear('strong', null, fmt(f.e.demanda)),
          crear('span', { clase: 'barra', 'aria-hidden': 'true' }, crear('span', { estilo: { width: Math.max(2, Math.round((100 * f.e.demanda) / tope)) + '%' } }))]
          : crear('span', { clase: 'tenue' }, 'sin medir')));
  }));
}

/* ---------- Datos externos ---------- */

async function leerExternos() {
  try {
    const respuesta = await fetch(EXTERNOS, { cache: 'no-store', credentials: 'omit' });
    if (!respuesta.ok) throw new Error('código ' + respuesta.status);
    const datos = await respuesta.json();
    if (!datos || typeof datos !== 'object') throw new Error('respuesta vacía');
    estado.externos = datos;
    guardar('externos', JSON.stringify(datos));
    if (estado.modelo) { pintarDatos(); pintarTendencias(estado.modelo); }
  } catch (error) {
    // Sin esta lectura la página sigue: faltan las búsquedas de Google y los cambios de miniatura.
    console.warn('externos: ' + error.message);
  }
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

/* ---------- Lectura ---------- */

async function pedir() {
  const control = new AbortController();
  const tope = setTimeout(() => control.abort(), ESPERA_MS);
  try {
    // Sin cabeceras propias: Apps Script no responde a la consulta previa de CORS.
    const respuesta = await fetch(FUENTE, { signal: control.signal, cache: 'no-store', credentials: 'omit' });
    if (!respuesta.ok) throw new Error('el servidor respondió con el código ' + respuesta.status);
    let datos;
    try { datos = await respuesta.json(); } catch (error) { throw new Error('el servidor devolvió una respuesta que no se pudo interpretar'); }
    if (!datos || !Array.isArray(datos.canales) || !Array.isArray(datos.videos)) throw new Error('la respuesta llegó sin los canales');
    return datos;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('el servidor tardó más de ' + ESPERA_MS / 1000 + ' segundos');
    if (error instanceof TypeError) throw new Error(navigator.onLine === false ? 'este dispositivo no tiene conexión' : 'no hubo conexión con el servidor');
    throw error;
  } finally {
    clearTimeout(tope);
  }
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
    const datos = await pedir();
    estado.modelo = preparar(datos);
    guardar('datos', JSON.stringify(datos));
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
  // La cifra «videos» de cada canal lleva a la tabla ya filtrada por ese canal.
  for (const a of document.querySelectorAll('[data-filtro]')) {
    a.addEventListener('click', function () {
      estado.canal = a.dataset.filtro; estado.tipo = '';
      marcar('canal', estado.canal); marcar('tipo', '');
      pintarDatos();
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
    else if (e.target.name === 'tend-pais') { estado.pais = e.target.value; guardar('pais', estado.pais); }
    if (estado.modelo) pintarTendencias(estado.modelo);
    // La barra se rehace con el filtro: el foco vuelve a la opción elegida.
    const elegido = document.querySelector('#tend-barra input[name="' + e.target.name + '"]:checked');
    if (elegido) elegido.focus({ preventScroll: true });
  });

  for (const nombre of ['vistas', 'subs']) {
    const boton = $('#' + nombre + '-tabla-boton');
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
    }).observe($('.tablero'));
  }
}

function iniciar() {
  conectarControles();
  try { estado.externos = JSON.parse(recordar('externos') || 'null'); } catch (error) { guardar('externos', null); }
  const guardado = recordar('datos');
  if (guardado) {
    try {
      estado.modelo = preparar(JSON.parse(guardado));
      pintar();
      $('#estado').textContent = 'Lectura guardada ' + momento(estado.modelo.ahora, 'de');
    } catch (error) {
      guardar('datos', null);
    }
  }
  leer();
  leerExternos();
  setInterval(function () { if (!document.hidden) leerExternos(); }, CADA_EXTERNOS_MS);
}

iniciar();
