// CristaSpa - Edge Function crear-empresa (docs/flujos/13-onboarding-empresas.md).
// 1) Crea la empresa con la RPC crear_empresa usando la sesión del developer (queda auditado).
// 2) Invita al jefe con la service_role. Si la invitación falla, la empresa queda creada y se informa.
import { clienteAdmin, clienteDeUsuario, cors, ErrorFuncion, responder, responderError, urlApp } from '../_shared/http.ts';
import { invitar } from '../_shared/invitar.ts';

const CAMPOS_EMPRESA = [
  'slug', 'nombre', 'plantilla', 'zona_horaria', 'moneda', 'plan', 'dias_prueba', 'color_primario', 'color_secundario',
  'color_acento', 'correo_contacto', 'telefono_contacto', 'razon_social', 'nit', 'limites'
];

Deno.serve(async peticion => {
  if (peticion.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }
  try {
    if (peticion.method !== 'POST') {
      throw new ErrorFuncion(405, 'metodo_no_permitido', 'Método no permitido.');
    }
    const { cliente, usuario } = await clienteDeUsuario(peticion);
    const { data: esDeveloper } = await cliente.rpc('soy_developer');
    if (!esDeveloper) {
      throw new ErrorFuncion(403, 'sin_permiso', 'Solo un developer puede crear empresas.');
    }

    const cuerpo = await peticion.json().catch(() => ({}));
    const empresa = Object.fromEntries(Object.entries(cuerpo?.empresa ?? {}).filter(([clave]) => CAMPOS_EMPRESA.includes(clave)));
    const jefe = cuerpo?.jefe ?? {};
    if (typeof empresa.slug !== 'string' || typeof empresa.nombre !== 'string') {
      throw new ErrorFuncion(400, 'datos_incompletos', 'Faltan el identificador y el nombre de la empresa.');
    }

    const { data: empresaId, error } = await cliente.rpc('crear_empresa', { p_datos: empresa });
    if (error) {
      const esNegocio = error.hint && /^[a-z_]+$/.test(error.hint);
      throw new ErrorFuncion(400, esNegocio ? error.hint : 'datos_invalidos',
        esNegocio ? error.message : 'Algún dato de la empresa no es válido (identificador, colores o zona horaria).');
    }

    let invitacion: Record<string, unknown> = { estado: 'omitida' };
    if (typeof jefe.correo === 'string' && jefe.correo.trim()) {
      try {
        invitacion = await invitar(clienteAdmin(), {
          empresaId: empresaId as string,
          correo: jefe.correo,
          nombre: typeof jefe.nombre === 'string' && jefe.nombre.trim() ? jefe.nombre : 'Jefe',
          rol: 'boss',
          urlApp: urlApp(cuerpo.url_app),
          invitadoPor: usuario.id
        });
      } catch (errorInvitacion) {
        invitacion = {
          estado: 'fallida',
          mensaje: errorInvitacion instanceof ErrorFuncion ? errorInvitacion.message : 'No se pudo invitar al jefe.'
        };
      }
    }

    return responder(200, { empresa_id: empresaId, slug: empresa.slug, invitacion });
  } catch (error) {
    return responderError(error);
  }
});
