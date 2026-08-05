import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { clsx } from 'clsx'
import {
  AlertTriangle,
  ArrowLeft,
  BedDouble,
  IdCard,
  MessageCircle,
  PawPrint,
  Printer,
  Stethoscope,
  Calendar,
  Clock,
  FlaskConical,
  Activity,
  Scissors,
} from 'lucide-react'
import { Card } from '../components/ui/Card'
import { Modal } from '../components/ui/Modal'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Field'
import { getFichaPaciente } from '../services/clientesPacientes'
import { iniciarConsultaLibre, iniciarHistorialDesdeCita } from '../services/historial'
import { FichaConsulta } from '../features/pacientes/FichaConsulta'
import { useAuth } from '../context/AuthContext'
import { calcularEdad } from '../lib/paciente'
import { formatClinicDate, formatClinicDateTime, formatClinicTime } from '../lib/datetime'
import { etiquetaDias, ESTADO_INTERNACION_LABEL, ESTADO_INTERNACION_TONE } from '../lib/internacion'
import type { CitaConDetalle, FichaPaciente } from '../types/views'
import { avisoDeCita } from '../services/programados'
import { MensajeModal } from '../features/asistente/MensajeModal'
import { TIPO_LABEL, TIPO_TONE, ESTADO_LABEL, ESTADO_TONE } from '../lib/citas'

const ESPECIE_LABEL: Record<string, string> = {
  canino: 'Canino',
  felino: 'Felino',
  ave: 'Ave',
  exotico: 'Exótico',
  otro: 'Otro',
}

/** Par etiqueta/valor compacto, para no apilar párrafos sueltos. */
function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{etiqueta}</dt>
      <dd className="truncate text-sm font-semibold text-slate-800" title={valor}>
        {valor}
      </dd>
    </div>
  )
}

export function FichaPacientePage() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { usuario, sucursalActivaId } = useAuth()
  const [ficha, setFicha] = useState<FichaPaciente | null>(null)
  const [motivoNuevaConsulta, setMotivoNuevaConsulta] = useState('')
  const [creando, setCreando] = useState(false)
  const [nuevoHistorialId, setNuevoHistorialId] = useState<string | null>(null)
  /** Cita cuyo recordatorio se está revisando antes de mandarlo. */
  const [avisoCita, setAvisoCita] = useState<CitaConDetalle | null>(null)
  const [consultaAbierta, setConsultaAbierta] = useState<string | null>(null)
  const [historialModal, setHistorialModal] = useState<any | null>(null)
  const [abriendoConsultaId, setAbriendoConsultaId] = useState<string | null>(null)
  const [errorConsulta, setErrorConsulta] = useState<string | null>(null)
  const tarjetaAbiertaRef = useRef<HTMLDivElement | null>(null)

  // Al llegar desde la Agenda ("Registrar historial clínico") se abre esa consulta.
  const historialDestacado = searchParams.get('historial') ?? nuevoHistorialId

  // Esa consulta se despliega dentro de la tarjeta de su cita y se trae a la vista.
  useEffect(() => {
    if (historialDestacado) setConsultaAbierta(historialDestacado)
  }, [historialDestacado])

  useEffect(() => {
    if (!consultaAbierta) return
    const id = setTimeout(() => tarjetaAbiertaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100)
    return () => clearTimeout(id)
  }, [consultaAbierta])

  async function recargar() {
    if (!id) return
    setFicha(await getFichaPaciente(id))
  }

  useEffect(() => {
    recargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function handleNuevaConsulta() {
    if (!id || !usuario || !motivoNuevaConsulta.trim()) return
    setCreando(true)
    try {
      const sucursalId = sucursalActivaId || usuario.sucursal_id || 'sucursal-centro'
      const historial = await iniciarConsultaLibre(id, sucursalId, usuario.id, motivoNuevaConsulta.trim())
      setMotivoNuevaConsulta('')
      setNuevoHistorialId(historial.id)
      await recargar()
      setHistorialModal(historial)
    } finally {
      setCreando(false)
    }
  }

  /** Abre (o recupera) la ficha clínica de una cita y la abre en modal sin scroll. */
  async function handleRegistrarConsulta(citaId: string) {
    setAbriendoConsultaId(citaId)
    setErrorConsulta(null)
    try {
      const historial = await iniciarHistorialDesdeCita(citaId)
      await recargar()
      setHistorialModal(historial)
    } catch (err) {
      setErrorConsulta(err instanceof Error ? err.message : 'No se pudo abrir la consulta')
    } finally {
      setAbriendoConsultaId(null)
    }
  }

  /**
   * Abre el aviso para revisarlo. El texto lo redacta el asistente y sale por
   * WhatsApp solo cuando alguien lo ha leído (ver features/asistente).
   */
  function handleEnviarRecordatorio(citaId: string) {
    const cita = ficha?.citas.find((c) => c.id === citaId)
    if (cita) setAvisoCita(cita)
  }

  if (!ficha) {
    return <p className="text-sm text-slate-500">Cargando ficha del paciente…</p>
  }

  const { paciente, historiales, internaciones, citas } = ficha
  // Cada consulta pertenece a una cita: así la tarjeta sabe qué ficha desplegar.
  const historialPorCita = new Map(historiales.map((h) => [h.cita_id, h]))
  const consultasAbiertas = historiales.filter((h) => h.editable).length
  const internacion = paciente.internacion_activa
  const todayStr = formatClinicDate(new Date().toISOString())
  const citasHoy = citas.filter((c) => formatClinicDate(c.fecha_hora) === todayStr)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/pacientes"
          className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400 transition-colors hover:text-teal-600"
        >
          <ArrowLeft size={14} /> Volver a pacientes
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to={`/pacientes/${paciente.id}/historial/imprimir`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50"
          >
            <Printer size={14} /> Historial
          </Link>
          <Link
            to={`/pacientes/${paciente.id}/reporte/consulta`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-teal-200 bg-teal-50/70 px-3 py-2 text-xs font-bold text-teal-800 hover:bg-teal-100"
          >
            <Stethoscope size={14} /> Inf. Consulta
          </Link>
          <Link
            to={`/pacientes/${paciente.id}/reporte/laboratorio`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50/70 px-3 py-2 text-xs font-bold text-indigo-800 hover:bg-indigo-100"
          >
            <FlaskConical size={14} /> Inf. Laboratorio
          </Link>
          <Link
            to={`/pacientes/${paciente.id}/reporte/imagenologia`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-purple-200 bg-purple-50/70 px-3 py-2 text-xs font-bold text-purple-800 hover:bg-purple-100"
          >
            <Activity size={14} /> Inf. Imagenología
          </Link>
          <Link
            to={`/pacientes/${paciente.id}/reporte/cirugia`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50/70 px-3 py-2 text-xs font-bold text-rose-800 hover:bg-rose-100"
          >
            <Scissors size={14} /> Inf. Cirugía
          </Link>
        </div>
      </div>

      {/* Dos columnas: la ficha queda fija a la izquierda y el historial ocupa el ancho restante */}
      <div className="grid items-start gap-5 lg:grid-cols-3">
        <div className="space-y-4 lg:sticky lg:top-6">
          {/* Identificación del paciente */}
          <Card className="border border-slate-200/50 bg-[radial-gradient(ellipse_at_top_right,_var(--color-teal-50)_0%,_white_80%)]">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 select-none items-center justify-center rounded-2xl bg-gradient-to-tr from-teal-600 to-teal-400 text-white shadow-lg shadow-teal-500/20">
                <PawPrint size={24} />
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="truncate font-display text-xl font-black leading-tight text-slate-900">
                  {paciente.nombre}
                </h1>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <Badge tone="teal" size="sm">
                    {ESPECIE_LABEL[paciente.especie]}
                  </Badge>
                  {internacion && (
                    <Badge tone="rose" size="sm">
                      Internado
                    </Badge>
                  )}
                  {consultasAbiertas > 0 && (
                    <Badge tone="amber" size="sm">
                      {consultasAbiertas} en curso
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4">
              <Dato etiqueta="Raza" valor={paciente.raza || '—'} />
              <Dato etiqueta="Sexo" valor={paciente.sexo} />
              <Dato etiqueta="Edad" valor={calcularEdad(paciente.fecha_nacimiento)} />
              <Dato
                etiqueta="Nacimiento"
                valor={paciente.fecha_nacimiento ? formatClinicDate(`${paciente.fecha_nacimiento}T12:00:00Z`) : '—'}
              />
            </dl>
          </Card>

          {/* Estadía en curso: es lo primero que debe saltar al abrir la ficha */}
          {internacion && (
            <Card className="border border-teal-300 bg-teal-50/60">
              <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-teal-700">
                <BedDouble size={14} /> Paciente internado
              </p>
              <p className="mt-2 text-sm font-bold text-slate-900">
                {etiquetaDias(internacion.dias)} de estadía
                {internacion.jaula && <span className="font-semibold text-slate-600"> · {internacion.jaula}</span>}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                Desde el {formatClinicDateTime(internacion.fecha_ingreso)}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-slate-600">{internacion.motivo}</p>
              <Button
                className="mt-3 w-full"
                onClick={() => navigate(`/internacion?internacion=${internacion.id}`)}
              >
                <BedDouble size={15} /> Ver internación
              </Button>
            </Card>
          )}

          {/* Orden del Día (Citas de Hoy): destacado como la tarjeta de internación */}
          {citasHoy.length > 0 && (
            <Card className="border border-teal-300 bg-teal-50/40">
              <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-teal-700">
                <Calendar size={14} /> Orden del Día
              </p>
              
              <div className="mt-3 space-y-3">
                {citasHoy.map((c) => {
                  const esCirugia = c.tipo_cita === 'cirugia'
                  const esPendiente = c.estado === 'pendiente' || c.estado === 'confirmada'
                  
                  return (
                    <div key={c.id} className="border-b border-teal-100/50 last:border-0 pb-3 last:pb-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-800">
                          <Clock size={12} className="text-teal-600" />
                          {formatClinicTime(c.fecha_hora)}
                        </span>
                        <Badge tone={TIPO_TONE[c.tipo_cita]} size="sm">
                          {c.servicio_nombre || TIPO_LABEL[c.tipo_cita]}
                        </Badge>
                        <Badge tone={ESTADO_TONE[c.estado]} size="sm">
                          {ESTADO_LABEL[c.estado]}
                        </Badge>
                      </div>
                      
                      <p className="mt-1 text-xs text-slate-500 font-medium">
                        Vet: <span className="font-semibold text-slate-700">{c.veterinario_nombre}</span>
                      </p>
                      
                      {c.notas && (
                        <p className="mt-1 text-[11px] text-slate-600 bg-white/70 p-1.5 rounded border border-teal-100/20 italic">
                          {c.notas}
                        </p>
                      )}
                      
                      <div className="mt-2 flex flex-col gap-1 text-[11px]">
                        {/* Generación/visualización de consentimiento de cirugía */}
                        {esCirugia && (
                          c.consentimiento ? (
                            <span className="text-emerald-600 font-semibold flex items-center gap-1">
                              ✓ Consentimiento firmado
                            </span>
                          ) : (
                            <Link
                              to={`/consentimientos/${c.id}`}
                              className="text-rose-600 hover:text-rose-700 hover:underline font-bold flex items-center gap-1"
                            >
                              → Generar consentimiento
                            </Link>
                          )
                        )}
                        
                        {/* Recordatorio de WhatsApp */}
                        {esPendiente && (
                          c.recordatorio_enviado ? (
                            <span className="text-slate-400 flex items-center gap-1">
                              ✓ Recordatorio enviado
                            </span>
                          ) : (
                            <button
                              onClick={() => handleEnviarRecordatorio(c.id)}
                              className="text-teal-600 hover:text-teal-700 hover:underline font-bold text-left flex items-center gap-1 cursor-pointer"
                            >
                              → Preparar recordatorio WhatsApp
                            </button>
                          )
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </Card>
          )}

          {/* Responsable */}
          <Card className="border border-slate-200/50">
            <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">Responsable</p>
            <p className="truncate text-sm font-bold text-slate-800">{paciente.cliente.nombre}</p>
            <p className="mt-1.5 flex items-center gap-1.5 text-sm font-semibold text-slate-500">
              <MessageCircle size={14} className="shrink-0 text-teal-500" /> {paciente.cliente.whatsapp}
            </p>
            {paciente.cliente.ci && (
              <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-400">
                <IdCard size={13} className="shrink-0" /> CI {paciente.cliente.ci}
              </p>
            )}
          </Card>

          {/* Antecedentes clínicos */}
          <Card className="border border-slate-200/50">
            <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">Antecedentes</p>
            {paciente.alergias ? (
              <p className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                <span>
                  <span className="font-bold">Alergias:</span> {paciente.alergias}
                </span>
              </p>
            ) : (
              <p className="text-xs text-slate-400">Sin alergias registradas.</p>
            )}
            {paciente.antecedentes ? (
              <p className="mt-2 text-xs leading-relaxed text-slate-600">{paciente.antecedentes}</p>
            ) : (
              <p className="mt-2 text-xs text-slate-400">Sin antecedentes registrados.</p>
            )}
          </Card>
        </div>

        {/* Columna del historial */}
        <div className="space-y-4 lg:col-span-2">
          <Card className="border border-teal-100 bg-teal-50/20">
            <h2 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-800">
              <Stethoscope size={15} className="text-teal-600" /> Iniciar nueva consulta médica
            </h2>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Input
                className="flex-1"
                placeholder="Motivo (ej. control de rutina, vacunas, herida, vómitos…)"
                value={motivoNuevaConsulta}
                onChange={(e) => setMotivoNuevaConsulta(e.target.value)}
              />
              <Button
                onClick={handleNuevaConsulta}
                disabled={creando || !motivoNuevaConsulta.trim()}
                className="shrink-0 shadow-md shadow-teal-500/10"
              >
                {creando ? 'Iniciando…' : 'Iniciar consulta'}
              </Button>
            </div>
          </Card>

          {/* Citas y consultas: la ficha clínica se despliega dentro de su propia cita */}
          <div>
            <div className="mb-3 flex items-baseline justify-between gap-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">Citas e historial clínico</h2>
              <span className="text-xs text-slate-400">
                {citas.length} {citas.length === 1 ? 'cita' : 'citas'} · {historiales.length}{' '}
                {historiales.length === 1 ? 'consulta' : 'consultas'}
              </span>
            </div>

            {errorConsulta && (
              <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
                {errorConsulta}
              </div>
            )}

            <div className="space-y-2">
              {citas.map((c) => {
                const esCirugia = c.tipo_cita === 'cirugia'
                const esPendiente = c.estado === 'pendiente' || c.estado === 'confirmada'
                const historial = historialPorCita.get(c.id)
                const desplegada = !!historial && historial.id === consultaAbierta

                return (
                  <div
                    key={c.id}
                    ref={desplegada ? tarjetaAbiertaRef : null}
                    className={clsx(
                      'rounded-xl border bg-white shadow-sm transition-colors',
                      desplegada ? 'border-teal-300 ring-1 ring-teal-300/20' : 'border-slate-200',
                    )}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3 p-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-bold text-slate-800">
                            {formatClinicDate(c.fecha_hora)} {formatClinicTime(c.fecha_hora)}
                          </span>
                          <Badge tone={TIPO_TONE[c.tipo_cita]} size="sm">
                            {c.servicio_nombre || TIPO_LABEL[c.tipo_cita]}
                          </Badge>
                          <Badge tone={ESTADO_TONE[c.estado]} size="sm">
                            {ESTADO_LABEL[c.estado]}
                          </Badge>
                          {historial && (
                            <Badge tone={historial.editable ? 'teal' : 'slate'} size="sm">
                              {historial.editable ? 'Consulta en borrador' : 'Consulta cerrada'}
                            </Badge>
                          )}
                        </div>

                        <p className="mt-1.5 text-xs font-medium text-slate-500">
                          Veterinario: <span className="font-semibold text-slate-700">{c.veterinario_nombre}</span>
                        </p>

                        {c.notas && (
                          <p className="mt-1 rounded-lg border border-slate-100 bg-slate-50 p-2 text-xs text-slate-600">
                            <span className="mb-0.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                              Notas de agenda:
                            </span>
                            {c.notas}
                          </p>
                        )}
                      </div>

                      <div className="flex shrink-0 flex-col items-end justify-center gap-1.5 text-xs">
                        {/* Generación/visualización de consentimiento de cirugía */}
                        {esCirugia &&
                          (c.consentimiento ? (
                            <span className="text-[11px] font-semibold text-emerald-600">
                              ✓ Consentimiento firmado
                            </span>
                          ) : (
                            <Link
                              to={`/consentimientos/${c.id}`}
                              className="font-bold text-rose-600 hover:text-rose-700 hover:underline"
                            >
                              → Generar consentimiento
                            </Link>
                          ))}

                        {/* Recordatorio de WhatsApp */}
                        {esPendiente &&
                          (c.recordatorio_enviado ? (
                            <span className="text-[11px] text-slate-400">✓ Recordatorio enviado</span>
                          ) : (
                            <button
                              onClick={() => handleEnviarRecordatorio(c.id)}
                              className="cursor-pointer font-bold text-teal-600 hover:text-teal-700 hover:underline"
                            >
                              → Preparar recordatorio WhatsApp
                            </button>
                          ))}

                        {/* Acciones de la tarjeta: Abrir consulta en modal y descargar informes */}
                        <div className="flex flex-wrap items-center gap-2">
                          {historial ? (
                            <button
                              onClick={() => setHistorialModal(historial)}
                              className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-bold text-teal-800 hover:bg-teal-100"
                            >
                              <Stethoscope size={13} /> Ver consulta médica
                            </button>
                          ) : (
                            c.estado !== 'cancelada' && (
                              <button
                                onClick={() => handleRegistrarConsulta(c.id)}
                                disabled={abriendoConsultaId === c.id}
                                className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-bold text-teal-800 hover:bg-teal-100 disabled:opacity-50"
                              >
                                → {abriendoConsultaId === c.id ? 'Abriendo…' : 'Registrar consulta médica'}
                              </button>
                            )
                          )}

                          {/* Enlace directo para descargar/imprimir informe según tipo */}
                          <Link
                            to={
                              esCirugia
                                ? `/pacientes/${paciente.id}/reporte/cirugia/${c.id}`
                                : c.servicio_nombre?.toLowerCase().includes('lab')
                                  ? `/pacientes/${paciente.id}/reporte/laboratorio/${c.id}`
                                  : c.servicio_nombre?.toLowerCase().includes('eco') || c.servicio_nombre?.toLowerCase().includes('rayo')
                                    ? `/pacientes/${paciente.id}/reporte/imagenologia/${c.id}`
                                    : `/pacientes/${paciente.id}/reporte/consulta/${historial?.id || c.id}`
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            <Printer size={12} /> Informes PDF
                          </Link>
                        </div>
                      </div>
                    </div>

                    {desplegada && historial && (
                      <div className="rounded-b-xl border-t border-slate-100 bg-white px-4 py-4">
                        <FichaConsulta historial={historial} onChanged={recargar} />
                      </div>
                    )}
                  </div>
                )
              })}

              {citas.length === 0 && (
                <Card className="border border-dashed border-slate-200 py-6 text-center">
                  <p className="text-sm text-slate-400">No hay citas registradas para este paciente.</p>
                </Card>
              )}
            </div>
          </div>

          {internaciones.length > 0 && (
            <div>
              <div className="mb-3 flex items-baseline justify-between gap-2">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">Internaciones</h2>
                <span className="text-xs text-slate-400">
                  {internaciones.length} {internaciones.length === 1 ? 'estadía' : 'estadías'}
                </span>
              </div>
              <ul className="space-y-2">
                {internaciones.map((i) => (
                  <li
                    key={i.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-slate-800" title={i.motivo}>
                        {i.motivo}
                      </p>
                      <p className="mt-0.5 text-[11px] font-semibold text-slate-400">
                        {formatClinicDateTime(i.fecha_ingreso)} →{' '}
                        {i.fecha_alta ? formatClinicDateTime(i.fecha_alta) : 'en curso'} · Dr(a).{' '}
                        {i.veterinario_nombre}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge tone={ESTADO_INTERNACION_TONE[i.estado]} size="sm">
                        {ESTADO_INTERNACION_LABEL[i.estado]} · {etiquetaDias(i.dias)}
                      </Badge>
                      <Link
                        to={`/internaciones/${i.id}/imprimir`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        <Printer size={13} /> Hoja
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

        </div>
      </div>

      {/* Recordatorio: se redacta, se revisa y recién entonces sale */}
      {avisoCita && (
        <MensajeModal
          aviso={avisoDeCita(avisoCita)}
          onClose={() => setAvisoCita(null)}
          onEnviado={async () => {
            setAvisoCita(null)
            await recargar()
          }}
        />
      )}

      {/* Modal flotante de Consulta Médica (Ventana nueva sin scroll anidado) */}
      {historialModal && (
        <Modal
          title={`Ficha de Consulta Médica — ${paciente.nombre}`}
          widthClassName="max-w-4xl"
          onClose={() => setHistorialModal(null)}
        >
          <FichaConsulta
            historial={historialModal}
            onChanged={async () => {
              await recargar()
              const fichaActualizada = await getFichaPaciente(paciente.id)
              const h = fichaActualizada?.historiales.find((item) => item.id === historialModal.id)
              if (h) setHistorialModal(h)
            }}
          />
        </Modal>
      )}
    </div>
  )
}
