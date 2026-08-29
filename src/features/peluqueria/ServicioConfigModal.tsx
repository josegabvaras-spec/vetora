import { useState } from 'react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { FieldGroup, Input, Select } from '../../components/ui/Field'
import { Plus, Trash2, Boxes } from 'lucide-react'
import { formatBs } from '../../lib/currency'
import { CATEGORIA_GROOMING_LABEL, guardarConfigServicioPeluqueria } from '../../services/peluqueria'
import { useTable } from '../../mocks/useDb'
import type { PeluqueriaServicioConConfig } from '../../types/views'
import type { CategoriaGrooming, TipoComision } from '../../types/database'

interface ServicioConfigModalProps {
  servicio: PeluqueriaServicioConConfig
  onClose: () => void
  onSaved: () => void
}

export function ServicioConfigModal({ servicio, onClose, onSaved }: ServicioConfigModalProps) {
  const productos = useTable('productos')

  const [duracion, setDuracion] = useState(servicio.config?.duracion_minutos || 45)
  const [categoriaGrooming, setCategoriaGrooming] = useState<CategoriaGrooming>(
    servicio.config?.categoria_grooming || 'bano',
  )
  const [especie, setEspecie] = useState<'todos' | 'canino' | 'felino'>(
    servicio.config?.especie_permitida || 'todos',
  )
  const [tamano, setTamano] = useState<'todos' | 'pequeno' | 'mediano' | 'grande' | 'gigante'>(
    servicio.config?.tamano_permitido || 'todos',
  )
  const [comisionTipo, setComisionTipo] = useState<TipoComision>(
    servicio.config?.comision_tipo || 'porcentaje',
  )
  const [comisionValor, setComisionValor] = useState<number>(servicio.config?.comision_valor || 30)

  // Insumos asociados (receta)
  const [insumos, setInsumos] = useState<{ productoId: string; cantidadDosis: number }[]>(
    (servicio.insumos || []).map((i) => ({
      productoId: i.producto_id,
      cantidadDosis: i.cantidad_dosis,
    })),
  )

  const [productoSeleccionadoId, setProductoSeleccionadoId] = useState('')
  const [dosisInput, setDosisInput] = useState('')

  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function agregarInsumo() {
    if (!productoSeleccionadoId) return
    const cant = parseFloat(dosisInput) || 0
    if (cant <= 0) return

    if (insumos.some((i) => i.productoId === productoSeleccionadoId)) {
      setError('Este producto ya está agregado en la receta de insumos')
      return
    }

    setInsumos([...insumos, { productoId: productoSeleccionadoId, cantidadDosis: cant }])
    setProductoSeleccionadoId('')
    setDosisInput('')
    setError(null)
  }

  function quitarInsumo(idx: number) {
    setInsumos(insumos.filter((_, i) => i !== idx))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setGuardando(true)
    setError(null)
    try {
      await guardarConfigServicioPeluqueria(
        servicio.id,
        {
          duracion_minutos: duracion,
          categoria_grooming: categoriaGrooming,
          especie_permitida: especie,
          tamano_permitido: tamano,
          comision_tipo: comisionTipo,
          comision_valor: comisionValor,
          activo: true,
        },
        insumos,
      )

      onSaved()
      onClose()
    } catch (err: any) {
      setError(err.message || 'Error al guardar configuración del servicio')
      setGuardando(false)
    }
  }

  return (
    <Modal onClose={onClose} title={`Configurar Servicio · ${servicio.nombre}`} widthClassName="max-w-2xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
            {error}
          </div>
        )}

        <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-xs flex justify-between items-center">
          <div>
            <span className="font-bold text-slate-400 uppercase text-[10px]">Servicio:</span>{' '}
            <span className="font-bold text-slate-800 text-sm">{servicio.nombre}</span>
          </div>
          <div>
            <span className="font-bold text-slate-400 uppercase text-[10px]">Precio Base:</span>{' '}
            <span className="font-bold text-teal-800">{formatBs(servicio.precio_bs)}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FieldGroup label="Categoría de Grooming">
            <Select
              value={categoriaGrooming}
              onChange={(e) => setCategoriaGrooming(e.target.value as CategoriaGrooming)}
            >
              {Object.entries(CATEGORIA_GROOMING_LABEL).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </Select>
          </FieldGroup>

          <FieldGroup label="Duración Estimada (minutos)">
            <Input
              type="number"
              min="15"
              step="15"
              value={duracion}
              onChange={(e) => setDuracion(parseInt(e.target.value) || 45)}
              required
            />
          </FieldGroup>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FieldGroup label="Especie Permitida">
            <Select value={especie} onChange={(e) => setEspecie(e.target.value as any)}>
              <option value="todos">Todas (Perros y Gatos)</option>
              <option value="canino">Solo Caninos</option>
              <option value="felino">Solo Felinos</option>
            </Select>
          </FieldGroup>

          <FieldGroup label="Tamaño Permitido">
            <Select value={tamano} onChange={(e) => setTamano(e.target.value as any)}>
              <option value="todos">Todos los tamaños</option>
              <option value="pequeno">Pequeño / Toy</option>
              <option value="mediano">Mediano</option>
              <option value="grande">Grande</option>
              <option value="gigante">Gigante</option>
            </Select>
          </FieldGroup>
        </div>

        {/* Comisiones */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-3.5 space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Comisión para el Peluquero
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FieldGroup label="Tipo de Comisión">
              <Select value={comisionTipo} onChange={(e) => setComisionTipo(e.target.value as TipoComision)}>
                <option value="porcentaje">Porcentaje (%)</option>
                <option value="monto_fijo">Monto Fijo (Bs.)</option>
              </Select>
            </FieldGroup>

            <FieldGroup label={comisionTipo === 'porcentaje' ? 'Porcentaje (%)' : 'Monto (Bs.)'}>
              <Input
                type="number"
                step="0.5"
                min="0"
                value={comisionValor}
                onChange={(e) => setComisionValor(parseFloat(e.target.value) || 0)}
                required
              />
            </FieldGroup>
          </div>
        </div>

        {/* Insumos asociados (Kardex / Fraccionado) */}
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Insumos de Inventario (Receta por Servicio)
              </h4>
              <p className="text-[11px] text-slate-500">
                Se descontará automáticamente del kardex al finalizar el servicio.
              </p>
            </div>
            <Boxes size={18} className="text-slate-400" />
          </div>

          {insumos.length > 0 && (
            <div className="space-y-1.5">
              {insumos.map((item, idx) => {
                const prod = productos.find((p) => p.id === item.productoId)
                return (
                  <div
                    key={idx}
                    className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-1.5 text-xs"
                  >
                    <span className="font-semibold text-slate-800">{prod?.nombre || 'Producto'}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-teal-700">
                        {item.cantidadDosis} {prod?.unidad_medida || 'dosis'}
                      </span>
                      <button
                        type="button"
                        onClick={() => quitarInsumo(idx)}
                        className="text-slate-400 hover:text-red-600 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <div className="flex-1 min-w-0">
              <Select
                value={productoSeleccionadoId}
                onChange={(e) => setProductoSeleccionadoId(e.target.value)}
              >
                <option value="">Selecciona un insumo de inventario...</option>
                {productos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre} ({p.unidad_medida}) — Stock: {p.stock_actual}
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-24 shrink-0">
              <Input
                type="number"
                step="0.1"
                min="0.1"
                placeholder="Cantidad"
                value={dosisInput}
                onChange={(e) => setDosisInput(e.target.value)}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={agregarInsumo}
              disabled={!productoSeleccionadoId || !dosisInput}
            >
              <Plus size={14} />
            </Button>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={guardando}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={guardando}>
            {guardando ? 'Guardando...' : 'Guardar Configuración'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
