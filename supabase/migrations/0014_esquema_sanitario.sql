-- Esquema sanitario: vacunas y desparasitaciones dejan de vivir dentro de una
-- consulta y pasan a gestionarse desde la ficha del paciente.
--
-- Hasta ahora una dosis SOLO podía registrarse mientras había una consulta en
-- borrador: `historial_id` era `not null` y los servicios exigían el borrador.
-- La pestaña «Esquema de Vacunación» era de solo lectura y su botón de alta se
-- limitaba a mandar al veterinario a abrir una consulta.

-- =========================================================
-- 1. Una dosis puede no venir de ninguna consulta
-- =========================================================
-- Es lo que habilita el calendario sanitario: registrar la vacuna que la
-- mascota ya traía puesta al llegar, o la que se aplica en una visita rápida
-- que no abre historial.
--
-- Las filas anteriores conservan su `historial_id`, así que el historial
-- impreso de una consulta pasada sigue mostrando lo que se aplicó ese día.
alter table vacunas_aplicadas alter column historial_id drop not null;
alter table desparasitaciones_aplicadas alter column historial_id drop not null;

-- =========================================================
-- 2. Un registro sanitario ahora se puede corregir
-- =========================================================
-- ⚠️ CAMBIO DELIBERADO DE POSTURA. Estas dos tablas eran solo SELECT + INSERT,
--    como los consentimientos y los cobros. Se abren a UPDATE y DELETE porque
--    el esquema sanitario es una herramienta de trabajo del veterinario —una
--    fecha o un nombre mal tecleados tienen que poder arreglarse—, no un
--    documento firmado.
--
--    No afecta a los invariantes que sí siguen siendo inmutables: el historial
--    clínico cerrado, los consentimientos, los cobros y las notas de
--    internación conservan sus policies tal cual.
--
--    `auth_es_personal()` es imprescindible en las cuatro cláusulas: el rol
--    `cliente` del portal TIENE `clinica_id`, así que comprobar solo el
--    inquilino le daría permiso de escritura sobre el carné de cualquier
--    mascota de la clínica. Es exactamente el agujero que 0011 tuvo que cerrar
--    en `historial_update`.

drop policy if exists vacunas_update on vacunas_aplicadas;
create policy vacunas_update on vacunas_aplicadas for update
  using (clinica_id = (select auth_clinica_id()) and (select auth_es_personal()))
  with check (clinica_id = (select auth_clinica_id()) and (select auth_es_personal()));

drop policy if exists vacunas_delete on vacunas_aplicadas;
create policy vacunas_delete on vacunas_aplicadas for delete
  using (clinica_id = (select auth_clinica_id()) and (select auth_es_personal()));

drop policy if exists desparasitaciones_update on desparasitaciones_aplicadas;
create policy desparasitaciones_update on desparasitaciones_aplicadas for update
  using (clinica_id = (select auth_clinica_id()) and (select auth_es_personal()))
  with check (clinica_id = (select auth_clinica_id()) and (select auth_es_personal()));

drop policy if exists desparasitaciones_delete on desparasitaciones_aplicadas;
create policy desparasitaciones_delete on desparasitaciones_aplicadas for delete
  using (clinica_id = (select auth_clinica_id()) and (select auth_es_personal()));

-- Las policies del portal (`vacunas_portal`, `desparasitaciones_portal`, 0004)
-- siguen siendo SELECT y no se tocan: el dueño lee su carné, nunca lo escribe.
