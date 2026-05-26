# Maison Lash Demo

Aplicacion web movil creada con HTML, CSS y JavaScript vanilla. La estructura esta separada por rol para que el desarrollo sea mas claro, mantenible y facil de ampliar.

## Estructura

```text
index.html                 Pantalla de login y registro
CSS/styles.css             Estilos exclusivos del login
JavaScript/app.js          Controlador de acceso

compartido/
	css/base.css             Sistema visual movil comun
	js/data-store.js         Datos, migraciones y persistencia localStorage
	js/auth.js               Sesion, roles y rutas
	js/ui.js                 Utilidades visuales, fechas, CSV e imagenes

usuarios/
	html/index.html          Panel del usuario final
	css/usuarios.css         Estilos del usuario final
	js/usuarios.js           Citas, productos, servicios y WhatsApp

empleado/
	html/index.html          Calendario independiente del empleado
	css/empleado.css         Estilos del empleado
	js/empleado.js           Filtros y gestion de citas del empleado

jefe/
	html/index.html          Panel de control del jefe
	css/jefe.css             Estilos del jefe
	js/jefe.js               CRUD de servicios, productos, empleados y agenda
```

## Conexion de datos

Todas las pantallas usan los mismos datos desde `localStorage` mediante `compartido/js/data-store.js`:

- `maisonlash_v3`: servicios.
- `maisonlash_boss_products`: productos visuales.
- `maisonlash_clients`: clientes registrados.
- `maisonlash_employees`: empleados.
- `maisonlash_appointments`: citas.
- `maisonlash_settings`: configuracion de WhatsApp y redes.
- `maisonlash_session`: sesion activa.

## Accesos de prueba

- Usuario final: `usuario` / `user123`
- Jefe: `jefe` / `jefe123`
- Empleado: `empleado` / `empleado123`
- Admin: `admin` / `admin123` entra al panel del jefe

## Flujo principal

1. `index.html` autentica o registra clientes.
2. `auth.js` guarda la sesion y redirige segun rol.
3. Cada modulo valida su rol antes de renderizar.
4. Las acciones del jefe, usuario y empleado escriben en el mismo `localStorage`.
5. Las citas creadas por usuario o jefe aparecen automaticamente en la agenda del empleado asignado.

## Ejecucion

Puedes abrir `index.html` directamente en el navegador. No requiere servidor ni instalacion de dependencias.