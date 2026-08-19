-- Venta de mostrador: cobrar medicamentos sin que medie una cita.
--
-- Sintoma: `registrarVentaDirecta` (services/caja.ts) fallaba dos veces.
--   1. escribia `cliente_nombre`, columna que no existia -> 42703
--   2. insertaba un cobro sin `cita_id` ni `internacion_id`, y el CHECK
--      `cobros_una_sola_atencion` exigia EXACTAMENTE uno de los dos -> 23514
--
-- Aqui el esquema es el que se quedo corto, no el servicio: el PRD modelo el
-- cobro como liquidacion de una atencion, pero la clinica tambien vende
-- antiparasitarios en el mostrador a quien entra por la puerta. Se amplia el
-- modelo en vez de forzar el servicio.

-- A quien se le vendio. En una venta de mostrador no hay ficha de cliente ni
-- paciente, asi que es texto libre: es lo unico que se puede imprimir en el
-- recibo (ReciboPage lo pinta) y lo que `detalleDeCobro` usa como concepto.
alter table cobros add column if not exists cliente_nombre text;

-- Un cobro es o una cita, o una internacion, o una venta de mostrador.
alter table cobros drop constraint if exists cobros_una_sola_atencion;
alter table cobros add constraint cobros_una_sola_atencion check (
  (cita_id is not null)::int + (internacion_id is not null)::int <= 1
);

-- Pero no puede ser "ninguna de las tres": un cobro sin atencion y sin nombre
-- seria dinero en caja sin nada que lo explique. Con esto, relajar el CHECK de
-- arriba no abre la puerta a cobros huerfanos.
alter table cobros drop constraint if exists cobros_venta_directa_con_cliente;
alter table cobros add constraint cobros_venta_directa_con_cliente check (
  cita_id is not null
  or internacion_id is not null
  or (cliente_nombre is not null and btrim(cliente_nombre) <> '')
);
