-- Borrar una ficha de dueño, sin poder llevarse un expediente por delante.
--
-- =========================================================================
-- POR QUE ESTO NO ES UN `DELETE` A SECAS
-- =========================================================================
-- `pacientes.cliente_id` es `on delete cascade` (0001), y desde `pacientes`
-- cascadean DOCE tablas mas: historial_clinico, citas, vacunas_aplicadas,
-- desparasitaciones_aplicadas, internaciones, consentimientos_cirugia,
-- recetas, informes_firmados, estudios_imagen y las tres de peluqueria.
--
-- O sea que borrar un dueño con mascotas DESTRUYE EL EXPEDIENTE MEDICO
-- COMPLETO de cada una, sin vuelta atras y sin que nada lo avise -- lo
-- contrario de lo que protegen `trg_historial_inmutable` y las policies
-- INSERT-only de cobros, consentimientos e informes.
--
-- Hasta hoy eso no habia pasado solo porque ninguna pantalla ofrecia borrar.
-- Pero `clientes_personal` (0004) es un `for all`, asi que EL DELETE YA ESTABA
-- PERMITIDO en la base para recepcion, veterinario y peluquero: bastaba un
-- `fetch` a PostgREST. Añadir el boton sin tocar esto dejaria la unica
-- proteccion en el frontend, que no es una proteccion.
--
-- Se parte la policy y el DELETE pasa a llevar la condicion que importa.

-- Los `drop if exists` de las cuatro no son decorativos: sin ellos, volver a
-- ejecutar este fichero reventaba a mitad con «policy already exists», y quien
-- lo aplica a mano se quedaba sin saber qué había entrado y qué no.
drop policy if exists clientes_personal on clientes;
drop policy if exists clientes_personal_select on clientes;
drop policy if exists clientes_personal_insert on clientes;
drop policy if exists clientes_personal_update on clientes;
drop policy if exists clientes_delete on clientes;

create policy clientes_personal_select on clientes for select
  using (clinica_id = (select auth_clinica_id()) and (select auth_es_personal()));

create policy clientes_personal_insert on clientes for insert
  with check (clinica_id = (select auth_clinica_id()) and (select auth_es_personal()));

create policy clientes_personal_update on clientes for update
  using (clinica_id = (select auth_clinica_id()) and (select auth_es_personal()))
  with check (clinica_id = (select auth_clinica_id()) and (select auth_es_personal()));

-- =========================================================================
-- La barrera: una ficha con mascotas NO se borra por ningun camino
-- =========================================================================
-- Ni la pantalla, ni un `fetch` a PostgREST, ni un script. La garantia deja de
-- depender de que el servicio se acuerde de comprobarlo.
--
-- ⚠️ NO exige `auth_es_admin()` aunque el boton sea solo del administrador, y
-- no es un olvido: hay DOS caminos legitimos que borran fichas VACIAS siendo
-- recepcion, y los dos se romperian.
--
--   1. `vincular_cuenta_portal()` (0028) hace `delete from clientes` para
--      soltar la ficha del portal antes de mover la cuenta, y NO es
--      `security definer` a proposito -- corre con los privilegios de quien
--      llama. Con la policy acotada a admin, una recepcionista resolviendo una
--      sugerencia se topaba con el `raise` que esa funcion ya tiene previsto
--      para este caso: «No tienes permiso para soltar la ficha del portal».
--   2. El rollback de `registrarClienteYPaciente`: si el insert del paciente
--      falla, borra el cliente recien creado. Sin eso, cada reintento deja
--      otra ficha duplicada.
--
-- Los dos borran fichas SIN MASCOTAS, que es justo lo que esto sigue
-- permitiendo. El «solo el administrador» es una convencion de pantalla --como
-- `veterinarioAcotado`--, y la barrera dura es la que no se puede saltar: no
-- se borra nada que tenga un expediente detras.
create policy clientes_delete on clientes for delete
  using (
    clinica_id = (select auth_clinica_id())
    and (select auth_es_personal())
    and not exists (select 1 from pacientes p where p.cliente_id = clientes.id)
  );

comment on policy clientes_delete on clientes is
  'Solo fichas sin mascotas: `pacientes.cliente_id` cascadea a doce tablas y se llevaria el expediente medico entero. No mira el rol a proposito -- ver 0036.';
