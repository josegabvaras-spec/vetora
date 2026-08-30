import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Clock, MessageCircle, PawPrint, Scissors } from 'lucide-react'
import { useAuth } from '../../context/useAuth'
import {
  listPeluquerias,
  listServiciosDePeluqueria,
  CATEGORIA_GROOMING_LABEL,
  ESPECIE_PERMITIDA_LABEL,
  TAMANO_PERMITIDO_LABEL,
  type PeluqueriaDisponible,
  type ServicioPeluqueriaPublico,
} from '../../services/peluqueriaPortal'
import { getPacientesPortal } from '../../services/portalCliente'
import { enlaceWhatsapp } from '../../lib/whatsapp'
import { formatBs } from '../../lib/currency'
import { clinicDayIso, formatClinicDate, desdeFechaSola } from '../../lib/datetime'
import type { Paciente } from '../../types/database'

/**
 * Los servicios de una peluquería, y el botón para pedir cita.
 *
 * ⚠️ **Pedir no es agendar.** El PRD §2 deja el agendamiento automático fuera
 * del MVP, así que esto compone un mensaje de WhatsApp con la mascota, el
 * servicio y el día que el dueño prefiere, y quien agenda sigue siendo una
 * persona de la peluquería. Cuando la agenden, la cita le aparece al dueño en
 * «Citas» — ese es el circuito completo.
 *
 * Y va con `enlaceWhatsapp()`, **nunca** `enviarMensajeWhatsapp()`: la cuota
 * mensual del plan es para los avisos que decide mandar el personal, no para
 * una solicitud que decide un cliente. Mismo criterio que el botón del
 * catálogo.
 *
 * Vuelve a pedir `listPeluquerias()` para la cabecera en vez de depender de
 * router state, igual que su gemela de la Tienda: así funciona igual llegando
 * por clic o por un enlace directo a esta URL.
 */
export function PortalPeluqueriaClinicaPage() {
  const { clinicaId } = useParams()
  const { usuario } = useAuth()

  const [peluqueria, setPeluqueria] = useState<PeluqueriaDisponible | null>(null)
  const [servicios, setServicios] = useState<ServicioPeluqueriaPublico[]>([])
  const [mascotas, setMascotas] = useState<Paciente[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [mascotaId, setMascotaId] = useState('')
  const [dia, setDia] = useState(clinicDayIso())

  useEffect(() => {
    if (!clinicaId) return
    Promise.all([listPeluquerias(), listServiciosDePeluqueria(clinicaId)])
      .then(([lista, servs]) => {
        setPeluqueria(lista.find((c) => c.id === clinicaId) ?? null)
        setServicios(servs)
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'No se pudo cargar la peluquería'),
      )
      .finally(() => setCargando(false))
  }, [clinicaId])

  // Las mascotas son de SU clínica, no de la que está mirando: son las suyas,
  // y lo único que se hace con ellas es escribir el nombre en el mensaje.
  useEffect(() => {
    if (!usuario?.clinica_id || !usuario.id) return
    getPacientesPortal(usuario.clinica_id, usuario.id)
      .then((lista) => {
        setMascotas(lista)
        if (lista.length === 1) setMascotaId(lista[0].id)
      })
      .catch(() => setMascotas([]))
  }, [usuario])

  if (cargando) {
    return (
      <div className="flex justify-center items-center py-20">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-600"></div>
      </div>
    )
  }

  if (!peluqueria) {
    return (
      <div className="text-center py-20">
        <h2 className="text-xl font-bold text-slate-900 mb-2">
          Esta peluquería ya no está disponible
        </h2>
        <Link to="/portal-cliente/peluqueria" className="text-purple-600 hover:underline">
          Ver las demás
        </Link>
      </div>
    )
  }

  const mascota = mascotas.find((m) => m.id === mascotaId)
  const tieneWhatsapp = Boolean(peluqueria.whatsapp.trim())

  function mensajeDe(servicio: ServicioPeluqueriaPublico): string {
    const paraQuien = mascota ? ` para ${mascota.nombre}` : ''
    return (
      `Hola, quiero pedir una cita de ${servicio.nombre}${paraQuien} ` +
      `el ${formatClinicDate(desdeFechaSola(dia))}. ¿Tienen disponibilidad?`
    )
  }

  return (
    <div>
      <div className="mb-6 flex items-center gap-4">
        <Link
          to="/portal-cliente/peluqueria"
          className="p-2 bg-white rounded-full border border-slate-200 hover:bg-slate-50 transition-colors"
        >
          <ArrowLeft className="h-5 w-5 text-slate-600" />
        </Link>
        <div className="flex items-center gap-3">
          {peluqueria.logo_url ? (
            <img
              src={peluqueria.logo_url}
              alt={peluqueria.nombre}
              className="h-10 w-10 rounded-lg object-cover"
            />
          ) : (
            <div className="h-10 w-10 rounded-lg bg-purple-100 flex items-center justify-center">
              <Scissors className="h-5 w-5 text-purple-600" />
            </div>
          )}
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{peluqueria.nombre}</h1>
            {peluqueria.ciudad && <p className="text-slate-500 text-sm">{peluqueria.ciudad}</p>}
          </div>
        </div>
      </div>

      {error && <p className="mb-4 text-sm text-rose-600">{error}</p>}

      {/* Mascota y día van arriba, una sola vez: son los mismos para cualquier
          servicio que pida, y repetirlos en cada tarjeta sería un formulario
          por producto. */}
      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <p className="mb-3 text-sm font-semibold text-slate-700">Para tu solicitud</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-500">
              <PawPrint className="h-3.5 w-3.5" /> Mascota
            </span>
            <select
              value={mascotaId}
              onChange={(e) => setMascotaId(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-purple-400 focus:outline-none"
            >
              <option value="">Sin especificar</option>
              {mascotas.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-500">
              <Clock className="h-3.5 w-3.5" /> Día que prefieres
            </span>
            <input
              type="date"
              value={dia}
              min={clinicDayIso()}
              onChange={(e) => setDia(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-purple-400 focus:outline-none"
            />
          </label>
        </div>
        <p className="mt-3 text-xs text-slate-400">
          Se abre WhatsApp con el mensaje escrito. La peluquería confirma la hora y, cuando la
          agende, la verás en «Citas».
        </p>
      </div>

      {servicios.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <div className="mx-auto h-16 w-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
            <Scissors className="h-8 w-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-medium text-slate-900">
            Todavía no hay servicios publicados
          </h3>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {servicios.map((servicio) => {
            const restricciones = [
              ESPECIE_PERMITIDA_LABEL[servicio.especie_permitida],
              TAMANO_PERMITIDO_LABEL[servicio.tamano_permitido],
            ].filter(Boolean)

            return (
              <div
                key={servicio.id}
                className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col gap-2"
              >
                <span className="inline-block w-fit text-xs font-semibold uppercase tracking-wider text-purple-600">
                  {CATEGORIA_GROOMING_LABEL[servicio.categoria_grooming] ??
                    servicio.categoria_grooming}
                </span>
                <h3 className="text-base font-bold text-slate-900">{servicio.nombre}</h3>
                <p className="flex items-center gap-1.5 text-sm text-slate-500">
                  <Clock className="h-3.5 w-3.5" /> {servicio.duracion_minutos} min
                </p>
                {restricciones.length > 0 && (
                  <p className="text-xs text-slate-400">{restricciones.join(' · ')}</p>
                )}
                <p className="text-lg font-black text-slate-900">{formatBs(servicio.precio_bs)}</p>

                <div className="mt-auto pt-2">
                  {tieneWhatsapp ? (
                    <a
                      href={enlaceWhatsapp(peluqueria.whatsapp, mensajeDe(servicio))}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition-colors"
                    >
                      <MessageCircle className="h-4 w-4" /> Solicitar cita
                    </a>
                  ) : (
                    <p className="text-xs text-slate-400">
                      Esta peluquería todavía no configuró un WhatsApp de contacto.
                    </p>
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
