import { useEffect } from 'react'

/**
 * Bloquea el scroll de la página de fondo mientras `activo` es verdadero.
 *
 * Sin esto, un modal con contenido que no cabe entero (como un listado largo
 * dentro de un panel con su propio `overflow-y-auto`) deja que desplazarse
 * DENTRO del modal también desplace la página de detrás — el gesto de scroll
 * no distingue una capa de la otra si el `<body>` sigue pudiendo moverse.
 *
 * Restaura el valor previo de `overflow` al desmontar o al pasar a `false`,
 * en vez de forzar `''`, por si algo más ya lo había tocado.
 */
export function useBloqueoScroll(activo: boolean): void {
  useEffect(() => {
    if (!activo) return

    const overflowPrevio = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = overflowPrevio
    }
  }, [activo])
}
