-- Bitácora de eventos de seguridad — la base del sistema de detección.
--
-- =========================================================
-- Por qué existe
-- =========================================================
-- El proyecto ya tiene tres bitácoras, y cada una cubre UNA cosa concreta:
-- `registro_errores` (fallos técnicos), `ia_uso` (coste del modelo) y
-- `registro_respaldos` (quién extrajo los datos de una clínica, `0074`). Lo
-- que no existía es el registro de los **actos con significado de seguridad**
-- que la aplicación ya realiza todos los días y que hoy no dejan rastro
-- consultable: quién entró, a quién le cambiaron el rol, quién desactivó una
-- cuenta, quién exportó el respaldo de su propia clínica, quién vinculó una
-- cuenta del portal a una ficha.
--
-- Sin esa tabla no hay nada que analizar: cualquier regla de detección o
-- agente de IA posterior necesita una secuencia de eventos sobre la que
-- razonar. Esta migración es esa secuencia, y nada más — no detecta, no
-- alerta, no decide. Solo registra, de forma que no se pueda falsificar.
--
-- =========================================================
-- La decisión de diseño que lo sostiene todo
-- =========================================================
-- **El actor NO lo manda el cliente: lo deriva el servidor del JWT.**
-- `registrar_evento_seguridad()` es `security definer` y toma `auth.uid()` y
-- `auth_clinica_id()` por su cuenta. Si el `usuario_id` viniera como
-- parámetro, cualquiera con la clave anónima —que viaja en el bundle— podría
-- escribir «el admin exportó los datos» y la bitácora dejaría de probar nada.
-- Es el mismo criterio por el que `0074` no tiene policy de INSERT: una
-- bitácora que el propio auditado puede escribir a mano no es una bitácora.
--
-- =========================================================
-- Lo que esta tabla NO registra, y por qué
-- =========================================================
-- ⚠️ **No registra logins fallidos.** Un intento fallido ocurre **sin
-- sesión**: para escribirlo haría falta abrir esta función a `anon`, y en ese
-- momento cualquiera en internet podría inundarla con «login fallido de
-- victima@clinica.com» — ruido fabricado dentro del registro que sirve para
-- detectar ataques, que es exactamente el peor sitio donde aceptar datos no
-- verificables. Lo que sí frena el abuso real por esa vía ya existe y no
-- necesita esta tabla: `consumir_intento_publico()` (`0068`) cuenta por IP sin
-- guardar nada falsificable, y Supabase Auth aplica su propio límite sobre
-- `/auth/v1/*`. Un fallo de login queda además en los logs de Auth del panel
-- de Supabase, que son de solo lectura y no los escribe la aplicación.
--
-- No registra tampoco NINGÚN dato clínico. El `detalle` es contexto mínimo de
-- la acción (qué rol se cambió, cuántas filas se exportaron), nunca el
-- contenido de lo que se tocó. Mismo criterio que `ia_uso`, que a propósito no
-- guarda la pregunta ni la respuesta: lo que no se guarda no se filtra.

create table eventos_seguridad (
  id uuid primary key default gen_random_uuid(),

  -- Sin FK a `usuarios`, igual que `registro_respaldos`: el registro de que
  -- alguien HIZO algo tiene que sobrevivir a que su cuenta se borre después.
  -- Null solo si el evento lo genera el sistema sin actor identificable.
  usuario_id uuid,

  -- La clínica del ACTOR, derivada del servidor — null cuando actúa el
  -- superadmin, que no tiene clínica por constraint.
  --
  -- ⚠️ Con `on delete cascade`, y es deliberado: el contrato con las clínicas
  -- y la política de privacidad prometen que dar de baja una clínica elimina
  -- sus datos «de forma completa e irreversible». Una bitácora que sobreviviera
  -- a esa baja convertiría esa promesa en falsa. Los eventos de plataforma que
  -- SÍ deben sobrevivir a la baja de una clínica (por ejemplo, que un
  -- superadmin la borró) se registran con `clinica_id` null y la clínica
  -- afectada dentro de `detalle`, que es texto y no una FK.
  clinica_id uuid references clinicas (id) on delete cascade,

  -- La lista es cerrada a propósito: un `check` en vez de texto libre obliga a
  -- que añadir un tipo de evento sea una migración, revisable, y no una cadena
  -- suelta escrita en un servicio que nadie vuelve a leer.
  tipo text not null check (tipo in (
    -- Sesión e identidad
    'login_exitoso',
    'password_cambiado',
    'mfa_activado',
    'mfa_desactivado',
    'sesion_bloqueada',
    -- Cambios sobre cuentas (los hace el superadmin o un admin)
    'rol_cambiado',
    'usuario_activado',
    'usuario_desactivado',
    'usuario_borrado',
    'usuario_creado',
    -- Ciclo de vida de la clínica (plataforma)
    'clinica_suspendida',
    'clinica_reactivada',
    'clinica_borrada',
    -- Datos que salen del sistema
    'respaldo_exportado',
    -- Vínculo de cuentas del portal con fichas de cliente
    'cuenta_portal_vinculada',
    'cuenta_portal_desvinculada'
  )),

  severidad text not null default 'info'
    check (severidad in ('info', 'baja', 'media', 'alta', 'critica')),

  -- Contexto mínimo, en JSON para no añadir una columna por cada tipo de
  -- evento. Lo que va aquí es "qué se tocó", nunca "qué decía lo que se tocó".
  detalle jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now()
);

-- Los dos accesos reales: «los últimos eventos de esta clínica» (panel del
-- admin) y «los últimos eventos de todo» (plataforma). Los dos ordenan por
-- fecha descendente, así que el índice la lleva en ese orden.
create index idx_eventos_seguridad_clinica on eventos_seguridad (clinica_id, created_at desc);
create index idx_eventos_seguridad_fecha on eventos_seguridad (created_at desc);
create index idx_eventos_seguridad_usuario on eventos_seguridad (usuario_id, created_at desc);

comment on table eventos_seguridad is
  'Bitácora de actos con significado de seguridad (login, cambios de rol, '
  'bajas de cuenta, exportaciones, vínculos de portal). El actor lo deriva el '
  'servidor del JWT, nunca el cliente. No registra logins fallidos (ocurren '
  'sin sesión y serían falsificables) ni ningún dato clínico.';

alter table eventos_seguridad enable row level security;

-- La plataforma lo ve todo: es quien opera el sistema.
create policy eventos_seguridad_plataforma on eventos_seguridad for select
  to authenticated
  using ((select auth_es_plataforma()));

-- Y el admin ve lo de SU clínica, que es una función real y no solo
-- telemetría para el operador: «¿quién exportó mis datos?», «¿quién le cambió
-- el rol a esta persona?» son preguntas que le tocan a la clínica responder
-- ante su propio cliente, no a Vetora — y desde el informe jurídico sabemos
-- que la clínica es la responsable del tratamiento y Vetora la encargada.
--
-- Solo `admin`: `auth_es_admin()` ya exige además `activo` y clínica no
-- suspendida (`0050` + `0067`). Recepción y el resto del personal no lo ven —
-- saber quién desactivó a quién no es parte de su trabajo.
create policy eventos_seguridad_admin on eventos_seguridad for select
  to authenticated
  using (clinica_id = (select auth_clinica_id()) and (select auth_es_admin()));

-- Sin policy de INSERT, UPDATE ni DELETE para nadie. Se escribe solo con la
-- función de abajo (`security definer`, se salta la RLS) y no se edita jamás.

/**
 * Registra un evento de seguridad atribuyéndolo a quien llama.
 *
 * ⚠️ `usuario_id` y `clinica_id` se derivan aquí dentro con `auth.uid()` y
 * `auth_clinica_id()`. No son parámetros a propósito: si lo fueran, la
 * bitácora aceptaría eventos a nombre de terceros y dejaría de servir para lo
 * único que sirve.
 *
 * `p_clinica_afectada` sí es un parámetro, y es OTRA cosa: no es el actor, es
 * el objeto sobre el que actuó (el superadmin no tiene clínica propia, pero
 * suspende clínicas ajenas). Va dentro de `detalle` como contexto, nunca en la
 * columna `clinica_id`, que sigue siendo la del actor y la que gobierna quién
 * puede leer la fila por RLS.
 */
create or replace function registrar_evento_seguridad(
  p_tipo text,
  p_severidad text default 'info',
  p_detalle jsonb default '{}'::jsonb,
  p_clinica_afectada uuid default null
) returns void
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_usuario uuid := auth.uid();
begin
  -- Sin sesión no se registra nada. Es la contrapartida de no aceptar el actor
  -- por parámetro: si no hay JWT, no hay a quién atribuirle el evento, y una
  -- fila anónima en esta tabla sería justo el ruido que se quiere evitar.
  if v_usuario is null then
    return;
  end if;

  insert into eventos_seguridad (usuario_id, clinica_id, tipo, severidad, detalle)
  values (
    v_usuario,
    auth_clinica_id(),
    p_tipo,
    coalesce(p_severidad, 'info'),
    coalesce(p_detalle, '{}'::jsonb)
      || case
           when p_clinica_afectada is null then '{}'::jsonb
           else jsonb_build_object('clinica_afectada', p_clinica_afectada)
         end
  );
exception
  -- ⚠️ Registrar no puede tumbar la operación que se estaba registrando.
  -- Si el `tipo` no está en el `check`, o cualquier otra cosa falla aquí,
  -- se traga el error: perder un evento de la bitácora es malo, pero impedir
  -- que alguien inicie sesión porque su evento no se pudo escribir es peor.
  -- Mismo criterio que `registrarUso()` en `respaldo-clinica`, que loguea el
  -- fallo en vez de lanzarlo.
  when others then
    return;
end;
$$;

-- La trampa de `0047`: `EXECUTE` va a `PUBLIC` por defecto y `anon` es miembro
-- de `PUBLIC`. Se revoca de los dos y se concede solo a `authenticated` — sin
-- sesión la función ya no hace nada (el `return` de arriba), pero no hace
-- falta ni dejarla llamar.
revoke all on function registrar_evento_seguridad(text, text, jsonb, uuid) from public;
revoke all on function registrar_evento_seguridad(text, text, jsonb, uuid) from anon;
grant execute on function registrar_evento_seguridad(text, text, jsonb, uuid) to authenticated;

comment on function registrar_evento_seguridad(text, text, jsonb, uuid) is
  'Escribe una fila en eventos_seguridad atribuida a auth.uid(). El actor y su '
  'clinica se derivan del JWT, nunca de parametros. Nunca lanza: un fallo al '
  'registrar no puede romper la operacion registrada.';

-- =========================================================
-- PRUEBAS OBLIGATORIAS
-- =========================================================
--   1. Con sesión de admin: llamar a la función y confirmar que la fila queda
--      con SU usuario_id y SU clinica_id, aunque se intente pasar otros.
--   2. Con sesión de admin de la clínica A: leer `eventos_seguridad` y
--      confirmar que no aparece ni una fila de la clínica B.
--   3. Con sesión de recepción: leer la tabla y confirmar que devuelve vacío.
--   4. Con la clave anónima sin sesión: confirmar que la función no inserta
--      nada y que el select devuelve vacío.
--   5. Intentar un `update` y un `delete` con sesión de superadmin: deben
--      fallar (no hay policy).
--   6. Llamar con un `tipo` inventado: no debe insertar fila NI lanzar error.
