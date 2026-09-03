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
  // ⚠️ Texto, no número. Un `<input type="number">` controlado con estado
  // NUMÉRICO tiene un efecto conocido de React: si lo que se acaba de teclear
  // y el valor anterior son el mismo número (`"05"` y `"5"` son los dos un 5),
  // React no toca el DOM para no interrumpir la escritura de un decimal a
  // medias — y el "0" que ya estaba se queda pegado en pantalla aunque el
  // estado interno ya diga 5. Con el estado en texto, lo que se ve es
  // exactamente lo que se tecleó, sin ese redondeo de por medio.
  const [cantidad, setCantidad] = useState('1')
  const [costoUnitarioBs, setCostoUnitarioBs] = useState('0')
  const [proveedorId, setProveedorId] = useState('')

  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    // ⚠️ `producto_lotes.sucursal_id` es `not null`, sin valor por defecto.
    // Sin esta comprobación, un `sucursalId` vacío —el admin viendo «todas las
    // sucursales» sin que quien invoca el modal le pusiera un respaldo—
    // llegaba tal cual al insert y Postgres lo rechazaba con un 400 en bruto
    // («invalid input syntax for type uuid»). Esto no reemplaza el respaldo
    // de quien abre el modal (`PanelLotes.tsx`): es la última red antes de
    // tocar la base.
    if (!sucursalId) {
      setError('No se pudo determinar la sucursal. Elige una sucursal específica arriba y vuelve a intentar.')
      return
    }
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
    const cantidadNumero = Number(cantidad)
    // ⚠️ La base exige `cantidad_inicial > 0` (check de `producto_lotes`).
    // Sin esta comprobación, un campo que quedó en 0 —justo lo que el bug
    // del cero pegado facilitaba— llegaba hasta el insert y volvía como un
    // 400 en bruto, sin decir por qué.
    if (!Number.isFinite(cantidadNumero) || cantidadNumero <= 0) {
      setError('La cantidad tiene que ser mayor a cero')
      return
    }
    const costoNumero = Number(costoUnitarioBs)
    if (!Number.isFinite(costoNumero) || costoNumero < 0) {
      setError('El costo unitario no puede ser negativo')
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
        cantidad: cantidadNumero,
        costoUnitarioBs: costoNumero,
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
              onChange={(e) => setCantidad(e.target.value)}
              required
            />
          </FieldGroup>

          <FieldGroup label="Costo Unitario (Bs.)">
            <Input
              type="number"
              step="0.5"
              min="0"
              value={costoUnitarioBs}
              onChange={(e) => setCostoUnitarioBs(e.target.value)}
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
