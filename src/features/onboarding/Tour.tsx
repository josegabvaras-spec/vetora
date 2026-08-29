import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { useAuth } from '../../context/AuthContext'
import { useEsEscritorio } from '../../hooks/useMediaQuery'
import { pasosParaFormato, pasosParaRol, type PasoTour } from '../../lib/onboarding'

/**
 * Motor del tour guiado.
 *
 * Oscurece la pantalla, deja iluminado el elemento del paso y pone un globo al
 * lado. Está escrito a mano y sin dependencias nuevas: lo que hace falta es
 * modesto y las librerías del ramo traen su propio CSS que habría que
 * sobrescribir entero para que encajara con el diseño.
 *
 * El foco de luz es **un solo `div`** con `box-shadow: 0 0 0 9999px`: esa sombra
 * gigante oscurece todo lo que hay alrededor sin necesidad de máscaras SVG ni de
 * cuatro rectángulos, y anima sola al pasar de un paso a otro.
 *
 * **Nunca puede dejar la aplicación bloqueada.** Si un paso apunta a algo que no
 * existe se salta; si algo falla de verdad, el tour se cierra. Un tutorial roto
 * no puede impedir trabajar.
 */

/** Aire entre el elemento iluminado y el borde del foco. */
const HOLGURA = 8
/** Margen mínimo entre el globo y el borde de la pantalla. */
const MARGEN = 12
const ANCHO_GLOBO = 320
/**
 * Cuánto se reintenta buscar el elemento antes de darlo por ausente.
 *
 * El cajón del menú en celular tarda 300 ms en abrirse
 * (`PanelLateral.tsx`, `transition-[transform,visibility] duration-300`).
 * El doble de margen cubre además lo que tarde React en confirmar la
 * apertura en dispositivos más lentos.
 */
const TIEMPO_MAXIMO_ESPERA_MS = 600

interface Recuadro {
  top: number
  left: number
  width: number
  height: number
}

function recuadroDe(elemento: Element): Recuadro {
  const r = elemento.getBoundingClientRect()
  return {
    top: r.top - HOLGURA,
    left: r.left - HOLGURA,
    width: r.width + HOLGURA * 2,
    height: r.height + HOLGURA * 2,
  }
}

/** Visible de verdad: el cajón del menú cerrado ocupa sitio pero no se ve. */
function estaVisible(elemento: Element): boolean {
  const r = elemento.getBoundingClientRect()
  if (r.width === 0 || r.height === 0) return false
  const estilo = getComputedStyle(elemento)
  return estilo.visibility !== 'hidden' && estilo.display !== 'none' && estilo.opacity !== '0'
}

function buscarAncla(ancla: string): HTMLElement | null {
  const elemento = document.querySelector<HTMLElement>(`[data-tour="${ancla}"]`)
  return elemento && estaVisible(elemento) ? elemento : null
}

export function Tour({
  pasos,
  onCerrar,
  abrirMenu,
  cerrarMenu,
}: {
  pasos: PasoTour[]
  /** Se llama tanto al terminar como al salir a medias. */
  onCerrar: () => void
  /** Solo el área clínica: en celular el menú es un cajón que hay que abrir. */
  abrirMenu?: () => void
  cerrarMenu?: () => void
}) {
  const esEscritorio = useEsEscritorio()
  const { usuario } = useAuth()
  // Por rol primero: un paso que ni siquiera es de este rol no debe llegar a
  // intentar medirse. El portal no tiene pasos con `roles`, así que ahí este
  // filtro no cambia nada.
  const aplicables = pasosParaFormato(pasosParaRol(pasos, usuario?.rol), esEscritorio)

  const [indice, setIndice] = useState(0)
  const [recuadro, setRecuadro] = useState<Recuadro | null>(null)
  const globoRef = useRef<HTMLDivElement>(null)
  /** A dónde devolver el foco al salir. */
  const focoPrevio = useRef<HTMLElement | null>(null)

  const paso = aplicables[indice]

  // Sin `useCallback` esto se recrearía en cada render y el efecto de medir se
  // dispararía en bucle.
  const cerrar = useCallback(() => {
    cerrarMenu?.()
    onCerrar()
  }, [cerrarMenu, onCerrar])

  /** El paso pide el menú abierto y estamos en celular, donde es un cajón. */
  const necesitaMenu = Boolean(paso?.requiereMenu) && !esEscritorio

  useEffect(() => {
    if (necesitaMenu) abrirMenu?.()
    else cerrarMenu?.()
  }, [necesitaMenu, abrirMenu, cerrarMenu])

  /**
   * Mide el elemento del paso, o lo salta si no está.
   *
   * Saltar no es defensivo, es obligatorio: el menú **cambia según el rol**, así
   * que un paso puede apuntar a algo que esta persona no tiene. Se avanza en la
   * misma dirección en la que se venía, para que «Atrás» no se quede atascado
   * rebotando contra un paso ausente.
   */
  const direccion = useRef<1 | -1>(1)

  useLayoutEffect(() => {
    if (!paso) return

    // Ventana centrada: bienvenida y despedida no apuntan a nada.
    if (!paso.ancla) {
      setRecuadro(null)
      return
    }

    let cancelado = false
    let idFrame = 0
    const desde = performance.now()

    /**
     * Reintenta fotograma a fotograma, no una vez a los dos fotogramas.
     *
     * Antes se comprobaba UNA sola vez, a los ~32 ms (dos `requestAnimationFrame`
     * seguidos). Eso bastaba para un paso normal, pero cuando el paso ACABA DE
     * PEDIR que se abra el cajón del menú (`requiereMenu`), su transición dura
     * 300 ms — diez veces más. El tour medía antes de que el cajón terminara de
     * abrirse, no encontraba el elemento todavía visible, y lo daba por
     * ausente: saltaba el paso que él mismo acababa de abrir. Con varios pasos
     * seguidos pidiendo el menú (Pacientes, Inventario, Asistente, Caja), el
     * patrón se repetía y el tour avanzaba de dos en dos.
     */
    function intentar() {
      if (cancelado) return

      const elemento = buscarAncla(paso!.ancla!)
      if (elemento) {
        elemento.scrollIntoView({ block: 'center', behavior: 'smooth' })
        setRecuadro(recuadroDe(elemento))
        return
      }

      // Todavía no aparece. Con medio segundo hay de sobra para la transición
      // de 300 ms del cajón más lo que tarde React en confirmar la apertura;
      // seguir insistiendo.
      if (performance.now() - desde < TIEMPO_MAXIMO_ESPERA_MS) {
        idFrame = requestAnimationFrame(intentar)
        return
      }

      // Pasado ese margen, de verdad no está: este rol no tiene esa sección. Se
      // avanza en la misma dirección en la que se venía, para que «Atrás» no
      // se quede atascado rebotando contra un paso ausente.
      //
      // El aviso no cambia el comportamiento, lo hace visible: saltar es
      // legítimo cuando el rol no tiene la sección, pero es indistinguible de un
      // ancla mal puesta. El tutorial del portal se saltó sus dos únicos pasos
      // con contenido desde que se escribió —sus anclas estaban en páginas que
      // no se ven al arrancar— y nada lo delató hasta que un usuario lo contó.
      console.warn(
        `[tour] El paso «${paso!.titulo}» no encontró su ancla «${paso!.ancla}» y se salta. ` +
          'Si esa sección sí existe para este rol, el ancla está mal puesta: ' +
          'tiene que colgar de un elemento presente en la pantalla donde corre el tour.',
      )

      const siguiente = indice + direccion.current
      if (siguiente >= 0 && siguiente < aplicables.length) setIndice(siguiente)
      else cerrar()
    }

    idFrame = requestAnimationFrame(intentar)

    return () => {
      cancelado = true
      cancelAnimationFrame(idFrame)
    }
  }, [paso, indice, aplicables.length, cerrar, necesitaMenu])

  // Seguir al elemento si la ventana cambia de tamaño o el contenido se
  // desplaza. Pasivos: no interceptan el gesto.
  useEffect(() => {
    if (!paso?.ancla) return
    function remedir() {
      const elemento = buscarAncla(paso!.ancla!)
      if (elemento) setRecuadro(recuadroDe(elemento))
    }
    window.addEventListener('resize', remedir, { passive: true })
    window.addEventListener('scroll', remedir, { passive: true, capture: true })
    return () => {
      window.removeEventListener('resize', remedir)
      window.removeEventListener('scroll', remedir, { capture: true })
    }
  }, [paso])

  const irA = useCallback(
    (delta: 1 | -1) => {
      direccion.current = delta
      const siguiente = indice + delta
      if (siguiente < 0) return
      if (siguiente >= aplicables.length) {
        cerrar()
        return
      }
      setIndice(siguiente)
    },
    [indice, aplicables.length, cerrar],
  )

  // Teclado: Escape sale, las flechas navegan. El foco entra en el globo al
  // abrir y vuelve a su sitio al salir.
  useEffect(() => {
    focoPrevio.current = document.activeElement as HTMLElement | null
    const overflowPrevio = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function alPulsar(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        cerrar()
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        irA(1)
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        irA(-1)
      }
    }
    document.addEventListener('keydown', alPulsar)

    return () => {
      document.removeEventListener('keydown', alPulsar)
      document.body.style.overflow = overflowPrevio
      focoPrevio.current?.focus?.()
    }
  }, [cerrar, irA])

  useEffect(() => {
    globoRef.current?.focus()
  }, [indice])

  if (!paso) return null

  const esUltimo = indice === aplicables.length - 1
  const tituloId = 'tour-titulo'

  /**
   * Dónde va el globo.
   *
   * Debajo del elemento por defecto; si no cabe, arriba. Y siempre pegado al
   * borde de la pantalla como mucho, para que en un celular estrecho no se salga
   * lateralmente.
   */
  const estiloGlobo: React.CSSProperties = (() => {
    if (!recuadro) {
      return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
    }
    const alturaEstimada = 210
    const cabeDebajo = recuadro.top + recuadro.height + alturaEstimada + MARGEN < window.innerHeight
    const top = cabeDebajo
      ? recuadro.top + recuadro.height + MARGEN
      : Math.max(MARGEN, recuadro.top - alturaEstimada - MARGEN)

    const centrado = recuadro.left + recuadro.width / 2 - ANCHO_GLOBO / 2
    const left = Math.min(
      Math.max(MARGEN, centrado),
      Math.max(MARGEN, window.innerWidth - ANCHO_GLOBO - MARGEN),
    )
    return { top, left }
  })()

  return createPortal(
    <div className="fixed inset-0 z-[200]">
      {/* El foco de luz. `aria-hidden` porque es decoración: lo que se lee es el
          globo. Sin `pointer-events`, para que el velo no se coma los clics del
          globo pero tampoco deje tocar la aplicación por debajo. */}
      {recuadro ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed rounded-xl ring-2 ring-teal-400/70 transition-all duration-300 ease-out"
          style={{
            top: recuadro.top,
            left: recuadro.left,
            width: recuadro.width,
            height: recuadro.height,
            boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.6)',
          }}
        />
      ) : (
        <div aria-hidden="true" className="fixed inset-0 bg-slate-950/60 backdrop-blur-[2px]" />
      )}

      <div
        ref={globoRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        tabIndex={-1}
        style={{ ...estiloGlobo, width: ANCHO_GLOBO, maxWidth: `calc(100vw - ${MARGEN * 2}px)` }}
        className="fixed rounded-2xl border border-slate-100 bg-white p-5 shadow-2xl outline-none ring-1 ring-black/5 transition-all duration-300 ease-out"
      >
        <button
          onClick={cerrar}
          aria-label="Cerrar el tutorial"
          className="absolute right-2 top-2 flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
        >
          <X size={16} />
        </button>

        <h2 id={tituloId} className="pr-8 font-display text-base font-bold text-slate-900">
          {paso.titulo}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">{paso.texto}</p>

        <div className="mt-5 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
          {/* El contador se anuncia como región viva: quien navega con lector
              necesita saber que cambió de paso, no solo oír el texto nuevo. */}
          <span className="text-xs font-semibold text-slate-400" aria-live="polite">
            {indice + 1} de {aplicables.length}
          </span>

          <div className="flex items-center gap-2">
            {indice > 0 && (
              <Button variant="secondary" size="sm" onClick={() => irA(-1)}>
                Atrás
              </Button>
            )}
            <Button size="sm" onClick={() => irA(1)}>
              {paso.etiquetaSiguiente ?? (esUltimo ? 'Entendido' : 'Siguiente')}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
