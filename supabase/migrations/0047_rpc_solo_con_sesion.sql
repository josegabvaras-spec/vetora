-- Quita a `anon` el permiso de ejecutar los RPC de la Tienda y la peluquería.
--
-- ⚠️ NO APLICADA TODAVÍA. Escrita para revisión; se aplica cuando se apruebe.
--
-- CLAUDE.md afirma sobre `clinicas_con_catalogo()`: «`grant execute` va a
-- `authenticated`, no a `anon`: la Tienda solo se ve con sesión iniciada en el
-- portal». Esa era la intención. Lo desplegado dice otra cosa — comprobado
-- contra producción con la clave anónima y sin ninguna sesión:
--
--     POST /rest/v1/rpc/clinicas_con_catalogo    → HTTP 200, 151 bytes de datos
--     POST /rest/v1/rpc/clinicas_con_peluqueria  → HTTP 200, [] (vacío hoy)
--     POST /rest/v1/rpc/servicios_peluqueria_de  → HTTP 200, [] (vacío hoy)
--
-- Lo que sale sin sesión por la primera son las columnas que la propia función
-- expone: nombre, logo, ciudad, tipo de negocio y **WhatsApp** de cada clínica
-- con el módulo. Las otras dos están vacías por ahora, pero son alcanzables: en
-- cuanto exista una peluquería con el módulo, sus servicios y precios también
-- se sirven a internet.
--
-- LA CAUSA, que conviene entender porque afecta a toda función futura:
-- Supabase concede `execute` a `anon`, `authenticated` y `service_role` **por
-- defecto** sobre cualquier función nueva del esquema `public`. El
-- `revoke all … from public` que llevan las migraciones quita el pseudo-rol
-- `PUBLIC`, pero NO ese grant explícito a `anon`. Son dos cosas distintas y
-- hace falta revocar las dos.
--
-- `clinicas_para_registro()` se deja intacta a propósito: esa SÍ tiene que ser
-- pública, la llama `/registro-cliente` antes de que exista ninguna sesión.

revoke execute on function clinicas_con_catalogo() from anon;
revoke execute on function clinicas_con_peluqueria() from anon;
revoke execute on function servicios_peluqueria_de(uuid) from anon;

-- Se reafirma el grant que sí corresponde, para que quede explícito en la
-- migración y no dependa del valor por defecto.
grant execute on function clinicas_con_catalogo() to authenticated;
grant execute on function clinicas_con_peluqueria() to authenticated;
grant execute on function servicios_peluqueria_de(uuid) to authenticated;
