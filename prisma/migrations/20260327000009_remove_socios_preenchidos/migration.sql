-- Remove 'socios_preenchidos' from StatusLead enum
-- PostgreSQL does not support DROP VALUE on enums directly.
-- Strategy: create new enum, migrate column, drop old enum.

-- 1. Create new enum without 'socios_preenchidos'
CREATE TYPE "StatusLead_new" AS ENUM (
  'iniciado',
  'simulador',
  'plano_escolhido',
  'dados_preenchidos',
  'revisao',
  'contrato_gerado',
  'aguardando_assinatura',
  'assinado',
  'expirado',
  'cancelado'
);

-- 2. Migrate column (no rows should have 'socios_preenchidos')
ALTER TABLE "Lead"
  ALTER COLUMN "status" TYPE "StatusLead_new"
  USING ("status"::text::"StatusLead_new");

-- 3. Drop old enum and rename new one
DROP TYPE "StatusLead";
ALTER TYPE "StatusLead_new" RENAME TO "StatusLead";
