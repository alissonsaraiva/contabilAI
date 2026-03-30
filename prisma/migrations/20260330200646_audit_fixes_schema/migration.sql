-- DropForeignKey
ALTER TABLE "contratos" DROP CONSTRAINT "contratos_leadId_fkey";

-- DropForeignKey
ALTER TABLE "interacoes" DROP CONSTRAINT "interacoes_clienteId_fkey";

-- DropForeignKey
ALTER TABLE "interacoes" DROP CONSTRAINT "interacoes_leadId_fkey";

-- DropForeignKey
ALTER TABLE "notificacoes" DROP CONSTRAINT "notificacoes_usuarioId_fkey";

-- DropForeignKey
ALTER TABLE "tarefas" DROP CONSTRAINT "tarefas_clienteId_fkey";

-- AlterTable
ALTER TABLE "contratos" ADD COLUMN     "deletadoEm" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "documentos" ADD COLUMN     "deletadoEm" TIMESTAMP(3),
ALTER COLUMN "tamanho" SET DATA TYPE BIGINT;

-- AlterTable
ALTER TABLE "interacoes" ADD COLUMN     "deletadoEm" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "portal_tokens" ADD COLUMN     "revokedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "webhook_logs" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "processado" BOOLEAN NOT NULL DEFAULT false,
    "payload" JSONB,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "webhook_logs_criadoEm_idx" ON "webhook_logs"("criadoEm");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_logs_provider_eventId_key" ON "webhook_logs"("provider", "eventId");

-- CreateIndex
CREATE INDEX "cliente_leadId_partial" ON "clientes"("leadId");

-- CreateIndex
CREATE INDEX "cliente_empresaId_partial" ON "clientes"("empresaId");

-- CreateIndex
CREATE INDEX "comunicados_criadoEm_idx" ON "comunicados"("criadoEm");

-- CreateIndex
CREATE INDEX "contratos_clienteId_deletadoEm_idx" ON "contratos"("clienteId", "deletadoEm");

-- CreateIndex
CREATE INDEX "conversas_ia_pausadaEm_idx" ON "conversas_ia"("pausadaEm");

-- CreateIndex
CREATE INDEX "documentos_clienteId_deletadoEm_idx" ON "documentos"("clienteId", "deletadoEm");

-- CreateIndex
CREATE INDEX "empresa_cnpj_partial" ON "empresas"("cnpj");

-- CreateIndex
CREATE INDEX "interacoes_tipo_criadoEm_idx" ON "interacoes"("tipo", "criadoEm");

-- CreateIndex
CREATE INDEX "interacoes_clienteId_deletadoEm_idx" ON "interacoes"("clienteId", "deletadoEm");

-- CreateIndex
CREATE INDEX "portal_tokens_expiresAt_idx" ON "portal_tokens"("expiresAt");

-- CreateIndex
CREATE INDEX "portal_tokens_revokedAt_idx" ON "portal_tokens"("revokedAt");

-- CreateIndex
CREATE INDEX "portal_tokens_clienteId_usedAt_idx" ON "portal_tokens"("clienteId", "usedAt");

-- AddForeignKey
ALTER TABLE "contratos" ADD CONSTRAINT "contratos_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interacoes" ADD CONSTRAINT "interacoes_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interacoes" ADD CONSTRAINT "interacoes_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificacoes" ADD CONSTRAINT "notificacoes_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
