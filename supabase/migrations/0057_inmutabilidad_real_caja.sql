-- Cerrar los dos huecos que `0056` dejó abiertos.
--
-- `0056` puso triggers `before insert` (cobros, devoluciones) y `before update`
-- (turnos). Pero las policies de esas tablas son `FOR ALL` — incluyen DELETE, y
-- en `petshop_devoluciones` también UPDATE. Un trigger que valida el INSERT no
-- dice nada de lo que pase con esa fila después. Se puso el candado en la
-- puerta y se dejó la ventana abierta.
--
-- Los dos ataques están VERIFICADOS contra producción, en transacción revertida:
--
--   1. Devolución legítima de 1 unidad por Bs. 10  → el trigger la aprueba.
--      Acto seguido, `UPDATE ... SET cantidad = 500, monto_devuelto_bs = 5000`
--      → PASA. La fila queda en 500 unidades. Toda la validación de `0056` se
--      esquiva insertando algo válido y corrigiéndolo al alza.
--   2. Turno CERRADO con `diferencia_bs = -300` (un faltante ya detectado y
--      firmado) → `DELETE` → PASA. No se reescribe la evidencia: se borra la
--      fila entera.
--
-- Lo único que hoy acota el segundo es el FK `cobros.turno_id → turnos_caja`
-- con `NO ACTION`: si el turno tiene cobros, PostgreSQL bloquea el borrado
-- (verificado). O sea que el ataque funciona justo sobre el turno que alguien
-- querría hacer desaparecer: el que abrió, no facturó y cerró descuadrado.
--
-- =========================================================
-- Riesgo de regresión: verificado como nulo antes de escribir esto
-- =========================================================
-- `grep` sobre `src/` y `supabase/functions/`: **cero** llamadas `.delete()`
-- sobre `turnos_caja` y `petshop_devoluciones`, y cero `.update()` sobre
-- `petshop_devoluciones`. Ninguna pantalla de Vetora hace hoy lo que estos
-- triggers bloquean. Los únicos DELETE que alcanzan estas tablas son cascadas
-- de `eliminar-clinica`, que llevan su salida explícita más abajo.

-- =========================================================
-- 1) Un turno de caja no se borra. Nunca.
-- =========================================================
-- Se bloquean TODOS los borrados, no solo los de turnos cerrados. El motivo es
-- que un turno abierto por error tampoco debe desaparecer: se cierra con saldo
-- cero, que es la corrección contable correcta y la que el dueño del producto
-- eligió para toda la caja («un error se corrige con un asiento nuevo»). Y
-- porque no cuesta nada: no existe ninguna pantalla que borre turnos.
create or replace function turno_no_se_borra() returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
begin
  -- Salida para `eliminar-clinica`: una cascada SÍ dispara los triggers de la
  -- tabla hija, así que sin esto dar de baja una clínica sería imposible. Es
  -- el mismo escape que ya llevan `trg_cliente_sin_expediente` (0037) y
  -- `trg_paciente_sin_caja` (0049).
  if not exists (select 1 from clinicas where id = old.clinica_id) then
    return old;
  end if;

  raise exception
    'Un turno de caja no se puede borrar: es el registro del arqueo. '
    'Si se abrió por error, ciérralo con saldo cero.'
    using errcode = 'P0001';
end;
$$;

drop trigger if exists trg_turno_no_se_borra on turnos_caja;
create trigger trg_turno_no_se_borra
  before delete on turnos_caja
  for each row execute function turno_no_se_borra();

-- =========================================================
-- 2) Una devolución registrada no se toca
-- =========================================================
-- ⚠️ El UPDATE no se bloquea en bloque, y la razón es concreta: varias FK de
-- esta tabla son `on delete set null` (`usuario_id`, `autorizado_por`,
-- `cobro_id`). Cuando `eliminar-usuario` borra a alguien que registró una
-- devolución, PostgreSQL emite un UPDATE poniendo esa columna a null — y un
-- trigger que rechace cualquier UPDATE haría **imposible borrar a ese
-- usuario**, con un error que no explicaría nada.
--
-- Por eso se comparan las columnas MATERIALES una a una, y se permite
-- únicamente el paso a null de las FK (que es lo que hace la cascada). Poner
-- `usuario_id` a OTRO usuario sigue estando prohibido: eso sería falsificar la
-- autoría, no limpiar una referencia rota.
create or replace function devolucion_inmutable() returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from clinicas where id = old.clinica_id) then
      return old;
    end if;
    raise exception
      'Una devolución registrada no se puede borrar: mueve stock y dinero. '
      'Si fue un error, registra el movimiento inverso.'
      using errcode = 'P0001';
  end if;

  if new.clinica_id           is distinct from old.clinica_id
     or new.sucursal_id       is distinct from old.sucursal_id
     or new.producto_id       is distinct from old.producto_id
     or new.cantidad          is distinct from old.cantidad
     or new.motivo            is distinct from old.motivo
     or new.estado_producto   is distinct from old.estado_producto
     or new.monto_devuelto_bs is distinct from old.monto_devuelto_bs
     or new.created_at        is distinct from old.created_at
     -- Estas tres solo pueden ir a null (cascada de FK), nunca a otro valor.
     or (new.cobro_id       is distinct from old.cobro_id       and new.cobro_id       is not null)
     or (new.usuario_id     is distinct from old.usuario_id     and new.usuario_id     is not null)
     or (new.autorizado_por is distinct from old.autorizado_por and new.autorizado_por is not null)
  then
    raise exception
      'Una devolución registrada no se puede modificar. Si el importe o la '
      'cantidad estaban mal, registra una devolución correctiva.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_devolucion_inmutable on petshop_devoluciones;
create trigger trg_devolucion_inmutable
  before update or delete on petshop_devoluciones
  for each row execute function devolucion_inmutable();

-- =========================================================
-- Pruebas que deben pasar de PERMITE a RECHAZA
-- =========================================================
--   · UPDATE de una devolución a 500 unidades / Bs. 5.000   → RECHAZA
--   · DELETE de una devolución registrada                    → RECHAZA
--   · DELETE de un turno cerrado con descuadre               → RECHAZA
--   · DELETE de un turno abierto                             → RECHAZA
-- Y las que deben seguir funcionando igual:
--   · INSERT de una devolución válida                        → PERMITE
--   · Cerrar un turno abierto (abierto → cerrado)            → PERMITE
--   · `eliminar-usuario` sobre alguien con devoluciones      → PERMITE (set null)
--   · `eliminar-clinica` completo                            → PERMITE (cascada)
