-- Que suspender una clínica signifique algo para la RLS (VUL-24).
--
-- =========================================================
-- El problema
-- =========================================================
-- `motivoDeBloqueo()` saca de la interfaz a los usuarios de una clínica
-- suspendida, y `CLAUDE.md` lo reconoce desde hace tiempo como fachada:
--
--   «Dejar entrar a un admin suspendido convertiría la suspensión en fachada,
--    porque hoy no está en la RLS: su JWT seguiría leyendo su clínica entera
--    desde PostgREST.»
--
-- `0050` cerró la mitad del problema —`activo = false` en un usuario— pero
-- **no tocó el estado de la clínica**, y su propio comentario lo dejó anotado:
-- «Lo mismo vale para una clínica suspendida, que CLAUDE.md reconocía como
-- pendiente». Sigue pendiente hasta aquí.
--
-- Es la palanca comercial del negocio: una clínica que deja de pagar sigue
-- operando por API. No es fuga entre inquilinos —nadie ve datos ajenos— pero es
-- el control que sostiene el cobro de la suscripción.
--
-- =========================================================
-- ⚠️ DÓNDE VA EL CANDADO, Y POR QUÉ NO EN `auth_clinica_id()`
-- =========================================================
-- Lo obvio sería añadir el estado a `auth_clinica_id()`, que es de donde cuelga
-- todo. **Sería repetir exactamente la regresión H-15.**
--
-- `motivoDeBloqueo()` corre en CADA login de CUALQUIER rol y llama a
-- `clinica_del_portal()`, que resuelve la clínica con `auth_clinica_id()`. Si
-- esa función devolviera null para una clínica suspendida, la RPC no
-- devolvería ninguna fila, y `motivoDeBloqueo()` interpreta el vacío como
-- «La clínica de este usuario ya no existe.» — el usuario quedaría bloqueado,
-- sí, pero con el mensaje equivocado y sin saber que solo tiene que pagar.
--
-- Así que el candado va en las funciones de **permiso**, no en la de
-- **identidad**:
--
--   auth_clinica_id()    → identidad. NO se toca. Sigue diciendo a qué clínica
--                          pertenece el usuario, que es lo que necesita el
--                          login para explicarle por qué no entra.
--   auth_es_personal()   → permiso.
--   auth_es_admin()      → permiso.        Estos cuatro pasan a exigir que la
--   auth_es_clinico()    → permiso.        clínica no esté suspendida.
--   auth_ve_expediente() → permiso.
--   auth_es_plataforma() → NO se toca: el superadmin tiene `clinica_id = null`,
--                          no hay clínica que comprobar, y meterle un join lo
--                          único que haría es poder romper el panel.
--
-- Efecto: el usuario de una clínica suspendida entra al login, recibe el
-- mensaje correcto («La cuenta de X está suspendida. Regulariza el pago…»), y
-- **por PostgREST no lee ni escribe nada**, porque las ~103 policies de negocio
-- cuelgan de esas cuatro funciones.
--
-- ⚠️ Solo bloquea `'suspendida'`. `'demo'` sigue operando: es una clínica de
-- prueba en curso, no una morosa.

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

-- ⚠️ El `join` a `clinicas` es un cambio de forma que importa: antes las cuatro
-- leían **una sola** tabla. `clinicas` está bajo RLS, pero estas funciones son
-- `security definer` —corren como su dueño— así que el join no pasa por la
-- policy y no puede provocar la recursión que tumbó a `0036`. Es el mismo
-- motivo por el que las `auth_*` fueron `security definer` desde `0001`.
--
-- =========================================================
-- PRUEBAS OBLIGATORIAS
-- =========================================================
--   1. Con la clínica ACTIVA: las cuatro devuelven lo de siempre por rol.
--   2. Suspendiendo la clínica (en transacción revertida): las cuatro pasan a
--      false, y `auth_clinica_id()` SIGUE devolviendo la clínica —es lo que
--      necesita el login para dar el mensaje correcto—.
--   3. `clinica_del_portal()` sigue devolviendo la fila con estado
--      'suspendida': sin eso, `motivoDeBloqueo()` diría «ya no existe».
--   4. Un usuario de una clínica suspendida no lee pacientes ni cobros.
--   5. El superadmin sigue entrando a su panel.
