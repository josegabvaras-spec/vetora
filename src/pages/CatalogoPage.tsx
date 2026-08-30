import { useCallback, useEffect, useMemo, useState } from 'react'
import { ImageOff, Package, Pencil, Plus, Store, Trash2 } from 'lucide-react'
import { AvisoError } from '../components/ui/AvisoError'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Field'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { useAuth } from '../context/useAuth'
import {
  alternarDisponible,
  eliminarProductoCatalogo,
  listArticulosDeCatalogo,
  publicarProductoEnTienda,
  urlFotoCatalogo,
} from '../services/catalogo'
import { CatalogoProductoModal } from '../features/catalogo/CatalogoProductoModal'
import { formatBs } from '../lib/currency'
import { CATEGORIA_RETAIL_LABEL } from '../lib/retail'
import type { CatalogoProducto, CategoriaRetail } from '../types/database'
import type { ArticuloDeCatalogo } from '../types/views'

type Filtro = 'todos' | 'vendiendo' | 'sin_publicar'

/**
 * El Catálogo: **el inventario de la clínica**, con una marca en cada artículo
 * que el dueño de mascota ve en la Tienda de su portal.
 *
 * Antes era una lista aparte, y publicar significaba volver a escribir un
 * producto que ya estaba cargado en el POS: nombre, categoría y precio otra vez,
 * y a partir de ahí dos precios que se separaban solos. Ahora esta pantalla
 * parte del kardex y lo único que se decide aquí es **cuáles se venden**.
 *
 * Lo que sigue siendo suyo es la vitrina: la foto y el texto que ve quien
 * compra. El nombre, la categoría y el precio vienen del inventario y se
 * cambian ahí — `trg_sincronizar_precio_catalogo` (0033) arrastra el precio.
 */
export function CatalogoPage() {
  const { usuario, sucursalActivaId } = useAuth()

  const [articulos, setArticulos] = useState<ArticuloDeCatalogo[]>([])
  /** Fichas sin producto detrás: las escritas a mano, que no se pierden. */
  const [sueltos, setSueltos] = useState<CatalogoProducto[]>([])

  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('todos')

  const [editando, setEditando] = useState<CatalogoProducto | null>(null)
  const [creando, setCreando] = useState(false)
  const [borrando, setBorrando] = useState<CatalogoProducto | null>(null)
  /** Id del artículo cuya publicación o visibilidad está en vuelo. */
  const [enVuelo, setEnVuelo] = useState<string | null>(null)
  const [eliminando, setEliminando] = useState(false)

  const [errorCarga, setErrorCarga] = useState<string | null>(null)

  const recargar = useCallback(async () => {
    const { articulos, sueltos } = await listArticulosDeCatalogo(sucursalActivaId || undefined)
    setArticulos(articulos)
    setSueltos(sueltos)
  }, [sucursalActivaId])

  useEffect(() => {
    setErrorCarga(null)
    recargar().catch((err) =>
      setErrorCarga(err instanceof Error ? err.message : 'No se pudo cargar el catálogo'),
    )
  }, [recargar])

  /**
   * Se filtra en memoria y no en la consulta: el inventario ya está entero
   * aquí para poder contar cuántos se están vendiendo, y una segunda consulta
   * por cada tecla no aportaría nada.
   */
  const visibles = useMemo(() => {
    const texto = busqueda.trim().toLowerCase()
    return articulos.filter(({ producto, ficha }) => {
      if (filtro === 'vendiendo' && !ficha) return false
      if (filtro === 'sin_publicar' && ficha) return false
      if (!texto) return true
      return (
        producto.nombre.toLowerCase().includes(texto) ||
        (producto.marca ?? '').toLowerCase().includes(texto) ||
        producto.sku.toLowerCase().includes(texto)
      )
    })
  }, [articulos, busqueda, filtro])

  const enLaTienda = useMemo(() => articulos.filter((a) => a.ficha).length, [articulos])

  async function conAviso(id: string, accion: () => Promise<void>) {
    setEnVuelo(id)
    setErrorCarga(null)
    try {
      await accion()
      await recargar()
    } catch (err) {
      setErrorCarga(err instanceof Error ? err.message : 'No se pudo completar la acción')
    } finally {
      setEnVuelo(null)
    }
  }

  if (!usuario?.clinica_id) return null

  return (
    <div className="space-y-5">
      <AvisoError mensaje={errorCarga} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold text-slate-900">Catálogo</h1>
          <p className="mt-0.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Tu inventario — elige qué se vende en la Tienda del portal
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge tone={enLaTienda > 0 ? 'emerald' : 'slate'}>
            {enLaTienda} en la Tienda
          </Badge>
          <Button variant="secondary" onClick={() => setCreando(true)}>
            <Plus size={16} /> Producto suelto
          </Button>
        </div>
      </div>

      <Card className="flex flex-wrap items-center gap-3 p-3">
        <Input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre, marca o SKU…"
          className="min-w-52 flex-1"
        />
        <div className="flex gap-1">
          {(
            [
              ['todos', 'Todos'],
              ['vendiendo', 'En la Tienda'],
              ['sin_publicar', 'Sin publicar'],
            ] as [Filtro, string][]
          ).map(([id, etiqueta]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFiltro(id)}
              className={
                filtro === id
                  ? 'rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-bold text-white'
                  : 'rounded-lg px-3 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-100'
              }
            >
              {etiqueta}
            </button>
          ))}
        </div>
      </Card>

      {articulos.length === 0 ? (
        <Card className="border border-dashed border-slate-300 py-10 text-center">
          <Package size={28} className="mx-auto mb-2 text-slate-300" />
          <p className="text-sm font-semibold text-slate-600">
            Todavía no hay productos en el inventario
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Cárgalos en tu inventario y luego vuelve aquí a elegir cuáles vender.
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibles.map(({ producto, ficha }) => {
            const stock = Number(producto.stock_actual) || 0
            const categoria =
              CATEGORIA_RETAIL_LABEL[(producto.categoria_retail || 'otro') as CategoriaRetail]

            return (
              <Card key={producto.id} padding="none" className="overflow-hidden">
                <div className="relative aspect-[4/3] bg-slate-100">
                  {ficha?.foto_ruta ? (
                    <img
                      src={urlFotoCatalogo(ficha.foto_ruta)}
                      alt={producto.nombre}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <ImageOff size={28} className="text-slate-300" />
                    </div>
                  )}
                  {ficha && (
                    <div className="absolute right-3 top-3">
                      <Badge tone={ficha.disponible ? 'emerald' : 'slate'} size="sm">
                        {ficha.disponible ? 'En la Tienda' : 'Oculto'}
                      </Badge>
                    </div>
                  )}
                </div>

                <div className="space-y-2 p-4">
                  <p className="text-sm font-bold text-slate-900">{producto.nombre}</p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone="teal" size="sm">
                      {categoria}
                    </Badge>
                    <Badge tone={stock === 0 ? 'rose' : 'slate'} size="sm">
                      {stock} {producto.unidad_medida}
                    </Badge>
                  </div>
                  <p className="font-display text-lg font-black text-slate-900">
                    {formatBs(producto.precio_bs)}
                  </p>

                  {/* Sin stock se puede publicar igual: se pide por WhatsApp y
                      la tienda lo trae. El aviso es para que sea una decisión,
                      no un descuido. */}
                  {ficha && stock === 0 && (
                    <p className="text-xs font-semibold text-amber-600">
                      Se está mostrando sin stock
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                    <Button
                      variant={ficha ? 'secondary' : 'success'}
                      className="px-3 py-1.5 text-xs"
                      disabled={enVuelo === producto.id}
                      onClick={() =>
                        conAviso(producto.id, async () => {
                          if (ficha) await eliminarProductoCatalogo(ficha)
                          else await publicarProductoEnTienda(producto)
                        })
                      }
                    >
                      <Store size={13} /> {ficha ? 'Quitar' : 'Vender aquí'}
                    </Button>

                    {ficha && (
                      <>
                        <Button
                          variant="secondary"
                          className="px-3 py-1.5 text-xs"
                          onClick={() => setEditando(ficha)}
                          title="Foto y descripción de la vitrina"
                        >
                          <Pencil size={13} /> Vitrina
                        </Button>
                        <Button
                          variant="secondary"
                          className="px-3 py-1.5 text-xs"
                          disabled={enVuelo === producto.id}
                          onClick={() => conAviso(producto.id, () => alternarDisponible(ficha))}
                        >
                          {ficha.disponible ? 'Ocultar' : 'Mostrar'}
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {articulos.length > 0 && visibles.length === 0 && (
        <Card className="border border-dashed border-slate-300 py-10 text-center">
          <p className="text-sm text-slate-400">Ningún artículo coincide con ese filtro.</p>
        </Card>
      )}

      {/* Fichas sin producto detrás: las escritas a mano antes de que el
          catálogo fuera el inventario, y las de algo que se vende sin llevarle
          stock. Aparte, porque no hay kardex del que sacarles el precio. */}
      {sueltos.length > 0 && (
        <div className="space-y-3 pt-2">
          <div>
            <h2 className="font-display text-base font-bold text-slate-900">Productos sueltos</h2>
            <p className="text-xs text-slate-400">
              Publicados a mano, sin artículo del inventario detrás.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sueltos.map((p) => (
              <Card key={p.id} padding="none" className="overflow-hidden">
                <div className="aspect-[4/3] bg-slate-100">
                  {p.foto_ruta ? (
                    <img
                      src={urlFotoCatalogo(p.foto_ruta)}
                      alt={p.nombre}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <ImageOff size={28} className="text-slate-300" />
                    </div>
                  )}
                </div>
                <div className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p
                      className={
                        p.disponible
                          ? 'text-sm font-bold text-slate-900'
                          : 'text-sm font-bold text-slate-400'
                      }
                    >
                      {p.nombre}
                    </p>
                    {!p.disponible && (
                      <Badge tone="slate" size="sm">
                        Oculto
                      </Badge>
                    )}
                  </div>
                  {p.categoria && (
                    <Badge tone="teal" size="sm">
                      {p.categoria}
                    </Badge>
                  )}
                  {p.descripcion && (
                    <p className="line-clamp-2 text-xs text-slate-500">{p.descripcion}</p>
                  )}
                  <p className="font-display text-lg font-black text-slate-900">
                    {formatBs(p.precio_bs)}
                  </p>

                  <div className="flex items-center gap-2 border-t border-slate-100 pt-3">
                    <Button
                      variant="secondary"
                      className="px-3 py-1.5 text-xs"
                      onClick={() => setEditando(p)}
                    >
                      <Pencil size={13} /> Editar
                    </Button>
                    <Button
                      variant={p.disponible ? 'secondary' : 'success'}
                      className="px-3 py-1.5 text-xs"
                      disabled={enVuelo === p.id}
                      onClick={() => conAviso(p.id, () => alternarDisponible(p))}
                    >
                      {p.disponible ? 'Ocultar' : 'Mostrar'}
                    </Button>
                    <button
                      type="button"
                      onClick={() => setBorrando(p)}
                      className="ml-auto p-1.5 text-slate-400 hover:text-rose-600"
                      title="Eliminar"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {(creando || editando) && (
        <CatalogoProductoModal
          producto={editando}
          clinicaId={usuario.clinica_id}
          onClose={() => {
            setCreando(false)
            setEditando(null)
          }}
          onGuardado={async () => {
            setCreando(false)
            setEditando(null)
            await recargar()
          }}
        />
      )}

      {borrando && (
        <ConfirmDialog
          title="Eliminar del catálogo"
          description={`«${borrando.nombre}» dejará de verse en la Tienda y se borrará su foto.`}
          confirmLabel="Eliminar"
          loading={eliminando}
          onCancel={() => setBorrando(null)}
          onConfirm={async () => {
            setEliminando(true)
            setErrorCarga(null)
            try {
              await eliminarProductoCatalogo(borrando)
              setBorrando(null)
              await recargar()
            } catch (err) {
              setErrorCarga(err instanceof Error ? err.message : 'No se pudo eliminar')
            } finally {
              setEliminando(false)
            }
          }}
        />
      )}
    </div>
  )
}
