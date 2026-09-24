# Jugadores: acceso, menús e imágenes

La portada /jugadores se puede abrir sin sesión. El botón Iniciar sesión abre el formulario Bienvenido sobre la portada, con estado de carga, errores y cancelación. Las cuentas y funciones privadas conservan autenticación del servidor; solo los banners activos son públicos.

El icono de cuenta despliega las ocho opciones del recorrido. Cambiar contraseña e Historial de ingresos usan datos reales; las otras opciones muestran estados explícitos cuando falta actividad o configuración. La campana despliega Mesa de ayuda y Notificaciones. Soporte reproduce la ventana móvil y mantiene el envío deshabilitado hasta configurar un canal real. No hay mensajes ficticios ni conexión al soporte del sitio de referencia.

Panel → Banners Inicio / Slots → Selección o Deportes permite reemplazar las imágenes inferiores, modificar sus textos, ordenarlas, activarlas o eliminarlas. Las tres imágenes actuales se importan una sola vez a data/uploads y se registran en la base. El cliente ya no fija sus archivos: los lee de la API. Los originales del repositorio se conservan únicamente como material inicial para instalaciones nuevas; no vuelven a imponerse sobre las imágenes editadas. Inicio y Slots mantienen su editor existente.

Validación: 12 resultados de pruebas de servidor aprobados. Prueba DOM contra servidor real: acceso invitado, error/reintento/login, imágenes desde uploads, desplegables, cambio de contraseña, notificaciones, soporte e historial. Pendiente la comprobación visual en navegador real por fallo de la herramienta de navegador y la verificación del despliegue.
