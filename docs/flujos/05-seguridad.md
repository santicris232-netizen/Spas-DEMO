# 05 · Seguridad

> **Estado:** ✅ Aprobado el 2026-09-25.

## ⚠️ Hallazgo urgente en v1 (antes de empezar v2)

> Corresponde a los hallazgos **S-01 a S-04** del [diagnóstico de v1](01-vision-y-alcance.md#diagnóstico-de-v1-maison-lash).

Las tablas `clients` y `employees` de Supabase guardan **contraseñas en texto plano**. El navegador las lee con la clave pública, que está en `compartido/js/data-store.js`. Si esas tablas no tienen RLS (la app v1 las lee completas sin sesión, así que probablemente no la tienen), **cualquier persona puede descargar todos los correos y contraseñas** con esa clave.

**Acción recomendada inmediata (independiente de v2):**
1. En el panel de Supabase, revisar si RLS está activo en las tablas v1.
2. Si no lo está, limitar el acceso o poner la demo en modo privado hasta migrar.
3. En la migración, **ninguna contraseña v1 se reutiliza**: todos los usuarios definen una nueva ([14](14-migracion-maison-lash.md)).

## Modelo de amenazas

| # | Amenaza | Ejemplo | Control |
|---|---|---|---|
| T1 | **Fuga entre empresas** | Un jefe del spa A consulta citas del spa B desde la consola | RLS con `tiene_rol(empresa_id)` en todas las tablas + FK compuestas + pruebas automáticas por tabla |
| T2 | **Escalada de privilegios** | Un usuario hace `update perfiles set es_developer = true` | `revoke update (es_developer) on perfiles from authenticated`. Solo se cambia desde una Edge Function que exige ser developer |
| T3 | Membresía falsificada | Un usuario se inserta como `boss` | Sin política de INSERT en `membresias` para `authenticated`. Solo RPC `unirse_como_cliente` (rol fijo `user`) y Edge Functions |
| T4 | Cambiar `empresa_id` de una fila | Mover una cita a otra empresa | Trigger `bloquear_cambio_empresa` + `with check` en RLS |
| T5 | Manipular precios u horarios | Enviar `total = 0` al reservar | Las citas se crean solo por RPC, que calcula `fin` y `total` en el servidor |
| T6 | Doble reserva | Dos clientes al mismo tiempo | Restricción `EXCLUDE` en `citas` |
| T7 | Filtración de `service_role` | La clave en el JS público | Solo en variables de entorno de las Edge Functions. Revisión en CI: grep que falle si aparece `service_role` fuera de `supabase/functions` |
| T8 | XSS | Nombre de servicio con `<script>` | Se mantiene `escapeHTML` / `escapeAttr` · CSP estricta · no usar `innerHTML` con datos sin escapar |
| T9 | Fuerza bruta / registros spam | Bots en el login | Límites de Supabase Auth + **Cloudflare Turnstile** en registro y login |
| T10 | Enumeración de cuentas | "¿Este correo existe?" | Mensajes genéricos en login y recuperación |
| T11 | Subida maliciosa a Storage | Subir un HTML o archivos gigantes | Política por carpeta de empresa + tipos permitidos (`image/webp`, `png`, `jpeg`) + límite de 2 MB en el bucket |
| T12 | Abuso del modo "ver como" | Un developer modifica datos de una empresa | Solo lectura por defecto; la edición exige confirmación y todo queda en `auditoria` |
| T13 | Cuenta de developer comprometida | Robo de contraseña | MFA obligatorio (TOTP) para developers + alerta en auditoría |

## Cabeceras HTTP (`_headers` en Cloudflare)

```text
/*
  Content-Security-Policy: default-src 'self'; script-src 'self' https://cdn.jsdelivr.net https://challenges.cloudflare.com; style-src 'self' https://fonts.googleapis.com 'unsafe-inline'; font-src https://fonts.gstatic.com; img-src 'self' data: blob: https://<proyecto>.supabase.co; connect-src 'self' https://<proyecto>.supabase.co wss://<proyecto>.supabase.co; frame-src https://challenges.cloudflare.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Strict-Transport-Security: max-age=31536000; includeSubDomains
```

- `style-src 'unsafe-inline'` se mantiene de momento por los `style=""` que existen en el HTML. Queda como tarea retirarlos.
- Hay que agregar `supabase/`, `tests/` y `docs/` a `.assetsignore` para que no se publiquen en Cloudflare.

## Protección de datos personales (Colombia, Ley 1581 de 2012)

| Requisito | Implementación |
|---|---|
| Autorización del titular | Casilla obligatoria en el registro + `clientes.acepta_datos` con fecha |
| Política de tratamiento | Página por empresa (texto editable por el jefe, con plantilla base de CristaSpa) |
| Acceso, rectificación | El usuario edita su perfil |
| Supresión | "Eliminar mi cuenta en esta empresa" → anonimización ([11](11-modulo-usuario.md#perfil)) |
| Rol de CristaSpa | La empresa es **responsable** y CristaSpa es **encargado** del tratamiento; debe quedar en los términos del servicio |

## Respaldo y recuperación

- Producción en un plan de Supabase con **backups diarios** (y PITR si el presupuesto lo permite).
- Exportación por empresa (JSON/CSV) desde el módulo desarrollador antes de eliminar una empresa.
- Migraciones versionadas: cada cambio de esquema es reproducible y reversible.

## Checklist de seguridad antes de producción

- [ ] RLS activo en **todas** las tablas (`select tablename from pg_tables where schemaname='public' and not rowsecurity` → 0 filas)
- [ ] Pruebas de aislamiento en verde para todas las tablas y roles
- [ ] Ninguna columna `password` en el esquema público
- [ ] `service_role` ausente del frontend (revisión de CI)
- [ ] MFA activo en todos los developers
- [ ] Turnstile activo en login y registro
- [ ] Cabeceras `_headers` desplegadas y verificadas
- [ ] Tablas v1 eliminadas o sin datos sensibles

---

← [04 · Modelo de datos](04-modelo-de-datos.md) · [Índice](README.md) · [06 · Acceso y resolución de empresa](06-flujo-acceso-y-empresa.md) →
