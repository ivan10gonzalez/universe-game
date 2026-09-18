# Verificación de entrega

## Ejecutado

- `node --test tests/server.test.js`: 9 resultados correctos, sin fallos.
- Servidor local arrancado por el comando normal; cuentas demo creadas sin flags.
- Login HTTP real de administrador y jugador; contraseña incorrecta rechazada.
- API y rutas privadas protegidas, redirecciones por rol y logout invalidando la cookie.
- Subida PNG, lectura del archivo protegido, separación Inicio/Slots, edición, orden, activación/desactivación y borrado.
- Reinicio del proceso: se mantienen usuarios, hashes, saldo modificado, banners y archivos. Las cuentas vuelven a iniciar sesión.
- Conflicto de nombre: la cuenta anterior conserva sus datos y la demo recibe un sufijo.
- Lectura visual de las siete capturas de referencia originales; recursos de juegos omitidos.

- Prueba funcional adicional con DOM (jsdom 30, servidor HTTP real): login inválido/válido, redirección de jugador, apertura/cierre de menú, Inicio/Slots/Casino/Deportes/Caballos, estados vacíos de filtros y búsqueda, carga HTTP de todos los recursos de imagen, modal de cuenta, logout y edición real de banner desde el panel. Sin excepciones JS en esta prueba. No sustituye a un navegador ni comprueba layout.

## Limitaciones pendientes

El entorno local impidió iniciar un navegador. Se intentaron Chromium 151 (headless y navegador completo) y Chromium 134: finalizaron con SIGTRAP/SIGABRT antes de cargar la aplicación. Las herramientas `cua_repl` y `node_repl` también fallaron al iniciar por un error del perfil `sandbox-exec` (`unbound variable: TIOCSTI`). No hay capturas de la aplicación ni validación visual real de overflow, errores de consola o interacción móvil/escritorio. No se afirma igualdad píxel a píxel.

No hay URL verificada de Render ni comprobación de cuentas en una instancia remota. La persistencia se probó reiniciando el proceso sobre el mismo directorio; un hosting con almacenamiento efímero requiere un volumen persistente para sobrevivir al reemplazo de contenedores.

## Revisión visual que falta al recuperar el navegador

1. Abrir `/` a 360×800, 390×844 y 1440×1000; probar error de login y ambos roles.
2. Comparar portada, menú abierto, promociones, franjas y pie con IMG_5022–IMG_5027; revisar scroll y ausencia de overflow.
3. Comparar Slots con IMG_5028 conservando el catálogo vacío; comprobar filtros, búsqueda y navegación a Deportes/Caballos.
4. Administrador: subir un banner en cada destino, previsualizar, guardar y comprobarlo como jugador; editar orden, desactivar y borrar.
5. Reiniciar, ingresar otra vez y verificar persistencia; comprobar cierre de sesión y falta de errores JS.
