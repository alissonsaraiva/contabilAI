-- CreateEnum
CREATE TYPE "TipoContribuinte" AS ENUM ('pj', 'pf');

-- AlterTable
ALTER TABLE "clientes" ADD COLUMN     "tipoContribuinte" "TipoContribuinte" NOT NULL DEFAULT 'pj';
