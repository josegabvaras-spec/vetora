import { useEffect, useState, useCallback } from 'react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import {
  Percent,
  Plus,
  Edit2,
  RefreshCw,
  Gift,
} from 'lucide-react'
import { formatBs } from '../../lib/currency'
import { formatClinicDate } from '../../lib/datetime'
import {
  listPromociones,
  TIPO_PROMOCION_LABEL,
  actualizarPromocion,
} from '../../services/promociones'
import type { PetshopPromocion } from '../../types/database'
import { NuevaPromocionModal } from '../../features/petshop/NuevaPromocionModal'

export function PetshopPromocionesPage() {
  const [promociones, setPromociones] = useState<PetshopPromocion[]>([])
  const [cargando, setCargando] = useState(true)

  const [modalNueva, setModalNueva] = useState(false)
  const [promocionAEditar, setPromocionAEditar] = useState<PetshopPromocion | null>(null)

  const recargar = useCallback(async () => {
    setCargando(true)
    try {
      const data = await listPromociones(false)
      setPromociones(data)
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    recargar()
  }, [recargar])

  async function toggleActivo(promo: PetshopPromocion) {
    await actualizarPromocion(promo.id, { activo: !promo.activo })
    recargar()
  }

  return (
    <div className="space-y-6">
      {/* Cabecera Principal */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900 flex items-center gap-2">
            <Percent className="text-teal-700" size={24} />
            <span>Promociones, Descuentos y Combos</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Configuración de ofertas especiales, cupones de caja, combos de productos y 2x1.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => recargar()}>
            <RefreshCw size={14} className={cargando ? 'animate-spin' : ''} />
          </Button>
          <Button type="button" variant="primary" size="sm" onClick={() => setModalNueva(true)}>
            <Plus size={15} className="mr-1.5" />
            <span>Nueva Promoción</span>
          </Button>
        </div>
      </div>

      {/* Grid de Promociones */}
      {cargando ? (
        <p className="text-center py-16 text-xs text-slate-500">Cargando promociones...</p>
      ) : promociones.length === 0 ? (
        <Card className="p-12 text-center border-slate-200">
          <Gift size={36} className="mx-auto text-slate-300 mb-2" />
          <p className="font-bold text-sm text-slate-700">No hay promociones activas</p>
          <p className="text-xs text-slate-400 mt-1">Crea descuentos o combos para impulsar las ventas en el POS.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {promociones.map((p) => (
            <Card key={p.id} className="p-4 border-slate-200 space-y-3 flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-bold text-base text-slate-900">{p.titulo}</h3>
                    <Badge tone="teal">{TIPO_PROMOCION_LABEL[p.tipo]}</Badge>
                  </div>
                  <Badge tone={p.activo ? 'emerald' : 'slate'}>
                    {p.activo ? 'Activa' : 'Inactiva'}
                  </Badge>
                </div>

                <div className="rounded-xl bg-slate-50 p-3 border border-slate-100 mt-3 space-y-1 text-xs">
                  <div className="flex justify-between font-semibold text-slate-700">
                    <span>Beneficio:</span>
                    <span className="font-black text-teal-800">
                      {p.tipo === 'porcentaje'
                        ? `${p.valor_descuento}% de descuento`
                        : p.tipo === 'dos_por_uno'
                        ? 'Lleva 2 y paga 1'
                        : formatBs(p.valor_descuento)}
                    </span>
                  </div>

                  {p.codigo_cupon && (
                    <div className="flex justify-between text-slate-600 font-mono">
                      <span>Código Cupón:</span>
                      <strong className="text-indigo-800 bg-indigo-50 px-1.5 py-0.5 rounded">
                        {p.codigo_cupon}
                      </strong>
                    </div>
                  )}

                  <div className="flex justify-between text-slate-500 text-[11px] pt-1 border-t border-slate-200">
                    <span>Vigencia:</span>
                    <span>
                      {formatClinicDate(p.fecha_inicio)} - {formatClinicDate(p.fecha_fin)}
                    </span>
                  </div>
                </div>

                {p.descripcion && (
                  <p className="text-xs text-slate-500 italic mt-2">{p.descripcion}</p>
                )}
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => toggleActivo(p)}
                  className={p.activo ? 'text-amber-700' : 'text-emerald-700'}
                >
                  {p.activo ? 'Desactivar' : 'Activar'}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setPromocionAEditar(p)
                    setModalNueva(true)
                  }}
                >
                  <Edit2 size={12} className="mr-1" />
                  <span>Editar</span>
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Modal Nueva / Editar */}
      {modalNueva && (
        <NuevaPromocionModal
          promocionAEditar={promocionAEditar}
          onClose={() => {
            setModalNueva(false)
            setPromocionAEditar(null)
          }}
          onSaved={() => recargar()}
        />
      )}
    </div>
  )
}
