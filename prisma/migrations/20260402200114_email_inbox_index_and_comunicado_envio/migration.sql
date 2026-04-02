-- CreateTable
CREATE TABLE "comunicado_envios" (
    "id" TEXT NOT NULL,
    "comunicadoId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "erro" TEXT,
    "enviadoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comunicado_envios_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "comunicado_envios_comunicadoId_idx" ON "comunicado_envios"("comunicadoId");

-- CreateIndex
CREATE UNIQUE INDEX "comunicado_envios_comunicadoId_clienteId_key" ON "comunicado_envios"("comunicadoId", "clienteId");

-- CreateIndex
CREATE INDEX "interacoes_tipo_respondidoEm_idx" ON "interacoes"("tipo", "respondidoEm");

-- AddForeignKey
ALTER TABLE "comunicado_envios" ADD CONSTRAINT "comunicado_envios_comunicadoId_fkey" FOREIGN KEY ("comunicadoId") REFERENCES "comunicados"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comunicado_envios" ADD CONSTRAINT "comunicado_envios_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
