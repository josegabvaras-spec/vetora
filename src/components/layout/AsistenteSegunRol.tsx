import { useAuth } from '../../context/useAuth'
import { AsistentePage } from '../../pages/AsistentePage'
import { AsistenteJornadaPage } from '../../pages/AsistenteJornadaPage'

/**
 * `/asistente` son dos pantallas distintas según quién entre, igual que
 * `InicioSegunRol` es un destino distinto según el rol.
 *
 * La de quien atiende directamente al paciente —veterinario o peluquero— es
 * su cola de trabajo: a quién atiende, qué le queda; la de recepción y
 * administración son los avisos por WhatsApp a los clientes y el informe del
 * día. Comparten ruta y entrada del menú porque para quien lo usa es «el
 * asistente», pero no comparten nada más: meter las dos en un archivo dejaría
 * una página de seiscientas líneas con dos mitades que no se hablan.
 */
export function AsistenteSegunRol() {
  const { usuario } = useAuth()
  const esClinico = usuario?.rol === 'veterinario' || usuario?.rol === 'peluquero'
  return esClinico ? <AsistenteJornadaPage /> : <AsistentePage />
}
