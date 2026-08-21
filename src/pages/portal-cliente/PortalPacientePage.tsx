import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { getHistorialPacientePortal, getVacunasPacientePortal, getPacientesPortal } from '../../services/portalCliente'
import type { HistorialClinico, Paciente, VacunaAplicada } from '../../types/database'
import { ArrowLeft, Syringe, FileText, AlertTriangle, Calendar } from 'lucide-react'
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
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    async function load() {
      if (usuario?.clinica_id && usuario.id && pacienteId) {
        try {
          const clinicaId = usuario.clinica_id
          const [pacientesData, historialData, vacunasData] = await Promise.all([
            getPacientesPortal(clinicaId, usuario.id),
            getHistorialPacientePortal(clinicaId, pacienteId),
            getVacunasPacientePortal(clinicaId, pacienteId)
          ])

          const pacienteActual = pacientesData.find(p => p.id === pacienteId)
          if (pacienteActual) {
            setPaciente(pacienteActual)
            setHistorial(historialData)
            setVacunas(vacunasData)
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
        </div>
      </div>
    </div>
  )
}
