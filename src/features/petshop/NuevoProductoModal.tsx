import { useState } from 'react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { FieldGroup, Input, Select } from '../../components/ui/Field'
import {
  CATEGORIAS_RETAIL,
  crearProductoPetshop,
  actualizarProductoPetshop,
} from '../../services/petshop'
import type { CategoriaRetail, Proveedor } from '../../types/database'
import type { ProductoConLotes } from '../../types/views'
import { formatBs } from '../../lib/currency'

interface NuevoProductoModalProps {
  sucursalId: string
  proveedores: Proveedor[]
  productoAEditar?: ProductoConLotes | null
  onClose: () => void
  onSaved: () => void
}

export function NuevoProductoModal({
  sucursalId,
  proveedores,
  productoAEditar,
  onClose,
  onSaved,
}: NuevoProductoModalProps) {
  const [sku, setSku] = useState(productoAEditar?.sku || '')
  const [codigoBarras, setCodigoBarras] = useState(productoAEditar?.codigo_barras || '')
  const [nombre, setNombre] = useState(productoAEditar?.nombre || '')
  const [categoriaRetail, setCategoriaRetail] = useState<CategoriaRetail>(
    (productoAEditar?.categoria_retail as CategoriaRetail) || 'alimento',
  )
  const [marca, setMarca] = useState(productoAEditar?.marca || '')
  const [ubicacion, setUbicacion] = useState(productoAEditar?.ubicacion || '')
  const [presentacion, setPresentacion] = useState(productoAEditar?.presentacion || 'Unidad')
  const [unidadMedida, setUnidadMedida] = useState(productoAEditar?.unidad_medida || 'unidad')
  // ⚠️ Los seis campos numéricos van en texto, no en número — mismo motivo
  // que en `LoteModal.tsx`: un `<input type="number">` controlado con estado
  // NUMÉRICO deja un cero pegado en pantalla al escribir encima (React no
  // toca el DOM cuando el valor tecleado y el anterior son el mismo número,
  // p. ej. "05" y "5"). Con el estado en texto, lo que se ve es exactamente
  // lo que se tecleó.
  const [contenidoPresentacion, setContenidoPresentacion] = useState(
    String(productoAEditar?.contenido_presentacion || 1),
  )
  const [costoBs, setCostoBs] = useState(String(productoAEditar?.costo_bs || 0))
  const [precioBs, setPrecioBs] = useState(String(productoAEditar?.precio_bs || 0))
  const [stockMinimo, setStockMinimo] = useState(String(productoAEditar?.stock_minimo || 3))
  const [stockMaximo, setStockMaximo] = useState(String(productoAEditar?.stock_maximo || 50))
  const [stockInicial, setStockInicial] = useState('0')
  const [proveedorId, setProveedorId] = useState(productoAEditar?.proveedor_id || '')
  const [requiereLote, setRequiereLote] = useState(productoAEditar?.requiere_lote || false)

  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Solo para el resumen de margen en pantalla: se lee tal cual se teclea,
  // sin esperar al submit.
  const precioNumero = Number(precioBs) || 0
  const costoNumero = Number(costoBs) || 0
  const gananciaBs = Math.max(0, precioNumero - costoNumero)
  const margenPct = precioNumero > 0 ? (gananciaBs / precioNumero) * 100 : 0

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setGuardando(true)
    setError(null)

    // Los seis campos numéricos se convierten aquí, una sola vez, no en cada
    // tecla — mismo criterio que `LoteModal.tsx`.
    const datosNumericos = {
      contenidoPresentacion: Number(contenidoPresentacion) || 1,
      costoBs: Number(costoBs) || 0,
      precioBs: Number(precioBs) || 0,
      stockMinimo: Number(stockMinimo) || 0,
      stockMaximo: Number(stockMaximo) || 0,
    }

    try {
      if (productoAEditar) {
        await actualizarProductoPetshop(productoAEditar.id, {
          sku,
          codigoBarras: codigoBarras || undefined,
          nombre,
          categoriaRetail,
          marca,
          ubicacion,
          presentacion,
          unidadMedida,
          ...datosNumericos,
          proveedorId: proveedorId || undefined,
          requiereLote,
        })
      } else {
        await crearProductoPetshop(sucursalId, {
          sku,
          codigoBarras: codigoBarras || undefined,
          nombre,
          categoriaRetail,
          marca,
          ubicacion,
          presentacion,
          unidadMedida,
          ...datosNumericos,
          stockInicial: Number(stockInicial) || 0,
          proveedorId: proveedorId || undefined,
          requiereLote,
        })
      }

      onSaved()
      onClose()
    } catch (err: any) {
      setError(err.message || 'Error al guardar el producto')
      setGuardando(false)
    }
  }

  return (
    <Modal
      onClose={onClose}
      title={productoAEditar ? 'Editar Producto Pet Shop' : 'Nuevo Producto Pet Shop'}
      widthClassName="max-w-2xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FieldGroup label="SKU / Código Interno">
            <Input
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              placeholder="Ej. ALI-DOG-001"
              required
            />
          </FieldGroup>

          <FieldGroup label="Código de Barras (EAN/UPC)">
            <Input
              value={codigoBarras}
              onChange={(e) => setCodigoBarras(e.target.value)}
              placeholder="Escanea o escribe el código..."
            />
          </FieldGroup>
        </div>

        <FieldGroup label="Nombre del Producto">
          <Input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej. Alimento Premium Cachorros 3kg"
            required
          />
        </FieldGroup>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <FieldGroup label="Categoría Retail">
            <Select
              value={categoriaRetail}
              onChange={(e) => setCategoriaRetail(e.target.value as CategoriaRetail)}
              required
            >
              {CATEGORIAS_RETAIL.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </Select>
          </FieldGroup>

          <FieldGroup label="Marca / Fabricante">
            <Input
              value={marca}
              onChange={(e) => setMarca(e.target.value)}
              placeholder="Ej. ProPlan, Pedigree..."
            />
          </FieldGroup>

          <FieldGroup label="Ubicación en Tienda / Estante">
            <Input
              value={ubicacion}
              onChange={(e) => setUbicacion(e.target.value)}
              placeholder="Ej. Pasillo 2, Estante B"
            />
          </FieldGroup>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <FieldGroup label="Presentación">
            <Input
              value={presentacion}
              onChange={(e) => setPresentacion(e.target.value)}
              placeholder="Ej. Bolsa 3kg, Frasco 100ml"
              required
            />
          </FieldGroup>

          <FieldGroup label="Unidad de Medida">
            <Input
              value={unidadMedida}
              onChange={(e) => setUnidadMedida(e.target.value)}
              placeholder="Ej. unidad, kg, ml"
              required
            />
          </FieldGroup>

          <FieldGroup label="Contenido por Envase">
            <Input
              type="number"
              step="0.01"
              min="0.01"
              value={contenidoPresentacion}
              onChange={(e) => setContenidoPresentacion(e.target.value)}
              required
            />
          </FieldGroup>
        </div>

        {/* Precios y Margen */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <FieldGroup label="Costo Unitario (Bs.)">
              <Input
                type="number"
                step="0.5"
                min="0"
                value={costoBs}
                onChange={(e) => setCostoBs(e.target.value)}
                required
              />
            </FieldGroup>

            <FieldGroup label="Precio de Venta (Bs.)">
              <Input
                type="number"
                step="0.5"
                min="0"
                value={precioBs}
                onChange={(e) => setPrecioBs(e.target.value)}
                required
              />
            </FieldGroup>

            <div className="flex flex-col justify-center rounded-lg bg-white p-2.5 border border-slate-200 text-xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Margen Estimado</span>
              <p className="text-base font-black text-teal-800">
                {formatBs(gananciaBs)} ({margenPct.toFixed(1)}%)
              </p>
            </div>
          </div>
        </div>

        {/* Stock y Proveedor */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <FieldGroup label="Stock Mínimo (Alerta)">
            <Input
              type="number"
              min="0"
              value={stockMinimo}
              onChange={(e) => setStockMinimo(e.target.value)}
              required
            />
          </FieldGroup>

          <FieldGroup label="Stock Máximo Deseado">
            <Input
              type="number"
              min="1"
              value={stockMaximo}
              onChange={(e) => setStockMaximo(e.target.value)}
              required
            />
          </FieldGroup>

          {!productoAEditar && (
            <FieldGroup label="Stock Inicial (Unidades)">
              <Input
                type="number"
                min="0"
                value={stockInicial}
                onChange={(e) => setStockInicial(e.target.value)}
              />
            </FieldGroup>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FieldGroup label="Proveedor Habitual">
            <Select value={proveedorId} onChange={(e) => setProveedorId(e.target.value)}>
              <option value="">Sin proveedor asignado</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.empresa} {p.contacto ? `(${p.contacto})` : ''}
                </option>
              ))}
            </Select>
          </FieldGroup>

          <div className="flex items-center pt-6">
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={requiereLote}
                onChange={(e) => setRequiereLote(e.target.checked)}
                className="rounded text-teal-600 focus:ring-teal-500"
              />
              <span>Control obligatorio de Lote y Fecha de Vencimiento</span>
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
          <Button type="button" variant="outline" onClick={onClose} disabled={guardando}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={guardando}>
            {guardando ? 'Guardando...' : productoAEditar ? 'Guardar Cambios' : 'Crear Producto'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
