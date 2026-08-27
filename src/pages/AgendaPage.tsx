import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, MessageCircle, Plus } from 'lucide-react'
import { AvisoError } from '../components/ui/AvisoError'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { useAuth } from '../context/AuthContext'
import { useSuscripcionTabla, useTable } from '../mocks/useDb'
import { useMultiSucursal } from '../hooks/usePlanActivo'
import { NuevaCitaModal } from '../features/agenda/NuevaCitaModal'
import { CitaDetalleModal } from '../features/agenda/CitaDetalleModal'
import { clinicMonth, formatClinicDate, formatClinicTime, TIMEZONE } from '../lib/datetime'
import { ESTADO_LABEL, ESTADO_TONE, TIPO_LABEL, TIPO_TONE } from '../lib/citas'
import { listCitas } from '../services/citas'
import { peluqueroAcotado, veterinarioAcotado } from '../lib/personal'
import { CONSULTA_MD } from '../hooks/useMediaQuery'
import type { CitaConDetalle } from '../types/views'
import { clsx } from 'clsx'

type Vista = 'dia' | 'semana' | 'mes'

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

/**
 * Rótulo de un día en la zona de la clínica.
 *
 * Los `dias` son `Date` a medianoche LOCAL, pero `sameDay` los resuelve en
 * `America/La_Paz`. Con `toLocaleDateString` sin zona, la etiqueta se calculaba
 * en la del navegador: en un equipo con otro huso, la celda rotulada "19"
 * mostraba las citas del 18. Toda la pantalla quedaba coherente consigo misma
 * salvo por un día de desfase, que es la forma más difícil de detectar.
 */
function etiquetaDia(date: Date, opciones: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('es-BO', { ...opciones, timeZone: TIMEZONE }).format(date)
}

export function AgendaPage() {
  const { usuario, sucursalActivaId } = useAuth()
  // Solo la señal de cambio, no los datos: `listCitas` de abajo ya pide —bien—
  // únicamente los días que se pintan. Con `useTable('citas')` la agenda
  // descargaba además la tabla ENTERA de citas (`select('*')` sin filtro, hasta
  // el corte de 1000 filas) en cada vista, solo para tirarla.
  const revisionCitas = useSuscripcionTabla('citas')
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

  // Un veterinario o un peluquero ve solo sus citas; admin y recepción, las de la sucursal.
  const soloMisCitas = veterinarioAcotado(usuario) ?? peluqueroAcotado(usuario)

  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  async function recargar() {
    // Solo se piden las citas de los días que se están pintando. Antes se traía
    // la tabla entera, que PostgREST corta en 1000 filas: en una clínica con
    // historial, los días recientes podían quedar fuera del lote y la agenda
    // aparecía vacía sin ningún error.
    const data = await listCitas(sucursalActivaId || undefined, rangoVisible, soloMisCitas)
    setCitas(data)
    if (citaSeleccionada) {
      setCitaSeleccionada(data.find((c) => c.id === citaSeleccionada.id) ?? null)
    }
  }

  const dias = useMemo(() => {
    if (vista === 'dia') return [fechaRef]
    if (vista === 'semana') {
      const inicio = startOfWeek(fechaRef)
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(inicio)
        d.setDate(d.getDate() + i)
        return d
      })
    }
    // vista mes
    const primerDiaMes = new Date(fechaRef.getFullYear(), fechaRef.getMonth(), 1)
    const inicio = startOfWeek(primerDiaMes)
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(inicio)
      d.setDate(d.getDate() + i)
      return d
    })
  }, [vista, fechaRef])

  /**
   * Ventana que se pide a la base: desde el arranque del primer día visible
   * hasta el final del último.
   *
   * Se memoiza por sus extremos (no por la identidad de los `Date`) para que el
   * efecto de recarga no se dispare en cada render.
   */
  const rangoVisible = useMemo(() => {
    const primero = new Date(dias[0])
    primero.setHours(0, 0, 0, 0)
    const ultimo = new Date(dias[dias.length - 1])
    ultimo.setHours(23, 59, 59, 999)
    return { desde: primero.toISOString(), hasta: ultimo.toISOString() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dias[0]?.getTime(), dias[dias.length - 1]?.getTime()])

  // Va aquí abajo y no junto al resto de estado porque depende de
  // `rangoVisible`, y el array de dependencias se evalúa durante el render.
  useEffect(() => {
    setErrorCarga(null)
    recargar().catch((err) =>
      setErrorCarga(err instanceof Error ? err.message : 'No se pudo cargar la agenda'),
    )
    // Al cambiar de día, semana o mes hay que volver a pedir: la consulta va
    // acotada a lo que se pinta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sucursalActivaId, rangoVisible, soloMisCitas, revisionCitas])

  function irA(delta: number) {
    const d = new Date(fechaRef)
    if (vista === 'dia') {
      d.setDate(d.getDate() + delta)
    } else if (vista === 'semana') {
      d.setDate(d.getDate() + delta * 7)
    } else {
      d.setMonth(d.getMonth() + delta)
    }
    setFechaRef(d)
  }

  // Mes y año como referencia principal; el detalle del período va como subtítulo.
  const referenceDate = vista === 'mes' ? fechaRef : dias[0]
  const tituloPeriodo = etiquetaDia(referenceDate, { month: 'long', year: 'numeric' })
  const subtituloPeriodo =
    vista === 'dia'
      ? etiquetaDia(dias[0], { weekday: 'long', day: 'numeric', month: 'long' })
      : vista === 'semana'
        ? `${formatClinicDate(dias[0].toISOString())} — ${formatClinicDate(dias[6].toISOString())}`
        : 'Vista mensual'

  return (
    <div className="space-y-5">
      <AvisoError mensaje={errorCarga} />

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">Agenda</h1>
          <p className="mt-1 text-[11px] font-bold uppercase tracking-widest text-teal-600/80">
            {/* Con la agenda acotada hay que decirlo: un veterinario que ve tres
                citas donde la clínica tiene doce pensaría que se perdieron. */}
            {soloMisCitas
              ? 'Tus citas asignadas'
              : !multiSucursal
                ? 'Citas y agenda diaria'
                : usuario?.rol === 'admin'
                  ? 'Todas las citas de la clínica'
                  : 'Citas de tu sucursal'}
          </p>
        </div>
        <Button data-tour="agenda-nueva-cita" onClick={() => setModalNueva(true)} className="w-full shadow-lg shadow-teal-500/20 sm:w-auto">
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

        <div data-tour="agenda-vistas" className="flex w-full rounded-xl border border-slate-200/80 bg-slate-100/80 p-1 shadow-inner shadow-slate-200/50 backdrop-blur-sm sm:w-auto">
          {(['dia', 'semana', 'mes'] as Vista[]).map((v) => (
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

      {/* La semana son 7 días (lunes a domingo).
          El usuario solicitó que quepan los 7 días en la pantalla sin scroll. */}
      <div className={clsx(vista !== 'dia' && 'pb-2')}>
        {vista === 'mes' && (
          <div className="grid grid-cols-7 gap-1 sm:gap-2 md:gap-3 mb-1 sm:mb-2 md:mb-3">
            {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(d => (
              <div key={d} className="text-center font-bold text-xs text-slate-500 uppercase tracking-widest">
                <span className="hidden md:inline">{d}</span>
                <span className="md:hidden">{d.charAt(0)}</span>
              </div>
            ))}
          </div>
        )}
        <div
          className={clsx(
            'grid gap-1 sm:gap-2 md:gap-3',
            vista === 'dia' ? 'grid-cols-1' : 'grid-cols-7',
          )}
        >
          {dias.map((dia) => {
            const citasDelDia = citas.filter((c) => sameDay(c.fecha_hora, dia))
            const esHoy = sameDay(new Date().toISOString(), dia)
            const esMesActual = vista === 'mes' ? clinicMonth(dia.toISOString()) === clinicMonth(fechaRef.toISOString()) : true
            const diaSemana = new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, weekday: 'short' }).format(dia)
            const esFinDeSemana = diaSemana === 'Sat' || diaSemana === 'Sun'
            const dayNumber = etiquetaDia(dia, { day: 'numeric' })
            const diaLargo = etiquetaDia(dia, { weekday: 'long' })
            const diaCorto = etiquetaDia(dia, { weekday: 'short' }).replace('.', '').substring(0, 3)

            const esVistaDia = vista === 'dia'

            return (
              <Card
                key={dia.toISOString()}
                padding="none"
                className={clsx(
                  'flex min-w-0 flex-col transition-colors duration-200',
                  esVistaDia
                    ? 'p-4 sm:p-5 shadow-sm min-h-60'
                    : vista === 'semana'
                      ? 'p-1 md:min-h-48 md:p-2 xl:p-3'
                      : 'p-1 min-h-24 md:min-h-32 md:p-1.5',
                  !esMesActual && 'opacity-50',
                  esHoy
                    ? 'border-teal-500 ring-2 ring-teal-500/15 bg-white'
                    : esFinDeSemana || !esMesActual
                      ? 'bg-slate-50'
                      : 'hover:border-slate-300 bg-white',
                )}
              >
                {/* Cabecera del día */}
                {esVistaDia ? (
                  <div
                    className={clsx(
                      'mb-4 flex items-center justify-between border-b pb-3',
                      esHoy ? 'border-teal-200' : 'border-slate-200',
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-display text-base font-extrabold capitalize text-slate-800 sm:text-lg">
                        {diaLargo}
                      </span>
                      <span className="text-xs font-semibold text-slate-400">
                        ({citasDelDia.length} {citasDelDia.length === 1 ? 'cita' : 'citas'})
                      </span>
                    </div>
                    <span
                      className={clsx(
                        'flex h-7 w-7 shrink-0 select-none items-center justify-center rounded-full font-display text-xs font-black',
                        esHoy ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-800',
                      )}
                    >
                      {dayNumber}
                    </span>
                  </div>
                ) : (
                  <div
                    className={clsx(
                      'mb-1 flex flex-col items-center justify-center gap-1 border-b pb-1 md:mb-2 md:flex-col md:justify-center md:gap-1 md:pb-1.5 xl:flex-row xl:justify-between',
                      esHoy ? 'border-teal-200' : 'border-slate-200',
                    )}
                  >
                    <div className="flex min-w-0 items-baseline gap-2 md:flex-col md:items-center md:gap-0 xl:flex-row xl:items-baseline xl:gap-2">
                      {vista !== 'mes' && (
                        <span
                          className={clsx(
                            'truncate text-[9px] font-extrabold uppercase tracking-widest md:text-[10px]',
                            esHoy ? 'text-teal-700' : 'text-slate-400',
                          )}
                        >
                          <span className="hidden md:inline xl:hidden">{diaCorto}</span>
                          <span className="md:hidden">{diaCorto.charAt(0)}</span>
                          <span className="hidden xl:inline">{diaLargo}</span>
                        </span>
                      )}
                      {citasDelDia.length > 0 && (
                        <span className="hidden shrink-0 text-[10px] font-semibold text-slate-400 md:inline">
                          {citasDelDia.length}{' '}
                          <span className="hidden xl:inline">{citasDelDia.length === 1 ? 'cita' : 'citas'}</span>
                        </span>
                      )}
                    </div>
                    <span
                      className={clsx(
                        'flex h-5 w-5 shrink-0 select-none items-center justify-center rounded-full font-display text-[10px] font-black md:h-6 md:w-6 md:text-xs',
                        esHoy ? 'bg-teal-600 text-white' : 'text-slate-800',
                      )}
                    >
                      {dayNumber}
                    </span>
                  </div>
                )}

                {/* Citas del día */}
                <div
                  className={clsx(
                    'min-w-0 flex-1 overflow-y-auto pr-0.5 [scrollbar-gutter:stable]',
                    esVistaDia ? 'space-y-3' : 'space-y-1 md:space-y-2.5 lg:max-h-80',
                  )}
                >
                  {citasDelDia.length === 0 && (
                    <p className={clsx(
                      'text-center text-slate-400',
                      esVistaDia ? 'py-10 text-sm font-medium' : 'py-2 text-[9px] md:py-6 md:text-[11px]'
                    )}>
                      Sin citas agendadas
                    </p>
                  )}
                  {citasDelDia.map((c) =>
                    esVistaDia ? (
                      /* Vista DÍA: Tarjeta amplia, visible y detallada para celular y desktop */
                      <button
                        key={c.id}
                        onClick={() => setCitaSeleccionada(c)}
                        className="w-full min-w-0 cursor-pointer text-left rounded-xl border border-slate-200 bg-white p-3.5 sm:p-4 shadow-sm hover:border-teal-400 hover:shadow-md transition-all space-y-2.5 outline-none"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-display text-sm font-black text-slate-900 flex items-center gap-1.5">
                            <span className="text-teal-600">🕒</span> {formatClinicTime(c.fecha_hora)}
                          </span>
                          <div className="flex flex-wrap items-center gap-1.5">
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
                            <span title={c.recordatorio_enviado ? 'WhatsApp enviado' : 'WhatsApp pendiente'}>
                              <MessageCircle
                                size={14}
                                className={c.recordatorio_enviado ? 'text-emerald-600' : 'text-slate-300'}
                              />
                            </span>
                          </div>
                        </div>

                        <div>
                          <p className="text-base font-bold text-slate-900 leading-tight">
                            {c.paciente.nombre}
                            {c.paciente.especie && (
                              <span className="ml-2 text-xs font-semibold text-slate-500 capitalize">
                                ({c.paciente.especie}{c.paciente.raza ? ` · ${c.paciente.raza}` : ''})
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-slate-500 font-medium mt-1">
                            Dueño: <span className="text-slate-700 font-semibold">{c.paciente.cliente.nombre}</span>
                            {c.veterinario_nombre && (
                              <> · Vet: <span className="text-slate-700 font-semibold">{c.veterinario_nombre}</span></>
                            )}
                          </p>
                        </div>

                        {(c.servicio_nombre || c.notas) && (
                          <div className="text-xs text-slate-600 bg-slate-50 rounded-lg p-2 border border-slate-100">
                            {c.servicio_nombre && <p className="font-semibold text-teal-800">{c.servicio_nombre}</p>}
                            {c.notas && <p className="italic text-slate-500 mt-0.5">{c.notas}</p>}
                          </div>
                        )}
                      </button>
                    ) : (
                      /* Vista SEMANA o MES: Rejilla compacta de 7 días */
                      <button
                        key={c.id}
                        onClick={() => setCitaSeleccionada(c)}
                        className={clsx(
                          "w-full min-w-0 cursor-pointer overflow-hidden flex justify-center md:block border border-slate-200 bg-white p-1 text-left shadow-sm outline-none transition-colors duration-200 hover:border-teal-400 hover:bg-teal-50/40",
                          vista === 'mes' ? 'rounded md:rounded md:p-1' : 'rounded md:rounded-lg md:p-2'
                        )}
                      >
                        <div className="flex min-w-0 flex-col items-center md:flex-row md:items-center md:gap-1.5">
                          <span className={clsx(
                            "shrink-0 font-bold text-slate-800",
                            vista === 'mes' ? 'text-[8px] md:text-[9px]' : 'text-[9px] md:text-[11px]'
                          )}>
                            {formatClinicTime(c.fecha_hora)}
                          </span>
                          {vista !== 'mes' && (
                            <span
                              className="ml-auto shrink-0"
                              title={
                                c.recordatorio_enviado
                                  ? 'Recordatorio de WhatsApp enviado'
                                  : 'Recordatorio de WhatsApp pendiente'
                              }
                            >
                              <MessageCircle
                                size={10}
                                className={clsx(
                                  'md:h-3 md:w-3',
                                  c.recordatorio_enviado ? 'text-emerald-600' : 'text-slate-300'
                                )}
                              />
                            </span>
                          )}
                        </div>

                        <p className={clsx(
                          "hidden truncate font-bold leading-tight text-slate-900 md:block",
                          vista === 'mes' ? 'mt-0.5 text-[9px]' : 'mt-1 text-xs'
                        )}>
                          {c.paciente.nombre}
                        </p>

                        {vista !== 'mes' && (
                          <div className="mt-1 hidden min-w-0 flex-col items-start gap-1 md:flex md:mt-1.5">
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
                        )}
                      </button>
                    )
                  )}
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
