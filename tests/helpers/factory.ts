/**
 * Factories para criar dados de teste no banco.
 * Cada factory cria o mínimo necessário para a entidade ser válida.
 * Usa nanoid para gerar IDs únicos e evitar colisões entre testes.
 */
import { testPrisma } from './prisma'

let counter = 0
function seq() { return ++counter }

// ─── Usuario ───────────────────────────────────────────────────────────────────

export async function criarUsuario(overrides: Record<string, unknown> = {}) {
  const n = seq()
  return testPrisma.usuario.create({
    data: {
      nome: `Usuário Teste ${n}`,
      email: `user-${n}-${Date.now()}@test.com`,
      senhaHash: '$2a$10$fakehashfortesting',
      tipo: 'admin',
      ...overrides,
    } as Parameters<typeof testPrisma.usuario.create>[0]['data'],
  })
}

// ─── Empresa ───────────────────────────────────────────────────────────────────

export async function criarEmpresa(overrides: Record<string, unknown> = {}) {
  const n = seq()
  return testPrisma.empresa.create({
    data: {
      cnpj: String(10000000000000 + n),
      razaoSocial: `Empresa Teste ${n} LTDA`,
      regime: 'SimplesNacional',
      ...overrides,
    } as Parameters<typeof testPrisma.empresa.create>[0]['data'],
  })
}

// ─── Lead ──────────────────────────────────────────────────────────────────────

export async function criarLead(overrides: Record<string, unknown> = {}) {
  const n = seq()
  return testPrisma.lead.create({
    data: {
      contatoEntrada: `lead-${n}-${Date.now()}@test.com`,
      canal: 'site',
      status: 'iniciado',
      ...overrides,
    } as Parameters<typeof testPrisma.lead.create>[0]['data'],
  })
}

// ─── Cliente ───────────────────────────────────────────────────────────────────

export async function criarCliente(overrides: Record<string, unknown> = {}) {
  const n = seq()
  const ts = Date.now()
  return testPrisma.cliente.create({
    data: {
      nome: `Cliente Teste ${n}`,
      cpf: String(10000000000 + n + ts % 100000),
      email: `cliente-${n}-${ts}@test.com`,
      telefone: `8598${String(1000000 + n).slice(0, 7)}`,
      planoTipo: 'essencial',
      valorMensal: 199.90,
      vencimentoDia: 10,
      formaPagamento: 'pix',
      tipoContribuinte: 'pj',
      ...overrides,
    } as Parameters<typeof testPrisma.cliente.create>[0]['data'],
  })
}

// ─── Conversa ──────────────────────────────────────────────────────────────────

export async function criarConversa(overrides: Record<string, unknown> = {}) {
  return testPrisma.conversaIA.create({
    data: {
      canal: 'whatsapp',
      ...overrides,
    } as Parameters<typeof testPrisma.conversaIA.create>[0]['data'],
  })
}

// ─── Mensagem ──────────────────────────────────────────────────────────────────

export async function criarMensagem(conversaId: string, overrides: Record<string, unknown> = {}) {
  return testPrisma.mensagemIA.create({
    data: {
      conversaId,
      role: 'user',
      conteudo: 'Mensagem de teste',
      ...overrides,
    } as Parameters<typeof testPrisma.mensagemIA.create>[0]['data'],
  })
}

// ─── Escritorio (singleton) ────────────────────────────────────────────────────

export async function criarEscritorio(overrides: Record<string, unknown> = {}) {
  return testPrisma.escritorio.create({
    data: {
      nome: 'Escritório Teste',
      ...overrides,
    } as Parameters<typeof testPrisma.escritorio.create>[0]['data'],
  })
}
