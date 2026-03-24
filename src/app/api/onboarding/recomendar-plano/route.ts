import { NextResponse } from 'next/server'
import { z } from 'zod'

const schema = z.object({
  regime: z.string(),
  faturamento: z.string(),
  funcionarios: z.string(),
  necessidades: z.string(),
})

export async function POST(req: Request) {
  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
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
            content: `Você é um consultor contábil do ContabAI. Com base nos dados abaixo, recomende o plano ideal (essencial, profissional, empresarial ou startup) e dê uma justificativa personalizada em 2 frases.

Responda APENAS em JSON: {"plano": "...", "justificativa": "..."}

Dados:
- Regime tributário atual ou pretendido: ${parsed.data.regime}
- Faturamento mensal estimado: ${parsed.data.faturamento}
- Número de funcionários: ${parsed.data.funcionarios}
- Principais necessidades: ${parsed.data.necessidades}

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
