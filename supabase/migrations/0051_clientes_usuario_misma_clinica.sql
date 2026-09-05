-- Un cliente del portal no puede quedar vinculado a la ficha de otra clínica.
--
-- ⚠️ HALLAZGO (auditoría independiente, cadena F / I-9): `clientes_personal_update`
-- solo exige `clinica_id = auth_clinica_id() and auth_es_personal()` — sobre la
-- fila de `clientes`, nunca sobre a quién apunta `usuario_id`. Un empleado de
-- la clínica A que conociera el uuid de la cuenta de un cliente de la clínica
-- B podía hacer:
--
--   PATCH /rest/v1/clientes?id=eq.<ficha_de_A>
--   { "usuario_id": "<uuid_de_un_cliente_de_B>" }
--
-- y esa cuenta —que sigue siendo, sin saberlo, la del cliente de B— pasaría a
-- ver desde su portal el expediente de un paciente de A: sus mascotas, su
-- historial, sus recetas. Las dos rutas legítimas (`vincular_cuenta_portal()`,
-- `desvincular_cuenta_portal()`, y el `update` de `registro-portal`) nunca
-- tocan esto porque ya operan dentro de una sola clínica —la propia, la que
-- su RLS deja ver—, pero un `UPDATE` crudo por PostgREST no pasa por ellas.
--
-- Verificado antes de escribir esto: CERO filas existentes violan hoy la
-- invariante (`select count(*) from clientes c join usuarios u on u.id =
-- c.usuario_id where u.clinica_id is distinct from c.clinica_id` → 0), así
-- que este trigger no rompe ningún vínculo ya hecho.
--
-- ⚠️ **A propósito NO es `security definer`.** El trigger corre con los
-- privilegios de quien dispara la escritura, y eso es exactamente lo que hace
-- falta: para un miembro del personal, `usuarios_select` ya limita lo que ve
-- de `usuarios` a su propia clínica (`clinica_id = auth_clinica_id()`), así
-- que el `exists` de abajo solo puede encontrar una fila cuando el
-- `usuario_id` que intenta escribir pertenece a SU clínica — que es
-- justamente la comprobación que hace falta. Para `service_role`
-- (`registro-portal`) y para las dos RPC de vinculación, que no llevan
-- `security definer`, el chequeo se resuelve solo porque esas rutas ya
-- garantizan la consistencia antes de llegar aquí. Ponerle `security definer`
-- sería repetir con más privilegio una comprobación que ya funciona sin él.

create or replace function clientes_usuario_de_la_misma_clinica() returns trigger
  language plpgsql
  set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from usuarios
     where id = new.usuario_id
       and rol = 'cliente'
       and clinica_id = new.clinica_id
  ) then
    raise exception 'La cuenta de portal no pertenece a esta clínica' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_clientes_usuario_misma_clinica on clientes;
create trigger trg_clientes_usuario_misma_clinica
  before insert or update of usuario_id on clientes
  for each row
  when (new.usuario_id is not null)
  execute function clientes_usuario_de_la_misma_clinica();
