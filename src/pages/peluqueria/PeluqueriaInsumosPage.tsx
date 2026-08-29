import { useEffect, useState } from 'react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Boxes, Scissors, Settings } from 'lucide-react'
import { listServiciosPeluqueria } from '../../services/peluqueria'
import { ServicioConfigModal } from '../../features/peluqueria/ServicioConfigModal'
import type { PeluqueriaServicioConConfig } from '../../types/views'
import { useTable } from '../../mocks/useDb'

export function PeluqueriaInsumosPage() {
  const [servicios, setServicios] = useState<PeluqueriaServicioConConfig[]>([])
  const [cargando, setCargando] = useState(true)
  const [servicioSeleccionado, setServicioSeleccionado] = useState<PeluqueriaServicioConConfig | null>(null)
  const productos = useTable('productos')

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

  return (
    <div className="space-y-6">
      {/* Cabecera Principal */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">
            Insumos y Recetas de Consumo
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Vinculación de consumibles (shampoos, acondicionadores, perfumes, medicamentos) con descuento automático de inventario fraccionado.
          </p>
        </div>
      </div>

      {/* Listado de Servicios y sus Insumos Asociados */}
      {cargando ? (
        <p className="text-center py-12 text-xs text-slate-500">Cargando recetas de insumos...</p>
      ) : servicios.length === 0 ? (
        <Card className="p-12 text-center border-slate-200">
          <Boxes size={32} className="mx-auto text-slate-300 mb-2" />
          <p className="text-sm font-semibold text-slate-700">No hay servicios registrados</p>
          <p className="text-xs text-slate-400 mt-1">Crea servicios de peluquería para asociarles recetas de insumos.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {servicios.map((s) => (
            <Card key={s.id} className="p-4 border-slate-200 space-y-3 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700 font-bold">
                      <Scissors size={16} />
                    </div>
                    <h3 className="font-bold text-sm text-slate-900">{s.nombre}</h3>
                  </div>
                  <Badge tone={s.insumos.length > 0 ? 'emerald' : 'slate'}>
                    {s.insumos.length} {s.insumos.length === 1 ? 'insumo' : 'insumos'}
                  </Badge>
                </div>

                {/* Lista de insumos vinculados */}
                <div className="mt-3 space-y-1.5 text-xs">
                  {s.insumos.length > 0 ? (
                    s.insumos.map((ins, idx) => {
                      const prod = productos.find((p) => p.id === ins.producto_id)
                      return (
                        <div
                          key={idx}
                          className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/70 px-3 py-1.5"
                        >
                          <span className="font-medium text-slate-800">{prod?.nombre || 'Insumo'}</span>
                          <span className="font-bold text-teal-700">
                            {ins.cantidad_dosis} {prod?.unidad_medida || 'dosis'}
                          </span>
                        </div>
                      )
                    })
                  ) : (
                    <p className="py-2 text-[11px] text-slate-400 italic">
                      Sin insumos asociados (no descuenta del kardex).
                    </p>
                  )}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setServicioSeleccionado(s)}
                  className="text-xs"
                >
                  <Settings size={13} className="mr-1" />
                  <span>Editar Receta de Insumos</span>
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Modal Configuración de Insumos del Servicio */}
      {servicioSeleccionado && (
        <ServicioConfigModal
          servicio={servicioSeleccionado}
          onClose={() => setServicioSeleccionado(null)}
          onSaved={() => recargar()}
        />
      )}
    </div>
  )
}
