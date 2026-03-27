-- Adiciona rastreabilidade de usuário nas ações do agente
-- Permite saber qual operador CRM acionou cada ferramenta do agente operacional

ALTER TABLE "agente_acoes" ADD COLUMN IF NOT EXISTS "usuarioId"   TEXT;
ALTER TABLE "agente_acoes" ADD COLUMN IF NOT EXISTS "usuarioNome" TEXT;
ALTER TABLE "agente_acoes" ADD COLUMN IF NOT EXISTS "usuarioTipo" TEXT;

CREATE INDEX IF NOT EXISTS "agente_acoes_usuarioId_criadoEm_idx"
  ON "agente_acoes" ("usuarioId", "criadoEm");
