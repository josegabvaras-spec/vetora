import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ImageOff, MapPin, MessageCircle, PackageSearch, Search, Store } from 'lucide-react'
import {
  buscarProductosEnTiendas,
  listClinicasConCatalogo,
  urlFotoCatalogo,
  type ClinicaConCatalogo,
} from '../../services/tienda'
import { TIPO_NEGOCIO_LABEL } from '../../lib/negocio'
import { enlaceWhatsapp } from '../../lib/whatsapp'
import { formatBs } from '../../lib/currency'
import type { CatalogoProducto } from '../../types/database'

/**
 * La Tienda del portal: los catálogos de **cualquier** clínica activa con el
 * módulo, no solo la del dueño.
 *
 * Dos formas de recorrerla, y la segunda es la que pidió el usuario: elegir
 * por tienda —la rejilla de siempre— o **elegir por producto**, buscando entre
 * todas a la vez. Sin el buscador había que entrar tienda por tienda para
 * saber quién vende qué.
 */
export function PortalTiendaPage() {
  const [clinicas, setClinicas] = useState<ClinicaConCatalogo[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [busqueda, setBusqueda] = useState('')
  /** Mismo reposo que en las listas del personal: sin él se consulta por tecla. */
  const [busquedaAplicada, setBusquedaAplicada] = useState('')
  const [resultados, setResultados] = useState<CatalogoProducto[]>([])
  const [buscando, setBuscando] = useState(false)

  useEffect(() => {
    const id = setTimeout(() => setBusquedaAplicada(busqueda.trim()), 300)
    return () => clearTimeout(id)
  }, [busqueda])

  useEffect(() => {
    listClinicasConCatalogo()
      .then(setClinicas)
      .catch((err) => setError(err instanceof Error ? err.message : 'No se pudo cargar la tienda'))
      .finally(() => setCargando(false))
  }, [])

  useEffect(() => {
    if (!busquedaAplicada) {
      setResultados([])
      return
    }
    setBuscando(true)
    let vigente = true
    buscarProductosEnTiendas(busquedaAplicada)
      .then((prods) => {
        // Una respuesta lenta de una búsqueda ya abandonada no puede pisar la
        // de la que el usuario está esperando.
        if (vigente) setResultados(prods)
      })
      .catch((err) => {
        if (vigente) setError(err instanceof Error ? err.message : 'No se pudo buscar')
      })
      .finally(() => {
        if (vigente) setBuscando(false)
      })
    return () => {
      vigente = false
    }
  }, [busquedaAplicada])

  /** El nombre y el WhatsApp de la tienda de cada producto se cruzan aquí. */
  const porId = useMemo(() => new Map(clinicas.map((c) => [c.id, c])), [clinicas])

  if (cargando) {
    return (
      <div className="flex justify-center items-center py-20">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Tienda</h1>
        <p className="text-slate-500 mt-1">
          Catálogos de veterinarias, peluquerías y petshops de la plataforma. Busca un producto o
          elige una tienda.
        </p>
      </div>

      <div className="relative mb-8">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar alimento, antiparasitario, juguete…"
          className="w-full rounded-full border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
        />
      </div>

      {error && <p className="mb-4 text-sm text-rose-600">{error}</p>}

      {busquedaAplicada ? (
        <ResultadosDeBusqueda
          productos={resultados}
          buscando={buscando}
          tiendaDe={(id) => porId.get(id)}
        />
      ) : (
        <ListaDeTiendas clinicas={clinicas} />
      )}
    </div>
  )
}

function ListaDeTiendas({ clinicas }: { clinicas: ClinicaConCatalogo[] }) {
  if (clinicas.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
        <div className="mx-auto h-16 w-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
          <Store className="h-8 w-8 text-slate-400" />
        </div>
        <h3 className="text-lg font-medium text-slate-900">
          Todavía ninguna clínica tiene tienda activa
        </h3>
        <p className="text-slate-500 mt-2">
          Vuelve más adelante — las clínicas van sumando su catálogo con el tiempo.
        </p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {clinicas.map((clinica) => (
        <Link
          key={clinica.id}
          to={`/portal-cliente/tienda/${clinica.id}`}
          className="group bg-white rounded-2xl border border-slate-200 hover:border-indigo-300 hover:shadow-md transition-all overflow-hidden"
        >
          <div className="aspect-[4/3] bg-slate-100 relative flex items-center justify-center">
            {clinica.logo_url ? (
              <img
                src={clinica.logo_url}
                alt={clinica.nombre}
                className="w-full h-full object-cover"
              />
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
  )
}

/**
 * Cada tarjeta dice de qué tienda es y enlaza a ella: encontrar el producto no
 * sirve de nada si no se sabe a quién comprárselo.
 */
function ResultadosDeBusqueda({
  productos,
  buscando,
  tiendaDe,
}: {
  productos: CatalogoProducto[]
  buscando: boolean
  tiendaDe: (clinicaId: string) => ClinicaConCatalogo | undefined
}) {
  if (buscando) {
    return <p className="py-12 text-center text-sm text-slate-400">Buscando…</p>
  }

  if (productos.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
        <div className="mx-auto h-16 w-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
          <PackageSearch className="h-8 w-8 text-slate-400" />
        </div>
        <h3 className="text-lg font-medium text-slate-900">Ninguna tienda tiene eso publicado</h3>
        <p className="text-slate-500 mt-2">Prueba con otra palabra, o mira las tiendas una a una.</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {productos.map((producto) => {
        const tienda = tiendaDe(producto.clinica_id)
        const mensaje = `Hola, quiero consultar por este producto de su catálogo: ${producto.nombre} (${formatBs(producto.precio_bs)})`

        return (
          <div
            key={producto.id}
            className="bg-white rounded-2xl border border-slate-200 overflow-hidden flex flex-col"
          >
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
            <div className="p-5 space-y-2 flex flex-col flex-1">
              {producto.categoria && (
                <span className="inline-block text-xs font-semibold uppercase tracking-wider text-indigo-600">
                  {producto.categoria}
                </span>
              )}
              <h3 className="text-base font-bold text-slate-900">{producto.nombre}</h3>
              {producto.descripcion && (
                <p className="text-sm text-slate-500">{producto.descripcion}</p>
              )}
              <p className="text-lg font-black text-slate-900">{formatBs(producto.precio_bs)}</p>

              {/* La tienda puede faltar si dejó de cumplir las condiciones entre
                  las dos consultas (bajó de plan, la suspendieron). Se enseña el
                  producto igual, pero sin enlace ni WhatsApp a los que no se
                  puede responder. */}
              {tienda ? (
                <div className="mt-auto pt-2 space-y-2">
                  <Link
                    to={`/portal-cliente/tienda/${tienda.id}`}
                    className="flex items-center gap-1.5 text-sm font-semibold text-slate-700 hover:text-indigo-600 transition-colors"
                  >
                    <Store className="h-3.5 w-3.5" /> {tienda.nombre}
                  </Link>
                  {tienda.whatsapp.trim() && (
                    <a
                      href={enlaceWhatsapp(tienda.whatsapp, mensaje)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition-colors"
                    >
                      <MessageCircle className="h-4 w-4" /> Consultar por WhatsApp
                    </a>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}
