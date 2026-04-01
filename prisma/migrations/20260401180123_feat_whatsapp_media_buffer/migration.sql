-- AlterTable
ALTER TABLE "mensagens_ia" ADD COLUMN     "mediaBuffer" BYTEA;

-- RenameIndex
ALTER INDEX "notas_fiscais_clienteId_criadoEm" RENAME TO "notas_fiscais_clienteId_criadoEm_idx";

-- RenameIndex
ALTER INDEX "notas_fiscais_clienteId_status" RENAME TO "notas_fiscais_clienteId_status_idx";

-- RenameIndex
ALTER INDEX "notas_fiscais_empresaId_criadoEm" RENAME TO "notas_fiscais_empresaId_criadoEm_idx";

-- RenameIndex
ALTER INDEX "notas_fiscais_ordemServicoId" RENAME TO "notas_fiscais_ordemServicoId_idx";

-- RenameIndex
ALTER INDEX "notas_fiscais_spedyId" RENAME TO "notas_fiscais_spedyId_idx";

-- RenameIndex
ALTER INDEX "notas_fiscais_status_criadoEm" RENAME TO "notas_fiscais_status_criadoEm_idx";
