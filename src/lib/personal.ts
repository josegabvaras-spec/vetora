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
