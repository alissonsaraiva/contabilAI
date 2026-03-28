-- CreateEnum
CREATE TYPE "TipoOS" AS ENUM ('duvida', 'solicitacao', 'reclamacao', 'documento', 'outros');

-- CreateEnum
CREATE TYPE "StatusOS" AS ENUM ('aberta', 'em_andamento', 'aguardando_cliente', 'resolvida', 'cancelada');

-- CreateEnum
CREATE TYPE "TipoComunicado" AS ENUM ('informativo', 'alerta', 'obrigacao', 'promocional');

-- AlterTable
ALTER TABLE "documentos" ADD COLUMN     "origemPortal" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "xmlMetadata" JSONB;

-- CreateTable
CREATE TABLE "ordens_servico" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "empresaId" TEXT,
    "tipo" "TipoOS" NOT NULL DEFAULT 'duvida',
    "titulo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "status" "StatusOS" NOT NULL DEFAULT 'aberta',
    "prioridade" "Prioridade" NOT NULL DEFAULT 'media',
    "resposta" TEXT,
    "respondidoEm" TIMESTAMP(3),
    "respondidoPorId" TEXT,
    "avaliacaoNota" INTEGER,
    "avaliacaoComent" TEXT,
    "fechadoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ordens_servico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comunicados" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "conteudo" TEXT NOT NULL,
    "tipo" "TipoComunicado" NOT NULL DEFAULT 'informativo',
    "publicado" BOOLEAN NOT NULL DEFAULT false,
    "publicadoEm" TIMESTAMP(3),
    "expiradoEm" TIMESTAMP(3),
    "criadoPorId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "comunicados_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ordens_servico_clienteId_criadoEm_idx" ON "ordens_servico"("clienteId", "criadoEm");

-- CreateIndex
CREATE INDEX "ordens_servico_status_criadoEm_idx" ON "ordens_servico"("status", "criadoEm");

-- CreateIndex
CREATE INDEX "comunicados_publicado_publicadoEm_idx" ON "comunicados"("publicado", "publicadoEm");

-- AddForeignKey
ALTER TABLE "ordens_servico" ADD CONSTRAINT "ordens_servico_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordens_servico" ADD CONSTRAINT "ordens_servico_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
