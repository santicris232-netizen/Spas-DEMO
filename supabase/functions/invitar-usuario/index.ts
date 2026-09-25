// CristaSpa - Edge Function invitar-usuario.
// El developer invita cualquier rol; el jefe invita jefes, recepción y especialistas de SU empresa.
import { clienteAdmin, clienteDeUsuario, cors, ErrorFuncion, responder, responderError, urlApp } from '../_shared/http.ts';
import { invitar, ROLES_INVITABLES, type RolInvitable } from '../_shared/invitar.ts';

Deno.serve(async peticion => {
  if (peticion.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }
  try {
    if (peticion.method !== 'POST') {
      throw new ErrorFuncion(405, 'metodo_no_permitido', 'Método no permitido.');
    }
    const { cliente, usuario } = await clienteDeUsuario(peticion);
    const cuerpo = await peticion.json().catch(() => ({}));
    const { empresa_id: empresaId, correo, nombre, rol, empleado_id: empleadoId } = cuerpo ?? {};

    if (typeof empresaId !== 'string' || typeof correo !== 'string' || typeof nombre !== 'string' || !nombre.trim()) {
      throw new ErrorFuncion(400, 'datos_incompletos', 'Faltan datos: empresa, correo y nombre.');
    }
    if (!ROLES_INVITABLES.includes(rol)) {
      throw new ErrorFuncion(400, 'rol_invalido', 'Rol no válido.');
    }

    const [{ data: esDeveloper }, { data: rolPropio }] = await Promise.all([
      cliente.rpc('soy_developer'),
      cliente.rpc('mi_rol', { p_empresa: empresaId })
    ]);
    if (!esDeveloper && rolPropio !== 'boss') {
      throw new ErrorFuncion(403, 'sin_permiso', 'Solo el jefe de la empresa puede invitar a su equipo.');
    }

    const resultado = await invitar(clienteAdmin(), {
      empresaId, correo, nombre, rol: rol as RolInvitable,
      empleadoId: typeof empleadoId === 'string' ? empleadoId : null,
      urlApp: urlApp(cuerpo.url_app),
      invitadoPor: usuario.id
    });
    return responder(200, resultado);
  } catch (error) {
    return responderError(error);
  }
});
