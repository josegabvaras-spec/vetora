-- Que una fila de dinero no pueda apuntar a otra clínica.
--
-- =========================================================
-- El problema, verificado con tres clínicas reales en producción
-- =========================================================
--   Cobro de la clínica A con `turno_id` de la clínica B   → SE CREÓ
--   Línea de cobro con `producto_id` de la clínica B       → SE CREÓ
--
-- **Mecanismo.** Las policies validan el `clinica_id` DE LA FILA QUE SE
-- INSERTA, nunca el de las filas a las que apunta. Y PostgreSQL comprueba la
-- integridad referencial **como dueño de la tabla, saltándose la RLS**: el FK
-- solo mira que el uuid exista, no de quién es.
--
-- **Por qué importa, que es más sutil que "fuga de datos" — porque no la hay.**
-- El cobro inyectado tiene `clinica_id = A`, así que la clínica B no lo ve (su
-- RLS lo filtra) y su arqueo no lo cuenta. Y A no lo ve en su caja, porque el
-- turno es de B. **Es dinero registrado que no aparece en el arqueo de nadie.**
--
-- Exige conocer el uuid de un turno ajeno, que no se obtiene por la API. Por
-- eso es MEDIO y no ALTO — pero es un aislamiento que hoy descansa en que
-- nadie escriba un uuid que la RLS no le impide escribir.
--
-- El patrón correcto ya existe en el proyecto, en una sola tabla:
-- `movimientos_all` (0002) valida el producto con un `exists` que corre bajo la
-- RLS del que llama. Aquí se hace explícito y en la base, no en la policy.

-- =========================================================
-- 1) cobros: turno, sucursal, cita e internación de la misma clínica
-- =========================================================
create or replace function cobro_mismo_inquilino() returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_turno_clinica uuid;
  v_turno_sucursal uuid;
begin
  -- Salida para `respaldo-clinica` (service_role, sin JWT), igual que 0056–0058.
  -- Al restaurar, las referencias son internamente coherentes: los uuid vienen
  -- del mismo respaldo, y `0056` ya rechaza restaurar sobre otra clínica.
  if auth.uid() is null then
    return new;
  end if;

  if not exists (select 1 from sucursales
                  where id = new.sucursal_id and clinica_id = new.clinica_id) then
    raise exception 'La sucursal del cobro no pertenece a esta clínica' using errcode = 'P0001';
  end if;

  select clinica_id, sucursal_id into v_turno_clinica, v_turno_sucursal
    from turnos_caja where id = new.turno_id;

  if v_turno_clinica is distinct from new.clinica_id then
    raise exception 'El turno de caja no pertenece a esta clínica' using errcode = 'P0001';
  end if;

  -- Además de la clínica, la sucursal: un cobro de la sucursal A no entra en la
  -- caja de la sucursal B ni dentro de la misma clínica. Los tres caminos que
  -- crean cobros (`procesarVentaPOS`, `registrarCobro`, `registrarVentaDirecta`)
  -- ya piden el turno abierto DE esa sucursal, así que esto no cambia nada
  -- legítimo.
  if v_turno_sucursal is distinct from new.sucursal_id then
    raise exception 'El turno de caja es de otra sucursal' using errcode = 'P0001';
  end if;

  if new.cita_id is not null
     and not exists (select 1 from citas where id = new.cita_id and clinica_id = new.clinica_id) then
    raise exception 'La cita no pertenece a esta clínica' using errcode = 'P0001';
  end if;

  if new.internacion_id is not null
     and not exists (select 1 from internaciones where id = new.internacion_id and clinica_id = new.clinica_id) then
    raise exception 'La internación no pertenece a esta clínica' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_cobro_mismo_inquilino on cobros;
create trigger trg_cobro_mismo_inquilino
  before insert on cobros
  for each row execute function cobro_mismo_inquilino();

-- =========================================================
-- 2) cobro_lineas: cobro, producto y servicio de la misma clínica
-- =========================================================
create or replace function linea_mismo_inquilino() returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if not exists (select 1 from cobros where id = new.cobro_id and clinica_id = new.clinica_id) then
    raise exception 'El cobro de esta línea pertenece a otra clínica' using errcode = 'P0001';
  end if;

  if new.producto_id is not null
     and not exists (select 1 from productos where id = new.producto_id and clinica_id = new.clinica_id) then
    raise exception 'El producto no pertenece a esta clínica' using errcode = 'P0001';
  end if;

  if new.servicio_id is not null
     and not exists (select 1 from servicios where id = new.servicio_id and clinica_id = new.clinica_id) then
    raise exception 'El servicio no pertenece a esta clínica' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_linea_mismo_inquilino on cobro_lineas;
create trigger trg_linea_mismo_inquilino
  before insert on cobro_lineas
  for each row execute function linea_mismo_inquilino();

-- =========================================================
-- 3) petshop_devoluciones: cobro, producto y sucursal de la misma clínica
-- =========================================================
-- `trg_validar_devolucion` (0056) ya comprueba que el producto esté EN esa
-- venta, lo que de rebote ata la clínica cuando hay `cobro_id`. Esto cubre el
-- caso sin venta asociada y la sucursal, que nadie miraba.
create or replace function devolucion_mismo_inquilino() returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if not exists (select 1 from sucursales
                  where id = new.sucursal_id and clinica_id = new.clinica_id) then
    raise exception 'La sucursal de la devolución no pertenece a esta clínica' using errcode = 'P0001';
  end if;

  if new.cobro_id is not null
     and not exists (select 1 from cobros where id = new.cobro_id and clinica_id = new.clinica_id) then
    raise exception 'La venta indicada pertenece a otra clínica' using errcode = 'P0001';
  end if;

  if not exists (select 1 from productos where id = new.producto_id and clinica_id = new.clinica_id) then
    raise exception 'El producto no pertenece a esta clínica' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_devolucion_mismo_inquilino on petshop_devoluciones;
create trigger trg_devolucion_mismo_inquilino
  before insert on petshop_devoluciones
  for each row execute function devolucion_mismo_inquilino();

-- =========================================================
-- Lo que NO hace falta tocar
-- =========================================================
-- `movimientos_inventario` ya está cubierto: su policy `movimientos_all` (0002)
-- lleva `exists (select 1 from productos p where p.id = producto_id …)`, y esa
-- subconsulta corre bajo la RLS del que llama, así que el producto tiene que
-- ser visible para él. Es el mismo efecto por otra vía.
