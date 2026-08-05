import { clsx } from 'clsx'
import type { ReactNode } from 'react'

type Tono = 'neutro' | 'destacado'

// Colores sólidos, sin opacidades: sobre un modal blanco las secciones con
// fondo translúcido resultaban indistinguibles del fondo.
const tonoClases: Record<Tono, string> = {
  neutro: 'border-slate-200 bg-slate-50',
  destacado: 'border-teal-200 bg-teal-50/60',
}

const tonoTitulo: Record<Tono, string> = {
  neutro: 'border-slate-200 text-slate-600',
  destacado: 'border-teal-200 text-teal-700',
}

/**
 * Contenedor de sección de formulario: fija borde, fondo, y sobre todo la
 * separación entre el título y sus campos. Se usa en la ficha clínica y en los
 * modales de alta/edición para que todos los bloques respiren igual.
 */
export function Seccion({
  titulo,
  icono,
  tono = 'neutro',
  className,
  children,
}: {
  titulo: string
  icono?: ReactNode
  tono?: Tono
  className?: string
  children: ReactNode
}) {
  return (
    <section className={clsx('rounded-xl border p-3 sm:p-4', tonoClases[tono], className)}>
      <h4
        className={clsx(
          'mb-4 flex items-center gap-2 border-b pb-2 text-[11px] font-bold uppercase tracking-wider',
          tonoTitulo[tono],
        )}
      >
        {icono}
        {titulo}
      </h4>
      <div className="space-y-4">{children}</div>
    </section>
  )
}
