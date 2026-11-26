# Atalaya

Página estática con las cifras de Kilometraje Real y El Banco de la Plaza: suscriptores, vistas, horas de reproducción, retención y lo que se mueve en su nicho. Con la página abierta, las cifras se leen de nuevo cada minuto.

## Cómo funciona

- `index.html`, `estilo.css`, `atalaya.js` y `atipicos.js` forman el sitio. No hay paso de compilación ni dependencias.
- Cuatro vistas, cada una con su dirección: `#hoy`, `#crecimiento`, `#videos` y `#radar` (atajos de teclado 1 a 4).
- Los datos llegan de Atalaya Vigía, un servicio de Cloud Run en el proyecto `prod-canales-gcp` (constante `VIGIA` de `atalaya.js`):
  - `/vivo`: cifras de los canales y sus 15 videos más recientes, leídas de YouTube como mucho cada 45 s.
  - `/panel`: historia, bitácora de 24 horas, lectura diaria por video, cambios de título, nichos, tendencias, comentarios y YouTube Analytics. Responde 304 si no cambió.
  - `/atipicos`: videos de canales chicos del nicho que van 5 veces o más sobre su mediana.
- `tema.js` se carga antes del primer pintado y aplica el tema y el modo dueño guardados.
- `tareas/externos.mjs` lee cada hora el RSS público de Google Trends y la miniatura de cada video propio. Lo corre `.github/workflows/externos.yml` y deja `externos.json` en la rama `datos`.
- `fuentes/` contiene las tipografías, todas bajo la SIL Open Font License (`fuentes/LICENCIAS.txt`).

## Probarlo en la computadora

    python3 -m http.server 8000

Después se abre `http://localhost:8000/`. Vigía acepta pedidos desde `localhost`.

## Límites conocidos

- YouTube actualiza sus contadores con retraso; YouTube Analytics llega con 2 o 3 días de atraso.
- La lectura en vivo trae los 15 videos más recientes de cada canal.
- Se guardan como máximo 30 días.
- La página lleva `noindex`: está pensada para quien tiene el enlace.

## Datos y privacidad

Solo se muestran estadísticas obtenidas con los Servicios de la API de YouTube. El sitio no usa cookies ni analítica y no pide datos a quien lo visita.
