-- ============================================================================
-- Migración 0040: clinica_id sin default en las tablas de peluquería (0029)
-- ============================================================================
--
-- Bug de producción real, no un caso raro: las seis tablas de
-- 0029_modulo_peluqueria.sql (peluqueria_fichas, peluqueria_servicios_config,
-- peluqueria_servicio_insumos, peluqueria_ordenes, peluqueria_fotos,
-- peluqueria_comisiones) declaran `clinica_id uuid not null references
-- clinicas(id)` SIN `default auth_clinica_id()` — a diferencia de TODAS las
-- demás tablas del proyecto: 0002_correcciones_criticas.sql lo parcheó para
-- las de 0001_init.sql, y cada tabla de 0030_modulo_petshop.sql ya lo trae
-- inline desde el día uno. 0029 se quedó sin ese parche.
--
-- El frontend (src/services/peluqueria.ts) sigue el mismo patrón que el
-- resto del proyecto: nunca manda `clinica_id` en el insert, confiando en
-- que la base lo rellene sola (así insertan también citas, pacientes,
-- productos, cobros...). Sin el default, la fila se construye con
-- clinica_id NULL, y la policy `with check (clinica_id = auth_clinica_id()
-- and auth_es_personal())` la rechaza — NULL = auth_clinica_id() nunca es
-- TRUE, así que PostgREST devuelve 403 en vez de guardar nada.
--
-- Confirmado contra producción antes de escribir esto: las seis tablas
-- tienen CERO filas. Ninguna orden de peluquería, ficha de grooming,
-- comisión, foto o configuración de servicio se guardó jamás desde que
-- existe el módulo — no hay dato existente que migrar, así que el único
-- cambio necesario es el default para que los inserts futuros funcionen.

alter table peluqueria_fichas             alter column clinica_id set default auth_clinica_id();
alter table peluqueria_servicios_config   alter column clinica_id set default auth_clinica_id();
alter table peluqueria_servicio_insumos   alter column clinica_id set default auth_clinica_id();
alter table peluqueria_ordenes            alter column clinica_id set default auth_clinica_id();
alter table peluqueria_fotos              alter column clinica_id set default auth_clinica_id();
alter table peluqueria_comisiones         alter column clinica_id set default auth_clinica_id();
