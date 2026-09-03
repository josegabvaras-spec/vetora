-- Dos cupos de IA, no uno.
--
-- `ia_limite` (0038) contaba cualquier tarea igual: un aviso redactado en
-- Haiku (~$0,001) gastaba la misma unidad de cupo que una pregunta al
-- copiloto en Sonnet (~$0,017, verificado contra la consola real de
-- Anthropic — no una estimación). Un mes con muchos avisos podía dejar sin
-- cupo al copiloto, y viceversa: la cuota no protegía nada en particular,
-- solo un total mezclado.
--
-- Ahora hay dos: `ia_limite_redaccion` (aviso, aviso_interno, informe — los
-- tres en Haiku 4.5) e `ia_limite_copiloto` (Sonnet 5). Cada uno con su
-- propio contador y su propio periodo, mismo mecanismo que ya prueba
-- `consumir_cuota_whatsapp()` y `consumir_cuota_ia()` original: comprobar y
-- consumir en una sola sentencia.
--
-- Los números de partida, no arbitrarios:
--   · Copiloto se queda EXACTAMENTE con los `ia_limite` de hoy (36/45/60/
--     120/240) — ya están validados en ~5 % del plan en el peor caso.
--   · Redacción se calcula para costar LO MISMO en dólares que el copiloto,
--     no el mismo número de llamadas: como cuesta ~19× menos por llamada,
--     eso es ~20× más cupo. Con ese redondeo, en 4 de los 5 planes el cupo
--     de redacción queda POR ENCIMA del `whatsapp_limite` del mismo plan —
--     o sea, nunca se agota la IA antes que el WhatsApp para enviar el
--     mensaje. La excepción es Multi-sede, cuyo `whatsapp_limite` (20.000)
--     ya es un techo simbólico y no uno real.
--
-- Re-ejecutable de principio a fin, como toda migración de este proyecto.

-- =========================================================
-- 1. Los dos topes, por plan
-- =========================================================
alter table planes add column if not exists ia_limite_redaccion integer not null default 0
  check (ia_limite_redaccion >= 0);
alter table planes add column if not exists ia_limite_copiloto integer not null default 0
  check (ia_limite_copiloto >= 0);

comment on column planes.ia_limite_redaccion is
  'Avisos, notas internas e informes redactados por IA al mes (Haiku 4.5). '
  '0 = sin redacción con IA, aunque el módulo esté. Se consume con '
  'consumir_cuota_ia(''aviso'') o equivalente.';
comment on column planes.ia_limite_copiloto is
  'Preguntas al copiloto por mes (Sonnet 5). 0 = sin copiloto, aunque el '
  'módulo esté. Se consume con consumir_cuota_ia(''copiloto'').';

-- =========================================================
-- 2. Los dos contadores, por clínica
-- =========================================================
alter table clinicas add column if not exists ia_consultas_redaccion integer not null default 0
  check (ia_consultas_redaccion >= 0);
alter table clinicas add column if not exists ia_periodo_redaccion date
  not null default date_trunc('month', now() at time zone 'America/La_Paz')::date;

alter table clinicas add column if not exists ia_consultas_copiloto integer not null default 0
  check (ia_consultas_copiloto >= 0);
alter table clinicas add column if not exists ia_periodo_copiloto date
  not null default date_trunc('month', now() at time zone 'America/La_Paz')::date;

-- =========================================================
-- 3. Migrar lo que ya había, antes de borrar las columnas viejas
-- =========================================================
-- Copiloto hereda el `ia_limite` de hoy tal cual. Redacción es 20× eso —
-- mismo criterio que el punto de partida original de `ia_limite`
-- (`0038`, «3 consultas por dólar»): un número razonado, no medido, y
-- ajustable después desde Plataforma → Planes sin tocar código.
update planes
   set ia_limite_copiloto = ia_limite,
       ia_limite_redaccion = ia_limite * 20
 where ia_limite > 0
   and ia_limite_copiloto = 0
   and ia_limite_redaccion = 0;

update clinicas
   set ia_consultas_redaccion = ia_consultas,
       ia_periodo_redaccion = ia_periodo,
       ia_consultas_copiloto = ia_consultas,
       ia_periodo_copiloto = ia_periodo
 where ia_consultas > 0;

-- =========================================================
-- 4. Fuera las columnas de un solo cupo
-- =========================================================
-- La función que las usaba se reemplaza en el siguiente bloque, así que para
-- cuando se llegue aquí ya no tienen quien las escriba. Dejarlas sería
-- exactamente el tipo de columna muerta que el proyecto no arrastra.
alter table planes drop column if exists ia_limite;
alter table clinicas drop column if exists ia_consultas;
alter table clinicas drop column if exists ia_periodo;

drop function if exists consumir_cuota_ia();

-- =========================================================
-- 5. Consumir la cuota que corresponda
-- =========================================================
-- Dos ramas, no una función genérica con el nombre de columna armado a mano:
-- en una función `security definer` que ejecuta un UPDATE, construir el SQL
-- con el nombre de la columna interpolado es la clase de patrón que este
-- proyecto evita a propósito (ver H-1 en SEGURIDAD.md, mismo espíritu con
-- otro riesgo). Dos ramas estáticas se leen y se auditan sin sorpresas.
--
-- Se sigue consumiendo UNA vez por pregunta del usuario, no por llamada al
-- modelo: el bucle de herramientas del copiloto puede llamar a Sonnet tres
-- veces para responder una sola cosa.
create or replace function consumir_cuota_ia(p_tarea text) returns integer
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_periodo date := date_trunc('month', now() at time zone 'America/La_Paz')::date;
  v_restante integer;
begin
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
