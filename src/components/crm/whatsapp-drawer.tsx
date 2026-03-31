'use client'

import { Sheet, SheetContent } from '@/components/ui/sheet'
import { WhatsAppChatPanel } from './whatsapp-chat-panel'

type Props = {
  /** Base path da API, ex: /api/clientes/[id]/whatsapp ou /api/leads/[id]/whatsapp */
  apiPath: string
  nomeExibido: string
  open: boolean
  onClose: () => void
}

export function WhatsAppDrawer({ apiPath, nomeExibido, open, onClose }: Props) {
  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent side="right" className="flex w-full max-w-md flex-col gap-0 p-0" showCloseButton={false}>
        {open && (
          <WhatsAppChatPanel
            apiPath={apiPath}
            nomeExibido={nomeExibido}
            onClose={onClose}
          />
        )}
      </SheetContent>
    </Sheet>
  )
}
