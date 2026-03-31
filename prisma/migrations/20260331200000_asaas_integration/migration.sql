-- CreateEnum
CREATE TYPE "AsaasStatusCobranca" AS ENUM ('PENDING', 'RECEIVED', 'OVERDUE', 'REFUNDED', 'CANCELLED');

-- AlterTable: Cliente — campos Asaas
ALTER TABLE "clientes"
  ADD COLUMN "asaasCustomerId"     TEXT,
  ADD COLUMN "asaasSubscriptionId" TEXT,
  ADD COLUMN "asaasStatus"         TEXT,
  ADD COLUMN "asaasUltimoSync"     TIMESTAMP(3);

-- UniqueConstraint: asaasCustomerId
CREATE UNIQUE INDEX "clientes_asaasCustomerId_key" ON "clientes"("asaasCustomerId");

-- UniqueConstraint: asaasSubscriptionId
CREATE UNIQUE INDEX "clientes_asaasSubscriptionId_key" ON "clientes"("asaasSubscriptionId");

-- AlterTable: Escritorio — campos Asaas
ALTER TABLE "escritorio"
  ADD COLUMN "asaasApiKey"       TEXT,
  ADD COLUMN "asaasAmbiente"     TEXT DEFAULT 'sandbox',
  ADD COLUMN "asaasWebhookToken" TEXT;

-- CreateTable: CobrancaAsaas
CREATE TABLE "cobrancas_asaas" (
    "id"              TEXT NOT NULL,
    "asaasId"         TEXT NOT NULL,
    "clienteId"       TEXT NOT NULL,
    "valor"           DECIMAL(10,2) NOT NULL,
    "vencimento"      TIMESTAMP(3) NOT NULL,
    "status"          "AsaasStatusCobranca" NOT NULL DEFAULT 'PENDING',
    "formaPagamento"  "FormaPagamento" NOT NULL,
    "linkBoleto"      TEXT,
    "codigoBarras"    TEXT,
    "pixQrCode"       TEXT,
    "pixCopiaECola"   TEXT,
    "pagoEm"          TIMESTAMP(3),
    "valorPago"       DECIMAL(10,2),
    "lembreteEnviado" BOOLEAN NOT NULL DEFAULT false,
    "criadoEm"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cobrancas_asaas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: asaasId unique
CREATE UNIQUE INDEX "cobrancas_asaas_asaasId_key" ON "cobrancas_asaas"("asaasId");

-- CreateIndex
CREATE INDEX "cobrancas_asaas_clienteId_idx" ON "cobrancas_asaas"("clienteId");
CREATE INDEX "cobrancas_asaas_vencimento_idx" ON "cobrancas_asaas"("vencimento");
CREATE INDEX "cobrancas_asaas_status_idx" ON "cobrancas_asaas"("status");
CREATE INDEX "cobrancas_asaas_clienteId_status_idx" ON "cobrancas_asaas"("clienteId", "status");
CREATE INDEX "cobrancas_asaas_status_vencimento_lembreteEnviado_idx" ON "cobrancas_asaas"("status", "vencimento", "lembreteEnviado");

-- AddForeignKey
ALTER TABLE "cobrancas_asaas"
  ADD CONSTRAINT "cobrancas_asaas_clienteId_fkey"
  FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
