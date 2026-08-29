-- ============================================================================
-- Migración 0029: Módulo Profesional de Peluquería Canina y Felina (Vetora)
-- ============================================================================

-- 1. Ficha de Grooming / Peluquería por Paciente
create table if not exists peluqueria_fichas (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  paciente_id uuid not null references pacientes(id) on delete cascade,
  corte_habitual text,
  longitud_preferida text,
  frecuencia_dias integer default 30,
  productos_preferidos text,
  comportamiento text default 'tranquilo',
  alergias_sensibilidad text,
  observaciones text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint uq_peluqueria_ficha_paciente unique (clinica_id, paciente_id)
);

create index if not exists idx_peluqueria_fichas_paciente on peluqueria_fichas (clinica_id, paciente_id);

-- 2. Configuración extendida de servicios de peluquería (asociada a servicios)
create table if not exists peluqueria_servicios_config (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  servicio_id uuid not null references servicios(id) on delete cascade,
  duracion_minutos integer not null default 45,
  categoria_grooming text not null default 'bano' check (categoria_grooming in ('bano', 'corte', 'higiene', 'tratamiento', 'personalizado')),
  especie_permitida text not null default 'todos' check (especie_permitida in ('todos', 'canino', 'felino')),
  tamano_permitido text not null default 'todos' check (tamano_permitido in ('todos', 'pequeno', 'mediano', 'grande', 'gigante')),
  comision_tipo text not null default 'porcentaje' check (comision_tipo in ('porcentaje', 'monto_fijo')),
  comision_valor numeric(10,2) not null default 0,
  reglas_precio jsonb not null default '[]'::jsonb,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  constraint uq_peluqueria_servicios_config unique (clinica_id, servicio_id)
);

create index if not exists idx_peluqueria_servicios_config_clinica on peluqueria_servicios_config (clinica_id, servicio_id);

-- 3. Recetas de insumos asociadas a servicios de peluquería
create table if not exists peluqueria_servicio_insumos (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  servicio_id uuid not null references servicios(id) on delete cascade,
  producto_id uuid not null references productos(id) on delete cascade,
  cantidad_dosis numeric(10,2) not null check (cantidad_dosis > 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_peluqueria_insumos_servicio on peluqueria_servicio_insumos (clinica_id, servicio_id);

-- 4. Órdenes de Servicio de Peluquería
create table if not exists peluqueria_ordenes (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  sucursal_id uuid not null references sucursales(id) on delete cascade,
  numero_orden integer not null,
  cita_id uuid references citas(id) on delete set null,
  paciente_id uuid not null references pacientes(id) on delete cascade,
  cliente_id uuid not null references clientes(id) on delete cascade,
  peluquero_id uuid not null references usuarios(id),
  servicio_id uuid references servicios(id) on delete set null,
  estado text not null default 'recepcion' check (estado in (
    'cita',
    'recepcion',
    'evaluacion',
    'en_espera',
    'en_proceso',
    'terminada',
    'lista_recoger',
    'entregada',
    'cancelada'
  )),
  condicion_pelaje text,
  nivel_nudos text default 'ninguno' check (nivel_nudos in ('ninguno', 'leve', 'moderado', 'severo')),
  nivel_suciedad text default 'normal' check (nivel_suciedad in ('normal', 'alta', 'extrema')),
  lesiones_visibles text,
  alerta_veterinaria boolean not null default false,
  comportamiento_recepcion text,
  observaciones_recepcion text,
  observaciones_peluquero text,
  suplementos jsonb not null default '[]'::jsonb,
  precio_estimado_bs numeric(10,2) not null default 0,
  precio_final_bs numeric(10,2) not null default 0,
  insumos_descontados boolean not null default false,
  cobro_id uuid references cobros(id) on delete set null,
  hora_ingreso timestamptz not null default now(),
  hora_inicio timestamptz,
  hora_fin timestamptz,
  hora_entrega timestamptz,
  creado_por uuid references usuarios(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_peluqueria_ordenes_clinica on peluqueria_ordenes (clinica_id, sucursal_id, estado);
create index if not exists idx_peluqueria_ordenes_paciente on peluqueria_ordenes (clinica_id, paciente_id);
create index if not exists idx_peluqueria_ordenes_cliente on peluqueria_ordenes (clinica_id, cliente_id);
create index if not exists idx_peluqueria_ordenes_peluquero on peluqueria_ordenes (clinica_id, peluquero_id);

-- Generación automática de número de orden correlativo por clínica
create or replace function fn_asignar_numero_orden_peluqueria()
returns trigger as $$
begin
  if new.numero_orden is null or new.numero_orden = 0 then
    select coalesce(max(numero_orden), 0) + 1 into new.numero_orden
    from peluqueria_ordenes
    where clinica_id = new.clinica_id;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_numero_orden_peluqueria on peluqueria_ordenes;
create trigger trg_numero_orden_peluqueria
  before insert on peluqueria_ordenes
  for each row execute function fn_asignar_numero_orden_peluqueria();

-- 5. Fotografías de la Orden (Antes / Durante / Después)
create table if not exists peluqueria_fotos (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  orden_id uuid not null references peluqueria_ordenes(id) on delete cascade,
  paciente_id uuid not null references pacientes(id) on delete cascade,
  tipo text not null check (tipo in ('antes', 'durante', 'despues')),
  foto_url text not null,
  notas text,
  created_at timestamptz not null default now()
);

create index if not exists idx_peluqueria_fotos_orden on peluqueria_fotos (clinica_id, orden_id);
create index if not exists idx_peluqueria_fotos_paciente on peluqueria_fotos (clinica_id, paciente_id);

-- 6. Comisiones de Peluqueros
create table if not exists peluqueria_comisiones (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  sucursal_id uuid not null references sucursales(id) on delete cascade,
  orden_id uuid not null references peluqueria_ordenes(id) on delete cascade,
  peluquero_id uuid not null references usuarios(id),
  monto_base_bs numeric(10,2) not null,
  porcentaje_o_fijo text not null default 'porcentaje',
  monto_comision_bs numeric(10,2) not null,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'liquidada', 'anulada')),
  fecha_liquidacion timestamptz,
  liquidada_por uuid references usuarios(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_peluqueria_comisiones_peluquero on peluqueria_comisiones (clinica_id, peluquero_id, estado);

-- 7. Configuración de Peluquería por Clínica
create table if not exists peluqueria_configuracion (
  clinica_id uuid primary key references clinicas(id) on delete cascade,
  tiempo_bloqueo_default_min integer not null default 45,
  intervalo_recordatorio_dias integer not null default 30,
  suplementos_predeterminados jsonb not null default '[
    {"concepto": "Desenredado / Nudos excesivos", "monto_bs": 25},
    {"concepto": "Pelaje muy sucio / Doble lavado", "monto_bs": 15},
    {"concepto": "Corte de uñas difícil / Manejo especial", "monto_bs": 15},
    {"concepto": "Tratamiento hidratante especial", "monto_bs": 20},
    {"concepto": "Baño antipulgas medicado extra", "monto_bs": 20}
  ]'::jsonb,
  mensaje_listo_whatsapp text not null default '¡Hola! 🐾 Te avisamos de {clinica} que {mascota} ya está lista y reluciente para que puedas pasar a recogerla. ✨',
  mensaje_recordatorio_whatsapp text not null default '¡Hola! 🐾 En {clinica} recordamos que ya han pasado {dias} días desde el último servicio de {mascota}. ¿Deseas agendar su cita de spa/peluquería esta semana? ✂️',
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- RLS (Row Level Security)
-- ============================================================================

alter table peluqueria_fichas enable row level security;
alter table peluqueria_servicios_config enable row level security;
alter table peluqueria_servicio_insumos enable row level security;
alter table peluqueria_ordenes enable row level security;
alter table peluqueria_fotos enable row level security;
alter table peluqueria_comisiones enable row level security;
alter table peluqueria_configuracion enable row level security;

-- Policies para Personal (CRUD completo dentro de su tenant)
create policy peluqueria_fichas_personal on peluqueria_fichas
  for all using (clinica_id = auth_clinica_id() and auth_es_personal())
  with check (clinica_id = auth_clinica_id() and auth_es_personal());

create policy peluqueria_servicios_config_personal on peluqueria_servicios_config
  for all using (clinica_id = auth_clinica_id() and auth_es_personal())
  with check (clinica_id = auth_clinica_id() and auth_es_personal());

create policy peluqueria_servicio_insumos_personal on peluqueria_servicio_insumos
  for all using (clinica_id = auth_clinica_id() and auth_es_personal())
  with check (clinica_id = auth_clinica_id() and auth_es_personal());

create policy peluqueria_ordenes_personal on peluqueria_ordenes
  for all using (clinica_id = auth_clinica_id() and auth_es_personal())
  with check (clinica_id = auth_clinica_id() and auth_es_personal());

create policy peluqueria_fotos_personal on peluqueria_fotos
  for all using (clinica_id = auth_clinica_id() and auth_es_personal())
  with check (clinica_id = auth_clinica_id() and auth_es_personal());

create policy peluqueria_comisiones_personal on peluqueria_comisiones
  for all using (clinica_id = auth_clinica_id() and auth_es_personal())
  with check (clinica_id = auth_clinica_id() and auth_es_personal());

create policy peluqueria_configuracion_personal on peluqueria_configuracion
  for all using (clinica_id = auth_clinica_id() and auth_es_personal())
  with check (clinica_id = auth_clinica_id() and auth_es_personal());

-- Policies para Portal del Cliente (Lectura de sus propias mascotas y fotos)
create policy peluqueria_fichas_portal on peluqueria_fichas
  for select using (
    exists (
      select 1 from pacientes p
      join clientes c on c.id = p.cliente_id
      where p.id = peluqueria_fichas.paciente_id
      and c.usuario_id = auth.uid()
    )
  );

create policy peluqueria_ordenes_portal on peluqueria_ordenes
  for select using (
    exists (
      select 1 from clientes c
      where c.id = peluqueria_ordenes.cliente_id
      and c.usuario_id = auth.uid()
    )
  );

create policy peluqueria_fotos_portal on peluqueria_fotos
  for select using (
    exists (
      select 1 from pacientes p
      join clientes c on c.id = p.cliente_id
      where p.id = peluqueria_fotos.paciente_id
      and c.usuario_id = auth.uid()
    )
  );
