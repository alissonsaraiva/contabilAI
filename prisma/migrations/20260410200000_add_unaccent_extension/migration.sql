-- Extensão para busca accent-insensitive (ex: "joao" encontra "João")
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Wrapper immutable necessário para uso em índices funcionais e queries determinísticas
CREATE OR REPLACE FUNCTION f_unaccent(text)
RETURNS text
LANGUAGE sql
IMMUTABLE PARALLEL SAFE STRICT
AS $$ SELECT public.unaccent('public.unaccent', $1) $$;
