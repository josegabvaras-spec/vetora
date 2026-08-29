import { createContext, useContext } from 'react'

/**
 * El contexto del tour y su hook, aparte del proveedor.
 *
 * Están aquí y no en `OnboardingProvider.tsx` porque ese fichero exporta un
 * COMPONENTE, y un módulo que exporta componentes y no componentes a la vez
 * rompe el Fast Refresh de Vite: al tocar cualquiera de las dos cosas se
 * recarga entero y se pierde el estado de la pantalla.
 *
 * El contexto existe por una razón concreta: el botón «Ver el tutorial otra
 * vez» vive en el panel de cuenta, que se pinta dentro del `Topbar`, mientras
 * que el tour se monta al nivel del layout. Es lo que conecta a los dos sin
 * subir estado a `App.tsx` ni pasar la función a mano por tres componentes que
 * no la usan.
 */
export interface TourManual {
  /** Vuelve a lanzar el tour a petición del usuario. */
  abrirTour: () => void
  /**
   * El tour ocupa la pantalla ahora, o todavía no se sabe si va a ocuparla.
   *
   * Lo mira quien tenga que esperar su turno para no salir encima: hoy el aviso
   * de instalar la PWA, que es hermano del tour en `AppLayout` y se pintaba a la
   * vez, uno sobre otro.
   */
  tourOcupaPantalla: boolean
}

export const Contexto = createContext<TourManual>({
  abrirTour: () => {},
  tourOcupaPantalla: false,
})

/**
 * Para el botón de «ver otra vez» y para quien espere a que el tour termine.
 *
 * Fuera de un `OnboardingProvider` devuelve una función vacía y
 * `tourOcupaPantalla: false`, en vez de lanzar: el panel de cuenta es el mismo
 * componente en las dos áreas, y el aviso de la PWA se monta además en el login
 * y en el área de plataforma, donde no hay tour ninguno que esperar.
 */
export function useTourManual(): TourManual {
  return useContext(Contexto)
}
