import { useAuth } from '../../context/AuthContext'
import { AsistentePage } from '../../pages/AsistentePage'
import { AsistenteVeterinarioPage } from '../../pages/AsistenteVeterinarioPage'

/**
 * `/asistente` son dos pantallas distintas según quién entre, igual que
 * `InicioSegunRol` es un destino distinto según el rol.
 *
 * El del veterinario es su cola de trabajo clínico —a quién atiende, qué le
 * queda—; el de recepción y administración son los avisos por WhatsApp a los
 * clientes y el informe del día. Comparten ruta y entrada del menú porque para
 * quien lo usa es «el asistente», pero no comparten nada más: meter las dos en
 * un archivo dejaría una página de seiscientas líneas con dos mitades que no se
 * hablan.
 */
export function AsistenteSegunRol() {
  const { usuario } = useAuth()
  return usuario?.rol === 'veterinario' ? <AsistenteVeterinarioPage /> : <AsistentePage />
}
