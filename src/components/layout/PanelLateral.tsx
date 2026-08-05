import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { clsx } from 'clsx'

/**
 * Envoltorio del menú lateral, común al área clínica y a la de plataforma.
 *
 * Desde `md` es una columna más del layout. Por debajo se convierte en un cajón
 * que entra por la izquierda sobre el contenido, con velo y bloqueo del scroll
 * del cuerpo mientras está abierto.
 *
 * Cerrado en móvil queda `invisible`, no solo desplazado fuera de pantalla: si
 * únicamente se trasladara, sus enlaces seguirían en el orden de tabulación y
 * el foco saltaría a un menú que no se ve. La transición incluye `visibility`
 * para que al cerrarse el panel siga viéndose mientras se desliza.
 */
export function PanelLateral({
  abierto,
  onCerrar,
  className,
  children,
}: {
  abierto: boolean
  onCerrar: () => void
  className?: string
  children: ReactNode
}) {
  useEffect(() => {
    if (!abierto) return
    function alPulsarTecla(e: KeyboardEvent) {
      if (e.key === 'Escape') onCerrar()
    }
    const overflowPrevio = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', alPulsarTecla)
    return () => {
      document.body.style.overflow = overflowPrevio
      document.removeEventListener('keydown', alPulsarTecla)
    }
  }, [abierto, onCerrar])

  return (
    <>
      <div
        aria-hidden
        onClick={onCerrar}
        className={clsx(
          'fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-xs transition-opacity duration-300 md:hidden',
          abierto ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      />
      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-50 flex w-[17rem] max-w-[85%] shrink-0 flex-col',
          'transition-[transform,visibility] duration-300 ease-out',
          'md:visible md:static md:w-[260px] md:max-w-none md:translate-x-0 md:shadow-none',
          abierto ? 'visible translate-x-0 shadow-2xl' : 'invisible -translate-x-full',
          className,
        )}
      >
        {children}
      </aside>
    </>
  )
}
