-- Resumen mensual de gasto de IA por clínica, para la alerta de plataforma.
--
-- El cupo de `consumir_cuota_ia()` (0038/0039) mide CUÁNTAS veces pregunta
-- una clínica, no cuántos dólares le cuesta cada vez: el copiloto tiene un
-- techo de tokens por vuelta (`max_tokens: 16000` en `orquestador.ts`) y hasta
-- seis vueltas, pero ningún tope en dólares. El supuesto del diseño es que el
-- costo por consulta es más o menos parejo entre clínicas; esta función es
-- para poder comprobarlo, no para sustituir el cupo.
--
-- `security definer` no hace falta y a propósito no se usa: la policy
-- `ia_uso_plataforma` (0038) ya es `using (auth_es_plataforma())` sin
-- excepción por clínica, así que para cualquier caller que no sea la
-- plataforma el `join` contra `ia_uso` devuelve cero filas y la función
-- entera sale vacía. Añadir `security definer` aquí sería repetir la barrera
-- que la RLS ya pone, con el riesgo de que las dos diverjan con el tiempo.
create or replace function ia_uso_resumen_mensual()
returns table (
  clinica_id uuid,
  clinica_nombre text,
  consultas_copiloto bigint,
  costo_copiloto_usd numeric,
  consultas_redaccion bigint,
  costo_redaccion_usd numeric
)
language sql
stable
set search_path = public, pg_temp
as $$
  select
    resumen.clinica_id,
    resumen.clinica_nombre,
    resumen.consultas_copiloto,
    resumen.costo_copiloto_usd,
    resumen.consultas_redaccion,
    resumen.costo_redaccion_usd
  from (
    select
      c.id as clinica_id,
      c.nombre as clinica_nombre,
      -- 'copiloto' es Sonnet, ~19x el costo del resto (aviso/aviso_interno/
      -- informe, todas en Haiku): mezclarlas en un solo
      -- promedio compararía cosas que no son comparables.
      count(*) filter (where u.tarea = 'copiloto') as consultas_copiloto,
      coalesce(sum(u.costo_estimado_usd) filter (where u.tarea = 'copiloto'), 0) as costo_copiloto_usd,
      count(*) filter (where u.tarea <> 'copiloto') as consultas_redaccion,
      coalesce(sum(u.costo_estimado_usd) filter (where u.tarea <> 'copiloto'), 0) as costo_redaccion_usd
    from ia_uso u
    join clinicas c on c.id = u.clinica_id
    -- Mes de la clínica en La Paz, igual que `v_periodo` en consumir_cuota_ia():
    -- en UTC el corte de mes caería a las 20:00 de Bolivia, en pleno día hábil.
    where u.created_at >= date_trunc('month', now() at time zone 'America/La_Paz')
      -- Solo lo que de verdad costó: un intento rechazado por falta de cupo
      -- (P0001, 'sin_cuota') o un error nunca llegó a llamar al modelo.
      and u.resultado = 'ok'
    group by c.id, c.nombre
  ) resumen
  order by (resumen.costo_copiloto_usd + resumen.costo_redaccion_usd) desc;
$$;

revoke all on function ia_uso_resumen_mensual() from public;
grant execute on function ia_uso_resumen_mensual() to authenticated;
