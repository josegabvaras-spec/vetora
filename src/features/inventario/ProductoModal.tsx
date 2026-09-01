import { useEffect, useState } from 'react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { FieldGroup, Input, Select } from '../../components/ui/Field'
import { actualizarProducto, crearProducto, type DatosProducto } from '../../services/inventario'
import { listProveedores } from '../../services/compras'
import { useTable } from '../../mocks/useDb'
import type { Producto, Proveedor } from '../../types/database'

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

  // Compra y trazabilidad: columnas que `0030` añadió a `productos` para toda
  // clínica y que este formulario ignoraba. Sin el costo no hay margen en
  // ninguna pantalla; sin el código de barras no hay nada que escanear en la
  // venta de medicamentos.
  const [costo, setCosto] = useState(producto?.costo_bs != null ? String(producto.costo_bs) : '')
  const [codigoBarras, setCodigoBarras] = useState(producto?.codigo_barras ?? '')
  const [marca, setMarca] = useState(producto?.marca ?? '')
  const [proveedorId, setProveedorId] = useState(producto?.proveedor_id ?? '')
  const [requiereLote, setRequiereLote] = useState(producto?.requiere_lote ?? false)

  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  useEffect(() => {
    // Sin `catch`: quedarse sin la lista deja el desplegable vacío, que es
    // molesto pero no impide dar de alta el producto — el proveedor es opcional.
    listProveedores().then(setProveedores).catch(() => setProveedores([]))
  }, [])

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
      costo_bs: costo.trim() === '' ? 0 : Number(costo),
      codigo_barras: codigoBarras,
      marca,
      proveedor_id: proveedorId || null,
      requiere_lote: requiereLote,
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
          {/* El precio es por unidad de medida y el stock en envases: son
              magnitudes distintas y confundirlas descuadra la caja o el
              inventario, así que cada campo lo dice en su etiqueta. */}
          <FieldGroup label={`Precio por ${unidadMedida} (Bs.)`}>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={precio}
              onChange={(e) => setPrecio(e.target.value)}
              required
            />
          </FieldGroup>
          <FieldGroup label="Stock mínimo (envases)">
            <Input type="number" step="any" min="0" value={stockMinimo} onChange={(e) => setStockMinimo(e.target.value)} />
          </FieldGroup>
          {!producto && (
            <FieldGroup label="Stock inicial (envases)">
              <Input type="number" step="any" min="0" value={stockInicial} onChange={(e) => setStockInicial(e.target.value)} />
            </FieldGroup>
          )}
        </div>

        <p className="text-xs text-slate-500">
          El stock se cuenta en <strong>envases</strong> y el precio va <strong>por {unidadMedida}</strong>. De un
          envase de {contenido || '1'} {unidadMedida}, aplicar una dosis descuenta la fracción que corresponda.
        </p>

        {/* Compra y trazabilidad. Todo opcional: dar de alta un fármaco a
            vuelapluma sigue siendo nombre, precio y presentación. */}
        <div className="space-y-4 border-t border-slate-200 pt-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Compra y trazabilidad (opcional)
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <FieldGroup label="Costo de compra (Bs.)">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={costo}
                onChange={(e) => setCosto(e.target.value)}
                placeholder="0.00"
              />
            </FieldGroup>
            <FieldGroup label="Código de barras">
              <Input
                value={codigoBarras}
                onChange={(e) => setCodigoBarras(e.target.value)}
                placeholder="Escanéalo aquí"
              />
            </FieldGroup>
            <FieldGroup label="Laboratorio / marca">
              <Input value={marca} onChange={(e) => setMarca(e.target.value)} />
            </FieldGroup>
            <FieldGroup label="Proveedor">
              <Select value={proveedorId} onChange={(e) => setProveedorId(e.target.value)}>
                <option value="">Sin proveedor</option>
                {proveedores.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.empresa}
                  </option>
                ))}
              </Select>
            </FieldGroup>
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={requiereLote}
              onChange={(e) => setRequiereLote(e.target.checked)}
              className="rounded text-teal-600 focus:ring-teal-500"
            />
            <span>Se le llevan lotes con fecha de vencimiento</span>
          </label>

          <p className="text-xs text-slate-500">
            El costo es interno: sirve para el margen y <strong>nunca</strong> se muestra al dueño de
            la mascota. El código de barras es lo que se escanea en «Venta de Medicamentos».
          </p>
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
