import { CalendarDays, PawPrint, Boxes, Wallet, ArrowLeftRight, Tags, BedDouble, Download, BarChart3, Bot, ShoppingBag, Contact, Scissors, ShoppingCart } from 'lucide-react'
import type { ModuloVetora, Rol } from '../../types/database'

/**
 * Las entradas del menú clínico y su filtrado.
 *
 * Viven aquí y no en `Sidebar.tsx` porque las consumen dos componentes
 * —`Sidebar` y `MobileNav`— y un fichero que exporta componentes Y constantes
 * rompe el Fast Refresh de Vite: al tocar cualquiera de las dos cosas se
 * recarga el módulo entero y se pierde el estado de la pantalla.
 */

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
  {
    to: '/petshop/dashboard',
    label: 'Pet Shop',
    icon: ShoppingCart,
    roles: ['admin', 'recepcion', 'veterinario'],
    modulo: 'petshop',
  },
  {
    to: '/peluqueria/dashboard',
    label: 'Peluquería',
    icon: Scissors,
    roles: ['admin', 'recepcion', 'peluquero'],
    modulo: 'peluqueria',
  },
  // El peluquero entra: sin dar de alta a la mascota no hay a quién agendarle
  // ni qué enseñarle al dueño en el portal. Lo que no ve es el expediente
  // clínico — `FichaPacientePage` le oculta las pestañas (ver
  // `puedeVerHistorialClinico`).
  { to: '/pacientes', label: 'Pacientes', icon: PawPrint, roles: ['admin', 'veterinario', 'recepcion', 'peluquero'] },
  // Los dueños. `/pacientes` lista mascotas, así que una ficha sin mascotas
  // —la que queda cuando el registro del portal no encuentra a su dueño— no
  // se veía en ninguna pantalla hasta que existió esta.
  { to: '/clientes', label: 'Clientes', icon: Contact, roles: ['admin', 'veterinario', 'recepcion', 'peluquero'] },
  {
    to: '/asistente',
    label: 'Asistente',
    // Un robot, no una campana: la campana decía «notificaciones», y esto es el
    // asistente. El icono sale de aquí para el menú lateral y para la barra
    // inferior del celular, que leen la misma lista.
    icon: Bot,
    // Un enlace, dos pantallas: `AsistenteSegunRol` decide cuál según el rol.
    roles: ['recepcion', 'admin', 'veterinario', 'peluquero'],
    modulo: 'asistente_ia',
  },
  // `roles` explícito aunque parezca redundante: sin él estas dos salían en el
  // menú del peluquero, cuyo `RolRoute` no las admite, y el enlace le rebotaba
  // a la agenda. El menú y la ruta tienen que decir lo mismo.
  {
    to: '/internacion',
    label: 'Internación',
    icon: BedDouble,
    etiquetaCorta: 'Internac.',
    roles: ['admin', 'veterinario', 'recepcion'],
    modulo: 'internacion',
  },
  {
    to: '/inventario',
    label: 'Inventario',
    icon: Boxes,
    roles: ['admin', 'veterinario', 'recepcion'],
    modulo: 'inventario',
  },
  { to: '/metricas', label: 'Métricas', icon: BarChart3, roles: ['admin'], modulo: 'metricas' },
  { to: '/respaldo', label: 'Respaldo', icon: Download, roles: ['recepcion', 'admin'] },
  { to: '/servicios', label: 'Servicios', icon: Tags, roles: ['admin'] },
  { to: '/movimientos', label: 'Movimientos', icon: ArrowLeftRight, roles: ['admin'], modulo: 'caja' },
  { to: '/catalogo', label: 'Catálogo', icon: ShoppingBag, roles: ['admin'], modulo: 'catalogo' },
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
