import { useEffect, useState } from 'react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Input, Select, FieldGroup } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import {
  Scissors,
  Plus,
  Settings,
  Boxes,
  Percent,
  Clock,
} from 'lucide-react'
import { formatBs } from '../../lib/currency'
import {
  listServiciosPeluqueria,
  CATEGORIA_GROOMING_LABEL,
  guardarConfigServicioPeluqueria,
} from '../../services/peluqueria'
import { crearServicio, alternarActivo } from '../../services/servicios'
import type { PeluqueriaServicioConConfig } from '../../types/views'
import type { CategoriaGrooming } from '../../types/database'
import { ServicioConfigModal } from '../../features/peluqueria/ServicioConfigModal'

export function PeluqueriaServiciosPage() {
  const [servicios, setServicios] = useState<PeluqueriaServicioConConfig[]>([])
  const [cargando, setCargando] = useState(true)
  const [filtroCategoria, setFiltroCategoria] = useState<string>('')

  const [modalNuevo, setModalNuevo] = useState(false)
  const [servicioAConfigurar, setServicioAConfigurar] = useState<PeluqueriaServicioConConfig | null>(null)

  // Formulario nuevo servicio
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [nuevoPrecio, setNuevoPrecio] = useState('')
  const [nuevaCatGrooming, setNuevaCatGrooming] = useState<CategoriaGrooming>('bano')
  const [nuevaDuracion, setNuevaDuracion] = useState(45)
  const [guardando, setGuardando] = useState(false)
  const [errorModal, setErrorModal] = useState<string | null>(null)

  async function recargar() {
    setCargando(true)
    try {
      const res = await listServiciosPeluqueria()
      setServicios(res)
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    recargar()
  }, [])

  async function handleCrearServicio(e: React.FormEvent) {
    e.preventDefault()
    if (!nuevoNombre.trim()) return
    const precio = parseFloat(nuevoPrecio) || 0

    setGuardando(true)
    setErrorModal(null)

    try {
      // 1. Crear en tabla servicios (categoría 'peluqueria')
      const serv = await crearServicio({
        nombre: nuevoNombre.trim(),
        categoria: 'peluqueria',
        precio_bs: precio,
      })

      // 2. Guardar config extendida de peluquería
      await guardarConfigServicioPeluqueria(
        serv.id,
        {
          duracion_minutos: nuevaDuracion,
          categoria_grooming: nuevaCatGrooming,
          comision_tipo: 'porcentaje',
          comision_valor: 30,
        },
        [],
      )

      setNuevoNombre('')
      setNuevoPrecio('')
      setNuevaDuracion(45)
      setModalNuevo(false)
      recargar()
    } catch (err: any) {
      setErrorModal(err.message || 'Error al crear servicio')
    } finally {
      setGuardando(false)
    }
  }

  async function handleToggleActivo(id: string) {
    try {
      await alternarActivo(id)
      recargar()
    } catch (err: any) {
      alert(err.message || 'Error al cambiar estado')
    }
  }

  const filtrados = servicios.filter(
    (s) => !filtroCategoria || (s.config?.categoria_grooming || 'bano') === filtroCategoria,
  )

  return (
    <div className="space-y-6">
      {/* Cabecera Principal */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">
            Catálogo de Servicios de Peluquería
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Configuración de tarifas, tiempos de bloqueo, comisiones y recetas de insumos asociados.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button type="button" variant="primary" onClick={() => setModalNuevo(true)}>
            <Plus size={16} className="mr-1.5" />
            <span>Nuevo Servicio</span>
          </Button>
        </div>
      </div>

      {/* Filtros por Categoría */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setFiltroCategoria('')}
          className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all ${
            filtroCategoria === ''
              ? 'bg-teal-600 text-white shadow-sm'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          Todos ({servicios.length})
        </button>
        {Object.entries(CATEGORIA_GROOMING_LABEL).map(([k, label]) => {
          const count = servicios.filter((s) => (s.config?.categoria_grooming || 'bano') === k).length
          return (
            <button
              key={k}
              type="button"
              onClick={() => setFiltroCategoria(k)}
              className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all ${
                filtroCategoria === k
                  ? 'bg-teal-600 text-white shadow-sm'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {label} ({count})
            </button>
          )
        })}
      </div>

      {/* Grilla de Servicios */}
      {cargando ? (
        <p className="text-center py-12 text-xs text-slate-500">Cargando catálogo...</p>
      ) : filtrados.length === 0 ? (
        <Card className="p-12 text-center border-slate-200">
          <Scissors size={32} className="mx-auto text-slate-300 mb-2" />
          <p className="text-sm font-semibold text-slate-700">No hay servicios en esta categoría</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtrados.map((s) => (
            <Card key={s.id} className="p-4 border-slate-200 space-y-3 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <Badge tone={s.activo ? 'teal' : 'slate'}>
                    {CATEGORIA_GROOMING_LABEL[s.config?.categoria_grooming || 'bano']}
                  </Badge>
                  <span className="font-black text-teal-800 text-base">{formatBs(s.precio_bs)}</span>
                </div>

                <h3 className="font-bold text-sm text-slate-900 mt-2">{s.nombre}</h3>

                <div className="mt-3 space-y-1.5 text-xs text-slate-500">
                  <p className="flex items-center gap-1.5">
                    <Clock size={13} className="text-slate-400" />
                    <span>Duración: {s.config?.duracion_minutos || 45} min</span>
                  </p>
                  <p className="flex items-center gap-1.5">
                    <Percent size={13} className="text-slate-400" />
                    <span>
                      Comisión: {s.config?.comision_valor || 30}
                      {s.config?.comision_tipo === 'porcentaje' ? '%' : ' Bs.'}
                    </span>
                  </p>
                  <p className="flex items-center gap-1.5">
                    <Boxes size={13} className="text-slate-400" />
                    <span>
                      Insumos receta: <strong className="text-slate-700">{s.insumos.length}</strong> productos
                    </span>
                  </p>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleToggleActivo(s.id)}
                  className="text-xs"
                >
                  {s.activo ? 'Desactivar' : 'Activar'}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setServicioAConfigurar(s)}
                  className="text-xs"
                >
                  <Settings size={13} className="mr-1" />
                  <span>Configurar</span>
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Modal Nuevo Servicio */}
      {modalNuevo && (
        <Modal onClose={() => setModalNuevo(false)} title="Nuevo Servicio de Peluquería">
          <form onSubmit={handleCrearServicio} className="space-y-4">
            {errorModal && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
                {errorModal}
              </div>
            )}

            <FieldGroup label="Nombre del Servicio">
              <Input
                value={nuevoNombre}
                onChange={(e) => setNuevoNombre(e.target.value)}
                placeholder="Ej. Baño Medicado Antipulgas, Corte de Raza..."
                required
              />
            </FieldGroup>

            <div className="grid grid-cols-2 gap-3">
              <FieldGroup label="Categoría">
                <Select
                  value={nuevaCatGrooming}
                  onChange={(e) => setNuevaCatGrooming(e.target.value as CategoriaGrooming)}
                >
                  {Object.entries(CATEGORIA_GROOMING_LABEL).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </Select>
              </FieldGroup>

              <FieldGroup label="Precio Base (Bs.)">
                <Input
                  type="number"
                  step="1"
                  min="0"
                  value={nuevoPrecio}
                  onChange={(e) => setNuevoPrecio(e.target.value)}
                  placeholder="Bs. 0.00"
                  required
                />
              </FieldGroup>
            </div>

            <FieldGroup label="Duración Estimada (minutos)">
              <Input
                type="number"
                step="15"
                min="15"
                value={nuevaDuracion}
                onChange={(e) => setNuevaDuracion(parseInt(e.target.value) || 45)}
                required
              />
            </FieldGroup>

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setModalNuevo(false)} disabled={guardando}>
                Cancelar
              </Button>
              <Button type="submit" variant="primary" disabled={guardando}>
                {guardando ? 'Guardando...' : 'Crear Servicio'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal Configurar Servicio */}
      {servicioAConfigurar && (
        <ServicioConfigModal
          servicio={servicioAConfigurar}
          onClose={() => setServicioAConfigurar(null)}
          onSaved={() => recargar()}
        />
      )}
    </div>
  )
}
