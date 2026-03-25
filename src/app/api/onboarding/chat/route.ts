import { NextResponse } from 'next/server'

// TODO: substituir pela URL do webhook n8n quando estiver configurado
const N8N_WEBHOOK_URL = process.env.N8N_CHAT_WEBHOOK_URL

type Msg = { role: 'user' | 'assistant'; text: string }

export async function POST(req: Request) {
  const { message, history } = await req.json() as { message: string; history: Msg[] }

  // Quando o webhook n8n estiver configurado, repassa a requisição
  if (N8N_WEBHOOK_URL) {
    try {
      const res = await fetch(N8N_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, history }),
      })
      const data = await res.json()
      return NextResponse.json({ reply: data.reply ?? data.text ?? data.output ?? 'Sem resposta.' })
    } catch {
      return NextResponse.json({ reply: 'Serviço temporariamente indisponível. Tente novamente.' })
    }
  }

  // Placeholder até o n8n estar configurado
  const lower = message.toLowerCase()
  let reply = 'Entendido! Nossa equipe pode esclarecer todos os detalhes. Por ora, siga os passos do cadastro e em breve entraremos em contato. 😊'

  if (lower.includes('plano') || lower.includes('diferença')) {
    reply = 'Temos 4 planos: Essencial (MEI/autônomo, R$199/mês), Profissional (pequenas empresas, R$499/mês), Empresarial (médias empresas, R$1.200/mês) e Startup (empresas em crescimento, R$1.500/mês). Quer que eu detalhe algum?'
  } else if (lower.includes('simples') || lower.includes('lucro')) {
    reply = 'A escolha do regime tributário (Simples Nacional, Lucro Presumido ou Lucro Real) depende do seu faturamento anual, atividade e margem de lucro. Nosso contador vai analisar o melhor enquadramento para você após o cadastro.'
  } else if (lower.includes('nota') || lower.includes('nfe') || lower.includes('nfse')) {
    reply = 'A emissão de notas fiscais fica por conta da sua empresa (ou do seu contador, conforme o plano). Todos os nossos planos incluem orientação e configuração do sistema de emissão.'
  } else if (lower.includes('cancela') || lower.includes('rescis')) {
    reply = 'Você pode cancelar o contrato a qualquer momento com aviso prévio de 30 dias, sem multa. Não temos fidelidade.'
  } else if (lower.includes('prazo') || lower.includes('tempo')) {
    reply = 'Nossa equipe entra em contato em até 24h após a assinatura do contrato para alinhar todos os detalhes e iniciar a transição contábil.'
  } else if (lower.includes('pix') || lower.includes('boleto') || lower.includes('cartão') || lower.includes('pagamento')) {
    reply = 'Aceitamos PIX (com 5% de desconto), Boleto Bancário e Cartão de Crédito/Débito. Você escolheu no passo anterior!'
  }

  return NextResponse.json({ reply })
}
