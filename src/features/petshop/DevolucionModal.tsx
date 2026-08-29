import { useState } from 'react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { FieldGroup, Input, Select, Textarea } from '../../components/ui/Field'
import {
  ESTADO_DEVOLUCION_LABEL,
  procesarDevolucion,
} from '../../services/devoluciones'
import type { EstadoProductoDevolucion, Producto } from '../../types/database'
import { formatBs } from '../../lib/currency'
import { useAuth } from '../../context/AuthContext'

interface DevolucionModalProps {
  sucursalId: string
  productos: Producto[]
  cobroId?: string
  productoPreseleccionado?: Producto
  onClose: () => void
  onProcessed: () => void
}

export function DevolucionModal({
  sucursalId,
  productos,
  cobroId,
  productoPreseleccionado,
  onClose,
  onProcessed,
}: DevolucionModalProps) {
  const { usuario } = useAuth()
  const [productoId, setProductoId] = useState(productoPreseleccionado?.id || '')
  const [cantidad, setCantidad] = useState<number>(1)
  const [motivo, setMotivo] = useState('')
  const [estadoProducto, setEstadoProducto] = useState<EstadoProductoDevolucion>('reintegrable')
  const [montoDevueltoBs, setMontoDevueltoBs] = useState<number>(
    productoPreseleccionado?.precio_bs || 0,
  )

  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleSeleccionarProducto(pId: string) {
    setProductoId(pId)
    const prod = productos.find((p) => p.id === pId)
    if (prod) {
      setMontoDevueltoBs(prod.precio_bs * cantidad)
    }
  }

  function handleCantidadChange(cant: number) {
    setCantidad(cant)
    const prod = productos.find((p) => p.id === productoId)
    if (prod) {
      setMontoDevueltoBs(prod.precio_bs * cant)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!productoId) {
      setError('Selecciona el producto a devolver')
      return
    }
    if (!motivo.trim()) {
      setError('Ingresa el motivo de la devolución')
      return
    }

    setGuardando(true)
    setError(null)

    try {
      await procesarDevolucion({
        sucursalId,
        cobroId,
        productoId,
        cantidad,
        motivo,
        estadoProducto,
        montoDevueltoBs,
        usuarioId: usuario?.id,
      })

      onProcessed()
      onClose()
    } catch (err: any) {
      setError(err.message || 'Error al procesar devolución')
      setGuardando(false)
    }
  }

  return (
    <Modal onClose={onClose} title="Procesar Devolución de Producto" widthClassName="max-w-lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
            {error}
          </div>
        )}

        <FieldGroup label="Producto">
          <Select
            value={productoId}
            onChange={(e) => handleSeleccionarProducto(e.target.value)}
            disabled={Boolean(productoPreseleccionado)}
            required
          >
            <option value="">Selecciona un producto...</option>
            {productos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre} ({formatBs(p.precio_bs)})
              </option>
            ))}
          </Select>
        </FieldGroup>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FieldGroup label="Cantidad a Devolver">
            <Input
              type="number"
              step="0.01"
              min="0.01"
              value={cantidad}
              onChange={(e) => handleCantidadChange(parseFloat(e.target.value) || 1)}
              required
            />
          </FieldGroup>

          <FieldGroup label="Monto a Reintegrar (Bs.)">
            <Input
              type="number"
              step="0.5"
              min="0"
              value={montoDevueltoBs}
              onChange={(e) => setMontoDevueltoBs(parseFloat(e.target.value) || 0)}
              required
            />
          </FieldGroup>
        </div>

        <FieldGroup label="Estado Físico del Producto">
          <Select
            value={estadoProducto}
            onChange={(e) => setEstadoProducto(e.target.value as EstadoProductoDevolucion)}
            required
          >
            {Object.entries(ESTADO_DEVOLUCION_LABEL).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
        </FieldGroup>

        <FieldGroup label="Motivo de la Devolución">
          <Textarea
            rows={2}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Producto vencido, cambio de talla, cliente insatisfecho..."
            required
          />
        </FieldGroup>

        <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
          <Button type="button" variant="outline" onClick={onClose} disabled={guardando}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={guardando}>
            {guardando ? 'Procesando...' : 'Confirmar Devolución'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
