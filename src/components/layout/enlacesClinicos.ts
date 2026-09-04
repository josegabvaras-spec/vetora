import { CalendarDays, PawPrint, Boxes, Wallet, ArrowLeftRight, Tags, BedDouble, Download, BarChart3, Bot, ShoppingBag, Contact, Scissors, ShoppingCart } from 'lucide-react'
import { panelDelNegocio } from '../../lib/personal'
import { ENLACES_PELUQUERIA } from './enlacesPeluqueria'
import { ENLACES_PETSHOP } from './enlacesPetshop'
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
   * Módulo del plan del que depende esta ENTRADA DEL MENÚ (migración 0024).
   * Ausente = no depende de ninguno, así que se ve con cualquier plan.
   *
   * ⚠️ No confundir con gatear la RUTA. Este campo solo lo lee
   * `enlacesVisibles`, que decide qué enlaces se pintan; las rutas se gatean
   * aparte, con `ModuloRoute` en `App.tsx`.
   *
   * La distinción importa en `/agenda`: **su ruta no puede gatearse nunca** —es
   * el destino al que rebotan `ModuloRoute` y `RolRoute`, y gatearla crearía un
   * bucle de redirecciones—, pero **su entrada del menú sí**, y por eso lleva
   * `modulo: 'agenda'`. Un petshop no tiene ese módulo y no ve el enlace,
   * mientras la ruta sigue disponible como terminal seguro.
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
  // El módulo gatea el ENLACE, no la ruta (ver el comentario de `modulo`
  // arriba): un petshop no agenda citas y no tiene por qué ver la agenda
  // clínica en su menú, pero `/agenda` sigue siendo el destino de rebote.
  { to: '/agenda', label: 'Agenda', icon: CalendarDays, modulo: 'agenda' },
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
  {
    to: '/pacientes',
    label: 'Pacientes',
    icon: PawPrint,
    roles: ['admin', 'veterinario', 'recepcion', 'peluquero'],
    modulo: 'fichas',
  },
  // Los dueños. `/pacientes` lista mascotas, así que una ficha sin mascotas
  // —la que queda cuando el registro del portal no encuentra a su dueño— no
  // se veía en ninguna pantalla hasta que existió esta.
  {
    to: '/clientes',
    label: 'Clientes',
    icon: Contact,
    roles: ['admin', 'veterinario', 'recepcion', 'peluquero'],
    modulo: 'fichas',
  },
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
  { to: '/servicios', label: 'Servicios', icon: Tags, roles: ['admin'], modulo: 'servicios' },
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

/**
 * Las entradas del menú clínico que sobreviven en una peluquería o un petshop:
 * no son clínicas y **no existen dentro de sus paneles**.
 *
 * - `/caja` — **el turno de caja, y es imprescindible.** Ni la peluquería ni
 *   el petshop tienen ya una caja propia en su panel: las dos que hubo
 *   (`PeluqueriaCajaPage`, `PetshopCajaPage`) eran vistas de solo lectura del
 *   mismo turno que abre y cierra esta pantalla —ninguna abría ni cerraba
 *   nada ella misma, las dos remitían aquí cuando no había turno abierto—,
 *   así que había dos entradas para lo mismo y solo una servía de verdad.
 *   Quitarla del menú dejaba el POS **sin poder facturar**, así que sigue
 *   aquí como única «Caja» — sin renombrar, ya no hay con qué confundirla.
 * - `/asistente` — qué toca hacer hoy. `AsistenteSegunRol` reparte la pantalla
 *   por rol y por negocio, así que cada uno ve la suya.
 * - `/respaldo` — bajarse una copia de sus datos. No depende de ningún módulo:
 *   son suyos.
 * - `/catalogo` — la vitrina que ve el dueño de mascota en la Tienda.
 * - `/pacientes` — **imprescindible, y no «no es de su negocio»**: es donde
 *   se da de alta la mascota. Faltó aquí desde que existe esta lista (0034),
 *   y una peluquería se quedó sin ningún camino en el menú para registrar un
 *   paciente nuevo. La ruta en sí nunca estuvo cerrada (`RolRoute` ya admite
 *   `peluquero` desde 0025); lo que faltaba era el enlace. Pasa por
 *   `enlacesVisibles` como el resto de supervivientes, así que respeta su
 *   propio `modulo: 'fichas'` — el plan PetShop no lo trae (vende productos,
 *   no lleva expediente de mascota), así que ahí se cae solo sin necesidad de
 *   excluirlo a mano. Se renombra a «Mascotas» en el panel de peluquería (ver
 *   `RENOMBRES_POR_PANEL`) — mismo destino, mejor nombre para quien no piensa
 *   en «pacientes».
 * - `/inventario` — **productos, lotes y vencimientos, proveedores y
 *   compras, las cuatro secciones que ya tiene la clínica.** El plan
 *   Peluquería SÍ trae el módulo `inventario` (a diferencia de PetShop, que
 *   no lo trae — vende retail, no fármacos por dosis), pero antes no había
 *   ningún enlace a esta pantalla: lo único que existía en su lugar era
 *   «Insumos» (`PeluqueriaInsumosPage`, borrada), que no era inventario —
 *   era la receta de qué consume cada servicio, y esa edición ya vive en
 *   «Servicios» → Configurar. Reusar `/inventario` en vez de construir un
 *   `/peluqueria/inventario` propio es a propósito: es la MISMA pantalla que
 *   ve una veterinaria, con sus mismas pestañas, y `modulo: 'inventario'` en
 *   `ENLACES_CLINICOS` ya la cierra para PetShop sin excluirla a mano aquí.
 *
 * `/clientes` NO está en esta lista: la peluquería tiene su propia entrada
 * «Clientes» en `ENLACES_PELUQUERIA`, que fusiona el CRUD general de dueños
 * con la fidelización (`PeluqueriaClientesPage`) — dejar también el genérico
 * aquí crearía dos enlaces «Clientes» a la vez. El petshop nunca lo necesitó:
 * su plan no trae `fichas` (no lleva expediente de mascota) y ya tiene su
 * propio `/petshop/clientes`.
 *
 * Todo lo demás del menú clínico se cae: o no es de su negocio (Internación)
 * o está duplicado dentro de su propio panel apuntando a la versión clínica
 * (Agenda, Servicios, Métricas).
 */
const SOBREVIVEN_FUERA_DE_LA_CLINICA = ['/caja', '/asistente', '/respaldo', '/catalogo', '/pacientes', '/inventario']

/**
 * Cómo se llaman los supervivientes fuera de una clínica.
 *
 * Ninguno de los dos paneles renombra ya su Caja — ni peluquería ni petshop
 * conservan una caja propia (ver el comentario de `/caja` más arriba), así
 * que «Caja» a secas no se confunde con nada. El renombre que sí queda es de
 * peluquería: «Pacientes» → «Mascotas» (mismo destino, `/pacientes`; quien
 * atiende una peluquería piensa en «mascotas», no en «pacientes»).
 */
const RENOMBRES_POR_PANEL: Record<
  string,
  Record<string, Pick<EnlaceClinico, 'label' | 'etiquetaCorta'>>
> = {
  petshop: {},
  peluqueria: { '/pacientes': { label: 'Mascotas' } },
}

/**
 * El orden exacto del menú para el negocio que lo pide explícito — hoy solo
 * peluquería. Sin esto, `menuDelNegocio` pone primero TODAS las secciones
 * propias del panel y recién después los supervivientes (Caja, Asistente,
 * Pacientes, Catálogo, Respaldo), en el orden fijo de `ENLACES_CLINICOS` —
 * un orden que nadie pidió y que intercalaba mal con lo que sí se pidió:
 * Caja y Agenda primero, Clientes (propia) justo después de Pacientes/Mascotas
 * (superviviente), Reportes antes de Respaldo. Un panel sin entrada aquí
 * conserva el orden natural propias-luego-supervivientes (petshop, por
 * ahora).
 */
const ORDEN_PERSONALIZADO_POR_PANEL: Record<string, string[]> = {
  peluqueria: [
    '/caja',
    '/peluqueria/agenda',
    '/asistente',
    '/pacientes',
    '/peluqueria/clientes',
    '/catalogo',
    '/peluqueria/peluqueros',
    '/inventario',
    '/peluqueria/reportes',
    '/respaldo',
    '/peluqueria/servicios',
    '/peluqueria/configuracion',
  ],
}

/**
 * El menú principal según **qué es** el negocio.
 *
 * Una peluquería y un petshop tenían dos menús a la vez: el lateral con
 * entradas de clínica, y sus propias secciones escondidas en una barra
 * horizontal dentro del panel. Para llegar a «Órdenes» o «Proveedores» había
 * que entrar al panel y buscar en un segundo menú. Ahora sus secciones **son**
 * el menú lateral, y la barra de dentro desaparece (ver los dos layouts).
 *
 * Una veterinaria no cambia — ni siquiera con peluquería o petshop
 * integrados—: ahí esos módulos son una sección más, y su entrada única abre
 * el panel con su barra, que es donde tiene sentido.
 *
 * Los supervivientes pasan por `enlacesVisibles` en vez de escribirse a mano
 * para que conserven su filtro de rol y de módulo: sin el plan de
 * `asistente_ia` no hay Asistente, y `/catalogo` sigue siendo solo de `admin`.
 *
 * El orden final lo decide `ORDEN_PERSONALIZADO_POR_PANEL` cuando el panel
 * tiene uno propio; si no, se queda el orden natural (propias, luego
 * supervivientes). Ordenar DESPUÉS de filtrar por rol y módulo es a
 * propósito: un enlace que ese rol no ve no puede dejar un hueco ni
 * desordenar a los que sí — el `indexOf` solo compara entre lo que ya
 * sobrevivió el filtro.
 */
export function menuDelNegocio(rol: Rol | undefined, modulos?: ModuloVetora[]): EnlaceClinico[] {
  const panel = panelDelNegocio(modulos)
  if (!panel) return enlacesVisibles(rol, modulos)

  const seccionesDelPanel = panel === 'peluqueria' ? ENLACES_PELUQUERIA : ENLACES_PETSHOP
  const propias = seccionesDelPanel.filter(
    (l) => !l.roles || (rol !== undefined && l.roles.includes(rol)),
  )
  const supervivientes = enlacesVisibles(rol, modulos)
    .filter((l) => SOBREVIVEN_FUERA_DE_LA_CLINICA.includes(l.to))
    .map((l) => ({ ...l, ...(RENOMBRES_POR_PANEL[panel]?.[l.to] ?? {}) }))

  const combinado = [...propias, ...supervivientes]
  const orden = ORDEN_PERSONALIZADO_POR_PANEL[panel]
  if (!orden) return combinado

  // Un enlace nuevo que se olvide de añadir aquí no puede saltar al principio
  // del menú (indexOf devuelve -1, y -1 es "menor" que cualquier posición
  // real): se manda al final en vez de encabezarlo en silencio.
  const posicion = (to: string) => {
    const i = orden.indexOf(to)
    return i === -1 ? orden.length : i
  }
  return [...combinado].sort((a, b) => posicion(a.to) - posicion(b.to))
}
