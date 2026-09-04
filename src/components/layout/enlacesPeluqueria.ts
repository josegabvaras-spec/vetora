import {
  CalendarDays,
  Scissors,
  Users,
  Boxes,
  Percent,
  HeartHandshake,
  BarChart3,
  Settings,
} from 'lucide-react'
import type { EnlaceClinico } from './enlacesClinicos'

/**
 * Las secciones del panel de peluquería.
 *
 * Salieron de `features/peluqueria/PeluqueriaNav.tsx` por el mismo motivo que
 * existe `enlacesClinicos.ts`: **un fichero que exporta componentes Y
 * constantes rompe el Fast Refresh de Vite**, y ahora las leen dos sitios —la
 * barra del panel y el menú principal, cuando el negocio *es* una peluquería
 * (ver `menuDelNegocio`)—.
 *
 * ⚠️ **`roles` en todas, incluidas las que antes no lo llevaban.** El panel va
 * detrás de `RolRoute roles={['admin','recepcion','peluquero']}`, así que sin
 * ese suelo un `veterinario` de un plan mixto vería «Agenda» en su menú y el
 * enlace le rebotaría. El menú y la ruta tienen que decir lo mismo — es el
 * error que `enlacesClinicos` ya documenta para `/internacion`.
 *
 * ⚠️ **«Dashboard» no está aquí a propósito, y eso NO cierra la pantalla.**
 * `PeluqueriaDashboardPage` sigue siendo la ruta `index` de `/peluqueria`
 * (`App.tsx`) y `/peluqueria/dashboard` sigue montada — solo se quitó del
 * menú, no del sistema. Se sigue llegando ahí al entrar al panel; lo que no
 * hay es un enlace para volver una vez que se navegó a otra sección.
 */
const TODO_EL_PERSONAL_DE_PELUQUERIA = ['admin', 'recepcion', 'peluquero'] as const

export const ENLACES_PELUQUERIA: EnlaceClinico[] = [
  {
    to: '/peluqueria/agenda',
    label: 'Agenda',
    icon: CalendarDays,
    roles: [...TODO_EL_PERSONAL_DE_PELUQUERIA],
  },
  { to: '/peluqueria/servicios', label: 'Servicios', icon: Scissors, roles: ['admin'] },
  { to: '/peluqueria/peluqueros', label: 'Peluqueros', icon: Users, roles: ['admin', 'recepcion'] },
  { to: '/peluqueria/insumos', label: 'Insumos', icon: Boxes, roles: ['admin'] },
  {
    to: '/peluqueria/comisiones',
    label: 'Comisiones',
    icon: Percent,
    roles: ['admin', 'peluquero'],
  },
  {
    to: '/peluqueria/fidelizacion',
    label: 'Clientes frecuentes',
    icon: HeartHandshake,
    etiquetaCorta: 'Frecuentes',
    roles: ['admin', 'recepcion'],
  },
  // ⚠️ Aquí NO va ninguna caja, y es a propósito: la de la peluquería y la de
  // la clínica pasaron a ser **la misma pantalla**. `/peluqueria/caja` seguía
  // existiendo pero no sabía abrir ni cerrar turno —lo decía ella misma: «Abre
  // caja en el módulo de Caja»—, así que había dos entradas para cobrar y solo
  // una servía. El menú lleva `/caja` como única «Caja» (ver
  // `RENOMBRES_POR_PANEL` en enlacesClinicos).
  { to: '/peluqueria/reportes', label: 'Reportes', icon: BarChart3, roles: ['admin'] },
  {
    to: '/peluqueria/configuracion',
    label: 'Configuración',
    icon: Settings,
    etiquetaCorta: 'Config.',
    roles: ['admin'],
  },
]
