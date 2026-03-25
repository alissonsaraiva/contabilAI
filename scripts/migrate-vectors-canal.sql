-- Migração: adiciona coluna canal em vectors.embeddings
-- Idempotente — pode ser executado múltiplas vezes
-- Executar na VPS:
--   docker exec -i contabai_vectors psql -U postgres contabai_vectors < scripts/migrate-vectors-canal.sql

-- Adiciona coluna se não existir
ALTER TABLE vectors.embeddings
  ADD COLUMN IF NOT EXISTS canal TEXT NOT NULL DEFAULT 'geral';

-- Adiciona constraint de check se não existir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'embeddings_canal_check'
  ) THEN
    ALTER TABLE vectors.embeddings
      ADD CONSTRAINT embeddings_canal_check
      CHECK (canal IN ('onboarding', 'crm', 'portal', 'whatsapp', 'geral'));
  END IF;
END $$;

-- Cria índice se não existir
CREATE INDEX IF NOT EXISTS embeddings_canal_idx ON vectors.embeddings (canal);

-- Registros existentes ficam como 'geral' (já é o default)
-- Se quiser reclassificar manualmente:
-- UPDATE vectors.embeddings SET canal = 'onboarding' WHERE escopo = 'lead';
-- UPDATE vectors.embeddings SET canal = 'crm' WHERE tipo IN ('fiscal_normativo', 'template', 'historico_crm');
