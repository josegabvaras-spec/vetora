import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { MapPin, Scissors } from 'lucide-react'
import { listPeluquerias, type PeluqueriaDisponible } from '../../services/peluqueriaPortal'
import { TIPO_NEGOCIO_LABEL } from '../../lib/negocio'

/**
 * Las peluquerías de la plataforma, para el dueño de mascota.
 *
 * Gemela de [PortalTiendaPage](./PortalTiendaPage.tsx): mismo criterio —ve
 * **cualquier** negocio activo con el módulo, no solo el suyo— y mismo molde.
 * La tarjeta «Agendar Peluquería» del panel apuntaba a la Tienda de productos,
 * copiada de la de al lado, así que este camino no existía.
 */
export function PortalPeluqueriaPage() {
  const [peluquerias, setPeluquerias] = useState<PeluqueriaDisponible[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listPeluquerias()
      .then(setPeluquerias)
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'No se pudieron cargar las peluquerías'),
      )
      .finally(() => setCargando(false))
  }, [])

  if (cargando) {
    return (
      <div className="flex justify-center items-center py-20">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-600"></div>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Peluquerías</h1>
        <p className="text-slate-500 mt-1">
          Elige una para ver sus servicios y precios, y pedir tu cita por WhatsApp.
        </p>
      </div>

      {error && <p className="mb-4 text-sm text-rose-600">{error}</p>}

      {peluquerias.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <div className="mx-auto h-16 w-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
            <Scissors className="h-8 w-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-medium text-slate-900">
            Todavía ninguna peluquería publicó sus servicios
          </h3>
          <p className="text-slate-500 mt-2">
            Vuelve más adelante — se van sumando con el tiempo.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {peluquerias.map((peluqueria) => (
            <Link
              key={peluqueria.id}
              to={`/portal-cliente/peluqueria/${peluqueria.id}`}
              className="group bg-white rounded-2xl border border-slate-200 hover:border-purple-300 hover:shadow-md transition-all overflow-hidden"
            >
              <div className="aspect-[4/3] bg-slate-100 relative flex items-center justify-center">
                {peluqueria.logo_url ? (
                  <img
                    src={peluqueria.logo_url}
                    alt={peluqueria.nombre}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Scissors className="h-12 w-12 text-slate-300" />
                )}
                <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-medium text-slate-700 shadow-sm">
                  {TIPO_NEGOCIO_LABEL[peluqueria.tipo_negocio]}
                </div>
              </div>
              <div className="p-5">
                <h3 className="text-lg font-bold text-slate-900 group-hover:text-purple-600 transition-colors">
                  {peluqueria.nombre}
                </h3>
                {peluqueria.ciudad && (
                  <p className="flex items-center gap-1.5 text-sm text-slate-500 mt-1">
                    <MapPin className="h-3.5 w-3.5" /> {peluqueria.ciudad}
                  </p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
