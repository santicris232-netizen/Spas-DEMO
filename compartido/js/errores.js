/*
  CristaSpa - errores de la aplicación.
  Convierte los errores de Supabase (Postgres, PostgREST, Auth, red) en un ErrorApp
  con un código estable y un mensaje listo para mostrar al usuario.
  Los códigos de negocio vienen en el HINT de las funciones RPC (supabase/migrations/*_rpc_negocio.sql).
*/

export class ErrorApp extends Error {
  /**
   * @param {string} codigo Código estable (p. ej. 'horario_ocupado', 'sin_permiso', 'sin_conexion').
   * @param {string} mensaje Mensaje para el usuario.
   * @param {unknown} [original] Error original, para depuración.
   */
  constructor(codigo, mensaje, original) {
    super(mensaje);
    this.name = 'ErrorApp';
    this.codigo = codigo;
    this.original = original;
  }
}

const MENSAJES_AUTH = {
  invalid_credentials: 'Correo o contraseña incorrectos.',
  email_not_confirmed: 'Confirma tu correo antes de iniciar sesión. Revisa tu bandeja de entrada.',
  user_already_exists: 'Ya existe una cuenta con este correo. Inicia sesión con ella.',
  email_exists: 'Ya existe una cuenta con este correo. Inicia sesión con ella.',
  weak_password: 'La contraseña debe tener al menos 8 caracteres, con letras y números.',
  over_email_send_rate_limit: 'Se enviaron demasiados correos. Intenta de nuevo en unos minutos.',
  over_request_rate_limit: 'Demasiados intentos. Espera un momento e intenta de nuevo.',
  same_password: 'La nueva contraseña debe ser distinta de la anterior.',
  session_not_found: 'Tu sesión expiró. Inicia sesión de nuevo.',
  email_address_invalid: 'El correo no es válido.',
  signup_disabled: 'El registro está deshabilitado en este momento.'
};

/**
 * Traduce cualquier error a ErrorApp.
 * @param {any} error Error de supabase-js, de red o de JavaScript.
 * @returns {ErrorApp} Error normalizado.
 */
export function traducirError(error) {
  if (error instanceof ErrorApp) {
    return error;
  }

  if (error instanceof TypeError || /Failed to fetch|NetworkError|Load failed/i.test(error?.message || '')) {
    return new ErrorApp('sin_conexion', 'No hay conexión. Revisa tu internet e intenta de nuevo.', error);
  }

  // Errores de Supabase Auth.
  if (error?.__isAuthError || error?.name?.startsWith?.('Auth')) {
    const codigo = error.code || 'auth';
    return new ErrorApp(codigo, MENSAJES_AUTH[codigo] || 'No se pudo completar la autenticación.', error);
  }

  // Errores de Postgres / PostgREST.
  const { code, hint, message } = error || {};
  if (hint && /^[a-z_]+$/.test(hint)) {
    return new ErrorApp(hint, message, error);
  }
  switch (code) {
    case '42501':
    case 'PGRST301':
      return new ErrorApp('sin_permiso', 'No tienes permiso para esta acción.', error);
    case '23505':
      return new ErrorApp('duplicado', 'Ya existe un registro con esos datos.', error);
    case '23503':
      return new ErrorApp('en_uso', 'No se puede completar: hay información relacionada que depende de este registro.', error);
    case '23P01':
      return new ErrorApp('horario_ocupado', 'Ese horario se acaba de ocupar. Elige otro.', error);
    case '23514':
      return new ErrorApp('dato_invalido', 'Algún dato no tiene el formato correcto.', error);
    case 'PGRST116':
      return new ErrorApp('no_encontrado', 'No se encontró la información solicitada.', error);
    default:
      return new ErrorApp('desconocido', 'Ocurrió un error inesperado. Intenta de nuevo.', error);
  }
}
