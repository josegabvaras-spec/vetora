import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Store, MapPin } from 'lucide-react'
import { listClinicasConCatalogo, type ClinicaConCatalogo } from '../../services/tienda'
import { TIPO_NEGOCIO_LABEL } from '../../lib/negocio'

export function PortalTiendaPage() {
  const [clinicas, setClinicas] = useState<ClinicaConCatalogo[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listClinicasConCatalogo()
      .then(setClinicas)
      .catch((err) => setError(err instanceof Error ? err.message : 'No se pudo cargar la tienda'))
      .finally(() => setCargando(false))
  }, [])

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
        <h1 className="text-2xl font-bold text-slate-900">Tienda</h1>
        <p className="text-slate-500 mt-1">
          Catálogos de veterinarias y petshops de la plataforma. Elige una para ver sus productos.
        </p>
      </div>

      {error && <p className="mb-4 text-sm text-rose-600">{error}</p>}

      {clinicas.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <div className="mx-auto h-16 w-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
            <Store className="h-8 w-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-medium text-slate-900">Todavía ninguna clínica tiene tienda activa</h3>
          <p className="text-slate-500 mt-2">Vuelve más adelante — las clínicas van sumando su catálogo con el tiempo.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {clinicas.map((clinica) => (
            <Link
              key={clinica.id}
              to={`/portal-cliente/tienda/${clinica.id}`}
              className="group bg-white rounded-2xl border border-slate-200 hover:border-indigo-300 hover:shadow-md transition-all overflow-hidden"
            >
              <div className="aspect-[4/3] bg-slate-100 relative flex items-center justify-center">
                {clinica.logo_url ? (
                  <img src={clinica.logo_url} alt={clinica.nombre} className="w-full h-full object-cover" />
                ) : (
                  <Store className="h-12 w-12 text-slate-300" />
                )}
                <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-medium text-slate-700 shadow-sm">
                  {TIPO_NEGOCIO_LABEL[clinica.tipo_negocio]}
                </div>
              </div>
              <div className="p-5">
                <h3 className="text-lg font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                  {clinica.nombre}
                </h3>
                {clinica.ciudad && (
                  <p className="flex items-center gap-1.5 text-sm text-slate-500 mt-1">
                    <MapPin className="h-3.5 w-3.5" /> {clinica.ciudad}
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
