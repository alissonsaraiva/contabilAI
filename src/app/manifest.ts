import type { MetadataRoute } from 'next'
import { getEscritorioConfig } from '@/lib/escritorio'

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const escritorio = await getEscritorioConfig()
  const nome       = escritorio.nomeFantasia ?? escritorio.nome ?? 'Portal do Cliente'
  const cor        = escritorio.corPrimaria ?? '#6366f1'

  return {
    name:             `${nome} — Portal`,
    short_name:       nome,
    description:      `Área exclusiva do cliente — ${nome}`,
    start_url:        '/portal/dashboard',
    display:          'standalone',
    orientation:      'portrait',
    background_color: '#ffffff',
    theme_color:      cor,
    categories:       ['finance', 'business'],
    lang:             'pt-BR',
    icons: [
      {
        src:   '/icons/icon-192.png',
        sizes: '192x192',
        type:  'image/png',
      },
      {
        src:   '/icons/icon-512.png',
        sizes: '512x512',
        type:  'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
