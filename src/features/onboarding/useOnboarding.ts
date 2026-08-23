import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { debeVerElTour, getEstadoOnboarding, marcarOnboardingVisto } from '../../services/onboarding'

/**
 * Decide si el tour arranca solo, y lo cierra dejando constancia.
 *
 * Lo comparten el área clínica y el portal: lo único que cambia entre ellos son
 * los pasos, no cuándo se muestra.
 *
 * Cerrar **siempre** marca el tour como visto, tanto si se terminó como si se
 * salió a medias: quien lo cierra está diciendo que no lo quiere, y volver a
 * saltárselo en cada recarga sería insistir. Repetirlo queda a un clic en el
 * panel de cuenta.
 */
export function useOnboarding() {
  const { usuario } = useAuth()
  const [abierto, setAbierto] = useState(false)

  useEffect(() => {
    if (!usuario) return
    let montado = true

    getEstadoOnboarding()
      .then((estado) => {
        if (montado && debeVerElTour(estado)) setAbierto(true)
      })
      // Un fallo aquí no puede romper la pantalla: como mucho, quien entra por
      // primera vez no ve el tutorial y lo encuentra en «Mi cuenta».
      .catch((err) => console.error('No se pudo leer el estado del tutorial:', err))

    return () => {
      montado = false
    }
  }, [usuario])

  const cerrar = useCallback(() => {
    setAbierto(false)
    if (usuario) marcarOnboardingVisto(usuario.id)
  }, [usuario])

  /** Para el botón «Ver el tutorial otra vez». */
  const abrir = useCallback(() => setAbierto(true), [])

  return { abierto, abrir, cerrar }
}
