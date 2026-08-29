import { useState } from 'react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { FieldGroup, Input, Select, Textarea } from '../../components/ui/Field'
import { useAuth } from '../../context/useAuth'
import { registrarMovimiento } from '../../services/inventario'
import type { TipoMovimientoInventario } from '../../types/database'
import type { ProductoConMovimientos } from '../../types/views'
import { formatBs } from '../../lib/currency'
import { dosisDesdeEnvases, dosisDisponible, formatDosis, formatEnvases } from '../../lib/inventario'

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
      // Aquí se cuentan envases (lo que se compra y se cuenta en el estante),
      // pero el movimiento va en la unidad de medida: es el trigger quien
      // vuelve a dividir para dejar el stock en envases.
      const dosis = dosisDesdeEnvases(cantidad, producto.contenido_presentacion)
      await registrarMovimiento(producto.id, tipo, dosis, motivo.trim(), { usuarioId: usuario?.id })
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
        Stock actual:{' '}
        <span className="font-semibold text-slate-800">
          {formatEnvases(producto.stock_actual)} envases
        </span>{' '}
        ({formatDosis(dosisDisponible(producto))} {producto.unidad_medida}) · Precio:{' '}
        {formatBs(producto.precio_bs)} por {producto.unidad_medida}
      </p>
      <form className="space-y-4" onSubmit={handleSubmit}>
        <FieldGroup label="Tipo de movimiento">
          <Select value={tipo} onChange={(e) => setTipo(e.target.value as TipoMovimientoInventario)}>
            <option value="ingreso">Ingreso (+)</option>
            <option value="egreso">Egreso (-)</option>
          </Select>
        </FieldGroup>
        <FieldGroup label="Cantidad (envases)">
          <Input
            type="number"
            min="0.01"
            step="any"
            value={cantidad}
            onChange={(e) => setCantidad(Number(e.target.value))}
            required
          />
          <p className="mt-1 text-[11px] text-slate-500">
            Equivale a {formatDosis(dosisDesdeEnvases(cantidad, producto.contenido_presentacion))}{' '}
            {producto.unidad_medida} · cada envase trae {producto.contenido_presentacion}{' '}
            {producto.unidad_medida}
          </p>
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
