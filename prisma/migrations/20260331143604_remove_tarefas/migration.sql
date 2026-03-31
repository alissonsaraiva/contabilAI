/*
  Warnings:

  - You are about to drop the `tarefas` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "tarefas" DROP CONSTRAINT "tarefas_clienteId_fkey";

-- DropForeignKey
ALTER TABLE "tarefas" DROP CONSTRAINT "tarefas_responsavelId_fkey";

-- DropTable
DROP TABLE "tarefas";

-- DropEnum
DROP TYPE "StatusTarefa";
