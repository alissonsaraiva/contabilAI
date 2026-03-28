-- CreateEnum
CREATE TYPE "OrigemOS" AS ENUM ('cliente', 'ia', 'operador');

-- CreateEnum
CREATE TYPE "CategoriaDocumento" AS ENUM ('geral', 'nota_fiscal', 'imposto_renda', 'guias_tributos', 'relatorios', 'outros');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TipoOS" ADD VALUE 'emissao_documento';
ALTER TYPE "TipoOS" ADD VALUE 'correcao_documento';
ALTER TYPE "TipoOS" ADD VALUE 'solicitacao_documento';
ALTER TYPE "TipoOS" ADD VALUE 'tarefa_interna';

-- AlterTable
ALTER TABLE "conversas_ia" ADD COLUMN     "ultimaMensagemEm" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "documentos" ADD COLUMN     "categoria" "CategoriaDocumento" NOT NULL DEFAULT 'geral';

-- AlterTable
ALTER TABLE "mensagens_ia" ADD COLUMN     "aiProcessado" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "ordens_servico" ADD COLUMN     "origem" "OrigemOS" NOT NULL DEFAULT 'cliente',
ADD COLUMN     "visivelPortal" BOOLEAN NOT NULL DEFAULT true;
