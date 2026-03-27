-- Add conversaIAId to escalacoes (was in schema but missing from DB)
ALTER TABLE "escalacoes" ADD COLUMN IF NOT EXISTS "conversaIAId" TEXT;
