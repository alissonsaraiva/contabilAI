-- AlterTable
ALTER TABLE "conversas_ia" ADD COLUMN     "socioId" TEXT;

-- AlterTable
ALTER TABLE "socios" ADD COLUMN     "whatsapp" TEXT;

-- CreateIndex
CREATE INDEX "conversas_ia_socioId_canal_idx" ON "conversas_ia"("socioId", "canal");

-- AddForeignKey
ALTER TABLE "conversas_ia" ADD CONSTRAINT "conversas_ia_socioId_fkey" FOREIGN KEY ("socioId") REFERENCES "socios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
