-- AlterTable
ALTER TABLE "escritorio" ADD COLUMN     "integraContadorAmbiente" TEXT DEFAULT 'homologacao',
ADD COLUMN     "integraContadorCertBase64" TEXT,
ADD COLUMN     "integraContadorCertSenha" TEXT,
ADD COLUMN     "integraContadorClientId" TEXT,
ADD COLUMN     "integraContadorClientSecret" TEXT,
ADD COLUMN     "integraContadorEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "integraContadorModulos" TEXT DEFAULT '[]';
