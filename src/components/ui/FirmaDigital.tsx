import { useEffect, useRef, useState } from 'react'
import { Eraser } from 'lucide-react'

/**
 * Recuadro para firmar con el dedo en el celular o con el ratón en escritorio.
 *
 * Va sobre eventos de **puntero**, no de ratón ni de táctil por separado: son
 * los únicos que unifican dedo, lápiz y ratón, y `setPointerCapture` mantiene el
 * trazo aunque el dedo se salga del recuadro a media firma.
 *
 * `touch-action: none` en el lienzo no es decorativo: sin él, el navegador móvil
 * interpreta el arrastre como desplazamiento de la página y la firma sale
 * cortada o directamente no se dibuja.
 */
export function FirmaDigital({
  etiqueta,
  onChange,
}: {
  etiqueta: string
  onChange: (dataUrl: string | null) => void
}) {
  const lienzoRef = useRef<HTMLCanvasElement>(null)
  const dibujando = useRef(false)
  const [tieneTrazo, setTieneTrazo] = useState(false)

  // El lienzo se dimensiona en píxeles reales del dispositivo. Sin multiplicar
  // por `devicePixelRatio`, en un celular la firma sale pixelada: el CSS lo
  // estira al doble o al triple de su resolución.
  useEffect(() => {
    const lienzo = lienzoRef.current
    if (!lienzo) return
    const proporcion = window.devicePixelRatio || 1
    const { width, height } = lienzo.getBoundingClientRect()
    lienzo.width = width * proporcion
    lienzo.height = height * proporcion

    const ctx = lienzo.getContext('2d')
    if (!ctx) return
    ctx.scale(proporcion, proporcion)
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#0f172a'
  }, [])

  function contexto(): CanvasRenderingContext2D | null {
    return lienzoRef.current?.getContext('2d') ?? null
  }

  function posicion(e: React.PointerEvent<HTMLCanvasElement>) {
    const caja = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - caja.left, y: e.clientY - caja.top }
  }

  function iniciar(e: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = contexto()
    if (!ctx) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const { x, y } = posicion(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
    dibujando.current = true
  }

  function mover(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!dibujando.current) return
    const ctx = contexto()
    if (!ctx) return
    const { x, y } = posicion(e)
    ctx.lineTo(x, y)
    ctx.stroke()
  }

  function terminar() {
    if (!dibujando.current) return
    dibujando.current = false
    const lienzo = lienzoRef.current
    if (!lienzo) return
    setTieneTrazo(true)
    onChange(lienzo.toDataURL('image/png'))
  }

  function borrar() {
    const lienzo = lienzoRef.current
    const ctx = contexto()
    if (!lienzo || !ctx) return
    // `clearRect` va en unidades del lienzo ya escalado, no en píxeles físicos.
    const proporcion = window.devicePixelRatio || 1
    ctx.clearRect(0, 0, lienzo.width / proporcion, lienzo.height / proporcion)
    setTieneTrazo(false)
    onChange(null)
  }

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{etiqueta}</span>
        {tieneTrazo && (
          <button
            type="button"
            onClick={borrar}
            className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-rose-600"
          >
            <Eraser size={13} /> Borrar
          </button>
        )}
      </div>

      <canvas
        ref={lienzoRef}
        onPointerDown={iniciar}
        onPointerMove={mover}
        onPointerUp={terminar}
        onPointerCancel={terminar}
        className="h-36 w-full touch-none rounded-lg border-2 border-dashed border-slate-300 bg-white"
      />

      <p className="mt-1 text-center text-[11px] text-slate-400">
        {tieneTrazo ? 'Firmado' : 'Firme aquí con el dedo o el ratón'}
      </p>
    </div>
  )
}
