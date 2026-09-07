-- 0072 · Segundo factor obligatorio para el superadmin, aplicado en la RLS.
--
-- El superadmin puede borrar una clínica entera (`eliminar-clinica`), cambiar
-- planes y precios, y pedir el respaldo completo de cualquier inquilino. Hasta
-- hoy todo eso lo protegía **una contraseña y nada más**.
--
-- ⚠️ ESTA MIGRACIÓN ESTÁ ESCRITA PARA NO PODER DEJAR A NADIE FUERA. Es el
-- riesgo real de un cambio así, y hay dos trampas concretas que evita:
--
-- TRAMPA 1 — El arranque de la aplicación.
--   `usuarios_select` decía: `(clinica_id = auth_clinica_id() and
--   auth_es_personal()) or auth_es_plataforma()`. El superadmin tiene
--   `clinica_id = null`, así que la primera rama nunca empareja: **su única vía
--   para leer su propia fila es `auth_es_plataforma()`**. Si esa función pasa a
--   exigir el segundo factor, un superadmin que aún no lo tenga configurado no
--   puede leer su perfil, `AuthContext` no arranca, la aplicación no pinta nada
--   — y por tanto **nunca llega a la pantalla donde configurar el segundo
--   factor**. Cerrado con llave por dentro.
--
--   Por eso lo primero que hace esta migración es añadir `id = auth.uid()` a
--   `usuarios_select`: cualquiera puede leer SU PROPIA fila, siempre. No abre
--   nada —son sus propios datos, y no es el directorio del personal, que es lo
--   que VUL-03 cerró— y es lo que garantiza que la pantalla de configuración
--   del MFA sea siempre alcanzable.
--
-- TRAMPA 2 — Exigir aal2 a quien todavía no tiene con qué darlo.
--   `auth_mfa_suficiente()` NO exige el segundo factor a todo el mundo: lo
--   exige **solo a quien ya tiene un factor verificado**. Quien no lo tiene
--   entra con contraseña, se topa con la pantalla que le obliga a configurarlo,
--   y a partir de ese momento la RLS se lo exige para siempre. Es el patrón que
--   la propia documentación de Supabase recomienda, precisamente para que
--   activar MFA no sea un cambio con ventana de bloqueo.
--
--   Consecuencia honesta que conviene escribir: entre que esto se aplica y que
--   el superadmin configura su factor, **su cuenta sigue protegida solo por la
--   contraseña**. La ventana la cierra él, no la migración.
--
-- `aal` (Authenticator Assurance Level) es un claim del propio JWT que emite
-- Supabase Auth: vale `aal1` con contraseña y pasa a `aal2` al superar el
-- desafío TOTP. No lo escribe la aplicación y no se puede falsificar desde el
-- cliente sin romper la firma del token.

-- ---------------------------------------------------------------------------
-- 1. Que nadie pierda el acceso a su propia fila. Esto va PRIMERO a propósito.
-- ---------------------------------------------------------------------------

drop policy if exists usuarios_select on usuarios;

create policy usuarios_select on usuarios
  for select to authenticated
  using (
    -- Siempre la propia. Es lo que mantiene alcanzable la pantalla del MFA
    -- aunque `auth_es_plataforma()` diga que no (ver TRAMPA 1).
    id = auth.uid()
    or (clinica_id = (select auth_clinica_id()) and (select auth_es_personal()))
    or (select auth_es_plataforma())
  );

-- ---------------------------------------------------------------------------
-- 2. ¿Basta el nivel de autenticación de este JWT?
-- ---------------------------------------------------------------------------

create or replace function auth_mfa_suficiente()
returns boolean
language sql
stable
security definer
set search_path to 'public', 'auth', 'pg_temp'
as $$
  select case
    -- ¿Tiene esta persona un segundo factor ya verificado?
    when exists (
      select 1 from auth.mfa_factors f
      where f.user_id = auth.uid() and f.status = 'verified'
    )
    -- Sí: entonces su sesión tiene que haberlo usado.
    then coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
    -- No: no se le puede exigir lo que aún no tiene. Entra y lo configura.
    else true
  end;
$$;

comment on function auth_mfa_suficiente() is
  'true si el JWT actual alcanza el nivel de autenticación que corresponde a '
  'esta cuenta: aal2 si ya tiene un segundo factor verificado, cualquiera si '
  'todavía no lo tiene. SECURITY DEFINER porque lee auth.mfa_factors, que no '
  'está expuesta a los roles de la aplicación.';

-- SECURITY DEFINER + lectura de `auth`: se acota quién puede llamarla. No es
-- secreta —dice de ti mismo lo que tú ya sabes— pero la costumbre de la casa es
-- no dejar ninguna función con el `execute` a `PUBLIC` por defecto (H de 0047:
-- todo rol es miembro de PUBLIC, `anon` incluido, y el grant por defecto se ve
-- en el ACL como una entrada con beneficiario vacío).
revoke all on function auth_mfa_suficiente() from public;
revoke all on function auth_mfa_suficiente() from anon;
grant execute on function auth_mfa_suficiente() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Ser superadmin ahora incluye haberlo demostrado con dos factores.
-- ---------------------------------------------------------------------------
--
-- Se cambia la función y no las trece policies que la usan: es exactamente el
-- motivo por el que las cuatro `auth_*` existen. Con esto, `clinicas`,
-- `planes`, `pagos_suscripcion`, `invitaciones`, `configuracion_plataforma`,
-- `ia_uso`, `registro_errores`, `sucursales` y `usuarios` quedan cubiertas a la
-- vez, sin tocar ninguna.

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
  'segundo factor no es una pantalla: es la RLS.';

-- ---------------------------------------------------------------------------
-- 4. Para las Edge Functions, que corren con service_role y no tienen auth.uid()
-- ---------------------------------------------------------------------------
--
-- Las cinco funciones con guarda de superadmin (`crear-cuenta`,
-- `eliminar-clinica`, `eliminar-usuario`, `cuentas-portal`,
-- `respaldo-clinica`) usan `service_role`, que **no aplica RLS**: el punto 3 no
-- las protege. Necesitan comprobarlo ellas, y para eso necesitan saber si un
-- usuario concreto tiene factor verificado.
--
-- ⚠️ `security definer` y **solo para `service_role`**: saber quién tiene MFA
-- configurado es justo el dato que ayuda a elegir a quién atacar. No se le da a
-- `authenticated` ni de lejos.

create or replace function tiene_mfa_verificado(p_usuario uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'auth', 'pg_temp'
as $$
  select exists (
    select 1 from auth.mfa_factors f
    where f.user_id = p_usuario and f.status = 'verified'
  );
$$;

comment on function tiene_mfa_verificado(uuid) is
  'Para las Edge Functions con service_role, que no tienen auth.uid(). Solo '
  'service_role puede ejecutarla: saber quién tiene MFA configurado es un dato '
  'que sirve para elegir a quién atacar.';

revoke all on function tiene_mfa_verificado(uuid) from public;
revoke all on function tiene_mfa_verificado(uuid) from anon;
revoke all on function tiene_mfa_verificado(uuid) from authenticated;
grant execute on function tiene_mfa_verificado(uuid) to service_role;
