import { useCallback, useEffect, useState } from 'react'
import { Pencil, Plus } from 'lucide-react'
import { AvisoError } from '../components/ui/AvisoError'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { Seccion } from '../components/ui/Seccion'
import { FieldGroup, Input, Select } from '../components/ui/Field'
import {
  actualizarServicio,
  alternarActivo,
  CATEGORIA_LABEL,
  CATEGORIAS,
  crearServicio,
  listServicios,
  type DatosServicio,
} from '../services/servicios'
import { formatBs } from '../lib/currency'
import type { CategoriaServicio, Servicio } from '../types/database'

export function ServiciosPage() {
  const [servicios, setServicios] = useState<Servicio[]>([])
  const [editando, setEditando] = useState<Servicio | null>(null)
  const [creando, setCreando] = useState(false)
  /** Id del servicio cuyo activar/desactivar está en vuelo, para no repetirlo. */
  const [alternando, setAlternando] = useState<string | null>(null)

  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const recargar = useCallback(async () => {
    setServicios(await listServicios())
  }, [])

  useEffect(() => {
    setErrorCarga(null)
    recargar().catch((err) =>
      setErrorCarga(err instanceof Error ? err.message : 'No se pudo cargar el catálogo de servicios'),
    )
  }, [recargar])

  return (
    <div className="space-y-5">
      <AvisoError mensaje={errorCarga} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold text-slate-900">Servicios</h1>
          <p className="mt-0.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Catálogo de precios de la clínica
          </p>
        </div>
        <Button onClick={() => setCreando(true)}>
          <Plus size={16} /> Nuevo servicio
        </Button>
      </div>

      {CATEGORIAS.filter((cat) => servicios.some((s) => s.categoria === cat)).map((cat) => (
        <Seccion key={cat} titulo={CATEGORIA_LABEL[cat]}>
          <ul className="space-y-2">
            {servicios
              .filter((s) => s.categoria === cat)
              .map((s) => (
                <li
                  key={s.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className={s.activo ? 'text-sm font-bold text-slate-900' : 'text-sm font-bold text-slate-400'}>
                      {s.nombre}
                    </p>
                    {!s.activo && (
                      <Badge tone="slate" size="sm">
                        Inactivo
                      </Badge>
                    )}
                  </div>
                  <span className="font-display text-base font-black text-slate-900">{formatBs(s.precio_bs)}</span>
                  <div className="flex items-center gap-2">
                    <Button variant="secondary" onClick={() => setEditando(s)} className="px-3 py-1.5 text-xs">
                      <Pencil size={13} /> Editar
                    </Button>
                    <Button
                      variant={s.activo ? 'secondary' : 'success'}
                      className="px-3 py-1.5 text-xs"
                      // Sin deshabilitar ni capturar, un doble clic alternaba dos
                      // veces (volviendo al valor original) y un rechazo de la
                      // RLS pasaba desapercibido.
                      disabled={alternando === s.id}
                      onClick={async () => {
                        setAlternando(s.id)
                        setErrorCarga(null)
                        try {
                          await alternarActivo(s.id)
                          await recargar()
                        } catch (err) {
                          setErrorCarga(err instanceof Error ? err.message : 'No se pudo cambiar el estado')
                        } finally {
                          setAlternando(null)
                        }
                      }}
                    >
                      {s.activo ? 'Desactivar' : 'Activar'}
                    </Button>
                  </div>
                </li>
              ))}
          </ul>
        </Seccion>
      ))}

      {servicios.length === 0 && (
        <Card className="border border-dashed border-slate-300 py-10 text-center">
          <p className="text-sm text-slate-400">Todavía no hay servicios en el catálogo.</p>
        </Card>
      )}

      {(creando || editando) && (
        <ServicioModal
          servicio={editando}
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
    </div>
  )
}

function ServicioModal({
  servicio,
  onClose,
  onGuardado,
}: {
  servicio: Servicio | null
  onClose: () => void
  onGuardado: () => void
}) {
  const [nombre, setNombre] = useState(servicio?.nombre ?? '')
  const [categoria, setCategoria] = useState<CategoriaServicio>(servicio?.categoria ?? 'consulta')
  const [precio, setPrecio] = useState(servicio ? String(servicio.precio_bs) : '')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setGuardando(true)
    setError(null)
    const datos: DatosServicio = { nombre, categoria, precio_bs: Number(precio) }
    try {
      if (servicio) await actualizarServicio(servicio.id, datos)
      else await crearServicio(datos)
      onGuardado()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el servicio')
      setGuardando(false)
    }
  }

  return (
    <Modal title={servicio ? 'Editar servicio' : 'Nuevo servicio'} onClose={onClose}>
      <form className="space-y-4" onSubmit={handleSubmit}>
        <FieldGroup label="Nombre del servicio">
          <Input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej. Ecografía abdominal"
            required
          />
        </FieldGroup>
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldGroup label="Categoría">
            <Select value={categoria} onChange={(e) => setCategoria(e.target.value as CategoriaServicio)}>
              {CATEGORIAS.map((c) => (
                <option key={c} value={c}>
                  {CATEGORIA_LABEL[c]}
                </option>
              ))}
            </Select>
          </FieldGroup>
          <FieldGroup label="Precio (Bs.)">
            <Input
              type="number"
              min="0"
              step="0.01"
              value={precio}
              onChange={(e) => setPrecio(e.target.value)}
              required
            />
          </FieldGroup>
        </div>

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
