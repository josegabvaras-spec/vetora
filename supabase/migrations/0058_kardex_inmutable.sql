-- El kardex de inventario deja de ser reescribible.
--
-- =========================================================
-- El problema
-- =========================================================
-- `movimientos_all` es `FOR ALL`, y `trg_aplicar_movimiento_inventario` es
-- **`AFTER INSERT` únicamente**. Ese trigger es, según documenta
-- `registrarMovimiento()`, «la única autoridad» sobre `productos.stock_actual`.
--
-- Consecuencia, VERIFICADA contra producción en transacción revertida: un
-- movimiento de egreso se puede **borrar**, y el stock descontado NO vuelve —
-- el trigger no dispara en DELETE. Queda un producto con el stock rebajado y
-- sin ningún movimiento que lo explique. El kardex y el stock se separan en
-- silencio, para siempre.
--
-- La cadena de fraude que cierra: vender, cobrar de menos o no cobrar, y
-- borrar el movimiento para que la merma no aparezca en `/movimientos`.
--
-- =========================================================
-- Riesgo de regresión: verificado como nulo
-- =========================================================
-- `grep` sobre `src/` y `supabase/functions/`: **cero** `.delete()` y cero
-- `.update()` sobre `movimientos_inventario`. El kardex hoy solo se inserta.
-- Y `eliminarProducto()` (`services/inventario.ts`) es **baja lógica**
-- (`update activo = false`), no un DELETE — el propio proyecto ya aprendió esa
-- lección: «un DELETE real se llevaba por delante el kardex entero del
-- producto». Así que ni siquiera esa vía dispara este trigger.
--
-- ⚠️ Mismo motivo que en `0057` para no bloquear el UPDATE en bloque: cuatro
-- FK de esta tabla son `on delete set null` (`cita_id`, `internacion_id`,
-- `lote_id`, `usuario_id`). Borrar una cita, un lote o un usuario emite un
-- UPDATE poniendo esa columna a null; rechazarlo haría imposible borrar a un
-- usuario que alguna vez movió stock. Se permite el paso a null, y solo eso.

create or replace function kardex_inmutable() returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    -- Salida para `eliminar-clinica`, igual que 0037 / 0049 / 0057.
    if not exists (select 1 from clinicas where id = old.clinica_id) then
      return old;
    end if;
    raise exception
      'Un movimiento de inventario no se puede borrar: el stock ya se ajustó y '
      'no volvería atrás. Registra el movimiento inverso.'
      using errcode = 'P0001';
  end if;

  if new.clinica_id     is distinct from old.clinica_id
     or new.producto_id is distinct from old.producto_id
     or new.tipo        is distinct from old.tipo
     or new.cantidad    is distinct from old.cantidad
     or new.motivo      is distinct from old.motivo
     or new.created_at  is distinct from old.created_at
     -- Estas cuatro solo pueden ir a null (cascada de FK), nunca a otro valor.
     or (new.cita_id        is distinct from old.cita_id        and new.cita_id        is not null)
     or (new.internacion_id is distinct from old.internacion_id and new.internacion_id is not null)
     or (new.lote_id        is distinct from old.lote_id        and new.lote_id        is not null)
     or (new.usuario_id     is distinct from old.usuario_id     and new.usuario_id     is not null)
  then
    raise exception
      'Un movimiento de inventario no se puede modificar: el stock se ajustó '
      'con los valores originales. Registra el movimiento inverso.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_kardex_inmutable on movimientos_inventario;
create trigger trg_kardex_inmutable
  before update or delete on movimientos_inventario
  for each row execute function kardex_inmutable();

-- =========================================================
-- Lo que esto NO arregla, para que no se dé por cerrado de más
-- =========================================================
-- El stock sigue pudiéndose mover por la puerta de al lado: `productos_all` es
-- `FOR ALL`, así que un `UPDATE productos SET stock_actual = 999` no pasa por
-- el kardex en absoluto. Eso es de la fase 5 del plan (partir las policies
-- `FOR ALL` y añadirles `auth_es_personal()`), no de esta migración.
