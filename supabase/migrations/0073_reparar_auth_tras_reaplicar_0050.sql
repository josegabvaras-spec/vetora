-- Repara las tres funciones `auth_*` que quedaron revertidas al re-ejecutar
-- `0050` por error el 2026-09-08.
--
-- =========================================================
-- Qué pasó, porque la causa importa más que el arreglo
-- =========================================================
-- `0050`, `0067` y `0072` redefinen funciones que se solapan, y las tres usan
-- `create or replace function`. **Volver a ejecutar una migración vieja no es
-- inocuo: sobrescribe en silencio lo que las posteriores hicieron encima.**
-- No hay error, no hay aviso, y las policies siguen funcionando — solo que con
-- menos condiciones de las que deberían.
--
-- Al re-ejecutar `0050` se perdió:
--
--   auth_es_personal()   ← `0067` le había añadido `c.estado <> 'suspendida'`
--   auth_es_admin()      ← ídem
--   auth_es_plataforma() ← `0072` le había añadido `auth_mfa_suficiente()`,
--                          es decir el SEGUNDO FACTOR del superadmin
--
-- Y NO se perdió, porque `0050` no las toca:
--
--   auth_es_clinico()    ← conserva la versión de `0067`
--   auth_ve_expediente() ← conserva la versión de `0067`
--
-- Ese estado mixto es peor que cualquiera de los dos consistentes: el
-- expediente clínico sí bloqueaba a una clínica suspendida y la agenda no.
--
-- `auth_clinica_id()` se queda como está: es la versión de `0050` y es la
-- correcta — `0067` explica por qué el candado de suspensión NO va ahí (sería
-- repetir la regresión H-15: `motivoDeBloqueo()` la necesita para poder decir
-- «suspendida» en vez de «esta clínica ya no existe»).
--
-- =========================================================
-- La lección operativa
-- =========================================================
-- Una migración aplicada es historia, no un script de mantenimiento. Si hace
-- falta re-ejecutar algo, hay que comprobar antes qué migraciones POSTERIORES
-- tocan los mismos objetos. Para estas funciones, el orden vigente es:
--
--   0050 → activo               (las cuatro)
--   0067 → + suspensión         (personal, admin, clinico, ve_expediente)
--   0072 → + MFA                (plataforma)
--
-- Esta migración deja las seis en su estado correcto de una sola vez, y es
-- re-ejecutable sin daño.

-- ---------------------------------------------------------------------------
-- 1. Restaurar `0067` — las cuatro de suspensión.
--    Se incluyen también las dos que NO se perdieron: reaplicarlas idénticas no
--    cambia nada y garantiza que las cuatro queden coherentes entre sí.
-- ---------------------------------------------------------------------------

create or replace function auth_es_personal() returns boolean
  language sql stable security definer
  set search_path = public, pg_temp
as $$
  select exists (
    select 1 from usuarios u
      join clinicas c on c.id = u.clinica_id
     where u.id = auth.uid() and u.activo
       and c.estado <> 'suspendida'
       and u.rol in ('admin', 'veterinario', 'recepcion', 'peluquero')
  );
$$;

create or replace function auth_es_admin() returns boolean
  language sql stable security definer
  set search_path = public, pg_temp
as $$
  select exists (
    select 1 from usuarios u
      join clinicas c on c.id = u.clinica_id
     where u.id = auth.uid() and u.activo
       and c.estado <> 'suspendida'
       and u.rol = 'admin'
  );
$$;

create or replace function auth_es_clinico() returns boolean
  language sql stable security definer
  set search_path = public, pg_temp
as $$
  select exists (
    select 1 from usuarios u
      join clinicas c on c.id = u.clinica_id
     where u.id = auth.uid() and u.activo
       and c.estado <> 'suspendida'
       and u.rol in ('admin', 'veterinario')
  );
$$;

create or replace function auth_ve_expediente() returns boolean
  language sql stable security definer
  set search_path = public, pg_temp
as $$
  select exists (
    select 1 from usuarios u
      join clinicas c on c.id = u.clinica_id
     where u.id = auth.uid() and u.activo
       and c.estado <> 'suspendida'
       and u.rol in ('admin', 'veterinario', 'recepcion')
  );
$$;

-- ---------------------------------------------------------------------------
-- 2. Restaurar `0072` — el segundo factor del superadmin.
-- ---------------------------------------------------------------------------
--
-- `auth_mfa_suficiente()` NO se recrea aquí: `0050` no la tocó y sigue viva
-- (verificado en producción). Esto solo vuelve a colgar de ella la comprobación
-- que `auth_es_plataforma()` perdió.
--
-- ⚠️ `0067` deliberadamente NO toca esta función —el superadmin tiene
-- `clinica_id = null`, no hay clínica cuyo estado comprobar— así que aquí no
-- va ningún join: solo el rol, `activo` y el nivel de autenticación.

create or replace function auth_es_plataforma()
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select exists (
    select 1 from usuarios where id = auth.uid() and activo and rol = 'superadmin'
  ) and auth_mfa_suficiente();
$$;

comment on function auth_es_plataforma() is
  'true si quien llama es superadmin activo Y su sesión alcanza el nivel de '
  'autenticación que le corresponde (ver auth_mfa_suficiente). Desde 0072 el '
  'segundo factor no es una pantalla: es la RLS. Restaurada por 0073 tras '
  'perderse al re-ejecutar 0050.';

-- =========================================================
-- COMPROBACIÓN (correr después de aplicar)
-- =========================================================
--   select proname,
--          case when prosrc like '%suspendida%' then 'SI' else 'no' end as suspension,
--          case when prosrc like '%mfa%' then 'SI' else 'no' end as mfa
--   from pg_proc
--   where proname in ('auth_clinica_id','auth_es_personal','auth_es_admin',
--                     'auth_es_clinico','auth_ve_expediente','auth_es_plataforma')
--   order by proname;
--
-- Esperado: suspension = SI en personal/admin/clinico/ve_expediente y `no` en
-- clinica_id y plataforma; mfa = SI solo en plataforma.
