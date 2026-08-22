import { useState } from 'react'
import { Plus, Package } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { FieldGroup, Input, Select } from '../../components/ui/Field'
import { Seccion } from '../../components/ui/Seccion'
import { useTable } from '../../mocks/useDb'
import { formatBs } from '../../lib/currency'
import { dosisDisponible, formatDosis, formatEnvases } from '../../lib/inventario'
import { SeccionRecetario, type RecetaItemPendiente } from './SeccionRecetario'
import { SeccionEstudios } from './SeccionEstudios'
import type { ProductoUsado } from '../../types/views'
import type { RecetaItem } from '../../types/database'

/**
 * Secciones de Productos y Recetario de la ficha clínica. Funcionan en dos
 * modos según de dónde se llene la ficha:
 *
 * - **Inmediato** (editar una consulta existente): `onAgregar` persiste al instante.
 * - **Diferido** (alta de paciente): el historial aún no existe, así que
 *   `onAgregar` acumula en `pendientes` y el llamador las registra después.
 *
 * La UI es la misma en ambos casos: lo único que cambia es el destino.
 */

export interface ProductoPendiente {
  producto_id: string
  cantidad: number
}

export function SeccionProductos({
  registrados,
  pendientes,
  onAgregar,
  disabled,
  titulo = 'Productos usados en la consulta',
}: {
  registrados: ProductoUsado[]
  pendientes: ProductoPendiente[]
  onAgregar: (p: ProductoPendiente) => Promise<void>
  disabled?: boolean
  /** La internación reutiliza esta sección con su propio encabezado. */
  titulo?: string
}) {
  // `useTable` trae la tabla entera sin filtrar; los dados de baja no se pueden
  // consumir, aunque sigan visibles en el kardex y en los recibos antiguos.
  const productos = useTable('productos').filter((p) => p.activo)
  const [productoId, setProductoId] = useState('')
  const [cantidad, setCantidad] = useState('1')
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  // La cantidad se expresa en la unidad del producto, no en envases: de un
  // frasco de 50 ml se consumen los 5 ml que se aplicaron, y el stock baja esos
  // 5. Sin enseñar la unidad junto al campo, un "5" es ambiguo y se acaba
  // descontando el envase entero.
  const productoElegido = productos.find((p) => p.id === productoId)
  const unidad = productoElegido?.unidad_medida ?? ''

  const vacio = registrados.length === 0 && pendientes.length === 0

  async function agregar() {
    setError(null)
    setGuardando(true)
    try {
      await onAgregar({ producto_id: productoId, cantidad: Number(cantidad) })
      setCantidad('1')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar el producto')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Seccion titulo={titulo} icono={<Package size={13} className="text-teal-600" />}>
      {vacio ? (
        <p className="text-xs text-slate-400">Ninguno registrado.</p>
      ) : (
        <ul className="space-y-1 text-xs text-slate-700">
          {registrados.map((p) => (
            <li key={p.movimiento_id} className="flex justify-between gap-2">
              <span className="font-medium">
                {p.nombre} <span className="text-slate-400">{p.cantidad} {p.unidad_medida}</span>
              </span>
              <span className="text-slate-500">{formatBs(p.precio_bs * p.cantidad)}</span>
            </li>
          ))}
          {pendientes.map((p, i) => {
            const producto = productos.find((x) => x.id === p.producto_id)
            return (
              <li key={`pendiente-${i}`} className="flex justify-between gap-2">
                <span className="font-medium">
                  {producto?.nombre ?? 'Producto'} <span className="text-slate-400">{p.cantidad} {producto?.unidad_medida ?? ''}</span>
                </span>
                <span className="text-slate-500">{formatBs((producto?.precio_bs ?? 0) * p.cantidad)}</span>
              </li>
            )
          })}
        </ul>
      )}

      {!disabled && (
        <div className="flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-end">
          <div className="flex-1">
            <FieldGroup label="Producto">
              <Select value={productoId} onChange={(e) => setProductoId(e.target.value)}>
                <option value="">Selecciona un producto…</option>
                {productos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre} (quedan: {formatDosis(dosisDisponible(p))} {p.unidad_medida})
                  </option>
                ))}
              </Select>
              {productoElegido && (
                <p className="mt-1 text-[11px] text-slate-500">
                  Envase de {productoElegido.contenido_presentacion} {unidad} ·{' '}
                  {formatEnvases(productoElegido.stock_actual)} envases ={' '}
                  {formatDosis(dosisDisponible(productoElegido))} {unidad} disponibles
                </p>
              )}
            </FieldGroup>
          </div>
          <div className="sm:w-32">
            <FieldGroup label={unidad ? `Cantidad (${unidad})` : 'Cantidad'}>
              <Input
                type="number"
                min="0.01"
                step="any"
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
              />
            </FieldGroup>
          </div>
          <Button variant="secondary" onClick={agregar} disabled={!productoId || guardando}>
            <Plus size={14} /> Agregar
          </Button>
        </div>
      )}
      {error && <p className="text-xs font-bold text-rose-600">{error}</p>}
    </Seccion>
  )
}

/** Las secciones de la ficha clínica, tal como se muestran dentro de la consulta. */
/**
 * Vacunas y desparasitaciones ya no se piden aquí: viven en el esquema
 * sanitario de la ficha del paciente (migración 0014). Una dosis no depende de
 * que ese día se abriera una consulta —hay vacunas que llegan puestas de otra
 * clínica, y visitas rápidas sin historial—, y tenerlas en dos sitios obligaba
 * a elegir uno como el bueno.
 */
export function SeccionesConsulta(props: {
  productos: ProductoUsado[]
  productosPendientes: ProductoPendiente[]
  onAgregarProducto: (p: ProductoPendiente) => Promise<void>
  receta: RecetaItem[]
  recetaPendientes: RecetaItemPendiente[]
  onAgregarRecetaItem: (item: RecetaItemPendiente) => Promise<void>
  onEliminarRecetaItem?: (id: string) => Promise<void>
  /**
   * Consulta y paciente a los que adjuntar los estudios de imagen. Faltan en el
   * alta de paciente, donde el historial todavía no existe: un estudio necesita
   * `historial_id`, así que allí la sección no se monta.
   */
  historialId?: string
  pacienteId?: string
  disabled?: boolean
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <SeccionProductos
        registrados={props.productos}
        pendientes={props.productosPendientes}
        onAgregar={props.onAgregarProducto}
        disabled={props.disabled}
      />
      <SeccionRecetario
        registrados={props.receta}
        pendientes={props.recetaPendientes}
        onEliminar={props.onEliminarRecetaItem}
        disabled={props.disabled}
      />
      {props.historialId && props.pacienteId && (
        <SeccionEstudios
          historialId={props.historialId}
          pacienteId={props.pacienteId}
          disabled={props.disabled}
        />
      )}
    </div>
  )
}
