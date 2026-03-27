-- DocuSeal integration fields on contratos
ALTER TABLE "contratos" ADD COLUMN IF NOT EXISTS "docusealTemplateId"   INTEGER;
ALTER TABLE "contratos" ADD COLUMN IF NOT EXISTS "docusealSubmissionId" INTEGER;
ALTER TABLE "contratos" ADD COLUMN IF NOT EXISTS "docusealSignUrl"      TEXT;
