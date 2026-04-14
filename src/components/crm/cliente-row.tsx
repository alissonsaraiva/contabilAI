import Link from 'next/link'

export function ClienteRow({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <tr className="group cursor-pointer transition-colors hover:bg-surface-container-low/50">
      {children}
      {/* Link invisível cobre a row — permite prefetch e navegação nativa do App Router */}
      <td className="absolute inset-0 p-0">
        <Link href={href} prefetch={false} className="absolute inset-0" aria-hidden />
      </td>
    </tr>
  )
}
