import { useEffect } from 'react'

/**
 * Bloquea el scroll de la página de fondo mientras `activo` es verdadero.
 *
 * Sin esto, un modal con contenido que no cabe entero (como un listado largo
 * dentro de un panel con su propio `overflow-y-auto`) deja que desplazarse
 * DENTRO del modal también desplace la página de detrás — el gesto de scroll
 * no distingue una capa de la otra si el `<body>` sigue pudiendo moverse.
 *
 * ⚠️ `overflow: hidden` a secas —lo que hacía esta función antes— es la
 * técnica más simple, pero es conocida por fallar en iOS Safari, y sobre
 * todo en un PWA instalado en modo standalone: sin barra de navegador que
 * "absorba" el gesto, el scroll de fondo podía seguir respondiendo al touch
 * pese al overflow oculto, y a veces se llevaba de encuentro el scroll
 * DENTRO del propio modal (el gesto se interpretaba para la página, no para
 * el panel). `position: fixed` saca a `<body>` del flujo de scroll por
 * completo — es la técnica que usan las librerías de bloqueo de scroll más
 * probadas (Radix, Headless UI) precisamente por eso.
 *
 * Se guarda `scrollY` para devolver la página exactamente a donde estaba al
 * cerrar. En el área clínica casi siempre es 0 — el armazón vive en un
 * `h-dvh` con el scroll dentro de `<main>`, nunca en `body` (ver
 * `AppLayout.tsx`) — pero las páginas públicas y el portal, que no siguen
 * ese patrón, sí pueden tener scroll real en el documento.
 *
 * Anidar dos modales (la confirmación dentro de otro modal, p. ej.) sigue
 * funcionando: cada llamada guarda el estilo que encuentra AL MONTARSE —ya
 * bloqueado por el modal de más abajo— y restaura exactamente eso al
 * desmontarse, nunca un valor fijo.
 */
export function useBloqueoScroll(activo: boolean): void {
  useEffect(() => {
    if (!activo) return

    const scrollY = window.scrollY
    const estiloPrevio = {
      position: document.body.style.position,
      top: document.body.style.top,
      left: document.body.style.left,
      right: document.body.style.right,
      width: document.body.style.width,
      overflow: document.body.style.overflow,
    }

    document.body.style.position = 'fixed'
    document.body.style.top = `-${scrollY}px`
    document.body.style.left = '0'
    document.body.style.right = '0'
    document.body.style.width = '100%'
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.position = estiloPrevio.position
      document.body.style.top = estiloPrevio.top
      document.body.style.left = estiloPrevio.left
      document.body.style.right = estiloPrevio.right
      document.body.style.width = estiloPrevio.width
      document.body.style.overflow = estiloPrevio.overflow
      window.scrollTo(0, scrollY)
    }
  }, [activo])
}
