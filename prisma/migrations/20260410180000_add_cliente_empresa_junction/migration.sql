-- CreateTable: junção Cliente ↔ Empresa (1:N)
CREATE TABLE "cliente_empresas" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "principal" BOOLEAN NOT NULL DEFAULT false,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cliente_empresas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cliente_empresas_clienteId_idx" ON "cliente_empresas"("clienteId");

-- CreateIndex
CREATE INDEX "cliente_empresas_empresaId_idx" ON "cliente_empresas"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "cliente_empresas_clienteId_empresaId_key" ON "cliente_empresas"("clienteId", "empresaId");

-- AddForeignKey
ALTER TABLE "cliente_empresas" ADD CONSTRAINT "cliente_empresas_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cliente_empresas" ADD CONSTRAINT "cliente_empresas_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- PopulateData: migrar vínculos existentes como principal=true
INSERT INTO "cliente_empresas" ("id", "clienteId", "empresaId", "principal", "criadoEm")
SELECT gen_random_uuid(), "id", "empresaId", true, NOW()
FROM "clientes"
WHERE "empresaId" IS NOT NULL;
