-- Un cliente del portal deja de leer `usuarios` y `clinicas` en crudo.
--
-- ⚠️ HALLAZGO (F-05 del retest, mitad pendiente de R-5): `0045` cerró las
-- siete tablas de `0030`, pero estas dos se quedaron como estaban. Comprobado
-- en producción con un JWT real de rol `cliente`:
--
--   GET /rest/v1/usuarios?select=nombre,email,whatsapp,rol
--   → [{"nombre":"dudu","email":"…","whatsapp":"76838767","rol":"admin"}, …]
--
--   GET /rest/v1/clinicas?select=nombre,precio_acordado_usd,estado_pago
--   → [{"nombre":"dudusir","precio_acordado_usd":40.00,"estado_pago":"al_dia"}]
--
-- Es decir: un dueño de mascota veía el directorio del personal de su
-- veterinaria —nombre, correo y teléfono de cada uno— y cuánto paga esa
-- veterinaria por Vetora, con qué estado de pago y cuándo le toca el próximo.
-- No es dato clínico y no cruza clínicas, pero tampoco es suyo.
--
-- =========================================================
-- Por qué una policy no basta, y hacen falta dos funciones
-- =========================================================
-- Lo que hay que ocultar son COLUMNAS dentro de filas que el portal sí tiene
-- motivo para ver: necesita el nombre del veterinario que firmó una consulta,
-- y el nombre y logo de su propia clínica. La RLS es por fila, no por columna.
--
-- Es exactamente la forma de `clinicas_con_catalogo()` y
-- `servicios_peluqueria_de()` (0027/0035), y se resuelve igual: la policy
-- cierra la tabla entera al rol `cliente`, y una función `security definer`
-- expone solo las columnas seguras. Lo que el portal consultaba de más
-- —`select('*')` en `PortalPerfilPage`, del que solo pintaba `nombre` y
-- `logo_url`— deja de estar disponible siquiera.

-- =========================================================
-- 1. Las dos funciones estrechas
-- =========================================================
-- Nombre y logo de la propia clínica. Nada de precio, estado de pago, cuotas
-- ni responsable.
create or replace function clinica_del_portal()
returns table (nombre text, logo_url text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.nombre, c.logo_url
    from clinicas c
   where c.id = auth_clinica_id();
$$;

-- Nombre de los veterinarios que firman las consultas del propio expediente.
-- Acotada a la clínica de quien llama: pedir ids de otra clínica no devuelve
-- nada, aunque se acierte el uuid.
create or replace function nombres_de_usuarios(p_ids uuid[])
returns table (id uuid, nombre text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select u.id, u.nombre
    from usuarios u
   where u.id = any (p_ids)
     and u.clinica_id = auth_clinica_id();
$$;

-- ⚠️ Revocar de PUBLIC **y** de anon, no solo de uno. Es la lección de `0047`:
-- toda función nueva concede `execute` a `PUBLIC` por defecto, y todo rol
-- —anon incluido— es miembro de `PUBLIC`. Revocar solo de `anon` no cambia
-- nada. Y si algún día se hace `drop` + `create` de estas dos, el ACL vuelve
-- al valor por defecto y hay que revocar otra vez.
revoke all on function clinica_del_portal() from public;
revoke all on function clinica_del_portal() from anon;
grant execute on function clinica_del_portal() to authenticated;

revoke all on function nombres_de_usuarios(uuid[]) from public;
revoke all on function nombres_de_usuarios(uuid[]) from anon;
grant execute on function nombres_de_usuarios(uuid[]) to authenticated;

-- =========================================================
-- 2. Las dos policies, cerradas al rol `cliente`
-- =========================================================
-- Para el personal no cambia nada: `auth_es_personal()` ya es cierto para
-- admin, veterinario, recepción y peluquero, así que la condición sigue
-- valiendo exactamente lo mismo que antes. Quien pierde el acceso directo es
-- el rol `cliente`, que es el punto.
--
-- ⚠️ `usuarios_self_select` (`id = auth.uid()`) NO se toca: es la que deja a
-- cada cuenta leer su PROPIA fila, y `AuthContext` la necesita para cargar el
-- perfil al iniciar sesión. Sin ella, cerrar esto dejaría al portal sin poder
-- ni saber quién es el que entró.
drop policy if exists usuarios_select on usuarios;
create policy usuarios_select on usuarios for select
  using (
    (clinica_id = (select auth_clinica_id()) and (select auth_es_personal()))
    or (select auth_es_plataforma())
  );

drop policy if exists clinicas_select on clinicas;
create policy clinicas_select on clinicas for select
  using (
    (id = (select auth_clinica_id()) and (select auth_es_personal()))
    or (select auth_es_plataforma())
  );
