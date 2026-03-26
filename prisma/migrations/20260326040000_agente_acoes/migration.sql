-- CreateTable
CREATE TABLE "agente_acoes" (
    "id"            TEXT        NOT NULL,
    "clienteId"     TEXT,
    "leadId"        TEXT,
    "solicitanteAI" TEXT        NOT NULL,
    "tool"          TEXT        NOT NULL,
    "input"         JSONB       NOT NULL,
    "resultado"     JSONB       NOT NULL,
    "sucesso"       BOOLEAN     NOT NULL,
    "duracaoMs"     INTEGER     NOT NULL,
    "criadoEm"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agente_acoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agente_acoes_clienteId_criadoEm_idx" ON "agente_acoes"("clienteId", "criadoEm");

-- CreateIndex
CREATE INDEX "agente_acoes_leadId_criadoEm_idx" ON "agente_acoes"("leadId", "criadoEm");

-- CreateIndex
CREATE INDEX "agente_acoes_tool_criadoEm_idx" ON "agente_acoes"("tool", "criadoEm");
