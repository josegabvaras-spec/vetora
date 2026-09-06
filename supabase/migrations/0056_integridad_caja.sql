-- Integridad de caja y POS: turno cerrado, devoluciones y descuentos.
--
-- Cierra VUL-19, VUL-20, VUL-21 y VUL-22 del informe final de auditoría
-- (2026-09-06): cuatro huecos de la Fase 6 que nunca entraron en la tanda de
-- remediación aprobada porque llegaron después de ella. Los cuatro comparten
-- la misma causa raíz que el resto de la auditoría: la barrera vivía solo en
-- el navegador (`pos.ts`, `caja.ts`, `devoluciones.ts`), nunca en la base.
--
-- Decisiones de negocio tomadas por el dueño del producto antes de escribir
-- esto (no las decidió el auditor):
--   · Un turno o una venta ya cerrados NO se reabren ni se editan — un error
--     real se corrige con un asiento nuevo, igual que el historial clínico.
--   · Un descuento por encima del 15% solo lo puede aplicar una sesión con
--     rol `admin`. Por debajo de ese umbral, cualquier personal puede
--     aplicarlo sin pedir permiso.

-- =========================================================
-- 1) VUL-19 — No se puede cobrar en un turno de caja cerrado
-- =========================================================
-- `cobros.turno_id` no llevaba ninguna condición sobre `turnos_caja.estado`;
-- el único control era `pos.ts` comprobando el turno antes de insertar, que
-- un POST directo a /rest/v1/cobros se salta entero. Un turno ya cuadrado y
-- firmado podía recibir cobros nuevos después de cerrado, sin que quedara más
-- rastro que `created_at`.
create or replace function cobro_exige_turno_abierto() returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_estado text;
begin
  -- ⚠️ SALIDA PARA `respaldo-clinica`, y no es opcional.
  --
  -- Su acción `importar` hace `upsert` de `cobros` y `turnos_caja` con
  -- `service_role`, restaurando el histórico de una clínica: cobros que
  -- apuntan a turnos que —correctamente— están cerrados desde hace meses. Sin
  -- esta salida, restaurar un respaldo fallaría SIEMPRE, y el fallo se leería
  -- como "el respaldo está corrupto" en vez de "el trigger nuevo lo bloquea".
  --
  -- `service_role` no lleva JWT, así que `auth.uid()` es null. No abre ninguna
  -- puerta: `anon` también tiene `auth.uid()` null, pero la policy
  -- `cobros_insert` ya le niega el INSERT por `auth_es_personal()`. Es la
  -- misma clase de escape que `trg_paciente_sin_caja` lleva para
  -- `eliminar-clinica`.
  if auth.uid() is null then
    return new;
  end if;

  select estado into v_estado from turnos_caja where id = new.turno_id;

  if v_estado is distinct from 'abierto' then
    raise exception 'No se puede registrar un cobro: el turno de caja ya está cerrado'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_cobro_exige_turno_abierto on cobros;
create trigger trg_cobro_exige_turno_abierto
  before insert on cobros
  for each row execute function cobro_exige_turno_abierto();

-- =========================================================
-- 2) VUL-20 — Un turno cerrado deja de ser editable
-- =========================================================
-- `turnos_caja_all` es `for all`, sin ningún trigger de congelación — a
-- diferencia de `historial_clinico` e `internaciones`, que sí la tienen desde
-- el principio. Se podía reescribir `saldo_declarado_bs`/`diferencia_bs` de un
-- arqueo ya firmado (borrando la evidencia de un faltante) o reabrir el turno
-- (`estado: 'abierto'`), limitado solo por el índice único de un turno
-- abierto por sucursal.
--
-- El `if old.estado = 'cerrado'` dentro de un trigger `before update` deja
-- pasar la transición que SÍ es legítima —abierto → cerrado, la que hace
-- `cerrarTurno()`— porque en ese momento `old.estado` todavía es 'abierto'.
-- Solo bloquea lo que pasa DESPUÉS de cerrado. No lleva excepción para
-- superadmin ni para `eliminar-clinica`: esa ruta borra filas, no las
-- actualiza, así que un trigger de UPDATE no le afecta.
create or replace function turno_cerrado_inmutable() returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
begin
  -- Misma salida que el trigger anterior, por el mismo motivo: `turnos_caja`
  -- está en la lista de tablas que restaura `respaldo-clinica`, y un `upsert`
  -- sobre un turno histórico ya cerrado es un UPDATE.
  if auth.uid() is null then
    return new;
  end if;

  if old.estado = 'cerrado' then
    raise exception 'Este turno de caja ya está cerrado y no se puede modificar. Corrige con un movimiento nuevo.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_turno_cerrado_inmutable on turnos_caja;
create trigger trg_turno_cerrado_inmutable
  before update on turnos_caja
  for each row execute function turno_cerrado_inmutable();

-- =========================================================
-- 3) VUL-22 — El descuento de una venta se guarda y se limita
-- =========================================================
-- `descuentoGlobalBs` llegaba del navegador y se restaba dentro de `monto_bs`
-- sin dejar rastro: una venta con 90% de descuento era indistinguible de una
-- venta barata. La columna nueva lo hace visible; el trigger aplica el tope
-- de negocio decidido arriba, usando `auth_es_admin()` — la identidad real de
-- la sesión (el JWT), nunca una columna que el propio cliente podría escribir.
alter table cobros add column if not exists descuento_bs numeric(12, 2) not null default 0
  check (descuento_bs >= 0);

comment on column cobros.descuento_bs is
  'Descuento aplicado sobre el subtotal, antes de monto_bs. Antes de esta '
  'columna el descuento se restaba en el navegador y desaparecía del '
  'registro; ahora queda guardado y auditable.';

create or replace function validar_descuento_cobro() returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_base numeric;
  v_pct numeric;
begin
  -- Misma salida para `respaldo-clinica`: un cobro histórico con 40 % de
  -- descuento se restaura tal cual, no se re-autoriza.
  if auth.uid() is null then
    return new;
  end if;

  if coalesce(new.descuento_bs, 0) <= 0 then
    return new;
  end if;

  -- `monto_bs` ya es el total DESPUÉS del descuento (así lo calcula pos.ts),
  -- así que el subtotal original es la suma de los dos.
  v_base := new.monto_bs + new.descuento_bs;
  v_pct := new.descuento_bs / v_base;

  if v_pct > 0.15 and not auth_es_admin() then
    raise exception 'Un descuento mayor al 15%% solo lo puede aplicar un administrador'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validar_descuento_cobro on cobros;
create trigger trg_validar_descuento_cobro
  before insert on cobros
  for each row execute function validar_descuento_cobro();

-- =========================================================
-- 4) VUL-21 — Las devoluciones se validan contra la venta original
-- =========================================================
-- `petshop_devoluciones` solo exigía `cantidad > 0`: sin tope contra lo
-- vendido, sin unicidad (la misma devolución se podía repetir contra el
-- mismo cobro indefinidamente), y `cobro_id` nullable sin ninguna regla para
-- cuando falta. `monto_devuelto_bs` tampoco guardaba relación con lo pagado.
--
-- Con `cobro_id`: exige que el producto esté en esa venta, y que lo ya
-- devuelto más esto no supere lo vendido; el monto no puede superar lo que
-- esa cantidad costó según el precio real de esa venta (no el de hoy).
-- Sin `cobro_id` (venta anterior al sistema, u otro canal legítimo): exige
-- que quien autoriza sea un admin — antes `autorizado_por` era un campo libre
-- que el propio cliente rellenaba o dejaba en blanco.
--
-- Verificado que el único punto de la interfaz que crea devoluciones
-- (`DevolucionModal`, vía `PetshopOrdenesPage`) SIEMPRE pasa `cobro_id`: el
-- modal solo se monta con una venta ya seleccionada. La rama de "sin
-- cobro_id" no tiene hoy ningún camino legítimo en la interfaz — es
-- exclusivamente la puerta que cierra un POST directo a la API.
--
-- ⚠️ Este trigger NO lleva la salida `auth.uid() is null` de los tres de
-- arriba, y es deliberado: `petshop_devoluciones` **no está** en la lista de
-- tablas de `respaldo-clinica`, así que no hay ninguna ruta con
-- `service_role` que inserte aquí. Añadir un escape que nada usa solo
-- debilitaría la comprobación.
create or replace function validar_devolucion() returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_vendido numeric;
  v_ya_devuelto numeric;
  v_precio_unitario numeric;
  v_rol_autoriza text;
begin
  if new.cobro_id is not null then
    select coalesce(sum(cantidad), 0), coalesce(max(precio_unitario_bs), 0)
      into v_vendido, v_precio_unitario
      from cobro_lineas
     where cobro_id = new.cobro_id and producto_id = new.producto_id;

    if v_vendido = 0 then
      raise exception 'Ese producto no aparece en la venta indicada' using errcode = 'P0001';
    end if;

    select coalesce(sum(cantidad), 0) into v_ya_devuelto
      from petshop_devoluciones
     where cobro_id = new.cobro_id and producto_id = new.producto_id;

    if v_ya_devuelto + new.cantidad > v_vendido then
      raise exception
        'La cantidad a devolver (%) supera lo disponible: se vendieron % y ya se devolvieron %',
        new.cantidad, v_vendido, v_ya_devuelto
        using errcode = 'P0001';
    end if;

    if new.monto_devuelto_bs > (v_precio_unitario * new.cantidad) + 0.01 then
      raise exception
        'El monto a devolver (Bs. %) supera lo que se cobró por esa cantidad (Bs. %)',
        new.monto_devuelto_bs, round(v_precio_unitario * new.cantidad, 2)
        using errcode = 'P0001';
    end if;
  else
    if new.autorizado_por is null then
      raise exception 'Una devolución sin venta asociada requiere autorización de un administrador'
        using errcode = 'P0001';
    end if;

    select rol into v_rol_autoriza from usuarios where id = new.autorizado_por;
    if v_rol_autoriza is distinct from 'admin' then
      raise exception 'Una devolución sin venta asociada solo puede autorizarla un administrador'
        using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validar_devolucion on petshop_devoluciones;
create trigger trg_validar_devolucion
  before insert on petshop_devoluciones
  for each row execute function validar_devolucion();

-- =========================================================
-- Pruebas antes de aplicar (mismo protocolo que 0049/0050)
-- =========================================================
--   1. Venta normal en el POS, sin descuento — debe pasar igual que hoy.
--   2. Venta con descuento chico (<15%) desde una sesión de recepción — debe
--      pasar sin pedir nada extra.
--   3. Venta con descuento grande (>15%) desde recepción — debe RECHAZARSE;
--      la misma venta desde una sesión admin debe pasar.
--   4. Cobrar en un turno recién cerrado (turno_id de un turno con
--      estado='cerrado') — debe RECHAZARSE.
--   5. Intentar reabrir o editar un turno cerrado (`PATCH turnos_caja`) —
--      debe RECHAZARSE, incluso como admin.
--   6. Devolución normal desde el modal (con cobro_id real) — debe pasar.
--   7. Devolución con cantidad mayor a lo vendido — debe RECHAZARSE.
--   8. Devolución con monto mayor a lo cobrado — debe RECHAZARSE.
--   9. Cerrar una clínica con `eliminar-clinica` (ejercita el DELETE en
--      cascada de turnos_caja/cobros) — debe seguir funcionando igual.
