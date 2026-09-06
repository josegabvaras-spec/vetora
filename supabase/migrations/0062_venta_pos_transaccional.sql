-- La venta del POS pasa a ser UNA transacción, en el servidor.
--
-- ⚠️⚠️ ES EL CAMBIO DE MAYOR RIESGO DE TODO EL BLOQUE 1. ⚠️⚠️
-- Reescribe el camino por el que la clínica factura. Si falla, no se vende.
-- Esta migración **solo crea la función**: nadie la llama hasta que
-- `services/pos.ts` se migre, y eso es un paso aparte y reversible.
--
-- =========================================================
-- El problema (paso 8 del encargo)
-- =========================================================
-- `procesarVentaPOS` hace, desde el navegador y sin ninguna transacción:
--
--   insert cobros                      ← si falla, se corta (bien)
--     por cada ítem:
--       insert cobro_lineas            ← ⚠️ SIN comprobar el error
--       insert movimientos_inventario  ← el trigger ajusta el stock
--       update producto_lotes          ← ⚠️ SIN comprobar el error
--
-- Estados parciales posibles hoy, todos silenciosos:
--
--   · **Cobro sin líneas.** El insert de `cobro_lineas` descarta su `error`.
--     Si falla, queda un cobro cobrado, con su `monto_bs`, y sin una sola línea
--     que lo justifique. Misma clase que H-6.
--   · **Cobro completo con stock a medias**, si el egreso revienta a mitad del
--     bucle: los ítems ya procesados salieron del inventario y los siguientes
--     no.
--   · **Lote descontado dos veces o ninguna**: el `update producto_lotes` es un
--     read-modify-write desde el navegador (`Math.max(0, actual - cantidad)`)
--     sin bloqueo; dos ventas simultáneas del mismo lote se pisan.
--
-- `registrarVentaDirecta` ya lo sabía y lo dejó escrito:
--   «No es atomicidad real: para eso haría falta una función security definer
--    que hiciera cobro y egresos en una sola transacción.»
-- Esto es esa función.
--
-- =========================================================
-- Qué deja de decidir el navegador
-- =========================================================
--   · el precio unitario  → se lee de `productos`
--   · el subtotal y el total → se calculan aquí
--   · el importe del descuento por promoción → se calcula aquí, contra el
--     carrito real (esto cierra el hueco de `dos_por_uno` que `0060` no podía
--     verificar: un trigger sobre `cobros` no ve las líneas, esta función sí)
--   · la autoría → `auth.uid()`
--   · la clínica → `auth_clinica_id()`
--
-- Lo que sigue decidiendo, porque es la funcionalidad: qué productos, cuántas
-- unidades, qué promoción, método de pago y el descuento manual (con motivo).
--
-- =========================================================
-- ⚠️ Semántica de cantidades: replicada EXACTAMENTE, no "arreglada"
-- =========================================================
-- Según `0013`, el reparto vigente es:
--     movimientos_inventario.cantidad → unidad de medida (ml, g, unidad)
--     productos.stock_actual          → ENVASES, y el trigger convierte
--
-- `procesarVentaPOS` recibe `cantidad` en **envases** y por eso registra el
-- movimiento como `envases × contenido_presentacion`. Aquí se hace igual.
-- El precio se multiplica por los **envases**, también como hoy.
--
-- ⚠️ Hay una ambigüedad heredada que esta función NO toca a propósito: `0013`
-- dice que `precio_bs` es «el precio por unidad de medida», y el POS lo
-- multiplica por envases. Para el petshop —donde `contenido_presentacion` es 1
-- y envase = unidad— da lo mismo, que es su caso de uso. Cambiarlo alteraría lo
-- que las clínicas cobran, así que es una decisión de negocio aparte, no algo
-- que deba colarse dentro de una corrección de seguridad.

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
  -- ---------- 1. Identidad y permiso, del JWT y solo del JWT ----------
  v_clinica := auth_clinica_id();
  if v_clinica is null then
    raise exception 'Sesión sin clínica: no se puede registrar una venta' using errcode = 'P0001';
  end if;

  -- `security definer` se salta la RLS, así que la autorización se comprueba
  -- aquí a mano. Se replica la condición de `cobros_insert` y se le AÑADE
  -- `auth_es_personal()`, que la policy no exige: esta función no puede ser
  -- una puerta más ancha que el INSERT directo que sustituye.
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

  -- ---------- 2. Idempotencia: ANTES de tocar nada ----------
  if p_idempotency_key is not null then
    select id, monto_bs, descuento_bs, created_at into v_existente
      from cobros
     where clinica_id = v_clinica and idempotency_key = p_idempotency_key;

    if found then
      -- Reenvío (doble clic, reintento de red): se devuelve la venta original
      -- sin crear una segunda ni volver a descontar stock.
      return jsonb_build_object(
        'cobro_id', v_existente.id,
        'total_bs', v_existente.monto_bs,
        'descuento_bs', v_existente.descuento_bs,
        'created_at', v_existente.created_at,
        'reenvio', true
      );
    end if;
  end if;

  -- ---------- 3. Turno abierto ----------
  select id into v_turno
    from turnos_caja
   where sucursal_id = p_sucursal_id and estado = 'abierto'
   limit 1;

  if v_turno is null then
    raise exception 'No hay un turno de caja abierto en esta sucursal. Abre la caja antes de vender.'
      using errcode = 'P0001';
  end if;

  -- ---------- 4. El carrito ----------
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El carrito de venta está vacío' using errcode = 'P0001';
  end if;

  -- Primera pasada: precio y stock. Solo suma; no escribe nada todavía, para
  -- que un carrito inválido no deje ni un movimiento suelto.
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

    -- El precio SIEMPRE del catálogo. Aunque el cliente mandara uno, aquí no
    -- se lee: `p_items` solo aporta producto, cantidad y lote.
    v_subtotal := v_subtotal + round(v_producto.precio_bs * v_cantidad, 2);
  end loop;

  -- ---------- 5. El descuento, calculado aquí ----------
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
      -- Aquí SÍ se puede: esta función ve el carrito, que es justo lo que le
      -- falta al trigger de `0060` y por lo que allí este tipo no se verifica.
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
      -- 'combo': depende de reglas que hoy nadie evalúa, ni aquí ni en el
      -- cliente (`calcularDescuentoPromocion` también devuelve 0). Se deja en
      -- cero en vez de aceptar un número inventado.
      v_descuento := 0;
    end if;

  elsif coalesce(p_descuento_bs, 0) > 0 then
    -- Descuento manual: lo valida el trigger `validar_descuento_cobro` (0060)
    -- —motivo obligatorio y tope por rol— al insertar el cobro. Aquí solo se
    -- acota para que el total no quede en negativo.
    v_descuento := least(round(p_descuento_bs, 2), v_subtotal);
  end if;

  v_total := round(v_subtotal - v_descuento, 2);
  if v_total <= 0 then
    raise exception 'El total de la venta debe ser mayor a 0' using errcode = 'P0001';
  end if;

  -- ---------- 6. El cobro ----------
  -- Los triggers de 0056/0059/0060 vuelven a validar todo esto por su cuenta.
  -- Es deliberado: esta función es un camino cómodo, no la barrera. La barrera
  -- sigue estando en la tabla, para quien entre por PostgREST directo.
  insert into cobros(clinica_id, sucursal_id, turno_id, usuario_id, monto_bs,
                     descuento_bs, promocion_id, descuento_motivo,
                     metodo_pago, cliente_nombre, idempotency_key)
       values (v_clinica, p_sucursal_id, v_turno, auth.uid(), v_total,
               v_descuento, p_promocion_id, nullif(btrim(coalesce(p_descuento_motivo, '')), ''),
               p_metodo_pago, coalesce(nullif(btrim(coalesce(p_cliente_nombre, '')), ''), 'Cliente Ocasional'),
               p_idempotency_key)
    returning id, created_at into v_cobro, v_creado;

  -- ---------- 7. Líneas, stock y lotes ----------
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

    -- El movimiento va en unidad de medida (0013): el trigger lo divide por
    -- `contenido_presentacion` para descontar envases. Y es la ÚNICA autoridad
    -- sobre el stock: aquí no se toca `productos.stock_actual` a mano.
    insert into movimientos_inventario(clinica_id, producto_id, tipo, cantidad, motivo, usuario_id)
         values (v_clinica, v_producto.id, 'egreso',
                 v_cantidad * v_producto.contenido, 'Venta Pet Shop', auth.uid());

    v_lote_id := nullif(v_item->>'lote_id', '')::uuid;
    if v_lote_id is not null then
      -- Descuento del lote **en una sola sentencia**, con la fila bloqueada por
      -- el propio UPDATE. Antes era leer-restar-escribir desde el navegador, y
      -- dos ventas simultáneas del mismo lote se pisaban.
      update producto_lotes
         set cantidad_actual = greatest(0, cantidad_actual - v_cantidad)
       where id = v_lote_id and clinica_id = v_clinica;

      get diagnostics v_lotes_tocados = row_count;
      if v_lotes_tocados = 0 then
        raise exception 'El lote indicado no pertenece a esta clínica' using errcode = 'P0001';
      end if;
    end if;
  end loop;

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
-- Permisos
-- =========================================================
-- ⚠️ La trampa de `0047`: toda función nueva concede `EXECUTE` a `PUBLIC` por
-- defecto, y `anon` es miembro de `PUBLIC`. Revocar solo de `anon` no sirve de
-- nada. Se revoca de los dos, y luego se concede.
revoke all on function registrar_venta_pos(uuid, jsonb, text, text, uuid, numeric, text, uuid) from public;
revoke all on function registrar_venta_pos(uuid, jsonb, text, text, uuid, numeric, text, uuid) from anon;
grant execute on function registrar_venta_pos(uuid, jsonb, text, text, uuid, numeric, text, uuid) to authenticated;

-- ⚠️ Y si algún día hay que cambiar el tipo de retorno: `create or replace` no
-- lo permite (42P13), obliga a `drop` + `create`, y ESO REINICIA EL ACL —
-- vuelve a abrir `PUBLIC` en silencio. Las revocaciones tienen que ir en la
-- misma migración que el `drop`. Es la trampa de `0055`.
