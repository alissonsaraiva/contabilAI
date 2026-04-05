'use client'

import { Component, type ReactNode, type ErrorInfo } from 'react'

export class WhatsAppChatBoundary extends Component<
  { children: ReactNode; onClose: () => void },
  { hasError: boolean; error?: Error }
> {
  state = { hasError: false, error: undefined as Error | undefined }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[WhatsAppChatPanel] render error:', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
          <span className="material-symbols-outlined text-[40px] text-error/60">error</span>
          <p className="text-[13px] font-medium text-on-surface">Erro ao carregar conversa</p>
          <p className="text-[11px] text-on-surface-variant/60">{this.state.error?.message}</p>
          <button
            onClick={this.props.onClose}
            className="rounded-lg bg-surface-container px-4 py-2 text-[12px] text-on-surface hover:bg-surface-container-high"
          >
            Fechar
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
