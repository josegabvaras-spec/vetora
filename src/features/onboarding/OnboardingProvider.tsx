import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { Tour } from './Tour'
import { useOnboarding } from './useOnboarding'
import type { PasoTour } from '../../lib/onboarding'

/**
 * Envuelve un área de la aplicación con su tour de bienvenida.
 *
 * Existe por una razón concreta: el botón «Ver el tutorial otra vez» vive en el
 * panel de cuenta ([PerfilModal](../auth/PerfilModal.tsx)), que se pinta dentro
 * del `Topbar`, mientras que el tour se monta al nivel del layout. Un contexto
 * es lo que conecta a los dos sin subir estado a `App.tsx` ni pasar la función a
 * mano por tres componentes que no la usan.
 *
 * Lo montan [AppLayout](../../components/layout/AppLayout.tsx) y
 * [PortalClienteLayout](../../components/layout/PortalClienteLayout.tsx), cada
 * uno con sus propios pasos.
 */

interface TourManual {
  /** Vuelve a lanzar el tour a petición del usuario. */
  abrirTour: () => void
}

const Contexto = createContext<TourManual>({ abrirTour: () => {} })

/**
 * Para el botón de «ver otra vez».
 *
 * Fuera de un `OnboardingProvider` devuelve una función vacía en vez de lanzar:
 * el panel de cuenta es el mismo componente en las dos áreas, y que un botón no
 * haga nada es mejor que reventar la pantalla de perfil.
 */
export function useTourManual(): TourManual {
  return useContext(Contexto)
}

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
  const { abierto, abrir, cerrar } = useOnboarding()

  const valor = useMemo(() => ({ abrirTour: abrir }), [abrir])

  return (
    <Contexto.Provider value={valor}>
      {children}
      {abierto && (
        <Tour pasos={pasos} onCerrar={cerrar} abrirMenu={abrirMenu} cerrarMenu={cerrarMenu} />
      )}
    </Contexto.Provider>
  )
}
