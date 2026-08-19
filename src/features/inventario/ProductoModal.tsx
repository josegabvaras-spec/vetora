import { useState } from 'react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { FieldGroup, Input, Select } from '../../components/ui/Field'
import { actualizarProducto, crearProducto, type DatosProducto } from '../../services/inventario'
import { useTable } from '../../mocks/useDb'
import type { Producto } from '../../types/database'

/**
 * Alta y edición de productos del inventario (solo administrador).
 * En alta, el stock inicial se registra como movimiento de ingreso para que
 * quede rastro en la bitácora; al editar, el stock no se toca aquí (para eso
 * está "Ajustar stock", que exige un motivo).
 */
export function ProductoModal({
  producto,
  sucursalIdPorDefecto,
  onClose,
  onGuardado,
}: {
  producto: Producto | null
  sucursalIdPorDefecto: string
  onClose: () => void
  onGuardado: () => void
}) {
  const sucursales = useTable('sucursales')

  const [sucursalId, setSucursalId] = useState(producto?.sucursal_id ?? sucursalIdPorDefecto)
  const [sku, setSku] = useState(producto?.sku ?? '')
  const [nombre, setNombre] = useState(producto?.nombre ?? '')
  const [presentacion, setPresentacion] = useState(producto?.presentacion ?? '')
  const [composicion, setComposicion] = useState(producto?.composicion ?? '')
  const [unidadMedida, setUnidadMedida] = useState(producto?.unidad_medida ?? 'unidad')
  const [contenido, setContenido] = useState(producto ? String(producto.contenido_presentacion) : '1')
  const [precio, setPrecio] = useState(producto ? String(producto.precio_bs) : '')
  const [stockMinimo, setStockMinimo] = useState(producto ? String(producto.stock_minimo) : '3')
  const [stockInicial, setStockInicial] = useState('0')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setGuardando(true)
    setError(null)
    const datos: DatosProducto = {
      sku,
      nombre,
      presentacion,
      composicion,
      unidad_medida: unidadMedida,
      contenido_presentacion: Number(contenido),
      precio_bs: Number(precio),
      stock_minimo: Number(stockMinimo),
    }
    try {
      if (producto) await actualizarProducto(producto.id, datos)
      else await crearProducto(sucursalId, datos, Number(stockInicial))
      onGuardado()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el producto')
      setGuardando(false)
    }
  }

  return (
    <Modal title={producto ? 'Editar producto' : 'Nuevo producto'} onClose={onClose}>
      <form className="space-y-4" onSubmit={handleSubmit}>
        {!producto && (
          <FieldGroup label="Sucursal">
            <Select value={sucursalId} onChange={(e) => setSucursalId(e.target.value)}>
              {sucursales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </Select>
          </FieldGroup>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <FieldGroup label="SKU / Código">
            <Input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="Ej. VAC-ANTI-001" required />
          </FieldGroup>
          <div className="sm:col-span-2">
            <FieldGroup label="Nombre del producto">
              <Input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej. Vacuna Antirrábica"
                required
              />
            </FieldGroup>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FieldGroup label="Presentación">
            <Input value={presentacion} onChange={(e) => setPresentacion(e.target.value)} placeholder="Ej. Frasco, Blíster" />
          </FieldGroup>
          <FieldGroup label="Composición">
            <Input value={composicion} onChange={(e) => setComposicion(e.target.value)} placeholder="Ej. Ivermectina 1%" />
          </FieldGroup>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <FieldGroup label="Unidad de medida">
            <Select value={unidadMedida} onChange={(e) => setUnidadMedida(e.target.value)}>
              <option value="unidad">Unidad</option>
              <option value="ml">Mililitros (ml)</option>
              <option value="mg">Miligramos (mg)</option>
              <option value="gr">Gramos (gr)</option>
              <option value="comprimido">Comprimidos</option>
            </Select>
          </FieldGroup>
          <FieldGroup label="Contenido total">
            <Input
              type="number"
              min="0.01"
              step="any"
              value={contenido}
              onChange={(e) => setContenido(e.target.value)}
              required
            />
          </FieldGroup>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <FieldGroup label="Precio (Bs.)">
            <Input
              type="number"
              min="0"
              step="0.01"
              value={precio}
              onChange={(e) => setPrecio(e.target.value)}
              required
            />
          </FieldGroup>
          <FieldGroup label="Stock mínimo">
            <Input type="number" step="any" min="0" value={stockMinimo} onChange={(e) => setStockMinimo(e.target.value)} />
          </FieldGroup>
          {!producto && (
            <FieldGroup label="Stock inicial">
              <Input type="number" step="any" min="0" value={stockInicial} onChange={(e) => setStockInicial(e.target.value)} />
            </FieldGroup>
          )}
        </div>

        {!producto && (
          <p className="text-xs text-slate-500">
            El stock inicial se registra como un movimiento de ingreso, así queda en la bitácora de movimientos.
          </p>
        )}

        {error && <p className="text-sm text-rose-600">{error}</p>}

        <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
