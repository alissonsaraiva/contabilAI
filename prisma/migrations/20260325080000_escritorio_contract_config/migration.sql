-- Add configurable contract terms and payment options to escritorio
ALTER TABLE "escritorio"
  ADD COLUMN IF NOT EXISTS "multaPercent"                DOUBLE PRECISION DEFAULT 2.0,
  ADD COLUMN IF NOT EXISTS "jurosMesPercent"             DOUBLE PRECISION DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS "diasAtrasoMulta"             INTEGER DEFAULT 15,
  ADD COLUMN IF NOT EXISTS "diasInadimplenciaRescisao"   INTEGER DEFAULT 60,
  ADD COLUMN IF NOT EXISTS "diasAvisoRescisao"           INTEGER DEFAULT 30,
  ADD COLUMN IF NOT EXISTS "diasDocumentosAntecedencia"  INTEGER DEFAULT 5,
  ADD COLUMN IF NOT EXISTS "vencimentosDias"             JSONB,
  ADD COLUMN IF NOT EXISTS "pixDescontoPercent"          DOUBLE PRECISION DEFAULT 5.0;
