/**
 * Prisma client para testes de integração.
 * Conecta ao banco de teste (localhost:5433) definido no setup.
 */
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const connectionString = process.env.DATABASE_URL ?? 'postgresql://test:test@localhost:5433/contabai_test'

const adapter = new PrismaPg({ connectionString })
export const testPrisma = new PrismaClient({ adapter, log: ['error'] })

/**
 * Limpa todas as tabelas do banco de teste.
 * Ordem respeita foreign keys (deleta dependentes primeiro).
 */
export async function cleanDatabase() {
  // Tabelas sem dependentes → tabelas dependentes (cascata reversa)
  await testPrisma.$executeRawUnsafe(`
    DO $$ BEGIN
      -- Desativa checks de FK temporariamente para limpeza rápida
      SET session_replication_role = 'replica';

      TRUNCATE TABLE destinatarios_envio CASCADE;
      TRUNCATE TABLE envios_transmissao CASCADE;
      TRUNCATE TABLE membros_lista_transmissao CASCADE;
      TRUNCATE TABLE listas_transmissao CASCADE;
      TRUNCATE TABLE mensagens_ia CASCADE;
      TRUNCATE TABLE conversas_ia CASCADE;
      TRUNCATE TABLE interacoes CASCADE;
      TRUNCATE TABLE notificacoes CASCADE;
      TRUNCATE TABLE documentos CASCADE;
      TRUNCATE TABLE notas_fiscais CASCADE;
      TRUNCATE TABLE chamado_notas CASCADE;
      TRUNCATE TABLE ordens_servico CASCADE;
      TRUNCATE TABLE contratos CASCADE;
      TRUNCATE TABLE cobrancas_asaas CASCADE;
      TRUNCATE TABLE das_mei CASCADE;
      TRUNCATE TABLE portal_tokens CASCADE;
      TRUNCATE TABLE push_subscriptions CASCADE;
      TRUNCATE TABLE cliente_status_historico CASCADE;
      TRUNCATE TABLE comunicado_envios CASCADE;
      TRUNCATE TABLE comunicados CASCADE;
      TRUNCATE TABLE webhook_logs CASCADE;
      TRUNCATE TABLE escalacoes CASCADE;
      TRUNCATE TABLE agente_acoes CASCADE;
      TRUNCATE TABLE agendamentos_agente CASCADE;
      TRUNCATE TABLE relatorios_agente CASCADE;
      TRUNCATE TABLE socios CASCADE;
      TRUNCATE TABLE cliente_empresas CASCADE;
      TRUNCATE TABLE clientes CASCADE;
      TRUNCATE TABLE leads CASCADE;
      TRUNCATE TABLE empresas CASCADE;
      TRUNCATE TABLE usuarios CASCADE;
      TRUNCATE TABLE planos CASCADE;
      TRUNCATE TABLE escritorio CASCADE;

      SET session_replication_role = 'origin';
    END $$;
  `)
}

/**
 * Limpa a tabela de vectors (separada do schema Prisma).
 */
export async function cleanVectors() {
  await testPrisma.$executeRawUnsafe(`TRUNCATE TABLE vectors.embeddings`)
}
