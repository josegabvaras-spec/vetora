import { useCallback, useEffect, useState } from 'react'
import { ImageOff, Pencil, Plus, Trash2 } from 'lucide-react'
import { AvisoError } from '../components/ui/AvisoError'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { useAuth } from '../context/AuthContext'
import { alternarDisponible, eliminarProductoCatalogo, listCatalogo, urlFotoCatalogo } from '../services/catalogo'
import { CatalogoProductoModal } from '../features/catalogo/CatalogoProductoModal'
import { formatBs } from '../lib/currency'
import type { CatalogoProducto } from '../types/database'

export function CatalogoPage() {
  const { usuario } = useAuth()
  const [productos, setProductos] = useState<CatalogoProducto[]>([])
  const [editando, setEditando] = useState<CatalogoProducto | null>(null)
  const [creando, setCreando] = useState(false)
  const [borrando, setBorrando] = useState<CatalogoProducto | null>(null)
  /** Id del producto cuyo disponible/no-disponible está en vuelo, para no repetirlo. */
  const [alternando, setAlternando] = useState<string | null>(null)
  const [eliminando, setEliminando] = useState(false)

  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const recargar = useCallback(async () => {
    setProductos(await listCatalogo())
  }, [])

  useEffect(() => {
    setErrorCarga(null)
    recargar().catch((err) => setErrorCarga(err instanceof Error ? err.message : 'No se pudo cargar el catálogo'))
  }, [recargar])

  if (!usuario?.clinica_id) return null

  return (
    <div className="space-y-5">
      <AvisoError mensaje={errorCarga} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold text-slate-900">Catálogo</h1>
          <p className="mt-0.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Lo que ve cualquier dueño de mascota en la Tienda de su portal
          </p>
        </div>
        <Button onClick={() => setCreando(true)}>
          <Plus size={16} /> Nuevo producto
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {productos.map((p) => (
          <Card key={p.id} padding="none" className="overflow-hidden">
            <div className="aspect-[4/3] bg-slate-100">
              {p.foto_ruta ? (
                <img src={urlFotoCatalogo(p.foto_ruta)} alt={p.nombre} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <ImageOff size={28} className="text-slate-300" />
                </div>
              )}
            </div>
            <div className="space-y-2 p-4">
              <div className="flex items-start justify-between gap-2">
                <p className={p.disponible ? 'text-sm font-bold text-slate-900' : 'text-sm font-bold text-slate-400'}>
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
              {p.descripcion && <p className="line-clamp-2 text-xs text-slate-500">{p.descripcion}</p>}
              <p className="font-display text-lg font-black text-slate-900">{formatBs(p.precio_bs)}</p>

              <div className="flex items-center gap-2 border-t border-slate-100 pt-3">
                <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={() => setEditando(p)}>
                  <Pencil size={13} /> Editar
                </Button>
                <Button
                  variant={p.disponible ? 'secondary' : 'success'}
                  className="px-3 py-1.5 text-xs"
                  disabled={alternando === p.id}
                  onClick={async () => {
                    setAlternando(p.id)
                    setErrorCarga(null)
                    try {
                      await alternarDisponible(p)
                      await recargar()
                    } catch (err) {
                      setErrorCarga(err instanceof Error ? err.message : 'No se pudo cambiar el estado')
                    } finally {
                      setAlternando(null)
                    }
                  }}
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

      {productos.length === 0 && (
        <Card className="border border-dashed border-slate-300 py-10 text-center">
          <p className="text-sm text-slate-400">Todavía no hay productos en el catálogo.</p>
        </Card>
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
          title={`Eliminar «${borrando.nombre}»`}
          description="Se quita del catálogo y de la Tienda del portal. No hay ningún cobro ni cita que dependa de este producto, así que se borra de verdad, no se puede deshacer."
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
              setErrorCarga(err instanceof Error ? err.message : 'No se pudo eliminar el producto')
            } finally {
              setEliminando(false)
            }
          }}
        />
      )}
    </div>
  )
}
