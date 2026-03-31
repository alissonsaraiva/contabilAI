-- AlterTable: add numero sequential field to ordens_servico
ALTER TABLE "ordens_servico" ADD COLUMN "numero" SERIAL;

-- CreateUniqueIndex
CREATE UNIQUE INDEX "ordens_servico_numero_key" ON "ordens_servico"("numero");

-- CreateIndex
CREATE INDEX "ordens_servico_numero_idx" ON "ordens_servico"("numero");
