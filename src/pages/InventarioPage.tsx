import { useCallback, useEffect, useMemo, useState } from 'react'
import { clsx } from 'clsx'
import { Pencil, Plus, PlusCircle, Trash2 } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { Select } from '../components/ui/Field'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { TablaResponsive, type Columna } from '../components/ui/Tabla'
import { useAuth } from '../context/useAuth'
import { useTable } from '../mocks/useDb'
import { listProductos, eliminarProducto } from '../services/inventario'
import { dosisDisponible, formatDosis, formatEnvases } from '../lib/inventario'
import { AjustarStockModal } from '../features/inventario/AjustarStockModal'
import { ProductoModal } from '../features/inventario/ProductoModal'
import { formatBs } from '../lib/currency'
import type { ProductoConMovimientos } from '../types/views'

/**
 * El stock se cuenta en envases (0013), pero quien va a usar el producto piensa
 * en dosis: por eso el badge lleva los envases y debajo lo que queda en la
 * unidad de medida. "0.9 envases" no dice si alcanza para una aplicación de
 * 5 ml; "45 ml" sí.
 */
function renderStockBadge(p: ProductoConMovimientos) {
  const envases = formatEnvases(p.stock_actual)
  const restante = `${formatDosis(dosisDisponible(p))} ${p.unidad_medida}`

  if (p.stock_actual <= 0) {
    return <Badge tone="rose">Agotado</Badge>
  }
  return (
    <div>
      {p.stock_actual <= p.stock_minimo ? (
        <Badge tone="amber">Bajo stock ({envases} env.)</Badge>
      ) : (
        <Badge tone="emerald">Disponible ({envases} env.)</Badge>
      )}
      <div className="mt-0.5 text-xs font-medium text-slate-500">{restante}</div>
    </div>
  )
}

export function InventarioPage() {
  const { usuario, sucursalActivaId, setSucursalActivaId } = useAuth()
  const sucursales = useTable('sucursales')
  const [productos, setProductos] = useState<ProductoConMovimientos[]>([])
  const [productoSeleccionado, setProductoSeleccionado] = useState<ProductoConMovimientos | null>(null)
  const [creandoProducto, setCreandoProducto] = useState(false)
  const [editandoProducto, setEditandoProducto] = useState<ProductoConMovimientos | null>(null)
  const [filtroStock, setFiltroStock] = useState<'todos' | 'bajo' | 'agotado'>('todos')

  // Solo el administrador gestiona el catálogo y los precios; el ajuste de
  // stock sigue disponible para todos los roles.
  const esAdmin = usuario?.rol === 'admin'

  const [errorCarga, setErrorCarga] = useState<string | null>(null)

  const recargar = useCallback(async () => {
    try {
      setErrorCarga(null)
      setProductos(await listProductos(sucursalActivaId || undefined))
    } catch (err) {
      // Sin este catch, un fallo de la consulta dejaba la lista en [] y la
      // pantalla decía "No hay productos registrados para esta sucursal": el
      // usuario leía "no hay nada" en vez de "no se pudo cargar".
      setErrorCarga(err instanceof Error ? err.message : 'No se pudo cargar el inventario')
    }
  }, [sucursalActivaId])

  // `useCallback` para que la referencia sea estable: el useMemo de las
  // columnas la captura, y antes se quedaba con la primera versión — la que
  // cerraba sobre la sucursal inicial. Tras cambiar de sucursal, dar de baja un
  // producto recargaba la sucursal anterior.
  const handleEliminarProducto = useCallback(
    async (producto: ProductoConMovimientos) => {
      if (!window.confirm(`¿Dar de baja el producto "${producto.nombre}"? Dejará de aparecer en el catálogo, pero su historial de movimientos y sus recibos se conservan.`)) {
        return
      }
      try {
        await eliminarProducto(producto.id)
        await recargar()
      } catch (error: any) {
        alert(error.message)
      }
    },
    [recargar],
  )

  useEffect(() => {
    recargar()
  }, [recargar])

  const productosFiltrados = useMemo(() => {
    if (filtroStock === 'agotado') return productos.filter((p) => p.stock_actual <= 0)
    if (filtroStock === 'bajo') return productos.filter((p) => p.stock_actual > 0 && p.stock_actual <= p.stock_minimo)
    return productos
  }, [productos, filtroStock])

  const valorTotalInventario = useMemo(() => {
    return productosFiltrados.reduce((total, p) => total + (p.precio_bs * p.stock_actual), 0)
  }, [productosFiltrados])

  const columnas = useMemo<Columna<ProductoConMovimientos>[]>(
    () => [
      {
        clave: 'nombre',
        cabecera: 'Nombre del Producto',
        movil: 'titulo',
        celda: (p) => (
          <div>
            <span className="font-bold text-slate-800">{p.nombre}</span>
            {(p.presentacion || p.composicion) && (
              <div className="mt-0.5 text-xs text-slate-500">
                {p.presentacion && <span>{p.presentacion}</span>}
                {p.presentacion && p.composicion && <span> · </span>}
                {p.composicion && <span>{p.composicion}</span>}
              </div>
            )}
            <div className="mt-0.5 text-xs font-medium text-slate-500">
              Contenido: {p.contenido_presentacion} {p.unidad_medida}
            </div>
          </div>
        ),
      },
      {
        clave: 'stock',
        cabecera: 'Estado de Stock',
        movil: 'destacado',
        celda: (p) => renderStockBadge(p),
      },
      {
        clave: 'sku',
        cabecera: 'SKU / Código',
        celda: (p) => (
          <span className="rounded-md border border-slate-200/40 bg-slate-100/80 px-2 py-1 font-mono text-xs font-bold text-slate-500">
            {p.sku}
          </span>
        ),
      },
      {
        clave: 'precio',
        cabecera: 'Precio Unitario',
        celda: (p) => <span className="font-bold text-slate-700">{formatBs(p.precio_bs)}</span>,
      },
      {
        clave: 'valor',
        cabecera: 'Valor Total',
        celda: (p) => <span className="font-bold text-slate-700">{formatBs(p.precio_bs * p.stock_actual)}</span>,
      },
      {
        clave: 'acciones',
        cabecera: 'Acciones',
        movil: 'acciones',
        alineadaDerecha: true,
        celda: (p) => (
          <div className="flex flex-wrap items-center gap-2 md:justify-end">
            {esAdmin && (
              <>
                <Button variant="secondary" onClick={() => setEditandoProducto(p)} className="flex-1 px-3 py-1 text-xs md:flex-none">
                  <Pencil size={13} /> Editar
                </Button>
                <Button variant="secondary" onClick={() => handleEliminarProducto(p)} className="flex-1 px-3 py-1 text-xs md:flex-none text-rose-600 hover:text-rose-700 hover:bg-rose-50 border-rose-200">
                  <Trash2 size={13} /> Eliminar
                </Button>
              </>
            )}
            <Button variant="secondary" onClick={() => setProductoSeleccionado(p)} className="flex-1 px-3 py-1 text-xs md:flex-none">
              <PlusCircle size={13} /> Ajustar Stock
            </Button>
          </div>
        ),
      },
    ],
    [esAdmin, handleEliminarProducto],
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">Inventario</h1>
          <p className="mt-0.5 text-xs font-semibold uppercase tracking-wider text-slate-400">Control de stock de fármacos y productos por sucursal</p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          {esAdmin && (
            <>
              {/* `|| 'todas'`, no `?? 'todas'`: al elegir "Todas" se guardaba
                  cadena vacía, que no es null, así que el `??` no la sustituía,
                  el value no casaba con ninguna opción y el desplegable se veía
                  en blanco. Ahora se guarda null, que es lo que el contexto
                  espera para "sin sucursal fijada". */}
              <Select
                className="min-h-10 w-full py-1.5 font-semibold sm:w-52"
                aria-label="Sucursal"
                value={sucursalActivaId || 'todas'}
                onChange={(e) => setSucursalActivaId(e.target.value === 'todas' ? null : e.target.value)}
              >
                <option value="todas">Todas las sucursales</option>
                {sucursales.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </Select>
              <Button className="min-h-10 w-full sm:w-auto" onClick={() => setCreandoProducto(true)}>
                <Plus size={16} /> Nuevo producto
              </Button>
            </>
          )}
        </div>
      </div>

      {errorCarga && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
          {errorCarga}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200">
        <nav className="-mb-px flex space-x-6 overflow-x-auto" aria-label="Tabs">
          <button
            onClick={() => setFiltroStock('todos')}
            className={clsx(
              filtroStock === 'todos'
                ? 'border-teal-500 text-teal-600'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700',
              'whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium transition-colors'
            )}
          >
            Todos
          </button>
          <button
            onClick={() => setFiltroStock('bajo')}
            className={clsx(
              filtroStock === 'bajo'
                ? 'border-teal-500 text-teal-600'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700',
              'whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium transition-colors'
            )}
          >
            Bajo Stock
          </button>
          <button
            onClick={() => setFiltroStock('agotado')}
            className={clsx(
              filtroStock === 'agotado'
                ? 'border-teal-500 text-teal-600'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700',
              'whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium transition-colors'
            )}
          >
            Agotados
          </button>
        </nav>
        <div className="py-2 text-sm">
          <span className="text-slate-500">Valor total en inventario:</span>{' '}
          <span className="font-bold text-slate-900">{formatBs(valorTotalInventario)}</span>
        </div>
      </div>

      <Card padding="none" className="overflow-hidden shadow-md">
        <TablaResponsive
          columnas={columnas}
          filas={productosFiltrados}
          claveDe={(p) => p.id}
          vacio={
            filtroStock === 'todos'
              ? 'No hay productos registrados para esta sucursal.'
              : filtroStock === 'agotado'
                ? 'No hay productos agotados.'
                : 'No hay productos con bajo stock.'
          }
        />
      </Card>

      {productoSeleccionado && (
        <AjustarStockModal
          producto={productoSeleccionado}
          onClose={() => setProductoSeleccionado(null)}
          onUpdated={() => {
            setProductoSeleccionado(null)
            recargar()
          }}
        />
      )}

      {(creandoProducto || editandoProducto) && (
        <ProductoModal
          producto={editandoProducto}
          sucursalIdPorDefecto={sucursalActivaId || sucursales[0]?.id || ''}
          onClose={() => {
            setCreandoProducto(false)
            setEditandoProducto(null)
          }}
          onGuardado={async () => {
            setCreandoProducto(false)
            setEditandoProducto(null)
            await recargar()
          }}
        />
      )}
    </div>
  )
}
