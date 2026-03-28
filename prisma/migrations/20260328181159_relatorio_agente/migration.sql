-- CreateTable
CREATE TABLE "relatorios_agente" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "conteudo" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "sucesso" BOOLEAN NOT NULL DEFAULT true,
    "agendamentoId" TEXT,
    "agendamentoDesc" TEXT,
    "criadoPorId" TEXT,
    "criadoPorNome" TEXT,
    "arquivoUrl" TEXT,
    "arquivoNome" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "relatorios_agente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "relatorios_agente_tipo_criadoEm_idx" ON "relatorios_agente"("tipo", "criadoEm");

-- CreateIndex
CREATE INDEX "relatorios_agente_criadoPorId_criadoEm_idx" ON "relatorios_agente"("criadoPorId", "criadoEm");
