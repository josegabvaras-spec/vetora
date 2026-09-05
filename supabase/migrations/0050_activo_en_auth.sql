-- Que desactivar a un usuario signifique algo para la RLS.
--
-- ⚠️⚠️ NO APLICADA TODAVÍA, Y ES LA MÁS PELIGROSA DE LAS SEIS. ⚠️⚠️
--
-- Estas cuatro funciones son el cimiento de las 103 policies del proyecto. Un
-- error aquí no rompe una pantalla: deja a TODO EL MUNDO fuera de TODO. No la
-- apliques sin haber leído la sección de pruebas del final, y preferiblemente
-- no directamente sobre producción.
--
-- =========================================================
-- El problema
-- =========================================================
-- `alternarActivoUsuario()` pone `activo = false` y nada más. No revoca la
-- sesión, no toca `auth.users`. Y de las cinco funciones de las que cuelga la
-- RLS, **solo `auth_es_clinico()` (la más nueva, de 0042) mira `activo`**:
--
--     auth_clinica_id():    select clinica_id from usuarios where id = auth.uid();
--     auth_es_admin():      select rol = 'admin' from usuarios where id = auth.uid();
--     auth_es_personal():   select rol in (…) from usuarios where id = auth.uid();
--     auth_es_plataforma(): select rol = 'superadmin' from usuarios where id = auth.uid();
--
-- Resultado: el empleado desactivado conserva su JWT, lo renueva con su refresh
-- token, y sigue leyendo y escribiendo las 44 tablas por PostgREST. La
-- aplicación lo expulsa con `motivoDeBloqueo()`; la API no se entera. Lo mismo
-- vale para una clínica suspendida, que CLAUDE.md reconocía como pendiente.
--
-- Es decir: **el control de baja de personal no funciona.** Hoy, dar de baja a
-- alguien de verdad exige borrarlo o cambiarle la contraseña.
--
-- =========================================================
-- El cambio
-- =========================================================
-- Se añade `and activo` a las cuatro, tomando `auth_es_clinico()` como modelo,
-- que ya lo hace así desde 0042. Se conserva el resto exactamente igual:
-- mismo lenguaje, misma volatilidad, mismo `search_path`, mismo
-- `security definer` (siguen leyendo `usuarios`, que está bajo RLS; sin
-- `security definer` la policy se llamaría a sí misma).
--
-- `auth_sucursal_id()` NO se toca: devuelve una sucursal, no un permiso. Si el
-- usuario está inactivo, las otras cuatro ya le cierran todo, y añadirle la
-- condición solo cambiaría un `null` por otro.

create or replace function auth_clinica_id() returns uuid
  language sql stable security definer
  set search_path = public, pg_temp
as $$
  select clinica_id from usuarios where id = auth.uid() and activo;
$$;

create or replace function auth_es_admin() returns boolean
  language sql stable security definer
  set search_path = public, pg_temp
as $$
  select exists (
    select 1 from usuarios where id = auth.uid() and activo and rol = 'admin'
  );
$$;

create or replace function auth_es_personal() returns boolean
  language sql stable security definer
  set search_path = public, pg_temp
as $$
  select exists (
    select 1 from usuarios
     where id = auth.uid() and activo
       and rol in ('admin', 'veterinario', 'recepcion', 'peluquero')
  );
$$;

create or replace function auth_es_plataforma() returns boolean
  language sql stable security definer
  set search_path = public, pg_temp
as $$
  select exists (
    select 1 from usuarios where id = auth.uid() and activo and rol = 'superadmin'
  );
$$;

-- =========================================================
-- Un cambio de forma que importa: `exists` en vez de comparación directa
-- =========================================================
-- Las versiones anteriores devolvían `rol = 'admin'` sobre un `select` que
-- podía no devolver ninguna fila, y entonces la función devolvía **NULL**, no
-- `false`. Las policies tratan NULL como falso, así que el efecto práctico era
-- el mismo — pero un NULL que se propaga es difícil de razonar y ya causó
-- confusión al analizar el caso del superadmin (`clinica_id = null`, y
-- `null = null` da null). Con `exists` la respuesta es siempre booleana.
-- `auth_clinica_id()` sigue devolviendo NULL cuando no hay fila, porque su
-- valor ES un uuid o nada, y las policies dependen de ese comportamiento.
--
-- =========================================================
-- PRUEBAS OBLIGATORIAS antes de dar esto por bueno
-- =========================================================
-- Estado de partida verificado: 0 usuarios inactivos. Así que aplicar esto NO
-- debería dejar a nadie fuera hoy. Aun así:
--
--   1. Login y navegación completa con cada rol: admin, veterinario,
--      recepcion, peluquero, cliente del portal y superadmin.
--   2. Para el superadmin en particular: `/plataforma/clinicas`,
--      `/plataforma/usuarios` y `/plataforma/planes` — es quien más depende de
--      `auth_es_plataforma()`.
--   3. Alta de clínica con admin (ejercita `usuarios_plataforma` al insertar).
--   4. Una escritura clínica real: abrir una consulta, cerrarla, cobrarla.
--   5. Solo entonces: desactivar un usuario de prueba y comprobar las dos
--      mitades — que la interfaz lo expulsa, Y que su token ya no le sirve
--      contra `/rest/v1/pacientes`. Esa segunda mitad es la que hoy falla y es
--      el motivo entero de esta migración.
--
-- Reversión: volver a crear las cuatro funciones sin `and activo`. Sin pérdida
-- de datos, pero mientras tanto nadie entra — ténla escrita antes de aplicar.
--
-- =========================================================
-- Lo que esto NO arregla
-- =========================================================
-- El JWT ya emitido sigue siendo válido hasta que caduque; lo que cambia es que
-- deja de servir para leer nada, porque las policies preguntan por `activo` en
-- cada consulta. Para cortar la sesión en el acto hace falta además
-- `auth.admin.signOut(userId)` desde una Edge Function, que es un cambio de
-- infraestructura aparte y no está en esta migración.
