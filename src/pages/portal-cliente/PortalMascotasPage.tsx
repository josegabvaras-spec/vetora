import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { getPacientesPortal } from '../../services/portalCliente'
import type { Paciente } from '../../types/database'
import { Activity, Bone, FileText, ArrowLeft } from 'lucide-react'

/**
 * Lista de mascotas del dueño — la lógica que antes vivía en el dashboard.
 *
 * Accesible desde la pestaña «Mascotas» de la barra inferior y desde la
 * tarjeta «Salud de Mi Mascota» del dashboard. Cada tarjeta lleva a la
 * ficha detallada del paciente (`PortalPacientePage`).
 */
export function PortalMascotasPage() {
  const { usuario } = useAuth()
  const [pacientes, setPacientes] = useState<Paciente[]>([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    async function load() {
      if (usuario?.clinica_id && usuario.id) {
        try {
          const data = await getPacientesPortal(usuario.clinica_id, usuario.id)
          setPacientes(data)
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

  return (
    <div className="animate-fade-in">
      {/* Header de sección */}
      <div className="mb-6 flex items-center gap-3">
        <Link
          to="/portal-cliente/dashboard"
          className="p-2 bg-white rounded-full border border-slate-200 hover:bg-slate-50 transition-colors shadow-sm"
        >
          <ArrowLeft className="h-5 w-5 text-slate-600" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 font-display">Mis Mascotas</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Toca una mascota para ver su historial, vacunas y más.
          </p>
        </div>
      </div>

      {pacientes.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-sm">
          <div className="mx-auto h-16 w-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
            <Bone className="h-8 w-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-medium text-slate-900">No hay mascotas registradas</h3>
          <p className="text-slate-500 mt-2 text-sm">
            No encontramos mascotas vinculadas a tu cuenta. Si crees que es un error,
            contacta a recepción para que registren tu Carnet de Identidad en el perfil
            de tus animales.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {pacientes.map((paciente) => (
            <Link
              key={paciente.id}
              to={`/portal-cliente/paciente/${paciente.id}`}
              className="group bg-white rounded-2xl border border-slate-200 hover:border-emerald-300 hover:shadow-lg transition-all overflow-hidden"
            >
              <div className="aspect-[4/3] bg-gradient-to-br from-emerald-50 to-sky-50 relative">
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
                <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-medium text-slate-700 shadow-sm capitalize">
                  {paciente.especie}
                </div>
              </div>

              <div className="p-4">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 group-hover:text-emerald-600 transition-colors">
                      {paciente.nombre}
                    </h3>
                    <p className="text-sm text-slate-500">{paciente.raza || 'Raza no especificada'}</p>
                  </div>
                  <div className="h-8 w-8 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600 group-hover:bg-emerald-100 transition-colors">
                    <Activity className="h-4 w-4" />
                  </div>
                </div>

                <div className="flex items-center text-sm text-slate-500 gap-2 border-t border-slate-100 pt-3">
                  <FileText className="h-4 w-4" />
                  <span>Ver historial y vacunas</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
