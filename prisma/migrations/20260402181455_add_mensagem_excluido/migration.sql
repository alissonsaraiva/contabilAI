-- AlterTable
ALTER TABLE "mensagens_ia" ADD COLUMN     "excluido" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "excluidoEm" TIMESTAMP(3);
