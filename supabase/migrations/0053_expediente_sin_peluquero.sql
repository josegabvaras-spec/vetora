-- El peluquero deja de poder leer y escribir el expediente clínico.
--
-- ⚠️ HALLAZGO (I-11): `auth_es_personal()` incluye a `peluquero` desde `0025`,
-- y de esa función cuelgan las policies de las nueve tablas del expediente.
-- La interfaz ya se lo oculta todo —`puedeVerHistorialClinico()` no lo
-- incluye, `NuevoPacienteModal` no le abre consulta, `CitaDetalleModal` no
-- abre historial en una cita de peluquería, y el `RolRoute` de las seis rutas
-- de impresión lo deja fuera— pero **la RLS era más laxa que la interfaz**:
-- por PostgREST podía leer un historial, escribirlo, cerrarlo (el `with check`
-- de `historial_update` no exige `editable`, así que el UPDATE que lo cierra
-- pasaba) y recetar.
--
-- Ningún flujo legítimo del peluquero toca estas tablas: lo suyo son
-- `peluqueria_*`, `pacientes`, `clientes` y `citas`, que NO se tocan aquí.
--
-- =========================================================
-- Por qué una función nueva y no `auth_es_clinico()`
-- =========================================================
-- `auth_es_clinico()` (0042) es admin + veterinario, y **excluye a
-- recepción** — correcto para escribir en el vademécum, equivocado aquí:
-- recepción abre la consulta desde la cita (es lo que `JornadaClinica`
-- existe para no perder de vista) y registra el esquema sanitario.
--
-- Lo que hace falta es el espejo exacto de `puedeVerHistorialClinico()`
-- ([lib/personal.ts](../../src/lib/personal.ts)): admin, veterinario y
-- recepción. De ahí el nombre — si algún día cambia una, la otra tiene que
-- cambiar con ella, igual que `puedeUsarCopiloto()` y `autorizar()`.
--
-- `security definer` por el mismo motivo que las otras cinco: lee `usuarios`,
-- que está bajo RLS. Y comprueba `activo`, como `auth_es_clinico()` y las
-- cuatro de `0050`.
create or replace function auth_ve_expediente() returns boolean
  language sql stable security definer
  set search_path = public, pg_temp
as $$
  select exists (
    select 1 from usuarios
     where id = auth.uid() and activo
       and rol in ('admin', 'veterinario', 'recepcion')
  );
$$;

revoke all on function auth_ve_expediente() from public;
revoke all on function auth_ve_expediente() from anon;
grant execute on function auth_ve_expediente() to authenticated;

-- =========================================================
-- Las policies: mismo texto, cambiando solo la función de rol
-- =========================================================
-- Se conservan las condiciones extra tal cual estaban (`editable = true` en
-- historial/recetas/estudios, `estado = 'internado'` en las notas): esto no
-- afloja ninguna, solo estrecha quién pasa.
--
-- Las policies `*_portal` NO se tocan: son las del dueño de la mascota y
-- cuelgan de `clientes.usuario_id`, no de `auth_es_personal()`.

-- historial_clinico
drop policy if exists historial_insert on historial_clinico;
create policy historial_insert on historial_clinico for insert
  with check (clinica_id = (select auth_clinica_id()) and (select auth_ve_expediente()));

drop policy if exists historial_select on historial_clinico;
create policy historial_select on historial_clinico for select
  using (clinica_id = (select auth_clinica_id()) and (select auth_ve_expediente()));

drop policy if exists historial_update on historial_clinico;
create policy historial_update on historial_clinico for update
  using (clinica_id = (select auth_clinica_id()) and (select auth_ve_expediente()) and editable = true)
  with check (clinica_id = (select auth_clinica_id()) and (select auth_ve_expediente()));

-- recetas
drop policy if exists recetas_insert on recetas;
create policy recetas_insert on recetas for insert
  with check (
    clinica_id = (select auth_clinica_id()) and (select auth_ve_expediente())
    and exists (select 1 from historial_clinico h where h.id = recetas.historial_id and h.editable = true)
  );

drop policy if exists recetas_select on recetas;
create policy recetas_select on recetas for select
  using (clinica_id = (select auth_clinica_id()) and (select auth_ve_expediente()));

drop policy if exists recetas_delete on recetas;
create policy recetas_delete on recetas for delete
  using (
    clinica_id = (select auth_clinica_id()) and (select auth_ve_expediente())
    and exists (select 1 from historial_clinico h where h.id = recetas.historial_id and h.editable = true)
  );

-- vacunas_aplicadas
drop policy if exists vacunas_insert on vacunas_aplicadas;
create policy vacunas_insert on vacunas_aplicadas for insert
  with check (clinica_id = (select auth_clinica_id()) and (select auth_ve_expediente()));

drop policy if exists vacunas_select on vacunas_aplicadas;
create policy vacunas_select on vacunas_aplicadas for select
  using (clinica_id = (select auth_clinica_id()) and (select auth_ve_expediente()));

drop policy if exists vacunas_update on vacunas_aplicadas;
create policy vacunas_update on vacunas_aplicadas for update
  using (clinica_id = (select auth_clinica_id()) and (select auth_ve_expediente()))
  with check (clinica_id = (select auth_clinica_id()) and (select auth_ve_expediente()));

drop policy if exists vacunas_delete on vacunas_aplicadas;
create policy vacunas_delete on vacunas_aplicadas for delete
  using (clinica_id = (select auth_clinica_id()) and (select auth_ve_expediente()));

-- desparasitaciones_aplicadas
drop policy if exists desparasitaciones_insert on desparasitaciones_aplicadas;
create policy desparasitaciones_insert on desparasitaciones_aplicadas for insert
  with check (clinica_id = (select auth_clinica_id()) and (select auth_ve_expediente()));

drop policy if exists desparasitaciones_select on desparasitaciones_aplicadas;
create policy desparasitaciones_select on desparasitaciones_aplicadas for select
  using (clinica_id = (select auth_clinica_id()) and (select auth_ve_expediente()));

drop policy if exists desparasitaciones_update on desparasitaciones_aplicadas;
create policy desparasitaciones_update on desparasitaciones_aplicadas for update
  using (clinica_id = (select auth_clinica_id()) and (select auth_ve_expediente()))
  with check (clinica_id = (select auth_clinica_id()) and (select auth_ve_expediente()));

drop policy if exists desparasitaciones_delete on desparasitaciones_aplicadas;
create policy desparasitaciones_delete on desparasitaciones_aplicadas for delete
  using (clinica_id = (select auth_clinica_id()) and (select auth_ve_expediente()));

-- estudios_imagen
drop policy if exists estudios_insert on estudios_imagen;
create policy estudios_insert on estudios_imagen for insert
  with check (
    clinica_id = (select auth_clinica_id()) and (select auth_ve_expediente())
    and exists (select 1 from historial_clinico h where h.id = estudios_imagen.historial_id and h.editable = true)
  );

drop policy if exists estudios_select on estudios_imagen;
create policy estudios_select on estudios_imagen for select
  using (clinica_id = (select auth_clinica_id()) and (select auth_ve_expediente()));

drop policy if exists estudios_delete on estudios_imagen;
create policy estudios_delete on estudios_imagen for delete
  using (
    clinica_id = (select auth_clinica_id()) and (select auth_ve_expediente())
    and exists (select 1 from historial_clinico h where h.id = estudios_imagen.historial_id and h.editable = true)
  );

-- consentimientos_cirugia
drop policy if exists consentimientos_insert on consentimientos_cirugia;
create policy consentimientos_insert on consentimientos_cirugia for insert
  with check (clinica_id = (select auth_clinica_id()) and (select auth_ve_expediente()));

drop policy if exists consentimientos_select on consentimientos_cirugia;
create policy consentimientos_select on consentimientos_cirugia for select
  using (clinica_id = (select auth_clinica_id()) and (select auth_ve_expediente()));

-- informes_firmados
drop policy if exists informes_firmados_insert on informes_firmados;
create policy informes_firmados_insert on informes_firmados for insert
  with check (clinica_id = (select auth_clinica_id()) and (select auth_ve_expediente()));

drop policy if exists informes_firmados_select on informes_firmados;
create policy informes_firmados_select on informes_firmados for select
  using (clinica_id = (select auth_clinica_id()) and (select auth_ve_expediente()));

-- notas_internacion
drop policy if exists notas_internacion_insert on notas_internacion;
create policy notas_internacion_insert on notas_internacion for insert
  with check (
    clinica_id = (select auth_clinica_id()) and (select auth_ve_expediente())
    and exists (select 1 from internaciones i where i.id = notas_internacion.internacion_id and i.estado = 'internado')
  );

drop policy if exists notas_internacion_select on notas_internacion;
create policy notas_internacion_select on notas_internacion for select
  using (clinica_id = (select auth_clinica_id()) and (select auth_ve_expediente()));

-- internaciones: solo el SELECT cuelga de `auth_es_personal()`. El INSERT y el
-- UPDATE ya se acotan por `auth_es_admin() or sucursal_id = auth_sucursal_id()`
-- y no se tocan.
drop policy if exists internaciones_select on internaciones;
create policy internaciones_select on internaciones for select
  using (clinica_id = (select auth_clinica_id()) and (select auth_ve_expediente()));

-- =========================================================
-- El bucket `estudios`: la misma regla, del otro lado
-- =========================================================
-- Si la tabla se le cierra al peluquero y el bucket no, podría seguir
-- bajándose las imágenes de un estudio con la URL firmada.
drop policy if exists estudios_objetos_select on storage.objects;
create policy estudios_objetos_select on storage.objects for select
  using (
    bucket_id = 'estudios'
    and (storage.foldername(name))[1] = (select auth_clinica_id())::text
    and (select auth_ve_expediente())
  );

drop policy if exists estudios_objetos_insert on storage.objects;
create policy estudios_objetos_insert on storage.objects for insert
  with check (
    bucket_id = 'estudios'
    and (storage.foldername(name))[1] = (select auth_clinica_id())::text
    and (select auth_ve_expediente())
  );

-- Conserva la comprobación de `editable` que añadió `0045`.
drop policy if exists estudios_objetos_delete on storage.objects;
create policy estudios_objetos_delete on storage.objects for delete
  using (
    bucket_id = 'estudios'
    and (storage.foldername(name))[1] = (select auth_clinica_id())::text
    and (select auth_ve_expediente())
    and exists (
      select 1
        from estudios_imagen e
        join historial_clinico h on h.id = e.historial_id
       where e.ruta = objects.name
         and h.editable = true
    )
  );
