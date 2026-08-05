import type { InputHTMLAttributes, LabelHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { clsx } from 'clsx'

// El estado deshabilitado va con variantes `disabled:` en vez de dejar que
// cada llamador pase clases: así gana siempre sobre `bg-white`, sin depender
// del orden en el atributo class (que en CSS no decide la precedencia).
// `text-base` en celular y `text-sm` desde `sm` no es un capricho tipográfico:
// Safari de iOS hace zoom sobre cualquier campo con letra menor de 16 px al
// enfocarlo, y la página se queda descuadrada al salir del campo.
const controlClasses =
  'w-full rounded-xl border border-slate-200/80 bg-white/70 px-4 py-2.5 text-base sm:text-sm text-slate-800 shadow-sm placeholder:text-slate-400 focus:border-teal-500 focus:ring-4 focus:ring-teal-500/15 focus:outline-none focus:bg-white transition-all duration-200 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400'

// `className` se extrae de props a propósito: si se dejara dentro del spread,
// éste sobrescribiría las clases base del control y el campo quedaría sin
// borde, sin fondo y sin ancho.

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={clsx('mb-1.5 block text-xs font-semibold tracking-wider text-slate-500 uppercase', className)}
      {...props}
    />
  )
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={clsx(controlClasses, className)} {...props} />
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={clsx(controlClasses, 'min-h-24 resize-y leading-relaxed', className)} {...props} />
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={clsx(controlClasses, 'cursor-pointer pr-8', className)} {...props} />
}

export function FieldGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      {children}
    </div>
  )
}
