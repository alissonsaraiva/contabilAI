-- Migração DocuSeal → ZapSign nos contratos
ALTER TABLE "contratos" ADD COLUMN IF NOT EXISTS "zapsignDocToken" TEXT UNIQUE;
ALTER TABLE "contratos" ADD COLUMN IF NOT EXISTS "zapsignSignUrl"  TEXT;

-- Remove colunas DocuSeal (não usadas mais)
ALTER TABLE "contratos" DROP COLUMN IF EXISTS "docusealTemplateId";
ALTER TABLE "contratos" DROP COLUMN IF EXISTS "docusealSubmissionId";
ALTER TABLE "contratos" DROP COLUMN IF EXISTS "docusealSignUrl";
