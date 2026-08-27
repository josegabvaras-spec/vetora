-- Rol `peluquero` (peluqueria/estetica canina y felina).
--
-- Vetora ya admite citas `tipo_cita = 'peluqueria'` desde 0009, pero solo
-- `admin` y `veterinario` podian figurar como responsables -- la unica puerta
-- era `puedeAtender()` en el frontend. Las clinicas mixtas necesitan personal
-- dedicado a peluqueria que no es necesariamente veterinario.
--
-- Ni `citas` ni sus constraints cambian: `veterinario_id` ya es un FK
-- generico a `usuarios` sin CHECK de rol (0001), y `tipo_cita = 'peluqueria'`
-- ya es valido (0009). Solo faltaba el rol en si.

-- auth_es_personal() es la puerta de RLS de todo el negocio clinico (citas,
-- pacientes, clientes, historial...). Sin esto el peluquero no podria ni leer
-- sus propias citas ni el paciente/cliente que traen embebido. Es la MISMA
-- puerta que ya usa `recepcion` hoy: la RLS separa el tenant (que clinica),
-- no el sub-rol (que pantalla ve cada quien) -- eso lo hace el frontend
-- (RolRoute + el menu), no esta funcion.
create or replace function auth_es_personal() returns boolean
  language sql stable security definer
  set search_path = public, pg_temp
as $$
  select rol in ('admin', 'veterinario', 'recepcion', 'peluquero') from usuarios where id = auth.uid();
$$;

alter table usuarios drop constraint usuarios_rol_check;
alter table usuarios add constraint usuarios_rol_check
  check (rol in ('superadmin', 'admin', 'veterinario', 'recepcion', 'cliente', 'peluquero'));
