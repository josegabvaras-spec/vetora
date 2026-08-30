import { useState } from 'react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { FieldGroup, Input, Textarea } from '../../components/ui/Field'
import {
  actualizarProductoCatalogo,
  crearProductoCatalogo,
  quitarFotoProducto,
  reemplazarFotoProducto,
  urlFotoCatalogo,
  type DatosCatalogoProducto,
} from '../../services/catalogo'
import type { CatalogoProducto } from '../../types/database'

/**
 * La ficha de vitrina de un producto.
 *
 * Tiene **dos formas**, según de dónde salga la ficha:
 *
 * - **Vinculada al inventario** (`producto_id`, desde 0033): el nombre, la
 *   categoría y el precio son del kardex y aquí se enseñan pero no se tocan —
 *   se cambian en el inventario, que es de donde salen. Lo editable es lo que
 *   solo existe aquí: la foto y el texto que lee quien compra. Si el precio se
 *   pudiera cambiar en los dos sitios, el de la Tienda se separaría del que se
 *   cobra en el mostrador, y `trg_sincronizar_precio_catalogo` lo pisaría al
 *   siguiente cambio sin avisar.
 * - **Suelta**: no hay kardex detrás, así que se escribe todo.
 */
export function CatalogoProductoModal({
  producto,
  clinicaId,
  onClose,
  onGuardado,
}: {
  producto: CatalogoProducto | null
  clinicaId: string
  onClose: () => void
  onGuardado: () => void
}) {
  const delInventario = Boolean(producto?.producto_id)
  const [nombre, setNombre] = useState(producto?.nombre ?? '')
  const [descripcion, setDescripcion] = useState(producto?.descripcion ?? '')
  const [categoria, setCategoria] = useState(producto?.categoria ?? '')
  const [precio, setPrecio] = useState(producto ? String(producto.precio_bs) : '')
  const [fotoNueva, setFotoNueva] = useState<File | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // La foto de un producto ya existente se maneja aparte del formulario: es
  // una operación de Storage independiente (subir/quitar), no un campo más
  // que se guarda junto con el resto. Al crear, en cambio, va empaquetada en
  // el mismo alta porque no hay fila todavía a la que aferrarse.
  const [subiendoFoto, setSubiendoFoto] = useState(false)
  const [fotoActual, setFotoActual] = useState(producto?.foto_ruta ?? null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setGuardando(true)
    setError(null)
    const datos: DatosCatalogoProducto = {
      nombre,
      descripcion,
      categoria,
      precio_bs: Number(precio),
    }
    try {
      if (producto) await actualizarProductoCatalogo(producto.id, datos)
      else await crearProductoCatalogo(clinicaId, datos, fotoNueva)
      onGuardado()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el producto')
      setGuardando(false)
    }
  }

  async function cambiarFotoExistente(archivo: File) {
    if (!producto) return
    setSubiendoFoto(true)
    setError(null)
    try {
      await reemplazarFotoProducto({ ...producto, foto_ruta: fotoActual }, archivo)
      setFotoActual(null) // se resuelve de nuevo al recargar; mientras, se limpia para no mostrar la vieja
      onGuardado()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cambiar la foto')
    } finally {
      setSubiendoFoto(false)
    }
  }

  async function quitarFoto() {
    if (!producto || !fotoActual) return
    setSubiendoFoto(true)
    setError(null)
    try {
      await quitarFotoProducto({ ...producto, foto_ruta: fotoActual })
      setFotoActual(null)
      onGuardado()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo quitar la foto')
    } finally {
      setSubiendoFoto(false)
    }
  }

  return (
    <Modal
      title={delInventario ? 'Vitrina del producto' : producto ? 'Editar producto' : 'Nuevo producto'}
      onClose={onClose}
    >
      <form className="space-y-4" onSubmit={handleSubmit}>
        {delInventario && (
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
            El nombre, la categoría y el precio salen de tu inventario. Cámbialos ahí y esta ficha
            los sigue.
          </p>
        )}

        <FieldGroup label="Nombre del producto">
          <Input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej. Shampoo antipulgas"
            required
            disabled={delInventario}
          />
        </FieldGroup>

        <FieldGroup label="Descripción (opcional)">
          <Textarea
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Lo que vería quien compra: presentación, para qué sirve…"
          />
        </FieldGroup>

        <div className="grid gap-4 sm:grid-cols-2">
          <FieldGroup label="Categoría (opcional)">
            <Input
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              placeholder="Ej. Higiene"
              disabled={delInventario}
            />
          </FieldGroup>
          <FieldGroup label="Precio (Bs.)">
            <Input
              type="number"
              min="0"
              step="0.01"
              value={precio}
              onChange={(e) => setPrecio(e.target.value)}
              required
              disabled={delInventario}
            />
          </FieldGroup>
        </div>

        <FieldGroup label={producto ? 'Foto' : 'Foto (opcional)'}>
          {producto ? (
            <div className="space-y-2">
              {fotoActual && (
                <img
                  src={urlFotoCatalogo(fotoActual)}
                  alt={producto.nombre}
                  className="h-32 w-32 rounded-lg border border-slate-200 object-cover"
                />
              )}
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  type="file"
                  accept="image/*"
                  disabled={subiendoFoto}
                  onChange={(e) => {
                    const archivo = e.target.files?.[0]
                    e.target.value = ''
                    if (archivo) cambiarFotoExistente(archivo)
                  }}
                  className="flex-1"
                />
                {fotoActual && (
                  <Button type="button" variant="secondary" disabled={subiendoFoto} onClick={quitarFoto}>
                    Quitar foto
                  </Button>
                )}
              </div>
              {subiendoFoto && <p className="text-xs text-slate-500">Guardando la foto…</p>}
            </div>
          ) : (
            <Input
              type="file"
              accept="image/*"
              onChange={(e) => setFotoNueva(e.target.files?.[0] ?? null)}
            />
          )}
        </FieldGroup>

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
