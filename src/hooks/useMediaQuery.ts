import { useSyncExternalStore } from 'react'

/**
 * Suscripción a una media query del navegador.
 *
 * Va por `useSyncExternalStore` y no por `useState` + `useEffect` para que el
 * **primer** render ya devuelva el valor correcto: quien elige su vista según
 * el ancho (la agenda, por ejemplo) montaría si no la vista de escritorio y la
 * cambiaría un instante después.
 */
export function useMediaQuery(consulta: string): boolean {
  return useSyncExternalStore(
    (avisar) => {
      const mql = window.matchMedia(consulta)
      mql.addEventListener('change', avisar)
      return () => mql.removeEventListener('change', avisar)
    },
    () => window.matchMedia(consulta).matches,
    () => false,
  )
}

/**
 * Los tres formatos que atiende la aplicación se separan en los breakpoints de
 * Tailwind: `md` (768 px) parte celular de tablet — y es donde el menú lateral
 * deja de ser un cajón para ser una columna fija —, y `lg` (1024 px) parte
 * tablet de escritorio.
 */
export const CONSULTA_MD = '(min-width: 768px)'

/** True desde tablet en vertical hacia arriba. */
export function useEsEscritorio(): boolean {
  return useMediaQuery(CONSULTA_MD)
}
