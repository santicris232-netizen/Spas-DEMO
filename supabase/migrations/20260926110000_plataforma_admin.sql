-- =============================================================================
-- CristaSpa v2 · 10 · Administración de empresas por el developer
-- Plan, límites, fin de prueba y datos legales solo se cambian por esta RPC
-- (el jefe no tiene permiso de columna sobre ellos).
-- =============================================================================

/**
 * Actualiza datos de plataforma de una empresa. p_datos admite:
 * { plan, limites, prueba_hasta, razon_social, nit, correo_contacto, telefono_contacto, zona_horaria, moneda }
 * Las claves ausentes no se modifican.
 */
create or replace function public.actualizar_empresa_plataforma(p_empresa uuid, p_datos jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public._exigir_sesion();
  if not public.es_developer() then
    perform public._error('sin_permiso', 'Solo un developer puede cambiar el plan o los límites.');
  end if;

  update public.empresas set
    plan              = coalesce(p_datos ->> 'plan', plan),
    limites           = coalesce(p_datos -> 'limites', limites),
    prueba_hasta      = case when p_datos ? 'prueba_hasta' then (p_datos ->> 'prueba_hasta')::date else prueba_hasta end,
    razon_social      = case when p_datos ? 'razon_social' then nullif(btrim(p_datos ->> 'razon_social'), '') else razon_social end,
    nit               = case when p_datos ? 'nit' then nullif(btrim(p_datos ->> 'nit'), '') else nit end,
    correo_contacto   = case when p_datos ? 'correo_contacto' then nullif(btrim(p_datos ->> 'correo_contacto'), '') else correo_contacto end,
    telefono_contacto = case when p_datos ? 'telefono_contacto' then nullif(btrim(p_datos ->> 'telefono_contacto'), '') else telefono_contacto end,
    zona_horaria      = coalesce(p_datos ->> 'zona_horaria', zona_horaria),
    moneda            = coalesce(p_datos ->> 'moneda', moneda)
  where id = p_empresa;

  if not found then
    perform public._error('empresa_no_encontrada', 'La empresa no existe.');
  end if;
end;
$$;

revoke execute on function public.actualizar_empresa_plataforma(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.actualizar_empresa_plataforma(uuid, jsonb) to authenticated;
