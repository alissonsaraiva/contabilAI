import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { testPrisma, cleanDatabase } from '../helpers/prisma'
import { criarUsuario, criarEmpresa, criarCliente, criarLead, criarConversa, criarMensagem, criarEscritorio } from '../helpers/factory'

beforeAll(async () => {
  // Garante conexão com o banco de teste
  await testPrisma.$connect()
})

afterAll(async () => {
  await testPrisma.$disconnect()
})

beforeEach(async () => {
  await cleanDatabase()
})

// ─── Empresa ───────────────────────────────────────────────────────────────────

describe('Empresa CRUD', () => {
  it('cria empresa com campos obrigatórios', async () => {
    const empresa = await criarEmpresa()
    expect(empresa.id).toBeDefined()
    expect(empresa.razaoSocial).toContain('Empresa Teste')
    expect(empresa.regime).toBe('SimplesNacional')
  })

  it('garante unicidade de CNPJ', async () => {
    await criarEmpresa({ cnpj: '12345678000190' })
    await expect(
      criarEmpresa({ cnpj: '12345678000190' }),
    ).rejects.toThrow()
  })

  it('permite empresa sem CNPJ (autônomo/PF)', async () => {
    const empresa = await criarEmpresa({ cnpj: null })
    expect(empresa.cnpj).toBeNull()
  })
})

// ─── Cliente ───────────────────────────────────────────────────────────────────

describe('Cliente CRUD', () => {
  it('cria cliente com empresa vinculada', async () => {
    const empresa = await criarEmpresa()
    const cliente = await criarCliente({ empresaId: empresa.id })
    expect(cliente.empresaId).toBe(empresa.id)
  })

  it('garante unicidade de CPF', async () => {
    await criarCliente({ cpf: '52998224725' })
    await expect(
      criarCliente({ cpf: '52998224725' }),
    ).rejects.toThrow()
  })

  it('garante unicidade de email', async () => {
    await criarCliente({ email: 'unico@test.com' })
    await expect(
      criarCliente({ email: 'unico@test.com' }),
    ).rejects.toThrow()
  })

  it('permite buscar cliente com include de empresa', async () => {
    const empresa = await criarEmpresa()
    const cliente = await criarCliente({ empresaId: empresa.id })

    const found = await testPrisma.cliente.findUnique({
      where: { id: cliente.id },
      include: { empresa: true },
    })
    expect(found?.empresa?.id).toBe(empresa.id)
  })
})

// ─── Lead ──────────────────────────────────────────────────────────────────────

describe('Lead CRUD', () => {
  it('cria lead com status padrão', async () => {
    const lead = await criarLead()
    expect(lead.status).toBe('iniciado')
    expect(lead.stepAtual).toBe(1)
  })

  it('atualiza step do lead', async () => {
    const lead = await criarLead()
    const updated = await testPrisma.lead.update({
      where: { id: lead.id },
      data: { stepAtual: 3, status: 'dados_preenchidos' },
    })
    expect(updated.stepAtual).toBe(3)
    expect(updated.status).toBe('dados_preenchidos')
  })

  it('armazena dadosJson como JSON livre', async () => {
    const lead = await criarLead({
      dadosJson: { 'Nome completo': 'João Silva', 'CPF': '123.456.789-00' },
    })
    const found = await testPrisma.lead.findUnique({ where: { id: lead.id } })
    const dados = found?.dadosJson as Record<string, unknown>
    expect(dados?.['Nome completo']).toBe('João Silva')
  })
})

// ─── Conversa + Mensagens ──────────────────────────────────────────────────────

describe('Conversa + Mensagem', () => {
  it('cria conversa vinculada a cliente', async () => {
    const cliente = await criarCliente()
    const conversa = await criarConversa({ clienteId: cliente.id })
    expect(conversa.clienteId).toBe(cliente.id)
    expect(conversa.canal).toBe('whatsapp')
  })

  it('cria mensagens dentro de uma conversa', async () => {
    const conversa = await criarConversa()
    await criarMensagem(conversa.id, { role: 'user', conteudo: 'Olá' })
    await criarMensagem(conversa.id, { role: 'assistant', conteudo: 'Olá! Como posso ajudar?' })

    const msgs = await testPrisma.mensagemIA.findMany({
      where: { conversaId: conversa.id },
      orderBy: { criadaEm: 'asc' },
    })
    expect(msgs).toHaveLength(2)
    expect(msgs[0]!.role).toBe('user')
    expect(msgs[1]!.role).toBe('assistant')
  })

  it('cascade delete: deletar conversa apaga mensagens', async () => {
    const conversa = await criarConversa()
    await criarMensagem(conversa.id)
    await criarMensagem(conversa.id)

    await testPrisma.conversaIA.delete({ where: { id: conversa.id } })

    const msgs = await testPrisma.mensagemIA.findMany({
      where: { conversaId: conversa.id },
    })
    expect(msgs).toHaveLength(0)
  })

  it('busca conversa mais recente por remoteJid + canal', async () => {
    const jid = '5585981186338@s.whatsapp.net'
    await criarConversa({ remoteJid: jid, canal: 'whatsapp' })
    // Cria segunda conversa mais recente
    const newer = await criarConversa({ remoteJid: jid, canal: 'whatsapp' })

    const found = await testPrisma.conversaIA.findFirst({
      where: { remoteJid: jid, canal: 'whatsapp' },
      orderBy: { atualizadaEm: 'desc' },
    })
    expect(found?.id).toBe(newer.id)
  })
})

// ─── Escritorio (singleton) ────────────────────────────────────────────────────

describe('Escritorio', () => {
  it('cria configuração do escritório', async () => {
    const escritorio = await criarEscritorio({ nomeFantasia: 'AVOS Contabilidade' })
    expect(escritorio.nome).toBe('Escritório Teste')
    expect(escritorio.nomeFantasia).toBe('AVOS Contabilidade')
  })

  it('retorna null para findFirst quando não existe', async () => {
    const found = await testPrisma.escritorio.findFirst()
    expect(found).toBeNull()
  })
})

// ─── Usuario ───────────────────────────────────────────────────────────────────

describe('Usuario', () => {
  it('cria usuário admin', async () => {
    const user = await criarUsuario({ tipo: 'admin' })
    expect(user.tipo).toBe('admin')
    expect(user.ativo).toBe(true)
  })

  it('garante unicidade de email', async () => {
    await criarUsuario({ email: 'admin@test.com' })
    await expect(
      criarUsuario({ email: 'admin@test.com' }),
    ).rejects.toThrow()
  })

  it('vincula responsável ao cliente', async () => {
    const user = await criarUsuario()
    const cliente = await criarCliente({ responsavelId: user.id })

    const found = await testPrisma.cliente.findUnique({
      where: { id: cliente.id },
      include: { responsavel: true },
    })
    expect(found?.responsavel?.id).toBe(user.id)
  })
})
