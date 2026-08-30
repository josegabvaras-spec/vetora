import { useAuth } from '../../context/useAuth'
import { panelDelNegocio } from '../../lib/personal'
import { AsistentePage } from '../../pages/AsistentePage'
import { AsistenteJornadaPage } from '../../pages/AsistenteJornadaPage'
import { AsistentePetshopPage } from '../../pages/AsistentePetshopPage'

/**
 * `/asistente` son varias pantallas distintas según quién entre y **a qué se
 * dedica el negocio**, igual que `InicioSegunRol` es un destino distinto según
 * el rol.
 *
 * | Quién | Qué ve |
 * |---|---|
 * | Un petshop (cualquier rol) | `AsistentePetshopPage`: qué reponer y qué está por vencer |
 * | Veterinario o peluquero | `AsistenteJornadaPage`: su cola de trabajo del día |
 * | Recepción y administración | `AsistentePage`: los avisos por WhatsApp y el informe del día |
 *
 * **El petshop va primero y para todos los roles.** Las otras dos derivan todo
 * de pacientes, citas e historiales, y un petshop no tiene nada de eso —ni
 * `fichas` ni `agenda` en su plan—, así que cualquiera de las dos le dejaría
 * una pantalla vacía. Lo suyo es la mercadería.
 *
 * Una **peluquería** sí usa `AsistentePage`, que se adapta por dentro: tiene
 * citas, cumpleaños y clientes que no vuelven; lo que no tiene son refuerzos de
 * vacuna ni cirugías.
 *
 * Comparten ruta y entrada del menú porque para quien lo usa es «el
 * asistente», pero no comparten nada más: meterlas en un archivo dejaría una
 * página de mil líneas con tres mitades que no se hablan.
 */
export function AsistenteSegunRol() {
  const { usuario, modulosHabilitados } = useAuth()

  if (panelDelNegocio(modulosHabilitados) === 'petshop') return <AsistentePetshopPage />

  const esClinico = usuario?.rol === 'veterinario' || usuario?.rol === 'peluquero'
  return esClinico ? <AsistenteJornadaPage /> : <AsistentePage />
}
