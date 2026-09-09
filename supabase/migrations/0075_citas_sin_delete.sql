-- Quita el DELETE de `citas` al personal (H-31, segunda puerta).
--
-- `historial_clinico.cita_id` es `on delete cascade`. `citas_personal` (0004)
-- era `for all`, con DELETE incluido, para todo el personal — y borrar una
-- cita es rutinario, no una operación rara como borrar un paciente entero.
-- Un `DELETE /rest/v1/citas?id=eq.X` se lleva por delante el historial
-- cerrado de esa consulta, sus recetas y sus vacunas, sin que nada lo frene:
-- las cascadas de FK no evalúan la RLS ni disparan `trg_historial_inmutable`
-- (que es `before update`, no `before delete`).
--
-- Es incoherente además con `0053`: al peluquero se le prohíbe expresamente
-- LEER el historial (`auth_ve_expediente()` lo excluye), pero podía
-- DESTRUIRLO borrando la cita de la que colgaba. Se le cierra la puerta de
-- entrada y se le deja la palanca de demolición.
--
-- La aplicación nunca ha llamado a esto: cancelar una cita es
-- `actualizarEstadoCita(id, 'cancelada')`, no un DELETE. Quitar el permiso no
-- rompe nada que se use — cierra algo que nunca debió estar abierto.
--
-- `0064` ya partió otras tablas de `for all` a policies por operación
-- (select/insert/update, sin delete) con este mismo motivo; `citas` se quedó
-- fuera de esa migración y queda alineada aquí.

drop policy if exists citas_personal on citas;

-- Se conserva exactamente la misma condición de las tres cláusulas
-- (clínica + personal + admin-o-propia-sucursal) que tenía `citas_personal`:
-- esto NO cambia quién ve o edita qué, solo retira el DELETE.
create policy citas_select on citas for select
  to authenticated
  using (
    clinica_id = (select auth_clinica_id())
    and (select auth_es_personal())
    and ((select auth_es_admin()) or sucursal_id = (select auth_sucursal_id()))
  );

create policy citas_insert on citas for insert
  to authenticated
  with check (
    clinica_id = (select auth_clinica_id())
    and (select auth_es_personal())
    and ((select auth_es_admin()) or sucursal_id = (select auth_sucursal_id()))
  );

create policy citas_update on citas for update
  to authenticated
  using (
    clinica_id = (select auth_clinica_id())
    and (select auth_es_personal())
    and ((select auth_es_admin()) or sucursal_id = (select auth_sucursal_id()))
  )
  with check (
    clinica_id = (select auth_clinica_id())
    and (select auth_es_personal())
    and ((select auth_es_admin()) or sucursal_id = (select auth_sucursal_id()))
  );

-- Sin policy de DELETE: una cita se CANCELA (`estado = 'cancelada'`), que es
-- lo que la aplicación ya hace. No es un olvido.
--
-- `citas_portal` (0004, solo SELECT para el rol `cliente`) no se toca: esta
-- migración es exclusivamente sobre la policy del personal.

-- =========================================================
-- PRUEBAS OBLIGATORIAS
-- =========================================================
--   1. Como personal de la clínica: sigue pudiendo leer, crear y actualizar
--      citas de su clínica (y de su sucursal si no es admin) exactamente
--      igual que antes.
--   2. `DELETE /rest/v1/citas?id=eq.<uuid>` con esa misma sesión: 0 filas
--      afectadas, sin error de RLS (PostgREST devuelve 200 con 0 filas
--      cuando el `where` no empareja ninguna política, no un 403).
--   3. Un historial cerrado con una cita asociada sigue existiendo después
--      de intentar borrar la cita.
--   4. `actualizarEstadoCita(id, 'cancelada')` sigue funcionando (usa UPDATE,
--      no DELETE).
