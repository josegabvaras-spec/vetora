-- ============================================================================
-- Migración 0041: la séptima tabla que 0040 se dejó — peluqueria_configuracion
-- ============================================================================
--
-- Mismo bug exacto que 0040, en una tabla que el primer barrido no encontró:
-- `peluqueria_configuracion.clinica_id` es `primary key references
-- clinicas(id)` (0029_modulo_peluqueria.sql:156), sin `default
-- auth_clinica_id()` — al no llevar `not null` explícito (la primary key ya
-- lo implica), no aparecía en la búsqueda por el patrón "not null references
-- clinicas" que encontró las otras seis.
--
-- `guardarConfiguracionPeluqueria()` (src/services/peluqueria.ts) inserta
-- sin mandar `clinica_id`, igual que el resto del proyecto — sin el
-- default, la fila se construía con clinica_id NULL y la policy
-- `peluqueria_configuracion_personal` la rechazaba con 403, exactamente
-- igual que las otras seis. Confirmado contra producción: cero filas
-- también aquí.

alter table peluqueria_configuracion alter column clinica_id set default auth_clinica_id();
