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
-- LA CAUSA, que costó dos intentos identificar bien y conviene dejar escrita
-- porque afecta a toda función futura:
--
-- Hay DOS vías por las que `anon` llega a una función, y hay que cortar las
-- dos. La primera es el grant explícito (`anon=X` en el ACL). La segunda, la
-- que de verdad estaba abierta aquí, es el **pseudo-rol `PUBLIC`**: una
-- función recién creada concede `execute` a `PUBLIC` por defecto, y todo rol
-- —`anon` incluido— es miembro de `PUBLIC`. En el ACL se ve como una entrada
-- con el beneficiario vacío:
--
--     =X/postgres | postgres=X/postgres | authenticated=X/postgres | …
--     ^^^^^^^^^^^ esto es PUBLIC
--
-- El primer intento de esta migración solo revocaba de `anon`, y no cambió
-- nada: la llamada seguía devolviendo HTTP 200 porque el permiso le llegaba
-- por `PUBLIC`. Revocar de `PUBLIC` es lo que cierra la puerta; revocar de
-- `anon` además es cinturón y tirantes, por si alguna vez se le concede
-- explícitamente.
--
-- ⚠️ Y ojo con `create or replace function`: **preserva** el ACL existente,
-- pero un `drop` + `create` lo reinicia al valor por defecto, es decir, vuelve
-- a conceder `execute` a `PUBLIC`. Cada vez que se recree una de estas tres
-- hay que volver a revocar, o el agujero reaparece en silencio.
--
-- `clinicas_para_registro()` se deja intacta a propósito: esa SÍ tiene que ser
-- pública, la llama `/registro-cliente` antes de que exista ninguna sesión.

revoke execute on function clinicas_con_catalogo() from public;
revoke execute on function clinicas_con_peluqueria() from public;
revoke execute on function servicios_peluqueria_de(uuid) from public;

revoke execute on function clinicas_con_catalogo() from anon;
revoke execute on function clinicas_con_peluqueria() from anon;
revoke execute on function servicios_peluqueria_de(uuid) from anon;

-- Se reafirma el grant que sí corresponde, para que quede explícito en la
-- migración y no dependa del valor por defecto.
grant execute on function clinicas_con_catalogo() to authenticated;
grant execute on function clinicas_con_peluqueria() to authenticated;
grant execute on function servicios_peluqueria_de(uuid) to authenticated;
