-- Cuota mensual de mensajes de WhatsApp por plan.
--
-- Dos fallos que arregla:
--
--  1. `services/whatsapp.ts` incrementaba el contador con un `update` sobre
--     `clinicas`, pero el inquilino no tiene ninguna policy de UPDATE ahí
--     (solo `clinicas_select` y `clinicas_plataforma`). El update afectaba
--     0 filas y PostgREST no da error cuando la RLS filtra: el contador se
--     quedaba clavado y todos los planes tenían cuota infinita.
--
--  2. `whatsapp_mensajes_enviados` era un contador de por vida, sin periodo.
--     Aunque el update hubiera funcionado, los 100 mensajes del plan se
--     gastaban una vez y no se liberaban nunca. La interfaz decía «al mes» y
--     el modelo no lo podía expresar.
--
-- Nota: Vetora no llama a ninguna API de WhatsApp. `lib/whatsapp.ts` compone un
-- enlace wa.me que abre una persona. Esta cuota es una palanca comercial, no la
-- repercusión de un coste externo.

-- El periodo se calcula SIEMPRE en la zona de la clínica: en UTC el mes
-- cambiaría a las 20:00 hora de Tarija y el reinicio caería en pleno día de
-- trabajo del día anterior.
alter table clinicas add column if not exists whatsapp_periodo date
  not null default date_trunc('month', now() at time zone 'America/La_Paz')::date;

-- Comprueba y consume en UNA sola sentencia.
--
-- Hacerlo en el cliente es un read-modify-write sobre un contador compartido:
-- dos pestañas leen 99, ambas ven que hay hueco y ambas envían. Aquí la
-- condición del `where` y el incremento son la misma operación, así que la
-- carrera la gana exactamente una.
--
-- `security definer` es deliberado y está acotado a subir este contador. La
-- alternativa —dar al admin una policy de UPDATE sobre `clinicas`— le
-- permitiría cambiarse `plan_id` y `precio_acordado_bs`: subirse de plan solo.
create or replace function consumir_cuota_whatsapp() returns integer
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_periodo date := date_trunc('month', now() at time zone 'America/La_Paz')::date;
  v_restante integer;
begin
  update clinicas c
     set whatsapp_mensajes_enviados =
           -- Primer envío de un mes nuevo: el contador arranca en 1, no suma
           -- sobre el residuo del mes anterior.
           case when c.whatsapp_periodo < v_periodo then 1
                else c.whatsapp_mensajes_enviados + 1 end,
         whatsapp_periodo = v_periodo
    from planes p
   where c.id = auth_clinica_id()
     and p.id = c.plan_id
     and (c.whatsapp_periodo < v_periodo
          or c.whatsapp_mensajes_enviados < p.whatsapp_limite)
  returning p.whatsapp_limite - c.whatsapp_mensajes_enviados into v_restante;

  -- No distingue «sin cuota» de «sin clínica» a propósito: para el superadmin
  -- `auth_clinica_id()` es null y tampoco debe consumir cuota de nadie.
  if not found then
    raise exception 'Se alcanzó el límite mensual de mensajes del plan'
      using errcode = 'P0001';
  end if;

  return v_restante;
end;
$$;

revoke all on function consumir_cuota_whatsapp() from public;
grant execute on function consumir_cuota_whatsapp() to authenticated;
