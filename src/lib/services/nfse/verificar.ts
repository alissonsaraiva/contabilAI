import * as Sentry from '@sentry/nextjs'
import { logger } from '@/lib/logger'
import { getSpedyClienteClient } from '@/lib/spedy'
import { getEscritorioSpedy } from './config'
import { getClienteComEmpresa, getClienteSpedyKey } from './helpers'

// ─── Verificação de configuração ──────────────────────────────────────────────

export async function verificarConfiguracaoNfse(clienteId: string): Promise<{
  configurado: boolean
  municipioIntegrado: boolean | null  // null = não verificado (cliente sem cidade)
  motivos: string[]
  empresaId?: string
}> {
  const cliente = await getClienteComEmpresa(clienteId)
  if (!cliente) {
    return { configurado: false, municipioIntegrado: null, motivos: ['Cliente não encontrado'] }
  }

  const motivos: string[] = []

  // Verifica se tem empresa vinculada com Spedy configurado
  if (!cliente.empresa) {
    motivos.push('Cliente não possui empresa vinculada')
  } else if (!cliente.empresa.spedyConfigurado || !cliente.empresa.spedyApiKey) {
    motivos.push('Empresa não está configurada para emissão de NFS-e')
  }

  if (motivos.length > 0) {
    return { configurado: false, municipioIntegrado: null, motivos }
  }

  const empresa = cliente.empresa!

  // Verifica se o município do cliente está integrado
  let municipioIntegrado: boolean | null = null
  if (cliente.cidade && cliente.uf) {
    try {
      const config = await getEscritorioSpedy()
      if (config.spedyApiKey) {
        const spedyKey = getClienteSpedyKey(empresa) ?? ''
        const ambiente = config.spedyAmbiente === 'producao' ? 'producao' : 'sandbox'
        const client   = getSpedyClienteClient({ spedyApiKey: spedyKey, spedyAmbiente: ambiente })
        const nomeNormalizado = cliente.cidade.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

        // Pagina por todas as páginas — estados como SP/MG têm 600+ municípios
        let page    = 1
        let found   = false
        let hasNext = true
        while (hasNext && !found) {
          const res = await client.listarMunicipios({ state: cliente.uf, page, pageSize: 200 })
          found = res.items.some(m =>
            m.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') === nomeNormalizado
            && m.state === cliente.uf
          )
          hasNext = res.hasNext
          page++
        }
        municipioIntegrado = found
        if (!municipioIntegrado) {
          motivos.push(`Município ${cliente.cidade}/${cliente.uf} não está integrado na Spedy`)
        }
      }
    } catch (err) {
      logger.warn('spedy-verificar-municipio-falhou', { clienteId, err })
      Sentry.captureException(err, {
        tags:  { module: 'nfse-verificar', operation: 'verificar-municipio' },
        extra: { clienteId, cidade: cliente.cidade, uf: cliente.uf },
      })
      // Não bloqueia — deixa tentar emitir; a Spedy fará a validação definitiva
    }
  }

  return {
    configurado: motivos.length === 0,
    municipioIntegrado,
    motivos,
    empresaId: empresa.id,
  }
}
