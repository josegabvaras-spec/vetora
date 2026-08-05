import type { ReactNode } from 'react'
import { clsx } from 'clsx'

/**
 * Papel de cada columna cuando la tabla se convierte en tarjetas (por debajo de
 * `md`): `titulo` encabeza la tarjeta, `destacado` va a su derecha, `detalle`
 * baja como par etiqueta/valor, `acciones` ocupa el pie a lo ancho y `oculta`
 * existe solo en la tabla.
 */
export type PapelMovil = 'titulo' | 'destacado' | 'detalle' | 'acciones' | 'oculta'

export interface Columna<T> {
  clave: string
  cabecera: string
  celda: (fila: T) => ReactNode
  /** Por defecto `detalle`. */
  movil?: PapelMovil
  alineadaDerecha?: boolean
  /** Clases extra para la celda en la vista de tabla. */
  className?: string
}

/**
 * Una sola definición de columnas para los dos formatos: en tablet y escritorio
 * se dibuja la tabla —con scroll horizontal si hace falta—, y en celular cada
 * fila se convierte en una tarjeta. Se evita así mantener dos marcados en
 * paralelo, que es donde acaban divergiendo las columnas.
 */
export function TablaResponsive<T>({
  columnas,
  filas,
  claveDe,
  onFilaClick,
  vacio = 'No hay registros.',
}: {
  columnas: Columna<T>[]
  filas: T[]
  claveDe: (fila: T) => string
  onFilaClick?: (fila: T) => void
  vacio?: ReactNode
}) {
  const papelDe = (c: Columna<T>): PapelMovil => c.movil ?? 'detalle'
  const titulos = columnas.filter((c) => papelDe(c) === 'titulo')
  const destacados = columnas.filter((c) => papelDe(c) === 'destacado')
  const detalles = columnas.filter((c) => papelDe(c) === 'detalle')
  const acciones = columnas.filter((c) => papelDe(c) === 'acciones')

  if (filas.length === 0) {
    return <p className="px-5 py-12 text-center text-sm text-slate-400">{vacio}</p>
  }

  return (
    <>
      {/* Tablet y escritorio */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50/70 text-[10px] font-bold uppercase tracking-widest text-slate-500">
            <tr>
              {columnas.map((c) => (
                <th key={c.clave} className={clsx('px-5 py-3.5', c.alineadaDerecha && 'text-right')}>
                  {c.cabecera}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filas.map((fila) => (
              <tr
                key={claveDe(fila)}
                onClick={onFilaClick ? () => onFilaClick(fila) : undefined}
                className={clsx(
                  'transition-colors hover:bg-slate-50',
                  onFilaClick && 'cursor-pointer',
                )}
              >
                {columnas.map((c) => (
                  <td
                    key={c.clave}
                    className={clsx('px-5 py-3.5 align-middle', c.alineadaDerecha && 'text-right', c.className)}
                  >
                    {c.celda(fila)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Celular: una tarjeta por fila */}
      <ul className="divide-y divide-slate-100 md:hidden">
        {filas.map((fila) => (
          <li key={claveDe(fila)}>
            <div
              onClick={onFilaClick ? () => onFilaClick(fila) : undefined}
              role={onFilaClick ? 'button' : undefined}
              tabIndex={onFilaClick ? 0 : undefined}
              onKeyDown={
                onFilaClick
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        onFilaClick(fila)
                      }
                    }
                  : undefined
              }
              className={clsx('p-4', onFilaClick && 'cursor-pointer active:bg-slate-50')}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-1">
                  {titulos.map((c) => (
                    <div key={c.clave} className="min-w-0">
                      {c.celda(fila)}
                    </div>
                  ))}
                </div>
                {destacados.length > 0 && (
                  <div className="shrink-0 space-y-1 text-right">
                    {destacados.map((c) => (
                      <div key={c.clave}>{c.celda(fila)}</div>
                    ))}
                  </div>
                )}
              </div>

              {detalles.length > 0 && (
                <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2.5 border-t border-slate-100 pt-3">
                  {detalles.map((c) => (
                    <div key={c.clave} className="min-w-0">
                      <dt className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{c.cabecera}</dt>
                      <dd className="mt-0.5 text-sm text-slate-700">{c.celda(fila)}</dd>
                    </div>
                  ))}
                </dl>
              )}

              {acciones.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                  {acciones.map((c) => (
                    <div key={c.clave} className="flex flex-1 flex-wrap gap-2">
                      {c.celda(fila)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}
