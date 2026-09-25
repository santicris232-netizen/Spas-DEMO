# 06 · Acceso y resolución de empresa

> **Estado:** ✅ Aprobado el 2026-09-25.

## 1. Resolución de empresa (`tenant.js`)

Se ejecuta **en todas las páginas antes que cualquier otra lógica**.

```mermaid
flowchart TD
    A[Carga de página] --> B{¿Subdominio distinto<br/>de www/app?}
    B -->|sí| S[slug = subdominio]
    B -->|no| C{¿?empresa=slug<br/>en la URL?}
    C -->|sí| S
    C -->|no| D{¿slug guardado en<br/>sessionStorage?}
    D -->|sí| S
    D -->|no| G[Modo plataforma<br/>marca CristaSpa genérica]

    S --> V[Consultar empresas_publicas<br/>por slug]
    V --> W{¿Existe y está en<br/>prueba/activa?}
    W -->|no| X[Pantalla 'Empresa no disponible'<br/>+ enlace a CristaSpa]
    W -->|sí| Y[Guardar en sessionStorage<br/>aplicar marca: logo, colores, título]
    Y --> Z[Continuar con auth.js]
    G --> Z
```

- El slug de la URL **solo decide la marca**. El acceso a los datos lo decide la membresía en la base de datos.
- La marca se guarda en caché durante la sesión para no repetir la consulta en cada página.
- Mientras se resuelve la marca se muestra un esqueleto neutro, para no "flashear" los colores de CristaSpa.

## 2. Inicio de sesión

```mermaid
sequenceDiagram
    actor P as Persona
    participant L as index.html (login.js)
    participant A as Supabase Auth
    participant DB as Postgres

    P->>L: correo + contraseña
    L->>A: signInWithPassword
    A-->>L: sesión (JWT) o error
    alt credenciales inválidas
        L-->>P: "Correo o contraseña incorrectos" (mensaje genérico)
    else sesión válida
        L->>DB: perfil + membresías activas (con estado de la empresa)
        DB-->>L: { es_developer, membresias[] }
        L->>L: decidirDestino()
        L-->>P: redirige
    end
```

### `decidirDestino()`

```mermaid
flowchart TD
    A[Sesión válida] --> B{¿Hay empresa<br/>resuelta por slug?}
    B -->|sí| C{¿Membresía activa<br/>en esa empresa?}
    C -->|sí| R["Ruta según el rol<br/>boss→jefe · receptionist→jefe (modo recepción) · employee→empleado · user→usuarios"]
    C -->|no| D{¿es_developer?}
    D -->|sí| DV[desarrollador/<br/>con opción 'ver como' esta empresa]
    D -->|no| N[Cerrar sesión · 'Tu cuenta no pertenece a esta empresa'<br/>+ opción 'Registrarme aquí como cliente']
    B -->|no| E{¿es_developer?}
    E -->|sí| DV2[desarrollador/]
    E -->|no| F{¿Cuántas membresías<br/>activas tiene?}
    F -->|0| N2[Mensaje: 'Usa el enlace de tu empresa']
    F -->|1| R2[Fijar esa empresa y<br/>ruta según el rol]
    F -->|2 o más| SEL[Selector de empresa<br/>logo + nombre + rol]
    SEL --> R2
```

## 3. Registro de cliente (rol `user`)

Solo se permite **con una empresa resuelta**: un cliente siempre se registra en una empresa concreta.

```mermaid
sequenceDiagram
    actor C as Cliente
    participant L as index.html
    participant A as Supabase Auth
    participant DB as Postgres (RPC)

    C->>L: nombre, apellido, celular, correo, contraseña, fecha de nacimiento, ✔ tratamiento de datos
    L->>L: validar formato (celular 10 dígitos, contraseña ≥ 8)
    L->>A: signUp(correo, contraseña, metadata)
    alt el correo ya tiene cuenta en CristaSpa
        A-->>L: error "ya registrado"
        L-->>C: "Ya tienes cuenta: inicia sesión con ella"<br/>(al iniciar sesión se le ofrece unirse a esta empresa)
    else cuenta nueva
        A-->>L: sesión
        L->>DB: unirse_como_cliente(slug, datos)
        DB->>DB: crea perfil (si no existe), membresía user y fila en clientes
        DB-->>L: ok
        L-->>C: usuarios/ (bienvenida)
    end
```

- `unirse_como_cliente` es una RPC: busca la empresa por slug, verifica que esté activa o en prueba y crea la membresía `user`. **El navegador nunca envía `empresa_id` ni `rol`.**
- Si la empresa exige confirmar el correo (configuración de Supabase), se muestra "Revisa tu correo" y la membresía se crea al confirmar y entrar por primera vez.

### Cliente que ya existe en otra empresa

Una persona con cuenta en el spa A entra al enlace del spa B:

1. Inicia sesión con su cuenta de siempre.
2. `decidirDestino` detecta que no tiene membresía en B.
3. Se le ofrece **"Registrarme como cliente de B"**, que llama a `unirse_como_cliente` con un solo clic.

## 4. Invitaciones (jefes y empleados)

```mermaid
sequenceDiagram
    actor Q as Quien invita (developer o boss)
    participant F as Edge Function invitar-usuario
    participant A as Supabase Auth (admin)
    participant DB as Postgres
    actor I as Invitado

    Q->>F: { empresa_id, correo, nombre, rol, empleado_id? } + JWT
    F->>DB: ¿el que invita tiene permiso?<br/>developer: cualquier rol · boss: boss, receptionist o employee en su empresa
    F->>A: inviteUserByEmail(correo, redirectTo=/?empresa=slug#aceptar)<br/>(si ya existe la cuenta: no reinvita)
    F->>DB: upsert perfil · membresía (rol) · empleados.usuario_id
    F->>DB: auditoria('invitar')
    F-->>Q: ok
    A-->>I: correo "Te invitaron a <Empresa> en CristaSpa"
    I->>I: clic → define su contraseña
    I->>I: entra directo a su módulo
```

## 5. Recuperar contraseña

1. En el login: "¿Olvidaste tu contraseña?" → correo.
2. `resetPasswordForEmail(correo, { redirectTo: '/?empresa=slug#nueva-clave' })`.
3. Siempre se muestra "Si el correo existe, te enviamos un enlace" (no revela qué correos existen).
4. El enlace abre el formulario de nueva contraseña → `updateUser({ password })` → redirección normal.

## 6. Sesión y cierre de sesión

| Tema | Comportamiento |
|---|---|
| Duración | La gestiona Supabase: JWT de 1 h con renovación automática |
| Persistencia | `supabase-js` en `localStorage`. Se eliminan `maisonlash_session` y los usuarios fijos |
| Contexto guardado | `sessionStorage.cristaspa_empresa = { id, slug, nombre, rol }` |
| Guarda de página | `requireRole(['boss'])` valida sesión, membresía y rol **en la base de datos** al cargar la página, no solo en el valor guardado |
| Empresa suspendida con sesión abierta | En la siguiente consulta RLS devuelve vacío o error. La app detecta `empresa.estado` y muestra "Empresa suspendida, contacta a soporte" |
| Membresía desactivada | Igual que el caso anterior: pierde el acceso en la siguiente consulta |
| Cerrar sesión | `signOut()` + limpiar `sessionStorage` → volver a `/?empresa=slug` (se mantiene la marca) |
| Cambiar de empresa | Menú de perfil → "Cambiar empresa" (solo si tiene 2 o más membresías) |

## 7. Pantallas del login

| Estado | Contenido |
|---|---|
| Sin empresa | Logo CristaSpa · "Inicia sesión" · texto "¿Eres cliente? Usa el enlace que te compartió tu spa" · sin opción de registro |
| Con empresa | Logo y colores de la empresa · Iniciar sesión · Crear cuenta · ¿Olvidaste tu contraseña? · pie "Con tecnología de CristaSpa" |
| Empresa no disponible | Mensaje neutro, sin detalles internos |
| Selector de empresa | Tarjetas con logo, nombre y rol |

---

← [05 · Seguridad](05-seguridad.md) · [Índice](README.md) · [07 · Marca dinámica](07-marca-dinamica.md) →
