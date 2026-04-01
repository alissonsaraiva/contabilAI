-- AlterTable
ALTER TABLE "documentos" ADD COLUMN     "resumoErro" TEXT,
ADD COLUMN     "resumoStatus" TEXT NOT NULL DEFAULT 'pendente',
ADD COLUMN     "resumoTentativas" INTEGER NOT NULL DEFAULT 0;
