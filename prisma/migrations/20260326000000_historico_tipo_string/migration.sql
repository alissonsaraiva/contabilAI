-- Converte coluna `tipo` de enum TipoInteracao para TEXT
-- PostgreSQL requer USING para converter enum → text quando há dados na tabela
ALTER TABLE "interacoes" ALTER COLUMN "tipo" TYPE TEXT USING "tipo"::TEXT;

-- Remove o enum do banco (já foi removido do schema Prisma)
DROP TYPE IF EXISTS "TipoInteracao";

-- Adiciona campo `origem` para identificar quem gerou o evento
ALTER TABLE "interacoes" ADD COLUMN IF NOT EXISTS "origem" TEXT NOT NULL DEFAULT 'sistema';

-- Adiciona flag para eventos que aparecem no feed global do escritório
ALTER TABLE "interacoes" ADD COLUMN IF NOT EXISTS "escritorioEvento" BOOLEAN NOT NULL DEFAULT false;

-- Novos índices para queries de historico
CREATE INDEX IF NOT EXISTS "interacoes_clienteId_criadoEm_idx" ON "interacoes"("clienteId", "criadoEm");
CREATE INDEX IF NOT EXISTS "interacoes_leadId_criadoEm_idx" ON "interacoes"("leadId", "criadoEm");
CREATE INDEX IF NOT EXISTS "interacoes_origem_criadoEm_idx" ON "interacoes"("origem", "criadoEm");
CREATE INDEX IF NOT EXISTS "interacoes_escritorioEvento_criadoEm_idx" ON "interacoes"("escritorioEvento", "criadoEm");
