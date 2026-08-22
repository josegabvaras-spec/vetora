import { useAuth } from '../context/AuthContext'
import { JornadaClinica } from '../features/asistente/JornadaClinica'
import { veterinarioAcotado } from '../lib/personal'

/**
 * Asistente del veterinario: lo que le toca a ÉL hoy.
 *
 * Toda la pantalla es la jornada, así que aquí solo queda la cabecera. El
 * contenido vive en [JornadaClinica](../features/asistente/JornadaClinica.tsx),
 * que comparte con el administrador — con la diferencia de que a él sí lo acota
 * `veterinarioAcotado()` y solo ve lo suyo.
 */
export function AsistenteVeterinarioPage() {
  const { usuario, sucursalActivaId } = useAuth()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
          Asistente
        </h1>
        <p className="mt-1 text-sm font-medium text-slate-500">
          Tu jornada: a quién atiendes hoy y qué te queda pendiente. Las consultas que abre recepción
          aparecen aquí, sin que tengas que buscar al paciente.
        </p>
      </div>

      <JornadaClinica
        veterinarioId={veterinarioAcotado(usuario)}
        sucursalId={sucursalActivaId || undefined}
      />
    </div>
  )
}
