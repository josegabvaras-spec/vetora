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
    <div className="animate-fade-in">
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        {/* ── Tarjeta 1: Salud de Mi Mascota ── */}
        <Link to="/portal-cliente/mascotas" className="portal-card bg-gradient-to-b from-sky-100 via-sky-50 to-emerald-50 relative">
          <div className="p-3 sm:p-4 pb-0">
            <h3 className="text-sm sm:text-base font-extrabold text-slate-800 leading-tight font-display">
              Salud de Mi Mascota
            </h3>
          </div>

          {/* Iconos flotantes */}
          <div className="absolute top-11 sm:top-14 left-3 portal-float z-10">
            <div className="flex items-center gap-1 bg-white/90 backdrop-blur-sm rounded-full px-2 py-1 shadow-sm">
              <Syringe size={14} className="text-blue-500" />
              <span className="text-[9px] sm:text-[10px] font-semibold text-slate-700">Vacunas</span>
            </div>
          </div>
          <div className="absolute top-10 sm:top-12 right-3 portal-float-delay z-10">
            <div className="flex items-center gap-1 bg-white/90 backdrop-blur-sm rounded-full px-2 py-1 shadow-sm">
              <Stethoscope size={14} className="text-teal-500" />
              <span className="text-[9px] sm:text-[10px] font-semibold text-slate-700">Chequeos</span>
            </div>
          </div>
          <div className="absolute bottom-14 sm:bottom-16 right-3 portal-float-delay-2 z-10">
            <div className="flex items-center gap-1 bg-white/90 backdrop-blur-sm rounded-full px-2 py-1 shadow-sm">
              <UtensilsCrossed size={14} className="text-orange-400" />
              <span className="text-[9px] sm:text-[10px] font-semibold text-slate-700">Dieta</span>
            </div>
          </div>

          {/* Imagen del beagle */}
          <div className="h-28 sm:h-36 overflow-hidden flex items-end justify-center px-2">
            <img
              src="/seccion1.jpg"
              alt="Mascota saludable"
              className="portal-card-img h-full w-full rounded-t-xl object-contain object-bottom"
            />
          </div>

          {/* Botón */}
          <div className="p-3 sm:p-4 pt-2">
            <div className="bg-white rounded-full py-2 px-4 text-center shadow-sm border border-slate-100">
              <span className="text-xs sm:text-sm font-bold text-slate-700">Ver Registro</span>
            </div>
          </div>
        </Link>

        {/* ── Tarjeta 2: Encontrar Tiendas de Mascotas ── */}
        <Link to="/portal-cliente/tienda" className="portal-card bg-gradient-to-b from-pink-100 via-pink-50 to-rose-50 relative">
          <div className="p-3 sm:p-4 pb-2">
            <h3 className="text-sm sm:text-base font-extrabold text-slate-800 leading-tight font-display text-center">
              Encontrar Tiendas de Mascotas
            </h3>
          </div>

          {/* Imagen de la tienda 3D */}
          <div className="h-28 sm:h-36 overflow-hidden flex items-center justify-center px-3">
            <img
              src="/seccion2.jpg"
              alt="Tienda de mascotas"
              className="portal-card-img h-full w-full object-contain"
            />
          </div>

          {/* Botón */}
          <div className="p-3 sm:p-4 pt-2">
            <div className="bg-blue-600 rounded-full py-2 px-4 text-center shadow-sm flex items-center justify-center gap-1.5">
              <MapPin size={14} className="text-white" />
              <span className="text-xs sm:text-sm font-bold text-white">Buscar Cerca</span>
            </div>
          </div>
        </Link>

        {/* ── Tarjeta 3: Agendar Peluquería ── */}
        <Link to="/portal-cliente/tienda" className="portal-card bg-gradient-to-b from-purple-100 via-violet-50 to-purple-50 relative">
          <div className="p-3 sm:p-4 pb-2">
            <h3 className="text-sm sm:text-base font-extrabold text-slate-800 leading-tight font-display">
              Agendar Peluquería
            </h3>
          </div>

          {/* Imagen del poodle en bañera */}
          <div className="h-28 sm:h-36 overflow-hidden flex items-center justify-center px-2">
            <img
              src="/seccion3.jpg"
              alt="Peluquería canina"
              className="portal-card-img h-full w-full object-contain"
            />
          </div>

          {/* Botón */}
          <div className="p-3 sm:p-4 pt-2">
            <div className="bg-purple-500 rounded-full py-2 px-4 text-center shadow-sm flex items-center justify-center gap-1.5">
              <CalendarPlus size={14} className="text-white" />
              <span className="text-xs sm:text-sm font-bold text-white">Programar Cita</span>
            </div>
          </div>
        </Link>

        {/* ── Tarjeta 4: Más y Comunidad ── */}
        <div className="portal-card bg-gradient-to-b from-green-100 via-emerald-50 to-lime-50 relative">
          <div className="p-3 sm:p-4 pb-2">
            <h3 className="text-sm sm:text-base font-extrabold text-slate-800 leading-tight font-display text-center">
              Más y Comunidad
            </h3>
          </div>

          {/* Imagen del parque con perros */}
          <div className="h-28 sm:h-36 overflow-hidden flex items-center justify-center px-2">
            <img
              src="/seccion4.jpg"
              alt="Comunidad de mascotas"
              className="portal-card-img h-full w-full object-contain"
            />
          </div>

          {/* Iconos de secciones futuras */}
          <div className="p-3 sm:p-4 pt-2">
            <div className="flex items-center justify-around">
              <button
                type="button"
                className="flex flex-col items-center gap-0.5 opacity-60"
                onClick={() => alert('Próximamente')}
              >
                <div className="h-9 w-9 rounded-full bg-orange-100 flex items-center justify-center">
                  <MessageCircle size={16} className="text-orange-500" />
                </div>
                <span className="text-[9px] sm:text-[10px] font-semibold text-slate-600">Foro</span>
              </button>
              <button
                type="button"
                className="flex flex-col items-center gap-0.5 opacity-60"
                onClick={() => alert('Próximamente')}
              >
                <div className="h-9 w-9 rounded-full bg-blue-100 flex items-center justify-center">
                  <HomeIcon size={16} className="text-blue-500" />
                </div>
                <span className="text-[9px] sm:text-[10px] font-semibold text-slate-600 leading-tight text-center">Objetos<br/>Perdidos</span>
              </button>
              <button
                type="button"
                className="flex flex-col items-center gap-0.5 opacity-60"
                onClick={() => alert('Próximamente')}
              >
                <div className="h-9 w-9 rounded-full bg-emerald-100 flex items-center justify-center">
                  <CalendarDays size={16} className="text-emerald-500" />
                </div>
                <span className="text-[9px] sm:text-[10px] font-semibold text-slate-600">Eventos</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
