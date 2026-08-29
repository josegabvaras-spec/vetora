import type { Rol } from '../types/database'

/**
 * El tour de bienvenida, como datos.
 *
 * Los pasos viven aquí y el motor que los pinta en
 * [features/onboarding/Tour.tsx](../features/onboarding/Tour.tsx). Separarlos
 * permite corregir un texto sin tocar la lógica del velo ni del teclado.
 */

/**
 * Versión del tour que conoce este código.
 *
 * El tour arranca solo cuando lo que la persona ya vio es **menor** que esto.
 * Al añadir una función importante, sube el número: todos lo verán una vez más.
 * No hace falta tocar la base ni borrar filas.
 */
export const VERSION_ONBOARDING = 3

/**
 * Dónde aplica un paso.
 *
 * La frontera es `md` (768 px), la misma que usa toda la aplicación
 * (`CONSULTA_MD`): en escritorio el menú es una columna fija y no hay barra
 * inferior; en celular es al revés. Un paso que apunte a algo que en ese
 * formato no existe se salta solo, pero declararlo evita medir para nada.
 */
export type FormatoPaso = 'siempre' | 'solo-movil' | 'solo-escritorio'

export interface PasoTour {
  /** Coincide con el `data-tour` del elemento. Vacío = ventana centrada. */
  ancla?: string
  titulo: string
  texto: string
  formato?: FormatoPaso
  /**
   * El elemento vive dentro del menú lateral, que en celular es un cajón
   * cerrado. El motor lo abre antes de medir y lo cierra al pasar de largo.
   */
  requiereMenu?: boolean
  /** Texto del botón que avanza. Por defecto, «Siguiente». */
  etiquetaSiguiente?: string
  /**
   * Mismo patrón que `EnlaceClinico.roles` del Sidebar: vacío o ausente =
   * visible para todos. Existe porque no todos los pasos son útiles para los
   * tres roles clínicos por igual — Servicios o el uso de Inventario en una
   * consulta son cosas que le tocan a quien gestiona la clínica, no al
   * veterinario. Se filtra ANTES que el formato, en `Tour.tsx`.
   */
  roles?: Rol[]
}

/** Recorrido del personal de la clínica: admin, veterinario y recepción. */
export const PASOS_CLINICA: PasoTour[] = [
  {
    titulo: '👋 ¡Bienvenido!',
    texto:
      'Te mostramos en un minuto lo principal de Vetora. Puedes salir cuando quieras con la tecla Escape, y volver a verlo desde «Mi cuenta».',
    etiquetaSiguiente: 'Comenzar tour',
  },
  {
    ancla: 'menu',
    titulo: 'El menú',
    texto:
      'Aquí están las secciones de la aplicación. Verás solo las que te corresponden según tu rol, así que el menú de cada persona del equipo es distinto.',
    formato: 'solo-escritorio',
  },
  {
    ancla: 'menu',
    titulo: 'El menú',
    texto:
      'Este es el menú completo, con las secciones que te corresponden según tu rol. Se abre con el botón «Menú» de la barra de abajo.',
    formato: 'solo-movil',
    requiereMenu: true,
  },
  {
    ancla: 'nav-movil',
    titulo: 'Accesos rápidos',
    texto:
      'Desde esta barra llegas de un toque a lo que más se usa en el día, y con el botón «Menú» abres el resto de secciones.',
    formato: 'solo-movil',
  },
  // Los siguientes son solo para quien gestiona la clínica, no para el
  // veterinario. Y van EN ESTE ORDEN a propósito: es la cadena de dependencias
  // real de una clínica que estrena Vetora. No se puede descontar un
  // medicamento que no está en inventario, ni cobrar un servicio sin tarifa, ni
  // abrir una consulta sin un paciente dado de alta. El tour cuenta ese orden
  // de trabajo, no el recorrido visual de la pantalla.
  //
  // NO numeres estos títulos («1. Inventario», «2. Servicios»…): recepción no
  // ve el paso de Servicios, así que un número fijo le saltaría del 1 al 3 y
  // parecería que el tour se comió un paso. La secuencia se transmite en el
  // texto, y el contador «N de M» del globo ya lleva la cuenta de verdad.
  {
    ancla: 'menu-inventario',
    titulo: 'Empieza por el Inventario',
    texto:
      'Es el punto de partida. Carga aquí los medicamentos, productos y todo lo que se use en consulta: es de donde el sistema descuenta la cantidad exacta cuando el veterinario los aplica. Sin esto cargado, no hay de dónde descontar.',
    roles: ['admin', 'recepcion'],
    requiereMenu: true,
  },
  {
    // Solo admin: `/servicios` es admin-only en `ENLACES_CLINICOS`, así que el
    // ancla `menu-servicios` ni existe para recepción. Sin este filtro el paso
    // caería en el camino de «elemento ausente», que espera 600 ms antes de
    // rendirse — recepción vería una pausa muerta en mitad del tour.
    ancla: 'menu-servicios',
    titulo: 'Ajusta los Servicios',
    texto:
      'Aquí defines las tarifas de cada servicio: consultas, cirugías, vacunación, internación. Es el precio que después aparece en Caja al momento de cobrar.',
    roles: ['admin'],
    requiereMenu: true,
  },
  {
    ancla: 'menu-pacientes',
    titulo: 'Registra los Pacientes',
    texto:
      'Da de alta al dueño y a su mascota aquí. Es requisito: sin el paciente en la base de datos no se le puede agendar una cita ni abrirle una consulta.',
    roles: ['admin', 'recepcion'],
    requiereMenu: true,
  },
  {
    ancla: 'menu-asistente',
    titulo: 'El asistente',
    texto:
      'Te avisa qué toca hoy: recordatorios de citas próximas, refuerzos de vacuna vencidos y consultas que quedaron sin cobrar. Redacta el mensaje y tú decides si lo envías.',
    roles: ['admin', 'recepcion'],
    requiereMenu: true,
  },
  {
    ancla: 'menu-caja',
    titulo: 'Caja',
    texto:
      'Aquí cobras las consultas y las ventas. Los precios que ves salen de Servicios, donde el administrador los define — sin eso cargado, no hay qué cobrar.',
    roles: ['admin', 'recepcion'],
    requiereMenu: true,
  },
  {
    ancla: 'perfil',
    titulo: 'Tu cuenta',
    texto:
      'Aquí ves tus datos, cambias tu contraseña y —si eres administrador— gestionas la facturación de la clínica. También puedes volver a ver este tutorial.',
  },
  // Aquí vivían dos pasos que explicaban los controles de la agenda (el
  // selector día/semana/mes y el botón de Nueva Cita). Se quitaron para que el
  // tour sea una guía de PUESTA EN MARCHA y no un recorrido de la pantalla: la
  // agenda se entiende sola al usarla, pero el orden Inventario → Servicios →
  // Pacientes no es evidente y es lo que bloquea a una clínica que empieza.
  // Sus anclas `data-tour` siguen en AgendaPage por si se quieren recuperar.
  {
    titulo: '🎉 ¡Listo!',
    texto:
      'Ya conoces lo principal. Si alguna vez quieres repasarlo, lo tienes en «Mi cuenta» → «Ver el tutorial otra vez».',
    etiquetaSiguiente: 'Entendido',
  },
]

/**
 * Recorrido del portal del dueño de la mascota.
 *
 * Es más corto a propósito: su pantalla no tiene menú lateral ni barra
 * inferior, solo sus mascotas. Y quien lo usa entra de vez en cuando, no todos
 * los días — cuanto más breve, mejor.
 */
export const PASOS_PORTAL: PasoTour[] = [
  {
    titulo: '👋 ¡Bienvenido!',
    texto:
      'Este es tu portal: desde aquí sigues la salud de tus mascotas. Te lo enseñamos en treinta segundos.',
    etiquetaSiguiente: 'Comenzar',
  },
  // Las anclas apuntan a la barra inferior (`PortalClienteLayout`), que está en
  // todas las rutas del portal. Antes señalaban elementos del cuerpo de
  // `PortalMascotasPage` y `PortalPerfilPage`, que no existen en el dashboard
  // —donde el tour siempre arranca—, así que el motor los daba por ausentes y se
  // saltaba los dos pasos seguidos.
  {
    ancla: 'portal-tab-mascotas',
    titulo: 'Tus mascotas',
    texto:
      'Desde esta pestaña llegas a todas tus mascotas. Toca cualquiera para ver su historial, sus vacunas y las recetas que le dio el veterinario.',
  },
  {
    ancla: 'portal-tab-perfil',
    titulo: 'Tu perfil',
    texto:
      'Aquí están tus datos y el botón para cerrar sesión. Sal siempre al terminar si usas un dispositivo compartido.',
  },
  {
    titulo: '🎉 ¡Listo!',
    texto: 'Eso es todo. Ante cualquier duda sobre tu mascota, habla con tu veterinaria.',
    etiquetaSiguiente: 'Entendido',
  },
]

/**
 * Deja solo los pasos que aplican al formato de pantalla actual.
 *
 * Que un paso sobre se decide aquí; que el elemento no exista —porque el rol no
 * tiene esa sección— lo resuelve el motor al medir.
 */
export function pasosParaFormato(pasos: PasoTour[], esEscritorio: boolean): PasoTour[] {
  return pasos.filter((p) => {
    if (p.formato === 'solo-movil') return !esEscritorio
    if (p.formato === 'solo-escritorio') return esEscritorio
    return true
  })
}

/**
 * Deja solo los pasos que le tocan a este rol.
 *
 * Mismo criterio que `enlacesVisibles()` del Sidebar: sin `roles`, el paso es
 * para todos. Se aplica ANTES que `pasosParaFormato`, para que un paso que ni
 * siquiera es del rol no llegue a intentar medirse.
 */
export function pasosParaRol(pasos: PasoTour[], rol: Rol | undefined): PasoTour[] {
  return pasos.filter((p) => !p.roles || (rol !== undefined && p.roles.includes(rol)))
}
