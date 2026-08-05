-- Vetora - Esquema inicial (PRD §5, §6)
-- Multi-tenant estricto vía clinica_id + Row Level Security.
-- Zona horaria de negocio: America/La_Paz (almacenada siempre en UTC/TIMESTAMPTZ).

create extension if not exists "pgcrypto";
-- Requerida por la restricción EXCLUDE de solapamiento de citas (ver más abajo).
create extension if not exists btree_gist;

-- =========================================================
-- 1. Núcleo
-- =========================================================

-- Planes comerciales. No pertenecen a ninguna clínica: los define la plataforma
-- y de sus límites depende lo que cada inquilino puede hacer.
create table planes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  precio_mensual_bs numeric(12, 2) not null default 0 check (precio_mensual_bs >= 0),
  whatsapp_limite integer not null check (whatsapp_limite >= 1),
  max_sucursales integer not null check (max_sucursales >= 1),
  max_usuarios integer not null check (max_usuarios >= 1),
  -- Se retiran de la oferta en vez de borrarse: hay clínicas contratadas en ellos.
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create table clinicas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  plan_id uuid not null references planes (id),
  -- Contacto de quien contrató el servicio.
  responsable text not null default '',
  whatsapp text not null default '',
  ciudad text not null default '',
  whatsapp_mensajes_enviados integer not null default 0,
  estado text not null default 'activa' check (estado in ('activa', 'suspendida', 'demo')),
  -- Suscripción: lo pactado puede diferir del precio de lista del plan.
  precio_acordado_bs numeric(12, 2) not null default 0 check (precio_acordado_bs >= 0),
  fecha_alta date not null default current_date,
  proximo_cobro date not null default current_date,
  estado_pago text not null default 'al_dia' check (estado_pago in ('al_dia', 'en_mora')),
  created_at timestamptz not null default now()
);

-- Catálogo de servicios facturables, gestionado por el administrador.
create table servicios (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas (id) on delete cascade,
  nombre text not null,
  categoria text not null check (
    categoria in ('consulta', 'cirugia', 'laboratorio', 'imagenologia', 'internacion', 'otros')
  ),
  precio_bs numeric(12, 2) not null default 0 check (precio_bs >= 0),
  -- Se desactivan en vez de borrarse: los cobros antiguos los referencian.
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  unique (clinica_id, nombre)
);

create table sucursales (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas (id) on delete cascade,
  nombre text not null,
  direccion text not null default '',
  created_at timestamptz not null default now()
);

-- Perfil del usuario. Las CREDENCIALES no viven aquí: la contraseña la guarda
-- Supabase Auth en `auth.users` y la aplicación nunca la ve (PRD §5.1). El
-- correo se duplica en esta tabla solo para poder listarlo y comprobar que no
-- se repite; el que manda para entrar es el de `auth.users`.
create table usuarios (
  id uuid primary key references auth.users (id) on delete cascade,
  -- null => usuario de plataforma (superadmin), que no pertenece a ninguna clínica.
  clinica_id uuid references clinicas (id) on delete cascade,
  sucursal_id uuid references sucursales (id) on delete set null,
  nombre text not null,
  -- Identificador de la cuenta: único en todo el sistema, no por clínica.
  email text not null unique,
  -- Obligatorio: es por donde se le envía su enlace de acceso.
  whatsapp text not null default '',
  rol text not null check (rol in ('superadmin', 'admin', 'veterinario', 'recepcion')),
  -- Se desactivan en vez de borrarse: firman historiales y cobros.
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  -- El rol de plataforma va sin clínica, y el resto siempre con una.
  constraint usuarios_clinica_segun_rol check (
    (rol = 'superadmin') = (clinica_id is null)
  )
);

-- Enlaces de acceso que se mandan por WhatsApp a quien acaba de ser dado de
-- alta. Un enlace enviado por mensajería queda escrito en un chat para siempre:
-- por eso es de un solo uso y con caducidad, nunca una llave permanente.
-- En producción esto lo emite Supabase Auth (invite / magic link); la tabla
-- existe para poder auditar a quién se le mandó el acceso y si ya entró.
create table invitaciones (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas (id) on delete cascade,
  usuario_id uuid not null references usuarios (id) on delete cascade,
  token text not null unique,
  expira_at timestamptz not null,
  enviado_at timestamptz,
  usado_at timestamptz,
  created_at timestamptz not null default now()
);

-- Un usuario puede tener varias invitaciones a lo largo del tiempo (la anterior
-- caducó, se le reenvió otra): se consulta siempre la última vigente.
create index invitaciones_por_usuario on invitaciones (usuario_id, created_at desc);

-- =========================================================
-- 2. Pacientes / Clientes
-- =========================================================

create table clientes (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas (id) on delete cascade,
  nombre text not null,
  whatsapp text not null,
  ci text,
  created_at timestamptz not null default now()
);

create table pacientes (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas (id) on delete cascade,
  cliente_id uuid not null references clientes (id) on delete cascade,
  nombre text not null,
  especie text not null check (especie in ('canino', 'felino', 'ave', 'exotico', 'otro')),
  raza text,
  sexo text not null default 'desconocido' check (sexo in ('macho', 'hembra', 'desconocido')),
  fecha_nacimiento date,
  -- Datos permanentes del paciente (no ligados a una consulta puntual).
  alergias text,
  antecedentes text,
  created_at timestamptz not null default now()
);

-- =========================================================
-- 3. Clínico (inmutable tras cierre)
-- =========================================================

create table citas (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas (id) on delete cascade,
  sucursal_id uuid not null references sucursales (id) on delete cascade,
  paciente_id uuid not null references pacientes (id) on delete cascade,
  veterinario_id uuid not null references usuarios (id),
  fecha_hora timestamptz not null,
  tipo_cita text not null check (
    tipo_cita in ('consulta', 'reconsulta', 'vacuna', 'cirugia', 'desparasitacion')
  ),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'confirmada', 'completada', 'cancelada')),
  -- Consulta previa que controla una reconsulta. En cascada: un control no
  -- puede sobrevivir a la consulta que controla (y así el CHECK de abajo nunca
  -- se rompe por un SET NULL).
  cita_origen_id uuid references citas (id) on delete cascade,
  -- Procedimiento concreto del catálogo: qué cirugía se realiza.
  servicio_id uuid references servicios (id),
  notas text,
  recordatorio_enviado boolean not null default false,
  created_at timestamptz not null default now(),
  -- Una reconsulta necesita la consulta que controla; el resto de tipos no la lleva.
  constraint citas_origen_solo_en_reconsulta check (
    (tipo_cita = 'reconsulta') = (cita_origen_id is not null)
  ),
  -- Una cirugía debe nombrar el procedimiento (el consentimiento lo imprime).
  constraint citas_cirugia_con_procedimiento check (
    tipo_cita <> 'cirugia' or servicio_id is not null
  ),
  -- Un veterinario no puede tener dos citas solapadas (bloques fijos de 30 min).
  -- Las citas canceladas liberan el espacio.
  constraint citas_sin_solapamiento exclude using gist (
    veterinario_id with =,
    tstzrange(fecha_hora, fecha_hora + interval '30 minutes') with &&
  ) where (estado <> 'cancelada')
);

create table historial_clinico (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas (id) on delete cascade,
  paciente_id uuid not null references pacientes (id) on delete cascade,
  cita_id uuid not null references citas (id) on delete cascade,
  veterinario_id uuid not null references usuarios (id),
  motivo text not null,
  sintomas text,
  diagnostico text not null default '',
  tratamiento text not null default '',

  -- Anamnesis: lo que refiere el propietario/a.
  tiempo_evolucion text,
  apetito text check (apetito in ('normal', 'disminuido', 'ausente', 'aumentado')),
  consumo_agua text check (consumo_agua in ('normal', 'disminuido', 'aumentado')),
  vomitos text check (vomitos in ('no', 'ocasional', 'frecuente')),
  heces_consistencia text check (heces_consistencia in ('normal', 'blanda', 'diarrea', 'estrenimiento')),
  heces_color text check (
    heces_color in ('marron_normal', 'amarillenta', 'verdosa', 'negra_melena', 'con_sangre', 'acolica')
  ),
  orina text check (orina in ('normal', 'aumentada', 'disminuida', 'con_sangre', 'dificultad')),
  desparasitacion_al_dia boolean,

  -- Examen físico: hallazgos objetivos del veterinario/a.
  peso_kg numeric(6, 2) check (peso_kg is null or peso_kg > 0),
  temperatura_c numeric(4, 1) check (temperatura_c is null or temperatura_c > 0),
  frecuencia_cardiaca integer check (frecuencia_cardiaca is null or frecuencia_cardiaca > 0),
  frecuencia_respiratoria integer check (frecuencia_respiratoria is null or frecuencia_respiratoria > 0),
  deshidratacion text check (deshidratacion in ('normal', 'leve_5', 'moderada_8', 'severa_10')),
  mucosas text check (mucosas in ('rosadas', 'palidas', 'ictericas', 'cianoticas', 'congestivas')),
  tllc text check (tllc in ('menor_2s', 'mayor_2s')),
  condicion_corporal smallint check (condicion_corporal is null or condicion_corporal between 1 and 9),
  estado_conciencia text check (estado_conciencia in ('alerta', 'deprimido', 'estuporoso', 'comatoso')),
  observaciones_examen text,

  editable boolean not null default true,
  created_at timestamptz not null default now()
);

-- Vacunas aplicadas: alimentan las alertas de próximas vacunas (PRD Épica 4).
create table vacunas_aplicadas (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas (id) on delete cascade,
  paciente_id uuid not null references pacientes (id) on delete cascade,
  historial_id uuid not null references historial_clinico (id) on delete cascade,
  nombre_vacuna text not null,
  fecha_aplicacion date not null default current_date,
  fecha_refuerzo date,
  created_at timestamptz not null default now()
);

-- Desparasitaciones: mismo papel que las vacunas —una dosis aplicada y la fecha
-- de la siguiente—, en tabla aparte porque el producto y la periodicidad son
-- otros y las alertas se cuentan por separado.
create table desparasitaciones_aplicadas (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas (id) on delete cascade,
  paciente_id uuid not null references pacientes (id) on delete cascade,
  historial_id uuid not null references historial_clinico (id) on delete cascade,
  producto text not null,
  via text not null default 'oral' check (via in ('oral', 'topica', 'inyectable')),
  fecha_aplicacion date not null default current_date,
  fecha_proxima date,
  created_at timestamptz not null default now()
);

-- Solo INSERT: los consentimientos firmados nunca se editan ni se eliminan.
create table consentimientos_cirugia (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas (id) on delete cascade,
  cita_id uuid not null references citas (id) on delete cascade,
  paciente_id uuid not null references pacientes (id) on delete cascade,
  url_pdf text not null,
  metodo_aceptacion text not null check (
    metodo_aceptacion in ('firma_digital', 'firma_fisica_escaneada', 'aceptacion_verbal_registrada')
  ),
  created_at timestamptz not null default now()
);

-- =========================================================
-- 4. Internación (hospitalización con estadía por días)
-- =========================================================

create table internaciones (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas (id) on delete cascade,
  sucursal_id uuid not null references sucursales (id) on delete cascade,
  paciente_id uuid not null references pacientes (id) on delete cascade,
  veterinario_id uuid not null references usuarios (id),
  -- Cita que originó el ingreso, cuando viene de la agenda.
  cita_id uuid references citas (id) on delete set null,
  motivo text not null,
  jaula text,
  fecha_ingreso timestamptz not null default now(),
  fecha_alta timestamptz,
  -- Tarifa del catálogo (categoría internación) y su precio congelado al
  -- ingreso: subirla mañana no debe encarecer una estadía ya empezada.
  servicio_dia_id uuid not null references servicios (id),
  precio_dia_bs numeric(12, 2) not null check (precio_dia_bs >= 0),
  indicaciones_alta text,
  estado text not null default 'internado' check (estado in ('internado', 'alta')),
  created_at timestamptz not null default now(),
  constraint internaciones_alta_coherente check (
    (estado = 'alta') = (fecha_alta is not null)
  ),
  constraint internaciones_alta_posterior check (fecha_alta is null or fecha_alta >= fecha_ingreso)
);

-- Un paciente no puede estar internado dos veces a la vez: el segundo ingreso
-- duplicaría los días de estadía facturados.
create unique index internaciones_una_abierta_por_paciente
  on internaciones (paciente_id)
  where estado = 'internado';

-- Evolución diaria. Solo INSERT: es expediente clínico, no se corrige, se
-- vuelve a escribir.
create table notas_internacion (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas (id) on delete cascade,
  internacion_id uuid not null references internaciones (id) on delete cascade,
  veterinario_id uuid not null references usuarios (id),
  nota text not null,
  temperatura_c numeric(4, 1) check (temperatura_c is null or temperatura_c > 0),
  frecuencia_cardiaca integer check (frecuencia_cardiaca is null or frecuencia_cardiaca > 0),
  frecuencia_respiratoria integer check (frecuencia_respiratoria is null or frecuencia_respiratoria > 0),
  peso_kg numeric(6, 2) check (peso_kg is null or peso_kg > 0),
  created_at timestamptz not null default now()
);

-- Tras el alta la internación queda congelada: si se pudieran mover las fechas
-- o la tarifa, cambiaría el importe de un cobro ya emitido.
create or replace function bloquear_internacion_cerrada()
returns trigger as $$
begin
  if old.estado = 'alta' then
    raise exception 'La internación ya fue dada de alta y no puede modificarse';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_internacion_inmutable
  before update on internaciones
  for each row execute function bloquear_internacion_cerrada();

-- =========================================================
-- 5. Inventario
-- =========================================================

create table productos (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas (id) on delete cascade,
  sucursal_id uuid not null references sucursales (id) on delete cascade,
  sku text not null,
  nombre text not null,
  precio_bs numeric(12, 2) not null default 0 check (precio_bs >= 0),
  stock_actual integer not null default 0 check (stock_actual >= 0),
  stock_minimo integer not null default 3 check (stock_minimo >= 0),
  created_at timestamptz not null default now(),
  unique (sucursal_id, sku)
);

create table movimientos_inventario (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas (id) on delete cascade,
  producto_id uuid not null references productos (id) on delete cascade,
  tipo text not null check (tipo in ('ingreso', 'egreso')),
  cantidad integer not null check (cantidad > 0),
  motivo text not null default '',
  cita_id uuid references citas (id) on delete set null,
  internacion_id uuid references internaciones (id) on delete set null,
  created_at timestamptz not null default now(),
  -- Un consumo se factura con la cita o con la internación, nunca con ambas.
  constraint movimientos_un_solo_origen check (cita_id is null or internacion_id is null)
);

-- Aplica el movimiento al stock del producto. El CHECK stock_actual >= 0
-- en `productos` rechaza la transacción completa si un egreso deja el stock
-- por debajo de cero (PRD HU-03).
create or replace function aplicar_movimiento_inventario()
returns trigger as $$
begin
  if new.tipo = 'ingreso' then
    update productos set stock_actual = stock_actual + new.cantidad where id = new.producto_id;
  else
    update productos set stock_actual = stock_actual - new.cantidad where id = new.producto_id;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_aplicar_movimiento_inventario
  after insert on movimientos_inventario
  for each row execute function aplicar_movimiento_inventario();

-- Bloquea UPDATE/DELETE sobre historiales cerrados (editable = false) y
-- sobre consentimientos de cirugía firmados (PRD HU-01, HU-02).
create or replace function bloquear_si_no_editable()
returns trigger as $$
begin
  if old.editable = false then
    raise exception 'El historial clínico está cerrado y no puede modificarse';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_historial_inmutable
  before update on historial_clinico
  for each row execute function bloquear_si_no_editable();

-- =========================================================
-- 6. Caja (PRD Épica 5)
-- =========================================================

create table turnos_caja (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas (id) on delete cascade,
  sucursal_id uuid not null references sucursales (id) on delete cascade,
  usuario_id uuid not null references usuarios (id),
  saldo_inicial_bs numeric(12, 2) not null default 0 check (saldo_inicial_bs >= 0),
  abierto_at timestamptz not null default now(),
  cerrado_at timestamptz,
  saldo_declarado_bs numeric(12, 2) check (saldo_declarado_bs is null or saldo_declarado_bs >= 0),
  diferencia_bs numeric(12, 2),
  estado text not null default 'abierto' check (estado in ('abierto', 'cerrado')),
  created_at timestamptz not null default now()
);

-- Una sola caja abierta por sucursal a la vez.
create unique index turnos_caja_uno_abierto_por_sucursal
  on turnos_caja (sucursal_id)
  where estado = 'abierto';

create table cobros (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas (id) on delete cascade,
  sucursal_id uuid not null references sucursales (id) on delete cascade,
  turno_id uuid not null references turnos_caja (id),
  -- Un cobro liquida exactamente una atención: o una cita, o una internación.
  cita_id uuid references citas (id) on delete cascade,
  internacion_id uuid references internaciones (id) on delete cascade,
  usuario_id uuid not null references usuarios (id),
  monto_bs numeric(12, 2) not null check (monto_bs > 0),
  metodo_pago text not null check (metodo_pago in ('efectivo', 'qr')),
  created_at timestamptz not null default now(),
  constraint cobros_una_sola_atencion check (
    (cita_id is not null)::int + (internacion_id is not null)::int = 1
  )
);

-- Cada atención se cobra una sola vez (los índices parciales sustituyen al
-- unique que tenía cita_id cuando era la única referencia posible).
create unique index cobros_una_vez_por_cita on cobros (cita_id) where cita_id is not null;
create unique index cobros_una_vez_por_internacion
  on cobros (internacion_id)
  where internacion_id is not null;

-- Foto inmutable de lo cobrado: se guarda el precio aplicado en su momento,
-- para que editar el catálogo después no altere los recibos ya emitidos.
create table cobro_lineas (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas (id) on delete cascade,
  cobro_id uuid not null references cobros (id) on delete cascade,
  concepto text not null,
  cantidad integer not null check (cantidad > 0),
  precio_unitario_bs numeric(12, 2) not null check (precio_unitario_bs >= 0),
  subtotal_bs numeric(12, 2) not null check (subtotal_bs >= 0),
  servicio_id uuid references servicios (id),
  producto_id uuid references productos (id)
);

-- =========================================================
-- Row Level Security
-- =========================================================

alter table planes enable row level security;
alter table clinicas enable row level security;
alter table invitaciones enable row level security;
alter table sucursales enable row level security;
alter table usuarios enable row level security;
alter table clientes enable row level security;
alter table pacientes enable row level security;
alter table citas enable row level security;
alter table historial_clinico enable row level security;
alter table consentimientos_cirugia enable row level security;
alter table vacunas_aplicadas enable row level security;
alter table desparasitaciones_aplicadas enable row level security;
alter table internaciones enable row level security;
alter table notas_internacion enable row level security;
alter table productos enable row level security;
alter table movimientos_inventario enable row level security;
alter table turnos_caja enable row level security;
alter table cobros enable row level security;
alter table cobro_lineas enable row level security;
alter table servicios enable row level security;

-- Helpers: leen clinica_id / sucursal_id / rol del usuario autenticado actual.
create or replace function auth_clinica_id() returns uuid as $$
  select clinica_id from usuarios where id = auth.uid();
$$ language sql stable security definer;

create or replace function auth_sucursal_id() returns uuid as $$
  select sucursal_id from usuarios where id = auth.uid();
$$ language sql stable security definer;

create or replace function auth_es_admin() returns boolean as $$
  select rol = 'admin' from usuarios where id = auth.uid();
$$ language sql stable security definer;

-- Dueño del SaaS: administra cuentas, planes y cobros de todos los inquilinos.
create or replace function auth_es_plataforma() returns boolean as $$
  select rol = 'superadmin' from usuarios where id = auth.uid();
$$ language sql stable security definer;

-- planes: catálogo compartido. Cada clínica necesita leer sus propios límites,
-- pero solo la plataforma pone precios.
create policy planes_select on planes for select
  using (true);

create policy planes_plataforma on planes for all
  using (auth_es_plataforma())
  with check (auth_es_plataforma());

-- clinicas: la clínica ve la suya; la plataforma las ve y las administra todas.
-- Dar de alta, suspender o cambiar de plan es exclusivo de la plataforma: un
-- administrador de clínica no puede subirse el plan a sí mismo.
create policy clinicas_select on clinicas for select
  using (id = auth_clinica_id() or auth_es_plataforma());

create policy clinicas_plataforma on clinicas for all
  using (auth_es_plataforma())
  with check (auth_es_plataforma());

-- sucursales: visibles todas las de la clínica (admin ve todas; recepción/vet filtran en UI).
create policy sucursales_select on sucursales for select
  using (clinica_id = auth_clinica_id() or auth_es_plataforma());

-- El alta de sucursales pasa por la plataforma, que es quien controla el tope
-- del plan contratado.
create policy sucursales_plataforma on sucursales for all
  using (auth_es_plataforma())
  with check (auth_es_plataforma());

create policy usuarios_select on usuarios for select
  using (clinica_id = auth_clinica_id() or auth_es_plataforma());

create policy usuarios_plataforma on usuarios for all
  using (auth_es_plataforma())
  with check (auth_es_plataforma());

-- invitaciones: las emite y consulta la plataforma. El canje del token NO pasa
-- por estas políticas: lo resuelve Supabase Auth, que valida el enlace sin que
-- nadie anónimo pueda leer la tabla (si pudiera, tendría todos los tokens).
create policy invitaciones_plataforma on invitaciones for all
  using (auth_es_plataforma())
  with check (auth_es_plataforma());

-- Patrón estándar para tablas de negocio: aislar por clinica_id y,
-- cuando aplica, restringir además a la sucursal del usuario (salvo admin).
-- Nótese que la plataforma NO aparece en estas políticas: para el super admin
-- `auth_clinica_id()` es null, así que las condiciones dan falso y no puede leer
-- ni un solo dato clínico de sus inquilinos. Administra cuentas, no pacientes.
create policy clientes_all on clientes for all
  using (clinica_id = auth_clinica_id())
  with check (clinica_id = auth_clinica_id());

create policy pacientes_all on pacientes for all
  using (clinica_id = auth_clinica_id())
  with check (clinica_id = auth_clinica_id());

create policy citas_all on citas for all
  using (
    clinica_id = auth_clinica_id()
    and (auth_es_admin() or sucursal_id = auth_sucursal_id())
  )
  with check (
    clinica_id = auth_clinica_id()
    and (auth_es_admin() or sucursal_id = auth_sucursal_id())
  );

-- historial_clinico: INSERT/SELECT libres dentro del tenant; UPDATE solo si editable = true
-- (el trigger trg_historial_inmutable es la barrera definitiva ante condiciones de carrera).
create policy historial_select on historial_clinico for select
  using (clinica_id = auth_clinica_id());

create policy historial_insert on historial_clinico for insert
  with check (clinica_id = auth_clinica_id());

create policy historial_update on historial_clinico for update
  using (clinica_id = auth_clinica_id() and editable = true);

-- consentimientos_cirugia: solo INSERT y SELECT, nunca UPDATE/DELETE (inmutable por diseño).
create policy consentimientos_select on consentimientos_cirugia for select
  using (clinica_id = auth_clinica_id());

create policy consentimientos_insert on consentimientos_cirugia for insert
  with check (clinica_id = auth_clinica_id());

-- vacunas_aplicadas: forman parte del expediente clínico, solo INSERT y SELECT.
create policy vacunas_select on vacunas_aplicadas for select
  using (clinica_id = auth_clinica_id());

create policy vacunas_insert on vacunas_aplicadas for insert
  with check (clinica_id = auth_clinica_id());

-- desparasitaciones_aplicadas: mismo trato que las vacunas.
create policy desparasitaciones_select on desparasitaciones_aplicadas for select
  using (clinica_id = auth_clinica_id());

create policy desparasitaciones_insert on desparasitaciones_aplicadas for insert
  with check (clinica_id = auth_clinica_id());

-- internaciones: se crean y se cierran (alta) dentro de la sucursal del usuario.
-- No se borran: el cobro y la hoja de internación las siguen referenciando.
create policy internaciones_select on internaciones for select
  using (clinica_id = auth_clinica_id());

create policy internaciones_insert on internaciones for insert
  with check (
    clinica_id = auth_clinica_id()
    and (auth_es_admin() or sucursal_id = auth_sucursal_id())
  );

create policy internaciones_update on internaciones for update
  using (
    clinica_id = auth_clinica_id()
    and (auth_es_admin() or sucursal_id = auth_sucursal_id())
    -- Una vez dada de alta queda inmutable, igual que un historial cerrado.
    and estado = 'internado'
  );

-- notas_internacion: evolución diaria, solo INSERT y SELECT (como las vacunas).
create policy notas_internacion_select on notas_internacion for select
  using (clinica_id = auth_clinica_id());

create policy notas_internacion_insert on notas_internacion for insert
  with check (
    clinica_id = auth_clinica_id()
    -- No se escriben evoluciones sobre una estadía ya cerrada.
    and exists (
      select 1 from internaciones i
      where i.id = internacion_id and i.estado = 'internado'
    )
  );

create policy productos_all on productos for all
  using (
    clinica_id = auth_clinica_id()
    and (auth_es_admin() or sucursal_id = auth_sucursal_id())
  )
  with check (
    clinica_id = auth_clinica_id()
    and (auth_es_admin() or sucursal_id = auth_sucursal_id())
  );

create policy movimientos_all on movimientos_inventario for all
  using (clinica_id = auth_clinica_id())
  with check (clinica_id = auth_clinica_id());

-- turnos_caja: se abren y se cierran, siempre dentro de la sucursal del usuario.
create policy turnos_caja_all on turnos_caja for all
  using (
    clinica_id = auth_clinica_id()
    and (auth_es_admin() or sucursal_id = auth_sucursal_id())
  )
  with check (
    clinica_id = auth_clinica_id()
    and (auth_es_admin() or sucursal_id = auth_sucursal_id())
  );

-- cobros: inmutables una vez emitidos, solo SELECT e INSERT (como los consentimientos).
create policy cobros_select on cobros for select
  using (clinica_id = auth_clinica_id());

create policy cobros_insert on cobros for insert
  with check (
    clinica_id = auth_clinica_id()
    and (auth_es_admin() or sucursal_id = auth_sucursal_id())
  );

-- cobro_lineas: igual de inmutables que el cobro al que pertenecen.
create policy cobro_lineas_select on cobro_lineas for select
  using (clinica_id = auth_clinica_id());

create policy cobro_lineas_insert on cobro_lineas for insert
  with check (clinica_id = auth_clinica_id());

-- servicios: todos consultan el catálogo, solo el administrador lo modifica.
create policy servicios_select on servicios for select
  using (clinica_id = auth_clinica_id());

create policy servicios_admin on servicios for all
  using (clinica_id = auth_clinica_id() and auth_es_admin())
  with check (clinica_id = auth_clinica_id() and auth_es_admin());
