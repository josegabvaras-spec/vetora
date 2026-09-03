-- Cuota y bitácora del copiloto de IA.
--
-- Va ANTES que la clave de Anthropic, y ese orden no es casual. Hoy la función
-- `asistente` está desplegada pero nunca ha llamado al modelo porque
-- `ANTHROPIC_API_KEY` no está en los secretos: todo sale de las plantillas
-- deterministas. El día que se ponga la clave, sin nada de esto, **una sola
-- clínica podría vaciar la cuenta de Anthropic de la plataforma** — el modelo
-- se cobra por token y los planes de Vetora cuestan entre 12 y 80 dólares al
-- mes fijos.
--
-- Aquí no se inventa nada: se copian los dos patrones que el proyecto ya tiene
-- probados.
--
--   · La cuota, de `consumir_cuota_whatsapp()` (0005): comprobar y consumir en
--     UNA sola sentencia, contador con su periodo, reinicio por comparación de
--     mes y no a medianoche.
--   · La bitácora, de `registro_errores` (0018): solo INSERT, `clinica_id` por
--     defecto, y lectura reservada a la plataforma.
--
-- Re-ejecutable de principio a fin: `0036` no lo era y reventó a medio aplicar.

-- =========================================================
-- 1. El tope, por plan
-- =========================================================
-- Nace en CERO a propósito: un plan que no contrata el módulo no gasta ni un
-- token, y un plan nuevo creado desde el panel tampoco hasta que alguien le
-- ponga una cifra. La palanca es siempre explícita.
alter table planes add column if not exists ia_limite integer not null default 0
  check (ia_limite >= 0);

comment on column planes.ia_limite is
  'Consultas al copiloto de IA por mes. 0 = sin copiloto, aunque el plan traiga '
  'el módulo asistente_ia. Se consume con consumir_cuota_ia().';

-- =========================================================
-- 2. El contador, por clínica
-- =========================================================
alter table clinicas add column if not exists ia_consultas integer not null default 0
  check (ia_consultas >= 0);

-- El periodo se calcula SIEMPRE en la zona de la clínica, igual que el de
-- WhatsApp: en UTC el mes cambiaría a las 20:00 de Bolivia y el reinicio caería
-- en pleno día de trabajo del día anterior.
alter table clinicas add column if not exists ia_periodo date
  not null default date_trunc('month', now() at time zone 'America/La_Paz')::date;

-- =========================================================
-- 3. Consumir la cuota
-- =========================================================
-- Copia estructural de `consumir_cuota_whatsapp()`, con UNA diferencia que no
-- se puede omitir:
--
--   `and p.ia_limite > 0`
--
-- La de WhatsApp no la lleva porque su columna tiene `check (>= 1)`: nunca es
-- cero. Aquí sí puede serlo, y sin esa condición la rama `ia_periodo < v_periodo`
-- del `or` dejaría pasar la PRIMERA consulta de cada mes a un plan con tope
-- cero — una consulta gratis al mes para quien no contrató el copiloto.
--
-- `security definer` por el mismo motivo que la de WhatsApp: dar al admin una
-- policy de UPDATE sobre `clinicas` le permitiría cambiarse `plan_id` y
-- `precio_acordado_usd`, es decir, subirse de plan él solo.
--
-- Se consume UNA vez por pregunta del usuario, no por llamada al modelo: un
-- bucle de herramientas puede llamar a Claude tres veces para responder una
-- sola cosa, y cobrarle tres al usuario sería mentirle sobre lo que gasta.
create or replace function consumir_cuota_ia() returns integer
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_periodo date := date_trunc('month', now() at time zone 'America/La_Paz')::date;
  v_restante integer;
begin
  update clinicas c
     set ia_consultas =
           -- Primera consulta de un mes nuevo: arranca en 1, no suma sobre el
           -- residuo del mes anterior.
           case when c.ia_periodo < v_periodo then 1
                else c.ia_consultas + 1 end,
         ia_periodo = v_periodo
    from planes p
   where c.id = auth_clinica_id()
     and p.id = c.plan_id
     and p.ia_limite > 0
     and (c.ia_periodo < v_periodo or c.ia_consultas < p.ia_limite)
  returning p.ia_limite - c.ia_consultas into v_restante;

  -- No distingue «sin cuota» de «sin clínica» ni de «plan sin copiloto», igual
  -- que su gemela: para el superadmin `auth_clinica_id()` es null y tampoco
  -- debe gastar la cuota de nadie.
  if not found then
    raise exception 'Se alcanzó el límite mensual de consultas de IA del plan'
      using errcode = 'P0001';
  end if;

  return v_restante;
end;
$$;

revoke all on function consumir_cuota_ia() from public;
grant execute on function consumir_cuota_ia() to authenticated;

-- =========================================================
-- 4. La bitácora
-- =========================================================
-- Mismo molde que `registro_errores` (0018). Sirve para responder «¿cuánto nos
-- está costando esta clínica?», que es una pregunta de la plataforma, no de la
-- clínica: para lo suyo le basta el contador de `clinicas`, que ya puede leer
-- con `clinicas_select`.
--
-- Lo que NO se guarda: ni la pregunta del usuario, ni la respuesta del modelo,
-- ni ningún identificador de paciente. Una bitácora de costes no necesita el
-- contenido clínico, y lo que no se guarda no se filtra.
create table if not exists ia_uso (
  id uuid primary key default gen_random_uuid(),
  -- Nulo si el fallo ocurrió sin sesión resuelta.
  clinica_id uuid references clinicas (id) on delete cascade default auth_clinica_id(),
  usuario_id uuid references usuarios (id) on delete set null,

  modelo text not null,
  -- 'aviso', 'aviso_interno', 'informe', 'copiloto'…
  tarea text not null,
  -- Qué herramientas se consultaron. Nombres, nunca sus resultados.
  herramientas text[] not null default '{}',

  tokens_entrada integer not null default 0 check (tokens_entrada >= 0),
  tokens_salida integer not null default 0 check (tokens_salida >= 0),
  -- Seis decimales: una consulta cuesta céntimos de céntimo y redondear a dos
  -- las contaría todas como cero.
  costo_estimado_usd numeric(12, 6) not null default 0 check (costo_estimado_usd >= 0),
  duracion_ms integer not null default 0 check (duracion_ms >= 0),

  resultado text not null check (resultado in ('ok', 'error', 'rechazo', 'sin_cuota')),
  created_at timestamptz not null default now()
);

-- La consulta de la plataforma es siempre «lo último» o «este mes».
create index if not exists ia_uso_reciente on ia_uso (created_at desc);
create index if not exists ia_uso_por_clinica on ia_uso (clinica_id, created_at desc);

alter table ia_uso enable row level security;

drop policy if exists ia_uso_insert on ia_uso;
drop policy if exists ia_uso_plataforma on ia_uso;

-- Cualquiera con sesión puede dejar constancia de lo que acaba de gastar. Es la
-- función `asistente` quien lo inserta, y lo hace **con el token de quien
-- llama** —no con `service_role`—, así que esta policy es la que aplica.
--
-- `is not distinct from` y no `=`: para el superadmin `auth_clinica_id()` es
-- null, y `null = null` da null, que la policy trataría como falso.
create policy ia_uso_insert on ia_uso for insert
  with check (
    auth.uid() is not null
    and clinica_id is not distinct from (select auth_clinica_id())
  );

-- Solo la plataforma la lee: es su factura de Anthropic la que se está midiendo.
create policy ia_uso_plataforma on ia_uso for select
  using ((select auth_es_plataforma()));

-- Sin UPDATE ni DELETE: una bitácora que se puede reescribir no sirve de nada.

-- =========================================================
-- 5. Un tope inicial para los planes que ya traen el módulo
-- =========================================================
-- Sin esto, poner la clave no encendería nada: todos los planes quedarían en
-- cero y el copiloto seguiría cayendo a plantilla, que es indistinguible de
-- «no está configurado».
--
-- La cifra sale de la aritmética del negocio, no de un número redondo. Una
-- consulta del copiloto son unas tres llamadas al modelo con sus herramientas:
-- del orden de 0,03 USD con Sonnet. A **3 consultas por dólar de suscripción**,
-- el coste del copiloto queda cerca del 9 % de lo que paga la clínica, que deja
-- margen para el resto de la operación.
--
--   PetShop  $12 -> 36     Clínica    $40 -> 120
--   Peluq.   $15 -> 45     Multi-sede $80 -> 240
--   Consult. $20 -> 60
--
-- Es un punto de partida deliberadamente conservador, y se ajusta por plan
-- desde el panel de plataforma. Se aplica solo a quien ya tiene el módulo: un
-- plan sin `asistente_ia` sigue en cero.
update planes
   set ia_limite = greatest(round(precio_mensual_usd * 3)::integer, 10)
 where 'asistente_ia' = any (modulos_habilitados)
   and ia_limite = 0;
