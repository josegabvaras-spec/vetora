import {
  ShoppingCart,
  Boxes,
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
 *
 * ⚠️ **«Productos», «Compras» y «Proveedores» no están aquí — son pestañas
 * de «Inventario», no pantallas propias.** Eran cuatro enlaces para tres
 * tablas que siempre fueron de la CLÍNICA (`producto_lotes`, `proveedores`,
 * `ordenes_compra` — policies por `clinica_id`, sin relación con el módulo
 * del plan) más el catálogo retail del petshop. `PetshopInventarioPage`
 * ahora las anida en pestañas — «Productos, Lotes y vencimientos,
 * Proveedores, Compras»—, el mismo patrón que `/inventario` ya usa en la
 * clínica. Las tres rutas siguen montadas en `App.tsx` (misma página, para
 * no romper enlaces guardados), solo se quitaron del menú.
 *
 * ⚠️ **«Dashboard» no está aquí a propósito, y eso NO cierra la pantalla** —
 * mismo tratamiento que ya tiene `enlacesPeluqueria.ts`. `PetshopDashboardPage`
 * sigue siendo la ruta `index` de `/petshop` (`App.tsx`) y `/petshop/dashboard`
 * sigue montada; solo se quitó del menú, no del sistema. Se sigue llegando
 * ahí al entrar al panel, lo que no hay es un enlace para volver una vez que
 * se navegó a otra sección.
 */
const TODO_EL_PERSONAL_DE_PETSHOP = ['admin', 'recepcion', 'veterinario'] as const

export const ENLACES_PETSHOP: EnlaceClinico[] = [
  { to: '/petshop/pos', label: 'Punto de Venta', icon: ShoppingCart, etiquetaCorta: 'POS' },
  { to: '/petshop/inventario', label: 'Inventario', icon: Boxes },
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
