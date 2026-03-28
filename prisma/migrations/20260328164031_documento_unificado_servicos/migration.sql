/*
  Warnings:

  - You are about to drop the column `origemPortal` on the `documentos` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "documentos" DROP COLUMN "origemPortal",
ADD COLUMN     "empresaId" TEXT,
ADD COLUMN     "integracaoId" TEXT,
ADD COLUMN     "ordemServicoId" TEXT,
ADD COLUMN     "origem" TEXT NOT NULL DEFAULT 'crm';

-- AlterTable
ALTER TABLE "escritorio" ADD COLUMN     "whatsappDocumentoEntrega" TEXT NOT NULL DEFAULT 'direto';

-- CreateIndex
CREATE INDEX "documentos_clienteId_criadoEm_idx" ON "documentos"("clienteId", "criadoEm");

-- CreateIndex
CREATE INDEX "documentos_empresaId_criadoEm_idx" ON "documentos"("empresaId", "criadoEm");

-- AddForeignKey
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_ordemServicoId_fkey" FOREIGN KEY ("ordemServicoId") REFERENCES "ordens_servico"("id") ON DELETE SET NULL ON UPDATE CASCADE;
