import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { clsx } from 'clsx'
import { CalendarDays, PawPrint, Boxes, Wallet, ArrowLeftRight, Tags, BedDouble, Download, BarChart3, Bot, X } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { PanelLateral } from './PanelLateral'
import type { ModuloVetora, Rol } from '../../types/database'

export interface EnlaceClinico {
  to: string
  label: string
  icon: typeof CalendarDays
  /** Para la barra inferior del celular, donde no cabe la etiqueta larga. */
  etiquetaCorta?: string
  /** Vacío o ausente = visible para todos. */
  roles?: Rol[]
  /**
   * Módulo del plan del que depende esta sección (migración 0024). Ausente =
   * no depende de ninguno, así que se ve con cualquier plan.
   *
   * `/agenda` se deja a propósito SIN módulo: es el destino al que rebota
   * `ModuloRoute` y al que manda `InicioSegunRol`, así que gatearla crearía un
   * bucle de redirecciones.
   */
  modulo?: ModuloVetora
}

/**
 * Fuente única del menú clínico: la barra inferior del celular
 * ([MobileNav](./MobileNav.tsx)) toma de aquí sus pestañas, para que añadir una
 * pantalla o cambiarle el rol no haya que tocarlo en dos sitios. El orden manda:
 * las primeras entradas visibles son las que llegan a la barra inferior.
 */
export const ENLACES_CLINICOS: EnlaceClinico[] = [
  { to: '/caja', label: 'Caja', icon: Wallet, roles: ['recepcion', 'admin'], modulo: 'caja' },
  { to: '/agenda', label: 'Agenda', icon: CalendarDays },
  { to: '/pacientes', label: 'Pacientes', icon: PawPrint },
  {
    to: '/asistente',
    label: 'Asistente',
    // Un robot, no una campana: la campana decía «notificaciones», y esto es el
    // asistente. El icono sale de aquí para el menú lateral y para la barra
    // inferior del celular, que leen la misma lista.
    icon: Bot,
    // Un enlace, dos pantallas: `AsistenteSegunRol` decide cuál según el rol.
    roles: ['recepcion', 'admin', 'veterinario'],
    modulo: 'asistente_ia',
  },
  { to: '/internacion', label: 'Internación', icon: BedDouble, etiquetaCorta: 'Internac.', modulo: 'internacion' },
  { to: '/inventario', label: 'Inventario', icon: Boxes, modulo: 'inventario' },
  { to: '/metricas', label: 'Métricas', icon: BarChart3, roles: ['admin'], modulo: 'metricas' },
  { to: '/respaldo', label: 'Respaldo', icon: Download, roles: ['recepcion', 'admin'] },
  { to: '/servicios', label: 'Servicios', icon: Tags, roles: ['admin'] },
  { to: '/movimientos', label: 'Movimientos', icon: ArrowLeftRight, roles: ['admin'], modulo: 'caja' },
]

/**
 * Las pantallas que se ven, en el orden del menú.
 *
 * Dos filtros, no uno: el **rol** dice qué le toca a esta persona, y los
 * **módulos** qué contrató la clínica (0024). Una recepcionista de una
 * peluquería no ve Internación ni porque su rol lo permita, si el plan no
 * trae ese módulo.
 *
 * `modulos` es opcional para no romper a quien la llame sin ese dato: sin
 * lista, no se filtra por módulo. Los dos llamadores reales
 * (`Sidebar` y `MobileNav`) sí la pasan.
 */
export function enlacesVisibles(rol: Rol | undefined, modulos?: ModuloVetora[]): EnlaceClinico[] {
  return ENLACES_CLINICOS.filter((l) => {
    const rolOk = !l.roles || (rol !== undefined && l.roles.includes(rol))
    const moduloOk = !l.modulo || !modulos || modulos.includes(l.modulo)
    return rolOk && moduloOk
  })
}

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
