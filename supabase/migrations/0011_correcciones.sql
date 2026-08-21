-- Correcciones sobre 0001-0010.
--
-- Salen de una auditoría de servicios, esquema y frontend. Agrupadas por
-- motivo, seguridad primero. Todas son seguras sobre datos existentes: no se
-- recrea ninguna tabla y no se reescriben filas — `add column` con default,
-- `alter policy` y `alter constraint` no tocan lo ya guardado.
--
-- ⚠️ ANTES DE APLICAR: las migraciones anteriores se aplicaron con un cliente
--    `pg` crudo (apply_migrations.cjs), que NO escribe en
--    `supabase_migrations.schema_migrations`. Para el CLI el historial está
--    vacío y un `db push` intentaría reaplicar 0001 desde cero. Hay que hacer
--    antes `supabase migration repair --status applied 0001 … 0010`.

-- =========================================================
-- 1. Un cliente del portal podía reescribir el expediente clínico
-- =========================================================
-- `0004` restringió al personal las policies de lectura y alta del historial,
-- pero se dejó `historial_update`, que solo comprueba el inquilino. Y el rol
-- `cliente` SÍ tiene `clinica_id`: se lo impone `usuarios_clinica_segun_rol`
-- (0001:88-90), donde solo el superadmin va sin clínica. Así que
-- `auth_clinica_id()` le devuelve la suya y el `using` da verdadero.
--
-- Con eso, un `PATCH /rest/v1/historial_clinico?editable=eq.true` reescribía y
-- cerraba EN MASA todos los borradores de la clínica, incluidos los de mascotas
-- ajenas. No hacía falta conocer ningún UUID ni poder leer las filas: la
-- escritura a ciegas por filtro basta. `trg_historial_inmutable` no lo paraba
-- porque solo mira `OLD.editable`.
--
-- ⚠️ El `using` conserva `editable = true` y el `with check` NO debe exigirlo:
--    esa asimetría es justo lo que 0002 arregló para que cerrar la consulta
--    (editable true→false) sea posible. Aquí solo se añade el requisito de
--    personal a las dos cláusulas.

drop policy if exists historial_update on historial_clinico;
create policy historial_update on historial_clinico for update
  using (
    clinica_id = (select auth_clinica_id())
    and (select auth_es_personal())
    and editable = true
  )
  with check (
    clinica_id = (select auth_clinica_id())
    and (select auth_es_personal())
  );

-- Mismo agujero, menor alcance: el comentario de 0004:119-123 daba por cubiertas
-- estas dos policies "porque ya llevan restricción de sucursal o de admin". No
-- la llevan — ninguna de las dos comprueba nada más que el inquilino.

-- Una línea de cobro se podía añadir a un recibo ya emitido. `cobros` no tiene
-- UPDATE ni DELETE precisamente para que un recibo sea inmutable; poder
-- insertarle líneas sueltas rompe esa garantía por la puerta de atrás.
--
-- (Queda una asimetría menor frente a `cobros_insert`, que además exige admin o
-- sucursal propia. Aquí no se replica porque exigiría un join contra `cobros`
-- en cada inserción; el acceso lateral entre inquilinos, que era el problema,
-- ya lo cierra `auth_es_personal()`.)
drop policy if exists cobro_lineas_insert on cobro_lineas;
create policy cobro_lineas_insert on cobro_lineas for insert
  with check (
    clinica_id = (select auth_clinica_id())
    and (select auth_es_personal())
  );

-- Evoluciones de internación: las escribe el veterinario, no el dueño.
drop policy if exists notas_internacion_insert on notas_internacion;
create policy notas_internacion_insert on notas_internacion for insert
  with check (
    clinica_id = (select auth_clinica_id())
    and (select auth_es_personal())
    -- No se escriben evoluciones sobre una estadía ya cerrada.
    and exists (
      select 1 from internaciones i
      where i.id = internacion_id and i.estado = 'internado'
    )
  );

-- =========================================================
-- 2. `movimientos_inventario.usuario_id`: la columna que el código ya escribía
-- =========================================================
-- Síntoma: TODO movimiento de stock fallaba con
--   {"code":"PGRST204","message":"Could not find the 'usuario_id' column of
--    'movimientos_inventario' in the schema cache"}
-- es decir, el inventario entero estaba caído: stock inicial, ajuste manual,
-- consumo en consulta, consumo en internación y venta de mostrador. El
-- `as any` de services/inventario.ts es lo que impidió que `tsc` lo detectara.
--
-- Se añade en vez de quitarse del insert porque la trazabilidad se usa de
-- verdad: `services/movimientos.ts` pide el embed `usuario:usuarios(*)` para la
-- bitácora del administrador, y sin la FK ese select devolvía PGRST200 y dejaba
-- la mitad de inventario del informe vacía en silencio.
--
-- Nullable y sin cascade: los movimientos ya registrados no tienen autor, y dar
-- de baja a un empleado no debe borrar el kardex que firmó.
alter table movimientos_inventario add column if not exists usuario_id uuid
  references usuarios (id) on delete set null;

-- =========================================================
-- 3. Los productos se dan de baja, no se borran
-- =========================================================
-- `eliminarProducto` hacía un DELETE real, con dos consecuencias malas:
--   1. `movimientos_inventario.producto_id` es `on delete cascade` (0001:350),
--      así que borrar un producto se llevaba por delante todo su kardex — el
--      historial que justifica el stock.
--   2. `cobro_lineas.producto_id` (0001:454) no declara acción de borrado, o
--      sea NO ACTION: cualquier producto vendido alguna vez devolvía un 23503
--      crudo de Postgres directamente en la interfaz.
--
-- El catálogo de servicios ya resolvió esto mismo con `activo` (0001:53, "Se
-- desactivan en vez de borrarse: los cobros antiguos los referencian"). Se
-- replica aquí el mismo patrón.
alter table productos add column if not exists activo boolean not null default true;

-- =========================================================
-- 4. `servicios.categoria = 'peluqueria'` faltaba en el CHECK
-- =========================================================
-- `0009` amplió `citas.tipo_cita` para admitir peluquería pero se dejó el
-- gemelo: el catálogo de servicios sigue con las seis categorías de 0001,
-- mientras `CategoriaServicio` (types/database.ts) y el selector de
-- services/servicios.ts la ofrecen. Crear la tarifa devolvía 23514.
--
-- Sin ella, una cita de peluquería (que sí se puede agendar desde 0009) no
-- tiene tarifa que la facture.
alter table servicios drop constraint if exists servicios_categoria_check;
alter table servicios add constraint servicios_categoria_check check (
  categoria in (
    'consulta', 'cirugia', 'laboratorio', 'imagenologia',
    'internacion', 'peluqueria', 'otros'
  )
);

-- =========================================================
-- 5. Índices para lo que se acaba de añadir
-- =========================================================
-- FK sin índice: quién movió el stock (bitácora filtrada por usuario) y, sobre
-- todo, para que el `on delete set null` de arriba no recorra la tabla entera.
create index if not exists movimientos_por_usuario
  on movimientos_inventario (usuario_id) where usuario_id is not null;

-- El catálogo lista por sucursal, solo los activos y ordenado por nombre. El
-- parcial deja fuera los dados de baja, que es justo lo que la pantalla nunca
-- pide (los históricos se resuelven por id, no por listado).
create index if not exists productos_activos_por_sucursal
  on productos (clinica_id, sucursal_id, nombre) where activo;
