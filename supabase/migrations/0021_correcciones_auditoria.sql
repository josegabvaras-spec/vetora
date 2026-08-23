-- Correcciones de la auditoría de seguridad y calidad (ver SEGURIDAD.md).
--
-- Tres cosas, todas del circuito de facturación que introdujo 0020 más un
-- índice que faltaba desde 0014:
--
--   1. Aprobar un comprobante pasa a ser ATÓMICO. Hoy son tres viajes desde el
--      navegador y un fallo a medias deja el pago aprobado con la fecha sin
--      mover, sin rastro y sin forma de reintentar.
--   2. Una clínica no puede tener dos comprobantes en revisión a la vez: dos
--      envíos por la misma transferencia se aprobaban dos veces.
--   3. El panel de salud contaba solo el bucket `estudios` e ignoraba
--      `comprobantes`, que 0020 acababa de crear.

-- =========================================================
-- 1. Aprobar un comprobante, en una sola sentencia
-- =========================================================
-- Mismo criterio que `consumir_cuota_whatsapp()` (0005): comprobar y escribir
-- son la misma operación. Hacerlo en tres viajes desde el cliente deja la
-- puerta abierta a que el segundo o el tercero fallen — y entonces el pago ya
-- figura aprobado, la tarea desaparece del asistente (que filtra por
-- `pendiente`), la clínica lee «Aprobado» y sigue debiendo. Nadie se entera.
--
-- `security definer` por lo mismo que `espacio_estudios_bytes()` (0018): la
-- comprobación de rol va DENTRO, para que la elevación no le sirva a nadie más.
create or replace function aprobar_pago_suscripcion(p_pago_id uuid)
  returns date
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_clinica_id uuid;
  v_meses int;
  v_nuevo_cobro date;
begin
  if not auth_es_plataforma() then
    raise exception 'Solo la plataforma puede aprobar comprobantes';
  end if;

  -- El `where … and estado = 'pendiente'` es lo que hace la operación
  -- idempotente: el segundo clic no encuentra fila y no corre la fecha otra vez.
  update pagos_suscripcion
     set estado = 'aprobado',
         revisado_por = auth.uid(),
         revisado_at = now()
   where id = p_pago_id
     and estado = 'pendiente'
  returning clinica_id, meses into v_clinica_id, v_meses;

  if not found then
    raise exception 'Ese comprobante ya fue revisado o no existe'
      using errcode = 'P0001';
  end if;

  -- La fecha se corre desde la que hubiera, sumando los meses que cubre el
  -- pago. `+ interval` resuelve solo el desborde del día 31 (31 de enero + 1 mes
  -- = 28 de febrero), igual que `sumarMesesAFecha` en el frontend.
  update clinicas c
     set proximo_cobro = (c.proximo_cobro + (v_meses || ' months')::interval)::date,
         -- Al día SOLO si la fecha nueva ya es futura. Una clínica con tres
         -- meses de atraso que paga uno sigue debiendo: marcarla al día la
         -- sacaba del contador de morosos y del asistente, y nadie volvía a
         -- reclamarle. `marcarCobroAlDia` lo hacía incondicionalmente.
         estado_pago = case
           when (c.proximo_cobro + (v_meses || ' months')::interval)::date
                > (now() at time zone 'America/La_Paz')::date
             then 'al_dia'
           else c.estado_pago
         end
   where c.id = v_clinica_id
  returning c.proximo_cobro into v_nuevo_cobro;

  if not found then
    raise exception 'El comprobante quedó aprobado, pero la clínica ya no existe';
  end if;

  return v_nuevo_cobro;
end;
$$;

revoke all on function aprobar_pago_suscripcion(uuid) from public;
grant execute on function aprobar_pago_suscripcion(uuid) to authenticated;

-- =========================================================
-- 2. Un solo comprobante en revisión por clínica
-- =========================================================
-- El panel ya avisaba («no hace falta que mandes otro»), pero era decorativo:
-- el botón no se deshabilitaba. Dos envíos por la misma transferencia daban dos
-- tareas idénticas, y aprobar las dos acreditaba el doble de meses.
--
-- Parcial: solo los `pendiente` estorban. El histórico de aprobados y
-- rechazados puede tener tantas filas como haga falta.
create unique index if not exists pagos_un_pendiente_por_clinica
  on pagos_suscripcion (clinica_id)
  where estado = 'pendiente';

-- =========================================================
-- 3. El espacio ocupado incluye los comprobantes
-- =========================================================
-- 0018 sumaba solo `estudios`; 0020 añadió `comprobantes`, con fotos de hasta
-- 5 MB, y el panel de salud del superadmin quedó subestimando justo el bucket
-- que él mismo hace crecer al aprobar comprobantes.
--
-- El nombre de la función NO cambia a propósito: lo llama `services/salud.ts`
-- por RPC, y renombrarlo sería un tercer sitio que mantener sincronizado.
create or replace function espacio_estudios_bytes() returns bigint
  language plpgsql
  security definer
  set search_path = public, storage, pg_temp
as $$
declare
  v_total bigint;
begin
  if not auth_es_plataforma() then
    raise exception 'Solo la plataforma puede consultar el espacio ocupado';
  end if;

  select coalesce(sum((metadata->>'size')::bigint), 0)
    into v_total
    from storage.objects
   where bucket_id in ('estudios', 'comprobantes');

  return v_total;
end;
$$;

-- =========================================================
-- 4. Índice para la cola de trabajo del veterinario
-- =========================================================
-- `listConsultasAbiertas` filtra por `clinica_id` (vía RLS) + `editable` +
-- `veterinario_id`, y ordena por `created_at`. El único índice que había
-- (`historial_por_paciente`, 0003) lleva `paciente_id` en segunda posición y
-- esa columna NO está en el predicado, así que el índice se quedaba en el
-- prefijo `clinica_id` y el orden acababa en un sort del historial entero.
--
-- Es la pantalla de entrada del veterinario y se recarga con cada evento
-- realtime de `historial_clinico`.
--
-- El parcial es diminuto frente a la tabla: una consulta abierta es trabajo del
-- día, no histórico. El caso del admin (sin veterinario) lo usa igual por el
-- prefijo `clinica_id` sobre ese conjunto ya reducido.
create index if not exists historial_borradores
  on historial_clinico (clinica_id, veterinario_id, created_at desc)
  where editable;
