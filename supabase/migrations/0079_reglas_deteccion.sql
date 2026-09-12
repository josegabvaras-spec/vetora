-- Reglas de detección sobre `eventos_seguridad` (fase 2).
--
-- =========================================================
-- Por qué reglas y no un modelo
-- =========================================================
-- El propio encargo lo pide explícitamente, y es la decisión correcta: «no
-- utilizar un LLM para algo que pueda resolverse de forma más segura y
-- económica con una regla determinística». Contar tres exportaciones en una
-- hora es una consulta SQL, cuesta cero y da el mismo resultado siempre. Un
-- modelo, para lo mismo, cuesta dinero, tarda, y puede contestar distinto dos
-- veces seguidas.
--
-- Estas reglas son la primera pasada de un embudo: lo que ELLAS marcan es lo
-- único que más adelante se le manda a un modelo para que lo interprete. Sin
-- este filtro, analizar cada evento con IA sería caro y ruidoso a la vez.
--
-- =========================================================
-- La decisión de diseño: INVOKER, no DEFINER
-- =========================================================
-- Esta función NO es `security definer`, al revés que casi todas las demás del
-- proyecto — y es deliberado. Al correr con los privilegios de quien llama, la
-- RLS de `eventos_seguridad` se aplica sola: el superadmin analiza todos los
-- eventos, el `admin` analiza solo los de su clínica, y recepción no ve nada
-- porque no ve ni la tabla. Una sola función sirve a los dos casos sin una
-- línea de código que decida quién ve qué — que es justo la línea que algún
-- día se escribiría mal.
--
-- Hacerla `security definer` habría abierto exactamente el acceso lateral que
-- el resto del proyecto evita: el análisis de una clínica leyendo eventos de
-- otra.

/**
 * Corre las reglas determinísticas sobre las últimas `p_horas` de eventos.
 *
 * Devuelve una fila por anomalía detectada. Cero filas es la respuesta normal
 * y sana: significa que no hay nada raro, no que el análisis fallara.
 */
create or replace function analizar_eventos_seguridad(p_horas integer default 24)
returns table (
  regla text,
  severidad text,
  clinica_id uuid,
  usuario_id uuid,
  eventos integer,
  primero timestamptz,
  ultimo timestamptz,
  detalle jsonb
)
  language sql
  stable
  set search_path = public, pg_temp
as $$
  with ventana as (
    select *
      from eventos_seguridad
     -- `greatest` acota el abuso del parámetro: pedir un millón de horas
     -- convertiría una consulta acotada en un barrido de toda la tabla.
     where created_at >= now() - make_interval(hours => least(greatest(p_horas, 1), 720))
  ),

  -- ⚠️ Las reglas van dentro de un CTE y el `order by` va FUERA, en el select
  -- final. Sobre un `union`, PostgreSQL solo acepta nombres de columna u
  -- ordinales en el `order by`, no expresiones — así que ordenar por severidad
  -- real (crítica antes que alta antes que media) sería un error de sintaxis
  -- ahí dentro. Es la misma trampa que ya documenta `estado_rls.sql`, donde
  -- además el orden alfabético engañaba: 'alta' < 'critica' < 'media'.
  anomalias as (

  -- ---------------------------------------------------------------
  -- 1. Exportaciones repetidas por la misma persona.
  --
  -- Una clínica exporta su respaldo de vez en cuando; tres veces en una hora
  -- no es una copia de seguridad, es alguien llevándose los datos —o probando
  -- hasta que le sale—. Es la señal más cercana a exfiltración que este
  -- sistema puede dar, porque el respaldo ES el expediente completo.
  -- ---------------------------------------------------------------
  -- ⚠️ Los alias y los `::text` van en ESTA rama y no en las demás a
  -- propósito: en un `union`, los nombres y los tipos de columna los fija la
  -- primera rama. Sin los alias, las dos primeras columnas se llamarían
  -- `?column?` y el `select` final no podría referirse a `regla` ni a
  -- `severidad`; sin los casts, los literales quedarían con tipo `unknown`.
  select
    'exportaciones_repetidas'::text as regla,
    'alta'::text as severidad,
    v.clinica_id as clinica_id,
    v.usuario_id as usuario_id,
    count(*)::integer as eventos,
    min(v.created_at) as primero,
    max(v.created_at) as ultimo,
    jsonb_build_object('umbral', 3, 'ventana_horas', 1) as detalle
  from ventana v
  where v.tipo = 'respaldo_exportado'
    and v.created_at >= now() - interval '1 hour'
  group by v.clinica_id, v.usuario_id
  having count(*) >= 3

  union all

  -- ---------------------------------------------------------------
  -- 2. Escalada a administrador.
  --
  -- No necesita umbral: UNA sola vez ya merece que alguien lo mire. `admin` es
  -- el rol que puede ver el expediente entero, exportar los datos y gestionar
  -- al resto del personal. Que suceda es normal; que suceda sin que nadie lo
  -- sepa, no.
  -- ---------------------------------------------------------------
  select
    'escalada_a_admin'::text,
    'alta'::text,
    v.clinica_id,
    v.usuario_id,
    count(*)::integer,
    min(v.created_at),
    max(v.created_at),
    jsonb_build_object('afectados', jsonb_agg(v.detalle -> 'usuario_afectado'))
  from ventana v
  where v.tipo = 'rol_cambiado'
    and v.detalle ->> 'rol_nuevo' = 'admin'
  group by v.clinica_id, v.usuario_id

  union all

  -- ---------------------------------------------------------------
  -- 3. Bajas de personal en ráfaga.
  --
  -- Desactivar corta el acceso de verdad desde `0050`. Tres en una hora es o
  -- una limpieza legítima de fin de temporada, o alguien dejando a una clínica
  -- sin quien la gestione. Las dos merecen una mirada; solo una es un ataque.
  -- ---------------------------------------------------------------
  select
    'bajas_en_rafaga'::text,
    'alta'::text,
    v.clinica_id,
    v.usuario_id,
    count(*)::integer,
    min(v.created_at),
    max(v.created_at),
    jsonb_build_object('umbral', 3, 'ventana_horas', 1)
  from ventana v
  where v.tipo = 'usuario_desactivado'
    and v.created_at >= now() - interval '1 hour'
  group by v.clinica_id, v.usuario_id
  having count(*) >= 3

  union all

  -- ---------------------------------------------------------------
  -- 4. Actividad sensible de madrugada.
  --
  -- En la zona de la clínica (`America/La_Paz`, la misma que usa
  -- `lib/datetime.ts` para todo lo demás — mezclar zonas aquí daría alertas
  -- fantasma cada noche). Entre las 23:00 y las 05:00 una veterinaria puede
  -- tener una urgencia, y por eso un login normal NO dispara nada: solo cuenta
  -- lo que ya nació con severidad media o superior (cambios de rol, bajas,
  -- exportaciones, suspensiones).
  -- ---------------------------------------------------------------
  select
    'actividad_de_madrugada'::text,
    'media'::text,
    v.clinica_id,
    v.usuario_id,
    count(*)::integer,
    min(v.created_at),
    max(v.created_at),
    jsonb_build_object('tipos', jsonb_agg(distinct v.tipo))
  from ventana v
  where v.severidad in ('media', 'alta', 'critica')
    -- Paréntesis explícitos: sin ellos esto depende de que `and` ligue más
    -- fuerte que `or`, que es cierto pero es exactamente el tipo de detalle
    -- que alguien rompe al editar la condición seis meses después.
    and (
      extract(hour from v.created_at at time zone 'America/La_Paz') >= 23
      or extract(hour from v.created_at at time zone 'America/La_Paz') < 5
    )
  group by v.clinica_id, v.usuario_id

  union all

  -- ---------------------------------------------------------------
  -- 5. Ráfaga de accesos con la misma cuenta.
  --
  -- Diez inicios de sesión de la misma persona en una hora no es una persona:
  -- es una credencial compartida entre varios puestos, un script, o una sesión
  -- que se reinicia sola. Ninguna de las tres es un ataque por sí misma, y por
  -- eso es `media` y no `alta` — pero una credencial compartida es la vía por
  -- la que después nadie sabe quién hizo qué.
  -- ---------------------------------------------------------------
  select
    'rafaga_de_accesos'::text,
    'media'::text,
    v.clinica_id,
    v.usuario_id,
    count(*)::integer,
    min(v.created_at),
    max(v.created_at),
    jsonb_build_object('umbral', 10, 'ventana_horas', 1)
  from ventana v
  where v.tipo = 'login_exitoso'
    and v.created_at >= now() - interval '1 hour'
  group by v.clinica_id, v.usuario_id
  having count(*) >= 10

  )

  select
    a.regla, a.severidad, a.clinica_id, a.usuario_id,
    a.eventos, a.primero, a.ultimo, a.detalle
  from anomalias a
  order by
    case a.severidad
      when 'critica' then 1
      when 'alta' then 2
      when 'media' then 3
      else 4
    end,
    a.ultimo desc;
$$;

comment on function analizar_eventos_seguridad(integer) is
  'Reglas deterministas sobre eventos_seguridad. INVOKER a proposito: la RLS '
  'acota sola el alcance (la plataforma ve todo, el admin solo su clinica). '
  'Cero filas significa que no hay anomalias, no que fallara. Es el filtro '
  'previo a cualquier analisis con IA: solo lo que estas reglas marcan merece '
  'gastar una llamada al modelo.';

-- Sin `revoke`/`grant`: al ser INVOKER y no leer nada que la RLS no permita
-- ya, que `PUBLIC` pueda ejecutarla no concede nada — un `anon` que la llame
-- recibe cero filas, porque cero filas es lo que ve de `eventos_seguridad`.
-- (No es la situación de `0047`: allí las funciones eran `security definer` y
-- sí devolvían datos reales a quien no debía.)

-- =========================================================
-- PRUEBAS OBLIGATORIAS
-- =========================================================
--   1. Sin eventos en la ventana: devuelve cero filas, no error.
--   2. Con sesión de admin de la clínica A: ninguna fila trae `clinica_id` de
--      la clínica B, aunque B tenga anomalías.
--   3. Con la clave anónima: cero filas.
--   4. Tres exportaciones seguidas con la misma cuenta: aparece
--      `exportaciones_repetidas` con `eventos = 3`.
--   5. `analizar_eventos_seguridad(100000)`: no barre la tabla entera, el
--      `least(...)` lo acota a 720 horas.
