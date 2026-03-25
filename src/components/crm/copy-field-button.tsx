'use client'

import { useState } from 'react'

export function CopyFieldButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <button
      onClick={handleCopy}
      title="Copiar"
      className="opacity-0 transition-all group-hover:opacity-100"
    >
      <span className="material-symbols-outlined text-[16px] text-on-surface-variant hover:text-primary">
        {copied ? 'check' : 'content_copy'}
      </span>
    </button>
  )
}
