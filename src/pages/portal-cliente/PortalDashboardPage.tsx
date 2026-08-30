import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../../context/useAuth'
import {
  ShoppingBag, CalendarPlus,
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

          {/* Botón */}
          <div className="relative z-10 mt-auto pt-2">
            <div className="bg-white/95 hover:bg-white backdrop-blur-md rounded-full py-2 px-3 sm:px-4 text-center shadow-md border border-white/80 transition-colors">
              <span className="text-xs sm:text-sm font-bold text-slate-800">Ver Registro</span>
            </div>
          </div>
        </Link>

        {/* ── Tarjeta 2: Tiendas de Mascotas ── */}
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
              Tiendas de Mascotas
            </h3>
          </div>

          {/* Botón */}
          <div className="relative z-10 mt-auto pt-2">
            <div className="bg-blue-600/95 hover:bg-blue-600 backdrop-blur-md rounded-full py-2 px-3 sm:px-4 text-center shadow-md flex items-center justify-center gap-1.5 transition-colors">
              <ShoppingBag size={14} className="text-white" />
              <span className="text-xs sm:text-sm font-bold text-white">Ver Catálogo</span>
            </div>
          </div>
        </Link>

        {/* ── Tarjeta 3: Agendar Peluquería ── */}
        {/* Apuntaba a `/portal-cliente/tienda`, copiado de la tarjeta de al
            lado: el botón «Programar Cita» abría la Tienda de productos. */}
        <Link
          to="/portal-cliente/peluqueria"
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
            <div className="flex items-center justify-around">
              <button
                type="button"
                className="flex flex-col items-center gap-0.5 group/btn hover:scale-110 transition-transform"
                onClick={() => alert('Próximamente')}
              >
                <div className="h-8 w-8 sm:h-9 sm:w-9 flex items-center justify-center">
                  <MessageCircle size={24} className="text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.45)]" />
                </div>
                <span className="text-[10px] sm:text-[11px] font-black text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]">
                  Foro
                </span>
              </button>
              <button
                type="button"
                className="flex flex-col items-center gap-0.5 group/btn hover:scale-110 transition-transform"
                onClick={() => alert('Próximamente')}
              >
                <div className="h-8 w-8 sm:h-9 sm:w-9 flex items-center justify-center">
                  <HomeIcon size={24} className="text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.45)]" />
                </div>
                <span className="text-[10px] sm:text-[11px] font-black text-white leading-tight text-center drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]">
                  Objetos<br />Perdidos
                </span>
              </button>
              <button
                type="button"
                className="flex flex-col items-center gap-0.5 group/btn hover:scale-110 transition-transform"
                onClick={() => alert('Próximamente')}
              >
                <div className="h-8 w-8 sm:h-9 sm:w-9 flex items-center justify-center">
                  <CalendarDays size={24} className="text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.45)]" />
                </div>
                <span className="text-[10px] sm:text-[11px] font-black text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]">
                  Eventos
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
