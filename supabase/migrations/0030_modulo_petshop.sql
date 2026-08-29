-- =========================================================
-- MÓDULO PROFESIONAL DE PET SHOP Y RETAIL VETORA
-- Migración 0030: Proveedores, compras, lotes, vencimientos,
-- promociones, combos, devoluciones y configuración.
-- =========================================================

-- 1. Ampliación de la tabla productos para soporte de retail
alter table productos
  add column if not exists costo_bs numeric(12, 2) not null default 0 check (costo_bs >= 0),
  add column if not exists codigo_barras text,
  add column if not exists categoria_retail text not null default 'otro' check (categoria_retail in ('alimento', 'medicamento', 'antiparasitario', 'suplemento', 'higiene', 'accesorio', 'juguete', 'ropa', 'otro')),
  add column if not exists marca text not null default '',
  add column if not exists ubicacion text not null default '',
  add column if not exists requiere_lote boolean not null default false,
  add column if not exists stock_maximo numeric(12, 2) not null default 100 check (stock_maximo >= 0),
  add column if not exists activo boolean not null default true;

-- Índice para búsqueda rápida por código de barras y categoría
create index if not exists productos_codigo_barras_idx on productos (sucursal_id, codigo_barras) where codigo_barras is not null;
create index if not exists productos_categoria_retail_idx on productos (sucursal_id, categoria_retail);

-- =========================================================
-- 2. Proveedores
-- =========================================================
create table if not exists proveedores (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas (id) on delete cascade default auth_clinica_id(),
  empresa text not null,
  nit text,
  contacto text,
  telefono text,
  whatsapp text,
  direccion text,
  email text,
  notas text,
  saldo_pendiente_bs numeric(12, 2) not null default 0 check (saldo_pendiente_bs >= 0),
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

alter table proveedores enable row level security;

create index if not exists proveedores_clinica_idx on proveedores (clinica_id);

create policy "proveedores_lectura" on proveedores
  for select to authenticated
  using (clinica_id = auth_clinica_id());

create policy "proveedores_escritura" on proveedores
  for all to authenticated
  using (clinica_id = auth_clinica_id() and auth_es_personal())
  with check (clinica_id = auth_clinica_id());

-- Vincular proveedor a productos
alter table productos
  add column if not exists proveedor_id uuid references proveedores (id) on delete set null;

-- =========================================================
-- 3. Lotes y Fechas de Vencimiento
-- =========================================================
create table if not exists producto_lotes (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas (id) on delete cascade default auth_clinica_id(),
  sucursal_id uuid not null references sucursales (id) on delete cascade,
  producto_id uuid not null references productos (id) on delete cascade,
  numero_lote text not null,
  fecha_vencimiento date not null,
  cantidad_inicial numeric(12, 2) not null check (cantidad_inicial > 0),
  cantidad_actual numeric(12, 2) not null check (cantidad_actual >= 0),
  costo_unitario_bs numeric(12, 2) not null default 0 check (costo_unitario_bs >= 0),
  proveedor_id uuid references proveedores (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table producto_lotes enable row level security;

create index if not exists producto_lotes_producto_idx on producto_lotes (producto_id);
create index if not exists producto_lotes_vencimiento_idx on producto_lotes (sucursal_id, fecha_vencimiento);

create policy "producto_lotes_lectura" on producto_lotes
  for select to authenticated
  using (clinica_id = auth_clinica_id());

create policy "producto_lotes_escritura" on producto_lotes
  for all to authenticated
  using (clinica_id = auth_clinica_id() and auth_es_personal())
  with check (clinica_id = auth_clinica_id());

-- Ampliar movimientos_inventario para trazabilidad de lote y usuario
alter table movimientos_inventario
  add column if not exists usuario_id uuid references usuarios (id) on delete set null,
  add column if not exists lote_id uuid references producto_lotes (id) on delete set null,
  add column if not exists costo_unitario_bs numeric(12, 2) default 0,
  add column if not exists documento_origen text;

-- =========================================================
-- 4. Órdenes de Compra a Proveedores
-- =========================================================
create table if not exists ordenes_compra (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas (id) on delete cascade default auth_clinica_id(),
  sucursal_id uuid not null references sucursales (id) on delete cascade,
  proveedor_id uuid not null references proveedores (id) on delete cascade,
  numero_orden text not null,
  estado text not null check (estado in ('borrador', 'solicitada', 'recibida', 'cancelada')) default 'borrador',
  subtotal_bs numeric(12, 2) not null default 0 check (subtotal_bs >= 0),
  descuento_bs numeric(12, 2) not null default 0 check (descuento_bs >= 0),
  total_bs numeric(12, 2) not null default 0 check (total_bs >= 0),
  notas text,
  creado_por uuid references usuarios (id) on delete set null,
  recibido_por uuid references usuarios (id) on delete set null,
  fecha_solicitud timestamptz,
  fecha_recepcion timestamptz,
  created_at timestamptz not null default now(),
  unique (sucursal_id, numero_orden)
);

alter table ordenes_compra enable row level security;

create index if not exists ordenes_compra_sucursal_idx on ordenes_compra (sucursal_id, created_at desc);

create policy "ordenes_compra_lectura" on ordenes_compra
  for select to authenticated
  using (clinica_id = auth_clinica_id());

create policy "ordenes_compra_escritura" on ordenes_compra
  for all to authenticated
  using (clinica_id = auth_clinica_id() and auth_es_personal())
  with check (clinica_id = auth_clinica_id());

-- Trigger para correlativo de orden de compra
create or replace function generar_numero_orden_compra()
returns trigger as $$
declare
  prefijo text := 'OC-';
  ultimo_numero integer;
  siguiente integer;
begin
  if new.numero_orden is null or new.numero_orden = '' then
    select coalesce(max(nullif(regexp_replace(numero_orden, '\D', '', 'g'), '')::integer), 0)
    into ultimo_numero
    from ordenes_compra
    where sucursal_id = new.sucursal_id;

    siguiente := ultimo_numero + 1;
    new.numero_orden := prefijo || lpad(siguiente::text, 5, '0');
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_numero_orden_compra
  before insert on ordenes_compra
  for each row execute function generar_numero_orden_compra();

-- Detalles de la Orden de Compra
create table if not exists orden_compra_detalles (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas (id) on delete cascade default auth_clinica_id(),
  orden_id uuid not null references ordenes_compra (id) on delete cascade,
  producto_id uuid not null references productos (id) on delete cascade,
  cantidad_pedida numeric(12, 2) not null check (cantidad_pedida > 0),
  cantidad_recibida numeric(12, 2) not null default 0 check (cantidad_recibida >= 0),
  costo_unitario_bs numeric(12, 2) not null check (costo_unitario_bs >= 0),
  subtotal_bs numeric(12, 2) not null check (subtotal_bs >= 0),
  lote text,
  fecha_vencimiento date,
  created_at timestamptz not null default now()
);

alter table orden_compra_detalles enable row level security;

create index if not exists orden_compra_detalles_orden_idx on orden_compra_detalles (orden_id);

create policy "orden_compra_detalles_lectura" on orden_compra_detalles
  for select to authenticated
  using (clinica_id = auth_clinica_id());

create policy "orden_compra_detalles_escritura" on orden_compra_detalles
  for all to authenticated
  using (clinica_id = auth_clinica_id() and auth_es_personal())
  with check (clinica_id = auth_clinica_id());

-- =========================================================
-- 5. Promociones, Cupones y Combos
-- =========================================================
create table if not exists petshop_promociones (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas (id) on delete cascade default auth_clinica_id(),
  titulo text not null,
  descripcion text default '',
  tipo text not null check (tipo in ('porcentaje', 'monto_fijo', 'dos_por_uno', 'combo', 'cupon')),
  codigo_cupon text,
  valor_descuento numeric(12, 2) not null default 0 check (valor_descuento >= 0),
  fecha_inicio date not null,
  fecha_fin date not null,
  activo boolean not null default true,
  limite_uso integer,
  usos_actuales integer not null default 0 check (usos_actuales >= 0),
  condiciones jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table petshop_promociones enable row level security;

create index if not exists petshop_promociones_clinica_idx on petshop_promociones (clinica_id, activo);

create policy "petshop_promociones_lectura" on petshop_promociones
  for select to authenticated
  using (clinica_id = auth_clinica_id());

create policy "petshop_promociones_escritura" on petshop_promociones
  for all to authenticated
  using (clinica_id = auth_clinica_id() and auth_es_personal())
  with check (clinica_id = auth_clinica_id());

-- =========================================================
-- 6. Devoluciones de Retail
-- =========================================================
create table if not exists petshop_devoluciones (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas (id) on delete cascade default auth_clinica_id(),
  sucursal_id uuid not null references sucursales (id) on delete cascade,
  cobro_id uuid references cobros (id) on delete set null,
  producto_id uuid not null references productos (id) on delete cascade,
  cantidad numeric(12, 2) not null check (cantidad > 0),
  motivo text not null,
  estado_producto text not null check (estado_producto in ('reintegrable', 'danado', 'descarte')),
  monto_devuelto_bs numeric(12, 2) not null check (monto_devuelto_bs >= 0),
  usuario_id uuid references usuarios (id) on delete set null,
  autorizado_por uuid references usuarios (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table petshop_devoluciones enable row level security;

create index if not exists petshop_devoluciones_sucursal_idx on petshop_devoluciones (sucursal_id, created_at desc);

create policy "petshop_devoluciones_lectura" on petshop_devoluciones
  for select to authenticated
  using (clinica_id = auth_clinica_id());

create policy "petshop_devoluciones_escritura" on petshop_devoluciones
  for all to authenticated
  using (clinica_id = auth_clinica_id() and auth_es_personal())
  with check (clinica_id = auth_clinica_id());

-- =========================================================
-- 7. Configuración del Pet Shop
-- =========================================================
create table if not exists petshop_configuracion (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas (id) on delete cascade unique default auth_clinica_id(),
  dias_alerta_vencimiento integer not null default 60 check (dias_alerta_vencimiento > 0),
  permitir_venta_sin_stock boolean not null default false,
  exigir_autorizacion_devolucion boolean not null default true,
  impresion_ticket_automatica boolean not null default false,
  mensaje_ticket_pie text default 'Gracias por confiar en nosotros',
  created_at timestamptz not null default now()
);

alter table petshop_configuracion enable row level security;

create policy "petshop_config_lectura" on petshop_configuracion
  for select to authenticated
  using (clinica_id = auth_clinica_id());

create policy "petshop_config_escritura" on petshop_configuracion
  for all to authenticated
  using (clinica_id = auth_clinica_id() and auth_es_admin())
  with check (clinica_id = auth_clinica_id());
