-- AlterTable: adiciona unique constraint em planos.tipo
-- Necessário para que findUnique({ where: { tipo } }) funcione no Prisma v5+
-- e para que o seed possa usar upsert({ where: { tipo } }) corretamente.
CREATE UNIQUE INDEX "planos_tipo_key" ON "planos"("tipo");
