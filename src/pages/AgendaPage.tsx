import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, MessageCircle, Plus } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { useAuth } from '../context/AuthContext'
import { useTable } from '../mocks/useDb'
import { useMultiSucursal } from '../hooks/usePlanActivo'
import { NuevaCitaModal } from '../features/agenda/NuevaCitaModal'
import { CitaDetalleModal } from '../features/agenda/CitaDetalleModal'
import { formatClinicDate, formatClinicTime, TIMEZONE } from '../lib/datetime'
import { ESTADO_LABEL, ESTADO_TONE, TIPO_LABEL, TIPO_TONE } from '../lib/citas'
import { listCitas } from '../services/citas'
import { CONSULTA_MD } from '../hooks/useMediaQuery'
import type { CitaConDetalle } from '../types/views'
import { clsx } from 'clsx'

type Vista = 'dia' | 'semana'

function startOfWeek(date: Date): Date {
  const d = new Date(date)
  const day = (d.getDay() + 6) % 7 // lunes = 0
  d.setDate(d.getDate() - day)
  d.setHours(0, 0, 0, 0)
  return d
}

function sameDay(iso: string, date: Date): boolean {
  const citaDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(new Date(iso))
  const targetStr = new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(date)
  return citaDateStr === targetStr
}

export function AgendaPage() {
  const { usuario, sucursalActivaId } = useAuth()
  useTable('citas') // fuerza re-render cuando cambian las citas del mock store
  // En un celular la semana son siete tarjetas apiladas: se arranca en el día y
  // queda a un toque cambiar. Solo es el valor inicial — la elección manda.
  const [vista, setVista] = useState<Vista>(() =>
    window.matchMedia(CONSULTA_MD).matches ? 'semana' : 'dia',
  )
  const [fechaRef, setFechaRef] = useState(new Date())
  const [citas, setCitas] = useState<CitaConDetalle[]>([])
  const [modalNueva, setModalNueva] = useState(false)
  const [citaSeleccionada, setCitaSeleccionada] = useState<CitaConDetalle | null>(null)

  const sucursales = useTable('sucursales')
  const sucursalId = sucursalActivaId || sucursales[0]?.id
  const multiSucursal = useMultiSucursal()

  async function recargar() {
    const data = await listCitas(sucursalActivaId || undefined)
    setCitas(data)
    if (citaSeleccionada) {
      setCitaSeleccionada(data.find((c) => c.id === citaSeleccionada.id) ?? null)
    }
  }

  useEffect(() => {
    recargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sucursalActivaId])

  const dias = useMemo(() => {
    if (vista === 'dia') return [fechaRef]
    const inicio = startOfWeek(fechaRef)
    return Array.from({ length: 5 }, (_, i) => {
      const d = new Date(inicio)
      d.setDate(d.getDate() + i)
      return d
    })
  }, [vista, fechaRef])

  function irA(delta: number) {
    const d = new Date(fechaRef)
    d.setDate(d.getDate() + delta * (vista === 'dia' ? 1 : 7))
    setFechaRef(d)
  }

  // Mes y año como referencia principal; el detalle del período va como subtítulo.
  const tituloPeriodo = dias[0].toLocaleDateString('es-BO', { month: 'long', year: 'numeric' })
  const subtituloPeriodo =
    vista === 'dia'
      ? dias[0].toLocaleDateString('es-BO', { weekday: 'long', day: 'numeric', month: 'long' })
      : `${formatClinicDate(dias[0].toISOString())} — ${formatClinicDate(dias[4].toISOString())}`

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">Agenda</h1>
          <p className="mt-1 text-[11px] font-bold uppercase tracking-widest text-teal-600/80">
            {!multiSucursal
              ? 'Citas y agenda diaria'
              : usuario?.rol === 'admin'
                ? 'Todas las citas de la clínica'
                : 'Citas de tu sucursal'}
          </p>
        </div>
        <Button onClick={() => setModalNueva(true)} className="w-full shadow-lg shadow-teal-500/20 sm:w-auto">
          <Plus size={18} strokeWidth={2.5} /> Nueva Cita
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          {/* Navegación agrupada en un solo control, con sombras premium */}
          <div className="flex items-center overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm ring-1 ring-black/5">
            <button
              onClick={() => irA(-1)}
              aria-label="Anterior"
              className="cursor-pointer px-3 py-2 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              onClick={() => setFechaRef(new Date())}
              className="cursor-pointer border-x border-slate-200/80 px-4 py-2 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50"
            >
              Hoy
            </button>
            <button
              onClick={() => irA(1)}
              aria-label="Siguiente"
              className="cursor-pointer px-3 py-2 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          <div className="min-w-0">
            <p className="truncate font-display text-lg font-bold capitalize leading-tight text-slate-900 sm:text-xl">
              {tituloPeriodo}
            </p>
            <p className="mt-0.5 truncate text-xs font-semibold text-slate-500">{subtituloPeriodo}</p>
          </div>
        </div>

        <div className="flex w-full rounded-xl border border-slate-200/80 bg-slate-100/80 p-1 shadow-inner shadow-slate-200/50 backdrop-blur-sm sm:w-auto">
          {(['dia', 'semana'] as Vista[]).map((v) => (
            <button
              key={v}
              onClick={() => setVista(v)}
              className={clsx(
                'flex-1 cursor-pointer rounded-lg px-5 py-2 text-xs font-bold capitalize transition-all duration-300 sm:flex-none sm:py-1.5',
                vista === v ? 'bg-white text-slate-900 shadow-sm ring-1 ring-black/5' : 'text-slate-500 hover:text-slate-700',
              )}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* La semana son 5 días (lunes a viernes) para no necesitar scroll horizontal.
          En celular ni siquiera eso cabe —cinco columnas en 360 px dejan 65 px por
          día—, así que se apilan; la rejilla vuelve desde `md`. */}
      <div className={clsx(vista === 'semana' && 'pb-2')}>
        <div
          className={clsx(
            'grid gap-3',
            vista === 'semana' ? 'grid-cols-1 md:grid-cols-5' : 'grid-cols-1',
          )}
        >
          {dias.map((dia) => {
          const citasDelDia = citas.filter((c) => sameDay(c.fecha_hora, dia))
          const esHoy = sameDay(new Date().toISOString(), dia)
          const esFinDeSemana = dia.getDay() === 0 || dia.getDay() === 6
          const dayNumber = dia.toLocaleDateString('es-BO', { day: 'numeric' })
          // Apilada la tarjeta ocupa el ancho: cabe el día entero. En la rejilla
          // de cinco columnas hay que abreviarlo.
          const diaLargo = dia.toLocaleDateString('es-BO', { weekday: 'long' })
          const diaCorto = dia.toLocaleDateString('es-BO', { weekday: 'short' }).replace('.', '').substring(0, 3)

          return (
            <Card
              key={dia.toISOString()}
              padding="none"
              className={clsx(
                // Sin alto mínimo en celular: apilados, cinco días vacíos de 12 rem
                // serían media pantalla de scroll para nada.
                'flex min-w-0 flex-col p-3 transition-colors duration-200 md:min-h-48 md:p-2 xl:p-3',
                esHoy
                  ? 'border-teal-500 ring-2 ring-teal-500/15'
                  : esFinDeSemana
                    ? 'bg-slate-50'
                    : 'hover:border-slate-300',
              )}
            >
              {/* Cabecera del día */}
              <div
                className={clsx(
                  'mb-2 flex items-center justify-between gap-2 border-b pb-2 md:flex-col md:justify-center md:gap-1 md:pb-1.5 xl:flex-row xl:justify-between',
                  esHoy ? 'border-teal-200' : 'border-slate-200',
                )}
              >
                <div className="flex min-w-0 items-baseline gap-2 md:flex-col md:items-center md:gap-0 xl:flex-row xl:items-baseline xl:gap-2">
                  <span
                    className={clsx(
                      'truncate text-[11px] font-extrabold uppercase tracking-widest md:text-[10px]',
                      esHoy ? 'text-teal-700' : 'text-slate-400',
                    )}
                  >
                    <span className="md:hidden">{diaLargo}</span>
                    <span className="hidden md:inline">{diaCorto}</span>
                  </span>
                  {citasDelDia.length > 0 && (
                    <span className="shrink-0 text-[10px] font-semibold text-slate-400">
                      {citasDelDia.length}{' '}
                      <span className="md:hidden xl:inline">{citasDelDia.length === 1 ? 'cita' : 'citas'}</span>
                    </span>
                  )}
                </div>
                <span
                  className={clsx(
                    'flex h-6 w-6 shrink-0 select-none items-center justify-center rounded-full font-display text-xs font-black',
                    esHoy ? 'bg-teal-600 text-white' : 'text-slate-800',
                  )}
                >
                  {dayNumber}
                </span>
              </div>

              {/* Citas del día: con scroll propio para que un día cargado no estire la
                  fila. `scrollbar-gutter: stable` reserva el hueco de la barra en TODOS
                  los días, para que el día con scroll no tenga chips más estrechos. */}
              <div className="min-w-0 flex-1 space-y-2.5 overflow-y-auto pr-0.5 [scrollbar-gutter:stable] lg:max-h-80">
                {citasDelDia.length === 0 && (
                  <p className="py-6 text-center text-[11px] text-slate-400">Sin citas</p>
                )}
                {citasDelDia.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setCitaSeleccionada(c)}
                    className="w-full min-w-0 cursor-pointer overflow-hidden rounded-lg border border-slate-200 bg-white p-2.5 text-left shadow-sm outline-none transition-colors duration-200 hover:border-teal-400 hover:bg-teal-50/40 md:p-2"
                  >
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="shrink-0 text-[11px] font-bold text-slate-800">
                        {formatClinicTime(c.fecha_hora)}
                      </span>
                      <span
                        className="ml-auto shrink-0"
                        title={
                          c.recordatorio_enviado
                            ? 'Recordatorio de WhatsApp enviado'
                            : 'Recordatorio de WhatsApp pendiente'
                        }
                      >
                        <MessageCircle
                          size={12}
                          className={clsx(c.recordatorio_enviado ? 'text-emerald-600' : 'text-slate-300')}
                        />
                      </span>
                    </div>

                    <p className="mt-1 truncate text-sm font-bold leading-tight text-slate-900 md:text-xs">
                      {c.paciente.nombre}
                    </p>

                    {/* Apilada la tarjeta tiene ancho de sobra para las etiquetas en
                        fila; en la columna de la semana bajan una sobre otra. */}
                    <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1 md:mt-1.5 md:flex-col md:items-start">
                      <Badge tone={TIPO_TONE[c.tipo_cita]} size="sm">
                        {TIPO_LABEL[c.tipo_cita]}
                      </Badge>
                      <Badge tone={ESTADO_TONE[c.estado]} size="sm">
                        {ESTADO_LABEL[c.estado]}
                      </Badge>
                      {c.tipo_cita === 'cirugia' && !c.consentimiento && (
                        <Badge tone="rose" size="sm">
                          Sin firma
                        </Badge>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </Card>
          )
          })}
        </div>
      </div>

      {modalNueva && sucursalId && (
        <NuevaCitaModal
          sucursalId={sucursalId}
          onClose={() => setModalNueva(false)}
          onCreated={() => {
            setModalNueva(false)
            recargar()
          }}
        />
      )}

      {citaSeleccionada && (
        <CitaDetalleModal cita={citaSeleccionada} onClose={() => setCitaSeleccionada(null)} onChanged={recargar} />
      )}
    </div>
  )
}
