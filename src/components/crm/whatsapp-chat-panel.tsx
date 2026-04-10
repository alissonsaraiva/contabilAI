'use client'

import { DocumentoPicker } from '@/components/crm/documento-picker'
import { useWhatsAppChat, WHATSAPP_API_PATH_PATTERN } from './whatsapp-chat/use-whatsapp-chat'
import { WhatsAppChatBoundary } from './whatsapp-chat/chat-boundary'
import { ChatHeader } from './whatsapp-chat/chat-header'
import { MessageItem } from './whatsapp-chat/message-item'
import { ChatInput } from './whatsapp-chat/chat-input'

export type WhatsAppChatPanelProps = {
  apiPath: string
  nomeExibido: string
  onClose: () => void
  clienteId?: string
  leadId?: string
}

export function WhatsAppChatPanel({ apiPath, nomeExibido, onClose, clienteId: clienteIdProp, leadId: leadIdProp }: WhatsAppChatPanelProps) {
  if (!WHATSAPP_API_PATH_PATTERN.test(apiPath)) {
    console.error('[WhatsAppChatPanel] apiPath inválido:', apiPath)
    return null
  }

  return (
    <WhatsAppChatBoundary onClose={onClose}>
      <WhatsAppChatPanelInner apiPath={apiPath} nomeExibido={nomeExibido} onClose={onClose} clienteId={clienteIdProp} leadId={leadIdProp} />
    </WhatsAppChatBoundary>
  )
}

function WhatsAppChatPanelInner({ apiPath, nomeExibido, onClose, clienteId: clienteIdProp, leadId: leadIdProp }: WhatsAppChatPanelProps) {
  const {
    mensagens, pausada, conversaId, telefone, semNumero,
    texto, setTexto, sending, reativando, assumindo, excluindo,
    arquivos, uploading, naoModoIA, setNaoModoIA,
    pickerOpen, setPickerOpen, entity,
    fileInputRef, bottomRef, scrollContainerRef,
    onScroll, handleFileChange, removerArquivo, handleDocsSistema,
    enviar, assumirControle, reativarIA, excluirMensagem,
  } = useWhatsAppChat(apiPath)

  // Usa o contexto do entity (apiPath) como prioritário; cai no prop como fallback
  // (ex: sócio, ou conversa não vinculada a cliente/lead)
  const resolvedClienteId = entity?.entidadeTipo === 'cliente' ? entity.entidadeId : clienteIdProp
  const resolvedLeadId    = entity?.entidadeTipo === 'lead'    ? entity.entidadeId : leadIdProp

  return (
    <>
      <DocumentoPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelectMultiple={handleDocsSistema}
        multiSelect
        clienteId={resolvedClienteId}
        leadId={resolvedLeadId}
      />

      <ChatHeader
        nomeExibido={nomeExibido}
        telefone={telefone}
        pausada={pausada}
        reativando={reativando}
        assumindo={assumindo}
        conversaId={conversaId}
        mensagensCount={mensagens.length}
        onClose={onClose}
        onReativarIA={reativarIA}
        onAssumir={assumirControle}
      />

      {/* Banner de pausa */}
      {pausada && (
        <div className="shrink-0 border-b border-orange-status/10 bg-orange-status/5 px-5 py-2">
          <p className="text-[11px] text-orange-status">
            IA pausada — o contato não receberá respostas automáticas. Retoma automaticamente após 1h de inatividade.
          </p>
        </div>
      )}

      {/* Mensagens */}
      <div ref={scrollContainerRef} onScroll={onScroll} className="flex-1 overflow-y-auto custom-scrollbar px-4 py-4">
        {semNumero ? (
          <div className="flex h-full flex-col items-center justify-center py-12 text-center">
            <span className="material-symbols-outlined mb-3 text-[40px] text-on-surface-variant/25">phone_disabled</span>
            <p className="text-[13px] font-medium text-on-surface-variant">Sem número cadastrado</p>
            <p className="mt-1 text-[12px] text-on-surface-variant/60">
              Adicione o telefone/WhatsApp para enviar mensagens.
            </p>
          </div>
        ) : mensagens.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center py-12 text-center">
            <span className="material-symbols-outlined mb-3 text-[40px] text-on-surface-variant/25">chat_bubble</span>
            <p className="text-[13px] font-medium text-on-surface-variant">Nenhuma mensagem ainda</p>
            <p className="mt-1 text-[12px] text-on-surface-variant/60">
              Envie a primeira mensagem para iniciar a conversa
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {mensagens.map(m => (
              <MessageItem
                key={m.id}
                m={m}
                excluindo={excluindo}
                onExcluir={excluirMensagem}
              />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {!semNumero && (
        <ChatInput
          arquivos={arquivos}
          uploading={uploading}
          texto={texto}
          setTexto={setTexto}
          sending={sending}
          pausada={pausada}
          naoModoIA={naoModoIA}
          setNaoModoIA={setNaoModoIA}
          fileInputRef={fileInputRef}
          onFileChange={handleFileChange}
          onRemoverArquivo={removerArquivo}
          onEnviar={enviar}
          onPickerOpen={() => setPickerOpen(true)}
        />
      )}
    </>
  )
}
