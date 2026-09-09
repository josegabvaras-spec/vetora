-- Extiende `trg_paciente_sin_caja` para que también proteja el historial
-- cerrado, no solo los cobros (H-31, primera puerta).
--
-- `paciente_sin_caja()` (0049) bloqueaba borrar un paciente si tenía cobros
-- en caja — pero no miraba el historial clínico en absoluto. Un paciente con
-- consultas cerradas y sin ningún cobro asociado se podía borrar igual, y la
-- cascada de FK se llevaba por delante `historial_clinico`, `recetas`,
-- `vacunas_aplicadas`, `desparasitaciones_aplicadas`, `consentimientos_cirugia`
-- e `informes_firmados`.
--
-- ⚠️ Bloquea SOLO lo cerrado (`editable = false`), no un borrador abierto.
-- Un borrador es una consulta a medio escribir, todavía no es el expediente
-- que se promete inmutable — impedir borrar un paciente por un borrador
-- suyo sin terminar convertiría un alta hecha por error en algo permanente,
-- que es el problema contrario.
--
-- Mismo trigger, mismo nombre: se amplía la función que ya está enganchada,
-- no se crea una segunda. Conserva el escape para `eliminar-clinica` (si la
-- clínica ya no existe, el borrado es intencionado y completo).

create or replace function paciente_sin_caja() returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_cobros integer;
  v_historiales integer;
begin
  if not exists (select 1 from clinicas where id = old.clinica_id) then
    return old;
  end if;

  select count(*)
    into v_cobros
    from cobros co
   where co.cita_id in (select id from citas where paciente_id = old.id)
      or co.internacion_id in (select id from internaciones where paciente_id = old.id);

  if v_cobros > 0 then
    raise exception
      'No se puede borrar: este paciente tiene % cobro(s) registrados en caja. '
      'Borrarlo descuadraría turnos ya arqueados.', v_cobros
      using errcode = 'P0001';
  end if;

  -- La parte nueva: el mismo criterio, sobre el expediente en vez de la caja.
  select count(*)
    into v_historiales
    from historial_clinico
   where paciente_id = old.id and editable = false;

  if v_historiales > 0 then
    raise exception
      'No se puede borrar: este paciente tiene % consulta(s) cerrada(s) en su '
      'expediente clínico. Un historial cerrado es inmutable.', v_historiales
      using errcode = 'P0001';
  end if;

  return old;
end;
$$;

comment on function paciente_sin_caja() is
  'Trigger BEFORE DELETE en pacientes (H-31): bloquea el borrado si tiene '
  'cobros en caja O historiales clínicos cerrados. Ampliada de la versión '
  'original (0049, solo cobros) tras encontrar que borrar la CITA -no solo '
  'el paciente- también arrastraba el historial; ver 0075 para esa puerta.';

-- El trigger ya existe (0049): no hace falta recrearlo, `create or replace
-- function` basta porque el trigger apunta al nombre de la función, no a un
-- cuerpo congelado.

-- =========================================================
-- PRUEBAS OBLIGATORIAS
-- =========================================================
--   1. Paciente sin cobros y sin historial: se borra igual que siempre.
--   2. Paciente con un historial CERRADO y sin cobros: rechazado con el
--      mensaje nuevo, antes se borraba.
--   3. Paciente con un historial ABIERTO (editable = true) y sin cobros: se
--      borra (el borrador se va con él) — esto NO debe bloquearse.
--   4. Paciente con cobros: sigue rechazado por el motivo de siempre (se
--      comprueba primero, el mensaje de cobros no cambia).
--   5. `eliminar-clinica`: sigue pudiendo borrar clínicas enteras con
--      pacientes que tienen historial cerrado (el escape de la línea 1).
