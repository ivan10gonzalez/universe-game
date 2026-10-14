# Verificación del panel de gestión de sitios

Fecha: 14 de octubre de 2026.

- Pruebas automáticas de servidor: 11 resultados aprobados. Incluyen creación de agentes por agentes, tercera generación, ramas aisladas, sitios separados, intentos de crear Masters desde roles inferiores, banners de distintos sitios, restablecimiento y revocación de sesiones, persistencia e importación limitada a identidades administrativas.
- El código del cliente y el arranque pasan la comprobación de sintaxis de Node.
- Navegador real: acceso del Super Master, Sitios al final del menú, selección del sitio, creación de un sitio local de prueba, acceso del Master sin Sitios, y revisión en viewport móvil de 393 × 852.
- Las pruebas de UI usan una base local independiente en `/private/tmp`; sus sitios de prueba y sesiones no se publican.
- El despliegue de Render no se considera verificado por el push. El endpoint `/api/health` debe identificar `site-management` en la instancia remota.

El menú y reportes de esta versión son de administración general. No se sirven rutas de juegos, saldos, jugadores ni APIs del prototipo anterior.

## Referencia visual móvil

Se inspeccionó el panel de referencia en el navegador sin enviar formularios ni modificar sus cuentas. Medidas obtenidas del DOM renderizado a 393 px: Roboto 300/400/500, menú lateral 240 px, filas de menú 36 px con texto de 12,8 px; barra superior 46,5 px; tabla 14,4 px; botones pequeños 10,24 px y 31,36 px de alto; menú de cuenta 189 px y texto 14,4 px. Se aplicaron esas medidas y los colores #708090, #ff3547, #00bcd4 y #4285f4.

Las fuentes Roboto y los iconos Font Awesome Free 5.7.0 se incluyen localmente con sus licencias, obtenidos de los paquetes públicos npm. No se copió código privado, sesiones ni datos del sitio de referencia. La estructura de roles y las secciones siguen correspondiendo a gestión de sitios: no se afirma equivalencia funcional ni visual absoluta entre pantallas de contenido diferente.

Comprobación en navegador a 393 × 852: fuentes cargadas, sin desbordamiento horizontal, barra de 46,5 px, tabla de 14,4 px, formulario de creación de agentes y consola sin errores. También se verificó el árbol de agentes y subagentes y la ausencia de Sitios en el acceso de un agente.
