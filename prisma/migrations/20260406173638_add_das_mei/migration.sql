-- CreateEnum
CREATE TYPE "StatusDasMEI" AS ENUM ('pendente', 'paga', 'vencida', 'erro');

-- AlterTable
ALTER TABLE "empresas" ADD COLUMN     "procuracaoRFAtiva" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "procuracaoRFVerificadaEm" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "escritorio" ADD COLUMN     "dasMeiCanalEmail" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "dasMeiCanalPwa" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "dasMeiCanalWhatsapp" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "dasMeiDiasAntecedencia" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "dasMeiVencimentoDia" INTEGER NOT NULL DEFAULT 20;

-- CreateTable
CREATE TABLE "das_mei" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "competencia" TEXT NOT NULL,
    "codigoBarras" TEXT,
    "valor" DECIMAL(10,2),
    "dataVencimento" TIMESTAMP(3),
    "urlDas" TEXT,
    "status" "StatusDasMEI" NOT NULL DEFAULT 'pendente',
    "erroMsg" TEXT,
    "notificadoEm" TIMESTAMP(3),
    "lembreteEnviadoEm" TIMESTAMP(3),
    "raw" JSONB,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "das_mei_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "das_mei_competencia_idx" ON "das_mei"("competencia");

-- CreateIndex
CREATE INDEX "das_mei_status_idx" ON "das_mei"("status");

-- CreateIndex
CREATE INDEX "das_mei_clienteId_idx" ON "das_mei"("clienteId");

-- CreateIndex
CREATE INDEX "das_mei_dataVencimento_status_idx" ON "das_mei"("dataVencimento", "status");

-- CreateIndex
CREATE UNIQUE INDEX "das_mei_empresaId_competencia_key" ON "das_mei"("empresaId", "competencia");

-- AddForeignKey
ALTER TABLE "das_mei" ADD CONSTRAINT "das_mei_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "das_mei" ADD CONSTRAINT "das_mei_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
