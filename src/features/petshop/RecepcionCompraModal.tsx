import { useState } from 'react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Field'
import { recibirOrdenCompra, type ItemRecepcionInput } from '../../services/compras'
import type { OrdenCompraConDetalle } from '../../types/views'
import { formatBs } from '../../lib/currency'
import { useAuth } from '../../context/AuthContext'

interface RecepcionCompraModalProps {
  orden: OrdenCompraConDetalle
  sucursalId: string
  onClose: () => void
  onReceived: () => void
}

export function RecepcionCompraModal({
  orden,
  sucursalId,
  onClose,
  onReceived,
}: RecepcionCompraModalProps) {
  const { usuario } = useAuth()
  const [items, setItems] = useState<ItemRecepcionInput[]>(
    (orden.detalles || []).map((d) => ({
      detalleId: d.id,
      productoId: d.producto_id,
      cantidadRecibida: d.cantidad_pedida,
      costoUnitarioBs: d.costo_unitario_bs,
      lote: '',
      fechaVencimiento: '',
    })),
  )

  const [recibiendo, setRecibiendo] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function updateItem(idx: number, campo: keyof ItemRecepcionInput, valor: any) {
    const copia = [...items]
    copia[idx] = { ...copia[idx], [campo]: valor }
    setItems(copia)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setRecibiendo(true)
    setError(null)

    try {
      await recibirOrdenCompra(orden.id, sucursalId, items, usuario?.id)
      onReceived()
      onClose()
    } catch (err: any) {
      setError(err.message || 'Error al procesar recepción de compra')
      setRecibiendo(false)
    }
  }

  return (
    <Modal
      onClose={onClose}
      title={`Recepción de Mercadería · Orden #${orden.numero_orden}`}
      widthClassName="max-w-3xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
            {error}
          </div>
        )}

        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-xs flex justify-between items-center">
          <div>
            <p className="font-bold text-slate-900">{orden.proveedor?.empresa}</p>
            <p className="text-slate-500">Total Esperado: {formatBs(orden.total_bs)}</p>
          </div>
          <span className="text-[11px] font-bold text-teal-800 bg-teal-100 px-2 py-0.5 rounded">
            Pendiente de Recepción
          </span>
        </div>

        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            Confirma la cantidad recibida de cada producto e ingresa el número de lote y fecha de vencimiento si corresponde.
          </p>

          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white overflow-hidden text-xs">
            {(orden.detalles || []).map((det, idx) => {
              const itemRec = items[idx]
              return (
                <div key={det.id} className="p-3.5 space-y-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-bold text-slate-900">{det.producto?.nombre}</h4>
                      <p className="text-[11px] text-slate-500">
                        SKU: {det.producto?.sku} · Pedido: <strong className="text-slate-700">{det.cantidad_pedida} unid.</strong>
                      </p>
                    </div>
                    <span className="font-bold text-slate-800">{formatBs(det.costo_unitario_bs)} / unid.</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 pt-1">
                    <div>
                      <label className="text-[10px] font-bold uppercase text-slate-400">Cant. Recibida</label>
                      <Input
                        type="number"
                        min="0"
                        value={itemRec?.cantidadRecibida || 0}
                        onChange={(e) => updateItem(idx, 'cantidadRecibida', parseFloat(e.target.value) || 0)}
                        required
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold uppercase text-slate-400">Costo Unit. (Bs.)</label>
                      <Input
                        type="number"
                        step="0.5"
                        min="0"
                        value={itemRec?.costoUnitarioBs || 0}
                        onChange={(e) => updateItem(idx, 'costoUnitarioBs', parseFloat(e.target.value) || 0)}
                        required
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold uppercase text-slate-400">N° Lote (Opcional)</label>
                      <Input
                        value={itemRec?.lote || ''}
                        onChange={(e) => updateItem(idx, 'lote', e.target.value)}
                        placeholder="Ej. L-409"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold uppercase text-slate-400">Vencimiento</label>
                      <Input
                        type="date"
                        value={itemRec?.fechaVencimiento || ''}
                        onChange={(e) => updateItem(idx, 'fechaVencimiento', e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
          <Button type="button" variant="outline" onClick={onClose} disabled={recibiendo}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={recibiendo}>
            {recibiendo ? 'Procesando Entrada...' : 'Confirmar e Ingresar a Inventario'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
