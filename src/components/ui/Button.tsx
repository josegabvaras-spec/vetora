import { clsx } from 'clsx'
import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'danger' | 'success' | 'ghost'

const variantClasses: Record<Variant, string> = {
  primary: 'bg-gradient-to-b from-teal-500 to-teal-600 text-white hover:from-teal-400 hover:to-teal-500 hover:shadow-lg hover:shadow-teal-500/25 border border-teal-600/50 shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)] focus-visible:outline-teal-600',
  secondary: 'bg-white text-slate-700 border border-slate-200/80 hover:bg-slate-50 hover:border-slate-300 hover:shadow-md hover:text-slate-900 shadow-sm',
  danger: 'bg-gradient-to-b from-rose-500 to-rose-600 text-white hover:from-rose-400 hover:to-rose-500 hover:shadow-lg hover:shadow-rose-500/25 border border-rose-600/50 shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)] focus-visible:outline-rose-600',
  success: 'bg-gradient-to-b from-emerald-500 to-emerald-600 text-white hover:from-emerald-400 hover:to-emerald-500 hover:shadow-lg hover:shadow-emerald-500/25 border border-emerald-600/50 shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)] focus-visible:outline-emerald-600',
  ghost: 'bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-slate-400',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
}

export function Button({ variant = 'primary', className, ...props }: ButtonProps) {
  return (
    <button
      className={clsx(
        // `min-h-10` asegura el área de toque mínima incluso cuando el llamador
        // reduce el padding para un botón compacto dentro de una tabla.
        'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium',
        'transition-all duration-200 cubic-bezier(0.4, 0, 0.2, 1)',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
        'active:scale-[0.98] active:opacity-95',
        'disabled:cursor-not-allowed disabled:opacity-50 disabled:scale-100',
        'cursor-pointer shadow-sm',
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  )
}
