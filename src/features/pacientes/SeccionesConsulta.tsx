import { useState } from 'react'
import { Plus, Syringe, Package, Bug } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { FieldGroup, Input, Select } from '../../components/ui/Field'
import { Seccion } from '../../components/ui/Seccion'
import { useTable } from '../../mocks/useDb'
import { formatBs } from '../../lib/currency'
// Son columnas `date`: `desdeFechaSola` las ancla al mediodía para que no se
// desplacen un día al formatearlas, y `formatClinicDate` las deja en dd/MM/yyyy
// en vez del ISO crudo que se imprimía en la ficha clínica.
import { desdeFechaSola, formatClinicDate } from '../../lib/datetime'
import { SeccionRecetario, type RecetaItemPendiente } from './SeccionRecetario'
import type { DesparasitacionAplicada, VacunaAplicada, ViaDesparasitacion } from '../../types/database'
import type { ProductoUsado } from '../../types/views'
import type { RecetaItem } from '../../types/database'

/**
 * Secciones de Vacunas y Productos de la ficha clínica. Funcionan en dos modos
 * según de dónde se llene la ficha:
 *
 * - **Inmediato** (editar una consulta existente): `onAgregar` persiste al instante.
 * - **Diferido** (alta de paciente): el historial aún no existe, así que
 *   `onAgregar` acumula en `pendientes` y el llamador las registra después.
 *
 * La UI es la misma en ambos casos: lo único que cambia es el destino.
 */

export interface VacunaPendiente {
  nombre_vacuna: string
  fecha_refuerzo: string | null
}

export interface DesparasitacionPendiente {
  producto: string
  via: ViaDesparasitacion
  fecha_proxima: string | null
}

export interface ProductoPendiente {
  producto_id: string
  cantidad: number
}

const VIA_LABEL: Record<ViaDesparasitacion, string> = {
  oral: 'Oral',
  topica: 'Tópica',
  inyectable: 'Inyectable',
}

export function SeccionVacunas({
  registradas,
  pendientes,
  onAgregar,
  disabled,
}: {
  registradas: VacunaAplicada[]
  pendientes: VacunaPendiente[]
  onAgregar: (v: VacunaPendiente) => Promise<void>
  disabled?: boolean
}) {
  const [nombre, setNombre] = useState('')
  const [fechaRefuerzo, setFechaRefuerzo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  const vacio = registradas.length === 0 && pendientes.length === 0

  async function agregar() {
    setError(null)
    setGuardando(true)
    try {
      await onAgregar({ nombre_vacuna: nombre.trim(), fecha_refuerzo: fechaRefuerzo || null })
      setNombre('')
      setFechaRefuerzo('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar la vacuna')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Seccion titulo="Vacunas aplicadas" icono={<Syringe size={13} className="text-teal-600" />}>
      {vacio ? (
        <p className="text-xs text-slate-400">Ninguna en esta consulta.</p>
      ) : (
        <ul className="space-y-1 text-xs text-slate-700">
          {registradas.map((v) => (
            <li key={v.id} className="flex justify-between gap-2">
              <span className="font-medium">{v.nombre_vacuna}</span>
              <span className="text-slate-500">
                {v.fecha_refuerzo ? `Refuerzo: ${formatClinicDate(desdeFechaSola(v.fecha_refuerzo))}` : 'Sin refuerzo programado'}
              </span>
            </li>
          ))}
          {pendientes.map((v, i) => (
            <li key={`pendiente-${i}`} className="flex justify-between gap-2">
              <span className="font-medium">{v.nombre_vacuna}</span>
              <span className="text-slate-500">
                {v.fecha_refuerzo ? `Refuerzo: ${formatClinicDate(desdeFechaSola(v.fecha_refuerzo))}` : 'Sin refuerzo programado'}
              </span>
            </li>
          ))}
        </ul>
      )}

      {!disabled && (
        <div className="flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-end">
          <div className="flex-1">
            <FieldGroup label="Vacuna">
              <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Antirrábica" />
            </FieldGroup>
          </div>
          <div className="sm:w-44">
            <FieldGroup label="Próximo refuerzo">
              <Input type="date" value={fechaRefuerzo} onChange={(e) => setFechaRefuerzo(e.target.value)} />
            </FieldGroup>
          </div>
          <Button variant="secondary" onClick={agregar} disabled={!nombre.trim() || guardando}>
            <Plus size={14} /> Agregar
          </Button>
        </div>
      )}
      {error && <p className="text-xs font-bold text-rose-600">{error}</p>}
    </Seccion>
  )
}

/**
 * Desparasitaciones: mismo comportamiento que las vacunas —incluido el modo
 * diferido del alta de paciente—, con la fecha de la próxima dosis, que es lo
 * que después alimenta los avisos del asistente.
 */
export function SeccionDesparasitaciones({
  registradas,
  pendientes,
  onAgregar,
  disabled,
}: {
  registradas: DesparasitacionAplicada[]
  pendientes: DesparasitacionPendiente[]
  onAgregar: (d: DesparasitacionPendiente) => Promise<void>
  disabled?: boolean
}) {
  const [producto, setProducto] = useState('')
  const [via, setVia] = useState<ViaDesparasitacion>('oral')
  const [fechaProxima, setFechaProxima] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  const vacio = registradas.length === 0 && pendientes.length === 0

  async function agregar() {
    setError(null)
    setGuardando(true)
    try {
      await onAgregar({ producto: producto.trim(), via, fecha_proxima: fechaProxima || null })
      setProducto('')
      setFechaProxima('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar la desparasitación')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Seccion titulo="Desparasitaciones" icono={<Bug size={13} className="text-teal-600" />}>
      {vacio ? (
        <p className="text-xs text-slate-400">Ninguna en esta consulta.</p>
      ) : (
        <ul className="space-y-1 text-xs text-slate-700">
          {registradas.map((d) => (
            <li key={d.id} className="flex justify-between gap-2">
              <span className="font-medium">
                {d.producto} <span className="text-slate-400">· {VIA_LABEL[d.via]}</span>
              </span>
              <span className="text-slate-500">
                {d.fecha_proxima ? `Próxima: ${formatClinicDate(desdeFechaSola(d.fecha_proxima))}` : 'Sin próxima dosis'}
              </span>
            </li>
          ))}
          {pendientes.map((d, i) => (
            <li key={`pendiente-${i}`} className="flex justify-between gap-2">
              <span className="font-medium">
                {d.producto} <span className="text-slate-400">· {VIA_LABEL[d.via]}</span>
              </span>
              <span className="text-slate-500">
                {d.fecha_proxima ? `Próxima: ${formatClinicDate(desdeFechaSola(d.fecha_proxima))}` : 'Sin próxima dosis'}
              </span>
            </li>
          ))}
        </ul>
      )}

      {!disabled && (
        <div className="flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-end">
          <div className="flex-1">
            <FieldGroup label="Antiparasitario">
              <Input
                value={producto}
                onChange={(e) => setProducto(e.target.value)}
                placeholder="Ej. Praziquantel + Pirantel"
              />
            </FieldGroup>
          </div>
          <div className="sm:w-32">
            <FieldGroup label="Vía">
              <Select value={via} onChange={(e) => setVia(e.target.value as ViaDesparasitacion)}>
                {(Object.keys(VIA_LABEL) as ViaDesparasitacion[]).map((v) => (
                  <option key={v} value={v}>
                    {VIA_LABEL[v]}
                  </option>
                ))}
              </Select>
            </FieldGroup>
          </div>
          <div className="sm:w-44">
            <FieldGroup label="Próxima dosis">
              <Input type="date" value={fechaProxima} onChange={(e) => setFechaProxima(e.target.value)} />
            </FieldGroup>
          </div>
          <Button variant="secondary" onClick={agregar} disabled={!producto.trim() || guardando}>
            <Plus size={14} /> Agregar
          </Button>
        </div>
      )}
      {error && <p className="text-xs font-bold text-rose-600">{error}</p>}
    </Seccion>
  )
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
                {p.nombre} <span className="text-slate-400">{p.cantidad}</span>
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
                    {p.nombre} (stock: {p.stock_actual} {p.unidad_medida})
                  </option>
                ))}
              </Select>
            </FieldGroup>
          </div>
          <div className="sm:w-28">
            <FieldGroup label="Cantidad">
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
export function SeccionesConsulta(props: {
  vacunas: VacunaAplicada[]
  vacunasPendientes: VacunaPendiente[]
  onAgregarVacuna: (v: VacunaPendiente) => Promise<void>
  desparasitaciones: DesparasitacionAplicada[]
  desparasitacionesPendientes: DesparasitacionPendiente[]
  onAgregarDesparasitacion: (d: DesparasitacionPendiente) => Promise<void>
  productos: ProductoUsado[]
  productosPendientes: ProductoPendiente[]
  onAgregarProducto: (p: ProductoPendiente) => Promise<void>
  receta: RecetaItem[]
  recetaPendientes: RecetaItemPendiente[]
  onAgregarRecetaItem: (item: RecetaItemPendiente) => Promise<void>
  onEliminarRecetaItem?: (id: string) => Promise<void>
  disabled?: boolean
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <SeccionVacunas
        registradas={props.vacunas}
        pendientes={props.vacunasPendientes}
        onAgregar={props.onAgregarVacuna}
        disabled={props.disabled}
      />
      <SeccionDesparasitaciones
        registradas={props.desparasitaciones}
        pendientes={props.desparasitacionesPendientes}
        onAgregar={props.onAgregarDesparasitacion}
        disabled={props.disabled}
      />
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
    </div>
  )
}
