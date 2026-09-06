-- El cobro de consulta, internación, peluquería y mostrador, también en una
-- transacción. Cierra lo último que quedaba abierto del Bloque 1.
--
-- =========================================================
-- Lo que quedaba
-- =========================================================
-- `0062` puso la venta del POS dentro de una función. `registrarCobro` y
-- `registrarVentaDirecta` (`services/caja.ts`) se quedaron fuera, y arrastraban
-- los mismos defectos que el POS tenía antes:
--
--   · **Sin transacción.** `insert cobros` → `insert cobro_lineas` →
--     (venta directa) `registrarMovimiento` por cada ítem. Un fallo en medio
--     deja un cobro cobrado sin líneas, o con líneas y sin descuento de stock.
--   · **La autoría la elige el cliente.** `usuario_id: datos.usuarioId`, un
--     campo del cuerpo. Una venta se puede cargar a otro empleado.
--   · **`monto_bs` no guarda relación con las líneas.** Se manda calculado
--     desde el navegador; nada obliga a que sea su suma.
--   · Y mientras existieran, `cobros`/`cobro_lineas` tenían que seguir
--     aceptando INSERT directo de cualquier personal, así que un `POST` crudo a
--     PostgREST con el importe inventado seguía siendo posible.
--
-- =========================================================
-- Dónde está la frontera, y por qué NO es la misma que en el POS
-- =========================================================
-- En el POS el servidor **relee el precio del catálogo** y no acepta ninguno
-- del cliente: vender a un precio distinto del de catálogo no es una función
-- que exista.
--
-- En una consulta **sí existe, y es la funcionalidad**: `aplicarAjustes()` deja
-- que quien cobra fije el importe de una línea de consumo, y su propio
-- comentario lo dice —«un operador puede fijar el precio, que es la
-- funcionalidad»—. El precio por unidad de medida es una **referencia**, no la
-- verdad: aplicar 2 ml de un frasco a Bs. 2/ml daría un recibo de «2 ml × Bs. 2»
-- que no es lo que la clínica cobra.
--
-- Así que el servidor se queda con **todo lo que puede ser suyo**:
--
--   ✔ la autoría            → `auth.uid()`, no un campo del cuerpo
--   ✔ el total              → la suma de las líneas, calculada aquí
--   ✔ el turno abierto      → leído aquí, de esta sucursal
--   ✔ la clínica            → `auth_clinica_id()`
--   ✔ «ya se cobró»         → comprobado aquí, no en el navegador
--   ✔ el descuento de stock → dentro de la misma transacción
--   ✔ la idempotencia
--   ✔ todo o nada
--
-- Y lo único que aporta el cliente es **el importe que decide una persona**,
-- que no deja de quedar registrado: `trg_precio_catalogo` (0054/0063) guarda
-- igual lo que el catálogo decía y marca la línea como `ajuste_manual`, así que
-- la desviación sale en `/metricas`. Fingir que el servidor puede recalcular el
-- precio de una consulta sería mentir sobre lo que el negocio hace.

create or replace function registrar_cobro(
  p_sucursal_id uuid,
  p_lineas jsonb,
  p_metodo_pago text,
  p_cita_id uuid default null,
  p_internacion_id uuid default null,
  p_orden_peluqueria_id uuid default null,
  p_cliente_nombre text default null,
  p_movimientos jsonb default null,
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
  v_linea jsonb;
  v_mov jsonb;
  v_total numeric := 0;
  v_subtotal numeric;
  v_cantidad numeric;
  v_creado timestamptz;
  v_estado text;
  v_disponible numeric;
  v_nombre text;
begin
  -- ---------- Identidad y permiso ----------
  v_clinica := auth_clinica_id();
  if v_clinica is null then
    raise exception 'Sesión sin clínica: no se puede registrar un cobro' using errcode = 'P0001';
  end if;

  if not auth_es_personal() then
    raise exception 'No tienes permiso para registrar cobros' using errcode = 'P0001';
  end if;

  if not exists (select 1 from sucursales
                  where id = p_sucursal_id and clinica_id = v_clinica) then
    raise exception 'La sucursal no pertenece a esta clínica' using errcode = 'P0001';
  end if;

  if not (auth_es_admin() or p_sucursal_id = auth_sucursal_id()) then
    raise exception 'No tienes permiso para cobrar en esta sucursal' using errcode = 'P0001';
  end if;

  -- ---------- Idempotencia, antes de tocar nada ----------
  if p_idempotency_key is not null then
    select id, monto_bs, created_at into v_existente
      from cobros
     where clinica_id = v_clinica and idempotency_key = p_idempotency_key;

    if found then
      return jsonb_build_object(
        'cobro_id', v_existente.id,
        'total_bs', v_existente.monto_bs,
        'created_at', v_existente.created_at,
        'reenvio', true
      );
    end if;
  end if;

  -- ---------- Qué se está cobrando ----------
  if (p_cita_id is not null)::int + (p_internacion_id is not null)::int
     + (p_orden_peluqueria_id is not null)::int > 1 then
    raise exception 'Un cobro liquida una sola atención' using errcode = 'P0001';
  end if;

  if p_cita_id is not null then
    if not exists (select 1 from citas where id = p_cita_id and clinica_id = v_clinica) then
      raise exception 'La cita no pertenece a esta clínica' using errcode = 'P0001';
    end if;
    if exists (select 1 from cobros where cita_id = p_cita_id) then
      raise exception 'Esta cita ya fue cobrada' using errcode = 'P0001';
    end if;

  elsif p_internacion_id is not null then
    select estado into v_estado from internaciones
     where id = p_internacion_id and clinica_id = v_clinica;
    if not found then
      raise exception 'La internación no pertenece a esta clínica' using errcode = 'P0001';
    end if;
    if v_estado is distinct from 'alta' then
      raise exception 'Da de alta al paciente antes de cobrar la internación' using errcode = 'P0001';
    end if;
    if exists (select 1 from cobros where internacion_id = p_internacion_id) then
      raise exception 'Esta internación ya fue cobrada' using errcode = 'P0001';
    end if;

  elsif p_orden_peluqueria_id is not null then
    -- La orden no lleva su cobro en `cobros` (no hay columna), sino al revés:
    -- `peluqueria_ordenes.cobro_id`. Por eso la comprobación es sobre la orden.
    if not exists (select 1 from peluqueria_ordenes
                    where id = p_orden_peluqueria_id and clinica_id = v_clinica) then
      raise exception 'La orden de peluquería no pertenece a esta clínica' using errcode = 'P0001';
    end if;
    if exists (select 1 from peluqueria_ordenes
                where id = p_orden_peluqueria_id and cobro_id is not null) then
      raise exception 'Esta orden ya fue cobrada' using errcode = 'P0001';
    end if;

  elsif coalesce(btrim(p_cliente_nombre), '') = '' then
    -- Mismo criterio que el CHECK `cobros_venta_directa_con_cliente` de 0007:
    -- un cobro sin atención y sin nombre sería dinero en caja sin nada que lo
    -- explique.
    raise exception 'Una venta de mostrador necesita a nombre de quién se cobra'
      using errcode = 'P0001';
  end if;

  -- ---------- Turno abierto ----------
  select id into v_turno from turnos_caja
   where sucursal_id = p_sucursal_id and estado = 'abierto' limit 1;
  if v_turno is null then
    raise exception 'Abre la caja antes de registrar cobros' using errcode = 'P0001';
  end if;

  -- ---------- Las líneas, y de ellas el total ----------
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'Agrega al menos un servicio o producto para cobrar' using errcode = 'P0001';
  end if;

  for v_linea in select * from jsonb_array_elements(p_lineas) loop
    v_cantidad := coalesce((v_linea->>'cantidad')::numeric, 0);
    v_subtotal := coalesce((v_linea->>'subtotal_bs')::numeric, -1);

    if v_cantidad <= 0 then
      raise exception 'Cada línea del cobro necesita una cantidad mayor a 0' using errcode = 'P0001';
    end if;
    if v_subtotal < 0 then
      raise exception 'El importe de una línea no puede ser negativo' using errcode = 'P0001';
    end if;

    -- ⚠️ El total NO se acepta del cliente: sale de aquí. Antes `monto_bs`
    -- llegaba calculado desde el navegador y nada obligaba a que fuera la suma
    -- de sus líneas.
    v_total := v_total + v_subtotal;
  end loop;

  v_total := round(v_total, 2);
  if v_total <= 0 then
    raise exception 'El importe del cobro debe ser mayor a 0' using errcode = 'P0001';
  end if;

  -- ---------- El cobro ----------
  insert into cobros(clinica_id, sucursal_id, turno_id, usuario_id, monto_bs,
                     metodo_pago, cita_id, internacion_id, cliente_nombre, idempotency_key)
       values (v_clinica, p_sucursal_id, v_turno, auth.uid(), v_total,
               p_metodo_pago, p_cita_id, p_internacion_id,
               nullif(btrim(coalesce(p_cliente_nombre, '')), ''), p_idempotency_key)
    returning id, created_at into v_cobro, v_creado;

  -- ---------- Sus líneas ----------
  -- No se marca `vetora.linea_verificada`: estas líneas llevan un importe que
  -- decidió una persona, así que `trg_precio_catalogo` las clasifica como
  -- `ajuste_manual`/`servicio`/`suplemento` y guarda igual el precio de
  -- catálogo para que la desviación sea visible. Decir 'catalogo' aquí sería
  -- afirmar una verificación que no se hizo.
  for v_linea in select * from jsonb_array_elements(p_lineas) loop
    insert into cobro_lineas(clinica_id, cobro_id, concepto, cantidad,
                             precio_unitario_bs, subtotal_bs, servicio_id, producto_id)
         values (v_clinica, v_cobro,
                 coalesce(nullif(btrim(coalesce(v_linea->>'concepto','')), ''), 'Concepto'),
                 (v_linea->>'cantidad')::numeric,
                 coalesce((v_linea->>'precio_unitario_bs')::numeric, 0),
                 (v_linea->>'subtotal_bs')::numeric,
                 nullif(v_linea->>'servicio_id', '')::uuid,
                 nullif(v_linea->>'producto_id', '')::uuid);
  end loop;

  -- ---------- La orden de peluquería queda cobrada ----------
  if p_orden_peluqueria_id is not null then
    update peluqueria_ordenes set cobro_id = v_cobro
     where id = p_orden_peluqueria_id and clinica_id = v_clinica;
  end if;

  -- ---------- Y el stock, en la MISMA transacción ----------
  -- Es lo de la venta de mostrador. `registrarVentaDirecta` lo hacía después
  -- del cobro y en llamadas sueltas, con este comentario: «el caso malo deja un
  -- cobro registrado y visible, que es recuperable a mano». Ya no hace falta
  -- que sea recuperable a mano: si el egreso falla, el cobro no existe.
  --
  -- `cantidad` va en unidad de medida (ml, g), igual que la mandaba
  -- `registrarVentaDirecta`; el trigger de 0013 la divide por
  -- `contenido_presentacion` para descontar envases.
  if p_movimientos is not null and jsonb_typeof(p_movimientos) = 'array' then
    for v_mov in select * from jsonb_array_elements(p_movimientos) loop
      v_cantidad := coalesce((v_mov->>'cantidad')::numeric, 0);
      if v_cantidad <= 0 then
        continue;
      end if;

      select nombre, stock_actual * coalesce(nullif(contenido_presentacion, 0), 1)
        into v_nombre, v_disponible
        from productos
       where id = (v_mov->>'producto_id')::uuid and clinica_id = v_clinica;

      if not found then
        raise exception 'Un producto de la venta no pertenece a esta clínica' using errcode = 'P0001';
      end if;
      if v_cantidad > v_disponible then
        raise exception 'Stock insuficiente de "%": quedan %', v_nombre, v_disponible
          using errcode = 'P0001';
      end if;

      insert into movimientos_inventario(clinica_id, producto_id, tipo, cantidad, motivo, usuario_id)
           values (v_clinica, (v_mov->>'producto_id')::uuid, 'egreso', v_cantidad,
                   coalesce(nullif(btrim(coalesce(v_mov->>'motivo','')), ''), 'Venta en caja'),
                   auth.uid());
    end loop;
  end if;

  return jsonb_build_object(
    'cobro_id', v_cobro,
    'total_bs', v_total,
    'created_at', v_creado,
    'reenvio', false
  );
end;
$$;

-- ⚠️ La trampa de `0047`: `EXECUTE` se concede a `PUBLIC` por defecto, y `anon`
-- es miembro de `PUBLIC`. Revocar de los dos.
revoke all on function registrar_cobro(uuid, jsonb, text, uuid, uuid, uuid, text, jsonb, uuid) from public;
revoke all on function registrar_cobro(uuid, jsonb, text, uuid, uuid, uuid, text, jsonb, uuid) from anon;
grant execute on function registrar_cobro(uuid, jsonb, text, uuid, uuid, uuid, text, jsonb, uuid) to authenticated;

-- =========================================================
-- ⚠️ Las policies de INSERT directo NO se quitan en esta migración
-- =========================================================
-- Quitar `cobros_insert` y `cobro_lineas_insert` ahora dejaría a TODAS las
-- clínicas sin poder cobrar en el mismo instante: el frontend desplegado
-- todavía inserta directo, y Vercel tarda un par de minutos en publicar el que
-- usa esta función.
--
-- El orden correcto es: esta migración → desplegar el frontend → comprobar que
-- cobra → y entonces `0066` quita las policies. Hacerlo al revés es un corte de
-- servicio, no un endurecimiento.
