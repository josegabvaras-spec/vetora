import { useState } from 'react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { formatBs } from '../../lib/currency'
import { formatClinicDate } from '../../lib/datetime'
import { liquidarComisiones } from '../../services/comisiones'
import { useAuth } from '../../context/useAuth'
import type { PeluqueriaComisionConDetalle } from '../../types/views'

interface LiquidarComisionesModalProps {
  comisiones: PeluqueriaComisionConDetalle[]
  onClose: () => void
  onLiquidated: () => void
}

export function LiquidarComisionesModal({ comisiones, onClose, onLiquidated }: LiquidarComisionesModalProps) {
  const { usuario } = useAuth()
  const pendientes = comisiones.filter((c) => c.estado === 'pendiente')

  const [seleccionados, setSeleccionados] = useState<string[]>(pendientes.map((c) => c.id))
  const [liquidando, setLiquidando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggleSeleccion(id: string) {
    if (seleccionados.includes(id)) {
      setSeleccionados(seleccionados.filter((x) => x !== id))
    } else {
      setSeleccionados([...seleccionados, id])
    }
  }

  function seleccionarTodos() {
    if (seleccionados.length === pendientes.length) {
      setSeleccionados([])
    } else {
      setSeleccionados(pendientes.map((c) => c.id))
    }
  }

  const comisionesSeleccionadas = pendientes.filter((c) => seleccionados.includes(c.id))
  const totalMontoBs = comisionesSeleccionadas.reduce((acc, c) => acc + (Number(c.monto_comision_bs) || 0), 0)
  const totalBaseBs = comisionesSeleccionadas.reduce((acc, c) => acc + (Number(c.monto_base_bs) || 0), 0)

  async function handleLiquidar() {
    if (seleccionados.length === 0) {
      setError('Selecciona al menos una comisión para liquidar')
      return
    }
    if (!usuario?.id) return

    setLiquidando(true)
    setError(null)

    try {
      await liquidarComisiones(seleccionados, usuario.id)
      onLiquidated()
      onClose()
    } catch (err: any) {
      setError(err.message || 'Error al liquidar comisiones')
      setLiquidando(false)
    }
  }

  return (
    <Modal onClose={onClose} title="Liquidación de Comisiones de Peluquería" widthClassName="max-w-2xl">
      <div className="space-y-4">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
            {error}
          </div>
        )}

        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-500">
            Selecciona las comisiones pendientes que deseas pagar al personal.
          </p>
          <button
            type="button"
            onClick={seleccionarTodos}
            className="text-xs font-bold text-teal-700 hover:text-teal-900 cursor-pointer"
          >
            {seleccionados.length === pendientes.length ? 'Deseleccionar todas' : 'Seleccionar todas'}
          </button>
        </div>

        {pendientes.length === 0 ? (
          <p className="text-center py-8 text-xs text-slate-500">No hay comisiones pendientes para liquidar.</p>
        ) : (
          <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {pendientes.map((c) => {
              const checked = seleccionados.includes(c.id)
              return (
                <label
                  key={c.id}
                  className={`flex items-center justify-between p-3 text-xs transition-colors cursor-pointer ${
                    checked ? 'bg-teal-50/50' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSeleccion(c.id)}
                      className="rounded text-teal-600 focus:ring-teal-500"
                    />
                    <div>
                      <p className="font-bold text-slate-900">
                        {c.peluquero?.nombre || 'Peluquero'} · {c.orden?.paciente?.nombre || 'Mascota'}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Orden #{c.orden?.numero_orden} · {c.orden?.servicio?.nombre || 'Servicio'} · {formatClinicDate(c.created_at)}
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <p className="font-bold text-teal-800 text-sm">{formatBs(c.monto_comision_bs)}</p>
                    <p className="text-[10px] text-slate-400">Base: {formatBs(c.monto_base_bs)}</p>
                  </div>
                </label>
              )
            })}
          </div>
        )}

        {/* Resumen Total */}
        <div className="flex items-center justify-between rounded-xl border border-teal-100 bg-teal-50/60 p-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-teal-700">
              Total a Liquidar ({seleccionados.length} servicios)
            </p>
            <p className="text-2xl font-black text-teal-900">{formatBs(totalMontoBs)}</p>
          </div>
          <div className="text-right text-xs text-slate-500">
            <p>Ingresos generados: {formatBs(totalBaseBs)}</p>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={liquidando}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={handleLiquidar}
            disabled={liquidando || seleccionados.length === 0}
          >
            {liquidando ? 'Liquidando...' : 'Confirmar Liquidación de Pago'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
