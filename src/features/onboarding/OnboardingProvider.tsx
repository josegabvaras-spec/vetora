import { useMemo, type ReactNode } from 'react'
import { Tour } from './Tour'
import { useOnboarding } from './useOnboarding'
import { Contexto } from './useTourManual'
import type { PasoTour } from '../../lib/onboarding'

/**
 * Envuelve un área de la aplicación con su tour de bienvenida.
 *
 * Lo montan [AppLayout](../../components/layout/AppLayout.tsx) y
 * [PortalClienteLayout](../../components/layout/PortalClienteLayout.tsx), cada
 * uno con sus propios pasos.
 *
 * El contexto y su hook viven en [useTourManual](./useTourManual.ts): este
 * fichero exporta un componente, y mezclarlos rompería el Fast Refresh.
 */
export function OnboardingProvider({
  pasos,
  children,
  abrirMenu,
  cerrarMenu,
}: {
  pasos: PasoTour[]
  children: ReactNode
  /** Solo el área clínica: en celular el menú lateral es un cajón. */
  abrirMenu?: () => void
  cerrarMenu?: () => void
}) {
  const { abierto, abrir, cerrar, ocupaPantalla } = useOnboarding()

  const valor = useMemo(
    () => ({ abrirTour: abrir, tourOcupaPantalla: ocupaPantalla }),
    [abrir, ocupaPantalla],
  )

  return (
    <Contexto.Provider value={valor}>
      {children}
      {abierto && (
        <Tour pasos={pasos} onCerrar={cerrar} abrirMenu={abrirMenu} cerrarMenu={cerrarMenu} />
      )}
    </Contexto.Provider>
  )
}
