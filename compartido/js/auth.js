/*
  CristaSpa - autenticación, contexto de sesión y guardas de página.
  Supabase Auth maneja las credenciales; el rol en cada empresa sale de la RPC
  mi_contexto (membresías en la base). Nada de esto reemplaza a RLS: solo decide
  a qué pantalla ir (docs/flujos/03-roles-y-permisos.md#dónde-se-hacen-cumplir-los-permisos).
*/
import { supabase, ejecutar, rpc } from './supabase.js';
import { ErrorApp } from './errores.js';
import { aplicarMarca, empresaGuardada, guardarEmpresa, raizApp, urlDeEmpresa } from './tenant.js';
import { vigilarConexion, html } from './ui.js';

const CLAVE_SOPORTE = 'cristaspa_soporte';

export const RUTAS_POR_ROL = Object.freeze({
  developer: 'desarrollador/html/index.html',
  boss: 'jefe/html/index.html',
  receptionist: 'jefe/html/index.html',
  employee: 'empleado/html/index.html',
  user: 'usuarios/html/index.html'
});

export const NOMBRES_ROL = Object.freeze({
  developer: 'Desarrollador',
  boss: 'Jefe',
  receptionist: 'Recepción',
  employee: 'Especialista',
  user: 'Cliente'
});

/**
 * Inicia sesión con correo y contraseña.
 * @param {string} correo Correo.
 * @param {string} clave Contraseña.
 */
export async function iniciarSesion(correo, clave) {
  await ejecutar(supabase.auth.signInWithPassword({ email: correo.trim().toLowerCase(), password: clave }));
}

/**
 * Registra un cliente nuevo en la empresa del slug.
 * @param {{slug: string, nombre: string, apellido: string, telefono: string, correo: string,
 *          clave: string, fechaNacimiento: string|null, aceptaDatos: boolean}} datos Datos del formulario.
 * @returns {Promise<{requiereConfirmacion: boolean}>} Si Supabase exige confirmar el correo primero.
 */
export async function registrarCliente(datos) {
  if (!datos.aceptaDatos) {
    throw new ErrorApp('debe_aceptar_datos', 'Debes aceptar el tratamiento de datos personales.');
  }
  const respuesta = await ejecutar(supabase.auth.signUp({
    email: datos.correo.trim().toLowerCase(),
    password: datos.clave,
    options: {
      emailRedirectTo: urlDeEmpresa(datos.slug, '#registro-confirmado'),
      data: { nombre: datos.nombre.trim(), apellido: datos.apellido.trim(), telefono: datos.telefono.trim() }
    }
  }));

  // Supabase no revela si el correo ya existía: devuelve un usuario sin identidades.
  if (respuesta.user && Array.isArray(respuesta.user.identities) && respuesta.user.identities.length === 0) {
    throw new ErrorApp('user_already_exists', 'Ya existe una cuenta con este correo. Inicia sesión con ella.');
  }
  if (!respuesta.session) {
    guardarRegistroPendiente(datos);
    return { requiereConfirmacion: true };
  }
  await unirseComoCliente(datos);
  return { requiereConfirmacion: false };
}

/**
 * Crea la membresía de cliente del usuario autenticado en la empresa del slug.
 * @param {{slug: string, nombre: string, apellido: string, telefono: string,
 *          fechaNacimiento: string|null, aceptaDatos: boolean}} datos Datos del cliente.
 * @returns {Promise<string>} Id del cliente.
 */
export function unirseComoCliente(datos) {
  return rpc('unirse_como_cliente', {
    p_slug: datos.slug,
    p_nombre: datos.nombre,
    p_apellido: datos.apellido || '',
    p_telefono: datos.telefono || null,
    p_fecha_nacimiento: datos.fechaNacimiento || null,
    p_acepta_datos: Boolean(datos.aceptaDatos)
  });
}

/** Guarda los datos del registro mientras el cliente confirma su correo. */
function guardarRegistroPendiente(datos) {
  const { clave, ...sinClave } = datos;
  localStorage.setItem('cristaspa_registro_pendiente', JSON.stringify(sinClave));
}

/**
 * Datos de un registro pendiente de confirmar para el correo dado, y los olvida.
 * @param {string} correo Correo de la sesión actual.
 * @returns {object|null} Datos del registro.
 */
export function tomarRegistroPendiente(correo) {
  try {
    const datos = JSON.parse(localStorage.getItem('cristaspa_registro_pendiente') || 'null');
    if (datos && datos.correo?.toLowerCase() === correo?.toLowerCase()) {
      localStorage.removeItem('cristaspa_registro_pendiente');
      return datos;
    }
  } catch {
    localStorage.removeItem('cristaspa_registro_pendiente');
  }
  return null;
}

/**
 * Envía el correo para restablecer la contraseña. Nunca revela si el correo existe.
 * @param {string} correo Correo.
 * @param {string|null} slug Empresa para volver con su marca.
 */
export async function recuperarClave(correo, slug) {
  await ejecutar(supabase.auth.resetPasswordForEmail(correo.trim().toLowerCase(), {
    redirectTo: urlDeEmpresa(slug, '#nueva-clave')
  }));
}

/**
 * Cambia la contraseña del usuario autenticado.
 * @param {string} clave Nueva contraseña.
 */
export async function cambiarClave(clave) {
  await ejecutar(supabase.auth.updateUser({ password: clave }));
}

/**
 * Cierra la sesión y vuelve al login con la marca de la empresa.
 */
export async function cerrarSesion() {
  const slug = empresaGuardada()?.slug || null;
  sessionStorage.removeItem(CLAVE_SOPORTE);
  await supabase.auth.signOut();
  window.location.href = urlDeEmpresa(slug);
}

/**
 * Sesión actual de Supabase (o null).
 * @returns {Promise<import('@supabase/supabase-js').Session|null>} Sesión.
 */
export async function obtenerSesion() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

/**
 * Contexto del usuario (perfil, developer, membresías y rol en la empresa del slug).
 * @param {string|null} slug Empresa.
 * @returns {Promise<object>} Resultado de mi_contexto.
 */
export function obtenerContexto(slug) {
  return rpc('mi_contexto', { p_slug: slug || null });
}

/**
 * Decide a dónde ir después de iniciar sesión.
 * @param {object} contexto Resultado de mi_contexto.
 * @param {string|null} slug Empresa resuelta por la URL.
 * @returns {{tipo: 'ruta', ruta: string, membresia?: object}
 *   | {tipo: 'selector', membresias: Array<object>}
 *   | {tipo: 'no_miembro'|'sin_empresas'|'empresa_suspendida'|'acceso_desactivado', mensaje: string}}
 */
export function decidirDestino(contexto, slug) {
  const activas = contexto.membresias.filter(m => m.activo && ['prueba', 'activa'].includes(m.estado_empresa));

  if (slug) {
    const membresia = contexto.membresias.find(m => m.slug === slug);
    if (membresia && contexto.rol) {
      return { tipo: 'ruta', ruta: RUTAS_POR_ROL[contexto.rol], membresia };
    }
    if (membresia && !membresia.activo) {
      return { tipo: 'acceso_desactivado', mensaje: 'Tu acceso a esta empresa fue desactivado. Comunícate con el negocio.' };
    }
    if (membresia) {
      return { tipo: 'empresa_suspendida', mensaje: 'Esta empresa está suspendida temporalmente. Comunícate con el negocio.' };
    }
    if (contexto.es_developer) {
      return { tipo: 'ruta', ruta: RUTAS_POR_ROL.developer };
    }
    return { tipo: 'no_miembro', mensaje: 'Tu cuenta no pertenece a esta empresa.' };
  }

  if (contexto.es_developer) {
    return { tipo: 'ruta', ruta: RUTAS_POR_ROL.developer };
  }
  if (activas.length === 1) {
    return { tipo: 'ruta', ruta: RUTAS_POR_ROL[activas[0].rol], membresia: activas[0] };
  }
  if (activas.length > 1) {
    return { tipo: 'selector', membresias: activas };
  }
  return { tipo: 'sin_empresas', mensaje: 'Ingresa con el enlace que te compartió tu negocio.' };
}

/**
 * Modo soporte ("ver como empresa") del developer.
 * @returns {{empresa_id: string, slug: string, nombre: string, edicion: boolean}|null} Estado.
 */
export function modoSoporte() {
  try {
    return JSON.parse(sessionStorage.getItem(CLAVE_SOPORTE) || 'null');
  } catch {
    return null;
  }
}

/**
 * Activa o termina el modo soporte.
 * @param {object|null} datos Empresa a ver, o null para salir.
 */
export function definirModoSoporte(datos) {
  if (datos) {
    sessionStorage.setItem(CLAVE_SOPORTE, JSON.stringify(datos));
  } else {
    sessionStorage.removeItem(CLAVE_SOPORTE);
  }
}

/**
 * Guarda de página: exige sesión, empresa y un rol permitido. Aplica la marca.
 * Si algo no cuadra, redirige o muestra una pantalla de estado y devuelve null.
 * @param {{roles: Array<string>, titulo: string, sinEmpresa?: boolean}} opciones Roles permitidos.
 * @returns {Promise<{contexto: object, empresa: object|null, rol: string, soporte: object|null}|null>}
 */
export async function protegerPagina({ roles, titulo, sinEmpresa = false }) {
  vigilarConexion();
  const guardada = empresaGuardada();
  aplicarMarca(guardada, { titulo });

  const sesion = await obtenerSesion();
  if (!sesion) {
    window.location.replace(urlDeEmpresa(guardada?.slug || null));
    return null;
  }

  const soporte = modoSoporte();
  const slug = sinEmpresa ? null : (soporte?.slug || guardada?.slug || null);
  let contexto;
  try {
    contexto = await obtenerContexto(slug);
  } catch (error) {
    mostrarEstado('No pudimos cargar tu cuenta', error.message, 'Reintentar', () => window.location.reload());
    return null;
  }

  if (roles.includes('developer') && contexto.es_developer && sinEmpresa) {
    aplicarMarca(null, { titulo });
    return { contexto, empresa: null, rol: 'developer', soporte: null };
  }

  if (soporte && contexto.es_developer && contexto.empresa) {
    guardarEmpresa(contexto.empresa);
    aplicarMarca(contexto.empresa, { titulo });
    document.body.classList.toggle('soporte-activo', !soporte.edicion);
    mostrarBandaSoporte(soporte);
    return { contexto, empresa: contexto.empresa, rol: 'boss', soporte };
  }

  if (!contexto.empresa) {
    const destino = decidirDestino(contexto, null);
    if (destino.tipo === 'ruta' && destino.membresia) {
      guardarEmpresa({ slug: destino.membresia.slug });
      window.location.reload();
      return null;
    }
    window.location.replace(urlDeEmpresa(null));
    return null;
  }

  guardarEmpresa(contexto.empresa);
  aplicarMarca(contexto.empresa, { titulo });

  if (!['prueba', 'activa'].includes(contexto.empresa.estado)) {
    mostrarEstado('Empresa suspendida', 'El acceso a esta empresa está suspendido temporalmente. Comunícate con el negocio.',
      'Cerrar sesión', cerrarSesion);
    return null;
  }
  if (!contexto.rol) {
    mostrarEstado('Acceso desactivado', 'Tu acceso a esta empresa fue desactivado.', 'Cerrar sesión', cerrarSesion);
    return null;
  }
  if (!roles.includes(contexto.rol)) {
    window.location.replace(raizApp() + RUTAS_POR_ROL[contexto.rol]);
    return null;
  }

  escucharCambiosDeSesion();
  return { contexto, empresa: contexto.empresa, rol: contexto.rol, soporte: null };
}

/** Si la sesión se cierra en otra pestaña o expira, vuelve al login. */
function escucharCambiosDeSesion() {
  supabase.auth.onAuthStateChange(evento => {
    if (evento === 'SIGNED_OUT') {
      window.location.replace(urlDeEmpresa(empresaGuardada()?.slug || null));
    }
  });
}

/**
 * Reemplaza el contenido de la página por un mensaje de estado.
 * @param {string} titulo Título.
 * @param {string} mensaje Detalle.
 * @param {string} textoBoton Acción.
 * @param {() => void} accion Acción del botón.
 */
export function mostrarEstado(titulo, mensaje, textoBoton, accion) {
  const contenedor = document.querySelector('main') || document.body;
  contenedor.innerHTML = html`
    <section class="page-state">
      <div>
        <h2>${titulo}</h2>
        <p>${mensaje}</p>
      </div>
      <button class="primary-button" type="button" id="accion-estado">${textoBoton}</button>
    </section>`;
  document.getElementById('accion-estado').addEventListener('click', accion);
}

/** Banda fija del modo soporte con botón para salir. */
function mostrarBandaSoporte(soporte) {
  const banda = document.createElement('div');
  banda.className = 'banner';
  banda.innerHTML = html`
    <span>Modo soporte · ${soporte.nombre} · ${soporte.edicion ? 'Edición habilitada' : 'Solo lectura'}</span>
    <button type="button" id="salir-soporte">Salir</button>`;
  document.body.prepend(banda);
  banda.querySelector('#salir-soporte').addEventListener('click', () => {
    definirModoSoporte(null);
    guardarEmpresa(null);
    window.location.href = raizApp() + RUTAS_POR_ROL.developer;
  });
}
