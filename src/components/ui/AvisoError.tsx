import { AlertTriangle } from 'lucide-react'

/**
 * Aviso de "no se pudo cargar", distinto de "no hay nada".
 *
 * Las listas se rellenan con `setState` tras un `await`; si la consulta fallaba
 * y nadie capturaba el error, el array se quedaba vacío y la pantalla decía
 * «Sin citas agendadas» o «No hay productos registrados». Quien lo leía
 * entendía que no había datos, no que la carga había fallado — y en la agenda
 * eso significa ver un día lleno de citas como si estuviera libre.
 */
export function AvisoError({ mensaje }: { mensaje: string | null }) {
  if (!mensaje) return null

  return (
    <p
      role="alert"
      className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700"
    >
      <AlertTriangle size={16} className="shrink-0" />
      {mensaje}
    </p>
  )
}
