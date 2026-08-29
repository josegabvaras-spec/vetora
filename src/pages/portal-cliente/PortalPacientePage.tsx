import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useAuth } from '../../context/useAuth'
import {
  getConsentimientosPacientePortal,
  getEstudiosPacientePortal,
  getHistorialPacientePortal,
  getInformesPacientePortal,
  getRecetasPacientePortal,
  getVacunasPacientePortal,
  getPacientesPortal,
} from '../../services/portalCliente'
import {
  urlDescargaDe,
  urlFirmadaDe,
  TIPO_ESTUDIO_LABEL,
  type EstudioImagen,
} from '../../services/estudios'
import type { InformeFirmado } from '../../services/informes'
import {
  documentosDePaciente,
  TIPO_DOCUMENTO_LABEL,
  type DocumentoPaciente,
} from '../../lib/documentos'
import type {
  ConsentimientoCirugia,
  HistorialClinico,
  Paciente,
  RecetaItem,
  VacunaAplicada,
} from '../../types/database'
import {
  ArrowLeft,
  Syringe,
  FileText,
  AlertTriangle,
  Calendar,
  ScanLine,
  ShieldCheck,
  Download,
  Printer,
  Scissors,
  Camera,
} from 'lucide-react'
import {
  getFichaGrooming,
  listOrdenes,
  listFotosDePaciente,
} from '../../services/peluqueria'
import type { PeluqueriaFicha, PeluqueriaFoto } from '../../types/database'
import type { PeluqueriaOrdenConDetalle } from '../../types/views'
import { formatBs } from '../../lib/currency'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import clsx from 'clsx'
import { clinicDayIso, desdeFechaSola } from '../../lib/datetime'

export function PortalPacientePage() {
  const { pacienteId } = useParams()
  const { usuario } = useAuth()
  
  const [paciente, setPaciente] = useState<Paciente | null>(null)
  const [historial, setHistorial] = useState<HistorialClinico[]>([])
  const [vacunas, setVacunas] = useState<VacunaAplicada[]>([])
  const [consentimientos, setConsentimientos] = useState<ConsentimientoCirugia[]>([])
  const [estudios, setEstudios] = useState<EstudioImagen[]>([])
  // Las recetas no se cargaban en ningún sitio del portal, y el tour de
  // bienvenida se las promete al dueño desde que existe.
  const [recetas, setRecetas] = useState<RecetaItem[]>([])
  const [informes, setInformes] = useState<InformeFirmado[]>([])
  const [fichaPeluqueria, setFichaPeluqueria] = useState<PeluqueriaFicha | null>(null)
  const [ordenesPeluqueria, setOrdenesPeluqueria] = useState<PeluqueriaOrdenConDetalle[]>([])
  const [fotosPeluqueria, setFotosPeluqueria] = useState<PeluqueriaFoto[]>([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    async function load() {
      if (usuario?.clinica_id && usuario.id && pacienteId) {
        try {
          const clinicaId = usuario.clinica_id
          const [
            pacientesData,
            historialData,
            vacunasData,
            consentimientosData,
            estudiosData,
            recetasData,
            informesData,
            fichaPelData,
            ordenesPelData,
            fotosPelData,
          ] = await Promise.all([
            getPacientesPortal(clinicaId, usuario.id),
            getHistorialPacientePortal(clinicaId, pacienteId),
            getVacunasPacientePortal(clinicaId, pacienteId),
            getConsentimientosPacientePortal(clinicaId, pacienteId),
            getEstudiosPacientePortal(clinicaId, pacienteId),
            getRecetasPacientePortal(clinicaId, pacienteId),
            getInformesPacientePortal(pacienteId),
            getFichaGrooming(pacienteId),
            listOrdenes({ pacienteId }),
            listFotosDePaciente(pacienteId),
          ])

          const pacienteActual = pacientesData.find(p => p.id === pacienteId)
          if (pacienteActual) {
            setPaciente(pacienteActual)
            setHistorial(historialData)
            setVacunas(vacunasData)
            setConsentimientos(consentimientosData)
            setEstudios(estudiosData)
            setRecetas(recetasData)
            setInformes(informesData)
            setFichaPeluqueria(fichaPelData)
            setOrdenesPeluqueria(ordenesPelData)
            setFotosPeluqueria(fotosPelData)
          }
        } catch (e) {
          console.error(e)
        } finally {
          setCargando(false)
        }
      } else {
        setCargando(false)
      }
    }
    load()
  }, [usuario, pacienteId])

  if (usuario?.rol !== 'cliente') return <Navigate to="/" replace />

  if (cargando) {
    return (
      <div className="flex justify-center items-center py-20">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
      </div>
    )
  }

  if (!paciente) {
    return (
      <div className="text-center py-20">
        <h2 className="text-xl font-bold text-slate-900 mb-2">Mascota no encontrada</h2>
        <Link to={`/portal-cliente/dashboard`} className="text-indigo-600 hover:underline">
          Volver a mis mascotas
        </Link>
      </div>
    )
  }

  // La MISMA función que arma la lista en la ficha de la clínica: el orden y
  // los rótulos no pueden divergir entre lo que ve el dueño y lo que ve su
  // veterinario. Lo que cambia es lo que se le pasa — aquí no hay internación
  // ni recibos, porque el portal no los consulta.
  const documentos = documentosDePaciente({
    pacienteId: paciente.id,
    pacienteNombre: paciente.nombre,
    consultas: historial,
    historialesConReceta: [...new Set(recetas.map((r) => r.historial_id))],
    consentimientos,
    informes,
    estudios,
  })

  return (
    <div>
      <div className="mb-8 flex items-center gap-4">
        <Link 
          to={`/portal-cliente/dashboard`}
          className="p-2 bg-white rounded-full border border-slate-200 hover:bg-slate-50 transition-colors"
        >
          <ArrowLeft className="h-5 w-5 text-slate-600" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{paciente.nombre}</h1>
          <p className="text-slate-500 mt-1 capitalize">{paciente.especie} • {paciente.raza}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Columna Izquierda: Información y Vacunas */}
        <div className="lg:col-span-1 space-y-8">
          
          {/* Tarjeta de Alergias / Antecedentes */}
          {(paciente.alergias || paciente.antecedentes) && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
              <h3 className="text-sm font-semibold text-amber-800 uppercase tracking-wider flex items-center gap-2 mb-3">
                <AlertTriangle className="h-4 w-4" /> Importante
              </h3>
              {paciente.alergias && (
                <div className="mb-3">
                  <p className="text-xs text-amber-700/70 font-medium uppercase mb-1">Alergias</p>
                  <p className="text-sm text-amber-900 font-medium">{paciente.alergias}</p>
                </div>
              )}
              {paciente.antecedentes && (
                <div>
                  <p className="text-xs text-amber-700/70 font-medium uppercase mb-1">Antecedentes</p>
                  <p className="text-sm text-amber-900">{paciente.antecedentes}</p>
                </div>
              )}
            </div>
          )}

          {/* Tarjeta de Vacunas */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="p-5 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                <Syringe className="h-5 w-5 text-indigo-500" />
                Vacunación
              </h3>
            </div>
            
            <div className="divide-y divide-slate-100">
              {vacunas.length === 0 ? (
                <div className="p-5 text-center text-sm text-slate-500">
                  No hay registro de vacunas aplicadas en esta clínica.
                </div>
              ) : (
                vacunas.map(vacuna => {
                  let estaAtrasada = false
                  let necesitaRefuerzo = false
                  
                  if (vacuna.fecha_refuerzo) {
                    // Comparación de días de la clínica como cadena.
                    // `new Date("2026-08-20")` es medianoche UTC = el 19 a las
                    // 20:00 en La Paz, así que el dueño veía "atrasada" en rojo
                    // desde la víspera y el mismo día que le tocaba. Fallaba
                    // siempre en Bolivia, no solo con el reloj mal puesto.
                    estaAtrasada = vacuna.fecha_refuerzo.slice(0, 10) < clinicDayIso()
                    necesitaRefuerzo = true
                  }

                  return (
                    <div key={vacuna.id} className="p-4 hover:bg-slate-50 transition-colors">
                      <div className="font-medium text-slate-900 mb-1">{vacuna.nombre_vacuna}</div>
                      <div className="text-xs text-slate-500 flex items-center gap-1.5 mb-2">
                        <Calendar className="h-3.5 w-3.5" />
                        Aplicada: {format(new Date(desdeFechaSola(vacuna.fecha_aplicacion)), "d 'de' MMMM, yyyy", { locale: es })}
                      </div>
                      
                      {necesitaRefuerzo && (
                        <div className={clsx(
                          "text-xs px-2.5 py-1.5 rounded-lg inline-flex items-center gap-1.5 font-medium border",
                          estaAtrasada 
                            ? "bg-red-50 text-red-700 border-red-100" 
                            : "bg-blue-50 text-blue-700 border-blue-100"
                        )}>
                          {estaAtrasada ? <AlertTriangle className="h-3.5 w-3.5" /> : <Calendar className="h-3.5 w-3.5" />}
                          Refuerzo: {format(new Date(desdeFechaSola(vacuna.fecha_refuerzo!)), "d 'de' MMMM, yyyy", { locale: es })}
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </div>

          {/* Estudios de imagen. Como los consentimientos, la tarjeta solo
              aparece si hay algo: la mayoría de mascotas nunca pasa por una
              ecografía. Solo llegan aquí los de consultas ya cerradas
              (policy `estudios_portal`). */}
          {estudios.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="p-5 border-b border-slate-100 bg-slate-50">
                <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                  <ScanLine className="h-5 w-5 text-teal-500" />
                  Estudios de imagen
                </h3>
              </div>
              <div className="grid grid-cols-2 gap-2 p-4">
                {estudios.map((e) => (
                  <EstudioPortal key={e.id} estudio={e} />
                ))}
              </div>
            </div>
          )}

          {/* Todos los documentos de la mascota, para leerlos, imprimirlos o
              guardarlos en el celular. Los imprimibles abren la misma página
              que usa la clínica —el navegador ofrece «Guardar como PDF»— pero
              cargando solo lo que el dueño puede ver
              (`cargarFichaDeDocumento`); las imágenes se descargan. */}
          {documentos.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="p-5 border-b border-slate-100 bg-slate-50">
                <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                  <FileText className="h-5 w-5 text-emerald-500" />
                  Documentos
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  Descárgalos o guárdalos como PDF desde tu celular.
                </p>
              </div>
              <ul className="divide-y divide-slate-100">
                {documentos.map((doc) => (
                  <DocumentoPortalFila key={doc.id} doc={doc} />
                ))}
              </ul>
            </div>
          )}

          {/* Consentimientos firmados: lo que el propio dueño autorizó. Solo
              aparece la tarjeta si hay alguno — la mayoría de mascotas nunca
              pasa por cirugía y una tarjeta vacía permanente sobra. */}
          {consentimientos.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="p-5 border-b border-slate-100 bg-slate-50">
                <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-emerald-500" />
                  Consentimientos firmados
                </h3>
              </div>

              <div className="divide-y divide-slate-100">
                {consentimientos.map((consentimiento) => (
                  <div key={consentimiento.id} className="p-4">
                    <div className="text-xs text-slate-500 flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5" />
                      {format(new Date(consentimiento.created_at), "d 'de' MMMM, yyyy", { locale: es })}
                    </div>
                    {consentimiento.firma_tutor && (
                      <img
                        src={consentimiento.firma_tutor}
                        alt="Su firma"
                        className="mt-2 h-12 object-contain"
                      />
                    )}
                    <Link
                      to={`/consentimientos/${consentimiento.cita_id}`}
                      className="mt-2 inline-block text-xs font-medium text-teal-700 hover:underline"
                    >
                      Ver documento completo
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Columna Derecha: Historial Clínico */}
        <div className="lg:col-span-2">
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                <FileText className="h-5 w-5 text-indigo-500" />
                Historial de Visitas
              </h3>
            </div>

            <div className="divide-y divide-slate-100">
              {historial.length === 0 ? (
                <div className="p-12 text-center text-slate-500">
                  <FileText className="h-12 w-12 text-slate-200 mx-auto mb-3" />
                  <p>No hay registros clínicos finalizados para mostrar.</p>
                </div>
              ) : (
                historial.map(visita => (
                  <div key={visita.id} className="p-6 hover:bg-slate-50 transition-colors">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <div className="text-sm text-indigo-600 font-medium mb-1 flex items-center gap-1.5">
                          <Calendar className="h-4 w-4" />
                          {format(new Date(visita.created_at), "d 'de' MMMM, yyyy", { locale: es })}
                        </div>
                        <h4 className="font-semibold text-lg text-slate-900">{visita.motivo}</h4>
                      </div>
                    </div>
                    
                    <div className="space-y-4">
                      <div>
                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Diagnóstico</p>
                        <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{visita.diagnostico}</p>
                      </div>
                      
                      <div className="bg-indigo-50/50 rounded-xl p-4 border border-indigo-50">
                        <p className="text-xs font-semibold text-indigo-400 uppercase tracking-wider mb-1.5">Tratamiento e Indicaciones</p>
                        <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">{visita.tratamiento}</p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Sección de Peluquería y Estética para el Propietario */}
          <div className="mt-8 bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="p-6 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                  <Scissors className="h-5 w-5 text-teal-600" />
                  Peluquería y Estética
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  Estilo de corte, sesiones realizadas y galería de fotos del servicio.
                </p>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* Preferencias de Corte */}
              {fichaPeluqueria && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Estilo Habitual</p>
                    <p className="font-bold text-slate-800 mt-0.5">{fichaPeluqueria.corte_habitual || 'Estándar'}</p>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Largo Preferido</p>
                    <p className="font-semibold text-slate-800 mt-0.5">{fichaPeluqueria.longitud_preferida || 'A criterio'}</p>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Frecuencia</p>
                    <p className="font-semibold text-slate-800 mt-0.5">Cada {fichaPeluqueria.frecuencia_dias || 30} días</p>
                  </div>
                </div>
              )}

              {/* Galería de Fotos de Sesiones */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-3 flex items-center gap-1.5">
                  <Camera size={15} className="text-teal-600" />
                  <span>Fotos de Peluquería ({fotosPeluqueria.length})</span>
                </h4>

                {fotosPeluqueria.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No hay fotos de sesiones de peluquería guardadas aún.</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {fotosPeluqueria.map((f) => (
                      <div key={f.id} className="relative rounded-xl overflow-hidden border border-slate-200 shadow-sm group">
                        <img src={f.foto_url} alt={f.tipo} className="h-28 w-full object-cover group-hover:scale-105 transition-transform" />
                        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-1.5 text-white text-[9px] flex justify-between items-center">
                          <span className="capitalize font-bold">{f.tipo}</span>
                          <span className="text-slate-300">{format(new Date(f.created_at), 'd MMM', { locale: es })}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Lista de Sesiones de Peluquería */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                  Historial de Baños y Cortes
                </h4>
                {ordenesPeluqueria.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No hay servicios registrados.</p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {ordenesPeluqueria.map((o) => (
                      <div key={o.id} className="py-2.5 flex items-center justify-between text-xs">
                        <div>
                          <p className="font-semibold text-slate-800">
                            {o.servicio?.nombre || 'Grooming'}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            {format(new Date(o.hora_ingreso || o.created_at), "d 'de' MMMM, yyyy", { locale: es })} · Atendió: {o.peluquero?.nombre}
                          </p>
                        </div>
                        <span className="font-bold text-teal-800">{formatBs(o.precio_final_bs)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Una imagen del estudio, con su URL firmada.
 *
 * El bucket es privado y las firmas caducan, así que la URL se pide al montar y
 * no se guarda en ningún sitio: poner la ruta directamente en el `src` no
 * mostraría nada.
 */
function EstudioPortal({ estudio }: { estudio: EstudioImagen }) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let montado = true
    urlFirmadaDe(estudio.ruta)
      .then((u) => montado && setUrl(u))
      .catch(() => montado && setUrl(null))
    return () => { montado = false }
  }, [estudio.ruta])

  const etiqueta = TIPO_ESTUDIO_LABEL[estudio.tipo]

  return (
    <a
      href={url ?? undefined}
      target="_blank"
      rel="noopener noreferrer"
      className="block overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
    >
      {url ? (
        <img src={url} alt={etiqueta} className="h-24 w-full object-cover" />
      ) : (
        <span className="block h-24 w-full animate-pulse bg-slate-200" />
      )}
      <span className="block px-2 py-1.5 text-[11px] font-medium text-slate-700">
        {etiqueta}
        {estudio.descripcion && <span className="block truncate text-slate-400">{estudio.descripcion}</span>}
        <span className="block text-[10px] text-slate-400">
          {format(new Date(estudio.created_at), "d 'de' MMMM, yyyy", { locale: es })}
        </span>
      </span>
    </a>
  )
}

/**
 * Una fila de la lista de documentos, con el estilo del portal.
 *
 * No reutiliza `ListaDocumentos` (la del área clínica) a propósito: esa se apoya
 * en `Card` y `Badge` de `components/ui`, y el portal no importa ni una
 * primitiva de ahí — es esmeralda, de esquinas grandes y pensado para el pulgar.
 * Lo que sí se comparte es lo que importa: la lista la arma la misma
 * `documentosDePaciente()`, así que el contenido no puede divergir aunque el
 * envoltorio sea distinto.
 */
function DocumentoPortalFila({ doc }: { doc: DocumentoPaciente }) {
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState(false)

  async function descargar() {
    if (ocupado || !doc.ruta) return
    setOcupado(true)
    setError(false)
    try {
      // La firma se pide al pulsar, no al pintar la lista: caduca en una hora.
      window.location.href = await urlDescargaDe(doc.ruta, doc.nombreArchivo ?? 'estudio.jpg')
    } catch {
      setError(true)
    } finally {
      setOcupado(false)
    }
  }

  return (
    <li className="flex items-center justify-between gap-3 px-5 py-3.5">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-900">{doc.titulo}</p>
        <p className="text-xs text-slate-500">
          {TIPO_DOCUMENTO_LABEL[doc.tipo]} · {format(new Date(doc.fecha), "d 'de' MMMM, yyyy", { locale: es })}
        </p>
      </div>

      {doc.href ? (
        <Link
          to={doc.href}
          target="_blank"
          rel="noreferrer"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-50 px-3.5 py-2 text-xs font-semibold text-emerald-700 border border-emerald-100 hover:bg-emerald-100 transition-colors"
        >
          <Printer className="h-3.5 w-3.5" /> Abrir
        </Link>
      ) : (
        <button
          type="button"
          onClick={descargar}
          disabled={ocupado}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-50 px-3.5 py-2 text-xs font-semibold text-emerald-700 border border-emerald-100 hover:bg-emerald-100 transition-colors disabled:opacity-50"
        >
          <Download className="h-3.5 w-3.5" />
          {error ? 'Reintentar' : ocupado ? 'Preparando…' : 'Descargar'}
        </button>
      )}
    </li>
  )
}
