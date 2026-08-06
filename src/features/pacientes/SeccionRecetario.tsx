import { useState } from 'react'
import { ClipboardList, Trash2 } from 'lucide-react'
import { Seccion } from '../../components/ui/Seccion'
import type { RecetaItem, ViaAdministracion } from '../../types/database'

export interface RecetaItemPendiente {
  medicamento: string
  dosis: string
  via: ViaAdministracion
  frecuencia: string
  duracion: string
  indicaciones: string
}

const VIA_LABEL: Record<ViaAdministracion, string> = {
  oral: 'Oral',
  intramuscular: 'Intramuscular (IM)',
  subcutanea: 'Subcutánea (SC)',
  intravenosa: 'Intravenosa (IV)',
  topica: 'Tópica',
  oftalmica: 'Oftálmica',
  otica: 'Ótica',
}


/**
 * Sección de recetario en la ficha clínica.
 *
 * - **Modo borrador**: el médico puede agregar y eliminar ítems mediante el
 *   formulario inline.
 * - **Modo cerrado** (disabled): solo lectura; no se muestran controles.
 */
export function SeccionRecetario({
  registrados = [],
  pendientes = [],
  onEliminar,
  disabled,
}: {
  registrados: RecetaItem[]
  pendientes: RecetaItemPendiente[]
  onEliminar?: (id: string) => Promise<void>
  disabled?: boolean
}) {
  const [error, setError] = useState<string | null>(null)
  const [eliminandoId, setEliminandoId] = useState<string | null>(null)

  const vacio = registrados.length === 0 && pendientes.length === 0

  async function eliminar(id: string) {
    if (!onEliminar) return
    setEliminandoId(id)
    try {
      await onEliminar(id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar el medicamento')
    } finally {
      setEliminandoId(null)
    }
  }

  return (
    <Seccion titulo="Recetario" icono={<ClipboardList size={13} className="text-teal-600" />}>
      {vacio ? (
        <p className="text-xs text-slate-400">Ningún medicamento recetado en esta consulta.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {registrados.map((item) => (
            <li key={item.id} className="py-2 first:pt-0">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-slate-800">{item.medicamento}</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    <span className="font-medium text-slate-600">{item.dosis}</span>
                    {' · '}
                    {VIA_LABEL[item.via]}
                    {' · '}
                    {item.frecuencia}
                    {' · '}
                    {item.duracion}
                  </p>
                  {item.indicaciones && (
                    <p className="mt-0.5 text-[11px] italic text-slate-400">{item.indicaciones}</p>
                  )}
                </div>
                {!disabled && onEliminar && (
                  <button
                    type="button"
                    onClick={() => eliminar(item.id)}
                    disabled={eliminandoId === item.id}
                    className="shrink-0 rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"
                    title="Eliminar medicamento"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </li>
          ))}
          {pendientes.map((item, i) => (
            <li key={`pendiente-${i}`} className="py-2">
              <p className="text-xs font-semibold text-slate-800">{item.medicamento}</p>
              <p className="mt-0.5 text-[11px] text-slate-500">
                <span className="font-medium text-slate-600">{item.dosis}</span>
                {' · '}
                {VIA_LABEL[item.via]}
                {' · '}
                {item.frecuencia}
                {' · '}
                {item.duracion}
              </p>
              {item.indicaciones && (
                <p className="mt-0.5 text-[11px] italic text-slate-400">{item.indicaciones}</p>
              )}
            </li>
          ))}
        </ul>
      )}

      {error && <p className="text-xs font-bold text-rose-600">{error}</p>}
    </Seccion>
  )
}
