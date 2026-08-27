import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import {
  Syringe, Stethoscope, UtensilsCrossed,
  MapPin, CalendarPlus,
  MessageCircle, Home as HomeIcon, CalendarDays,
} from 'lucide-react'

/**
 * Dashboard principal del portal del dueño de mascota.
 *
 * Reproduce fielmente el mockup de `panelusuario.jpg`: cuatro tarjetas grandes
 * en un grid 2×2, cada una con la imagen 3D correspondiente (seccion1–4.jpg)
 * y un botón de acción que conecta a funcionalidad real del sistema.
 */
export function PortalDashboardPage() {
  const { usuario } = useAuth()

  if (usuario?.rol !== 'cliente') return <Navigate to="/" replace />

  return (
    <div className="animate-fade-in pb-4">
      <div className="grid grid-cols-2 gap-3.5 sm:gap-5">
        {/* ── Tarjeta 1: Salud de Mi Mascota ── */}
        <Link
          to="/portal-cliente/mascotas"
          className="portal-card relative aspect-[3/4] sm:aspect-[4/5] overflow-hidden rounded-2xl sm:rounded-3xl p-3 sm:p-4 flex flex-col justify-between group shadow-sm hover:shadow-xl transition-all"
        >
          {/* Imagen ocupando TODO el tamaño de la tarjeta */}
          <img
            src="/seccion1.jpg"
            alt="Mascota saludable"
            className="absolute inset-0 h-full w-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
          />

          {/* Título */}
          <div className="relative z-10">
            <h3 className="text-sm sm:text-base font-black text-slate-800 leading-tight font-display drop-shadow-[0_1px_3px_rgba(255,255,255,0.9)]">
              Salud de Mi Mascota
            </h3>
          </div>

          {/* Iconos flotantes */}
          <div className="absolute top-11 sm:top-14 left-2.5 sm:left-3 portal-float z-10">
            <div className="flex items-center gap-1 bg-white/95 backdrop-blur-md rounded-full px-2 py-1 shadow-md border border-white/60">
              <Syringe size={13} className="text-blue-500" />
              <span className="text-[9px] sm:text-[10px] font-bold text-slate-700">Vacunas</span>
            </div>
          </div>
          <div className="absolute top-10 sm:top-12 right-2.5 sm:right-3 portal-float-delay z-10">
            <div className="flex items-center gap-1 bg-white/95 backdrop-blur-md rounded-full px-2 py-1 shadow-md border border-white/60">
              <Stethoscope size={13} className="text-teal-500" />
              <span className="text-[9px] sm:text-[10px] font-bold text-slate-700">Chequeos</span>
            </div>
          </div>
          <div className="absolute bottom-14 sm:bottom-16 right-2.5 sm:right-3 portal-float-delay-2 z-10">
            <div className="flex items-center gap-1 bg-white/95 backdrop-blur-md rounded-full px-2 py-1 shadow-md border border-white/60">
              <UtensilsCrossed size={13} className="text-orange-400" />
              <span className="text-[9px] sm:text-[10px] font-bold text-slate-700">Dieta</span>
            </div>
          </div>

          {/* Botón */}
          <div className="relative z-10 mt-auto pt-2">
            <div className="bg-white/95 hover:bg-white backdrop-blur-md rounded-full py-2 px-3 sm:px-4 text-center shadow-md border border-white/80 transition-colors">
              <span className="text-xs sm:text-sm font-bold text-slate-800">Ver Registro</span>
            </div>
          </div>
        </Link>

        {/* ── Tarjeta 2: Encontrar Tiendas de Mascotas ── */}
        <Link
          to="/portal-cliente/tienda"
          className="portal-card relative aspect-[3/4] sm:aspect-[4/5] overflow-hidden rounded-2xl sm:rounded-3xl p-3 sm:p-4 flex flex-col justify-between group shadow-sm hover:shadow-xl transition-all"
        >
          {/* Imagen ocupando TODO el tamaño de la tarjeta */}
          <img
            src="/seccion2.jpg"
            alt="Tienda de mascotas"
            className="absolute inset-0 h-full w-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
          />

          <div className="relative z-10 text-center">
            <h3 className="text-sm sm:text-base font-black text-slate-800 leading-tight font-display drop-shadow-[0_1px_3px_rgba(255,255,255,0.9)]">
              Encontrar Tiendas de Mascotas
            </h3>
          </div>

          {/* Botón */}
          <div className="relative z-10 mt-auto pt-2">
            <div className="bg-blue-600/95 hover:bg-blue-600 backdrop-blur-md rounded-full py-2 px-3 sm:px-4 text-center shadow-md flex items-center justify-center gap-1.5 transition-colors">
              <MapPin size={14} className="text-white" />
              <span className="text-xs sm:text-sm font-bold text-white">Buscar Cerca</span>
            </div>
          </div>
        </Link>

        {/* ── Tarjeta 3: Agendar Peluquería ── */}
        <Link
          to="/portal-cliente/tienda"
          className="portal-card relative aspect-[3/4] sm:aspect-[4/5] overflow-hidden rounded-2xl sm:rounded-3xl p-3 sm:p-4 flex flex-col justify-between group shadow-sm hover:shadow-xl transition-all"
        >
          {/* Imagen ocupando TODO el tamaño de la tarjeta */}
          <img
            src="/seccion3.jpg"
            alt="Peluquería canina"
            className="absolute inset-0 h-full w-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
          />

          <div className="relative z-10">
            <h3 className="text-sm sm:text-base font-black text-slate-800 leading-tight font-display drop-shadow-[0_1px_3px_rgba(255,255,255,0.9)]">
              Agendar Peluquería
            </h3>
          </div>

          {/* Botón */}
          <div className="relative z-10 mt-auto pt-2">
            <div className="bg-purple-600/95 hover:bg-purple-600 backdrop-blur-md rounded-full py-2 px-3 sm:px-4 text-center shadow-md flex items-center justify-center gap-1.5 transition-colors">
              <CalendarPlus size={14} className="text-white" />
              <span className="text-xs sm:text-sm font-bold text-white">Programar Cita</span>
            </div>
          </div>
        </Link>

        {/* ── Tarjeta 4: Más y Comunidad ── */}
        <div className="portal-card relative aspect-[3/4] sm:aspect-[4/5] overflow-hidden rounded-2xl sm:rounded-3xl p-3 sm:p-4 flex flex-col justify-between group shadow-sm hover:shadow-xl transition-all">
          {/* Imagen ocupando TODO el tamaño de la tarjeta */}
          <img
            src="/seccion4.jpg"
            alt="Comunidad de mascotas"
            className="absolute inset-0 h-full w-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
          />

          <div className="relative z-10 text-center">
            <h3 className="text-sm sm:text-base font-black text-slate-800 leading-tight font-display drop-shadow-[0_1px_3px_rgba(255,255,255,0.9)]">
              Más y Comunidad
            </h3>
          </div>

          {/* Iconos de secciones futuras */}
          <div className="relative z-10 mt-auto pt-2">
            <div className="flex items-center justify-around bg-white/90 backdrop-blur-md rounded-2xl p-1.5 shadow-md border border-white/60">
              <button
                type="button"
                className="flex flex-col items-center gap-0.5 hover:opacity-100 opacity-80 transition-opacity"
                onClick={() => alert('Próximamente')}
              >
                <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-full bg-orange-100 flex items-center justify-center shadow-xs">
                  <MessageCircle size={15} className="text-orange-500" />
                </div>
                <span className="text-[9px] sm:text-[10px] font-bold text-slate-700">Foro</span>
              </button>
              <button
                type="button"
                className="flex flex-col items-center gap-0.5 hover:opacity-100 opacity-80 transition-opacity"
                onClick={() => alert('Próximamente')}
              >
                <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-full bg-blue-100 flex items-center justify-center shadow-xs">
                  <HomeIcon size={15} className="text-blue-500" />
                </div>
                <span className="text-[9px] sm:text-[10px] font-bold text-slate-700 leading-tight text-center">Objetos<br/>Perdidos</span>
              </button>
              <button
                type="button"
                className="flex flex-col items-center gap-0.5 hover:opacity-100 opacity-80 transition-opacity"
                onClick={() => alert('Próximamente')}
              >
                <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-full bg-emerald-100 flex items-center justify-center shadow-xs">
                  <CalendarDays size={15} className="text-emerald-500" />
                </div>
                <span className="text-[9px] sm:text-[10px] font-bold text-slate-700">Eventos</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
