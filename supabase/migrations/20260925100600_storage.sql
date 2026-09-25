-- =============================================================================
-- CristaSpa v2 · 07 · Storage de imágenes por empresa
-- Ruta: empresas/<empresa_id>/{marca|servicios|productos|empleados}/<archivo>.webp
-- Lectura pública (logos y catálogo se ven antes del login); escritura solo del
-- jefe de esa empresa o de un developer. Referencia: docs/flujos/04-modelo-de-datos.md#almacenamiento
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('empresas', 'empresas', true, 2097152, array['image/webp', 'image/png', 'image/jpeg'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

/** empresa_id de la primera carpeta de la ruta, o null si no es un uuid válido. */
create or replace function public._empresa_de_ruta(p_nombre text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return (storage.foldername(p_nombre))[1]::uuid;
exception
  when invalid_text_representation then
    return null;
end;
$$;

grant execute on function public._empresa_de_ruta(text) to authenticated;

create policy empresas_imagenes_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'empresas'
    and (public.es_developer() or public.tiene_rol(public._empresa_de_ruta(name), array['boss']))
  );

create policy empresas_imagenes_update on storage.objects for update to authenticated
  using (
    bucket_id = 'empresas'
    and (public.es_developer() or public.tiene_rol(public._empresa_de_ruta(name), array['boss']))
  )
  with check (
    bucket_id = 'empresas'
    and (public.es_developer() or public.tiene_rol(public._empresa_de_ruta(name), array['boss']))
  );

create policy empresas_imagenes_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'empresas'
    and (public.es_developer() or public.tiene_rol(public._empresa_de_ruta(name), array['boss']))
  );
