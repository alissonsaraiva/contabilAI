'use client'

import { useEffect, useRef, useState } from 'react'
import DOMPurify                        from 'isomorphic-dompurify'

/**
 * Renderiza HTML de email externo em iframe sandboxed.
 * Scripts são bloqueados pelo sandbox; DOMPurify remove event handlers inline
 * e outros vetores XSS antes de injetar o srcdoc.
 */
export function EmailHtml({ html }: { html: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [height, setHeight]   = useState(200)
  const [pronto, setPronto]   = useState(false)

  useEffect(() => {
    const clean = DOMPurify.sanitize(html, {
      FORCE_BODY:   true,
      ADD_TAGS:     ['style', 'link'],
      ADD_ATTR:     ['target'],
      FORBID_TAGS:  ['script', 'object', 'embed', 'form'],
      FORBID_ATTR:  ['onerror', 'onload', 'onclick', 'onmouseover', 'action'],
    })

    const iframe = iframeRef.current
    if (!iframe) return

    // Garante que todos os links abram em nova aba (fora do iframe sandboxed)
    const wrappado = clean.replace(/<a /gi, '<a target="_blank" rel="noopener noreferrer" ')

    iframe.srcdoc = wrappado

    const onLoad = () => {
      const doc = iframe.contentDocument ?? iframe.contentWindow?.document
      if (doc?.body) {
        const scrollH = doc.body.scrollHeight
        setHeight(Math.max(scrollH + 32, 100))
      }
      setPronto(true)
    }

    iframe.addEventListener('load', onLoad)
    return () => { iframe.removeEventListener('load', onLoad) }
  }, [html])

  return (
    <div className="relative w-full overflow-hidden rounded-lg border border-outline-variant/10">
      {!pronto && (
        <div className="flex items-center gap-2 px-3 py-4 text-[12px] text-on-surface-variant/50">
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-on-surface-variant/20 border-t-on-surface-variant/60" />
          Carregando e-mail…
        </div>
      )}
      <iframe
        ref={iframeRef}
        title="Conteúdo do e-mail"
        // allow-popups: links abrem nova aba | allow-same-origin: iframe acessa seu próprio DOM p/ medir altura
        // allow-scripts é propositalmente omitido
        sandbox="allow-popups allow-same-origin"
        className="w-full transition-opacity duration-200"
        style={{ height, opacity: pronto ? 1 : 0, border: 'none', display: 'block' }}
      />
    </div>
  )
}
