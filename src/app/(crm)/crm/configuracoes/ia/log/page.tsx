import '@/lib/ai/tools' // registra todas as tools no registry
import { getCapacidades } from '@/lib/ai/tools/registry'
import { CapacidadesManager } from '@/components/crm/capacidades-manager'
import { prisma } from '@/lib/prisma'

export default async function AgenteOperacionalPage() {
  const escritorio = await prisma.escritorio.findFirst({
    select: { toolsDesabilitadas: true, toolsCanaisOverride: true },
  })
  const desabilitadasIniciais: string[] = Array.isArray(escritorio?.toolsDesabilitadas)
    ? escritorio.toolsDesabilitadas as string[] : []
  const canaisOverrideIniciais: Record<string, string[]> =
    escritorio?.toolsCanaisOverride && typeof escritorio.toolsCanaisOverride === 'object' && !Array.isArray(escritorio.toolsCanaisOverride)
      ? escritorio.toolsCanaisOverride as Record<string, string[]> : {}
  const capacidades = getCapacidades()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-on-surface">Agente Operacional</h1>
        <p className="mt-0.5 text-sm text-on-surface-variant">
          Ferramentas disponíveis e configuração de canais por ferramenta
        </p>
      </div>

      {/* Capacidades */}
      <div className="rounded-2xl border border-outline-variant/15 bg-card p-5 space-y-5">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>smart_toy</span>
          <h2 className="text-[14px] font-semibold text-on-surface">Capacidades disponíveis</h2>
          <span className="ml-auto rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
            {capacidades.length} ferramentas
          </span>
        </div>
        <CapacidadesManager
          capacidades={capacidades}
          desabilitadasIniciais={desabilitadasIniciais}
          canaisOverrideIniciais={canaisOverrideIniciais}
        />
      </div>
    </div>
  )
}
