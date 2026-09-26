-- =============================================================================
-- CristaSpa v2 · 08 · _error como STABLE
-- _error solo lanza una excepción (no lee ni escribe datos). Declararla STABLE
-- permite llamarla desde funciones STABLE (disponibilidad, _resumen_servicios…)
-- sin los avisos "routine is marked as STABLE, but expression is VOLATILE" del lint.
-- =============================================================================

alter function public._error(text, text) stable;
