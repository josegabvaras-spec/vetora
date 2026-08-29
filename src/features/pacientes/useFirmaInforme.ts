/**
 * Lee la firma vigente de un documento imprimible.
 *
 * Tri-estado a propósito: `undefined` mientras carga, `null` si no está firmado, y el objeto si lo está. Sin ese tercer valor la pantalla enseñaría «sin firmar» durante la carga.
 *
 * Vive aparte porque un fichero que exporta componentes Y otras cosas rompe el
 * Fast Refresh de Vite: al tocar cualquiera de las dos se recarga el módulo
 * entero y se pierde el estado de la pantalla.
 */
import { useEffect, useState } from 'react'
import { getFirmaInforme, type InformeFirmado, type TipoInforme } from '../../services/informes'

/**
 * Carga la firma vigente del documento.
 *
 * `undefined` mientras se consulta y `null` cuando no hay ninguna: con un solo
 * valor, la pantalla enseñaría «sin firmar» durante la carga y el botón de
 * firmar parpadearía en cada apertura.
 */
export function useFirmaInforme(
  pacienteId: string | null | undefined,
  tipo: TipoInforme,
  itemId: string | null,
) {
  const [firma, setFirma] = useState<InformeFirmado | null | undefined>(undefined)

  useEffect(() => {
    // Hace falta al menos un identificador. Los recibos van sin paciente y se
    // localizan por su cobro (`itemId`); el resto, al revés.
    if (!pacienteId && !itemId) return
    let montado = true
    getFirmaInforme(pacienteId ?? null, tipo, itemId)
      .then((f) => {
        if (montado) setFirma(f)
      })
      .catch(() => {
        if (montado) setFirma(null)
      })
    return () => { montado = false }
  }, [pacienteId, tipo, itemId])

  return { firma, setFirma }
}
