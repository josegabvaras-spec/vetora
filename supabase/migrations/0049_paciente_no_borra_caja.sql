-- Borrar un paciente no puede llevarse por delante la caja.
--
-- ⚠️ NO APLICADA TODAVÍA. Escrita para revisión; se aplica cuando se apruebe.
-- ⚠️ Lleva además UNA DECISIÓN PENDIENTE, marcada más abajo.
--
-- =========================================================
-- El problema
-- =========================================================
-- `pacientes_personal` es `for all` para todo `auth_es_personal()`, y desde
-- `pacientes` cascadean doce tablas. Dos de esas rutas terminan en dinero:
--
--     pacientes → citas         → cobros → cobro_lineas
--     pacientes → internaciones → cobros → cobro_lineas
--
-- **Las cascadas de clave foránea no evalúan la RLS ni disparan los triggers
-- `before update`.** Así que un solo `DELETE /rest/v1/pacientes?id=eq.X`, hecho
-- por recepción o por el peluquero, se salta a la vez dos invariantes que
-- CLAUDE.md da por garantizadas:
--
--   · «cobros: solo INSERT» — la tabla no tiene policy de UPDATE ni DELETE, y
--     da exactamente igual: la cascada las borra sin consultarlas. Un turno de
--     caja arqueado y firmado deja de cuadrar retroactivamente.
--   · «historial cerrado es inmutable (HU-02)» — `trg_historial_inmutable` es
--     `before update`, no salta en un DELETE.
--
-- El servicio ya lo sabe: `eliminarPaciente()` comprueba los cobros antes y
-- aborta. Pero es una guarda de servicio, no una barrera — quien llama a
-- PostgREST directamente no pasa por ahí. Esto la baja a la base, que es donde
-- viven el resto de invariantes del proyecto.
--
-- =========================================================
-- La salida para `eliminar-clinica`, que no es opcional
-- =========================================================
-- Una cascada SÍ dispara los triggers de la tabla hija. Sin comprobar primero
-- que la clínica siga existiendo, dar de baja a una clínica entera se volvería
-- imposible: `delete from clinicas` cascadea a `pacientes`, este trigger vería
-- los cobros y abortaría el borrado completo. Es exactamente la trampa que ya
-- documenta `trg_cliente_sin_expediente` (0037), y se resuelve igual.

create or replace function paciente_sin_caja() returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_cobros integer;
begin
  -- Si la clínica ya no existe, esto viene de `eliminar-clinica`: el borrado
  -- es intencionado y completo, y no hay caja que preservar. Mismo escape que
  -- `trg_cliente_sin_expediente`.
  if not exists (select 1 from clinicas where id = old.clinica_id) then
    return old;
  end if;

  select count(*)
    into v_cobros
    from cobros co
   where co.cita_id in (select id from citas where paciente_id = old.id)
      or co.internacion_id in (select id from internaciones where paciente_id = old.id);

  if v_cobros > 0 then
    -- Dice CUÁNTOS, como `trg_cliente_sin_expediente` dice cuántas mascotas:
    -- un error que solo dice «no se puede» obliga a adivinar por qué.
    raise exception
      'No se puede borrar: este paciente tiene % cobro(s) registrados en caja. '
      'Borrarlo descuadraría turnos ya arqueados.', v_cobros
      using errcode = 'P0001';
  end if;

  return old;
end;
$$;

drop trigger if exists trg_paciente_sin_caja on pacientes;
create trigger trg_paciente_sin_caja
  before delete on pacientes
  for each row execute function paciente_sin_caja();

-- =========================================================
-- ⚠️ DECISIÓN PENDIENTE: ¿y el historial cerrado?
-- =========================================================
-- Lo de arriba protege la caja. NO protege el expediente: un paciente con
-- historial cerrado y sin ningún cobro se sigue pudiendo borrar, y con él se
-- va el historial que HU-02 declara inmutable.
--
-- Hoy eso es deliberado — `eliminarPaciente()` dice que «el resto de la cadena
-- (historial, vacunas, notas) sí debe irse con el paciente»— y tiene sentido
-- operativo: una ficha creada por error debe poder borrarse entera.
--
-- Pero si HU-02 significa lo que dice, un expediente cerrado no debería
-- desaparecer ni por el padre. Si se decide cerrarlo también, basta añadir al
-- trigger de arriba, antes del `return old`:
--
--     if exists (select 1 from historial_clinico
--                 where paciente_id = old.id and editable = false) then
--       raise exception 'No se puede borrar: este paciente tiene consultas '
--         'cerradas, que son parte del expediente clínico.'
--         using errcode = 'P0001';
--     end if;
--
-- No lo dejo activado porque cambia una regla de negocio, no cierra una
-- vulnerabilidad: es una decisión del dueño del producto, no del auditor.
