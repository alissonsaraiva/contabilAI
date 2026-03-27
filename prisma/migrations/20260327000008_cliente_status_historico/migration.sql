-- Adicionar campos de inativação/reativação na tabela clientes
ALTER TABLE "clientes" ADD COLUMN IF NOT EXISTS "motivoInativacao" TEXT;
ALTER TABLE "clientes" ADD COLUMN IF NOT EXISTS "inativadoEm" TIMESTAMP(3);
ALTER TABLE "clientes" ADD COLUMN IF NOT EXISTS "inativadoPorId" TEXT;
ALTER TABLE "clientes" ADD COLUMN IF NOT EXISTS "reativadoEm" TIMESTAMP(3);

-- Remover valor 'encerrado' do enum StatusCliente
-- (nenhum cliente deve ter esse status — migração segura)
ALTER TABLE "clientes" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "clientes" ALTER COLUMN "status" TYPE TEXT;
ALTER TYPE "StatusCliente" RENAME TO "StatusCliente_old";
CREATE TYPE "StatusCliente" AS ENUM ('ativo', 'inadimplente', 'suspenso', 'cancelado');
ALTER TABLE "clientes" ALTER COLUMN "status" TYPE "StatusCliente" USING "status"::"StatusCliente";
ALTER TABLE "clientes" ALTER COLUMN "status" SET DEFAULT 'ativo'::"StatusCliente";
DROP TYPE "StatusCliente_old";

-- Criar tabela de histórico de status
CREATE TABLE "cliente_status_historico" (
    "id"           TEXT         NOT NULL DEFAULT gen_random_uuid()::text,
    "clienteId"    TEXT         NOT NULL,
    "statusAntes"  "StatusCliente" NOT NULL,
    "statusDepois" "StatusCliente" NOT NULL,
    "motivo"       TEXT,
    "operadorId"   TEXT,
    "operadorNome" TEXT,
    "criadoEm"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cliente_status_historico_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "cliente_status_historico"
    ADD CONSTRAINT "cliente_status_historico_clienteId_fkey"
    FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "cliente_status_historico_clienteId_criadoEm_idx"
    ON "cliente_status_historico"("clienteId", "criadoEm");
