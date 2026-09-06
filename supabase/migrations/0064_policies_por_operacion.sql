-- Se acaban los `FOR ALL` de las tablas de dinero e inventario.
--
-- ⚠️ **ES LA MIGRACIÓN CON MÁS RIESGO DE REGRESIÓN DE TODO EL BLOQUE**, aunque
-- no sea la más complicada. Quitar un `FOR ALL` y sustituirlo por policies por
-- operación es exactamente donde se olvida una y algo deja de funcionar **sin
-- dar un error claro**: PostgREST devuelve una lista vacía o un 403 escueto, y
-- nadie relaciona eso con una policy.
--
-- Por eso el inventario de operaciones se hizo ANTES de escribir una línea,
-- contando las llamadas reales sobre `src/` y `supabase/functions/`:
--
--     turnos_caja            5 select · 1 insert · 1 update · 0 delete
--     movimientos_inventario 7 select · 1 insert · 0 update · 0 delete
--     petshop_devoluciones   3 select · 1 insert · 0 update · 0 delete
--     productos             19 select · 2 insert · 4 update · 0 delete
--
-- Las policies de abajo conceden **exactamente eso y nada más**.
--
-- =========================================================
-- Por qué `FOR ALL` era un problema y no solo desorden
-- =========================================================
-- `FOR ALL` concede las cuatro operaciones. En estas cuatro tablas eso
-- significaba conceder DELETE y UPDATE que ningún código usa — y de ahí salieron
-- dos de los agujeros de H-20: borrar un turno cerrado y modificar o borrar una
-- devolución. Los triggers de `0057`/`0058` ya los cierran; esto quita además el
-- permiso, que es la capa que debía haber estado desde el principio.
--
-- Y otro efecto, más silencioso: `productos_all` y `turnos_caja_all` **nunca
-- comprobaron el rol**. Hoy un `cliente` del portal queda fuera **por
-- accidente** —`registro-portal` no le asigna `sucursal_id`, así que
-- `sucursal_id = auth_sucursal_id()` compara null con null y deniega—, no por
-- un control. El día que cualquier flujo futuro le asignara una sucursal,
-- tendría inventario y caja. Es el hallazgo A-5/VUL-23, y se cierra aquí.

-- =========================================================
-- 1. turnos_caja: leer, abrir y cerrar. Nada más.
-- =========================================================
drop policy if exists "turnos_caja_all" on turnos_caja;

create policy "turnos_caja_select" on turnos_caja
  for select to authenticated
  using (clinica_id = auth_clinica_id() and auth_es_personal()
         and (auth_es_admin() or sucursal_id = auth_sucursal_id()));

create policy "turnos_caja_insert" on turnos_caja
  for insert to authenticated
  with check (clinica_id = auth_clinica_id() and auth_es_personal()
              and (auth_es_admin() or sucursal_id = auth_sucursal_id()));

-- El UPDATE es el cierre de caja (`cerrarTurno`). Lo que NO puede hacer es
-- tocar un turno ya cerrado: eso lo impide `trg_turno_cerrado_inmutable` (0057).
create policy "turnos_caja_update" on turnos_caja
  for update to authenticated
  using (clinica_id = auth_clinica_id() and auth_es_personal()
         and (auth_es_admin() or sucursal_id = auth_sucursal_id()))
  with check (clinica_id = auth_clinica_id() and auth_es_personal()
              and (auth_es_admin() or sucursal_id = auth_sucursal_id()));

-- Sin policy de DELETE: un turno no se borra. `trg_turno_no_se_borra` (0057) ya
-- lo bloquea; sin permiso ni siquiera se llega al trigger.

-- =========================================================
-- 2. movimientos_inventario: el kardex se lee y se escribe, no se corrige
-- =========================================================
drop policy if exists "movimientos_all" on movimientos_inventario;

-- Se conserva el `exists` sobre `productos` de `0002`, que es el patrón
-- correcto: la subconsulta corre bajo la RLS del que llama, así que obliga a
-- que el producto sea visible para él. De ahí sale también la coherencia de
-- inquilino sin necesidad de un trigger propio.
create policy "movimientos_select" on movimientos_inventario
  for select to authenticated
  using (clinica_id = auth_clinica_id() and auth_es_personal()
         and exists (select 1 from productos p
                      where p.id = movimientos_inventario.producto_id
                        and (auth_es_admin() or p.sucursal_id = auth_sucursal_id())));

create policy "movimientos_insert" on movimientos_inventario
  for insert to authenticated
  with check (clinica_id = auth_clinica_id() and auth_es_personal()
              and exists (select 1 from productos p
                           where p.id = movimientos_inventario.producto_id
                             and (auth_es_admin() or p.sucursal_id = auth_sucursal_id())));

-- Sin UPDATE ni DELETE: una corrección del kardex es un movimiento inverso.
-- `trg_kardex_inmutable` (0058) lo bloquea; esto quita el permiso.

-- =========================================================
-- 3. petshop_devoluciones: se registran, no se editan
-- =========================================================
drop policy if exists "petshop_devoluciones_escritura" on petshop_devoluciones;

create policy "petshop_devoluciones_insert" on petshop_devoluciones
  for insert to authenticated
  with check (clinica_id = auth_clinica_id() and auth_es_personal());

-- `petshop_devoluciones_lectura` (0030) se conserva tal cual: ya era `for
-- select` y ya llevaba `auth_es_personal()` desde `0045`.
-- Sin UPDATE ni DELETE: `trg_devolucion_inmutable` (0057) lo bloquea; esto
-- quita el permiso.

-- =========================================================
-- 4. productos: y por fin comprueba el rol
-- =========================================================
drop policy if exists "productos_all" on productos;

create policy "productos_select" on productos
  for select to authenticated
  using (clinica_id = auth_clinica_id() and auth_es_personal()
         and (auth_es_admin() or sucursal_id = auth_sucursal_id()));

create policy "productos_insert" on productos
  for insert to authenticated
  with check (clinica_id = auth_clinica_id() and auth_es_personal()
              and (auth_es_admin() or sucursal_id = auth_sucursal_id()));

create policy "productos_update" on productos
  for update to authenticated
  using (clinica_id = auth_clinica_id() and auth_es_personal()
         and (auth_es_admin() or sucursal_id = auth_sucursal_id()))
  with check (clinica_id = auth_clinica_id() and auth_es_personal()
              and (auth_es_admin() or sucursal_id = auth_sucursal_id()));

-- Sin DELETE, y no es una omisión: `eliminarProducto()` es **baja lógica**
-- (`update activo = false`). El propio código explica por qué: «un DELETE real
-- se llevaba por delante el kardex entero del producto». La policy ahora dice
-- lo mismo que el servicio.

-- ⚠️ El rol `cliente` del portal NO lee `productos` por ninguna vía: la vitrina
-- es `catalogo_productos`, con su propia policy. Verificado por grep antes de
-- añadir `auth_es_personal()` aquí.

-- =========================================================
-- 5. cobros_insert: mismo agujero de rol que productos
-- =========================================================
-- Pedía clínica y (admin ∨ sucursal), pero **no el rol**. Un `cliente` con
-- sucursal asignada podría insertar cobros. Hoy no la tiene; eso es un
-- accidente, no un control.
drop policy if exists "cobros_insert" on cobros;

create policy "cobros_insert" on cobros
  for insert to authenticated
  with check (clinica_id = auth_clinica_id() and auth_es_personal()
              and (auth_es_admin() or sucursal_id = auth_sucursal_id()));

-- =========================================================
-- 6. El stock solo se mueve por el kardex
-- =========================================================
-- Último agujero abierto del Bloque 1: aunque el kardex sea inmutable desde
-- `0058`, `UPDATE productos SET stock_actual = 999` seguía siendo posible y
-- **no dejaba ningún movimiento** que lo explicara. El inventario se podía
-- cuadrar a mano y la merma desaparecía.
--
-- Verificado antes de escribir esto: **ningún camino del código escribe
-- `stock_actual`**. El alta de producto lo deja en 0 a propósito —su propio
-- comentario dice que ponerlo ahí «lo contaba dos veces»— y la recepción de una
-- compra (`compras.ts`) sube el stock por `registrarMovimiento` y solo toca
-- `costo_bs` directamente. La única escritura legítima es la del trigger.
--
-- Se usa la misma técnica que `0063` para el `origen` de las líneas: una marca
-- de transacción que solo pone la función autorizada. Un cliente de PostgREST
-- no puede fijarla.
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

  -- ⭐ La marca: "este cambio de stock viene del kardex". Local a la
  -- transacción, y se apaga en cuanto termina el update.
  perform set_config('vetora.stock_por_kardex', 'on', true);

  if new.tipo = 'ingreso' then
    update productos set stock_actual = stock_actual + v_envases where id = new.producto_id;
  else
    update productos set stock_actual = stock_actual - v_envases where id = new.producto_id;
  end if;

  perform set_config('vetora.stock_por_kardex', 'off', true);

  return new;
end;
$$;

create or replace function stock_solo_por_kardex() returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
begin
  if new.stock_actual is not distinct from old.stock_actual then
    return new;
  end if;

  -- Salida para `respaldo-clinica`, que restaura `productos` con `service_role`
  -- y sin JWT. Misma salida que llevan los triggers de 0056–0059.
  if auth.uid() is null then
    return new;
  end if;

  if coalesce(current_setting('vetora.stock_por_kardex', true), 'off') = 'on' then
    return new;
  end if;

  raise exception
    'El stock no se edita a mano: se mueve registrando una entrada o una salida '
    'de inventario, para que quede el movimiento que lo explica.'
    using errcode = 'P0001';
end;
$$;

drop trigger if exists trg_stock_solo_por_kardex on productos;
create trigger trg_stock_solo_por_kardex
  before update on productos
  for each row execute function stock_solo_por_kardex();

-- =========================================================
-- Pruebas obligatorias antes de dar esto por bueno
-- =========================================================
--   turnos_caja      → abrir, leer, cerrar (permite) · borrar (rechaza)
--   movimientos      → leer, insertar (permite) · modificar, borrar (rechaza)
--   devoluciones     → leer, insertar (permite) · modificar, borrar (rechaza)
--   productos        → leer, crear, editar, dar de baja (permite) · borrar (rechaza)
--   productos.stock  → UPDATE directo (rechaza) · vía movimiento (permite)
--   cobros           → insertar como personal (permite)
--   Y con un rol de CLIENTE del portal: productos, turnos y movimientos → vacío
