-- CreateEnum
CREATE TYPE "StatusEnvioTransmissao" AS ENUM ('processando', 'concluido', 'falhou');

-- CreateEnum
CREATE TYPE "StatusDestinatario" AS ENUM ('pendente', 'enviado', 'falhou');

-- CreateTable
CREATE TABLE "listas_transmissao" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "criadaPorId" TEXT NOT NULL,
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadaEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "listas_transmissao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membros_lista_transmissao" (
    "id" TEXT NOT NULL,
    "listaId" TEXT NOT NULL,
    "clienteId" TEXT,
    "socioId" TEXT,

    CONSTRAINT "membros_lista_transmissao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "envios_transmissao" (
    "id" TEXT NOT NULL,
    "listaId" TEXT NOT NULL,
    "operadorId" TEXT NOT NULL,
    "conteudo" TEXT NOT NULL,
    "mediaUrl" TEXT,
    "mediaType" TEXT,
    "mediaFileName" TEXT,
    "mediaMimeType" TEXT,
    "status" "StatusEnvioTransmissao" NOT NULL DEFAULT 'processando',
    "totalMembros" INTEGER NOT NULL,
    "totalEnviados" INTEGER NOT NULL DEFAULT 0,
    "totalFalhas" INTEGER NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "envios_transmissao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "destinatarios_envio" (
    "id" TEXT NOT NULL,
    "envioId" TEXT NOT NULL,
    "clienteId" TEXT,
    "socioId" TEXT,
    "remoteJid" TEXT NOT NULL,
    "status" "StatusDestinatario" NOT NULL DEFAULT 'pendente',
    "erroEnvio" TEXT,
    "enviadoEm" TIMESTAMP(3),

    CONSTRAINT "destinatarios_envio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "listas_transmissao_criadaPorId_idx" ON "listas_transmissao"("criadaPorId");

-- CreateIndex
CREATE INDEX "membros_lista_transmissao_listaId_idx" ON "membros_lista_transmissao"("listaId");

-- CreateIndex
CREATE UNIQUE INDEX "membros_lista_transmissao_listaId_clienteId_key" ON "membros_lista_transmissao"("listaId", "clienteId");

-- CreateIndex
CREATE UNIQUE INDEX "membros_lista_transmissao_listaId_socioId_key" ON "membros_lista_transmissao"("listaId", "socioId");

-- CreateIndex
CREATE INDEX "envios_transmissao_listaId_idx" ON "envios_transmissao"("listaId");

-- CreateIndex
CREATE INDEX "envios_transmissao_status_idx" ON "envios_transmissao"("status");

-- CreateIndex
CREATE INDEX "destinatarios_envio_envioId_status_idx" ON "destinatarios_envio"("envioId", "status");

-- AddForeignKey
ALTER TABLE "listas_transmissao" ADD CONSTRAINT "listas_transmissao_criadaPorId_fkey" FOREIGN KEY ("criadaPorId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membros_lista_transmissao" ADD CONSTRAINT "membros_lista_transmissao_listaId_fkey" FOREIGN KEY ("listaId") REFERENCES "listas_transmissao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membros_lista_transmissao" ADD CONSTRAINT "membros_lista_transmissao_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membros_lista_transmissao" ADD CONSTRAINT "membros_lista_transmissao_socioId_fkey" FOREIGN KEY ("socioId") REFERENCES "socios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "envios_transmissao" ADD CONSTRAINT "envios_transmissao_listaId_fkey" FOREIGN KEY ("listaId") REFERENCES "listas_transmissao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "envios_transmissao" ADD CONSTRAINT "envios_transmissao_operadorId_fkey" FOREIGN KEY ("operadorId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "destinatarios_envio" ADD CONSTRAINT "destinatarios_envio_envioId_fkey" FOREIGN KEY ("envioId") REFERENCES "envios_transmissao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
