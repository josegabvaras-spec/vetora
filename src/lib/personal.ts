import type { ModuloVetora } from '../types/database'

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

/**
 * A dónde pertenece cada quien al entrar: su pantalla de inicio real.
 *
 * Existe porque esto mismo estaba escrito **cuatro veces** —`InicioSegunRol`,
 * `LoginPage`, el botón de sesión de `HomeHeader` y el canje del enlace de
 * acceso—, y la cuarta se había escrito mal: `/acceso/:token` mandaba a `/`
 * después de crear la contraseña, y `/` es la **landing pública**. Quien
 * acababa de darse de alta quedaba con la sesión abierta pero mirando la
 * página de marketing, sin ni una pista de que ya estaba dentro.
 *
 * `/` no vale como destino aunque haya un `InicioSegunRol` montado ahí: hay dos
 * rutas con ese path (la pública y la del área clínica) y gana la primera del
 * árbol, que es `HomePage`. Hay que nombrar el destino.
 *
 * `esPlataforma` del contexto es exactamente `rol === 'superadmin'`, así que
 * con el rol basta y esto se queda como función pura.
 */
export function rutaDeInicio(usuario: { rol: string } | null | undefined): string {
  if (!usuario) return '/login'
  if (usuario.rol === 'superadmin') return '/plataforma'
  if (usuario.rol === 'cliente') return '/portal-cliente/dashboard'
  // El resto del personal aterriza en la agenda, incluido cualquier rol nuevo:
  // es el destino al que `RolRoute` rebota cuando el rol no encaja.
  return '/agenda'
}

/**
 * Los paneles propios de cada módulo, con **quién puede entrar en ellos**.
 *
 * Los roles tienen que coincidir con el `RolRoute` que envuelve cada panel en
 * `App.tsx`. Si divergen, el rebote de abajo manda a alguien a una puerta que
 * se le cierra en la cara.
 */
const PANELES_DE_MODULO: { modulo: ModuloVetora; ruta: string; roles: string[] }[] = [
  { modulo: 'peluqueria', ruta: '/peluqueria/dashboard', roles: ['admin', 'recepcion', 'peluquero'] },
  { modulo: 'petshop', ruta: '/petshop/dashboard', roles: ['admin', 'recepcion', 'veterinario'] },
]

/**
 * A dónde mandar a alguien: su panel propio si el negocio no es clínico, y si
 * no, lo que diga `rutaDeInicio`.
 *
 * La usan `InicioSegunRol` (al entrar) y los dos guardianes `RolRoute` y
 * `ModuloRoute` (al rebotar). Recibe `tieneModulo` como parámetro para seguir
 * siendo pura: `lib/` no conoce el contexto de React.
 *
 * ⚠️ **Comprueba el ROL además del módulo, y no es opcional.** Los paneles
 * llevan su propio `RolRoute`: `/petshop/dashboard` no admite a un `peluquero`.
 * Sin esa comprobación, un peluquero en una clínica con plan de petshop sería
 * enviado allí, su `RolRoute` lo rebotaría, y volvería a ser enviado al mismo
 * sitio — un **bucle infinito** que cuelga la aplicación. Cuando el rol no
 * encaja se cae a `/agenda`, que admite a todo el personal y cuya ruta no está
 * gateada por módulo: por eso es el único terminal seguro.
 *
 * Una veterinaria con peluquería o petshop integrados (plan con
 * `historial_clinico`) sigue entrando por la agenda: ahí esos módulos son una
 * sección más, no el negocio.
 */
export function rutaDeInicioSegunModulos(
  usuario: { rol: string } | null | undefined,
  tieneModulo: (modulo: ModuloVetora) => boolean,
): string {
  if (usuario && usuario.rol !== 'cliente' && !tieneModulo('historial_clinico')) {
    const panel = PANELES_DE_MODULO.find(
      (p) => tieneModulo(p.modulo) && p.roles.includes(usuario.rol),
    )
    if (panel) return panel.ruta
  }
  return rutaDeInicio(usuario)
}

/**
 * Quién ve el expediente clínico: historial, esquema sanitario e internaciones.
 *
 * El `peluquero` es el único rol de personal que queda fuera. Sí da de alta
 * mascotas y dueños —una peluquería necesita registrar al paciente para poder
 * agendarle, y para que el dueño lo vea en su portal, igual que una clínica—,
 * pero no escribe ni lee consultas, recetas ni vacunas: no es asistencia
 * médica y no le hace falta para su trabajo. Lo que sí necesita de la ficha
 * (raza, tamaño, alergias, el dueño y su teléfono) está fuera de las pestañas.
 *
 * **Es un filtro de pantalla, no una barrera de seguridad**, igual que
 * `veterinarioAcotado`: la RLS separa el inquilino, no el sub-rol, y
 * `auth_es_personal()` incluye al peluquero desde la migración 0025. Quien de
 * verdad cierra el expediente por URL es el `RolRoute` de las rutas de
 * impresión en `App.tsx`, que va emparejado con esta función.
 */
export function puedeVerHistorialClinico(
  usuario: { rol: string } | null | undefined,
): boolean {
  return usuario?.rol === 'admin' || usuario?.rol === 'veterinario' || usuario?.rol === 'recepcion'
}
