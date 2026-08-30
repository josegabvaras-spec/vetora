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
import type { EnlaceClinico } from './enlacesClinicos'

/**
 * Las secciones del panel del Pet Shop. Gemela de
 * [enlacesPeluqueria](./enlacesPeluqueria.ts) y por los mismos motivos: fuera
 * del fichero que exporta la barra, para no romper el Fast Refresh, y con
 * `roles` en todas —el panel va detrás de
 * `RolRoute roles={['admin','recepcion','veterinario']}`, así que sin ese suelo
 * un `peluquero` de un plan mixto vería el POS en su menú y el enlace le
 * rebotaría—.
 *
 * El enlace «Tienda» que la barra añadía a `/catalogo` no está aquí: cuando el
 * negocio *es* un petshop, Catálogo ya es una de las tres entradas del menú
 * principal que sobreviven (ver `menuDelNegocio`).
 */
const TODO_EL_PERSONAL_DE_PETSHOP = ['admin', 'recepcion', 'veterinario'] as const

export const ENLACES_PETSHOP: EnlaceClinico[] = [
  { to: '/petshop/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/petshop/pos', label: 'Punto de Venta', icon: ShoppingCart, etiquetaCorta: 'POS' },
  { to: '/petshop/productos', label: 'Productos', icon: Package },
  { to: '/petshop/inventario', label: 'Inventario', icon: Boxes },
  { to: '/petshop/compras', label: 'Compras', icon: Truck },
  { to: '/petshop/proveedores', label: 'Proveedores', icon: Building2 },
  { to: '/petshop/ordenes', label: 'Órdenes / Ventas', icon: Receipt, etiquetaCorta: 'Órdenes' },
  { to: '/petshop/clientes', label: 'Clientes', icon: Users },
  { to: '/petshop/promociones', label: 'Promociones', icon: Percent },
  // «Caja Pet Shop» y no «Caja»: en el menú principal convive con «Caja
  // General» (`/caja`), que es donde se abre y se cierra el turno — esta
  // pantalla lo dice ella misma cuando no hay ninguno abierto.
  { to: '/petshop/caja', label: 'Caja Pet Shop', icon: Wallet, etiquetaCorta: 'Caja' },
  { to: '/petshop/reportes', label: 'Reportes', icon: BarChart3 },
  { to: '/petshop/configuracion', label: 'Configuración', icon: Settings, etiquetaCorta: 'Config.' },
].map((enlace) => ({ ...enlace, roles: [...TODO_EL_PERSONAL_DE_PETSHOP] }))
