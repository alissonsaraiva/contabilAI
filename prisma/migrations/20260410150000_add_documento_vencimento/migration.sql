-- AlterTable
ALTER TABLE "documentos" ADD COLUMN "dataVencimento" TIMESTAMP(3);
ALTER TABLE "documentos" ADD COLUMN "lembrete5dEnviadoEm" TIMESTAMP(3);
ALTER TABLE "documentos" ADD COLUMN "lembreteDiaEnviadoEm" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "documentos_dataVencimento_deletadoEm_idx" ON "documentos"("dataVencimento", "deletadoEm");
