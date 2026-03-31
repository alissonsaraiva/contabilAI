-- AlterTable
ALTER TABLE "clientes" ADD COLUMN "portalSessionId" TEXT;

-- AlterTable
ALTER TABLE "socios" ADD COLUMN "portalSessionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "clientes_portalSessionId_key" ON "clientes"("portalSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "socios_portalSessionId_key" ON "socios"("portalSessionId");
