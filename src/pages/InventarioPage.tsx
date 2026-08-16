import { useEffect, useMemo, useState } from 'react'
import { clsx } from 'clsx'
import { Pencil, Plus, PlusCircle } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { Select } from '../components/ui/Field'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { TablaResponsive, type Columna } from '../components/ui/Tabla'
import { useAuth } from '../context/AuthContext'
import { useTable } from '../mocks/useDb'
import { listProductos } from '../services/inventario'
import { AjustarStockModal } from '../features/inventario/AjustarStockModal'
import { ProductoModal } from '../features/inventario/ProductoModal'
import { formatBs } from '../lib/currency'
import type { ProductoConMovimientos } from '../types/views'

function renderStockBadge(p: ProductoConMovimientos) {
  if (p.stock_actual === 0) {
    return <Badge tone="rose">Agotado (0)</Badge>
  }
  if (p.stock_actual <= p.stock_minimo) {
    return <Badge tone="amber">Bajo Stock ({p.stock_actual})</Badge>
  }
  return <Badge tone="emerald">Disponible ({p.stock_actual})</Badge>
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

  async function recargar() {
    setProductos(await listProductos(sucursalActivaId || undefined))
  }

  useEffect(() => {
    recargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sucursalActivaId])

  const productosFiltrados = useMemo(() => {
    if (filtroStock === 'agotado') return productos.filter((p) => p.stock_actual <= 0)
    if (filtroStock === 'bajo') return productos.filter((p) => p.stock_actual > 0 && p.stock_actual <= p.stock_minimo)
    return productos
  }, [productos, filtroStock])

  const columnas = useMemo<Columna<ProductoConMovimientos>[]>(
    () => [
      {
        clave: 'nombre',
        cabecera: 'Nombre del Producto',
        movil: 'titulo',
        celda: (p) => <span className="font-bold text-slate-800">{p.nombre}</span>,
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
        clave: 'acciones',
        cabecera: 'Acciones',
        movil: 'acciones',
        alineadaDerecha: true,
        celda: (p) => (
          <div className="flex flex-wrap items-center gap-2 md:justify-end">
            {esAdmin && (
              <Button variant="secondary" onClick={() => setEditandoProducto(p)} className="flex-1 px-3 py-1 text-xs md:flex-none">
                <Pencil size={13} /> Editar
              </Button>
            )}
            {usuario?.rol !== 'caja' && (
              <Button variant="secondary" onClick={() => setProductoSeleccionado(p)} className="flex-1 px-3 py-1 text-xs md:flex-none">
                <PlusCircle size={13} /> Ajustar Stock
              </Button>
            )}
          </div>
        ),
      },
    ],
    [esAdmin],
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
              <Select
                className="min-h-10 w-full py-1.5 font-semibold sm:w-52"
                aria-label="Sucursal"
                value={sucursalActivaId ?? 'todas'}
                onChange={(e) => setSucursalActivaId(e.target.value === 'todas' ? '' : e.target.value)}
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

      <div className="border-b border-slate-200">
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
