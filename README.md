# Universe Game

Plataforma de jugadores con fichas virtuales y panel Master Root conservado. No hay dinero real, juegos, apuestas, cuotas ni proveedores conectados.

## Arranque

Node.js 18 o posterior. No requiere base de datos externa ni dependencias de ejecución.

```sh
npm start
```

Abrir `http://localhost:3000/`. Se puede definir `PORT` si el hosting lo proporciona. La raíz siempre muestra el acceso compartido.

| Rol | Usuario inicial | Contraseña inicial | Destino |
| --- | --- | --- | --- |
| Administrador demo | `universe_admin` | `UniverseAdmin2026!` | `/admin` |
| Jugador demo | `universe_player` | `UniversePlayer2026!` | `/jugadores` |

Las cuentas se provisionan durante el arranque normal, sin flags ni endpoints de creación administrativa. El jugador nuevo comienza con 10.000 fichas virtuales. El saldo del encabezado se obtiene de su cuenta en el servidor. Son cuentas de demostración autorizadas para este modelo; las credenciales están documentadas deliberadamente.

La provisión es idempotente. No cambia contraseñas, saldos ni usuarios preexistentes. Si un nombre ya existe antes de la provisión, conserva esa cuenta y crea la demo con sufijo `_2`, `_3`, etc.; el nombre creado aparece en el log del primer arranque. Los IDs asignados quedan guardados en `demoAccounts`. Una contraseña cambiada en los datos no se restablece en el siguiente arranque.

## Persistencia

Por defecto se guarda en `data/universe.json` y `data/uploads/`, fuera de las rutas públicas y excluidos de Git. Se escribe el JSON mediante archivo temporal, fsync y renombrado. Si la base es inválida, el proceso falla sin reemplazarla. Esta implementación admite **una instancia de servidor** sobre un directorio de datos; no es una base distribuida.

Un reinicio del proceso conserva los datos en el mismo disco. Para conservarlos también al reemplazar contenedores o desplegar en un hosting efímero, `DATA_DIR` debe apuntar a su volumen persistente. Hacer copia de todo el directorio, incluidos `universe.json` y `uploads/`.

No se conoce una URL verificada ni la configuración del servicio Render de este proyecto. No se cambió hosting ni se lanzó un deploy manual. Si el servicio existente despliega desde `main`, el push puede disparar ese flujo. El comando de inicio es `npm start`; para persistencia entre despliegues en Render, comprobar que el servicio tenga un disco persistente y que `DATA_DIR` señale su ruta. Las cuentas se crean igualmente al arrancar una instancia nueva; no se afirma que un servicio remoto las haya creado hasta probar su URL.

## Banners

Ingresar como administrador → menú → **Banners Inicio / Slots**.

- Dos destinos independientes; subir PNG, JPG o WebP de hasta 4 MB.
- Vista previa antes de guardar, edición de título y subtítulo, orden numérico, activar/desactivar y eliminar.
- Inicio usa un marco vertical en móvil; Slots, un marco horizontal 3,6:1. Preparar las imágenes con estas proporciones y texto alejado de los bordes. Las imágenes subidas ya contienen su composición: el título se usa como texto alternativo, sin superponerlo.
- Los banners guardados se reflejan al abrir o recargar la vista del jugador. Las flechas/puntos permiten recorrer los activos en su orden.
- Los dos banners iniciales solo se siembran una vez; eliminarlos o desactivarlos no los regenera.

Se conservó el panel original (estadísticas, menús y tarjetas visuales). Antes de este cambio sus módulos eran una maqueta estática y el acceso no validaba credenciales; no se agregaron funcionalidades ficticias a esos módulos. La ampliación administrativa es exclusivamente banners, más los controles de sesión necesarios.

## Jugadores

Portada galáctica, selección promocional, bloque deportivo, zonas de catálogo vacías, franja social y pie de página. Menú móvil con Inicio, Deportes, Slots, Casino en vivo, CABALLOS y CrazZy Win!.

Deportes y Caballos tienen rutas vacías con navegación para volver. Slots y Casino tienen catálogo vacío; filtros de favoritos/recientes y búsqueda muestran únicamente estados vacíos. No se inventan proveedores ni enlaces sociales. Chat y notificaciones informan honestamente su estado; Mi cuenta incluye saldo y cierre de sesión.

## Autenticación y límites del modelo

El servidor decide el rol; rutas y APIs administrativas rechazan jugadores. Las contraseñas utilizan scrypt con salt, y las sesiones cookies HttpOnly/SameSite con caducidad de ocho horas (Secure cuando la solicitud llega por HTTPS). Las sesiones se invalidan al cerrar sesión y al reiniciar el servidor; después se puede volver a ingresar con las mismas cuentas. Las mutaciones requieren cabecera propia y validación de origen. Hay límite de intentos de login por IP. La raíz del repositorio y los datos no se sirven como archivos estáticos.

## Verificación

```sh
npm test
```

Prueba integradora con 8 subcasos (9 resultados incluyendo el contenedor): acceso anónimo, archivos privados, contraseña inválida, origen externo, ambos roles, cookies, permisos, subida y separación de banners, edición/estado/borrado, logout, reinicio y conservación de cuentas/saldos/contraseñas ante conflictos.

La comprobación visual en navegador y las capturas no deben considerarse aprobadas solo porque pasen estos tests. Consultar `QA.md` para el alcance comprobado y los límites del entorno de entrega.

## Recursos gráficos

Los gráficos galáctico, ruleta, cartas y deportes fueron generados para esta implementación y optimizados en WebP. El logotipo de texto, las tipografías Metropolis y los seis iconos genéricos de navegación se obtuvieron de los recursos públicos de `universegame.co`, la referencia indicada por el usuario. No se descargó ningún juego ni catálogo. El orbital combina un SVG de órbitas con el logotipo; el diseño es una reconstrucción, no una captura utilizada como página. El logotipo original del panel sigue conservado.
