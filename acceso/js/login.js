/*
  CristaSpa - controlador de la pantalla de acceso.
  Resuelve la empresa del enlace, aplica su marca y maneja login, registro,
  recuperación de contraseña y la decisión de a qué módulo entrar
  (docs/flujos/06-flujo-acceso-y-empresa.md).
*/
import { supabase } from '../../compartido/js/supabase.js';
import { aplicarMarca, guardarEmpresa, raizApp, resolverEmpresa } from '../../compartido/js/tenant.js';
import {
  NOMBRES_ROL, cambiarClave, cerrarSesion, decidirDestino, iniciarSesion, obtenerContexto, obtenerSesion,
  recuperarClave, registrarCliente, tomarRegistroPendiente, unirseComoCliente
} from '../../compartido/js/auth.js';
import { html, vigilarConexion } from '../../compartido/js/ui.js';

const VISTAS = ['vista-cargando', 'vista-login', 'vista-registro', 'vista-recuperar', 'vista-nueva-clave', 'vista-selector', 'vista-mensaje'];
const SUBTITULOS = {
  'vista-login': 'Ingresa a tu cuenta',
  'vista-registro': 'Crea tu cuenta',
  'vista-recuperar': 'Recupera tu contraseña',
  'vista-nueva-clave': 'Nueva contraseña',
  'vista-selector': 'Elige dónde entrar',
  'vista-mensaje': ''
};

let empresa = null;
let slug = null;

document.addEventListener('DOMContentLoaded', iniciar);

/** Arranque de la página. */
async function iniciar() {
  vigilarConexion();
  conectarEventos();

  let resolucion;
  try {
    resolucion = await resolverEmpresa();
  } catch (error) {
    aplicarMarca(null);
    mostrarMensaje(error.message, { secundaria: ['Reintentar', () => window.location.reload()] });
    return;
  }

  empresa = resolucion.empresa;
  slug = resolucion.slug;
  aplicarMarca(empresa, { titulo: 'Acceso' });
  document.body.classList.toggle('modo-plataforma', !empresa);

  if (resolucion.estado === 'no_disponible') {
    mostrarMensaje('Esta empresa no está disponible. Revisa el enlace o comunícate con el negocio.', {
      secundaria: ['Ir a CristaSpa', () => { guardarEmpresa(null); window.location.href = raizApp(); }]
    });
    return;
  }

  if (window.location.hash === '#nueva-clave') {
    esperarRecuperacion();
    return;
  }

  if (await obtenerSesion()) {
    await continuarConSesion();
    return;
  }
  mostrarVista('vista-login');
}

/** Conecta formularios y botones. */
function conectarEventos() {
  document.querySelectorAll('[data-ir]').forEach(boton => {
    boton.addEventListener('click', () => mostrarVista(boton.dataset.ir));
  });
  document.querySelectorAll('[data-accion="salir"]').forEach(boton => boton.addEventListener('click', cerrarSesion));
  document.getElementById('vista-login').addEventListener('submit', alIniciarSesion);
  document.getElementById('vista-registro').addEventListener('submit', alRegistrarse);
  document.getElementById('vista-recuperar').addEventListener('submit', alRecuperar);
  document.getElementById('vista-nueva-clave').addEventListener('submit', alGuardarNuevaClave);
}

/**
 * Muestra una sola vista del formulario.
 * @param {string} id Id de la vista.
 */
function mostrarVista(id) {
  VISTAS.forEach(vista => document.getElementById(vista).classList.toggle('hidden', vista !== id));
  document.querySelectorAll('.form-error').forEach(error => error.classList.remove('active'));
  const subtitulo = SUBTITULOS[id];
  const elemento = document.getElementById('auth-subtitle');
  elemento.textContent = subtitulo || '';
  elemento.classList.toggle('hidden', !subtitulo);
  document.getElementById(id).querySelector('input')?.focus({ preventScroll: true });
}

/**
 * Muestra un error dentro del formulario visible.
 * @param {HTMLElement} formulario Formulario.
 * @param {string} mensaje Texto.
 */
function mostrarErrorEn(formulario, mensaje) {
  const error = formulario.querySelector('.form-error');
  error.textContent = mensaje;
  error.classList.add('active');
}

/**
 * Ejecuta el envío de un formulario bloqueando el botón y mostrando errores.
 * @param {SubmitEvent} evento Evento.
 * @param {() => Promise<void>} accion Acción.
 */
async function enviar(evento, accion) {
  evento.preventDefault();
  const formulario = evento.currentTarget;
  const boton = formulario.querySelector('button[type="submit"]');
  formulario.querySelector('.form-error').classList.remove('active');
  if (!formulario.checkValidity()) {
    const invalido = formulario.querySelector(':invalid');
    mostrarErrorEn(formulario, mensajeValidacion(invalido));
    invalido?.focus();
    return;
  }
  const texto = boton.textContent;
  boton.disabled = true;
  boton.textContent = 'Procesando…';
  try {
    await accion(formulario);
  } catch (error) {
    console.error(error?.original || error);
    mostrarErrorEn(formulario, error.message || 'Ocurrió un error inesperado.');
  } finally {
    boton.disabled = false;
    boton.textContent = texto;
  }
}

/**
 * Mensaje de validación en español para un campo inválido.
 * @param {HTMLInputElement|null} campo Campo.
 * @returns {string} Mensaje.
 */
function mensajeValidacion(campo) {
  if (!campo) {
    return 'Revisa los datos del formulario.';
  }
  const etiqueta = document.querySelector(`label[for="${campo.id}"]`)?.textContent?.replace(/\(.*\)/, '').trim();
  if (campo.type === 'checkbox') {
    return 'Debes aceptar el tratamiento de datos personales.';
  }
  if (campo.validity.valueMissing) {
    return `Completa el campo "${etiqueta}".`;
  }
  if (campo.validity.typeMismatch && campo.type === 'email') {
    return 'Escribe un correo válido.';
  }
  if (campo.validity.tooShort) {
    return `"${etiqueta}" debe tener al menos ${campo.minLength} caracteres.`;
  }
  if (campo.validity.patternMismatch && campo.type === 'tel') {
    return 'El celular debe tener 10 dígitos.';
  }
  return `Revisa el campo "${etiqueta}".`;
}

/** Envío del login. */
function alIniciarSesion(evento) {
  return enviar(evento, async () => {
    await iniciarSesion(valor('login-correo'), valor('login-clave'));
    await continuarConSesion();
  });
}

/** Envío del registro de cliente. */
function alRegistrarse(evento) {
  return enviar(evento, async formulario => {
    const clave = valor('registro-clave');
    if (!/[a-zA-Z]/.test(clave) || !/\d/.test(clave)) {
      mostrarErrorEn(formulario, 'La contraseña debe tener letras y números.');
      return;
    }
    const resultado = await registrarCliente({
      slug,
      nombre: valor('registro-nombre'),
      apellido: valor('registro-apellido'),
      telefono: valor('registro-telefono'),
      correo: valor('registro-correo'),
      clave,
      fechaNacimiento: valor('registro-nacimiento') || null,
      aceptaDatos: document.getElementById('registro-acepta').checked
    });
    if (resultado.requiereConfirmacion) {
      mostrarMensaje(`Te enviamos un correo a ${valor('registro-correo')}. Ábrelo y confirma tu cuenta para continuar.`, {
        secundaria: ['Volver al inicio', () => mostrarVista('vista-login')]
      });
      return;
    }
    await continuarConSesion();
  });
}

/** Envío de la recuperación de contraseña. */
function alRecuperar(evento) {
  return enviar(evento, async () => {
    await recuperarClave(valor('recuperar-correo'), slug);
    mostrarMensaje('Si el correo está registrado, te enviamos un enlace para crear una nueva contraseña.', {
      secundaria: ['Volver al inicio', () => mostrarVista('vista-login')]
    });
  });
}

/** Espera a que Supabase procese el enlace de recuperación. */
function esperarRecuperacion() {
  const mostrar = () => mostrarVista('vista-nueva-clave');
  supabase.auth.onAuthStateChange(evento => {
    if (evento === 'PASSWORD_RECOVERY') {
      mostrar();
    }
  });
  obtenerSesion().then(sesion => {
    if (sesion) {
      mostrar();
    } else {
      setTimeout(async () => {
        if (!(await obtenerSesion())) {
          mostrarMensaje('El enlace para cambiar la contraseña no es válido o ya expiró. Solicita uno nuevo.', {
            secundaria: ['Solicitar otro enlace', () => mostrarVista('vista-recuperar')]
          });
        }
      }, 2500);
    }
  });
}

/** Guarda la nueva contraseña. */
function alGuardarNuevaClave(evento) {
  return enviar(evento, async formulario => {
    const clave = valor('nueva-clave');
    if (clave !== valor('nueva-clave-2')) {
      mostrarErrorEn(formulario, 'Las contraseñas no coinciden.');
      return;
    }
    if (!/[a-zA-Z]/.test(clave) || !/\d/.test(clave)) {
      mostrarErrorEn(formulario, 'La contraseña debe tener letras y números.');
      return;
    }
    await cambiarClave(clave);
    history.replaceState(null, '', window.location.pathname + window.location.search);
    await continuarConSesion();
  });
}

/** Con sesión iniciada: completa registros pendientes y decide a dónde ir. */
async function continuarConSesion() {
  mostrarVista('vista-cargando');
  const sesion = await obtenerSesion();
  const pendiente = tomarRegistroPendiente(sesion?.user?.email);
  if (pendiente) {
    try {
      await unirseComoCliente(pendiente);
    } catch (error) {
      console.error(error?.original || error);
    }
  }

  const contexto = await obtenerContexto(slug);
  const destino = decidirDestino(contexto, slug);

  switch (destino.tipo) {
    case 'ruta':
      if (destino.membresia && !empresa) {
        guardarEmpresa({ slug: destino.membresia.slug });
      }
      window.location.href = raizApp() + destino.ruta;
      return;
    case 'selector':
      mostrarSelector(destino.membresias);
      return;
    case 'no_miembro':
      ofrecerUnirse(contexto);
      return;
    default:
      mostrarMensaje(destino.mensaje, { secundaria: ['Cerrar sesión', cerrarSesion] });
  }
}

/**
 * Lista de empresas para elegir.
 * @param {Array<object>} membresias Membresías activas.
 */
function mostrarSelector(membresias) {
  const lista = document.getElementById('empresa-lista');
  lista.innerHTML = membresias.map(membresia => html`
    <button class="empresa-opcion" type="button" data-slug="${membresia.slug}">
      <span class="brand-logo brand-logo-fallback">${membresia.nombre.slice(0, 2).toUpperCase()}</span>
      <span><strong>${membresia.nombre}</strong><span>${NOMBRES_ROL[membresia.rol] || membresia.rol}</span></span>
    </button>`).join('');
  lista.querySelectorAll('[data-slug]').forEach(boton => {
    boton.addEventListener('click', () => {
      window.location.href = `${raizApp()}?empresa=${encodeURIComponent(boton.dataset.slug)}`;
    });
  });
  mostrarVista('vista-selector');
}

/**
 * La cuenta existe pero no pertenece a esta empresa: ofrece unirse como cliente.
 * @param {object} contexto Contexto del usuario.
 */
function ofrecerUnirse(contexto) {
  const nombreEmpresa = empresa?.nombre || 'esta empresa';
  mostrarMensaje(`Tu cuenta aún no está registrada en ${nombreEmpresa}. ¿Quieres registrarte como cliente?`, {
    principal: [`Registrarme en ${nombreEmpresa}`, async () => {
      if (!document.getElementById('mensaje-acepta').checked) {
        mostrarErrorEn(document.getElementById('vista-mensaje'), 'Debes aceptar el tratamiento de datos personales.');
        return;
      }
      try {
        await unirseComoCliente({
          slug,
          nombre: contexto.perfil?.nombre || 'Cliente',
          apellido: contexto.perfil?.apellido || '',
          telefono: contexto.perfil?.telefono || null,
          fechaNacimiento: null,
          aceptaDatos: true
        });
        await continuarConSesion();
      } catch (error) {
        mostrarErrorEn(document.getElementById('vista-mensaje'), error.message);
      }
    }],
    secundaria: ['Cerrar sesión', cerrarSesion],
    pedirAceptacion: true
  });
}

/**
 * Vista de mensaje con hasta dos acciones.
 * @param {string} texto Mensaje.
 * @param {{principal?: [string, Function], secundaria?: [string, Function], pedirAceptacion?: boolean}} acciones Botones.
 */
function mostrarMensaje(texto, acciones = {}) {
  document.getElementById('mensaje-texto').textContent = texto;
  document.getElementById('mensaje-acepta-campo').classList.toggle('hidden', !acciones.pedirAceptacion);
  reemplazarBoton('mensaje-accion', acciones.principal);
  reemplazarBoton('mensaje-secundaria', acciones.secundaria);
  mostrarVista('vista-mensaje');
}

/**
 * Configura un botón de la vista de mensaje (clonándolo para quitar oyentes previos).
 * @param {string} id Id del botón.
 * @param {[string, Function]|undefined} accion Texto y acción.
 */
function reemplazarBoton(id, accion) {
  const actual = document.getElementById(id);
  const nuevo = actual.cloneNode(false);
  nuevo.classList.toggle('hidden', !accion);
  if (accion) {
    nuevo.textContent = accion[0];
    nuevo.addEventListener('click', accion[1]);
  }
  actual.replaceWith(nuevo);
}

/** Valor recortado de un campo. */
function valor(id) {
  return document.getElementById(id).value.trim();
}

