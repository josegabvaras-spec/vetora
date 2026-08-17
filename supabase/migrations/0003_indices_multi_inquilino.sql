-- Índices para consultas bajo RLS.
--
-- Motivo: PostgreSQL NO indexa el lado que referencia una clave foránea, así que
-- hoy no existe un solo índice sobre `clinica_id`. Y la RLS añade
-- `clinica_id = auth_clinica_id()` a TODAS las consultas, incluidas las de
-- `useTable`. Sin índice, cada lectura recorre la tabla entera de TODOS los
-- inquilinos filtrando fila a fila: el aislamiento sigue siendo correcto, pero
-- el coste crece con el total de la plataforma en vez de con el tamaño de la
-- clínica. Es el patrón que degrada un SaaS multi-inquilino según entran clientes.
--
-- Criterio del orden de columnas, que es lo que hace útil o inútil cada índice:
--   1. `clinica_id` primero — la RLS lo impone como igualdad en toda consulta.
--   2. las igualdades del servicio (`veterinario_id`, `sucursal_id`, `paciente_id`).
--   3. al final la columna de rango u ordenación (`fecha_hora`, `created_at desc`).
-- Poner la fecha antes de una igualdad obligaría a recorrer todo el rango.
--
-- ⚠️ SIN `concurrently` a propósito: el CLI de Supabase envuelve cada migración
--    en una transacción, y `create index concurrently` no puede ir dentro de una.
--    Con las tablas pequeñas de hoy el bloqueo es instantáneo. Si alguna tabla ya
--    tiene volumen, sacar ese índice a un script aparte y crearlo concurrently.
--
-- ⚠️ HONESTIDAD: no se ha ejecutado ningún EXPLAIN contra la base real. Son
--    hipótesis razonadas a partir de los predicados de los servicios y del que
--    añade la RLS. Con pocos cientos de filas el planificador preferirá un seq
--    scan y no usará estos índices hasta que las tablas crezcan — eso es
--    correcto y esperable, no un fallo.

-- Agenda por veterinario y rango de fechas (AgendaPage, hayConflictoDeHorario).
create index if not exists citas_vet_fecha
  on citas (clinica_id, veterinario_id, fecha_hora);

-- Agenda por sucursal y día (listCitas con sucursalId, resumenDelDia).
create index if not exists citas_sucursal_fecha
  on citas (clinica_id, sucursal_id, fecha_hora);

-- Historial de citas del paciente, de la más reciente hacia atrás. El `desc`
-- evita el sort posterior.
create index if not exists citas_paciente_fecha
  on citas (clinica_id, paciente_id, fecha_hora desc);

-- Atenciones pendientes de cobro. El índice parcial indexa solo las completadas,
-- que son una fracción de la tabla y las únicas que caja consulta.
create index if not exists citas_por_cobrar
  on citas (clinica_id, sucursal_id, fecha_hora)
  where estado = 'completada';

create index if not exists internaciones_por_cobrar
  on internaciones (clinica_id, sucursal_id, fecha_alta)
  where estado = 'alta';

-- Cartera de la clínica.
create index if not exists pacientes_por_clinica on pacientes (clinica_id, nombre);
create index if not exists pacientes_por_cliente on pacientes (clinica_id, cliente_id);
create index if not exists clientes_por_clinica  on clientes  (clinica_id, nombre);

-- Stock por sucursal (listProductos ordena por nombre: el índice da el orden).
create index if not exists productos_por_sucursal
  on productos (clinica_id, sucursal_id, nombre);

-- Alerta de stock bajo. El predicado compara dos columnas de la misma fila, que
-- es legal en un índice parcial y lo reduce a las pocas filas de la alerta.
create index if not exists productos_bajo_minimo
  on productos (clinica_id, sucursal_id)
  where stock_actual <= stock_minimo;

-- Kardex del producto y consumos de una atención.
create index if not exists movimientos_por_producto
  on movimientos_inventario (clinica_id, producto_id, created_at desc);
create index if not exists movimientos_por_cita
  on movimientos_inventario (cita_id) where cita_id is not null;
create index if not exists movimientos_por_internacion
  on movimientos_inventario (internacion_id) where internacion_id is not null;

-- Caja: resumenTurno, listCobrosDelTurno, ingresos por sucursal.
create index if not exists cobros_por_turno
  on cobros (turno_id, created_at desc);
create index if not exists cobros_por_sucursal_fecha
  on cobros (clinica_id, sucursal_id, created_at desc);
create index if not exists cobro_lineas_por_cobro
  on cobro_lineas (cobro_id);

-- Consulta del paciente y cierre de historial.
create index if not exists historial_por_paciente
  on historial_clinico (clinica_id, paciente_id, created_at desc);

-- Avisos programados: refuerzos pendientes. El parcial descarta las dosis sin
-- próxima fecha, que nunca generan aviso.
create index if not exists vacunas_refuerzo_pendiente
  on vacunas_aplicadas (clinica_id, fecha_refuerzo)
  where fecha_refuerzo is not null;
create index if not exists desparasitaciones_proxima_pendiente
  on desparasitaciones_aplicadas (clinica_id, fecha_proxima)
  where fecha_proxima is not null;

create index if not exists vacunas_por_paciente
  on vacunas_aplicadas (clinica_id, paciente_id, fecha_aplicacion desc);
create index if not exists desparasitaciones_por_paciente
  on desparasitaciones_aplicadas (clinica_id, paciente_id, fecha_aplicacion desc);

-- Evolución de una internación, ya en el orden que pide el servicio.
create index if not exists notas_por_internacion
  on notas_internacion (internacion_id, created_at desc);

create index if not exists consentimientos_por_paciente
  on consentimientos_cirugia (clinica_id, paciente_id);

-- Catálogo y estructura del inquilino.
create index if not exists servicios_activos    on servicios (clinica_id, activo);
create index if not exists sucursales_por_clinica on sucursales (clinica_id);
create index if not exists usuarios_por_clinica on usuarios (clinica_id, nombre);
create index if not exists internaciones_por_sucursal
  on internaciones (clinica_id, sucursal_id, fecha_ingreso desc);
create index if not exists turnos_por_sucursal
  on turnos_caja (clinica_id, sucursal_id, abierto_at desc);

-- FK sin índice: cuántas clínicas cuelgan de un plan (planes.ts).
create index if not exists clinicas_por_plan on clinicas (plan_id);
