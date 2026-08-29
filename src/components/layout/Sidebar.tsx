import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { clsx } from 'clsx'
import { X } from 'lucide-react'
import { useAuth } from '../../context/useAuth'
import { PanelLateral } from './PanelLateral'
import { enlacesVisibles } from './enlacesClinicos'

/**
 * `pie` recibe los controles que en escritorio viven en la barra superior y no
 * caben en la de un celular (cuota de WhatsApp, selector de sucursal, reinicio
 * de la demo): aquí abajo siguen a un toque de distancia.
 */
export function Sidebar({
  abierto,
  onCerrar,
  pie,
}: {
  abierto: boolean
  onCerrar: () => void
  pie?: ReactNode
}) {
  const { usuario, modulosHabilitados } = useAuth()
  const visibles = enlacesVisibles(usuario?.rol, modulosHabilitados)

  return (
    <PanelLateral
      abierto={abierto}
      onCerrar={onCerrar}
      className="border-r border-slate-200/50 bg-white/95 backdrop-blur-xl md:bg-white/60"
    >
      {/* Marca */}
      <div className="flex items-center justify-between gap-3.5 border-b border-slate-200/50 px-5 py-5 sm:px-6 sm:py-6">
        <img src="/vetoraicono.png" alt="Vetora" className="h-28 w-28 object-contain drop-shadow-md" />
        <button
          onClick={onCerrar}
          aria-label="Cerrar menú"
          className="ml-auto -mr-1 flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 md:hidden"
        >
          <X size={20} />
        </button>
      </div>

      {/* Navegación */}
      <nav data-tour="menu" className="flex-1 space-y-1.5 overflow-y-auto px-4 py-5 sm:py-6">
        {visibles.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            // Ancla del tour de bienvenida: un paso puede señalar «menu-caja»,
            // «menu-pacientes», etc. sin que el tour tenga que saber en qué
            // orden vive cada enlace. Va en TODOS por igual —no cuesta nada— y
            // así un paso nuevo no necesita volver a tocar este archivo.
            data-tour={`menu-${to.slice(1)}`}
            onClick={onCerrar}
            className={({ isActive }) =>
              clsx(
                'group relative flex cursor-pointer items-center gap-3.5 overflow-hidden rounded-xl px-4 py-3 text-sm font-semibold transition-all duration-300',
                isActive
                  ? 'bg-gradient-to-r from-teal-500/10 to-transparent text-teal-800'
                  : 'text-slate-500 hover:bg-slate-100/60 hover:text-slate-900',
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon
                  size={20}
                  className={clsx(
                    'transition-all duration-300',
                    isActive
                      ? 'scale-110 text-teal-600 drop-shadow-sm'
                      : 'text-slate-400 group-hover:scale-110 group-hover:text-slate-600',
                  )}
                />
                <span className="z-10">{label}</span>
                {isActive && (
                  <span className="absolute left-0 top-2 bottom-2 w-1.5 rounded-r-full bg-teal-500 shadow-[0_0_8px_rgba(20,184,166,0.6)]" />
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Controles que en celular no caben arriba */}
      {pie && <div className="border-t border-slate-100 px-4 py-4 md:hidden">{pie}</div>}

      <div className="border-t border-slate-100 px-6 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] max-md:hidden">
        <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-center">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Ubicación</p>
          <p className="mt-0.5 text-xs font-semibold text-slate-700">Bolivia</p>
          <span className="mt-2 inline-block rounded-full border border-teal-200/50 bg-teal-50 px-2.5 py-0.5 text-[10px] font-bold text-teal-700">
            v0.1
          </span>
        </div>
      </div>
    </PanelLateral>
  )
}
