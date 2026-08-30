import { useEffect, useState, useCallback } from 'react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Select } from '../../components/ui/Field'
import {
  Package,
  Plus,
  Search,
  Edit2,
  RefreshCw,
  Store,
} from 'lucide-react'
import { useAuth } from '../../context/useAuth'
import { AvisoError } from '../../components/ui/AvisoError'
import { formatBs } from '../../lib/currency'
import {
  listProductosPetshop,
  CATEGORIAS_RETAIL,
  CATEGORIA_RETAIL_LABEL,
} from '../../services/petshop'
import {
  eliminarProductoCatalogo,
  listCatalogo,
  publicarProductoEnTienda,
} from '../../services/catalogo'
import { listProveedores } from '../../services/compras'
import type { CatalogoProducto, CategoriaRetail, Proveedor } from '../../types/database'
import type { ProductoConLotes } from '../../types/views'
import { NuevoProductoModal } from '../../features/petshop/NuevoProductoModal'

export function PetshopProductosPage() {
  const { sucursalActivaId, usuario, tieneModulo } = useAuth()

  /**
   * Publicar en la Tienda del portal (migración 0033) es cosa del `admin`:
   * `catalogo_productos_admin` exige `auth_es_admin()`, así que a `recepcion` y
   * al `veterinario` —que sí entran a esta pantalla— el botón solo les daría un
   * error de permiso. Y sin el módulo en el plan no hay Tienda donde publicar:
   * la ficha se crearía, pero `catalogo_productos_portal` la dejaría invisible.
   */
  const puedePublicar = usuario?.rol === 'admin' && tieneModulo('catalogo')
  const [busqueda, setBusqueda] = useState('')
  const [categoriaFiltro, setCategoriaFiltro] = useState<CategoriaRetail | ''>('')
  const [soloStockBajo, setSoloStockBajo] = useState(false)

  const [productos, setProductos] = useState<ProductoConLotes[]>([])
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [cargando, setCargando] = useState(true)

  const [modalNuevo, setModalNuevo] = useState(false)
  const [productoAEditar, setProductoAEditar] = useState<ProductoConLotes | null>(null)

  /**
   * Las fichas de vitrina que salieron de un producto, indexadas por
   * `producto_id`. Se guarda la fila entera y no solo el id porque retirar de
   * la Tienda es `eliminarProductoCatalogo(ficha)`, que necesita la ruta de la
   * foto para borrarla también del bucket.
   */
  const [publicados, setPublicados] = useState<Map<string, CatalogoProducto>>(new Map())
  /** Id del producto cuya publicación está en vuelo, para no repetirla. */
  const [publicando, setPublicando] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  /**
   * Texto de búsqueda ya reposado.
   *
   * `busqueda` se resuelve en el SERVIDOR (`listProductosPetshop`), pero nada
   * disparaba la recarga al escribir: el efecto solo escuchaba a la sucursal y
   * los filtros, así que **el buscador de esta pantalla no funcionaba** — se
   * tecleaba y la lista no cambiaba hasta tocar otro filtro. Lo destapó el
   * aviso de `exhaustive-deps`.
   *
   * El retardo es el mismo criterio que en `PacientesListPage`: sin él se
   * lanzaría una consulta por tecla.
   */
  const [busquedaAplicada, setBusquedaAplicada] = useState('')
  useEffect(() => {
    const id = setTimeout(() => setBusquedaAplicada(busqueda), 300)
    return () => clearTimeout(id)
  }, [busqueda])

  const recargar = useCallback(async () => {
    setCargando(true)
    try {
      const [prods, provs, catalogo] = await Promise.all([
        listProductosPetshop({
          sucursalId: sucursalActivaId || undefined,
          categoriaRetail: categoriaFiltro || undefined,
          busqueda: busquedaAplicada || undefined,
          soloStockBajo,
          soloActivos: true,
        }),
        listProveedores(),
        // El catálogo es de la CLÍNICA, no de la sucursal, y no se filtra por
        // los mismos criterios: se pide entero una vez y se cruza en memoria.
        puedePublicar ? listCatalogo() : Promise.resolve([] as CatalogoProducto[]),
      ])
      setProductos(prods)
      setProveedores(provs)
      setPublicados(
        new Map(catalogo.filter((c) => c.producto_id).map((c) => [c.producto_id as string, c])),
      )
    } finally {
      setCargando(false)
    }
  }, [sucursalActivaId, categoriaFiltro, soloStockBajo, busquedaAplicada, puedePublicar])

  useEffect(() => {
    recargar()
  }, [recargar])

  /**
   * Publica o retira. No pide confirmación al retirar a propósito: no se
   * pierde nada del kardex y volver a publicar es el mismo botón — solo se
   * pierde la foto de la vitrina, que es lo único que vive ahí.
   */
  async function alternarEnTienda(producto: ProductoConLotes) {
    setPublicando(producto.id)
    setError(null)
    try {
      const ficha = publicados.get(producto.id)
      if (ficha) await eliminarProductoCatalogo(ficha)
      else await publicarProductoEnTienda(producto)
      await recargar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cambiar la publicación')
    } finally {
      setPublicando(null)
    }
  }

  return (
    <div className="space-y-6">
      <AvisoError mensaje={error} />

      {/* Cabecera Principal */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900 flex items-center gap-2">
            <Package className="text-teal-700" size={24} />
            <span>Catálogo de Productos Pet Shop</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Gestión completa de artículos, variantes, precios, márgenes de utilidad y proveedores.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => recargar()}>
            <RefreshCw size={14} className={cargando ? 'animate-spin' : ''} />
          </Button>
          <Button type="button" variant="primary" size="sm" onClick={() => setModalNuevo(true)}>
            <Plus size={15} className="mr-1.5" />
            <span>Nuevo Producto</span>
          </Button>
        </div>
      </div>

      {/* Barra de Filtros */}
      <Card className="p-4 border-slate-200">
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
          <div className="sm:col-span-6 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && recargar()}
              placeholder="Buscar por nombre, SKU, marca o código de barras..."
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-300 bg-white focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
            />
          </div>

          <div className="sm:col-span-4">
            <Select
              value={categoriaFiltro}
              onChange={(e) => setCategoriaFiltro(e.target.value as CategoriaRetail)}
            >
              <option value="">Todas las categorías</option>
              {CATEGORIAS_RETAIL.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </Select>
          </div>

          <div className="sm:col-span-2 flex items-center">
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={soloStockBajo}
                onChange={(e) => setSoloStockBajo(e.target.checked)}
                className="rounded text-teal-600 focus:ring-teal-500"
              />
              <span>Solo stock bajo</span>
            </label>
          </div>
        </div>
      </Card>

      {/* Listado de Productos */}
      {cargando ? (
        <p className="text-center py-16 text-xs text-slate-500">Cargando productos...</p>
      ) : productos.length === 0 ? (
        <Card className="p-12 text-center border-slate-200">
          <Package size={36} className="mx-auto text-slate-300 mb-2" />
          <p className="font-bold text-sm text-slate-700">No se encontraron productos</p>
          <p className="text-xs text-slate-400 mt-1">Crea tu primer producto para comenzar a vender.</p>
        </Card>
      ) : (
        <Card className="p-0 overflow-hidden border-slate-200">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-4 py-3">SKU / Barras</th>
                  <th className="px-4 py-3">Producto / Marca</th>
                  <th className="px-4 py-3">Categoría</th>
                  <th className="px-4 py-3">Proveedor</th>
                  <th className="px-4 py-3 text-right">Costo</th>
                  <th className="px-4 py-3 text-right">Precio Venta</th>
                  <th className="px-4 py-3 text-center">Stock Actual</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {productos.map((p) => {
                  const stockActual = Number(p.stock_actual) || 0
                  const stockMin = Number(p.stock_minimo) || 0
                  const costo = Number(p.costo_bs) || 0
                  const precio = Number(p.precio_bs) || 0
                  const margen = precio > 0 ? ((precio - costo) / precio) * 100 : 0
                  const stockBajo = stockActual <= stockMin
                  const enTienda = publicados.has(p.id)

                  return (
                    <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <span className="font-black text-slate-900">{p.sku}</span>
                        {p.codigo_barras && (
                          <span className="block text-[10px] text-slate-400 font-mono">
                            {p.codigo_barras}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-bold text-slate-900">{p.nombre}</p>
                        <p className="text-[11px] text-slate-500">
                          {p.presentacion} · {p.marca || 'Genérico'}
                          {p.ubicacion ? ` · ${p.ubicacion}` : ''}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone="slate">
                          {CATEGORIA_RETAIL_LABEL[(p.categoria_retail as CategoriaRetail) || 'otro']}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {p.proveedor?.empresa || '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-slate-500">
                        {formatBs(costo)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-black text-teal-800 text-sm">{formatBs(precio)}</span>
                        <span className="block text-[10px] text-emerald-700 font-semibold">
                          +{margen.toFixed(0)}% mg.
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge tone={stockActual === 0 ? 'rose' : stockBajo ? 'amber' : 'emerald'}>
                          {stockActual} {p.unidad_medida}
                        </Badge>
                        {p.lotes_vencidos ? (
                          <span className="block text-[10px] text-rose-600 font-bold mt-0.5">
                            {p.lotes_vencidos} lote(s) vencido(s)
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setProductoAEditar(p)
                            setModalNuevo(true)
                          }}
                        >
                          <Edit2 size={12} className="mr-1" />
                          <span>Editar</span>
                        </Button>
                        {puedePublicar && (
                          <Button
                            type="button"
                            variant={enTienda ? 'primary' : 'outline'}
                            size="sm"
                            className="ml-2"
                            disabled={publicando === p.id}
                            onClick={() => alternarEnTienda(p)}
                            title={
                              enTienda
                                ? 'Quitar este producto de la Tienda del portal'
                                : 'Mostrar este producto en la Tienda del portal'
                            }
                          >
                            <Store size={12} className="mr-1" />
                            <span>{enTienda ? 'En la Tienda' : 'Publicar'}</span>
                          </Button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Modal de Alta y Edición */}
      {modalNuevo && (
        <NuevoProductoModal
          sucursalId={sucursalActivaId || ''}
          proveedores={proveedores}
          productoAEditar={productoAEditar}
          onClose={() => {
            setModalNuevo(false)
            setProductoAEditar(null)
          }}
          onSaved={() => recargar()}
        />
      )}
    </div>
  )
}
