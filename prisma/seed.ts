import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcryptjs'

const connectionString =
  process.env.DATABASE_URL ?? 'postgresql://psuser:dev123456@localhost:5432/contabil_ia'

const adapter = new PrismaPg({ connectionString })
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('🌱 Iniciando seed...')

  // ── Usuários ──────────────────────────────────────────────
  const admin = await prisma.usuario.upsert({
    where: { email: 'admin@contabai.com.br' },
    update: {},
    create: {
      nome: 'Alisson Saraiva',
      email: 'admin@contabai.com.br',
      senhaHash: await bcrypt.hash('admin123', 12),
      tipo: 'admin',
    },
  })

  const contador = await prisma.usuario.upsert({
    where: { email: 'contador@contabai.com.br' },
    update: {},
    create: {
      nome: 'Fernanda Costa',
      email: 'contador@contabai.com.br',
      senhaHash: await bcrypt.hash('contador123', 12),
      tipo: 'contador',
    },
  })
  console.log('✅ Usuários criados')

  // ── Planos ────────────────────────────────────────────────
  const planosData = [
    { tipo: 'essencial' as const, nome: 'Essencial', descricao: 'Ideal para MEI e microempresas', valorMinimo: 179, valorMaximo: 299, servicos: ['Obrigações fiscais acessórias', 'Geração de DAS automática', 'Portal básico do cliente', 'Chatbot de dúvidas 24h', 'Alertas de prazo por WhatsApp'], destaque: false },
    { tipo: 'profissional' as const, nome: 'Profissional', descricao: 'Para empresas do Simples Nacional', valorMinimo: 449, valorMaximo: 699, servicos: ['Tudo do Essencial', 'Departamento pessoal (até 3 funcionários)', 'DRE simplificado mensal', 'Fluxo de caixa', 'Relatório narrativo com IA'], destaque: true },
    { tipo: 'empresarial' as const, nome: 'Empresarial', descricao: 'Para Lucro Presumido e Real', valorMinimo: 990, valorMaximo: 1800, servicos: ['Tudo do Profissional', 'Departamento pessoal ilimitado', 'KPIs avançados e dashboards', 'Consultoria mensal de 1h', 'Simulação de cenários tributários'], destaque: false },
    { tipo: 'startup' as const, nome: 'Startup', descricao: 'Para empresas digitais em crescimento', valorMinimo: 1200, valorMaximo: 2500, servicos: ['Tudo do Empresarial', 'Relatórios para investidores', 'Benchmark setorial com IA', 'Suporte prioritário', 'Planejamento tributário estratégico'], destaque: false },
  ]
  for (const plano of planosData) {
    await prisma.plano.upsert({ where: { tipo: plano.tipo }, update: {}, create: plano })
  }
  console.log('✅ Planos criados')

  // ── Leads ─────────────────────────────────────────────────
  const lead1 = await prisma.lead.upsert({
    where: { id: 'lead-mock-001' },
    update: {},
    create: {
      id: 'lead-mock-001',
      contatoEntrada: 'Roberto Alcantara Silva',
      canal: 'google',
      status: 'dados_preenchidos',
      planoTipo: 'profissional',
      valorNegociado: 550,
      vencimentoDia: 10,
      formaPagamento: 'cartao',
      stepAtual: 4,
      responsavelId: admin.id,
      dadosJson: {
        'Razão Social / Nome': 'Roberto Alcantara Silva ME',
        'CPF': '123.456.789-00',
        'CNPJ': '44.123.456/0001-99',
        'E-mail Principal': 'roberto.silva@outlook.com',
        'Endereço de Faturamento': 'Av. Paulista, 1000, Cj 42 - Bela Vista, São Paulo/SP',
      },
    },
  })

  const lead2 = await prisma.lead.upsert({
    where: { id: 'lead-mock-002' },
    update: {},
    create: {
      id: 'lead-mock-002',
      contatoEntrada: 'maria.silva@gmail.com',
      canal: 'site',
      status: 'aguardando_assinatura',
      planoTipo: 'essencial',
      valorNegociado: 199,
      vencimentoDia: 5,
      formaPagamento: 'pix',
      stepAtual: 7,
      responsavelId: contador.id,
      dadosJson: {
        'Nome': 'Maria da Silva Souza',
        'CPF': '987.654.321-00',
        'E-mail': 'maria.silva@gmail.com',
        'Cidade': 'Eusébio / CE',
      },
    },
  })

  await prisma.lead.createMany({
    skipDuplicates: true,
    data: [
      { id: 'lead-mock-003', contatoEntrada: '(85) 99801-2345', canal: 'whatsapp', status: 'plano_escolhido', planoTipo: 'profissional', stepAtual: 3, responsavelId: admin.id },
      { id: 'lead-mock-004', contatoEntrada: 'ana@clinicaestetica.com.br', canal: 'instagram', status: 'simulador', stepAtual: 2 },
      { id: 'lead-mock-005', contatoEntrada: 'pedro.autonomo@gmail.com', canal: 'google', status: 'iniciado', stepAtual: 1 },
      { id: 'lead-mock-006', contatoEntrada: 'lucas.tech@startup.io', canal: 'indicacao', status: 'revisao', planoTipo: 'startup', valorNegociado: 1500, stepAtual: 6, responsavelId: contador.id },
      { id: 'lead-mock-007', contatoEntrada: 'carla.loja@gmail.com', canal: 'site', status: 'contrato_gerado', planoTipo: 'empresarial', valorNegociado: 1200, stepAtual: 7, responsavelId: admin.id },
    ],
  })

  // Interações para lead1
  await prisma.interacao.createMany({
    skipDuplicates: true,
    data: [
      { id: 'int-001', leadId: lead1.id, tipo: 'whatsapp_enviado', titulo: 'Proposta Comercial Enviada', conteudo: 'A proposta para o Plano Profissional foi gerada e enviada via WhatsApp e E-mail. Aguardando assinatura do contrato.', usuarioId: admin.id },
      { id: 'int-002', leadId: lead1.id, tipo: 'nota_interna', titulo: 'Qualificação por Chatbot', conteudo: 'Lead respondeu às perguntas de triagem. Identificado como ME com faturamento anual acima de R$ 200k.', usuarioId: admin.id },
      { id: 'int-003', leadId: lead1.id, tipo: 'email_enviado', titulo: 'Boas-vindas enviado', conteudo: 'E-mail de boas-vindas e link do portal enviado ao lead após cadastro no site.', usuarioId: admin.id },
      { id: 'int-004', leadId: lead2.id, tipo: 'status_mudou', titulo: 'Aguardando assinatura', conteudo: 'Contrato gerado e enviado por e-mail. Cliente informado por WhatsApp.', usuarioId: contador.id },
    ],
  })
  console.log('✅ Leads e interações criados')

  // ── Empresas ──────────────────────────────────────────────
  const e1 = await prisma.empresa.upsert({
    where: { cnpj: '12.345.678/0001-90' },
    update: {},
    create: {
      cnpj: '12.345.678/0001-90',
      razaoSocial: 'JP Almeida Consultoria LTDA',
      nomeFantasia: 'JPA Consultoria',
      regime: 'SimplesNacional',
    },
  })

  const e2 = await prisma.empresa.upsert({
    where: { cnpj: '98.765.432/0001-10' },
    update: {},
    create: {
      cnpj: '98.765.432/0001-10',
      razaoSocial: 'Belíssima Estética EIRELI',
      nomeFantasia: 'Belíssima Estética',
      regime: 'MEI',
    },
  })

  const e3 = await prisma.empresa.upsert({
    where: { cnpj: '45.678.901/0001-23' },
    update: {},
    create: {
      cnpj: '45.678.901/0001-23',
      razaoSocial: 'Construtora Arco LTDA',
      regime: 'LucroPresumido',
    },
  })

  // ── Clientes ──────────────────────────────────────────────
  const c1 = await prisma.cliente.upsert({
    where: { cpf: '111.222.333-44' },
    update: {},
    create: {
      nome: 'João Pedro Almeida',
      cpf: '111.222.333-44',
      email: 'joao.almeida@empresa.com.br',
      telefone: '(85) 98876-5432',
      whatsapp: '(85) 98876-5432',
      empresaId: e1.id,
      cep: '60822-000',
      logradouro: 'Rua das Flores',
      numero: '245',
      bairro: 'Cambeba',
      cidade: 'Fortaleza',
      uf: 'CE',
      planoTipo: 'profissional',
      valorMensal: 550,
      vencimentoDia: 10,
      formaPagamento: 'pix',
      status: 'ativo',
      dataInicio: new Date('2024-03-01'),
      responsavelId: contador.id,
    },
  })

  const c2 = await prisma.cliente.upsert({
    where: { cpf: '222.333.444-55' },
    update: {},
    create: {
      nome: 'Fernanda Lima',
      cpf: '222.333.444-55',
      email: 'fernanda@belissimaestetica.com.br',
      telefone: '(11) 97765-4321',
      empresaId: e2.id,
      cidade: 'São Paulo',
      uf: 'SP',
      planoTipo: 'essencial',
      valorMensal: 249,
      vencimentoDia: 5,
      formaPagamento: 'cartao',
      status: 'ativo',
      dataInicio: new Date('2024-06-15'),
      responsavelId: admin.id,
    },
  })

  const c3 = await prisma.cliente.upsert({
    where: { cpf: '333.444.555-66' },
    update: {},
    create: {
      nome: 'Carlos Rodrigues',
      cpf: '333.444.555-66',
      email: 'carlos@construtoraarco.com.br',
      telefone: '(62) 98800-1234',
      empresaId: e3.id,
      cidade: 'Goiânia',
      uf: 'GO',
      planoTipo: 'empresarial',
      valorMensal: 1400,
      vencimentoDia: 15,
      formaPagamento: 'boleto',
      status: 'ativo',
      dataInicio: new Date('2023-11-01'),
      responsavelId: admin.id,
    },
  })

  await prisma.cliente.upsert({
    where: { cpf: '444.555.666-77' },
    update: {},
    create: {
      nome: 'Patrícia Mendonça',
      cpf: '444.555.666-77',
      email: 'patricia@menutaste.com.br',
      telefone: '(21) 97654-3210',
      cidade: 'Rio de Janeiro',
      uf: 'RJ',
      planoTipo: 'profissional',
      valorMensal: 680,
      vencimentoDia: 20,
      formaPagamento: 'pix',
      status: 'inadimplente',
      dataInicio: new Date('2024-01-10'),
      responsavelId: contador.id,
    },
  })

  await prisma.cliente.upsert({
    where: { cpf: '555.666.777-88' },
    update: {},
    create: {
      nome: 'Thiago Startup Silva',
      cpf: '555.666.777-88',
      email: 'thiago@nexttechbr.io',
      telefone: '(11) 99900-8877',
      cidade: 'São Paulo',
      uf: 'SP',
      planoTipo: 'startup',
      valorMensal: 2200,
      vencimentoDia: 1,
      formaPagamento: 'cartao',
      status: 'ativo',
      dataInicio: new Date('2024-08-01'),
      responsavelId: admin.id,
    },
  })

  await prisma.cliente.upsert({
    where: { cpf: '666.777.888-99' },
    update: {},
    create: {
      nome: 'Sandra Oliveira',
      cpf: '666.777.888-99',
      email: 'sandra.oliveira@gmail.com',
      telefone: '(85) 98711-2233',
      cidade: 'Caucaia',
      uf: 'CE',
      planoTipo: 'essencial',
      valorMensal: 179,
      vencimentoDia: 10,
      formaPagamento: 'pix',
      status: 'suspenso',
      dataInicio: new Date('2023-07-01'),
      responsavelId: contador.id,
    },
  })
  console.log('✅ Clientes criados')

  // ── Sócios ────────────────────────────────────────────────
  await prisma.socio.createMany({
    skipDuplicates: true,
    data: [
      { id: 'socio-001', empresaId: e1.id, nome: 'João Pedro Almeida', cpf: '111.222.333-44', qualificacao: 'Administrador', participacao: 70, email: 'joao@jpaconsultoria.com.br', telefone: '(85) 98876-5432', principal: true },
      { id: 'socio-002', empresaId: e1.id, nome: 'Ana Luiza Almeida', cpf: '444.555.666-00', qualificacao: 'Sócia Investidora', participacao: 30, email: 'analuiza@jpaconsultoria.com.br', telefone: '(85) 99765-4321', principal: false },
      { id: 'socio-003', empresaId: e3.id, nome: 'Carlos Rodrigues', cpf: '333.444.555-66', qualificacao: 'Sócio Administrador', participacao: 60, email: 'carlos@construtoraarco.com.br', telefone: '(62) 98800-1234', principal: true },
      { id: 'socio-004', empresaId: e3.id, nome: 'Marcelo Arco Junior', cpf: '555.777.888-11', qualificacao: 'Sócio', participacao: 40, email: 'marcelo@construtoraarco.com.br', telefone: '(62) 99700-5678', principal: false },
    ],
  })
  console.log('✅ Sócios criados')

  // ── Documentos ────────────────────────────────────────────
  await prisma.documento.createMany({
    skipDuplicates: true,
    data: [
      { id: 'doc-001', clienteId: c1.id, tipo: 'cnpj', nome: 'Cartão CNPJ — JP Almeida Consultoria', tamanho: 85432, mimeType: 'application/pdf', url: 'https://example.com/doc/cnpj-jp.pdf', status: 'aprovado' },
      { id: 'doc-002', clienteId: c1.id, tipo: 'contrato_social', nome: 'Contrato Social — JP Almeida Consultoria LTDA', tamanho: 214032, mimeType: 'application/pdf', url: 'https://example.com/doc/cs-jp.pdf', status: 'aprovado' },
      { id: 'doc-003', clienteId: c1.id, tipo: 'cpf', nome: 'CPF — João Pedro Almeida', tamanho: 42512, mimeType: 'application/pdf', url: 'https://example.com/doc/cpf-joao.pdf', status: 'aprovado' },
      { id: 'doc-004', clienteId: c3.id, tipo: 'cnpj', nome: 'Cartão CNPJ — Construtora Arco', tamanho: 92041, mimeType: 'application/pdf', url: 'https://example.com/doc/cnpj-arco.pdf', status: 'aprovado' },
      { id: 'doc-005', clienteId: c3.id, tipo: 'contrato_social', nome: 'Contrato Social — Construtora Arco LTDA', tamanho: 345012, mimeType: 'application/pdf', url: 'https://example.com/doc/cs-arco.pdf', status: 'aprovado' },
      { id: 'doc-006', clienteId: c3.id, tipo: 'certidao', nome: 'Certidão Negativa Federal', tamanho: 128043, mimeType: 'application/pdf', url: 'https://example.com/doc/certidao-arco.pdf', status: 'aprovado' },
    ],
  })
  console.log('✅ Documentos criados')

  // ── Contratos (precisam de um lead) ───────────────────────
  const leadConv1 = await prisma.lead.upsert({
    where: { id: 'lead-conv-001' },
    update: {},
    create: { id: 'lead-conv-001', contatoEntrada: 'João Pedro Almeida', canal: 'indicacao', status: 'assinado', planoTipo: 'profissional', valorNegociado: 550, vencimentoDia: 10, formaPagamento: 'pix', stepAtual: 9, responsavelId: contador.id },
  })
  const leadConv3 = await prisma.lead.upsert({
    where: { id: 'lead-conv-003' },
    update: {},
    create: { id: 'lead-conv-003', contatoEntrada: 'Carlos Rodrigues', canal: 'indicacao', status: 'assinado', planoTipo: 'empresarial', valorNegociado: 1400, vencimentoDia: 15, formaPagamento: 'boleto', stepAtual: 9, responsavelId: admin.id },
  })

  await prisma.contrato.createMany({
    skipDuplicates: true,
    data: [
      {
        id: 'contrato-001',
        leadId: leadConv1.id,
        clienteId: c1.id,
        status: 'assinado',
        planoTipo: 'profissional',
        valorMensal: 550,
        vencimentoDia: 10,
        formaPagamento: 'pix',
        geradoEm: new Date('2024-02-20'),
        enviadoEm: new Date('2024-02-21'),
        assinadoEm: new Date('2024-02-28'),
      },
      {
        id: 'contrato-003',
        leadId: leadConv3.id,
        clienteId: c3.id,
        status: 'assinado',
        planoTipo: 'empresarial',
        valorMensal: 1400,
        vencimentoDia: 15,
        formaPagamento: 'boleto',
        geradoEm: new Date('2023-10-20'),
        enviadoEm: new Date('2023-10-21'),
        assinadoEm: new Date('2023-10-30'),
      },
    ],
  })
  console.log('✅ Contratos criados')

  // ── Interações dos clientes ────────────────────────────────
  await prisma.interacao.createMany({
    skipDuplicates: true,
    data: [
      { id: 'cint-001', clienteId: c1.id, tipo: 'cliente_ativado', titulo: 'Cliente ativado', conteudo: 'Contrato assinado. Acesso ao portal criado e credenciais enviadas por e-mail.', usuarioId: contador.id },
      { id: 'cint-002', clienteId: c1.id, tipo: 'whatsapp_enviado', titulo: 'Boas-vindas via WhatsApp', conteudo: 'Mensagem de boas-vindas com link do portal e contato da equipe enviada via WhatsApp.', usuarioId: contador.id },
      { id: 'cint-003', clienteId: c1.id, tipo: 'nota_interna', titulo: 'Reunião de onboarding realizada', conteudo: 'Call de 45 min para apresentar o portal e tirar dúvidas sobre o processo de entrega de documentos. Cliente demonstrou alto engajamento.', usuarioId: admin.id },
      { id: 'cint-004', clienteId: c1.id, tipo: 'email_enviado', titulo: 'DAS de outubro enviado', conteudo: 'Guia de pagamento DAS referente a outubro enviado por e-mail. Vencimento: 20/10.', usuarioId: contador.id },
      { id: 'cint-005', clienteId: c3.id, tipo: 'cliente_ativado', titulo: 'Cliente ativado', conteudo: 'Onboarding concluído. Dados migrados do escritório anterior sem inconsistências.', usuarioId: admin.id },
      { id: 'cint-006', clienteId: c3.id, tipo: 'nota_interna', titulo: 'Reunião de alinhamento operacional', conteudo: 'Reunião para definir processo de envio mensal de notas fiscais e folha de pagamento. Decisão: envio até dia 5 de cada mês.', usuarioId: admin.id },
      { id: 'cint-007', clienteId: c3.id, tipo: 'email_enviado', titulo: 'Relatório DRE Q3 enviado', conteudo: 'DRE do trimestre Q3 2024 enviado para aprovação da diretoria. Margem líquida: 18,4%.', usuarioId: admin.id },
    ],
  })
  console.log('✅ Interações dos clientes criadas')

  // ── Escritório ────────────────────────────────────────────
  await prisma.escritorio.upsert({
    where: { id: 'singleton' },
    update: {},
    create: {
      id: 'singleton',
      nome: 'ContabAI',
      nomeFantasia: 'ContabAI — Contabilidade Digital',
      corPrimaria: '#2563eb',
      corSecundaria: '#0891b2',
      fraseBemVindo: 'Bem-vindo! Vamos cuidar da sua contabilidade.',
      metaDescricao: 'Contabilidade digital com IA para MEI, EPP e autônomos em Fortaleza e região.',
      cidade: 'Eusébio',
      uf: 'CE',
    },
  })
  console.log('✅ Escritório criado')

  console.log('\n🎉 Seed concluído!')
  console.log('   admin@contabai.com.br / admin123')
  console.log('   contador@contabai.com.br / contador123')
}

main().catch(console.error).finally(() => prisma.$disconnect())
