-- `clinica_del_portal()` devuelve también el estado — arregla el login del portal.
--
-- ⚠️ REGRESIÓN INTRODUCIDA POR `0052`, ENCONTRADA PROBANDO OTRA COSA.
--
-- `0052` cerró `clinicas_select` a `auth_es_personal()` y migró los tres
-- sitios que leían la tabla desde el portal (`AuthContext`,
-- `PortalPerfilPage`, `portalCliente`). **Se le escapó un cuarto**:
-- `motivoDeBloqueo()` en [services/sesion.ts](../../src/services/sesion.ts),
-- que corre en CADA login, de cualquier rol, y hace:
--
--     select id, estado, nombre from clinicas where id = usuario.clinica_id
--
-- Para un `cliente` esa consulta pasó a devolver vacío, y la función
-- interpreta el vacío como «la clínica ya no existe»: **ningún cliente del
-- portal podía entrar**. Lo demás siguió funcionando porque los otros
-- lectores de `clinicas` son rutas de personal, que sí pasan
-- `auth_es_personal()`.
--
-- Por qué añadir `estado` y no revertir el cierre: `motivoDeBloqueo()`
-- necesita el estado para bloquear a los clientes de una clínica suspendida
-- —que es la razón de existir de esa función—, así que devolver solo el
-- nombre no basta. Y `estado` no es de lo que `0052` iba a ocultar: lo
-- sensible era `precio_acordado_usd`, `estado_pago` y los contadores de
-- cuota. Que un dueño de mascota vea que la clínica está suspendida es
-- justamente lo que hay que decirle para que entienda por qué no entra.

-- ⚠️ Hace falta `drop` y no basta `create or replace`: PostgreSQL no deja
-- cambiar el tipo de retorno de una función existente («42P13: cannot change
-- return type»), y añadir `estado` al `returns table` lo cambia.
--
-- Y eso arrastra la trampa de `0047`, que aquí sí muerde: **`drop` + `create`
-- reinicia el ACL al valor por defecto, que concede `execute` a `PUBLIC`** —y
-- todo rol, `anon` incluido, es miembro de `PUBLIC`—. Sin las revocaciones de
-- abajo, arreglar el login del portal habría abierto el nombre de todas las
-- clínicas a internet. Por eso van en la misma migración y no «luego».
drop function if exists clinica_del_portal();

create function clinica_del_portal()
returns table (nombre text, logo_url text, estado text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.nombre, c.logo_url, c.estado
    from clinicas c
   where c.id = auth_clinica_id();
$$;

revoke all on function clinica_del_portal() from public;
revoke all on function clinica_del_portal() from anon;
grant execute on function clinica_del_portal() to authenticated;
