/**
 * Quién puede figurar como veterinario responsable de una cita o de una
 * internación.
 *
 * El `admin` cuenta **a propósito**: en el Plan Consultorio (PRD §3, «Veterinario
 * independiente: atiende solo/a») el dueño de la clínica es quien atiende, y no
 * se da de alta a sí mismo una segunda vez con rol `veterinario`. Filtrando solo
 * por `rol === 'veterinario'`, esas clínicas se quedaban sin nadie a quien
 * asignar y la agenda no dejaba crear ni una cita.
 *
 * `recepcion` queda fuera: agenda las citas, pero no las atiende.
 *
 * Los inactivos también: siguen firmando los historiales y cobros que ya
 * atendieron, pero no se les agenda nada nuevo.
 *
 * La firma es estructural para servir tanto a `Usuario` (types/database) como a
 * la fila generada de `usuarios` (types/supabase), que declara `rol: string`.
 */
export function puedeAtender(usuario: { rol: string; activo: boolean }): boolean {
  return (usuario.rol === 'veterinario' || usuario.rol === 'admin') && usuario.activo
}

/**
 * Veterinario al que se acota lo que este usuario ve y agenda, o `undefined`
 * si ve el trabajo de toda la sucursal.
 *
 * Un `veterinario` abre la agenda para saber qué le toca a ÉL. Con las citas de
 * todos mezcladas, tiene que buscar las suyas y el contador del día no es el
 * suyo.
 *
 * El `admin` NO se acota aunque atienda —en el Plan Consultorio atiende, ver
 * `puedeAtender`—: coordina la clínica y necesita la vista completa. `recepcion`
 * tampoco, que agenda para todos.
 *
 * **Es un filtro de pantalla, no una barrera de seguridad.** La RLS sigue
 * dejando que un veterinario lea la consulta que un colega le hizo al mismo
 * paciente, y así debe ser: el expediente clínico tiene que estar completo para
 * atender sin riesgo. Lo que se acota es «mi trabajo de hoy», no el historial.
 */
export function veterinarioAcotado(
  usuario: { id: string; rol: string } | null | undefined,
): string | undefined {
  return usuario?.rol === 'veterinario' ? usuario.id : undefined
}

/**
 * Quién puede figurar como responsable de una cita de peluquería.
 *
 * `veterinario` y `admin` cuentan a propósito: una clínica mixta puede no
 * tener personal dedicado y que sea el propio veterinario o el admin quien
 * atienda. `recepcion` queda fuera, mismo motivo que en `puedeAtender`:
 * agenda, no atiende.
 */
export function puedeHacerPeluqueria(usuario: { rol: string; activo: boolean }): boolean {
  return (
    (usuario.rol === 'peluquero' || usuario.rol === 'veterinario' || usuario.rol === 'admin') &&
    usuario.activo
  )
}

/**
 * Peluquero al que se acota lo que este usuario ve y agenda, o `undefined`
 * si ve el trabajo de toda la sucursal. Mismo criterio que `veterinarioAcotado`.
 */
export function peluqueroAcotado(
  usuario: { id: string; rol: string } | null | undefined,
): string | undefined {
  return usuario?.rol === 'peluquero' ? usuario.id : undefined
}
