import { useState } from 'react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { FieldGroup, Input, Select } from '../../components/ui/Field'
import { crearLote } from '../../services/petshop'
import type { Producto, Proveedor } from '../../types/database'

interface LoteModalProps {
  sucursalId: string
  productos: Producto[]
  proveedores: Proveedor[]
  productoPreseleccionadoId?: string
  onClose: () => void
  onSaved: () => void
}

export function LoteModal({
  sucursalId,
  productos,
  proveedores,
  productoPreseleccionadoId,
  onClose,
  onSaved,
}: LoteModalProps) {
  const [productoId, setProductoId] = useState(productoPreseleccionadoId || '')
  const [numeroLote, setNumeroLote] = useState('')
  const [fechaVencimiento, setFechaVencimiento] = useState('')
  const [cantidad, setCantidad] = useState<number>(1)
  const [costoUnitarioBs, setCostoUnitarioBs] = useState<number>(0)
  const [proveedorId, setProveedorId] = useState('')

  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!productoId) {
      setError('Selecciona un producto')
      return
    }
    if (!numeroLote.trim()) {
      setError('Ingresa el número o código de lote')
      return
    }
    if (!fechaVencimiento) {
      setError('Ingresa la fecha de vencimiento')
      return
    }

    setGuardando(true)
    setError(null)

    try {
      await crearLote({
        sucursalId,
        productoId,
        numeroLote,
        fechaVencimiento,
        cantidad,
        costoUnitarioBs,
        proveedorId: proveedorId || undefined,
      })

      onSaved()
      onClose()
    } catch (err: any) {
      setError(err.message || 'Error al registrar lote')
      setGuardando(false)
    }
  }

  return (
    <Modal onClose={onClose} title="Registrar Lote y Vencimiento" widthClassName="max-w-lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
            {error}
          </div>
        )}

        <FieldGroup label="Producto">
          <Select
            value={productoId}
            onChange={(e) => setProductoId(e.target.value)}
            disabled={Boolean(productoPreseleccionadoId)}
            required
          >
            <option value="">Selecciona un producto...</option>
            {productos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre} (SKU: {p.sku})
              </option>
            ))}
          </Select>
        </FieldGroup>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FieldGroup label="Número / Código de Lote">
            <Input
              value={numeroLote}
              onChange={(e) => setNumeroLote(e.target.value)}
              placeholder="Ej. LOT-2026-X8"
              required
            />
          </FieldGroup>

          <FieldGroup label="Fecha de Vencimiento">
            <Input
              type="date"
              value={fechaVencimiento}
              onChange={(e) => setFechaVencimiento(e.target.value)}
              required
            />
          </FieldGroup>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FieldGroup label="Cantidad de Envases / Unidades">
            <Input
              type="number"
              step="0.01"
              min="0.01"
              value={cantidad}
              onChange={(e) => setCantidad(parseFloat(e.target.value) || 0)}
              required
            />
          </FieldGroup>

          <FieldGroup label="Costo Unitario (Bs.)">
            <Input
              type="number"
              step="0.5"
              min="0"
              value={costoUnitarioBs}
              onChange={(e) => setCostoUnitarioBs(parseFloat(e.target.value) || 0)}
            />
          </FieldGroup>
        </div>

        <FieldGroup label="Proveedor de Origen">
          <Select value={proveedorId} onChange={(e) => setProveedorId(e.target.value)}>
            <option value="">Sin proveedor asignado</option>
            {proveedores.map((p) => (
              <option key={p.id} value={p.id}>
                {p.empresa}
              </option>
            ))}
          </Select>
        </FieldGroup>

        <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
          <Button type="button" variant="outline" onClick={onClose} disabled={guardando}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={guardando}>
            {guardando ? 'Guardando...' : 'Registrar Lote'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
