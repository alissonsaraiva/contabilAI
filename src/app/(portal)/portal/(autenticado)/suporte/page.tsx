import { Card } from '@/components/ui/card'

export default function PortalSuportePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline text-2xl font-semibold text-on-surface">Suporte</h1>
        <p className="text-sm text-on-surface-variant/70 mt-1">
          Fale com nossa equipe ou tire dúvidas com a Clara.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-outline-variant/15 bg-card/60 p-5 rounded-[16px] shadow-sm">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <span className="material-symbols-outlined text-[26px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>smart_toy</span>
          </div>
          <h2 className="text-[15px] font-semibold text-on-surface mb-1">Clara — Assistente Virtual</h2>
          <p className="text-[13px] text-on-surface-variant/70 leading-relaxed mb-4">
            Tire dúvidas sobre contabilidade, obrigações fiscais, declarações e muito mais.
            Disponível 24h por dia.
          </p>
          <p className="text-[12px] font-medium text-primary">
            → Clique no botão <strong>azul</strong> no canto inferior direito para conversar.
          </p>
        </Card>

        <Card className="border-outline-variant/15 bg-card/60 p-5 rounded-[16px] shadow-sm">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-green-status/10">
            <span className="material-symbols-outlined text-[26px] text-green-status" style={{ fontVariationSettings: "'FILL' 1" }}>support_agent</span>
          </div>
          <h2 className="text-[15px] font-semibold text-on-surface mb-1">Atendimento Humano</h2>
          <p className="text-[13px] text-on-surface-variant/70 leading-relaxed mb-4">
            Para atendimentos que exigem análise detalhada ou urgência, solicite atendimento humano
            e nossa equipe retornará em breve.
          </p>
          <p className="text-[12px] text-on-surface-variant/60">
            Horário de atendimento: seg-sex, 8h–18h.
          </p>
        </Card>
      </div>

      <Card className="border-outline-variant/15 bg-card/60 p-5 rounded-[16px] shadow-sm">
        <div className="flex items-start gap-3">
          <span className="material-symbols-outlined text-[20px] text-on-surface-variant/50 mt-0.5 shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>
            quiz
          </span>
          <div>
            <h3 className="text-[13px] font-semibold text-on-surface mb-2">Dúvidas frequentes</h3>
            <ul className="space-y-2 text-[13px] text-on-surface-variant/70">
              <li>• Como emitir nota fiscal? → Pergunte para a Clara.</li>
              <li>• Quando vence meu DAS (MEI/Simples)? → Clara pode calcular.</li>
              <li>• Como atualizar meus dados cadastrais? → Entre em contato com o escritório.</li>
              <li>• Como obter segunda via de boleto? → Entre em contato com o escritório.</li>
            </ul>
          </div>
        </div>
      </Card>
    </div>
  )
}
