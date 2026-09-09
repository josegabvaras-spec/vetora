-- Extiende (otra vez) `trg_paciente_sin_caja` para proteger también las
-- internaciones ya dadas de alta — la salvedad que quedó pendiente al
-- cerrar H-31.
--
-- Mismo patrón exacto que la corrección del historial (`0076`): una
-- internación con `estado = 'alta'` está "congelada" según su propio trigger
-- (`bloquear_internacion_cerrada`, 0001) — es el mismo concepto que
-- `editable = false` en `historial_clinico`, solo que con otro nombre de
-- columna. Pero nada impedía que borrar el PACIENTE se la llevara por
-- delante en cascada, sin pasar por ese trigger (las cascadas de FK no
-- disparan `before update`, que es justo el motivo por el que 0076 hizo
-- falta para el historial).
--
-- ⚠️ Bloquea SOLO `estado = 'alta'`, no `'internado'`. Una internación en
-- curso no es todavía el registro cerrado que se promete inmutable —mismo
-- criterio que un historial en borrador tampoco bloquea el borrado en 0076—;
-- y en la práctica, un paciente internado activamente casi siempre tiene ya
-- algún cobro que lo protegería de todos modos por la vía que ya existía.
--
-- `internaciones.cita_id` es `on delete set null`, no `cascade`: borrar una
-- cita NO se lleva la internación por delante (al revés que con
-- `historial_clinico`, ver 0075). No hace falta una "puerta 2" aquí.

create or replace function paciente_sin_caja() returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_cobros integer;
  v_historiales integer;
  v_internaciones integer;
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

  -- La parte nueva: mismo criterio, sobre la internación en vez del historial.
  select count(*)
    into v_internaciones
    from internaciones
   where paciente_id = old.id and estado = 'alta';

  if v_internaciones > 0 then
    raise exception
      'No se puede borrar: este paciente tiene % internación(es) ya dada(s) '
      'de alta. Una internación cerrada es inmutable.', v_internaciones
      using errcode = 'P0001';
  end if;

  return old;
end;
$$;

comment on function paciente_sin_caja() is
  'Trigger BEFORE DELETE en pacientes: bloquea el borrado si tiene cobros en '
  'caja, historiales clínicos cerrados (0076) o internaciones ya dadas de '
  'alta (0077, H-31 completo). El nombre de la función ya no describe todo '
  'lo que hace, pero renombrarla obligaría a recrear el trigger; el '
  'comentario es la fuente de verdad.';

-- =========================================================
-- PRUEBAS OBLIGATORIAS
-- =========================================================
--   1. Paciente sin cobros, sin historial, sin internación: se borra igual.
--   2. Paciente con internación `estado = 'alta'` y sin cobros ni historial
--      cerrado: rechazado con el mensaje nuevo — antes se borraba.
--   3. Paciente con internación `estado = 'internado'` (en curso) y sin
--      cobros ni historial cerrado: se borra — esto NO debe bloquearse.
--   4. Las pruebas 1-4 de `0076` siguen pasando igual (cobros, historial).
--   5. `eliminar-clinica`: sigue pudiendo borrar clínicas enteras con
--      internaciones dadas de alta (el escape de la línea 1, sin cambios).
