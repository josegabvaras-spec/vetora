-- Correcciones críticas sobre 0001_init.sql.
--
-- Salen de dos auditorías (esquema y seguridad) y están agrupadas por motivo.
-- Todas son seguras sobre datos existentes: no se recrea ninguna tabla, no se
-- reescriben filas. `set default` y `alter policy` no tocan lo ya guardado.
--
-- ⚠️ ANTES DE APLICAR: comprobar que este repositorio describe la base viva.
--    `supabase db diff --linked` debe salir vacío. Si hay DDL aplicado desde el
--    panel de Supabase, las policies reales no son las de 0001 y esta migración
--    puede pisarlas.

-- =========================================================
-- 1. Cerrar un historial y dar un alta estaban PROHIBIDOS por la RLS
-- =========================================================
-- Una policy de UPDATE sin `with check` reutiliza el `using` para la fila
-- resultante. Como el `using` exige `editable = true` / `estado = 'internado'`,
-- la fila NUEVA tenía que cumplirlo también: cerrar la consulta (HU-02) y dar
-- el alta fallaban con 42501.
--
-- La corrección NO es relajar el `using` —eso abriría la edición de historiales
-- cerrados—: es declarar un `with check` que solo exija el inquilino. El sentido
-- único lo siguen imponiendo trg_historial_inmutable y trg_internacion_inmutable,
-- que son la barrera dura y además resisten condiciones de carrera.

drop policy historial_update on historial_clinico;
create policy historial_update on historial_clinico for update
  using (clinica_id = (select auth_clinica_id()) and editable = true)
  with check (clinica_id = (select auth_clinica_id()));

drop policy internaciones_update on internaciones;
create policy internaciones_update on internaciones for update
  using (
    clinica_id = (select auth_clinica_id())
    and ((select auth_es_admin()) or sucursal_id = (select auth_sucursal_id()))
    and estado = 'internado'
  )
  with check (
    clinica_id = (select auth_clinica_id())
    and ((select auth_es_admin()) or sucursal_id = (select auth_sucursal_id()))
  );

-- =========================================================
-- 2. El inquilino lo pone la sesión, no el cliente
-- =========================================================
-- `clinica_id` es not null sin default en 17 tablas, y casi ningún INSERT de
-- negocio lo enviaba: toda escritura fallaba. Ponerlo en el cliente sería
-- además la forma equivocada — el inquilino nunca puede venir del navegador.
-- Con el default, el `with check (clinica_id = auth_clinica_id())` de cada
-- policy sigue siendo la barrera y ya no hay nada que recordar en 17 sitios.

alter table servicios                   alter column clinica_id set default auth_clinica_id();
alter table clientes                    alter column clinica_id set default auth_clinica_id();
alter table pacientes                   alter column clinica_id set default auth_clinica_id();
alter table citas                       alter column clinica_id set default auth_clinica_id();
alter table historial_clinico           alter column clinica_id set default auth_clinica_id();
alter table vacunas_aplicadas           alter column clinica_id set default auth_clinica_id();
alter table desparasitaciones_aplicadas alter column clinica_id set default auth_clinica_id();
alter table consentimientos_cirugia     alter column clinica_id set default auth_clinica_id();
alter table internaciones               alter column clinica_id set default auth_clinica_id();
alter table notas_internacion           alter column clinica_id set default auth_clinica_id();
alter table productos                   alter column clinica_id set default auth_clinica_id();
alter table movimientos_inventario      alter column clinica_id set default auth_clinica_id();
alter table turnos_caja                 alter column clinica_id set default auth_clinica_id();
alter table cobros                      alter column clinica_id set default auth_clinica_id();
alter table cobro_lineas                alter column clinica_id set default auth_clinica_id();

-- `sucursales` e `invitaciones` quedan fuera a propósito: las escribe el
-- superadmin, para quien auth_clinica_id() es null.

-- =========================================================
-- 3. search_path fijo en las funciones SECURITY DEFINER
-- =========================================================
-- Sin search_path explícito, una función SECURITY DEFINER resuelve `usuarios`
-- con el search_path de quien la llama. Quien pudiera anteponer un esquema con
-- su propia tabla `usuarios` haría que auth_clinica_id() devolviera el inquilino
-- que quisiera, y de estas cuatro cuelgan las 35 policies.
--
-- Hoy no es alcanzable vía PostgREST (anon/authenticated no tienen CREATE sobre
-- public y no hay SQL arbitrario), pero es una línea por función y el linter de
-- Supabase lo marca como function_search_path_mutable. `pg_temp` va AL FINAL:
-- es lo que le quita la prioridad implícita.

alter function auth_clinica_id()    set search_path = public, pg_temp;
alter function auth_sucursal_id()   set search_path = public, pg_temp;
alter function auth_es_admin()      set search_path = public, pg_temp;
alter function auth_es_plataforma() set search_path = public, pg_temp;

-- Misma disciplina en las de trigger, aunque no sean SECURITY DEFINER.
alter function bloquear_si_no_editable()       set search_path = public, pg_temp;
alter function bloquear_internacion_cerrada()  set search_path = public, pg_temp;
alter function aplicar_movimiento_inventario() set search_path = public, pg_temp;

-- =========================================================
-- 4. Los movimientos de inventario respetan la sucursal
-- =========================================================
-- `productos_all` exige admin o sucursal propia, pero `movimientos_all` solo
-- exigía clinica_id. Un veterinario de la sucursal A podía insertar un egreso
-- contra un producto de la B; y como el trigger que ajusta el stock es SECURITY
-- INVOKER, su `update productos` no veía la fila y actualizaba CERO filas sin
-- error. El movimiento quedaba registrado y el stock intacto: descuadre mudo.

drop policy movimientos_all on movimientos_inventario;
create policy movimientos_all on movimientos_inventario for all
  using (
    clinica_id = (select auth_clinica_id())
    and exists (
      select 1 from productos p
      where p.id = producto_id
        and ((select auth_es_admin()) or p.sucursal_id = (select auth_sucursal_id()))
    )
  )
  with check (
    clinica_id = (select auth_clinica_id())
    and exists (
      select 1 from productos p
      where p.id = producto_id
        and ((select auth_es_admin()) or p.sucursal_id = (select auth_sucursal_id()))
    )
  );

-- El trigger pasa a SECURITY DEFINER para que el ajuste de stock sea
-- consecuencia real de la inserción y no dependa de lo que el invocante vea.
-- El acceso ya está filtrado por la policy de arriba antes de llegar aquí.
create or replace function aplicar_movimiento_inventario()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.tipo = 'ingreso' then
    update productos set stock_actual = stock_actual + new.cantidad where id = new.producto_id;
  else
    update productos set stock_actual = stock_actual - new.cantidad where id = new.producto_id;
  end if;
  return new;
end;
$$;

-- =========================================================
-- 5. Una cita produce como mucho un historial y un consentimiento
-- =========================================================
-- `iniciarHistorialDesdeCita` y el alta de consentimiento son check-then-insert
-- sin protección: dos pestañas abiertas crean duplicados, y entonces los
-- `.maybeSingle()` de historial.ts y consentimientos.ts empiezan a lanzar.
-- Un consentimiento duplicado es además un documento legal duplicado.
--
-- Si ya existieran duplicados, estos índices fallan al crearse: hay que
-- limpiarlos antes.

create unique index if not exists historial_una_por_cita
  on historial_clinico (cita_id);
create unique index if not exists consentimiento_uno_por_cita
  on consentimientos_cirugia (cita_id);
