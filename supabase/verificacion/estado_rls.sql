-- Chequeo de deriva: ¿la RLS viva coincide con lo que dicen las migraciones?
--
-- =========================================================
-- Por qué existe este fichero
-- =========================================================
-- El 2026-09-08, re-ejecutar `0050` por error revirtió el bloqueo de clínica
-- suspendida (`0067`) y **el segundo factor del superadmin** (`0072`). No hubo
-- ningún error: `create or replace function` sobrescribe en silencio, las
-- policies siguieron respondiendo, y la pantalla del MFA siguió apareciendo
-- igual porque es usabilidad, no la barrera. Estuvo así horas.
--
-- Nada en la aplicación lo habría delatado. Esto sí.
--
-- =========================================================
-- Cómo usarlo
-- =========================================================
-- Pégalo entero en el SQL Editor de Supabase y ejecútalo. Es SOLO LECTURA:
-- consulta el catálogo (`pg_proc`, `pg_policies`, `pg_publication_tables`), no
-- toca datos ni permisos.
--
-- Devuelve una fila por control. **Cualquier fila con estado 'FALLA' significa
-- que producción NO coincide con lo que el repo afirma.**
--
-- Cuándo correrlo:
--   · después de aplicar cualquier migración;
--   · después de re-ejecutar cualquier SQL contra producción;
--   · antes de dar por buena una auditoría o un retest;
--   · si algo "funciona pero raro" en permisos.
--
-- ⚠️ Esto NO sustituye probar la RLS con dos sesiones de clínicas distintas.
-- Comprueba que las funciones y policies tengan la FORMA que deben tener, no
-- que se comporten como deben. Es un detector de deriva, no una prueba de
-- aislamiento.

with esperado as (
  -- proname, debe_tener_suspension, debe_tener_mfa, debe_tener_activo, origen
  select * from (values
    ('auth_clinica_id',     false, false, true,  '0050 · identidad, NO lleva suspensión (si la llevara, repetiría H-15)'),
    ('auth_es_personal',    true,  false, true,  '0050 activo + 0067 suspensión'),
    ('auth_es_admin',       true,  false, true,  '0050 activo + 0067 suspensión'),
    ('auth_es_clinico',     true,  false, true,  '0042 + 0067 suspensión'),
    ('auth_ve_expediente',  true,  false, true,  '0053 + 0067 suspensión'),
    ('auth_es_plataforma',  false, true,  true,  '0050 activo + 0072 MFA · sin suspensión: el superadmin no tiene clínica')
  ) as t(proname, susp, mfa, activo, origen)
)
select
  'FUNCIÓN · ' || e.proname as control,
  case
    when p.prosrc is null then 'FALLA'
    when (p.prosrc like '%suspendida%') <> e.susp   then 'FALLA'
    when (p.prosrc like '%mfa_suficiente%') <> e.mfa then 'FALLA'
    when (p.prosrc like '%activo%') <> e.activo      then 'FALLA'
    else 'ok'
  end as estado,
  e.origen as se_espera_por,
  case
    when p.prosrc is null then 'La función NO EXISTE'
    else 'suspension=' || (p.prosrc like '%suspendida%')::text
       || ' mfa=' || (p.prosrc like '%mfa_suficiente%')::text
       || ' activo=' || (p.prosrc like '%activo%')::text
  end as encontrado
from esperado e
left join pg_proc p on p.proname = e.proname

union all

-- Las tres funciones de la Tienda/peluquería NO pueden ser ejecutables por
-- `anon` ni por `PUBLIC` (0047). Ojo: `drop`+`create` reinicia el ACL y vuelve
-- a abrir PUBLIC en silencio; `create or replace` lo preserva.
select
  'ACL · ' || p.proname,
  case when has_function_privilege('anon', p.oid, 'EXECUTE') then 'FALLA' else 'ok' end,
  '0047 · revocada de anon Y de PUBLIC',
  case when has_function_privilege('anon', p.oid, 'EXECUTE')
       then 'anon PUEDE ejecutarla' else 'anon no puede' end
from pg_proc p
where p.proname in ('clinicas_con_catalogo','clinicas_con_peluqueria','servicios_peluqueria_de')

union all

-- `clinicas_para_registro` es la excepción: pública a propósito, la llama
-- `/registro-cliente` antes de que exista ninguna sesión.
select
  'ACL · clinicas_para_registro',
  case when has_function_privilege('anon', p.oid, 'EXECUTE') then 'ok' else 'FALLA' end,
  'Pública A PROPÓSITO — si esto falla, el registro del portal se rompe',
  case when has_function_privilege('anon', p.oid, 'EXECUTE')
       then 'anon puede (correcto)' else 'anon NO puede' end
from pg_proc p where p.proname = 'clinicas_para_registro'

union all

-- Las siete tablas de 0030: toda policy tiene que comprobar el rol
-- (`auth_es_personal` o el más estricto `auth_es_admin`). Es 0045.
select
  'POLICY · ' || pol.tablename || '.' || pol.policyname,
  'FALLA',
  '0045 · toda policy de estas 7 tablas comprueba el rol',
  'Sin auth_es_personal ni auth_es_admin — un cliente del portal entra'
from pg_policies pol
where pol.schemaname = 'public'
  and pol.tablename in ('producto_lotes','proveedores','ordenes_compra','orden_compra_detalles',
                        'petshop_devoluciones','petshop_promociones','petshop_configuracion')
  and (coalesce(pol.qual,'') || coalesce(pol.with_check,'')) not like '%auth_es_personal%'
  and (coalesce(pol.qual,'') || coalesce(pol.with_check,'')) not like '%auth_es_admin%'

union all

-- 0046: la policy que permitía auto-asignarse `superadmin` no debe existir.
select
  'POLICY · usuarios_self_insert',
  'FALLA',
  '0046 · esta policy NO debe existir (permite auto-asignarse superadmin)',
  'EXISTE'
from pg_policies
where schemaname = 'public' and tablename = 'usuarios' and policyname = 'usuarios_self_insert'

union all

-- Ninguna policy de una tabla CLÍNICA puede llevar `auth_es_plataforma()`: el
-- superadmin no ve datos de ningún inquilino. La excepción legítima vive en la
-- Edge Function `respaldo-clinica`, con service_role, no en una policy.
select
  'AISLAMIENTO · ' || tablename || '.' || policyname,
  'FALLA',
  'El superadmin NO puede ver datos clínicos — sin auth_es_plataforma aquí',
  'Lleva auth_es_plataforma() en una tabla clínica'
from pg_policies
where schemaname = 'public'
  and tablename in ('pacientes','clientes','historial_clinico','citas','cobros','cobro_lineas',
                    'recetas','vacunas_aplicadas','desparasitaciones_aplicadas','internaciones',
                    'notas_internacion','consentimientos_cirugia','informes_firmados','estudios',
                    'productos','movimientos_inventario','turnos_caja')
  and (coalesce(qual,'') || coalesce(with_check,'')) like '%auth_es_plataforma%'

union all

-- 0043: sin la tabla en la publicación, `.subscribe()` conecta y no llega ni un
-- evento. Fallo mudo: el modal de Planes no se actualiza y no hay ni un error.
select
  'REALTIME · ' || t.tabla,
  case when exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = t.tabla
  ) then 'ok' else 'FALLA' end,
  '0043 · en la publicación supabase_realtime',
  case when exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = t.tabla
  ) then 'publicada' else 'NO publicada — el realtime no llega y no avisa' end
from (values ('planes'),('configuracion_plataforma')) as t(tabla)

union all

-- Toda función `security definer` necesita `set search_path`; sin él es un
-- vector de escalada. ⚠️ Puede venir del CREATE o de un ALTER FUNCTION
-- posterior (a `auth_sucursal_id` se lo puso 0002, no su definición original),
-- y `proconfig` recoge las dos formas.
select
  'SEARCH_PATH · ' || proname,
  'FALLA',
  'Toda security definer lleva search_path fijado',
  'security definer SIN search_path'
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef
  and not exists (
    select 1 from unnest(coalesce(p.proconfig, '{}')) as c where c like 'search_path=%'
  )
  -- get_citas_end_time se deja a propósito: IMMUTABLE, INVOKER, su cuerpo es
  -- `start_time + interval '30 minutes'` y no resuelve ningún objeto (VUL-38).
  and p.proname <> 'get_citas_end_time'

union all

-- 0075: `citas_personal` perdió el DELETE (era `for all`). Ninguna policy de
-- `citas` puede admitir DELETE — el personal cancela con `actualizarEstadoCita`,
-- nunca borra. `citas_portal` (0004) tampoco lo tenía.
select
  'POLICY · ' || pol.tablename || '.' || pol.policyname,
  'FALLA',
  '0075 · ninguna policy de citas admite DELETE',
  'cmd = ' || pol.cmd || ' — admite DELETE'
from pg_policies pol
where pol.schemaname = 'public' and pol.tablename = 'citas'
  and pol.cmd in ('DELETE', 'ALL')

union all

-- 0076/0077: `paciente_sin_caja()` (trigger before delete en `pacientes`) tiene
-- que seguir bloqueando por historial cerrado E internación de alta, además de
-- los cobros que ya comprobaba desde 0049. Las tres condiciones en la misma
-- función — si falta una, esa puerta vuelve a estar abierta sin que nada lo
-- delate, igual que pasó con `0050`.
select
  'FUNCIÓN · paciente_sin_caja',
  case
    when p.prosrc is null then 'FALLA'
    when p.prosrc not like '%historial_clinico%' or p.prosrc not like '%editable%' then 'FALLA'
    when p.prosrc not like '%internaciones%' or p.prosrc not like '%alta%' then 'FALLA'
    else 'ok'
  end,
  '0049 cobros + 0076 historial cerrado + 0077 internación de alta',
  case
    when p.prosrc is null then 'La función NO EXISTE'
    else 'historial=' || (p.prosrc like '%historial_clinico%' and p.prosrc like '%editable%')::text
       || ' internacion=' || (p.prosrc like '%internaciones%' and p.prosrc like '%alta%')::text
  end
from pg_proc p where p.proname = 'paciente_sin_caja'

union all

-- 0074: `registro_respaldos` es solo INSERT (vía service_role, que no pasa por
-- RLS) y SELECT para el superadmin — ninguna policy debe darle INSERT, UPDATE
-- ni DELETE a un rol de la API (authenticated/anon), o la bitácora dejaría de
-- ser prueba de nada.
select
  'POLICY · ' || pol.tablename || '.' || pol.policyname,
  'FALLA',
  '0074 · registro_respaldos no admite escritura vía API, solo service_role',
  'cmd = ' || pol.cmd || ' — permite escribir desde la API'
from pg_policies pol
where pol.schemaname = 'public' and pol.tablename = 'registro_respaldos'
  and pol.cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')

union all

select
  'RLS · registro_respaldos',
  case when c.relrowsecurity then 'ok' else 'FALLA' end,
  '0074 · RLS debe estar activado',
  case when c.relrowsecurity then 'activado' else 'DESACTIVADO' end
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'registro_respaldos'

-- ⚠️ Ascendente, no descendente, y el motivo no es obvio: en texto 'FALLA' va
-- ANTES que 'ok' (la 'F' pesa menos que la 'o'), así que `asc` es lo que sube
-- las fallas arriba. Este fichero salió con `2 desc` la primera vez y las
-- escondía al final de la lista — que en un chequeo cuyo único propósito es que
-- se vean las fallas, es el peor sitio donde ponerlas.
--
-- Tampoco sirve `order by (estado = 'ok')`: sobre un `union` PostgreSQL solo
-- acepta nombres de columna u ordinales, no expresiones. Daría error de sintaxis.
order by 2, 1;
