import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { useBloqueoScroll } from '../../hooks/useBloqueoScroll'

interface ModalProps {
  title: string
  onClose: () => void
  children: ReactNode
  widthClassName?: string
}

// Pila de modales abiertos. Hay diálogos que se abren sobre otro modal (la
// confirmación del alta dentro de la internación, p. ej.): Escape debe cerrar
// solo el de más arriba, no toda la pila de golpe.
const pilaDeModales: symbol[] = []

export function Modal({ title, onClose, children, widthClassName = 'max-w-lg' }: ModalProps) {
  const cerrarRef = useRef(onClose)
  useEffect(() => {
    cerrarRef.current = onClose
  })

  // El fondo no debe desplazarse detrás del modal: en un celular, con la hoja
  // abierta, cualquier gesto arrastraría la página de debajo. Ver
  // `useBloqueoScroll` para por qué no es un simple `overflow: hidden`.
  useBloqueoScroll(true)

  useEffect(() => {
    const propio = Symbol('modal')
    pilaDeModales.push(propio)

    function alPulsarTecla(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      if (pilaDeModales[pilaDeModales.length - 1] !== propio) return
      cerrarRef.current()
    }

    document.addEventListener('keydown', alPulsarTecla)

    return () => {
      pilaDeModales.splice(pilaDeModales.indexOf(propio), 1)
      document.removeEventListener('keydown', alPulsarTecla)
    }
  }, [])

  return createPortal(
    // En celular es una hoja anclada abajo (el pulgar llega al borde inferior);
    // desde `sm` vuelve a ser el cuadro centrado de siempre.
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/40 backdrop-blur-sm animate-fade-in sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        // ⚠️ Porcentaje, no `dvh`: el contenedor de fuera ya es `fixed inset-0`,
        // así que su alto SIEMPRE es exactamente el viewport visual — de forma
        // nativa del navegador, sin depender de que `dvh` esté bien soportado o
        // bien calculado. En un PWA instalado (`display: standalone`), sin barra
        // de navegador que ocultar/mostrar, algunos navegadores tardan en
        // asentar el valor de `dvh` en el primer pintado; el `%` no tiene ese
        // problema porque resuelve contra un padre que ya mide bien desde el
        // primer frame.
        className={`flex max-h-[92%] w-full flex-col overflow-hidden rounded-t-2xl border border-slate-100 bg-white shadow-2xl animate-slide-up sm:max-h-[90%] sm:rounded-2xl sm:animate-scale-in ${widthClassName}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-4 py-3.5 sm:px-6 sm:py-4">
          <h2 className="min-w-0 truncate text-base font-bold text-slate-800">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="-mr-1 flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          >
            <X size={20} />
          </button>
        </div>
        {/* Solo desplaza el cuerpo: la cabecera con el botón de cerrar queda
            siempre a la vista, que en un formulario largo es lo que se busca.

            `overflow-x-auto` es la red de seguridad: antes solo desplazaba en
            vertical, así que un contenido más ancho que el modal —una tabla, una
            fila de campos— se salía por el lado sin forma de alcanzarlo. Ahora
            se desplaza dentro del modal en vez de desbordar la pantalla.

            `WebkitOverflowScrolling: touch` no tiene reemplazo en Tailwind — es
            una propiedad vieja y ya no estándar, pero algunas versiones de
            Safari/WebKit en modo standalone todavía la necesitan para que el
            scroll por inercia funcione dentro de un contenedor con `position:
            fixed` como ancestro (que es exactamente esta estructura). Inocua
            donde ya no hace falta. */}
        <div
          className="flex-1 overflow-auto overscroll-contain p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body
  )
}
