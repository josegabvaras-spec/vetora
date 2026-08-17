-- Portal del cliente: el rol `cliente` y las policies que lo hacen seguro.
--
-- ⚠️ ORDEN OBLIGATORIO. Ampliar el CHECK de `usuarios.rol` para admitir
--    'cliente' SIN reescribir antes las policies entrega la clínica entera: hoy
--    `clientes_all`, `pacientes_all` y las demás solo comprueban `clinica_id`,
--    así que un usuario del portal —que tiene clinica_id— vería y modificaría
--    los pacientes, historiales y cobros de TODOS los demás clientes.
--
--    Por eso esta migración hace las dos cosas a la vez y en este orden:
--    primero el helper y las policies restringidas al personal, y solo después
--    el rol nuevo. Aplicada entera es segura; aplicada a medias, no.

-- =========================================================
-- 1. Distinguir al personal de la clínica del cliente del portal
-- =========================================================
-- Hasta ahora «pertenecer a la clínica» bastaba para todo. Con el portal deja
-- de bastar: hay que saber si quien consulta trabaja allí o solo es dueño de
-- una mascota.

create or replace function auth_es_personal() returns boolean
  language sql stable security definer
  set search_path = public, pg_temp
as $$
  select rol in ('admin', 'veterinario', 'recepcion') from usuarios where id = auth.uid();
$$;

-- Vínculo entre la cuenta del portal y la ficha de cliente que ya tenía la
-- clínica. Nullable: la inmensa mayoría de clientes nunca abrirán el portal.
alter table clientes add column if not exists usuario_id uuid
  references usuarios (id) on delete set null;

-- Una cuenta del portal corresponde a un solo cliente.
create unique index if not exists clientes_por_usuario
  on clientes (usuario_id) where usuario_id is not null;

-- =========================================================
-- 2. Las policies de negocio pasan a exigir personal
-- =========================================================
-- Mismo alcance que antes para admin, veterinario y recepción: no pierden nada.
-- Lo que cambia es que un `cliente` deja de entrar por aquí.

drop policy if exists clientes_all on clientes;
create policy clientes_personal on clientes for all
  using (clinica_id = (select auth_clinica_id()) and (select auth_es_personal()))
  with check (clinica_id = (select auth_clinica_id()) and (select auth_es_personal()));

drop policy if exists pacientes_all on pacientes;
create policy pacientes_personal on pacientes for all
  using (clinica_id = (select auth_clinica_id()) and (select auth_es_personal()))
  with check (clinica_id = (select auth_clinica_id()) and (select auth_es_personal()));

drop policy if exists citas_all on citas;
create policy citas_personal on citas for all
  using (
    clinica_id = (select auth_clinica_id())
    and (select auth_es_personal())
    and ((select auth_es_admin()) or sucursal_id = (select auth_sucursal_id()))
  )
  with check (
    clinica_id = (select auth_clinica_id())
    and (select auth_es_personal())
    and ((select auth_es_admin()) or sucursal_id = (select auth_sucursal_id()))
  );

-- Expediente clínico: solo el personal escribe y lee por clínica.
drop policy if exists historial_select on historial_clinico;
create policy historial_select on historial_clinico for select
  using (clinica_id = (select auth_clinica_id()) and (select auth_es_personal()));

drop policy if exists historial_insert on historial_clinico;
create policy historial_insert on historial_clinico for insert
  with check (clinica_id = (select auth_clinica_id()) and (select auth_es_personal()));

drop policy if exists vacunas_select on vacunas_aplicadas;
create policy vacunas_select on vacunas_aplicadas for select
  using (clinica_id = (select auth_clinica_id()) and (select auth_es_personal()));

drop policy if exists vacunas_insert on vacunas_aplicadas;
create policy vacunas_insert on vacunas_aplicadas for insert
  with check (clinica_id = (select auth_clinica_id()) and (select auth_es_personal()));

drop policy if exists desparasitaciones_select on desparasitaciones_aplicadas;
create policy desparasitaciones_select on desparasitaciones_aplicadas for select
  using (clinica_id = (select auth_clinica_id()) and (select auth_es_personal()));

drop policy if exists desparasitaciones_insert on desparasitaciones_aplicadas;
create policy desparasitaciones_insert on desparasitaciones_aplicadas for insert
  with check (clinica_id = (select auth_clinica_id()) and (select auth_es_personal()));

drop policy if exists consentimientos_select on consentimientos_cirugia;
create policy consentimientos_select on consentimientos_cirugia for select
  using (clinica_id = (select auth_clinica_id()) and (select auth_es_personal()));

drop policy if exists consentimientos_insert on consentimientos_cirugia;
create policy consentimientos_insert on consentimientos_cirugia for insert
  with check (clinica_id = (select auth_clinica_id()) and (select auth_es_personal()));

drop policy if exists internaciones_select on internaciones;
create policy internaciones_select on internaciones for select
  using (clinica_id = (select auth_clinica_id()) and (select auth_es_personal()));

drop policy if exists notas_internacion_select on notas_internacion;
create policy notas_internacion_select on notas_internacion for select
  using (clinica_id = (select auth_clinica_id()) and (select auth_es_personal()));

-- Caja e inventario: territorio exclusivo del personal.
drop policy if exists cobros_select on cobros;
create policy cobros_select on cobros for select
  using (clinica_id = (select auth_clinica_id()) and (select auth_es_personal()));

drop policy if exists cobro_lineas_select on cobro_lineas;
create policy cobro_lineas_select on cobro_lineas for select
  using (clinica_id = (select auth_clinica_id()) and (select auth_es_personal()));

drop policy if exists servicios_select on servicios;
create policy servicios_select on servicios for select
  using (clinica_id = (select auth_clinica_id()) and (select auth_es_personal()));

-- `productos_all`, `turnos_caja_all`, `movimientos_all` (reescrita en 0002),
-- `internaciones_insert/update`, `historial_update`, `notas_internacion_insert`,
-- `cobros_insert`, `cobro_lineas_insert` y `servicios_admin` ya llevan
-- restricción de sucursal o de admin, que un `cliente` nunca cumple:
-- su `sucursal_id` es null y `auth_es_admin()` es falso. No hace falta tocarlas.

-- =========================================================
-- 3. Lo que SÍ ve el cliente: lo suyo, y solo de lectura
-- =========================================================

-- Su propia ficha.
create policy clientes_portal on clientes for select
  using (usuario_id = auth.uid());

-- Sus mascotas.
create policy pacientes_portal on pacientes for select
  using (exists (
    select 1 from clientes c
    where c.id = pacientes.cliente_id and c.usuario_id = auth.uid()
  ));

-- Las citas de sus mascotas.
create policy citas_portal on citas for select
  using (exists (
    select 1 from pacientes p
    join clientes c on c.id = p.cliente_id
    where p.id = citas.paciente_id and c.usuario_id = auth.uid()
  ));

-- Consultas ya cerradas de sus mascotas. Un borrador es trabajo en curso del
-- veterinario y no se enseña hasta que se firma.
create policy historial_portal on historial_clinico for select
  using (
    editable = false
    and exists (
      select 1 from pacientes p
      join clientes c on c.id = p.cliente_id
      where p.id = historial_clinico.paciente_id and c.usuario_id = auth.uid()
    )
  );

-- Carné de vacunas y desparasitaciones de sus mascotas.
create policy vacunas_portal on vacunas_aplicadas for select
  using (exists (
    select 1 from pacientes p
    join clientes c on c.id = p.cliente_id
    where p.id = vacunas_aplicadas.paciente_id and c.usuario_id = auth.uid()
  ));

create policy desparasitaciones_portal on desparasitaciones_aplicadas for select
  using (exists (
    select 1 from pacientes p
    join clientes c on c.id = p.cliente_id
    where p.id = desparasitaciones_aplicadas.paciente_id and c.usuario_id = auth.uid()
  ));

-- Índices que estas policies necesitan para no degradar a recorrido secuencial.
create index if not exists pacientes_por_cliente_portal on pacientes (cliente_id);
create index if not exists citas_por_paciente_portal on citas (paciente_id);
create index if not exists historial_por_paciente_portal on historial_clinico (paciente_id);

-- =========================================================
-- 4. Ahora sí: el rol nuevo
-- =========================================================
-- Con las policies ya restringidas, admitir 'cliente' deja de ser peligroso.

alter table usuarios drop constraint usuarios_rol_check;
alter table usuarios add constraint usuarios_rol_check
  check (rol in ('superadmin', 'admin', 'veterinario', 'recepcion', 'cliente'));

-- `usuarios_clinica_segun_rol` sigue valiendo tal cual: solo el superadmin va
-- sin clínica, y el cliente pertenece a la suya como todos los demás.

-- =========================================================
-- 5. Listado de clínicas para el registro público
-- =========================================================
-- Quien abre /registro-cliente no tiene sesión, así que para la RLS es anónimo
-- y no puede leer `clinicas`. Esta función es la única puerta, y devuelve
-- EXACTAMENTE dos columnas: ni whatsapp, ni responsable, ni estado, ni el plan
-- contratado. Ampliar este `select` es ampliar lo que ve todo internet.

create or replace function clinicas_para_registro()
  returns table (id uuid, nombre text)
  language sql stable security definer
  set search_path = public, pg_temp
as $$
  select c.id, c.nombre from clinicas c
  where c.estado <> 'suspendida'
  order by c.nombre;
$$;

grant execute on function clinicas_para_registro() to anon, authenticated;
