import { useEffect, useState } from 'react'
import { AlertTriangle, CornerDownLeft, Lightbulb, Search, Sparkles } from 'lucide-react'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Field'
import { useAuth } from '../../context/useAuth'
import { getCuotaIa, preguntarACopiloto } from '../../services/asistente'
import { atajosDelCopiloto, ETIQUETA_HERRAMIENTA } from '../../lib/copiloto'
import type { RespuestaCopiloto } from '../../types/views'

/**
 * «Pregúntale a Vetora»: una pregunta en español sobre el propio negocio.
 *
 * No es un chat pegado encima del sistema. La IA **no sabe nada del negocio por
 * su cuenta**: la Edge Function consulta los datos con el token de quien
 * pregunta —la RLS acota igual que en cualquier pantalla— y el modelo solo
 * ordena y explica lo que esas consultas devolvieron.
 *
 * Por eso se enseña siempre **qué se consultó** para responder. Sin eso, una
 * recomendación es una afirmación sin respaldo y quien la lee no puede
 * comprobarla.
 *
 * ⚠️ **Sin plantilla de respaldo, a diferencia de los avisos.** Ahí, cuando el
 * modelo falla, hay un texto sensato que escribir sin él. Aquí no: inventar una
 * respuesta a una pregunta abierta es justo lo que el copiloto tiene prohibido.
 * Si falla, se dice que falló.
 */
export function PreguntaleAVetora() {
  const { usuario, modulosHabilitados } = useAuth()
  const [pregunta, setPregunta] = useState('')
  const [respuesta, setRespuesta] = useState<RespuestaCopiloto | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // `null` mientras no se sabe. Ver el porqué en `Topbar.tsx`: «no lo sé» y
  // «no te queda nada» no pueden mostrarse igual.
  const [cuota, setCuota] = useState<{ usados: number; limite: number } | null>(null)

  const atajos = atajosDelCopiloto(usuario?.rol, modulosHabilitados)
  const sinCupo = cuota !== null && cuota.limite > 0 && cuota.usados >= cuota.limite

  useEffect(() => {
    if (!usuario?.clinica_id) return
    let montado = true
    getCuotaIa(usuario.clinica_id)
      .then((c) => { if (montado) setCuota(c.copiloto) })
      .catch(() => { if (montado) setCuota(null) })
    return () => { montado = false }
  }, [usuario])

  async function consultar(texto: string) {
    const limpio = texto.trim()
    if (limpio.length < 3 || cargando || sinCupo) return

    setPregunta(limpio)
    setCargando(true)
    setError(null)
    setRespuesta(null)
    try {
      setRespuesta(await preguntarACopiloto(limpio))
      // Se gastó una consulta: se refleja en el número sin esperar a que la
      // pantalla se recargue sola. Optimista y sin drama si falla: la cuota
      // real la manda `consumir_cuota_ia()` en el servidor, esto es solo la
      // barra puesta al día.
      setCuota((c) => (c ? { ...c, usados: c.usados + 1 } : c))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo consultar al asistente')
    } finally {
      setCargando(false)
    }
  }

  return (
    <Card className="p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles size={17} className="text-teal-600" />
          <h2 className="text-base font-bold text-slate-900">Pregúntale a Vetora</h2>
        </div>
        {/* Justo donde se decide gastar el cupo, no solo en el encabezado. */}
        {cuota && cuota.limite > 0 && (
          <span
            className={sinCupo ? 'text-xs font-semibold text-rose-600' : 'text-xs font-medium text-slate-400'}
          >
            {cuota.usados}/{cuota.limite} consultas este mes
          </span>
        )}
      </div>

      {sinCupo ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
          Se alcanzó el límite mensual de consultas al copiloto de tu plan. Vuelve a estar disponible el
          próximo mes, o puedes ampliarlo desde tu suscripción.
        </p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            consultar(pregunta)
          }}
          className="flex flex-col gap-2 sm:flex-row"
        >
          <div className="relative flex-1">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              value={pregunta}
              onChange={(e) => setPregunta(e.target.value)}
              placeholder="¿Qué debo atender hoy?"
              aria-label="Pregunta para el asistente"
              maxLength={2000}
              className="pl-9"
            />
          </div>
          <Button type="submit" disabled={cargando || pregunta.trim().length < 3}>
            <CornerDownLeft size={16} />
            {cargando ? 'Consultando…' : 'Preguntar'}
          </Button>
        </form>
      )}

      {!sinCupo && !respuesta && !cargando && !error && (
        <div className="mt-3 flex flex-wrap gap-2">
          {atajos.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => consultar(a)}
              className="cursor-pointer rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-teal-300 hover:bg-teal-50 hover:text-teal-700"
            >
              {a}
            </button>
          ))}
        </div>
      )}

      {cargando && (
        <div className="mt-4 flex items-center gap-3 py-6 text-sm text-slate-400">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-teal-600" />
          Consultando los datos del negocio…
        </div>
      )}

      {error && (
        <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      {respuesta && <Resultado respuesta={respuesta} />}
    </Card>
  )
}

function Resultado({ respuesta }: { respuesta: RespuestaCopiloto }) {
  return (
    <div className="mt-4 space-y-4 border-t border-slate-200 pt-4">
      <div>
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-bold text-slate-900">{respuesta.titulo}</h3>
          <Badge tone="teal" size="sm">
            <Sparkles size={11} className="mr-1" /> Redactado con IA
          </Badge>
          {respuesta.requiere_accion_humana && (
            <Badge tone="amber" size="sm">Requiere que decidas tú</Badge>
          )}
        </div>
        <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">{respuesta.resumen}</p>
      </div>

      {respuesta.datos.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {respuesta.datos.map((d, i) => (
            <div key={i} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-xs font-medium text-slate-500">{d.etiqueta}</p>
              <p className="text-sm font-semibold text-slate-900">{d.valor}</p>
            </div>
          ))}
        </div>
      )}

      {respuesta.recomendaciones.length > 0 && (
        <div className="rounded-lg border border-teal-200 bg-teal-50/60 px-3 py-2.5">
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-teal-700">
            <Lightbulb size={12} /> Qué podrías hacer
          </p>
          <ul className="space-y-1 text-sm text-slate-700">
            {respuesta.recomendaciones.map((r, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-teal-600">·</span>
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}

      {respuesta.advertencias.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-amber-700">
            <AlertTriangle size={12} /> Ten en cuenta
          </p>
          <ul className="space-y-1 text-sm text-amber-900">
            {respuesta.advertencias.map((a, i) => (
              <li key={i} className="flex gap-2">
                <span>·</span>
                {a}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Qué se miró para responder. No es un detalle técnico: es lo que hace
          verificable la respuesta en vez de tener que creérsela. */}
      {respuesta.fuentes.length > 0 && (
        <p className="text-xs text-slate-400">
          Consultado: {respuesta.fuentes.map((f) => ETIQUETA_HERRAMIENTA[f] ?? f).join(' · ')}
        </p>
      )}
    </div>
  )
}
