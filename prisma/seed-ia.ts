/**
 * Seed de dados mock para as features de IA:
 *  - Leads funil de Prospecção (WhatsApp)
 *  - ConversaIA + MensagemIA (WhatsApp e Onboarding)
 *  - Escalações (pendente, em_atendimento, resolvida)
 *
 * Pré-requisito: seed.ts já executado (clientes c1/c2/c3 existem)
 */

import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const connectionString =
  process.env.DATABASE_URL ?? 'postgresql://psuser:dev123456@localhost:5432/contabil_ia'

const adapter = new PrismaPg({ connectionString })
const prisma = new PrismaClient({ adapter })

// Helpers de data
function daysAgo(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n); return d
}
function hoursAgo(n: number) {
  return new Date(Date.now() - n * 3600 * 1000)
}
function minsAgo(n: number) {
  return new Date(Date.now() - n * 60 * 1000)
}

async function main() {
  console.log('🌱 Seed IA iniciando...\n')

  // ── Busca usuário admin para referência ───────────────────────────────────
  const admin = await prisma.usuario.findFirst({ where: { tipo: 'admin' } })
  if (!admin) throw new Error('Execute seed.ts antes de seed-ia.ts')

  // ── Clientes existentes ───────────────────────────────────────────────────
  const c1 = await prisma.cliente.findFirst({ where: { cpf: '111.222.333-44' } }) // João Pedro
  const c2 = await prisma.cliente.findFirst({ where: { cpf: '222.333.444-55' } }) // Fernanda Lima
  if (!c1 || !c2) throw new Error('Clientes base não encontrados. Execute seed.ts primeiro.')

  // ════════════════════════════════════════════════════════════════════════════
  // 1. LEADS DE PROSPECÇÃO (funil WhatsApp)
  // ════════════════════════════════════════════════════════════════════════════
  console.log('📋 Criando leads de prospecção...')

  const prospecto1 = await prisma.lead.upsert({
    where: { id: 'prosp-mock-001' },
    update: {},
    create: {
      id: 'prosp-mock-001',
      contatoEntrada: '5585988112233',  // número formatado como chega pelo WhatsApp
      canal: 'whatsapp',
      funil: 'prospeccao',
      status: 'iniciado',
      stepAtual: 2,
    },
  })

  const prospecto2 = await prisma.lead.upsert({
    where: { id: 'prosp-mock-002' },
    update: {},
    create: {
      id: 'prosp-mock-002',
      contatoEntrada: '5511976543210',
      canal: 'whatsapp',
      funil: 'prospeccao',
      status: 'iniciado',
      stepAtual: 3,
      dadosJson: { Nome: 'Renata Barbosa' },
    },
  })

  await prisma.lead.upsert({
    where: { id: 'prosp-mock-003' },
    update: {},
    create: {
      id: 'prosp-mock-003',
      contatoEntrada: '5562998001122',
      canal: 'whatsapp',
      funil: 'prospeccao',
      status: 'iniciado',
      stepAtual: 1,
    },
  })

  await prisma.lead.upsert({
    where: { id: 'prosp-mock-004' },
    update: {},
    create: {
      id: 'prosp-mock-004',
      contatoEntrada: '5521997887766',
      canal: 'whatsapp',
      funil: 'prospeccao',
      status: 'iniciado',
      stepAtual: 4,
      dadosJson: { Nome: 'Diego Martins', Interesse: 'Abertura de empresa' },
    },
  })

  console.log('   ✅ 4 leads de prospecção criados\n')

  // ════════════════════════════════════════════════════════════════════════════
  // 2. CONVERSAS VIA WHATSAPP — cliente ativo (João Pedro)
  // ════════════════════════════════════════════════════════════════════════════
  console.log('💬 Criando conversa WhatsApp — João Pedro (cliente ativo)...')

  const convWppJoao = await prisma.conversaIA.upsert({
    where: { id: 'conv-wpp-joao-001' },
    update: {},
    create: {
      id: 'conv-wpp-joao-001',
      canal: 'whatsapp',
      clienteId: c1.id,
      remoteJid: '5585988765432@s.whatsapp.net',
      criadaEm: daysAgo(3),
      atualizadaEm: daysAgo(3),
    },
  })

  await prisma.mensagemIA.createMany({
    skipDuplicates: true,
    data: [
      {
        id: 'msg-wpp-j-01',
        conversaId: convWppJoao.id,
        role: 'user',
        conteudo: 'Olá, boa tarde! Queria saber sobre o DAS do mês, quando vence?',
        criadaEm: new Date(daysAgo(3).getTime() + 0),
      },
      {
        id: 'msg-wpp-j-02',
        conversaId: convWppJoao.id,
        role: 'assistant',
        conteudo: 'Boa tarde, João! Aqui é a Clara da ContabAI 😊 O DAS do Simples Nacional vence no dia 20 do mês seguinte ao de competência. Como você está no plano Profissional, o DAS de setembro vence em 20/10. Já enviamos o boleto para o seu e-mail. Precisa de mais alguma informação?',
        criadaEm: new Date(daysAgo(3).getTime() + 2 * 60000),
      },
      {
        id: 'msg-wpp-j-03',
        conversaId: convWppJoao.id,
        role: 'user',
        conteudo: 'Perfeito! E a DCTF, também preciso entregar esse mês?',
        criadaEm: new Date(daysAgo(3).getTime() + 4 * 60000),
      },
      {
        id: 'msg-wpp-j-04',
        conversaId: convWppJoao.id,
        role: 'assistant',
        conteudo: 'Sim! A DCTF mensal deve ser entregue até o 15º dia útil do 2º mês seguinte ao de ocorrência dos fatos geradores. Para setembro, o prazo é 20/11. Vou incluir um lembrete automático para você. Pode deixar que nossa equipe cuida de tudo, tudo bem? 👍',
        criadaEm: new Date(daysAgo(3).getTime() + 6 * 60000),
      },
      {
        id: 'msg-wpp-j-05',
        conversaId: convWppJoao.id,
        role: 'user',
        conteudo: 'Ótimo, obrigado Clara!',
        criadaEm: new Date(daysAgo(3).getTime() + 8 * 60000),
      },
      {
        id: 'msg-wpp-j-06',
        conversaId: convWppJoao.id,
        role: 'assistant',
        conteudo: 'Disponha, João! Qualquer dúvida estou aqui. Tenha um ótimo dia! ☀️',
        criadaEm: new Date(daysAgo(3).getTime() + 9 * 60000),
      },
    ],
  })

  // Segunda conversa WhatsApp do João — mais recente, pergunta sobre contrato
  const convWppJoao2 = await prisma.conversaIA.upsert({
    where: { id: 'conv-wpp-joao-002' },
    update: {},
    create: {
      id: 'conv-wpp-joao-002',
      canal: 'whatsapp',
      clienteId: c1.id,
      remoteJid: '5585988765432@s.whatsapp.net',
      criadaEm: hoursAgo(5),
      atualizadaEm: hoursAgo(5),
    },
  })

  await prisma.mensagemIA.createMany({
    skipDuplicates: true,
    data: [
      {
        id: 'msg-wpp-j2-01',
        conversaId: convWppJoao2.id,
        role: 'user',
        conteudo: 'Oi Clara! Quero adicionar mais um funcionário na folha, quais são os documentos?',
        criadaEm: new Date(hoursAgo(5).getTime() + 0),
      },
      {
        id: 'msg-wpp-j2-02',
        conversaId: convWppJoao2.id,
        role: 'assistant',
        conteudo: 'Olá, João! 😊 Para cadastrar um novo funcionário na folha precisamos de: RG e CPF, PIS/PASEP (ou CTPS), comprovante de residência, declaração de dependentes (se houver) e dados bancários para crédito do salário. Você pode enviar os documentos pelo portal ou direto aqui mesmo pelo WhatsApp. Como prefere?',
        criadaEm: new Date(hoursAgo(5).getTime() + 3 * 60000),
      },
      {
        id: 'msg-wpp-j2-03',
        conversaId: convWppJoao2.id,
        role: 'user',
        conteudo: 'Vou mandar pelo portal! Mas o salário desse funcionário é bem alto, mais de 30k. Isso muda alguma coisa nas obrigações fiscais da empresa?',
        criadaEm: new Date(hoursAgo(5).getTime() + 7 * 60000),
      },
      {
        id: 'msg-wpp-j2-04',
        conversaId: convWppJoao2.id,
        role: 'assistant',
        conteudo: 'Ótima pergunta, João. Com remuneração acima de R$ 28.559,70/mês o funcionário entra no teto do INSS (alíquota máxima). Além disso, com esse nível salarial vale avaliar o impacto no IRRF dele e verificar se a estrutura atual do Simples Nacional ainda é a mais eficiente para a empresa. Esse tipo de análise envolve planejamento tributário mais detalhado — vou acionar a Fernanda (sua contadora responsável) para conversar com você sobre isso, tudo bem?',
        criadaEm: new Date(hoursAgo(5).getTime() + 12 * 60000),
      },
      {
        id: 'msg-wpp-j2-05',
        conversaId: convWppJoao2.id,
        role: 'user',
        conteudo: 'Sim por favor! Preciso entender melhor isso antes de contratar',
        criadaEm: new Date(hoursAgo(5).getTime() + 15 * 60000),
      },
      {
        id: 'msg-wpp-j2-06',
        conversaId: convWppJoao2.id,
        role: 'assistant',
        conteudo: 'Perfeito! Já registrei o pedido para a Fernanda. Ela vai entrar em contato em até 1 dia útil para agendar uma conversa. Qualquer outra dúvida estou à disposição! 😊',
        criadaEm: new Date(hoursAgo(5).getTime() + 17 * 60000),
      },
    ],
  })

  console.log('   ✅ 2 conversas WhatsApp de João Pedro criadas\n')

  // ════════════════════════════════════════════════════════════════════════════
  // 3. CONVERSA WHATSAPP — Fernanda Lima (cliente)
  // ════════════════════════════════════════════════════════════════════════════
  console.log('💬 Criando conversa WhatsApp — Fernanda Lima (cliente)...')

  const convWppFernanda = await prisma.conversaIA.upsert({
    where: { id: 'conv-wpp-fernanda-001' },
    update: {},
    create: {
      id: 'conv-wpp-fernanda-001',
      canal: 'whatsapp',
      clienteId: c2.id,
      remoteJid: '5511977654321@s.whatsapp.net',
      criadaEm: daysAgo(1),
      atualizadaEm: daysAgo(1),
    },
  })

  await prisma.mensagemIA.createMany({
    skipDuplicates: true,
    data: [
      {
        id: 'msg-wpp-f-01',
        conversaId: convWppFernanda.id,
        role: 'user',
        conteudo: 'Oi, queria saber se meu MEI tá com tudo em dia',
        criadaEm: new Date(daysAgo(1).getTime() + 0),
      },
      {
        id: 'msg-wpp-f-02',
        conversaId: convWppFernanda.id,
        role: 'assistant',
        conteudo: 'Oi Fernanda! Aqui é a Clara da ContabAI 😊 Deixa eu verificar. Seu MEI Belíssima Estética está no Plano Essencial conosco desde junho de 2024. Suas obrigações principais estão em dia: DAS mensal sendo gerado e DASN-SIMEI (declaração anual) enviada. Você tem alguma preocupação específica ou algum documento que precisou emitir?',
        criadaEm: new Date(daysAgo(1).getTime() + 2 * 60000),
      },
      {
        id: 'msg-wpp-f-03',
        conversaId: convWppFernanda.id,
        role: 'user',
        conteudo: 'É que me falaram que o MEI não pode faturar mais de 81 mil por ano, to preocupada que vou ultrapassar esse limite',
        criadaEm: new Date(daysAgo(1).getTime() + 6 * 60000),
      },
      {
        id: 'msg-wpp-f-04',
        conversaId: convWppFernanda.id,
        role: 'assistant',
        conteudo: 'Fernanda, isso é um ponto super importante! O limite do MEI é R$ 81.000/ano (ou R$ 6.750/mês em média). Se você ultrapassar esse valor, precisará ser desenquadrada do MEI e migrar para o Simples Nacional como ME. A boa notícia: nosso sistema monitora seu faturamento e te avisamos quando estiver se aproximando do limite. Você sabe mais ou menos quanto faturou até agora em 2025?',
        criadaEm: new Date(daysAgo(1).getTime() + 9 * 60000),
      },
      {
        id: 'msg-wpp-f-05',
        conversaId: convWppFernanda.id,
        role: 'user',
        conteudo: 'Acho que uns 60 mil já, e ainda tem 3 meses no ano',
        criadaEm: new Date(daysAgo(1).getTime() + 13 * 60000),
      },
      {
        id: 'msg-wpp-f-06',
        conversaId: convWppFernanda.id,
        role: 'assistant',
        conteudo: 'Fernanda, com 60k em 9 meses você tem risco real de ultrapassar o limite nos próximos meses. Nesse caso, o ideal é já ir se preparando para a migração para ME antes de ultrapassar, para evitar multas retroativas. Isso envolve abrir CNPJ no Simples Nacional e uma análise tributária. Vou marcar isso como prioridade para nossa equipe te ligar e explicar o processo de transição sem dor de cabeça, tudo bem?',
        criadaEm: new Date(daysAgo(1).getTime() + 17 * 60000),
      },
      {
        id: 'msg-wpp-f-07',
        conversaId: convWppFernanda.id,
        role: 'user',
        conteudo: 'Sim! Fico preocupada com isso, não quero ter problema',
        criadaEm: new Date(daysAgo(1).getTime() + 20 * 60000),
      },
      {
        id: 'msg-wpp-f-08',
        conversaId: convWppFernanda.id,
        role: 'assistant',
        conteudo: 'Fique tranquila, Fernanda! É exatamente pra isso que a ContabAI existe 💪 Nossa equipe vai te guiar em cada etapa. Você receberá uma ligação até amanhã durante o dia. Qualquer dúvida até lá, pode perguntar aqui!',
        criadaEm: new Date(daysAgo(1).getTime() + 23 * 60000),
      },
    ],
  })

  console.log('   ✅ Conversa WhatsApp de Fernanda Lima criada\n')

  // ════════════════════════════════════════════════════════════════════════════
  // 4. CONVERSA WHATSAPP — Prospecto (gerou lead automático via ##LEAD##)
  // ════════════════════════════════════════════════════════════════════════════
  console.log('💬 Criando conversa WhatsApp — Prospecto Renata Barbosa...')

  const convWppRenata = await prisma.conversaIA.upsert({
    where: { id: 'conv-wpp-renata-001' },
    update: {},
    create: {
      id: 'conv-wpp-renata-001',
      canal: 'whatsapp',
      leadId: prospecto2.id,
      remoteJid: '5511976543210@s.whatsapp.net',
      criadaEm: hoursAgo(2),
      atualizadaEm: hoursAgo(2),
    },
  })

  await prisma.mensagemIA.createMany({
    skipDuplicates: true,
    data: [
      {
        id: 'msg-wpp-r-01',
        conversaId: convWppRenata.id,
        role: 'user',
        conteudo: 'Oi vim pelo instagram, vcs fazem contabilidade pra salão de beleza?',
        criadaEm: new Date(hoursAgo(2).getTime() + 0),
      },
      {
        id: 'msg-wpp-r-02',
        conversaId: convWppRenata.id,
        role: 'assistant',
        conteudo: 'Olá! Aqui é a Clara da ContabAI, tudo bem? 😊 Sim, atendemos salões de beleza! Trabalhamos com MEI, microempresas e empresas do Simples Nacional. Para salões, o regime mais comum é o MEI (se faturamento até R$81k/ano) ou ME no Simples Nacional. Você já tem CNPJ aberto ou está pensando em abrir?',
        criadaEm: new Date(hoursAgo(2).getTime() + 90000),
      },
      {
        id: 'msg-wpp-r-03',
        conversaId: convWppRenata.id,
        role: 'user',
        conteudo: 'Tenho MEI, sou Renata Barbosa. Quero saber quanto custa o plano de vocês',
        criadaEm: new Date(hoursAgo(2).getTime() + 5 * 60000),
      },
      {
        id: 'msg-wpp-r-04',
        conversaId: convWppRenata.id,
        role: 'assistant',
        conteudo: 'Oi Renata! 😊 Para MEI, nosso Plano Essencial começa em R$179/mês. Ele inclui: geração do DAS todo mês, DASN-SIMEI (declaração anual), alertas de prazo por WhatsApp, portal do cliente para acompanhar tudo e acesso ao chat de dúvidas 24h (estou aqui! 😄). Para MEIs com serviços ou com funcionário, temos recursos adicionais. Quer que eu te envie um link para fazer uma simulação e ver o plano ideal?',
        criadaEm: new Date(hoursAgo(2).getTime() + 8 * 60000),
      },
      {
        id: 'msg-wpp-r-05',
        conversaId: convWppRenata.id,
        role: 'user',
        conteudo: 'Isso, quero sim! Como funciona o processo pra contratar?',
        criadaEm: new Date(hoursAgo(2).getTime() + 12 * 60000),
      },
      {
        id: 'msg-wpp-r-06',
        conversaId: convWppRenata.id,
        role: 'assistant',
        conteudo: 'Ótimo, Renata! O processo é 100% online e rápido: 1️⃣ Você acessa nosso site e escolhe o plano 2️⃣ Preenche seus dados (MEI, CPF, e-mail) 3️⃣ Assina o contrato digitalmente 4️⃣ Pronto — já fica ativa na nossa carteira! Normalmente leva menos de 10 minutos. Aqui está o link: contabai.com.br/onboarding — posso te guiar por aqui se precisar de ajuda em alguma etapa 😊',
        criadaEm: new Date(hoursAgo(2).getTime() + 15 * 60000),
      },
    ],
  })

  console.log('   ✅ Conversa WhatsApp de Renata Barbosa criada\n')

  // ════════════════════════════════════════════════════════════════════════════
  // 5. CONVERSA ONBOARDING — Lead no site
  // ════════════════════════════════════════════════════════════════════════════
  console.log('💬 Criando conversa Onboarding (widget do site)...')

  const convOnboarding = await prisma.conversaIA.upsert({
    where: { id: 'conv-onb-001' },
    update: {},
    create: {
      id: 'conv-onb-001',
      canal: 'onboarding',
      sessionId: 'sess-mock-abc123',
      criadaEm: hoursAgo(1),
      atualizadaEm: minsAgo(30),
    },
  })

  await prisma.mensagemIA.createMany({
    skipDuplicates: true,
    data: [
      {
        id: 'msg-onb-01',
        conversaId: convOnboarding.id,
        role: 'user',
        conteudo: 'qual a diferença entre mei e simples nacional?',
        criadaEm: new Date(hoursAgo(1).getTime() + 0),
      },
      {
        id: 'msg-onb-02',
        conversaId: convOnboarding.id,
        role: 'assistant',
        conteudo: 'Boa pergunta! 🎯 **MEI (Microempreendedor Individual):** faturamento até R$81k/ano, impostos fixos e baixos (DAS mensal em torno de R$70), mas limite de 1 funcionário e não pode ter sócios. Ideal para autônomos e pequenos negócios iniciando.\n\n**Simples Nacional (ME/EPP):** faturamento até R$4,8M/ano, impostos calculados sobre faturamento (variam por setor), pode ter sócios e funcionários. Mais completo, mas com mais obrigações.\n\nVocê está pensando em abrir um negócio ou já tem alguma atividade?',
        criadaEm: new Date(hoursAgo(1).getTime() + 2 * 60000),
      },
      {
        id: 'msg-onb-03',
        conversaId: convOnboarding.id,
        role: 'user',
        conteudo: 'sou designer freelancer, faturando uns 8 mil por mes, qual faz mais sentido?',
        criadaEm: new Date(hoursAgo(1).getTime() + 5 * 60000),
      },
      {
        id: 'msg-onb-04',
        conversaId: convOnboarding.id,
        role: 'assistant',
        conteudo: 'Para o seu caso (R$8k/mês = R$96k/ano), o **MEI não é indicado** porque você já ultrapassa o limite de R$81k. Além disso, designer gráfico pode ter restrições no MEI dependendo do tipo de serviço.\n\nO mais adequado para você seria **ME no Simples Nacional**, com imposto aproximado de 4 a 6% sobre o faturamento (Anexo III ou V dependendo da atividade). Sendo R$8k/mês, o imposto seria algo em torno de R$320-480/mês.\n\nQuer fazer uma simulação mais precisa? Posso te ajudar a calcular 😊',
        criadaEm: new Date(hoursAgo(1).getTime() + 8 * 60000),
      },
      {
        id: 'msg-onb-05',
        conversaId: convOnboarding.id,
        role: 'user',
        conteudo: 'sim, quanto custaria o plano de vocês pra mim?',
        criadaEm: new Date(minsAgo(35).getTime()),
      },
      {
        id: 'msg-onb-06',
        conversaId: convOnboarding.id,
        role: 'assistant',
        conteudo: 'Para freelancer ME no Simples Nacional, o nosso **Plano Essencial (R$179/mês)** já cobre todas as suas necessidades: abertura de empresa, obrigações fiscais mensais, declarações anuais, portal do cliente e chat de dúvidas 24h.\n\nSe quiser ter o DRE simplificado e acompanhamento mais próximo, o **Plano Profissional (a partir de R$449/mês)** seria mais completo. Mas honestamente para sua situação atual o Essencial atende muito bem! 🙂\n\nQuer ver nossos planos completos ou prefere já iniciar o cadastro?',
        criadaEm: new Date(minsAgo(30).getTime()),
      },
    ],
  })

  console.log('   ✅ Conversa Onboarding criada\n')

  // ════════════════════════════════════════════════════════════════════════════
  // 6. ESCALAÇÕES
  // ════════════════════════════════════════════════════════════════════════════
  console.log('🚨 Criando escalações mock...')

  // ── 6a. PENDENTE — WhatsApp, cliente reclamando sobre cobrança ──────────────
  await prisma.escalacao.upsert({
    where: { id: 'esc-mock-001' },
    update: {},
    create: {
      id: 'esc-mock-001',
      canal: 'whatsapp',
      status: 'pendente',
      clienteId: c2.id,
      remoteJid: '5511977654321@s.whatsapp.net',
      historico: [
        { role: 'user',      content: 'Oi, recebi uma cobrança de R$ 498 mas meu plano é R$ 249, por que?' },
        { role: 'assistant', content: 'Oi Fernanda! Aqui é a Clara. Vou verificar isso para você. Pode ser um boleto em atraso acumulado, mas prefiro que nossa equipe financeira confirme o valor exato antes de te passar qualquer informação. Pode aguardar um momento?' },
        { role: 'user',      content: 'Tá, mas to preocupada porque não sei se paguei errado antes' },
        { role: 'assistant', content: 'Fernanda, entendo sua preocupação! Já estou acionando a nossa equipe para verificar o extrato da sua conta. Vou pedir que entrem em contato com você hoje mesmo para esclarecer tudo 🙏' },
      ],
      ultimaMensagem: 'Tá, mas to preocupada porque não sei se paguei errado antes',
      motivoIA: 'Divergência de valor cobrado: cliente questiona cobrança duplicada. Precisa de verificação no financeiro.',
      criadoEm: hoursAgo(2),
      atualizadoEm: hoursAgo(2),
    },
  })

  // ── 6b. PENDENTE — Onboarding, dúvida complexa sobre abertura de empresa ───
  await prisma.escalacao.upsert({
    where: { id: 'esc-mock-002' },
    update: {},
    create: {
      id: 'esc-mock-002',
      canal: 'onboarding',
      status: 'pendente',
      sessionId: 'sess-mock-xyz789',
      historico: [
        { role: 'user',      content: 'Tenho uma empresa no exterior (Portugal) e quero abrir um CNPJ aqui no Brasil também. É possível?' },
        { role: 'assistant', content: 'Sim, é possível! Estrangeiros e empresas estrangeiras podem ter CNPJ no Brasil. O processo envolve alguns passos específicos: registro da empresa estrangeira no Brasil, obtenção de CPF/CRC pelo representante legal, e registro na Junta Comercial. É um processo um pouco mais detalhado que a abertura nacional. Você é o sócio ou representa a empresa portuguesa?' },
        { role: 'user',      content: 'Sou sócio. A empresa é em Portugal mas queremos atender clientes brasileiros. Temos que recolher impostos nos dois países?' },
        { role: 'assistant', content: 'Essa é uma questão importante que envolve o tratado tributário Brasil-Portugal e as regras de estabelecimento permanente. Para te dar uma orientação precisa sobre dupla tributação e estrutura societária ideal para seu caso, prefiro que um dos nossos contadores especialistas converse diretamente com você — isso evita qualquer erro numa decisão tão importante. Posso agendar uma conversa?' },
      ],
      ultimaMensagem: 'Sou sócio. A empresa é em Portugal mas queremos atender clientes brasileiros. Temos que recolher impostos nos dois países?',
      motivoIA: 'Questão tributária internacional complexa (tratado Brasil-Portugal, estabelecimento permanente). Requer contador especialista.',
      criadoEm: minsAgo(45),
      atualizadoEm: minsAgo(45),
    },
  })

  // ── 6c. RESOLVIDA — WhatsApp, João Pedro, dúvida sobre rescisão ─────────────
  await prisma.escalacao.upsert({
    where: { id: 'esc-mock-003' },
    update: {},
    create: {
      id: 'esc-mock-003',
      canal: 'whatsapp',
      status: 'resolvida',
      clienteId: c1.id,
      remoteJid: '5585988765432@s.whatsapp.net',
      historico: [
        { role: 'user',      content: 'Clara, preciso demitir um funcionário por justa causa. Como funciona?' },
        { role: 'assistant', content: 'João, a demissão por justa causa é um processo delicado que exige atenção aos detalhes para evitar processos trabalhistas. Os principais fundamentos estão no Art. 482 da CLT. Mas para garantir que tudo seja feito corretamente no seu caso específico, prefiro que a Fernanda (sua contadora) te oriente pessoalmente. Ela pode verificar o histórico do funcionário e te dar o passo a passo correto. Posso acionar ela agora?' },
        { role: 'user',      content: 'Sim, por favor. Preciso resolver isso essa semana.' },
      ],
      ultimaMensagem: 'Sim, por favor. Preciso resolver isso essa semana.',
      motivoIA: 'Demissão por justa causa — risco trabalhista. Requer análise do caso específico pelo contador.',
      operadorId: admin.id,
      orientacaoHumana: 'Orientar o João sobre a necessidade de ter documentação do ato faltoso por escrito (advertências, registro). Para justa causa, explicar Art. 482 CLT e dizer que vamos entrar em contato ainda hoje para detalhar.',
      respostaEnviada: 'João, a Fernanda verificou o seu caso! Para a justa causa ser válida, é fundamental ter registros escritos das faltas cometidas (advertências, suspensões). Na prática, recomendamos que você: 1) Reúna toda a documentação do ato faltoso, 2) Consulte nosso time antes de comunicar ao funcionário. Vamos te ligar hoje até as 17h para detalhar tudo. 👍',
      criadoEm: daysAgo(2),
      atualizadoEm: daysAgo(2),
    },
  })

  // ── 6d. RESOLVIDA — Onboarding, via modo direto ──────────────────────────────
  await prisma.escalacao.upsert({
    where: { id: 'esc-mock-004' },
    update: {},
    create: {
      id: 'esc-mock-004',
      canal: 'onboarding',
      status: 'resolvida',
      sessionId: 'sess-mock-def456',
      historico: [
        { role: 'user',      content: 'Olá, assine o contrato mas não consigo acessar o portal, me mandaram uma senha mas não funciona' },
        { role: 'assistant', content: 'Olá! Peço desculpas pelo inconveniente. Pode ser que o link de ativação tenha expirado (é válido por 24h). Nossa equipe técnica pode gerar um novo acesso para você. Posso te ajudar a acionar o suporte?' },
        { role: 'user',      content: 'Sim, preciso acessar urgente pois tenho um prazo para enviar os documentos' },
      ],
      ultimaMensagem: 'Sim, preciso acessar urgente pois tenho um prazo para enviar os documentos',
      motivoIA: 'Problema técnico de acesso ao portal pós-assinatura. Requer reset manual de senha pelo suporte.',
      operadorId: admin.id,
      orientacaoHumana: 'resposta direta',
      respostaEnviada: 'Olá! Já redefinimos sua senha. Você receberá um e-mail nos próximos 5 minutos com um novo link de acesso. Se não chegar, verifique a caixa de spam. Qualquer dificuldade, pode chamar aqui! 😊',
      criadoEm: daysAgo(1),
      atualizadoEm: daysAgo(1),
    },
  })

  console.log('   ✅ 4 escalações criadas (2 pendentes, 2 resolvidas)\n')

  // ════════════════════════════════════════════════════════════════════════════
  // 7. CONVERSA WHATSAPP — Primeiro contato desconhecido (sem lead ainda)
  // ════════════════════════════════════════════════════════════════════════════
  console.log('💬 Criando conversa WhatsApp — desconhecido (sem lead)...')

  const convDesconhecido = await prisma.conversaIA.upsert({
    where: { id: 'conv-wpp-desc-001' },
    update: {},
    create: {
      id: 'conv-wpp-desc-001',
      canal: 'whatsapp',
      remoteJid: '5562998001122@s.whatsapp.net',
      criadaEm: minsAgo(20),
      atualizadaEm: minsAgo(20),
    },
  })

  await prisma.mensagemIA.createMany({
    skipDuplicates: true,
    data: [
      {
        id: 'msg-wpp-d-01',
        conversaId: convDesconhecido.id,
        role: 'user',
        conteudo: 'oi bom dia',
        criadaEm: new Date(minsAgo(20).getTime() + 0),
      },
      {
        id: 'msg-wpp-d-02',
        conversaId: convDesconhecido.id,
        role: 'assistant',
        conteudo: 'Bom dia! Aqui é a Clara da ContabAI 😊 Em que posso te ajudar hoje?',
        criadaEm: new Date(minsAgo(20).getTime() + 60000),
      },
      {
        id: 'msg-wpp-d-03',
        conversaId: convDesconhecido.id,
        role: 'user',
        conteudo: 'quero abrir uma empresa, como funciona?',
        criadaEm: new Date(minsAgo(15).getTime()),
      },
      {
        id: 'msg-wpp-d-04',
        conversaId: convDesconhecido.id,
        role: 'assistant',
        conteudo: 'Que ótimo! Abertura de empresa é uma das nossas especialidades 🎉 Para te orientar melhor, me conta: qual tipo de atividade você vai exercer? Comércio, serviço ou indústria? E você já tem ideia se vai começar como MEI ou ME?',
        criadaEm: new Date(minsAgo(14).getTime()),
      },
    ],
  })

  console.log('   ✅ Conversa de primeiro contato desconhecido criada\n')

  // ════════════════════════════════════════════════════════════════════════════
  // Resumo
  // ════════════════════════════════════════════════════════════════════════════
  const totalConversas = await prisma.conversaIA.count()
  const totalMensagens = await prisma.mensagemIA.count()
  const totalEscalacoes = await prisma.escalacao.count()
  const totalProspectos = await prisma.lead.count({ where: { funil: 'prospeccao' } })

  console.log('════════════════════════════════════════')
  console.log('🎉 Seed IA concluído!')
  console.log(`   📱 ${totalConversas} conversas | ${totalMensagens} mensagens`)
  console.log(`   🚨 ${totalEscalacoes} escalações`)
  console.log(`   📋 ${totalProspectos} leads em prospecção`)
  console.log('════════════════════════════════════════')
  console.log('\nPara testar:')
  console.log('  • /crm/clientes → João Pedro → aba "Conversas IA"')
  console.log('  • /crm/clientes → Fernanda Lima → aba "Conversas IA"')
  console.log('  • /crm/atendimentos → 2 pendentes + 2 resolvidos')
  console.log('  • /crm/prospeccao → 4 leads de prospecção via WhatsApp')
}

main().catch(console.error).finally(() => prisma.$disconnect())
