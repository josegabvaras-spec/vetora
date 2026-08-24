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
export const VERSION_ONBOARDING = 2

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
  // Los cuatro siguientes son solo para quien gestiona la clínica, no para el
  // veterinario: explican de dónde sale el stock que se descuenta en consulta,
  // por qué hace falta un paciente antes de poder agendar, qué hace el
  // asistente, y de dónde salen los precios que se cobran en caja.
  {
    ancla: 'menu-pacientes',
    titulo: 'Pacientes',
    texto:
      'Antes de agendar una cita o abrir una consulta, el paciente tiene que existir. Da de alta al dueño y a su mascota aquí — es el primer paso de todo lo demás.',
    roles: ['admin', 'recepcion'],
    requiereMenu: true,
  },
  {
    ancla: 'menu-inventario',
    titulo: 'Inventario',
    texto:
      'Aquí registras el stock de productos y medicamentos. Es lo que permite que, al usarse un medicamento en una consulta, el sistema descuente la cantidad exacta del frasco — mantenlo cargado y al día.',
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
  {
    ancla: 'agenda-vistas',
    titulo: 'Tu agenda',
    texto:
      'La agenda se ve por día, por semana o por mes. Cambia aquí según lo que necesites mirar.',
  },
  {
    ancla: 'agenda-nueva-cita',
    titulo: 'Agendar una cita',
    texto:
      'Con este botón registras una cita nueva. Al elegir veterinario y fecha, el sistema te muestra qué horarios tiene libres.',
  },
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
  {
    ancla: 'portal-mascotas',
    titulo: 'Tus mascotas',
    texto:
      'Aquí están todas tus mascotas. Toca cualquiera para ver su historial, sus vacunas y las recetas que le dio el veterinario.',
  },
  {
    ancla: 'portal-salir',
    titulo: 'Cerrar sesión',
    texto: 'Cuando termines, sal desde aquí. Sobre todo si usas un dispositivo compartido.',
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
