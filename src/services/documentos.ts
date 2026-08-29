import type { Rol } from '../types/database'
import type { FichaPaciente } from '../types/views'
import { getFichaPaciente } from './clientesPacientes'
import { getFichaPacientePortal } from './portalCliente'

/**
 * De dónde saca su ficha una página de documento, según quién la esté mirando.
 *
 * Las cuatro páginas imprimibles del expediente (historial, consulta, receta e
 * informe) las abren ahora dos roles muy distintos: el personal desde la ficha
 * clínica, y el dueño desde su portal. El documento es el mismo papel; lo que
 * no puede ser el mismo es el `select`.
 *
 * Reutilizar `getFichaPaciente` para el dueño habría funcionado —la RLS no lo
 * habría roto— y ese es justo el problema: hace `select('*')` sobre `usuarios`,
 * y un `cliente` tiene `clinica_id`, así que `usuarios_select` le habría dejado
 * bajarse el directorio del personal entero, con correos y teléfonos, a su
 * celular. Que la RLS lo permita no lo hace correcto.
 *
 * Es una función de una línea a propósito: el punto es que exista **un solo
 * sitio** donde se decide, en vez de un `if (rol === 'cliente')` repetido en
 * cuatro páginas que acabaría divergiendo.
 */
export function cargarFichaDeDocumento(
  pacienteId: string,
  rol: Rol | undefined,
): Promise<FichaPaciente | null> {
  return rol === 'cliente' ? getFichaPacientePortal(pacienteId) : getFichaPaciente(pacienteId)
}

/**
 * A dónde vuelve el botón «Volver» de un documento, según quién lo abrió.
 *
 * Las páginas de impresión viven fuera de `AppLayout` y sin navegación
 * alrededor, así que ese enlace es la ÚNICA salida. Apuntaba siempre a la ficha
 * clínica, que para un dueño es una pantalla a la que no tiene acceso: el mismo
 * callejón sin salida que ya tenía `ConsentimientoPage` mandándolo a la agenda.
 */
export function volverDeDocumento(pacienteId: string, rol: Rol | undefined): string {
  return rol === 'cliente' ? `/portal-cliente/paciente/${pacienteId}` : `/pacientes/${pacienteId}`
}
