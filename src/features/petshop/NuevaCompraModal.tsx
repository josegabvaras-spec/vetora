import { useState } from 'react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { FieldGroup, Input, Select, Textarea } from '../../components/ui/Field'
import { Plus, Trash2 } from 'lucide-react'
import { crearOrdenCompra, type ItemOrdenCompraInput } from '../../services/compras'
import type { Producto, Proveedor } from '../../types/database'
import { formatBs } from '../../lib/currency'
import { useAuth } from '../../context/useAuth'

interface NuevaCompraModalProps {
  sucursalId: string
  proveedores: Proveedor[]
  productos: Producto[]
  onClose: () => void
  onCreated: () => void
}

export function NuevaCompraModal({
  sucursalId,
  proveedores,
  productos,
  onClose,
  onCreated,
}: NuevaCompraModalProps) {
  const { usuario } = useAuth()
  const [proveedorId, setProveedorId] = useState(proveedores[0]?.id || '')
  // ⚠️ Texto, no número — mismo motivo que en `LoteModal.tsx` y
  // `NuevoProductoModal.tsx`: un `<input type="number">` controlado con
  // estado NUMÉRICO deja un cero pegado en pantalla al escribir encima
  // (React no toca el DOM cuando lo tecleado y el valor anterior son el
  // mismo número, p. ej. "05" y "5"). Con el estado en texto, lo que se ve
  // es exactamente lo que se tecleó.
  const [descuentoBs, setDescuentoBs] = useState('0')
  const [notas, setNotas] = useState('')

  const [items, setItems] = useState<ItemOrdenCompraInput[]>([])

  // Selector de ítem para agregar
  const [productoSeleccionadoId, setProductoSeleccionadoId] = useState('')
  const [cantidadInput, setCantidadInput] = useState('1')
  const [costoInput, setCostoInput] = useState('0')

  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleSeleccionarProducto(prodId: string) {
    setProductoSeleccionadoId(prodId)
    const prod = productos.find((p) => p.id === prodId)
    if (prod) {
      setCostoInput(String(prod.costo_bs || 0))
    }
  }

  function agregarItem() {
    if (!productoSeleccionadoId) return
    const cantidad = Number(cantidadInput)
    if (!Number.isFinite(cantidad) || cantidad <= 0) return

    if (items.some((i) => i.productoId === productoSeleccionadoId)) {
      setError('Este producto ya está en la lista de compra')
      return
    }

    setItems([
      ...items,
      {
        productoId: productoSeleccionadoId,
        cantidadPedida: cantidad,
        costoUnitarioBs: Number(costoInput) || 0,
      },
    ])
    setProductoSeleccionadoId('')
    setCantidadInput('1')
    setCostoInput('0')
    setError(null)
  }

  function quitarItem(idx: number) {
    setItems(items.filter((_, i) => i !== idx))
  }

  const descuentoNumero = Number(descuentoBs) || 0
  const subtotal = items.reduce((acc, i) => acc + i.cantidadPedida * i.costoUnitarioBs, 0)
  const total = Math.max(0, subtotal - descuentoNumero)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    // ⚠️ `ordenes_compra.sucursal_id` es `not null`, sin valor por defecto.
    // Última red antes de tocar la base — el respaldo real va en
    // `PanelCompras.tsx`, que ya no debería dejar pasar un valor vacío.
    if (!sucursalId) {
      setError('No se pudo determinar la sucursal. Elige una sucursal específica arriba y vuelve a intentar.')
      return
    }
    if (!proveedorId) {
      setError('Selecciona un proveedor')
      return
    }
    if (items.length === 0) {
      setError('Agrega al menos un producto a la orden de compra')
      return
    }

    setGuardando(true)
    setError(null)

    try {
      await crearOrdenCompra({
        sucursalId,
        proveedorId,
        descuentoBs: descuentoNumero,
        notas,
        items,
        usuarioId: usuario?.id,
      })

      onCreated()
      onClose()
    } catch (err: any) {
      setError(err.message || 'Error al crear orden de compra')
      setGuardando(false)
    }
  }

  return (
    <Modal onClose={onClose} title="Nueva Orden de Compra a Proveedor" widthClassName="max-w-2xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FieldGroup label="Proveedor">
            <Select value={proveedorId} onChange={(e) => setProveedorId(e.target.value)} required>
              <option value="">Selecciona un proveedor...</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.empresa} {p.contacto ? `(${p.contacto})` : ''}
                </option>
              ))}
            </Select>
          </FieldGroup>

          <FieldGroup label="Descuento Comercial (Bs.)">
            <Input
              type="number"
              step="0.5"
              min="0"
              value={descuentoBs}
              onChange={(e) => setDescuentoBs(e.target.value)}
            />
          </FieldGroup>
        </div>

        {/* Sección de Agregar Ítems */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Agregar Productos a la Orden
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
            <div className="sm:col-span-6">
              <Select
                value={productoSeleccionadoId}
                onChange={(e) => handleSeleccionarProducto(e.target.value)}
              >
                <option value="">Selecciona producto...</option>
                {productos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre} (Stock: {p.stock_actual})
                  </option>
                ))}
              </Select>
            </div>

            <div className="sm:col-span-2">
              <Input
                type="number"
                min="1"
                value={cantidadInput}
                onChange={(e) => setCantidadInput(e.target.value)}
                placeholder="Cant."
              />
            </div>

            <div className="sm:col-span-3">
              <Input
                type="number"
                step="0.5"
                min="0"
                value={costoInput}
                onChange={(e) => setCostoInput(e.target.value)}
                placeholder="Costo unit."
              />
            </div>

            <div className="sm:col-span-1 flex items-center justify-end">
              <Button type="button" variant="primary" size="sm" onClick={agregarItem}>
                <Plus size={15} />
              </Button>
            </div>
          </div>

          {/* Tabla de Ítems */}
          {items.length > 0 && (
            <div className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white overflow-hidden text-xs">
              {items.map((it, idx) => {
                const prod = productos.find((p) => p.id === it.productoId)
                const sub = it.cantidadPedida * it.costoUnitarioBs
                return (
                  <div key={idx} className="flex items-center justify-between p-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-slate-800 truncate">{prod?.nombre || 'Producto'}</p>
                      <p className="text-[11px] text-slate-500">
                        {it.cantidadPedida} unid. × {formatBs(it.costoUnitarioBs)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-slate-900">{formatBs(sub)}</span>
                      <button
                        type="button"
                        onClick={() => quitarItem(idx)}
                        className="text-red-500 hover:text-red-700 p-1"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Resumen Total */}
        <div className="flex items-center justify-between rounded-xl bg-slate-900 text-white p-3.5">
          <div>
            <p className="text-[10px] uppercase font-bold text-slate-400">Total de la Orden</p>
            <p className="text-xl font-black text-teal-400">{formatBs(total)}</p>
          </div>
          <div className="text-right text-xs text-slate-300">
            <p>Subtotal: {formatBs(subtotal)}</p>
            {descuentoNumero > 0 && <p className="text-amber-300">Descuento: -{formatBs(descuentoNumero)}</p>}
          </div>
        </div>

        <FieldGroup label="Notas para el Proveedor / Observaciones">
          <Textarea
            rows={2}
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Entrega urgente, forma de pago acordada, etc."
          />
        </FieldGroup>

        <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
          <Button type="button" variant="outline" onClick={onClose} disabled={guardando}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={guardando || items.length === 0}>
            {guardando ? 'Guardando...' : 'Generar Orden de Compra'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
