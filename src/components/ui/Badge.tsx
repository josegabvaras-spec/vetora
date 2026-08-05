import { clsx } from 'clsx'
import type { ReactNode } from 'react'

type Tone = 'teal' | 'rose' | 'amber' | 'emerald' | 'slate'

const toneClasses: Record<Tone, string> = {
  teal: 'bg-teal-50 text-teal-700 border border-teal-200/60',
  rose: 'bg-rose-50 text-rose-700 border border-rose-200/60',
  amber: 'bg-amber-50/70 text-amber-800 border border-amber-200/60',
  emerald: 'bg-emerald-50 text-emerald-700 border border-emerald-200/60',
  slate: 'bg-slate-100 text-slate-600 border border-slate-200/60',
}

interface BadgeProps {
  tone?: Tone
  size?: 'sm' | 'md'
  children: ReactNode
  className?: string
}

export function Badge({ tone = 'slate', size = 'md', children, className }: BadgeProps) {
  return (
    <span
      className={clsx(
        // `max-w-full` + `min-w-0` permiten que el badge se encoja dentro de
        // contenedores estrechos (p. ej. una columna de la vista semanal) en
        // vez de desbordarlos; el texto se recorta con puntos suspensivos.
        'inline-flex min-w-0 max-w-full items-center rounded-full border shadow-xs leading-none transition-all select-none',
        // El tamaño `sm` va en minúsculas y sin tracking extra: en mayúsculas
        // con letter-spacing el texto se ensancha tanto que no cabe en las
        // columnas estrechas del calendario.
        size === 'sm' ? 'px-2 py-0.5 text-[10px] font-bold' : 'px-2.5 py-0.5 text-xs font-medium',
        toneClasses[tone],
        className,
      )}
    >
      <span className="truncate">{children}</span>
    </span>
  )
}
