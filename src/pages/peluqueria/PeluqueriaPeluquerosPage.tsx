import { useEffect, useState, useCallback } from 'react'
import { clsx } from 'clsx'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import {
  Users,
  Phone,
} from 'lucide-react'
import { useAuth } from '../../context/useAuth'
import { useTable } from '../../mocks/useDb'
import { formatBs } from '../../lib/currency'
import { puedeHacerPeluqueria } from '../../lib/personal'
import { getResumenComisionesPorPeluquero, type ResumenComisionesPeluquero } from '../../services/comisiones'
import { PeluqueriaComisionesPage } from './PeluqueriaComisionesPage'

/**
 * Equipo de peluqueros y sus comisiones, fusionados en un solo enlace del
 * menú: "Peluqueros" ya mostraba el resumen de comisión pendiente/pagada por
 * tarjeta, así que el detalle línea por línea de `PeluqueriaComisionesPage`
 * —con su propio botón de Liquidar— vive ahora como una segunda pestaña, sin
 * duplicar su lógica.
 *
 * ⚠️ **Las dos pestañas NO son para los mismos roles, y eso no cambia por
 * fusionarlas.** Antes de esto, "Peluqueros" era de `admin`/`recepcion`
 * (roster con nombre, WhatsApp y comisión de TODO el equipo) y "Comisiones"
 * era de `admin`/`peluquero` (`PeluqueriaComisionesPage` fuerza
 * `peluqueroId` al propio usuario cuando el rol es `peluquero` — ni el
 * selector de peluquero ni "Liquidar" se le muestran). Sin este filtro, un
 * `peluquero` que aterrizara en la pestaña "Equipo" vería las ganancias de
 * sus compañeros, algo a lo que nunca tuvo acceso. Por eso cada pestaña se
 * oculta para quien no la tenía antes, y la pestaña inicial depende del rol.
 */
export function PeluqueriaPeluquerosPage() {
  const { sucursalActivaId, usuario } = useAuth()
  const usuarios = useTable('usuarios')
  const peluqueros = usuarios.filter(puedeHacerPeluqueria)

  const veEquipo = usuario?.rol !== 'peluquero'
  const veComisiones = usuario?.rol === 'admin' || usuario?.rol === 'peluquero'

  const [tab, setTab] = useState<'equipo' | 'comisiones'>(veEquipo ? 'equipo' : 'comisiones')

  const [resumenComisiones, setResumenComisiones] = useState<ResumenComisionesPeluquero[]>([])
  const [cargando, setCargando] = useState(true)

  const recargar = useCallback(async () => {
    setCargando(true)
    try {
      const res = await getResumenComisionesPorPeluquero(sucursalActivaId || undefined)
      setResumenComisiones(res)
    } finally {
      setCargando(false)
    }
  }, [sucursalActivaId])

  useEffect(() => {
    recargar()
  }, [recargar])

  return (
    <div className="space-y-6">
      {/* Pestañas — solo se ven las que ese rol tenía antes de fusionar */}
      {veEquipo && veComisiones && (
        <div className="border-b border-slate-200">
          <nav className="-mb-px flex space-x-6" aria-label="Tabs">
            <button
              type="button"
              onClick={() => setTab('equipo')}
              className={clsx(
                tab === 'equipo'
                  ? 'border-teal-500 text-teal-600'
                  : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700',
                'whitespace-nowrap border-b-2 py-3 px-1 text-sm font-medium transition-colors cursor-pointer',
              )}
            >
              Equipo
            </button>
            <button
              type="button"
              onClick={() => setTab('comisiones')}
              className={clsx(
                tab === 'comisiones'
                  ? 'border-teal-500 text-teal-600'
                  : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700',
                'whitespace-nowrap border-b-2 py-3 px-1 text-sm font-medium transition-colors cursor-pointer',
              )}
            >
              Comisiones
            </button>
          </nav>
        </div>
      )}

      {tab === 'comisiones' && veComisiones && <PeluqueriaComisionesPage />}

      {tab === 'equipo' && veEquipo && (
        <div className="space-y-6">
          {/* Cabecera Principal */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-900">
                Equipo de Peluqueros y Estilistas
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Rendimiento, servicios realizados, ingresos generados y comisiones acumuladas por estilista.
              </p>
            </div>
          </div>

          {/* Tarjetas de Peluqueros */}
          {cargando ? (
            <p className="text-center py-12 text-xs text-slate-500">Cargando equipo de estilistas...</p>
          ) : peluqueros.length === 0 ? (
            <Card className="p-12 text-center border-slate-200">
              <Users size={32} className="mx-auto text-slate-300 mb-2" />
              <p className="text-sm font-semibold text-slate-700">No hay personal con rol de peluquería activo</p>
              <p className="text-xs text-slate-400 mt-1">Crea usuarios con rol 'peluquero' en el módulo de personal.</p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {peluqueros.map((p) => {
                const stats = resumenComisiones.find((r) => r.peluqueroId === p.id) || {
                  totalServicios: 0,
                  ingresosGeneradosBs: 0,
                  comisionPendienteBs: 0,
                  comisionLiquidadaBs: 0,
                  totalComisionBs: 0,
                }

                return (
                  <Card key={p.id} className="p-5 border-slate-200 space-y-4">
                    <div className="flex items-center gap-3.5">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-teal-100 text-teal-800 font-black text-lg">
                        {p.nombre.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-bold text-base text-slate-900 truncate">{p.nombre}</h3>
                        <p className="text-xs text-slate-500 capitalize">{p.rol}</p>
                        {p.whatsapp && (
                          <p className="text-[11px] text-slate-600 flex items-center gap-1 mt-0.5">
                            <Phone size={11} className="text-slate-400" />
                            <span>{p.whatsapp}</span>
                          </p>
                        )}
                      </div>
                      <Badge tone={p.activo ? 'emerald' : 'slate'}>
                        {p.activo ? 'Activo' : 'Inactivo'}
                      </Badge>
                    </div>

                    {/* Métricas de Desempeño */}
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 text-xs">
                      <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 space-y-0.5">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Servicios</p>
                        <p className="text-lg font-black text-slate-800">{stats.totalServicios}</p>
                      </div>

                      <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 space-y-0.5">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Ingresos Totales</p>
                        <p className="text-lg font-black text-teal-800">{formatBs(stats.ingresosGeneradosBs)}</p>
                      </div>

                      <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-2.5 space-y-0.5">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Comisión Pendiente</p>
                        <p className="text-lg font-black text-amber-900">{formatBs(stats.comisionPendienteBs)}</p>
                      </div>

                      <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-2.5 space-y-0.5">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Comisión Pagada</p>
                        <p className="text-lg font-black text-emerald-900">{formatBs(stats.comisionLiquidadaBs)}</p>
                      </div>
                    </div>
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
