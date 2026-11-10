# Atalaya

Página estática que muestra las cifras públicas de tres canales de YouTube: suscriptores, vistas y videos. Con la página abierta, las cifras se leen de nuevo cada minuto.

## Cómo funciona

- `index.html`, `estilo.css` y `atalaya.js` forman el sitio. No hay paso de compilación ni dependencias.
- Los datos llegan en JSON desde una aplicación web de Google Apps Script, que consulta la YouTube Data API con permiso de solo lectura. La dirección está en la constante `FUENTE` de `atalaya.js`.
- `tema.js` se carga antes del primer pintado y aplica el tema guardado en el navegador.
- `fuentes/` contiene las tipografías, todas bajo la SIL Open Font License (`fuentes/LICENCIAS.txt`).

## Probarlo en la computadora

Sirve cualquier servidor de archivos estáticos:

    python3 -m http.server 8000

Después se abre `http://localhost:8000/`.

## Límites conocidos

- YouTube actualiza sus contadores con retraso: una cifra puede tardar minutos u horas en moverse.
- La lectura en vivo trae los 15 videos más recientes de cada canal.
- Se muestran como máximo 30 días.
- La página lleva `noindex`: está pensada para quien tiene el enlace.

## Datos y privacidad

Solo se muestran estadísticas públicas obtenidas con los Servicios de la API de YouTube. El sitio no usa cookies ni analítica y no pide datos a quien lo visita.
