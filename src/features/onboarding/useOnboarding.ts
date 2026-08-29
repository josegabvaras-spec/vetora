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
  /**
   * Si ya se sabe qué va a pasar con el tour.
   *
   * `abierto` empieza en `false` mientras se consulta la base, así que sin este
   * tercer estado hay una ventana en la que el tour «no está abierto» pero va a
   * abrirse en cuanto responda la consulta. Cualquier aviso que espere su turno
   * —el de instalar la PWA— salía en ese hueco y el tour le caía encima.
   */
  const [resuelto, setResuelto] = useState(false)

  useEffect(() => {
    // Sin sesión no hay tour que esperar, y el hueco se cierra igual.
    if (!usuario) {
      setResuelto(true)
      return
    }
    let montado = true

    getEstadoOnboarding()
      .then((estado) => {
        if (!montado) return
        if (debeVerElTour(estado)) setAbierto(true)
        setResuelto(true)
      })
      // Un fallo aquí no puede romper la pantalla: como mucho, quien entra por
      // primera vez no ve el tutorial y lo encuentra en «Mi cuenta». Y se marca
      // como resuelto igual, o el aviso de instalación no saldría nunca.
      .catch((err) => {
        console.error('No se pudo leer el estado del tutorial:', err)
        if (montado) setResuelto(true)
      })

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

  return {
    abierto,
    abrir,
    cerrar,
    /**
     * El tour ocupa la pantalla ahora, o todavía no se sabe si va a ocuparla.
     * Lo que debe mirar quien quiera esperar su turno, en vez de `abierto`.
     */
    ocupaPantalla: !resuelto || abierto,
  }
}
