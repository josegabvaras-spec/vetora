-- Las cuotas de WhatsApp e IA solo las consume el personal.
--
-- ⚠️ NO APLICADA TODAVÍA. Escrita para revisión; se aplica cuando se apruebe.
--
-- Las dos funciones son `security definer` y su única condición es
-- `c.id = auth_clinica_id()`. No miran el rol. Un cliente del portal tiene
-- `clinica_id`, así que puede llamarlas en bucle por
-- `POST /rest/v1/rpc/consumir_cuota_whatsapp` y dejar a su propia clínica sin
-- recordatorios y sin copiloto el resto del mes.
--
-- La Edge Function `asistente` sí rechaza al rol `cliente` en `autorizar()`,
-- pero el RPC directo no pasa por ella: PostgREST lo expone igual.
--
-- El cuerpo de las dos se conserva **exactamente** como está desplegado; lo
-- único que se añade es el guard de rol al principio. Se reproducen enteras
-- porque `create or replace function` no admite parches parciales.

-- =========================================================
-- WhatsApp
-- =========================================================
create or replace function consumir_cuota_whatsapp() returns integer
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_periodo date := date_trunc('month', now() at time zone 'America/La_Paz')::date;
  v_restante integer;
begin
  -- Guard nuevo. Va antes del update: un cliente del portal no debe poder
  -- gastar el cupo de la clínica ni siquiera una vez.
  if not auth_es_personal() then
    raise exception 'Solo el personal de la clínica puede enviar mensajes'
      using errcode = 'P0001';
  end if;

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

-- =========================================================
-- IA — dos cupos, misma corrección
-- =========================================================
create or replace function consumir_cuota_ia(p_tarea text) returns integer
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_periodo date := date_trunc('month', now() at time zone 'America/La_Paz')::date;
  v_restante integer;
begin
  -- Mismo guard que su gemela de WhatsApp, y por el mismo motivo.
  if not auth_es_personal() then
    raise exception 'Solo el personal de la clínica puede usar el asistente'
      using errcode = 'P0001';
  end if;

  if p_tarea = 'copiloto' then
    update clinicas c
       set ia_consultas_copiloto =
             case when c.ia_periodo_copiloto < v_periodo then 1
                  else c.ia_consultas_copiloto + 1 end,
           ia_periodo_copiloto = v_periodo
      from planes p
     where c.id = auth_clinica_id()
       and p.id = c.plan_id
       and p.ia_limite_copiloto > 0
       and (c.ia_periodo_copiloto < v_periodo or c.ia_consultas_copiloto < p.ia_limite_copiloto)
    returning p.ia_limite_copiloto - c.ia_consultas_copiloto into v_restante;
  else
    update clinicas c
       set ia_consultas_redaccion =
             case when c.ia_periodo_redaccion < v_periodo then 1
                  else c.ia_consultas_redaccion + 1 end,
           ia_periodo_redaccion = v_periodo
      from planes p
     where c.id = auth_clinica_id()
       and p.id = c.plan_id
       and p.ia_limite_redaccion > 0
       and (c.ia_periodo_redaccion < v_periodo or c.ia_consultas_redaccion < p.ia_limite_redaccion)
    returning p.ia_limite_redaccion - c.ia_consultas_redaccion into v_restante;
  end if;

  -- No distingue «sin cuota» de «sin clínica» ni de «plan sin este cupo», ni
  -- cuál de las dos ramas fue: para el superadmin `auth_clinica_id()` es
  -- null y tampoco debe consumir cuota de nadie.
  if not found then
    raise exception 'Se alcanzó el límite mensual de consultas de IA del plan'
      using errcode = 'P0001';
  end if;

  return v_restante;
end;
$$;

revoke all on function consumir_cuota_ia(text) from public;
grant execute on function consumir_cuota_ia(text) to authenticated;
