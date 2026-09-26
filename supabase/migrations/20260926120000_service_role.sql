-- =============================================================================
-- CristaSpa v2 · 11 · Permisos de la service_role
-- El proyecto no expone tablas automáticamente, así que la service_role (usada solo
-- dentro de las Edge Functions) necesita permisos explícitos. Omite RLS por diseño.
-- =============================================================================

grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
