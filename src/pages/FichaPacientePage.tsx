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
  ChevronDown,
  Edit2,
  Trash2,
} from 'lucide-react'
import { Card } from '../components/ui/Card'
import { Modal } from '../components/ui/Modal'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Field'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { getFichaPaciente, eliminarPaciente } from '../services/clientesPacientes'
import { iniciarConsultaLibre, iniciarHistorialDesdeCita } from '../services/historial'
import { FichaConsulta } from '../features/pacientes/FichaConsulta'
import { EditarPacienteModal } from '../features/pacientes/EditarPacienteModal'
import { EsquemaSanitario } from '../features/pacientes/EsquemaSanitario'
import { PeluqueriaTabPaciente } from '../features/pacientes/PeluqueriaTabPaciente'
import { useAuth } from '../context/useAuth'
import { useTable } from '../mocks/useDb'
import { calcularEdad } from '../lib/paciente'
import { puedeVerHistorialClinico } from '../lib/personal'
import { documentosDePaciente } from '../lib/documentos'
import { ListaDocumentos } from '../features/pacientes/ListaDocumentos'
import { listInformesDePaciente, type InformeFirmado } from '../services/informes'
import { listEstudiosDePaciente, type EstudioImagen } from '../services/estudios'
import { formatClinicDate, formatClinicDateTime, formatClinicTime } from '../lib/datetime'
import { etiquetaDias, ESTADO_INTERNACION_LABEL, ESTADO_INTERNACION_TONE } from '../lib/internacion'
import type { CitaConDetalle, FichaPaciente } from '../types/views'
import { avisoDeCita } from '../services/programados'
import { MensajeModal } from '../features/asistente/MensajeModal'
import { FirmarConsentimientoModal } from '../features/agenda/FirmarConsentimientoModal'
import { InternacionModal } from '../features/internacion/InternacionModal'
import { RegistrarEvolucionModal } from '../features/internacion/RegistrarEvolucionModal'
import { VincularCuentaPortalModal } from '../features/pacientes/VincularCuentaPortalModal'
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
  // El peluquero da de alta y consulta la ficha, pero no el expediente
  // clínico: las tres pestañas son historial, vacunas e internaciones.
  const verClinico = puedeVerHistorialClinico(usuario)
  const sucursales = useTable('sucursales')
  const [ficha, setFicha] = useState<FichaPaciente | null | undefined>(undefined)
  const [errorFicha, setErrorFicha] = useState<string | null>(null)
  const [motivoNuevaConsulta, setMotivoNuevaConsulta] = useState('')
  const [creando, setCreando] = useState(false)
  const [nuevoHistorialId, setNuevoHistorialId] = useState<string | null>(null)
  /** Cita cuyo recordatorio se está revisando antes de mandarlo. */
  const [avisoCita, setAvisoCita] = useState<{ cita: CitaConDetalle; destino: 'cliente' | 'equipo' } | null>(null)
  /** Cirugía cuyo consentimiento se está firmando, igual que desde la agenda. */
  const [firmandoCita, setFirmandoCita] = useState<CitaConDetalle | null>(null)
  const [consultaAbierta, setConsultaAbierta] = useState<string | null>(null)
  const [historialModal, setHistorialModal] = useState<any | null>(null)
  const [abriendoConsultaId, setAbriendoConsultaId] = useState<string | null>(null)
  const [modalInternacion, setModalInternacion] = useState<any | null>(null)
  const [modalEvolucion, setModalEvolucion] = useState<{ internacionId: string; pacienteNombre: string } | null>(null)
  const [errorConsulta, setErrorConsulta] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'historial' | 'esquema' | 'internaciones' | 'documentos' | 'peluqueria'>(
    verClinico ? 'historial' : 'peluqueria',
  )
  const [vinculandoPortal, setVinculandoPortal] = useState(false)
  // Los dos únicos datos que la ficha no cargaba ya: los informes firmados y
  // los estudios A NIVEL DE PACIENTE. Los estudios existían, pero solo dentro
  // de la consulta que los adjuntó (`SeccionEstudios`), nunca todos juntos.
  const [informes, setInformes] = useState<InformeFirmado[]>([])
  const [estudios, setEstudios] = useState<EstudioImagen[]>([])
  const tarjetaAbiertaRef = useRef<HTMLDivElement | null>(null)
  
  const [menuImpresionAbierto, setMenuImpresionAbierto] = useState(false)
  const menuImpresionRef = useRef<HTMLDivElement>(null)

  const [modalEditar, setModalEditar] = useState(false)
  const [modalBorrar, setModalBorrar] = useState(false)
  const [borrando, setBorrando] = useState(false)

  async function handleBorrar() {
    if (!id) return
    setBorrando(true)
    try {
      await eliminarPaciente(id)
      navigate('/pacientes')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al borrar el paciente')
      setBorrando(false)
    }
  }

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuImpresionRef.current && !menuImpresionRef.current.contains(event.target as Node)) {
        setMenuImpresionAbierto(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

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
    try {
      setErrorFicha(null)
      setFicha(await getFichaPaciente(id))
      // Aparte de la ficha y sin tumbarla si fallan: son para una pestaña que
      // puede que nadie abra, y un informe que no carga no debe dejar el
      // expediente entero en «Cargando…».
      if (verClinico) {
        listInformesDePaciente(id).then(setInformes).catch(() => setInformes([]))
        listEstudiosDePaciente(id).then(setEstudios).catch(() => setEstudios([]))
      }
    } catch (err) {
      // Sin este catch la promesa quedaba rechazada sin manejar y la pantalla
      // se quedaba en "Cargando ficha del paciente…" para siempre.
      setErrorFicha(err instanceof Error ? err.message : 'No se pudo cargar la ficha')
      setFicha(null)
    }
  }

  useEffect(() => {
    recargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function handleNuevaConsulta() {
    if (!id || !usuario || !motivoNuevaConsulta.trim()) return
    setCreando(true)
    setErrorConsulta(null)
    try {
      const sucursalId = sucursalActivaId || usuario.sucursal_id || sucursales[0]?.id
      if (!sucursalId) {
        throw new Error('Debes seleccionar una sucursal activa antes de iniciar una consulta.')
      }
      const historial = await iniciarConsultaLibre(id, sucursalId, usuario.id, motivoNuevaConsulta.trim())
      setMotivoNuevaConsulta('')
      setNuevoHistorialId(historial.id)
      await recargar()
      setHistorialModal(historial)
    } catch (err) {
      setErrorConsulta(err instanceof Error ? err.message : 'No se pudo iniciar la consulta')
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
  function handleEnviarRecordatorio(citaId: string, destino: 'cliente' | 'equipo') {
    const cita = ficha?.citas.find((c) => c.id === citaId)
    if (cita) setAvisoCita({ cita, destino })
  }

  if (errorFicha) {
    return <p className="text-sm font-semibold text-rose-700">{errorFicha}</p>
  }

  if (ficha === undefined) {
    return <p className="text-sm text-slate-500">Cargando ficha del paciente…</p>
  }

  // `getFichaPaciente` devuelve null cuando el paciente no existe. Tratar ese
  // null como "cargando" dejaba la pantalla colgada al entrar con un id borrado.
  if (ficha === null) {
    return <p className="text-sm text-slate-500">No se encontró este paciente.</p>
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
          <Button variant="outline" size="sm" onClick={() => setModalEditar(true)} className="bg-white">
            <Edit2 size={16} /> <span className="hidden sm:inline">Editar</span>
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            className="bg-white text-rose-600 hover:bg-rose-50 hover:text-rose-700" 
            onClick={() => setModalBorrar(true)}
          >
            <Trash2 size={16} /> <span className="hidden sm:inline">Borrar</span>
          </Button>
          {/* Todo lo de este menú son documentos clínicos, y sus rutas están
              cerradas al peluquero en App.tsx: dejarle el botón solo serviría
              para rebotarle a la agenda. */}
          <div className={clsx('relative', !verClinico && 'hidden')} ref={menuImpresionRef}>
            <Button
            variant="outline"
            size="sm"
            onClick={() => setMenuImpresionAbierto(!menuImpresionAbierto)}
            className="flex items-center gap-2 bg-white"
          >
            <Printer size={16} /> Imprimir Informes <ChevronDown size={14} className={clsx("transition-transform", menuImpresionAbierto && "rotate-180")} />
          </Button>

          {menuImpresionAbierto && (
            <div className="absolute right-0 top-full mt-2 w-56 rounded-xl border border-slate-200 bg-white shadow-xl z-50 overflow-hidden py-1">
              <Link
                to={`/pacientes/${paciente.id}/historial/imprimir`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setMenuImpresionAbierto(false)}
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <Printer size={15} className="text-slate-400" /> Historial Clínico Completo
              </Link>
              <div className="h-px bg-slate-100 my-1 mx-3" />
              <div className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Informes Específicos
              </div>
              <Link
                to={`/pacientes/${paciente.id}/reporte/consulta`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setMenuImpresionAbierto(false)}
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-teal-50 hover:text-teal-700 transition-colors"
              >
                <Stethoscope size={15} className="text-teal-500" /> Consulta General
              </Link>
              <Link
                to={`/pacientes/${paciente.id}/reporte/laboratorio`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setMenuImpresionAbierto(false)}
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors"
              >
                <FlaskConical size={15} className="text-indigo-500" /> Laboratorio
              </Link>
              <Link
                to={`/pacientes/${paciente.id}/reporte/imagenologia`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setMenuImpresionAbierto(false)}
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-purple-50 hover:text-purple-700 transition-colors"
              >
                <Activity size={15} className="text-purple-500" /> Imagenología
              </Link>
              <Link
                to={`/pacientes/${paciente.id}/reporte/cirugia`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setMenuImpresionAbierto(false)}
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-rose-50 hover:text-rose-700 transition-colors"
              >
                <Scissors size={15} className="text-rose-500" /> Cirugía
              </Link>
            </div>
          )}
          </div>
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
              <div className="mt-3 flex flex-col gap-2">
                <Button
                  onClick={() => setModalEvolucion({ internacionId: internacion.id, pacienteNombre: paciente.nombre })}
                  className="w-full shadow-sm"
                >
                  <Activity size={15} /> Registrar evolución diaria
                </Button>
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={() => navigate(`/internacion?internacion=${internacion.id}`)}
                >
                  <BedDouble size={15} /> Ver detalles de internación
                </Button>
              </div>
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
                        {/* La cirugía se firma aquí igual que desde la agenda:
                            quien abre la ficha del paciente no debería tener
                            que volver a la cita para recoger la firma. */}
                        {esCirugia && (
                          c.consentimiento ? (
                            <Link
                              to={`/consentimientos/${c.id}`}
                              className="text-emerald-600 font-semibold flex items-center gap-1 hover:underline"
                            >
                              ✓ Consentimiento firmado
                            </Link>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setFirmandoCita(c)}
                              className="text-rose-600 hover:text-rose-700 hover:underline font-bold flex items-center gap-1 text-left"
                            >
                              → Firmar consentimiento
                            </button>
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
                              onClick={() => handleEnviarRecordatorio(c.id, 'cliente')}
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
            {/* El enlace automático del registro público exige CI+WhatsApp
                exactos (ver registro-portal); cuando no coincide, la cuenta
                del dueño queda separada de esta ficha y hay que unirla a mano. */}
            {paciente.cliente.usuario_id ? (
              <p className="mt-2 text-xs font-semibold text-emerald-600">Cuenta del portal vinculada</p>
            ) : (
              <Button
                variant="secondary"
                className="mt-2 px-3 py-1.5 text-xs"
                onClick={() => setVinculandoPortal(true)}
              >
                Vincular cuenta del portal
              </Button>
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
          
          {/* Para el peluquero, el expediente clínico entero se sustituye por
              esta nota: lo que necesita de la mascota (raza, tamaño, alergias,
              el dueño y su teléfono) está en la columna de al lado. */}
          {!verClinico && (
            <Card className="border border-dashed border-slate-300 py-10 text-center">
              <p className="text-sm font-semibold text-slate-500">Expediente clínico</p>
              <p className="mx-auto mt-1 max-w-sm text-xs text-slate-400">
                El historial médico, las vacunas y las internaciones los lleva el equipo veterinario. Las alergias
                y los antecedentes que te sirven para la peluquería están en la ficha, a la izquierda.
              </p>
            </Card>
          )}

          {/* Navegación por Pestañas */}
          <div className="border-b border-slate-200">
            <nav className="-mb-px flex space-x-6 overflow-x-auto" aria-label="Tabs">
              {verClinico && (
                <>
                  <button
                    onClick={() => setActiveTab('historial')}
                    className={clsx(
                      activeTab === 'historial'
                        ? 'border-teal-500 text-teal-600'
                        : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700',
                      'whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium transition-colors cursor-pointer'
                    )}
                  >
                    Historial Clínico
                  </button>
                  <button
                    onClick={() => setActiveTab('esquema')}
                    className={clsx(
                      activeTab === 'esquema'
                        ? 'border-teal-500 text-teal-600'
                        : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700',
                      'whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium transition-colors cursor-pointer'
                    )}
                  >
                    Esquema Sanitario
                  </button>
                  <button
                    onClick={() => setActiveTab('internaciones')}
                    className={clsx(
                      activeTab === 'internaciones'
                        ? 'border-teal-500 text-teal-600'
                        : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700',
                      'whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium transition-colors cursor-pointer'
                    )}
                  >
                    Internaciones Pasadas
                  </button>
                  <button
                    onClick={() => setActiveTab('documentos')}
                    className={clsx(
                      activeTab === 'documentos'
                        ? 'border-teal-500 text-teal-600'
                        : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700',
                      'whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium transition-colors cursor-pointer'
                    )}
                  >
                    Documentos
                  </button>
                </>
              )}
              <button
                onClick={() => setActiveTab('peluqueria')}
                className={clsx(
                  activeTab === 'peluqueria'
                    ? 'border-teal-500 text-teal-600'
                    : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700',
                  'whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium transition-colors cursor-pointer'
                )}
              >
                Peluquería & Estética
              </button>
            </nav>
          </div>

          {verClinico && activeTab === 'historial' && (
            <>
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
                            {/* Igual que en la agenda: se firma antes de imprimir. */}
                            {esCirugia &&
                              (c.consentimiento ? (
                                <Link
                                  to={`/consentimientos/${c.id}`}
                                  className="text-[11px] font-semibold text-emerald-600 hover:underline"
                                >
                                  ✓ Consentimiento firmado
                                </Link>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setFirmandoCita(c)}
                                  className="font-bold text-rose-600 hover:text-rose-700 hover:underline"
                                >
                                  → Firmar consentimiento
                                </button>
                              ))}

                            {/* Recordatorio de WhatsApp */}
                            {esPendiente &&
                              (c.recordatorio_enviado ? (
                                <span className="text-[11px] text-slate-400">✓ Recordatorio enviado</span>
                              ) : (
                                <div className="flex flex-wrap items-center gap-2">
                                  <button
                                    onClick={() => handleEnviarRecordatorio(c.id, 'cliente')}
                                    className="cursor-pointer font-bold text-teal-600 hover:text-teal-700 hover:underline"
                                  >
                                    → Avisar a cliente (WhatsApp)
                                  </button>
                                  <span className="hidden text-slate-300 sm:inline">|</span>
                                  <button
                                    onClick={() => handleEnviarRecordatorio(c.id, 'equipo')}
                                    className="cursor-pointer font-bold text-teal-600 hover:text-teal-700 hover:underline"
                                  >
                                    → Avisar a equipo (WhatsApp)
                                  </button>
                                </div>
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
                            <FichaConsulta historial={historial} paciente={paciente} onChanged={recargar} />
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
            </>
          )}

          {verClinico && activeTab === 'esquema' && <EsquemaSanitario pacienteId={paciente.id} />}

          {verClinico && activeTab === 'documentos' && (
            <ListaDocumentos
              documentos={documentosDePaciente({
                pacienteId: paciente.id,
                pacienteNombre: paciente.nombre,
                consultas: ficha.historiales,
                historialesConReceta: ficha.historiales
                  .filter((h) => (h.receta ?? []).length > 0)
                  .map((h) => h.id),
                consentimientos: ficha.citas
                  .map((c) => c.consentimiento)
                  .filter((c): c is NonNullable<typeof c> => Boolean(c)),
                informes,
                estudios,
              })}
            />
          )}

          {verClinico && activeTab === 'internaciones' && (
            <div>
              {internaciones.length > 0 ? (
                <div>
                  <div className="mb-3 flex items-baseline justify-between gap-2">
                    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">Historial de Internaciones</h2>
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
              ) : (
                <Card className="border border-dashed border-slate-200 py-10 text-center">
                  <BedDouble size={32} className="mx-auto mb-3 text-slate-300" />
                  <p className="text-sm font-medium text-slate-700">Sin internaciones</p>
                  <p className="mt-1 text-xs text-slate-500">Este paciente no ha sido internado anteriormente.</p>
                </Card>
              )}
            </div>
          )}

          {activeTab === 'peluqueria' && (
            <PeluqueriaTabPaciente pacienteId={paciente.id} paciente={paciente} />
          )}
        </div>
      </div>

      {/* Recordatorio: se redacta, se revisa y recién entonces sale */}
      {avisoCita && (
        <MensajeModal
          aviso={avisoDeCita(avisoCita.cita)}
          destino={avisoCita.destino}
          onClose={() => setAvisoCita(null)}
          onEnviado={async () => {
            setAvisoCita(null)
            await recargar()
          }}
        />
      )}

      {/* Las dos firmas se recogen aquí mismo; después el documento ya se puede
          imprimir con ellas dibujadas. */}
      {firmandoCita && (
        <FirmarConsentimientoModal
          cita={firmandoCita}
          onClose={() => setFirmandoCita(null)}
          onFirmado={async () => {
            setFirmandoCita(null)
            await recargar()
          }}
        />
      )}

      {modalInternacion && (
        <InternacionModal
          internacion={modalInternacion}
          onClose={() => setModalInternacion(null)}
          onChanged={async () => {
            if (id) setFicha(await getFichaPaciente(id))
          }}
        />
      )}

      {modalEvolucion && (
        <RegistrarEvolucionModal
          internacionId={modalEvolucion.internacionId}
          pacienteNombre={modalEvolucion.pacienteNombre}
          onClose={() => setModalEvolucion(null)}
          onGuardado={async () => {
            setModalEvolucion(null)
            if (id) setFicha(await getFichaPaciente(id))
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
            paciente={paciente}
            onChanged={async () => {
              await recargar()
              const fichaActualizada = await getFichaPaciente(paciente.id)
              const h = fichaActualizada?.historiales.find((item) => item.id === historialModal.id)
              if (h) setHistorialModal(h)
            }}
            onFinalized={() => setHistorialModal(null)}
          />
        </Modal>
      )}

      {modalEditar && (
        <EditarPacienteModal
          paciente={paciente}
          onClose={() => setModalEditar(false)}
          onUpdated={() => {
            setModalEditar(false)
            recargar()
          }}
        />
      )}

      {modalBorrar && (
        <ConfirmDialog
          title="Borrar paciente"
          description="¿Estás seguro de que deseas borrar a este paciente y todo su historial? Esta acción no se puede deshacer."
          confirmLabel="Borrar permanentemente"
          loading={borrando}
          onConfirm={handleBorrar}
          onCancel={() => setModalBorrar(false)}
        />
      )}

      {vinculandoPortal && usuario?.clinica_id && (
        <VincularCuentaPortalModal
          clienteId={paciente.cliente.id}
          clinicaId={usuario.clinica_id}
          onClose={() => setVinculandoPortal(false)}
          onVinculado={async () => {
            setVinculandoPortal(false)
            await recargar()
          }}
        />
      )}
    </div>
  )
}

