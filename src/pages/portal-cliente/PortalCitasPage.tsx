import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { getNotificacionesPortal, type NotificacionPortal } from '../../services/portalCliente'
import { ArrowLeft, Bell, Calendar, AlertTriangle, Bone, CheckCircle, Clock } from 'lucide-react'
import { format } from 'date-fns'
import { desdeFechaSola, toClinicTime } from '../../lib/datetime'
import { es } from 'date-fns/locale'
import clsx from 'clsx'

/**
 * Citas y avisos del dueño de mascota.
 *
 * Muestra citas pendientes, vacunas por refuerzo y avisos del sistema,
 * agrupados por urgencia (hoy, atrasadas, próximas). Reutiliza la lógica
 * existente de `getNotificacionesPortal`.
 */
export function PortalCitasPage() {
  const { usuario } = useAuth()
  const [notificaciones, setNotificaciones] = useState<NotificacionPortal[]>([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    async function load() {
      if (usuario?.clinica_id && usuario.id) {
        try {
          const data = await getNotificacionesPortal(usuario.clinica_id, usuario.id)
          setNotificaciones(data)
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
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-600"></div>
      </div>
    )
  }

  const hoy = notificaciones.filter(n => n.estado === 'hoy')
  const atrasadas = notificaciones.filter(n => n.estado === 'atrasada')
  const pendientes = notificaciones.filter(n => n.estado === 'pendiente')

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <Link
          to="/portal-cliente/dashboard"
          className="p-2 bg-white rounded-full border border-slate-200 hover:bg-slate-50 transition-colors shadow-sm"
        >
          <ArrowLeft className="h-5 w-5 text-slate-600" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 font-display">Citas y Avisos</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Tus próximas citas y avisos de vacunación.
          </p>
        </div>
      </div>

      {notificaciones.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-sm">
          <div className="mx-auto h-16 w-16 bg-emerald-50 rounded-full flex items-center justify-center mb-4">
            <CheckCircle className="h-8 w-8 text-emerald-400" />
          </div>
          <h3 className="text-lg font-medium text-slate-900">Todo al día</h3>
          <p className="text-slate-500 mt-2 text-sm">
            No tienes citas próximas ni avisos de vacunación pendientes.
            ¡Excelente cuidado de tus mascotas! 🐾
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Atrasadas */}
          {atrasadas.length > 0 && (
            <GrupoNotificaciones
              titulo="Atención Requerida"
              icono={<AlertTriangle className="h-5 w-5 text-red-500" />}
              notificaciones={atrasadas}
              colorFondo="bg-red-50"
              colorBorde="border-red-100"
            />
          )}

          {/* Hoy */}
          {hoy.length > 0 && (
            <GrupoNotificaciones
              titulo="Hoy"
              icono={<Bell className="h-5 w-5 text-emerald-600" />}
              notificaciones={hoy}
              colorFondo="bg-emerald-50"
              colorBorde="border-emerald-100"
            />
          )}

          {/* Próximas */}
          {pendientes.length > 0 && (
            <GrupoNotificaciones
              titulo="Próximas"
              icono={<Clock className="h-5 w-5 text-blue-500" />}
              notificaciones={pendientes}
              colorFondo="bg-white"
              colorBorde="border-slate-200"
            />
          )}
        </div>
      )}
    </div>
  )
}

function GrupoNotificaciones({
  titulo,
  icono,
  notificaciones,
  colorFondo,
  colorBorde,
}: {
  titulo: string
  icono: React.ReactNode
  notificaciones: NotificacionPortal[]
  colorFondo: string
  colorBorde: string
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        {icono}
        <h2 className="text-base font-bold text-slate-800 font-display">{titulo}</h2>
        <span className="ml-auto text-xs font-medium text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">
          {notificaciones.length}
        </span>
      </div>
      <div className="space-y-3">
        {notificaciones.map((notif) => (
          <div
            key={notif.id}
            className={clsx(
              'p-4 rounded-2xl border transition-all',
              colorFondo,
              colorBorde
            )}
          >
            <div className="flex items-start justify-between mb-2">
              <span className={clsx(
                'text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full',
                notif.tipo === 'cita'
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-blue-100 text-blue-800'
              )}>
                {notif.tipo === 'cita' ? '📅 Cita' : '💉 Vacuna'}
              </span>
              {notif.estado === 'atrasada' && (
                <AlertTriangle className="h-4 w-4 text-red-500" />
              )}
            </div>
            <h3 className="font-bold text-slate-900 text-sm">{notif.titulo}</h3>
            <p className="text-xs text-slate-600 mt-1">{notif.descripcion}</p>
            <div className="mt-3 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                <Bone className="h-3.5 w-3.5 text-slate-400" />
                <span>{notif.pacienteNombre}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <Calendar className="h-3.5 w-3.5" />
                <span>
                  {format(
                    toClinicTime(notif.fecha.length <= 10 ? desdeFechaSola(notif.fecha) : notif.fecha),
                    "d 'de' MMMM, yyyy",
                    { locale: es }
                  )}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
