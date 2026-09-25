// CristaSpa - lógica común de invitación (docs/flujos/06-flujo-acceso-y-empresa.md#4-invitaciones-jefes-y-empleados).
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.117.2';
import { ErrorFuncion } from './http.ts';

export const ROLES_INVITABLES = ['boss', 'receptionist', 'employee'] as const;
export type RolInvitable = typeof ROLES_INVITABLES[number];

export interface DatosInvitacion {
  empresaId: string;
  correo: string;
  nombre: string;
  rol: RolInvitable;
  empleadoId?: string | null;
  urlApp?: string;
  invitadoPor: string;
}

const CORREO_VALIDO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Invita (o vincula, si ya tiene cuenta) a una persona a una empresa con un rol.
 * Requiere el cliente admin: crea usuarios de Auth y membresías.
 */
export async function invitar(admin: SupabaseClient, datos: DatosInvitacion): Promise<{ estado: 'invitado' | 'vinculado'; usuario_id: string }> {
  const correo = datos.correo.trim().toLowerCase();
  if (!CORREO_VALIDO.test(correo)) {
    throw new ErrorFuncion(400, 'correo_invalido', 'El correo no es válido.');
  }
  if (!ROLES_INVITABLES.includes(datos.rol)) {
    throw new ErrorFuncion(400, 'rol_invalido', 'Rol no válido.');
  }

  const { data: empresa } = await admin.from('empresas').select('id, slug, nombre, estado').eq('id', datos.empresaId).maybeSingle();
  if (!empresa || empresa.estado === 'eliminada') {
    throw new ErrorFuncion(404, 'empresa_no_encontrada', 'La empresa no existe.');
  }

  if (datos.empleadoId) {
    const { data: empleado } = await admin.from('empleados').select('id, correo, usuario_id')
      .eq('id', datos.empleadoId).eq('empresa_id', empresa.id).maybeSingle();
    if (!empleado) {
      throw new ErrorFuncion(404, 'empleado_no_encontrado', 'El especialista no existe en esta empresa.');
    }
    if (empleado.correo.toLowerCase() !== correo) {
      throw new ErrorFuncion(400, 'correo_distinto', 'El correo no coincide con el de la ficha del especialista.');
    }
  }

  const { data: existente } = await admin.rpc('_usuario_por_correo', { p_correo: correo });
  let usuarioId = existente as string | null;
  let estado: 'invitado' | 'vinculado' = 'vinculado';

  if (!usuarioId) {
    const redirectTo = datos.urlApp ? `${datos.urlApp}?empresa=${encodeURIComponent(empresa.slug)}#nueva-clave` : undefined;
    const { data, error } = await admin.auth.admin.inviteUserByEmail(correo, {
      data: { nombre: datos.nombre.trim() },
      redirectTo
    });
    if (error || !data.user) {
      console.error('inviteUserByEmail', error);
      throw new ErrorFuncion(502, 'correo_no_enviado',
        'No se pudo enviar el correo de invitación. Revisa la configuración de correo (SMTP) del proyecto.');
    }
    usuarioId = data.user.id;
    estado = 'invitado';
  }

  await admin.from('perfiles').update({ nombre: datos.nombre.trim() }).eq('id', usuarioId).eq('nombre', '');

  const { data: membresia } = await admin.from('membresias').select('rol')
    .eq('usuario_id', usuarioId).eq('empresa_id', empresa.id).maybeSingle();
  if (membresia?.rol === 'user') {
    throw new ErrorFuncion(409, 'ya_es_cliente',
      'Esta persona es cliente de la empresa con ese correo. Para el equipo usa otro correo.');
  }
  const { error: errorMembresia } = await admin.from('membresias').upsert({
    usuario_id: usuarioId, empresa_id: empresa.id, rol: datos.rol, activo: true, invitado_por: datos.invitadoPor
  }, { onConflict: 'usuario_id,empresa_id' });
  if (errorMembresia) {
    throw errorMembresia;
  }

  if (datos.empleadoId) {
    const { error: errorEmpleado } = await admin.from('empleados').update({ usuario_id: usuarioId }).eq('id', datos.empleadoId);
    if (errorEmpleado) {
      throw new ErrorFuncion(409, 'cuenta_en_uso', 'Esa cuenta ya está vinculada a otro especialista de la empresa.');
    }
  }

  await admin.from('auditoria').insert({
    empresa_id: empresa.id, actor_id: datos.invitadoPor, accion: 'invitar', entidad: 'membresias',
    entidad_id: usuarioId, despues: { rol: datos.rol, correo, estado }
  });

  return { estado, usuario_id: usuarioId };
}
