-- CreateTable
CREATE TABLE "chamado_notas" (
    "id" TEXT NOT NULL,
    "chamadoId" TEXT NOT NULL,
    "conteudo" TEXT NOT NULL,
    "autorId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chamado_notas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "chamado_notas_chamadoId_criadoEm_idx" ON "chamado_notas"("chamadoId", "criadoEm");

-- AddForeignKey
ALTER TABLE "chamado_notas" ADD CONSTRAINT "chamado_notas_chamadoId_fkey" FOREIGN KEY ("chamadoId") REFERENCES "ordens_servico"("id") ON DELETE CASCADE ON UPDATE CASCADE;
