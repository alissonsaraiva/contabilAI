-- AlterTable
ALTER TABLE "documentos" ADD COLUMN     "resumo" TEXT,
ADD COLUMN     "resumoEm" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "escritorio" ADD COLUMN     "aiModelDocumentoResumo" TEXT DEFAULT 'claude-haiku-4-5-20251001',
ADD COLUMN     "aiProviderDocumentoResumo" TEXT DEFAULT 'claude';
