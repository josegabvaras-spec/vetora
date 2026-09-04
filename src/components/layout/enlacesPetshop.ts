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
  // ⚠️ Aquí NO va ninguna caja propia, y es a propósito — mismo motivo que
  // en `enlacesPeluqueria.ts`: «Caja Pet Shop» era una vista de solo lectura
  // del mismo turno que abre y cierra `/caja` (nunca abría ni cerraba nada
  // ella misma; remitía ahí cuando no había turno abierto), así que había
  // dos entradas para lo mismo y solo una servía de verdad. El menú lleva
  // `/caja` como única «Caja» (superviviente, ver `SOBREVIVEN_FUERA_DE_LA_CLINICA`
  // en `enlacesClinicos.ts`). `/petshop/caja` se conserva como ruta —monta la
  // misma `CajaPage`— solo para no romper enlaces guardados.
  { to: '/petshop/reportes', label: 'Reportes', icon: BarChart3 },
  { to: '/petshop/configuracion', label: 'Configuración', icon: Settings, etiquetaCorta: 'Config.' },
].map((enlace) => ({ ...enlace, roles: [...TODO_EL_PERSONAL_DE_PETSHOP] }))
