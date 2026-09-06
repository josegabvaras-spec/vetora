-- De dónde salió el precio de cada línea, y qué se puede bloquear con eso.
--
-- =========================================================
-- El problema que esto resuelve, y el que NO
-- =========================================================
-- Desde `0054`, `cobro_lineas.precio_catalogo_bs` guarda lo que el catálogo
-- decía al cobrar. Pero nunca se pudo **bloquear** una desviación, y el motivo
-- está documentado en H-13: `aplicarAjustes()` (`services/caja.ts`) permite **a
-- propósito** que un operador fije el importe de una línea de consulta —«un
-- operador puede fijar el precio, que es la funcionalidad», dice su propio
-- comentario— y esas líneas son **idénticas en el esquema** a una línea de POS
-- falsificada: mismo `producto_id`, mismo `subtotal_bs`, y el `movimiento_id`
-- que las distinguiría no se persiste.
--
-- `origen` es ese discriminador. Y la parte importante:
--
--   ⚠️ **NO se acepta del cliente. Nunca.** Si `origen` viajara en el INSERT,
--   bastaría con mandar `origen = 'ajuste_manual'` para saltarse cualquier
--   bloqueo, y el discriminador no discriminaría nada. Lo escribe el trigger,
--   pisando siempre lo que venga.
--
-- ¿Y cómo sabe el trigger que una línea viene del camino verificado? Por una
-- **marca de transacción** que solo `registrar_venta_pos()` puede poner
-- (`set_config(..., true)` = local a la transacción). Un cliente de PostgREST
-- no puede fijar esa variable: no hay ninguna función expuesta que lo haga.
--
-- =========================================================
-- Lo que esto NO cierra, dicho antes de que alguien lo dé por cerrado
-- =========================================================
-- Un INSERT crudo en `cobro_lineas` con un precio inventado sigue siendo
-- posible: cae como `ajuste_manual`, que por definición no se bloquea. Lo que
-- cambia es que **deja de ser invisible** y queda separado de lo que el
-- servidor sí verificó.
--
-- Cerrarlo del todo exige migrar `registrarCobro` y `registrarVentaDirecta`
-- (`caja.ts`) a funciones de servidor, como ya está el POS desde `0062`. Ese es
-- el resto del trabajo transaccional, no esta migración.

-- =========================================================
-- 1. La columna
-- =========================================================
alter table cobro_lineas add column if not exists origen text
  check (origen in ('catalogo', 'ajuste_manual', 'servicio', 'suplemento'));

comment on column cobro_lineas.origen is
  'De dónde salió el precio. Lo fija trg_precio_catalogo, NUNCA el cliente. '
  '"catalogo" = lo calculó registrar_venta_pos() releyendo productos, y el '
  'trigger exige que subtotal_bs = precio_catalogo_bs x cantidad. '
  '"ajuste_manual" = línea de producto cuyo precio el servidor no vouchea '
  '(aplicarAjustes, venta directa, o un INSERT crudo). "servicio" y '
  '"suplemento" son las otras dos formas legítimas de línea.';

-- Backfill: todo lo anterior a esta migración no pasó por el camino
-- verificado, así que se clasifica por su forma y NO como 'catalogo'. Decir
-- que una línea histórica está verificada cuando nadie la verificó sería
-- exactamente el tipo de dato que hace inútil un control.
update cobro_lineas
   set origen = case
                  when producto_id is not null then 'ajuste_manual'
                  when servicio_id is not null then 'servicio'
                  else 'suplemento'
                end
 where origen is null;

-- =========================================================
-- 2. El trigger: fija `origen` y bloquea la desviación cuando puede
-- =========================================================
-- Sustituye a la función de `0054`, que solo rellenaba `precio_catalogo_bs`.
create or replace function precio_catalogo_de_la_linea() returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_verificada boolean;
  v_esperado numeric;
begin
  -- ---------- El precio de referencia, igual que en 0054 ----------
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

  -- ---------- El origen: del servidor, no del cliente ----------
  -- `current_setting(..., true)` devuelve null si la variable no existe, en vez
  -- de reventar. Solo `registrar_venta_pos()` la pone, y solo dentro de su
  -- propia transacción.
  v_verificada := coalesce(current_setting('vetora.linea_verificada', true), 'off') = 'on';

  if v_verificada and new.producto_id is not null then
    new.origen := 'catalogo';
  elsif new.producto_id is not null then
    new.origen := 'ajuste_manual';
  elsif new.servicio_id is not null then
    new.origen := 'servicio';
  else
    new.origen := 'suplemento';
  end if;

  -- ---------- Y solo ahí se puede bloquear ----------
  -- Una línea marcada 'catalogo' la produjo el servidor releyendo el precio, así
  -- que cualquier desviación es un error de programación, no una decisión de
  -- negocio. Se rechaza. En 'ajuste_manual' NO se bloquea: ahí el operador
  -- fijando el precio es la funcionalidad.
  if new.origen = 'catalogo' and new.precio_catalogo_bs is not null then
    v_esperado := round(new.precio_catalogo_bs * new.cantidad, 2);
    if abs(new.subtotal_bs - v_esperado) > 0.01 then
      raise exception
        'Línea de catálogo con precio alterado: Bs. % cuando el catálogo da Bs. %',
        new.subtotal_bs, v_esperado
        using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

-- =========================================================
-- 3. La venta del POS marca sus líneas como verificadas
-- =========================================================
-- Se recrea `registrar_venta_pos()` con una sola línea nueva: la marca de
-- transacción, puesta justo antes de insertar las líneas. Todo lo demás es
-- idéntico a `0062`.
--
-- ⚠️ `create or replace` conserva el ACL. Si algún día hay que cambiar el tipo
-- de retorno y toca `drop` + `create`, hay que **volver a revocar de PUBLIC y
-- de anon en la misma migración** (trampa de `0047` y `0055`).
create or replace function registrar_venta_pos(
  p_sucursal_id uuid,
  p_items jsonb,
  p_metodo_pago text,
  p_cliente_nombre text default null,
  p_promocion_id uuid default null,
  p_descuento_bs numeric default 0,
  p_descuento_motivo text default null,
  p_idempotency_key uuid default null
) returns jsonb
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_clinica uuid;
  v_turno uuid;
  v_cobro uuid;
  v_existente record;
  v_item jsonb;
  v_producto record;
  v_cantidad numeric;
  v_subtotal numeric := 0;
  v_linea_subtotal numeric;
  v_descuento numeric := 0;
  v_total numeric;
  v_promo record;
  v_incluidos jsonb;
  v_lote_id uuid;
  v_lotes_tocados int;
  v_creado timestamptz;
begin
  v_clinica := auth_clinica_id();
  if v_clinica is null then
    raise exception 'Sesión sin clínica: no se puede registrar una venta' using errcode = 'P0001';
  end if;

  if not auth_es_personal() then
    raise exception 'No tienes permiso para registrar ventas' using errcode = 'P0001';
  end if;

  if not exists (select 1 from sucursales
                  where id = p_sucursal_id and clinica_id = v_clinica) then
    raise exception 'La sucursal no pertenece a esta clínica' using errcode = 'P0001';
  end if;

  if not (auth_es_admin() or p_sucursal_id = auth_sucursal_id()) then
    raise exception 'No tienes permiso para vender en esta sucursal' using errcode = 'P0001';
  end if;

  if p_idempotency_key is not null then
    select id, monto_bs, descuento_bs, created_at into v_existente
      from cobros
     where clinica_id = v_clinica and idempotency_key = p_idempotency_key;

    if found then
      return jsonb_build_object(
        'cobro_id', v_existente.id,
        'total_bs', v_existente.monto_bs,
        'descuento_bs', v_existente.descuento_bs,
        'created_at', v_existente.created_at,
        'reenvio', true
      );
    end if;
  end if;

  select id into v_turno
    from turnos_caja
   where sucursal_id = p_sucursal_id and estado = 'abierto'
   limit 1;

  if v_turno is null then
    raise exception 'No hay un turno de caja abierto en esta sucursal. Abre la caja antes de vender.'
      using errcode = 'P0001';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El carrito de venta está vacío' using errcode = 'P0001';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_cantidad := coalesce((v_item->>'cantidad')::numeric, 0);
    if v_cantidad <= 0 then
      raise exception 'La cantidad de cada producto debe ser mayor a 0' using errcode = 'P0001';
    end if;

    select id, nombre, precio_bs, activo,
           coalesce(nullif(contenido_presentacion, 0), 1) as contenido,
           stock_actual
      into v_producto
      from productos
     where id = (v_item->>'producto_id')::uuid
       and clinica_id = v_clinica;

    if not found then
      raise exception 'Un producto del carrito no existe o no pertenece a esta clínica'
        using errcode = 'P0001';
    end if;
    if not v_producto.activo then
      raise exception 'El producto "%" está dado de baja', v_producto.nombre using errcode = 'P0001';
    end if;
    if v_cantidad > v_producto.stock_actual then
      raise exception 'Stock insuficiente de "%": quedan %', v_producto.nombre, v_producto.stock_actual
        using errcode = 'P0001';
    end if;

    v_subtotal := v_subtotal + round(v_producto.precio_bs * v_cantidad, 2);
  end loop;

  if p_promocion_id is not null then
    select * into v_promo from petshop_promociones
     where id = p_promocion_id and clinica_id = v_clinica;

    if not found then
      raise exception 'La promoción no pertenece a esta clínica' using errcode = 'P0001';
    end if;
    if not v_promo.activo then
      raise exception 'La promoción "%" no está activa', v_promo.titulo using errcode = 'P0001';
    end if;
    if current_date < v_promo.fecha_inicio or current_date > v_promo.fecha_fin then
      raise exception 'La promoción "%" está fuera de fecha', v_promo.titulo using errcode = 'P0001';
    end if;
    if v_promo.limite_uso is not null and v_promo.usos_actuales >= v_promo.limite_uso then
      raise exception 'La promoción "%" agotó sus % usos', v_promo.titulo, v_promo.limite_uso
        using errcode = 'P0001';
    end if;

    if v_promo.tipo = 'porcentaje' then
      v_descuento := round(v_subtotal * v_promo.valor_descuento / 100, 2);
    elsif v_promo.tipo in ('monto_fijo', 'cupon') then
      v_descuento := least(v_subtotal, v_promo.valor_descuento);
    elsif v_promo.tipo = 'dos_por_uno' then
      v_incluidos := coalesce(v_promo.condiciones->'productos_incluidos', '[]'::jsonb);
      for v_item in select * from jsonb_array_elements(p_items) loop
        if jsonb_array_length(v_incluidos) = 0
           or v_incluidos ? (v_item->>'producto_id') then
          select precio_bs into v_producto
            from productos where id = (v_item->>'producto_id')::uuid;
          v_descuento := v_descuento + round(
            floor(coalesce((v_item->>'cantidad')::numeric, 0) / 2) * v_producto.precio_bs, 2);
        end if;
      end loop;
      v_descuento := least(v_descuento, v_subtotal);
    else
      v_descuento := 0;
    end if;

  elsif coalesce(p_descuento_bs, 0) > 0 then
    v_descuento := least(round(p_descuento_bs, 2), v_subtotal);
  end if;

  v_total := round(v_subtotal - v_descuento, 2);
  if v_total <= 0 then
    raise exception 'El total de la venta debe ser mayor a 0' using errcode = 'P0001';
  end if;

  insert into cobros(clinica_id, sucursal_id, turno_id, usuario_id, monto_bs,
                     descuento_bs, promocion_id, descuento_motivo,
                     metodo_pago, cliente_nombre, idempotency_key)
       values (v_clinica, p_sucursal_id, v_turno, auth.uid(), v_total,
               v_descuento, p_promocion_id, nullif(btrim(coalesce(p_descuento_motivo, '')), ''),
               p_metodo_pago, coalesce(nullif(btrim(coalesce(p_cliente_nombre, '')), ''), 'Cliente Ocasional'),
               p_idempotency_key)
    returning id, created_at into v_cobro, v_creado;

  -- ⭐ LA LÍNEA NUEVA DE ESTA MIGRACIÓN.
  -- Marca la transacción como "el precio de estas líneas lo puso el servidor".
  -- `true` = local a la transacción: se desvanece al terminar, y ningún otro
  -- camino puede ponerla. `trg_precio_catalogo` la lee para decidir el `origen`.
  perform set_config('vetora.linea_verificada', 'on', true);

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_cantidad := (v_item->>'cantidad')::numeric;

    select id, nombre, precio_bs, coalesce(nullif(contenido_presentacion, 0), 1) as contenido
      into v_producto
      from productos
     where id = (v_item->>'producto_id')::uuid and clinica_id = v_clinica;

    v_linea_subtotal := round(v_producto.precio_bs * v_cantidad, 2);

    insert into cobro_lineas(clinica_id, cobro_id, concepto, cantidad,
                             precio_unitario_bs, subtotal_bs, producto_id)
         values (v_clinica, v_cobro, v_producto.nombre, v_cantidad,
                 v_producto.precio_bs, v_linea_subtotal, v_producto.id);

    insert into movimientos_inventario(clinica_id, producto_id, tipo, cantidad, motivo, usuario_id)
         values (v_clinica, v_producto.id, 'egreso',
                 v_cantidad * v_producto.contenido, 'Venta Pet Shop', auth.uid());

    v_lote_id := nullif(v_item->>'lote_id', '')::uuid;
    if v_lote_id is not null then
      update producto_lotes
         set cantidad_actual = greatest(0, cantidad_actual - v_cantidad)
       where id = v_lote_id and clinica_id = v_clinica;

      get diagnostics v_lotes_tocados = row_count;
      if v_lotes_tocados = 0 then
        raise exception 'El lote indicado no pertenece a esta clínica' using errcode = 'P0001';
      end if;
    end if;
  end loop;

  -- Se apaga en cuanto se termina de escribir las líneas, para que nada de lo
  -- que venga después en la misma transacción herede la marca.
  perform set_config('vetora.linea_verificada', 'off', true);

  return jsonb_build_object(
    'cobro_id', v_cobro,
    'total_bs', v_total,
    'subtotal_bs', v_subtotal,
    'descuento_bs', v_descuento,
    'created_at', v_creado,
    'reenvio', false
  );
end;
$$;

-- =========================================================
-- 4. Para que alguien MIRE las desviaciones
-- =========================================================
-- El dato existe desde `0054` y **nadie lo ha visto nunca**: hacía falta
-- escribir SQL. Un control que nadie mira no es un control. Esta vista lo pone
-- al alcance de una consulta normal, bajo la RLS de quien la lee.
--
-- `security_invoker = true` es lo que hace que la vista NO se salte la RLS: sin
-- eso, una vista corre con los privilegios de su dueño y se convierte en el
-- agujero de aislamiento más clásico de PostgreSQL. La fase 4 de la auditoría
-- verificó que este proyecto no tenía ninguna vista; la primera que se crea
-- entra con el invoker puesto.
create or replace view desviaciones_de_precio
  with (security_invoker = true)
as
select l.id            as linea_id,
       l.cobro_id,
       l.clinica_id,
       c.sucursal_id,
       c.created_at    as fecha,
       c.usuario_id,
       l.concepto,
       l.cantidad,
       l.subtotal_bs,
       l.precio_catalogo_bs,
       round(l.precio_catalogo_bs * l.cantidad, 2) as esperado_bs,
       round(l.subtotal_bs - (l.precio_catalogo_bs * l.cantidad), 2) as diferencia_bs,
       l.origen
  from cobro_lineas l
  join cobros c on c.id = l.cobro_id
 where l.precio_catalogo_bs is not null
   and abs(l.subtotal_bs - (l.precio_catalogo_bs * l.cantidad)) > 0.01;

comment on view desviaciones_de_precio is
  'Líneas cobradas por un importe distinto del catálogo. ⚠️ Una diferencia NO '
  'es un fraude: los ajustes de caja y los descuentos acordados producen '
  'diferencias legítimas a diario. Es algo que mirar, que antes no existía.';

-- ⚠️ El `revoke` a `authenticated` NO sobra, aunque luego se le conceda
-- `select`. Supabase concede **todos** los privilegios a `authenticated` sobre
-- lo que se crea en `public`, así que un `grant select` a secas solo AÑADE y la
-- vista se queda con `arwdDxtm` — insert, update y delete incluidos. Hoy es
-- inerte (una vista con `join` no es actualizable en PostgreSQL), pero deja de
-- serlo el día que alguien la simplifique a una sola tabla. Revocar primero y
-- conceder después es lo único que deja el privilegio en lo que dice el código.
revoke all on desviaciones_de_precio from public;
revoke all on desviaciones_de_precio from anon;
revoke all on desviaciones_de_precio from authenticated;
grant select on desviaciones_de_precio to authenticated;

-- =========================================================
-- Pruebas
-- =========================================================
--   · Venta por el POS → las líneas quedan con origen='catalogo'
--   · INSERT crudo de una línea de producto → origen='ajuste_manual' aunque se
--     mande origen='catalogo' en el cuerpo
--   · INSERT crudo marcándose 'catalogo' con precio alterado → no puede: el
--     trigger le pone 'ajuste_manual', así que no se bloquea, pero SALE en
--     `desviaciones_de_precio`
--   · Línea de servicio → origen='servicio'; suplemento suelto → 'suplemento'
--   · La vista no deja ver líneas de otra clínica (security_invoker)
