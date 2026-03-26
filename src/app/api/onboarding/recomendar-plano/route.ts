import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getEscritorioConfig } from '@/lib/escritorio'
import { rateLimit, getClientIp, tooManyRequests } from '@/lib/rate-limit'

const schema = z.object({
  regime:       z.string().max(100),
  faturamento:  z.string().max(100),
  funcionarios: z.string().max(50),
  necessidades: z.string().max(500),
})

export async function POST(req: Request) {
  // Rate limit: 5 recomendações por IP a cada hora
  const ip = getClientIp(req)
  const rl = rateLimit(`recomendar:${ip}`, 5, 60 * 60_000)
  if (!rl.allowed) return tooManyRequests(rl.retryAfterMs)

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
  }

  const [escritorio, apiKey] = await Promise.all([
    getEscritorioConfig(),
    Promise.resolve(process.env.ANTHROPIC_API_KEY),
  ])
  const nomeEscritorio = escritorio.nome

  if (!apiKey) {
    // Sem chave configurada — retorna recomendação estática
    return NextResponse.json({
      plano: 'profissional',
      justificativa:
        'Com base nas suas respostas, o plano Profissional atende todas as suas necessidades com ótimo custo-benefício.',
    })
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        messages: [
          {
            role: 'user',
            content: `Você é um consultor contábil do ${nomeEscritorio}. Analise os dados do cliente abaixo e recomende o plano ideal.

Responda APENAS com JSON válido, sem texto extra: {"plano": "...", "justificativa": "..."}

<dados_cliente>
<regime>${parsed.data.regime}</regime>
<faturamento>${parsed.data.faturamento}</faturamento>
<funcionarios>${parsed.data.funcionarios}</funcionarios>
<necessidades>${parsed.data.necessidades}</necessidades>
</dados_cliente>

Planos disponíveis:
- essencial: MEI e microempresas, sem funcionários, faturamento até R$81k/ano
- profissional: Simples Nacional, até 3 funcionários, inclui DRE e fluxo de caixa
- empresarial: Lucro Presumido/Real, funcionários ilimitados, consultoria mensal
- startup: Empresas digitais em crescimento, relatórios para investidores`,
          },
        ],
      }),
    })

    const data = await response.json()
    const text = data.content?.[0]?.text ?? '{}'
    const result = JSON.parse(text)
    return NextResponse.json(result)
  } catch {
    return NextResponse.json({
      plano: 'profissional',
      justificativa: 'Recomendamos o plano Profissional como ponto de partida ideal para o seu negócio.',
    })
  }
}
