import { HelpCircle } from 'lucide-react'
import { useTourManual } from './OnboardingProvider'

/**
 * Botón de ayuda del portal del dueño.
 *
 * El personal de la clínica repite el tutorial desde su panel de cuenta, pero el
 * portal no tiene panel de cuenta ni menú «Ayuda»: su cabecera es el nombre de
 * la veterinaria y el botón de salir. Así que este botón **es** el sitio.
 *
 * Se pinta con el mismo tratamiento que el de cerrar sesión de al lado, para que
 * no parezca pegado después.
 */
export function AyudaPortal() {
  const { abrirTour } = useTourManual()

  return (
    <button
      onClick={abrirTour}
      title="Ver el tutorial"
      aria-label="Ver el tutorial otra vez"
      className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
    >
      <HelpCircle className="h-5 w-5" />
    </button>
  )
}
