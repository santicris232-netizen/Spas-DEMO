// CristaSpa - utilidades HTTP de las Edge Functions (CORS, respuestas y clientes de Supabase).
import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2.117.2';

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

/** Error con código estable y mensaje para el usuario. */
export class ErrorFuncion extends Error {
  constructor(public estadoHttp: number, public codigo: string, mensaje: string) {
    super(mensaje);
  }
}

export function responder(estado: number, cuerpo: unknown): Response {
  return new Response(JSON.stringify(cuerpo), { status: estado, headers: { ...cors, 'Content-Type': 'application/json' } });
}

export function responderError(error: unknown): Response {
  if (error instanceof ErrorFuncion) {
    return responder(error.estadoHttp, { codigo: error.codigo, mensaje: error.message });
  }
  console.error(error);
  return responder(500, { codigo: 'error_interno', mensaje: 'Ocurrió un error inesperado. Intenta de nuevo.' });
}

function variable(nombre: string): string {
  const valor = Deno.env.get(nombre);
  if (!valor) {
    throw new Error(`Falta la variable de entorno ${nombre}`);
  }
  return valor;
}

/** Cliente con la sesión de quien llama: respeta RLS y deja auditado su auth.uid(). */
export async function clienteDeUsuario(peticion: Request): Promise<{ cliente: SupabaseClient; usuario: User }> {
  const autorizacion = peticion.headers.get('Authorization');
  if (!autorizacion?.startsWith('Bearer ')) {
    throw new ErrorFuncion(401, 'sin_sesion', 'Debes iniciar sesión.');
  }
  const cliente = createClient(variable('SUPABASE_URL'), variable('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: autorizacion } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data, error } = await cliente.auth.getUser(autorizacion.slice('Bearer '.length));
  if (error || !data.user) {
    throw new ErrorFuncion(401, 'sin_sesion', 'Tu sesión expiró. Inicia sesión de nuevo.');
  }
  return { cliente, usuario: data.user };
}

/** Cliente con la service_role: solo existe dentro de la Edge Function. */
export function clienteAdmin(): SupabaseClient {
  return createClient(variable('SUPABASE_URL'), variable('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

/** Valida y normaliza la URL de la app a la que vuelve el enlace del correo. */
export function urlApp(valor: unknown): string | undefined {
  if (typeof valor !== 'string' || !valor) {
    return undefined;
  }
  try {
    const url = new URL(valor);
    if (!['http:', 'https:'].includes(url.protocol)) {
      return undefined;
    }
    return `${url.origin}${url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`}`;
  } catch {
    return undefined;
  }
}
