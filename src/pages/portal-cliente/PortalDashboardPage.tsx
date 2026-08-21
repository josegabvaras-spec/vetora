import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { getPacientesPortal, getNotificacionesPortal, type NotificacionPortal } from '../../services/portalCliente'
import type { Paciente } from '../../types/database'
import { Activity, Bone, FileText, Bell, Calendar, AlertTriangle } from 'lucide-react'
import { format } from 'date-fns'
import { desdeFechaSola, toClinicTime } from '../../lib/datetime'
import { es } from 'date-fns/locale'
import clsx from 'clsx'

export function PortalDashboardPage() {
  const { usuario } = useAuth()
  const [pacientes, setPacientes] = useState<Paciente[]>([])
  const [notificaciones, setNotificaciones] = useState<NotificacionPortal[]>([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    async function load() {
      if (usuario?.clinica_id && usuario.id) {
        try {
          const [pacientesData, notificacionesData] = await Promise.all([
            getPacientesPortal(usuario.clinica_id, usuario.id),
            getNotificacionesPortal(usuario.clinica_id, usuario.id)
          ])
          setPacientes(pacientesData)
          setNotificaciones(notificacionesData)
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
  }, [usuario])

  if (usuario?.rol !== 'cliente') return <Navigate to="/" replace />

  if (cargando) {
    return (
      <div className="flex justify-center items-center py-20">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Tus Mascotas</h1>
        <p className="text-slate-500 mt-1">
          Selecciona una mascota para ver su historial clínico y vacunas.
        </p>
      </div>

      {pacientes.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <div className="mx-auto h-16 w-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
            <Bone className="h-8 w-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-medium text-slate-900">No hay mascotas registradas</h3>
          <p className="text-slate-500 mt-2">
            No encontramos mascotas vinculadas a tu cuenta en esta clínica. Si crees que es un error, por favor contacta a recepción para que registren tu Carnet de Identidad en el perfil de tus animales.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {pacientes.map((paciente) => (
            <Link
              key={paciente.id}
              to={`/portal-cliente/paciente/${paciente.id}`}
              className="group bg-white rounded-2xl border border-slate-200 hover:border-indigo-300 hover:shadow-md transition-all overflow-hidden"
            >
              <div className="aspect-[4/3] bg-slate-100 relative">
                {paciente.foto ? (
                  <img
                    src={paciente.foto}
                    alt={paciente.nombre}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Bone className="h-12 w-12 text-slate-300" />
                  </div>
                )}
                <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-medium text-slate-700 shadow-sm">
                  {paciente.especie}
                </div>
              </div>

              <div className="p-5">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                      {paciente.nombre}
                    </h3>
                    <p className="text-sm text-slate-500">{paciente.raza || 'Raza no especificada'}</p>
                  </div>
                  <div className="h-8 w-8 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 group-hover:bg-indigo-100 transition-colors">
                    <Activity className="h-4 w-4" />
                  </div>
                </div>

                <div className="flex items-center text-sm text-slate-500 gap-2 border-t border-slate-100 pt-4 mt-2">
                  <FileText className="h-4 w-4" />
                  <span>Ver historial y vacunas</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Sección de Notificaciones */}
      {notificaciones.length > 0 && (
        <div className="mt-12">
          <div className="mb-6 flex items-center gap-2">
            <Bell className="h-6 w-6 text-indigo-600" />
            <h2 className="text-xl font-bold text-slate-900">Avisos y Próximas Citas</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {notificaciones.map((notif) => (
              <div 
                key={notif.id} 
                className={clsx(
                  "p-5 rounded-2xl border",
                  notif.estado === 'atrasada' ? "bg-red-50 border-red-100" :
                  notif.estado === 'hoy' ? "bg-indigo-50 border-indigo-100" :
                  "bg-white border-slate-200"
                )}
              >
                <div className="flex items-start justify-between mb-2">
                  <span className={clsx(
                    "text-xs font-semibold uppercase tracking-wider px-2 py-1 rounded-full",
                    notif.tipo === 'cita' ? "bg-emerald-100 text-emerald-800" : "bg-blue-100 text-blue-800"
                  )}>
                    {notif.tipo}
                  </span>
                  {notif.estado === 'atrasada' && <AlertTriangle className="h-5 w-5 text-red-500" />}
                </div>
                <h3 className="font-bold text-slate-900">{notif.titulo}</h3>
                <p className="text-sm text-slate-600 mt-1">{notif.descripcion}</p>
                <div className="mt-4 flex items-center gap-2 text-sm font-medium">
                  <Bone className="h-4 w-4 text-slate-400" />
                  <span className="text-slate-700">{notif.pacienteNombre}</span>
                </div>
                <div className="mt-2 flex items-center gap-2 text-sm text-slate-500 border-t border-black/5 pt-3">
                  <Calendar className="h-4 w-4" />
                  <span>{format(toClinicTime(notif.fecha.length <= 10 ? desdeFechaSola(notif.fecha) : notif.fecha), "d 'de' MMMM, yyyy", { locale: es })}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
