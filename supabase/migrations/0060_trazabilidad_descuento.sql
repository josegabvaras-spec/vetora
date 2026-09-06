-- El descuento deja de ser un número suelto: se justifica, se limita por
-- configuración y consume la promoción que lo respalda.
--
-- =========================================================
-- Qué faltaba después de 0056
-- =========================================================
-- `0056` guardó `cobros.descuento_bs` y puso un tope del 15 % para quien no sea
-- admin. Eso responde «cuánto», pero no «por qué»:
--
--   1. `codigoCupon` se acepta en `DatosVentaPOS`, `PetshopPosPage` lo manda…
--      y `procesarVentaPOS` **nunca lo escribe en ninguna parte**. No existe
--      columna donde ponerlo. La promoción que justifica el descuento se
--      pierde en el camino.
--   2. `calcularDescuentoPromocion()` (`services/promociones.ts`) es una
--      función **pura del navegador**: lee el carrito, aplica el porcentaje o
--      el 2x1 y devuelve un número. El servidor recibe ese número ya cocinado y
--      **nunca comprueba que exista una promoción activa que lo respalde**. Un
--      `POST` directo con el 14 % del subtotal pasa el tope sin ningún cupón.
--   3. El 15 % está escrito a fuego en el trigger: no se puede ajustar por
--      clínica.
--   4. `petshop_promociones.usos_actuales` y `limite_uso` existen desde 0030 y
--      **nadie los toca**: un cupón de un solo uso se puede aplicar mil veces.
--
-- =========================================================
-- La decisión de negocio que esto obliga a tomar
-- =========================================================
-- Si una promoción válida pudiera justificar un descuento por encima del tope,
-- y **cualquier personal puede crear promociones** (hoy `/petshop/promociones`
-- está abierta a admin, recepción y veterinario), entonces el tope no valdría
-- nada: recepción se crea un cupón del 99 % y lo aplica.
--
-- Así que van juntas, y no se pueden separar:
--   · Crear/editar promociones pasa a ser **solo del admin**. Es política
--     comercial, del mismo orden que fijar el tarifario (`servicios_admin`) o
--     las comisiones de peluquería (0045).
--   · A cambio, una promoción **válida, activa, en fecha y de esta clínica**
--     sí justifica un descuento por encima del tope: el admin ya lo autorizó al
--     crearla.
--   · Un descuento **sin** promoción sigue sujeto al tope, y ahora además
--     **exige un motivo escrito**.

-- =========================================================
-- 1) Dónde se guarda la justificación
-- =========================================================
alter table cobros add column if not exists promocion_id uuid
  references petshop_promociones (id) on delete set null;

alter table cobros add column if not exists descuento_motivo text;

comment on column cobros.promocion_id is
  'Promoción que justifica el descuento, cuando lo hubo. Antes de 0060 el '
  'código de cupón se aceptaba en el servicio y se descartaba.';

comment on column cobros.descuento_motivo is
  'Motivo escrito de un descuento sin promoción. Obligatorio en ese caso.';

-- El tope, por clínica, con el 15 % de 0056 como valor de partida.
alter table petshop_configuracion add column if not exists descuento_max_pct numeric(5, 2)
  not null default 15 check (descuento_max_pct >= 0 and descuento_max_pct <= 100);

comment on column petshop_configuracion.descuento_max_pct is
  'Descuento máximo, en porcentaje, que puede aplicar quien no es admin sin '
  'una promoción que lo respalde.';

-- =========================================================
-- 2) La política comercial es del admin
-- =========================================================
-- Mismo criterio y misma forma que `0045` aplicó a las comisiones de
-- peluquería: leer, todo el personal; escribir, solo el admin.
drop policy if exists "petshop_promociones_escritura" on petshop_promociones;

create policy "petshop_promociones_escritura" on petshop_promociones
  for all to authenticated
  using (clinica_id = auth_clinica_id() and auth_es_admin())
  with check (clinica_id = auth_clinica_id() and auth_es_admin());

-- =========================================================
-- 3) El descuento se valida contra la promoción, no contra la palabra del cliente
-- =========================================================
-- Sustituye a la versión de 0056. Lo que cambia:
--   · el tope sale de `petshop_configuracion`, no de una constante;
--   · si hay `promocion_id`, se comprueba que sea de esta clínica, esté activa,
--     en fecha, y que el importe descontado **no supere lo que esa promoción
--     puede dar**;
--   · si no hay promoción, se exige motivo escrito y se aplica el tope;
--   · un cupón con `limite_uso` no se puede pasar de sus usos.
--
-- ⚠️ **Límite honesto de esta comprobación.** Un trigger `before insert` sobre
-- `cobros` ve el total y el descuento, pero **no ve las líneas** — se insertan
-- después. Así que los tipos `porcentaje`, `monto_fijo` y `cupon` se verifican
-- de verdad contra su `valor_descuento`, y `dos_por_uno`/`combo` solo se
-- comprueban como referencia válida: para verificarlos haría falta el carrito,
-- que solo tendrá la RPC transaccional de la fase 3.
create or replace function validar_descuento_cobro() returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_base numeric;
  v_pct numeric;
  v_tope numeric;
  v_promo record;
  v_max_promo numeric;
begin
  -- Salida para `respaldo-clinica`: un cobro histórico con 40 % se restaura tal
  -- cual, no se re-autoriza.
  if auth.uid() is null then
    return new;
  end if;

  if coalesce(new.descuento_bs, 0) <= 0 then
    -- Sin descuento no hay nada que justificar, pero tampoco se acepta una
    -- promoción colgada de la nada.
    if new.promocion_id is not null then
      raise exception 'Hay una promoción indicada pero el descuento es cero' using errcode = 'P0001';
    end if;
    return new;
  end if;

  v_base := new.monto_bs + new.descuento_bs;
  v_pct := (new.descuento_bs / v_base) * 100;

  -- ---------- Con promoción: la valida el servidor ----------
  if new.promocion_id is not null then
    select * into v_promo from petshop_promociones where id = new.promocion_id;

    if v_promo is null or v_promo.clinica_id is distinct from new.clinica_id then
      raise exception 'La promoción no pertenece a esta clínica' using errcode = 'P0001';
    end if;
    if not v_promo.activo then
      raise exception 'La promoción "%" no está activa', v_promo.titulo using errcode = 'P0001';
    end if;
    if current_date < v_promo.fecha_inicio or current_date > v_promo.fecha_fin then
      raise exception 'La promoción "%" está fuera de fecha (% a %)',
        v_promo.titulo, v_promo.fecha_inicio, v_promo.fecha_fin using errcode = 'P0001';
    end if;
    if v_promo.limite_uso is not null and v_promo.usos_actuales >= v_promo.limite_uso then
      raise exception 'La promoción "%" agotó sus % usos', v_promo.titulo, v_promo.limite_uso
        using errcode = 'P0001';
    end if;

    -- Lo máximo que esa promoción puede descontar sobre este subtotal.
    if v_promo.tipo = 'porcentaje' then
      v_max_promo := v_base * v_promo.valor_descuento / 100;
    elsif v_promo.tipo in ('monto_fijo', 'cupon') then
      v_max_promo := least(v_base, v_promo.valor_descuento);
    else
      -- dos_por_uno / combo: dependen del carrito, que aquí no se ve.
      v_max_promo := null;
    end if;

    if v_max_promo is not null and new.descuento_bs > v_max_promo + 0.01 then
      raise exception
        'El descuento (Bs. %) supera lo que la promoción "%" permite (Bs. %)',
        new.descuento_bs, v_promo.titulo, round(v_max_promo, 2)
        using errcode = 'P0001';
    end if;

    -- Consume el uso. `limite_uso` existía desde 0030 y no lo miraba nadie.
    update petshop_promociones
       set usos_actuales = usos_actuales + 1
     where id = new.promocion_id;

    return new;
  end if;

  -- ---------- Sin promoción: motivo obligatorio y tope ----------
  if new.descuento_motivo is null or btrim(new.descuento_motivo) = '' then
    raise exception 'Un descuento sin promoción necesita un motivo escrito' using errcode = 'P0001';
  end if;

  select descuento_max_pct into v_tope
    from petshop_configuracion where clinica_id = new.clinica_id;
  v_tope := coalesce(v_tope, 15);

  if v_pct > v_tope and not auth_es_admin() then
    raise exception 'Un descuento mayor al % %% solo lo puede aplicar un administrador', v_tope
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

-- El trigger de 0056 sigue siendo el mismo; solo cambia el cuerpo de la función.

-- =========================================================
-- Pruebas
-- =========================================================
--   · Venta sin descuento                                   → PERMITE
--   · Descuento 10 % con motivo, como recepción             → PERMITE
--   · Descuento 10 % SIN motivo                             → RECHAZA
--   · Descuento 40 % con motivo, como recepción             → RECHAZA
--   · Descuento 40 % con motivo, como admin                 → PERMITE
--   · Descuento 40 % con promoción del 40 % activa          → PERMITE (y suma un uso)
--   · Descuento 40 % con promoción del 10 %                 → RECHAZA
--   · Descuento con promoción inactiva / fuera de fecha     → RECHAZA
--   · Descuento con promoción de otra clínica               → RECHAZA
--   · Promoción con `limite_uso` agotado                     → RECHAZA
--   · Crear una promoción como recepción                     → RECHAZA (403)
--   · Crear una promoción como admin                         → PERMITE
