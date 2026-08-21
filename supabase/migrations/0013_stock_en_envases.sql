-- El stock se cuenta en ENVASES; los movimientos siguen en la unidad de medida.
--
-- Hasta ahora `stock_actual` y `movimientos_inventario.cantidad` estaban en la
-- misma unidad, así que un frasco de 50 ml había que registrarlo como "50" y el
-- inventario no sabía cuántos frascos había, solo cuántos mililitros sueltos.
--
-- El reparto pasa a ser:
--
--   movimientos_inventario.cantidad  →  unidad de medida (ml, g, unidad)
--   productos.stock_actual           →  ENVASES, con fracción
--
-- y quien convierte es el trigger, dividiendo por `contenido_presentacion`.
--
-- ⚠️ Se eligió que el MOVIMIENTO siga en ml, y no en envases, porque
--    `precio_bs` es el precio por unidad de medida y toda la caja calcula
--    `precio_bs * cantidad` (services/caja.ts). Guardar el movimiento en
--    envases habría dado 0.1 × precio_del_ml: cobros mal por dos órdenes de
--    magnitud. Así el cobro sigue siendo correcto sin tocar una línea de caja,
--    y el kardex sigue diciendo "5 ml", que es lo que de verdad se aplicó.

-- =========================================================
-- 1. El stock necesita decimales de sobra
-- =========================================================
-- En envases, una dosis pequeña es una fracción larga: 1 ml de un frasco de 30
-- es 0.0333…, y con numeric(12,2) se redondeaba a 0.03. Aplicando 30 dosis de
-- 1 ml el frasco se habría "acabado" con 0.10 envases todavía en la ficha.
alter table productos
  alter column stock_actual type numeric(14, 4),
  alter column stock_minimo type numeric(14, 4);

-- =========================================================
-- 2. El trigger convierte dosis → envases
-- =========================================================
-- Sigue siendo `security definer` por la misma razón que en 0002: el update de
-- `productos` no puede depender de las policies de quien inserta el movimiento.
create or replace function aplicar_movimiento_inventario()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_contenido numeric;
  v_envases numeric;
begin
  -- `nullif(...,0)` evita una división por cero si algún producto quedó con
  -- contenido 0; con 1 el comportamiento es el de antes (dosis = envase).
  select coalesce(nullif(contenido_presentacion, 0), 1)
    into v_contenido
    from productos
   where id = new.producto_id;

  v_envases := new.cantidad / coalesce(v_contenido, 1);

  if new.tipo = 'ingreso' then
    update productos set stock_actual = stock_actual + v_envases where id = new.producto_id;
  else
    update productos set stock_actual = stock_actual - v_envases where id = new.producto_id;
  end if;
  return new;
end;
$$;

-- El trigger no se recrea: `create or replace function` basta, y
-- `trg_aplicar_movimiento_inventario` ya apunta a esta función desde 0001.
