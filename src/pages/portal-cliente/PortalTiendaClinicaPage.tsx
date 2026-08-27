import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ImageOff, MessageCircle, PackageSearch, Store } from 'lucide-react'
import {
  listClinicasConCatalogo,
  listProductosDeClinica,
  urlFotoCatalogo,
  type ClinicaConCatalogo,
} from '../../services/tienda'
import { enlaceWhatsapp } from '../../lib/whatsapp'
import { formatBs } from '../../lib/currency'
import type { CatalogoProducto } from '../../types/database'

/**
 * Vuelve a pedir `listClinicasConCatalogo()` para la cabecera en vez de
 * depender de router state: así funciona igual llegando por clic desde la
 * Tienda o por un enlace directo a esta URL.
 */
export function PortalTiendaClinicaPage() {
  const { clinicaId } = useParams()
  const [clinica, setClinica] = useState<ClinicaConCatalogo | null>(null)
  const [productos, setProductos] = useState<CatalogoProducto[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!clinicaId) return
    Promise.all([listClinicasConCatalogo(), listProductosDeClinica(clinicaId)])
      .then(([clinicas, productosData]) => {
        setClinica(clinicas.find((c) => c.id === clinicaId) ?? null)
        setProductos(productosData)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'No se pudo cargar la tienda'))
      .finally(() => setCargando(false))
  }, [clinicaId])

  if (cargando) {
    return (
      <div className="flex justify-center items-center py-20">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
      </div>
    )
  }

  if (!clinica) {
    return (
      <div className="text-center py-20">
        <h2 className="text-xl font-bold text-slate-900 mb-2">Esta tienda ya no está disponible</h2>
        <Link to="/portal-cliente/tienda" className="text-indigo-600 hover:underline">
          Volver a la Tienda
        </Link>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-8 flex items-center gap-4">
        <Link
          to="/portal-cliente/tienda"
          className="p-2 bg-white rounded-full border border-slate-200 hover:bg-slate-50 transition-colors"
        >
          <ArrowLeft className="h-5 w-5 text-slate-600" />
        </Link>
        <div className="flex items-center gap-3">
          {clinica.logo_url ? (
            <img src={clinica.logo_url} alt={clinica.nombre} className="h-10 w-10 rounded-lg object-cover" />
          ) : (
            <div className="h-10 w-10 rounded-lg bg-indigo-100 flex items-center justify-center">
              <Store className="h-5 w-5 text-indigo-600" />
            </div>
          )}
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{clinica.nombre}</h1>
            {clinica.ciudad && <p className="text-slate-500 text-sm">{clinica.ciudad}</p>}
          </div>
        </div>
      </div>

      {error && <p className="mb-4 text-sm text-rose-600">{error}</p>}

      {productos.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <div className="mx-auto h-16 w-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
            <PackageSearch className="h-8 w-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-medium text-slate-900">Todavía no hay productos publicados</h3>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {productos.map((producto) => {
            const tieneWhatsapp = Boolean(clinica.whatsapp.trim())
            const mensaje = `Hola, quiero consultar por este producto de su catálogo: ${producto.nombre} (${formatBs(producto.precio_bs)})`
            return (
              <div key={producto.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="aspect-[4/3] bg-slate-100 flex items-center justify-center">
                  {producto.foto_ruta ? (
                    <img
                      src={urlFotoCatalogo(producto.foto_ruta)}
                      alt={producto.nombre}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <ImageOff className="h-10 w-10 text-slate-300" />
                  )}
                </div>
                <div className="p-5 space-y-2">
                  {producto.categoria && (
                    <span className="inline-block text-xs font-semibold uppercase tracking-wider text-indigo-600">
                      {producto.categoria}
                    </span>
                  )}
                  <h3 className="text-base font-bold text-slate-900">{producto.nombre}</h3>
                  {producto.descripcion && <p className="text-sm text-slate-500">{producto.descripcion}</p>}
                  <p className="text-lg font-black text-slate-900">{formatBs(producto.precio_bs)}</p>

                  {tieneWhatsapp ? (
                    <a
                      href={enlaceWhatsapp(clinica.whatsapp, mensaje)}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition-colors"
                    >
                      <MessageCircle className="h-4 w-4" /> Consultar por WhatsApp
                    </a>
                  ) : (
                    <p className="mt-2 text-xs text-slate-400">Esta clínica todavía no configuró un WhatsApp de contacto.</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
