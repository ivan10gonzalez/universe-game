# Panel blanco · gestión de sitios

Versión independiente dedicada a sitios, cuentas, permisos y banners. El servidor activo no sirve juegos, páginas de jugadores, saldos, movimientos, proveedores ni APIs anteriores. La estética conserva el menú lateral claro, fondo gris azulado, formularios blancos y botones celestes del panel de referencia.

## Acceso de demostración

| Rol | Usuario inicial | Contraseña inicial |
| --- | --- | --- |
| Super Master | `super_master` | `SuperMasterDemo2026!` |
| Master del sitio Universe, solo en instalación nueva | `universe_admin` | `UniverseAdmin2026!` |

Estas credenciales demo se incluyen en el código por indicación del usuario. Usar exclusivamente datos de prueba. Se pueden cambiar desde el menú de cuenta → Cambiar contraseña. Un cambio invalida las sesiones de esa cuenta y se conserva al reiniciar. El valor de `SUPER_MASTER_PASSWORD` permite reemplazar la clave inicial del Super Master en el primer arranque, pero nunca sobrescribe contraseñas de una base existente.

Abrir `/` o `/admin` para ingresar. Las cuentas creadas desde Usuarios pueden iniciar sesión en ese mismo formulario.

## Jerarquía

- **Super Master:** tiene **Sitios** al final del menú. Puede crear sitios, seleccionar uno, administrar sus banners/configuración y crear únicamente cuentas Master. Puede restablecer las contraseñas de los Masters.
- **Master:** queda vinculado a un solo sitio. No tiene Sitios, no puede crear Masters y puede crear agentes. Administra los usuarios, banners, configuración y actividad de su propio sitio.
- **Agente:** puede crear agentes debajo de su cuenta y estos pueden crear más subagentes. Ve únicamente su cuenta y descendientes. No accede a otras ramas, otros sitios, banners, configuración ni actividad general. Su menú contiene Usuarios, Reportes globales de cuentas y Mi resumen.

El servidor determina rol, sitio y responsable. Rechaza intentos de asignarlos libremente desde el navegador. Los Masters pueden restablecer contraseñas de agentes de su sitio; los agentes solo las de sus descendientes. Nadie puede usar ese mecanismo para cambiar las claves de superiores o de cuentas de otra rama. El cambio propio exige la contraseña actual.

## Cómo probar

1. Ingresar como `super_master`.
2. Abrir el menú → **Sitios**. Seleccionar Universe o crear otro sitio.
3. Entrar a Usuarios → **Nuevo Master** y definir sus credenciales.
4. Salir e ingresar como ese Master. Aparece **Nuevo agente**, sin Sitios.
5. Crear un agente e ingresar con él. Puede crear otros agentes, pero no Masters.
6. Volver al Super Master, seleccionar otro sitio y comprobar que cambian usuarios, banners, configuración y actividad.

La selección es explícita en cada URL de la API; no existe un sitio seleccionado global para todo el servidor. Cambiar el sitio en una sesión no cambia la selección de otra persona.

## Desarrollo y Render

Node.js 20 o posterior, sin dependencias de ejecución.

```sh
npm start
npm test
```

El comando de inicio sigue siendo `npm start` (también funciona `node server.js`). Render puede desplegar este commit si el servicio está conectado a esta rama y tiene auto-deploy activado. El código subido no demuestra que el despliegue haya finalizado: comprobar `/api/health`, que devuelve `service: "site-management"`.

Variables opcionales:

- `PORT`: puerto HTTP, por defecto 3000.
- `HOST`: interfaz, por defecto `0.0.0.0`.
- `DATA_DIR`: directorio persistente, por defecto `data/`.
- `SUPER_MASTER_PASSWORD`: contraseña inicial alternativa; entre 12 y 128 caracteres.
- `NODE_ENV=production`: exige cookies Secure (usar HTTPS).

## Separación y preservación de los datos

El nuevo servidor almacena sus datos en **`DATA_DIR/management.json`**. No modifica `universe.json` ni su carpeta de imágenes. Si al primer arranque existe el archivo anterior, se copian únicamente las identidades administrativas: `admin` pasa a Master del sitio Universe y `agent` pasa a agente. Se conservan sus nombres, hashes de contraseña y relaciones válidas; no se importan jugadores, saldos, movimientos ni banners anteriores. La importación solo ocurre una vez.

Si no hay cuentas administrativas anteriores disponibles, se crea un sitio Universe y el Master demo de la tabla. Si la base anterior o su jerarquía son inválidas, el proceso falla sin reemplazar esos datos. Tener un repositorio privado no conserva la base: para persistencia entre despliegues, `DATA_DIR` debe apuntar a un disco persistente y hay que guardar copias de seguridad. Un despliegue en disco efímero puede perder las cuentas nuevas.

La implementación admite **una sola instancia/proceso** por directorio de datos. Guarda cambios mediante escritura temporal, fsync y renombrado, y actualiza la memoria solo después de guardarlos. Contraseñas con scrypt y salt; cookies HttpOnly/SameSite, expiración de ocho horas y validación de origen en mutaciones.

Los archivos del prototipo anterior siguen recuperables en Git y algunos permanecen en el repositorio por compatibilidad de historial, pero el servidor tiene una lista cerrada de archivos públicos y no los sirve ni los importa. No se modificó el repositorio independiente `Juegos-`.

## Banners y reportes

Hasta 20 banners por sitio, PNG/JPG/WebP de hasta 1 MB; orden, título, vista previa, edición, estado y eliminación. Se guardan como datos del panel, sin publicar hacia otras plataformas. Reportes y resumen muestran cuentas del alcance autorizado; no contienen datos económicos. La actividad conserva los últimos 2.000 eventos por sitio y muestra los 100 más recientes.

## Verificación

`npm test` cubre rutas públicas y privadas, creación de Masters y varios niveles de agentes, aislamiento por sitio y rama, intentos de escalar permisos, banners, configuración, cambio/restablecimiento de claves, revocación de sesiones, validación de origen, límites de login, reinicio e importación sin copiar saldos ni modificar los datos anteriores.

Ver `QA.md` para las comprobaciones visuales y sus límites.

## Recursos visuales

Diseño prioritario para celular, contrastado con la referencia a 393 px de ancho. Las fuentes y los iconos se sirven desde el propio proyecto: Roboto (`roboto-fontface` 0.10.0) y Font Awesome Free 5.7.0. Sus licencias acompañan los archivos en `management/public/fonts/`. No requieren conexión con el sitio de referencia ni un CDN. La adaptación de escritorio queda como base para una revisión posterior.
