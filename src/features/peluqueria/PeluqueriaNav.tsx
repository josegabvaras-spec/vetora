import { NavLink } from 'react-router-dom'
import { clsx } from 'clsx'
import {
  LayoutDashboard,
  CalendarDays,
  ClipboardList,
  Scissors,
  PawPrint,
  Users,
  Boxes,
  Percent,
  HeartHandshake,
  Wallet,
  BarChart3,
  Settings,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'

interface SeccionNav {
  to: string
  label: string
  icon: typeof LayoutDashboard
  roles?: string[]
}

const SECCIONES_PELUQUERIA: SeccionNav[] = [
  { to: '/peluqueria/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/peluqueria/agenda', label: 'Agenda', icon: CalendarDays },
  { to: '/peluqueria/ordenes', label: 'Órdenes', icon: ClipboardList },
  { to: '/peluqueria/servicios', label: 'Servicios', icon: Scissors, roles: ['admin'] },
  { to: '/peluqueria/mascotas', label: 'Mascotas', icon: PawPrint },
  { to: '/peluqueria/peluqueros', label: 'Peluqueros', icon: Users, roles: ['admin', 'recepcion'] },
  { to: '/peluqueria/insumos', label: 'Insumos', icon: Boxes, roles: ['admin'] },
  { to: '/peluqueria/comisiones', label: 'Comisiones', icon: Percent, roles: ['admin', 'peluquero'] },
  { to: '/peluqueria/fidelizacion', label: 'Clientes frecuentes', icon: HeartHandshake, roles: ['admin', 'recepcion'] },
  { to: '/peluqueria/caja', label: 'Caja / Ventas', icon: Wallet, roles: ['admin', 'recepcion'] },
  { to: '/peluqueria/reportes', label: 'Reportes', icon: BarChart3, roles: ['admin'] },
  { to: '/peluqueria/configuracion', label: 'Configuración', icon: Settings, roles: ['admin'] },
]

export function PeluqueriaNav() {
  const { usuario } = useAuth()
  const rol = usuario?.rol || ''

  const visibles = SECCIONES_PELUQUERIA.filter((s) => !s.roles || s.roles.includes(rol))

  return (
    <div className="border-b border-slate-200 bg-white/80 backdrop-blur-md sticky top-0 z-20">
      <div className="flex items-center gap-1.5 overflow-x-auto px-4 py-2 sm:px-6 no-scrollbar">
        {visibles.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              clsx(
                'flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all min-h-10 cursor-pointer',
                isActive
                  ? 'bg-teal-500 text-white shadow-sm shadow-teal-500/20'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
              )
            }
          >
            <Icon size={16} />
            <span>{label}</span>
          </NavLink>
        ))}
      </div>
    </div>
  )
}
