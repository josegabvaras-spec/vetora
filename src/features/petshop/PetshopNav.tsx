import { NavLink } from 'react-router-dom'
import { clsx } from 'clsx'
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Boxes,
  Truck,
  Building2,
  Receipt,
  Users,
  Percent,
  Wallet,
  BarChart3,
  Settings,
} from 'lucide-react'

const ENLACES_PETSHOP = [
  { to: '/petshop/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/petshop/pos', label: 'Punto de Venta', icon: ShoppingCart },
  { to: '/petshop/productos', label: 'Productos', icon: Package },
  { to: '/petshop/inventario', label: 'Inventario', icon: Boxes },
  { to: '/petshop/compras', label: 'Compras', icon: Truck },
  { to: '/petshop/proveedores', label: 'Proveedores', icon: Building2 },
  { to: '/petshop/ordenes', label: 'Órdenes / Ventas', icon: Receipt },
  { to: '/petshop/clientes', label: 'Clientes', icon: Users },
  { to: '/petshop/promociones', label: 'Promociones', icon: Percent },
  { to: '/petshop/caja', label: 'Caja', icon: Wallet },
  { to: '/petshop/reportes', label: 'Reportes', icon: BarChart3 },
  { to: '/petshop/configuracion', label: 'Configuración', icon: Settings },
]

export function PetshopNav() {
  return (
    <div className="border-b border-slate-200 bg-white/80 backdrop-blur-md sticky top-0 z-20 px-4">
      <div className="flex items-center space-x-1 overflow-x-auto py-2 no-scrollbar">
        {ENLACES_PETSHOP.map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap',
                  isActive
                    ? 'bg-teal-50 text-teal-800 border border-teal-200/60 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-transparent',
                )
              }
            >
              <Icon size={15} />
              <span>{item.label}</span>
            </NavLink>
          )
        })}
      </div>
    </div>
  )
}
