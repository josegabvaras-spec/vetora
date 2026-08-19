import { useState } from 'react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { FieldGroup, Input, Select, Textarea } from '../../components/ui/Field'
import { useAuth } from '../../context/AuthContext'
import { registrarMovimiento } from '../../services/inventario'
import type { TipoMovimientoInventario } from '../../types/database'
import type { ProductoConMovimientos } from '../../types/views'
import { formatBs } from '../../lib/currency'

export function AjustarStockModal({
  producto,
  onClose,
  onUpdated,
}: {
  producto: ProductoConMovimientos
  onClose: () => void
  onUpdated: () => void
}) {
  const { usuario } = useAuth()
  const [tipo, setTipo] = useState<TipoMovimientoInventario>('ingreso')
  const [cantidad, setCantidad] = useState(1)
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setEnviando(true)
    setError(null)
    try {
      await registrarMovimiento(producto.id, tipo, cantidad, motivo.trim(), { usuarioId: usuario?.id })
      onUpdated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar el movimiento')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Modal title={`Ajustar stock — ${producto.nombre}`} onClose={onClose}>
      <p className="mb-4 text-sm text-slate-500">
        Stock actual: <span className="font-semibold text-slate-800">{producto.stock_actual} {producto.unidad_medida}</span> · Precio:{' '}
        {formatBs(producto.precio_bs)}
      </p>
      <form className="space-y-4" onSubmit={handleSubmit}>
        <FieldGroup label="Tipo de movimiento">
          <Select value={tipo} onChange={(e) => setTipo(e.target.value as TipoMovimientoInventario)}>
            <option value="ingreso">Ingreso (+)</option>
            <option value="egreso">Egreso (-)</option>
          </Select>
        </FieldGroup>
        <FieldGroup label="Cantidad">
          <Input
            type="number"
            min="0.01"
            step="any"
            value={cantidad}
            onChange={(e) => setCantidad(Number(e.target.value))}
            required
          />
        </FieldGroup>
        <FieldGroup label="Motivo">
          <Textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ej. Compra a proveedor, aplicación en consulta, ajuste por vencimiento…"
            required
          />
        </FieldGroup>

        {error && <p className="text-sm text-rose-600">{error}</p>}

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={enviando}>
            {enviando ? 'Guardando…' : 'Registrar movimiento'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
