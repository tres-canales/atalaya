// Se carga en el <head>, antes del primer pintado: aplica el tema y el modo
// dueño guardados para que la página no cambie de aspecto al terminar de cargar.
(function () {
  var raiz = document.documentElement;
  try {
    var parametros = new URLSearchParams(location.search);
    if (parametros.has('dueno')) {
      if (parametros.get('dueno') === '0') localStorage.removeItem('atalaya.dueno');
      else localStorage.setItem('atalaya.dueno', '1');
      // El parámetro se quita de la barra de direcciones para que no viaje al compartir el enlace.
      history.replaceState(null, '', location.pathname + location.hash);
    }
    var tema = localStorage.getItem('atalaya.tema');
    if (tema === 'claro' || tema === 'oscuro') raiz.setAttribute('data-tema', tema);
    if (localStorage.getItem('atalaya.dueno') === '1') raiz.setAttribute('data-dueno', '');
  } catch (error) {
    // Sin almacenamiento (modo privado estricto): la página funciona con el tema del sistema.
  }
})();
