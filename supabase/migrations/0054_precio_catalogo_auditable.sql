-- Cada línea de cobro guarda el precio REAL del catálogo, además del cobrado.
--
-- ⚠️ HALLAZGO (F-07): `procesarVentaPOS()` ya no confía en el precio del
-- carrito (relee `productos.precio_bs` antes de insertar), pero eso vive en el
-- servicio. La base no tiene nada: `cobro_lineas` no tiene ningún trigger y
-- sus únicos checks son `>= 0`. Quien llame a PostgREST directamente con
-- credenciales de personal sigue pudiendo insertar una línea con el precio que
-- quiera, y hoy eso es **invisible**: el arqueo del turno cuadra igual, porque
-- lo esperado se calcula sobre lo registrado.
--
-- =========================================================
-- Por qué esto NO bloquea, y por qué un discriminador no servía
-- =========================================================
-- La idea obvia —una columna `origen` ('pos' | 'caja') y un trigger que exija
-- precio de catálogo solo en las del POS— **no es una barrera**: esa columna
-- la escribiría el mismo cliente que está falsificando el precio. Bastaría
-- mandar `origen: 'caja'`.
--
-- Y no hay otra forma de distinguirlas. `aplicarAjustes()` en
-- [services/caja.ts](../../src/services/caja.ts) permite **a propósito** que
-- un operador fije el importe de una línea de consumo en una consulta — está
-- documentado ahí mismo: «un operador puede fijar el precio, que es la
-- funcionalidad». Esas líneas llevan `producto_id`, igual que las del POS, y
-- su `movimiento_id` **no se persiste**. Para la base, las dos clases de
-- línea son idénticas.
--
-- Así que bloquear por producto rompería una función real del negocio. Lo que
-- sí se puede hacer es que deje de ser invisible: guardar, junto a lo cobrado,
-- **lo que el catálogo decía en ese momento**. Una venta por debajo del
-- catálogo pasa de indetectable a consultable, sin impedir ningún cobro
-- legítimo.

alter table cobro_lineas add column if not exists precio_catalogo_bs numeric(12, 2);

comment on column cobro_lineas.precio_catalogo_bs is
  'Precio que tenía el producto o servicio en su catálogo al cobrar. Lo escribe '
  'trg_precio_catalogo, nunca el cliente. Null en líneas sin producto ni '
  'servicio (conceptos sueltos) y en las anteriores a 0054.';

-- ⚠️ `security definer` a propósito, y es lo que hace que esto valga algo.
--
-- Si corriera con los privilegios de quien inserta, `productos_all` filtraría:
-- un usuario de recepción con sucursal asignada no ve los productos de otra
-- sucursal de su misma clínica, así que el trigger no encontraría la fila y
-- guardaría null — un hueco justo donde hace falta el dato. Con
-- `security definer` el precio se lee siempre, y **se toma de la base, no del
-- INSERT**: `new.precio_catalogo_bs` se pisa aunque venga rellenado desde
-- fuera. Ese es el punto entero: un valor que el cliente pudiera escribir
-- sería tan falsificable como el precio que pretende auditar.
create or replace function precio_catalogo_de_la_linea() returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
begin
  if new.producto_id is not null then
    select p.precio_bs into new.precio_catalogo_bs
      from productos p where p.id = new.producto_id;
  elsif new.servicio_id is not null then
    select s.precio_bs into new.precio_catalogo_bs
      from servicios s where s.id = new.servicio_id;
  else
    -- Concepto suelto (un suplemento de peluquería, un cargo manual): no hay
    -- catálogo contra el que comparar, y null dice exactamente eso.
    new.precio_catalogo_bs := null;
  end if;

  return new;
end;
$$;

-- Solo INSERT: `cobro_lineas` no tiene policy de UPDATE ni DELETE — es
-- insert-only por diseño (ver la tabla de invariantes de CLAUDE.md).
drop trigger if exists trg_precio_catalogo on cobro_lineas;
create trigger trg_precio_catalogo
  before insert on cobro_lineas
  for each row execute function precio_catalogo_de_la_linea();

-- =========================================================
-- Cómo se consulta lo que esto captura
-- =========================================================
-- Las líneas cobradas por debajo de su catálogo, del mes en curso:
--
--   select co.created_at, cl.concepto, cl.cantidad,
--          cl.precio_catalogo_bs, cl.precio_unitario_bs,
--          (cl.precio_catalogo_bs - cl.precio_unitario_bs) as diferencia_bs,
--          u.nombre as cobro_registrado_por
--     from cobro_lineas cl
--     join cobros co on co.id = cl.cobro_id
--     left join usuarios u on u.id = co.usuario_id
--    where cl.precio_catalogo_bs is not null
--      and cl.precio_unitario_bs < cl.precio_catalogo_bs
--      and co.created_at >= date_trunc('month', now() at time zone 'America/La_Paz')
--    order by diferencia_bs desc;
--
-- ⚠️ Una diferencia NO es un fraude: `aplicarAjustes()` produce diferencias
-- legítimas todos los días, y un descuento acordado también. Lo que da es algo
-- que mirar, que antes no existía.
--
-- Las filas anteriores a esta migración quedan con `precio_catalogo_bs` null y
-- no se rellenan: el precio del catálogo de entonces no se puede reconstruir
-- —`productos.precio_bs` es el de hoy—, e inventarlo sería peor que no tenerlo.
