import { clsx } from 'clsx'
import type { HTMLAttributes } from 'react'

/**
 * El padding va como prop y no por `className`: si el llamador pasara `p-3`
 * competiría con el `p-5` base y el resultado dependería del orden en que
 * Tailwind genera las utilidades, no del orden en el atributo class.
 */
type Padding = 'sm' | 'md' | 'none'

const paddingClases: Record<Padding, string> = {
  none: '',
  sm: 'p-3',
  md: 'p-4 sm:p-5',
}

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: Padding
}

export function Card({ className, padding = 'md', ...props }: CardProps) {
  return (
    <div
      className={clsx(
        'rounded-2xl border border-slate-200/80 bg-white/95 backdrop-blur-xl shadow-premium transition-all duration-300',
        paddingClases[padding],
        className
      )}
      {...props}
    />
  )
}
