-- Que dos peticiones idénticas no sean dos ventas.
--
-- =========================================================
-- El problema, verificado en producción
-- =========================================================
-- Dos `INSERT` idénticos consecutivos sobre `cobros` → **quedaron 2 cobros**.
--
-- Los dos únicos índices únicos de la tabla son `cobros_una_vez_por_cita` y
-- `cobros_una_vez_por_internacion`, ambos **parciales**. Una venta del POS y
-- una venta de mostrador tienen `cita_id = null` e `internacion_id = null`, así
-- que ningún índice las alcanza: un doble clic, un reintento de red o un replay
-- crean dos cobros, dos juegos de líneas y dos egresos de inventario.
--
-- En el navegador el único freno es `disabled={procesandoVenta}` en
-- `PetshopPosPage`, que no cubre ni un reintento de red ni una llamada directa
-- a la API.
--
-- El proyecto ya conoce el patrón y lo aplica en otro sitio:
-- `aprobar_pago_suscripcion()` usa `.eq('estado','pendiente')` justamente para
-- que un doble clic no regale un mes. El POS no tenía equivalente.
--
-- =========================================================
-- Qué hace esta migración, y qué NO
-- =========================================================
-- Pone el esquema: una columna y un índice único parcial. Con eso, la segunda
-- petición con la misma clave **falla con 23505 en vez de duplicar**, que ya es
-- fallar del lado seguro.
--
-- Devolver el resultado original en vez del error lo hace el servicio
-- (`procesarVentaPOS` captura el 23505 y relee el cobro de esa clave), y la
-- atomicidad real llega con la RPC transaccional de la fase 3. Esto es la
-- mitad de esquema.
--
-- La columna es **nullable a propósito**: sin clave, el comportamiento es
-- exactamente el de hoy. Así nada de lo que ya existe se rompe, y el frontend
-- puede adoptarla pantalla por pantalla.

alter table cobros add column if not exists idempotency_key uuid;

comment on column cobros.idempotency_key is
  'Clave que identifica el INTENTO de venta, no la venta. La genera el '
  'navegador al abrir el carrito (no al pulsar cobrar), así que un reintento '
  'del mismo carrito trae la misma clave y no crea un segundo cobro.';

create unique index if not exists cobros_idempotency_key_unica
  on cobros (clinica_id, idempotency_key)
  where idempotency_key is not null;

alter table petshop_devoluciones add column if not exists idempotency_key uuid;

comment on column petshop_devoluciones.idempotency_key is
  'Misma idea que en cobros: una devolución reenviada no reintegra el stock '
  'dos veces.';

create unique index if not exists petshop_devoluciones_idempotency_key_unica
  on petshop_devoluciones (clinica_id, idempotency_key)
  where idempotency_key is not null;

-- =========================================================
-- Por qué la clave va junto a `clinica_id` en el índice
-- =========================================================
-- Un uuid v4 no colisiona en la práctica, pero el índice compuesto hace que el
-- aislamiento sea estructural y no estadístico: la clave de una clínica no
-- puede bloquear una operación de otra ni por accidente ni a propósito.
