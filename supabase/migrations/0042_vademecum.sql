-- El vademécum propio de la clínica: sus medicamentos, con sus dosis.
--
-- Existe por dos motivos, y el primero no tiene nada que ver con la IA.
--
--   1. `recetas.medicamento` y `recetas.dosis` son `text` LIBRE (0008). Hoy
--      conviven «Amoxicilina», «Amoxi 500» y «amoxi clavulánico» como si fueran
--      cosas distintas, y una dosis puede ser «15 mg/kg» o «media pastilla».
--      Eso ensucia el recetario, la receta impresa y cualquier informe futuro.
--      Un catálogo controlado es de donde el recetario puede autocompletar.
--
--   2. El copiloto ya puede señalar que una dosis no cuadra con el peso o la
--      especie, pero lo hace contra lo que el modelo aprendió en su
--      entrenamiento: no hay NADA que el veterinario pueda abrir y contrastar,
--      aunque la pantalla enseñe qué se consultó. Con esta tabla, la fuente de
--      esa advertencia es una fila que escribió la propia clínica.
--
-- ⚠️ **NO se enlaza con `productos`, y es deliberado.** `productos` es por
-- SUCURSAL (`unique (sucursal_id, sku)` en 0001), así que el mismo fármaco es
-- una fila distinta en cada sede y un FK desde una tabla de clínica elegiría
-- una sede arbitraria. Lo que hace falta para pasar de mg/kg a mililitros no es
-- el producto: es la CONCENTRACIÓN, que es del fármaco y no de la sede, y por
-- eso vive aquí (`concentracion_mg` por `unidad_dosificacion`).
--
-- ⚠️ `clinica_id` lleva `default auth_clinica_id()`. Es la lección de 0040 y
-- 0041: sin él, el INSERT manda null, el `with check (clinica_id =
-- auth_clinica_id())` falla y la tabla queda con un 403 en cada alta — que es
-- exactamente lo que dejó las siete tablas de peluquería vacías en producción.
--
-- Re-ejecutable de principio a fin.

-- =========================================================
-- Quién puede ESCRIBIR el vademécum
-- =========================================================

-- Leerlo lo puede todo el personal; escribirlo, no. Una dosis mal anotada aquí
-- se propaga al recetario y a lo que el copiloto presenta como comprobación, y
-- ni recepción ni el peluquero tienen por qué fijar criterio clínico.
--
-- ⚠️ Es `security definer` por la MISMA razón que las cuatro `auth_*` de 0001:
-- lee `usuarios`, que está bajo RLS. Una policy que consulte otra tabla con RLS
-- cierra un ciclo y PostgreSQL aborta con 42P17 — es el fallo que se estrelló
-- en 0036 y hubo que corregir en 0037. No lo escribas como subconsulta.
create or replace function auth_es_clinico()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from usuarios
    where id = auth.uid() and activo and rol in ('admin', 'veterinario')
  );
$$;

comment on function auth_es_clinico() is
  'Si quien llama es admin o veterinario: los roles que pueden fijar criterio clínico.';

-- =========================================================
-- La tabla
-- =========================================================

create table if not exists vademecum (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas (id) on delete cascade
    default auth_clinica_id(),

  -- Cómo lo llama la clínica; es lo que verá el recetario al autocompletar.
  nombre text not null,
  principio_activo text not null default '',
  -- Legible para el humano: «Frasco 100 ml suspensión oral».
  presentacion text not null default '',

  -- La concentración es lo único que permite convertir una dosis en mg/kg a
  -- algo que se pueda administrar. `concentracion_mg` son los miligramos de
  -- principio activo que hay en UNA `unidad_dosificacion`.
  concentracion_mg numeric(12, 3),
  unidad_dosificacion text not null default 'ml'
    check (unidad_dosificacion in ('ml', 'tableta', 'capsula', 'g', 'gota')),

  -- Una misma molécula se dosifica distinto en gato que en perro, así que la
  -- especie es parte de la identidad de la ficha, no un filtro.
  especie text not null default 'todos'
    check (especie in ('todos', 'canino', 'felino')),

  -- Mismo conjunto que `recetas.via` (0008) y que el tipo `ViaAdministracion`.
  via text not null default 'oral'
    check (via in ('oral', 'intramuscular', 'subcutanea', 'intravenosa', 'topica', 'oftalmica', 'otica')),

  dosis_min_mg_kg numeric(10, 3),
  dosis_max_mg_kg numeric(10, 3),
  frecuencia text not null default '',
  duracion_habitual text not null default '',

  -- Lo que hay que mirar antes de recetarlo. Se guarda como texto libre a
  -- propósito: «no en gatos», «no en gestantes», «control renal» no caben en
  -- un enumerado sin quedarse cortos el primer día.
  contraindicaciones text,
  notas text,

  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Un rango al revés no es un dato incompleto, es un dato erróneo.
  constraint vademecum_rango_dosis check (
    dosis_min_mg_kg is null
    or dosis_max_mg_kg is null
    or dosis_max_mg_kg >= dosis_min_mg_kg
  ),
  constraint vademecum_dosis_positiva check (
    (dosis_min_mg_kg is null or dosis_min_mg_kg > 0)
    and (dosis_max_mg_kg is null or dosis_max_mg_kg > 0)
  ),
  constraint vademecum_concentracion_positiva check (
    concentracion_mg is null or concentracion_mg > 0
  ),
  constraint vademecum_nombre_no_vacio check (length(trim(nombre)) > 0)
);

-- Una ficha por fármaco y especie: la misma amoxicilina puede tener una entrada
-- para canino y otra para felino, pero no dos para canino.
create unique index if not exists vademecum_unico
  on vademecum (clinica_id, lower(trim(nombre)), especie);

-- La búsqueda del copiloto y la del recetario van por nombre y por principio
-- activo; ambas son `ilike` sobre la clínica entera.
create index if not exists vademecum_clinica_nombre on vademecum (clinica_id, nombre);
create index if not exists vademecum_clinica_principio on vademecum (clinica_id, principio_activo);

-- =========================================================
-- RLS
-- =========================================================

alter table vademecum enable row level security;

-- Lectura: todo el personal. El peluquero incluido — `auth_es_personal()` lo
-- cuenta desde 0025 y saber que un champú medicado no va en gatos es
-- exactamente lo que le sirve.
drop policy if exists vademecum_select on vademecum;
create policy vademecum_select on vademecum
  for select using (clinica_id = auth_clinica_id() and auth_es_personal());

drop policy if exists vademecum_insert on vademecum;
create policy vademecum_insert on vademecum
  for insert with check (clinica_id = auth_clinica_id() and auth_es_clinico());

drop policy if exists vademecum_update on vademecum;
create policy vademecum_update on vademecum
  for update using (clinica_id = auth_clinica_id() and auth_es_clinico())
  with check (clinica_id = auth_clinica_id() and auth_es_clinico());

-- Se borra en vez de desactivarse solo cuando la ficha se creó por error: no es
-- un historial ni un cobro, no hay nada que preservar. Para retirarla del uso
-- sin perder lo escrito está `activo`.
drop policy if exists vademecum_delete on vademecum;
create policy vademecum_delete on vademecum
  for delete using (clinica_id = auth_clinica_id() and auth_es_clinico());

comment on table vademecum is
  'Catálogo propio de medicamentos de la clínica: concentración, dosis por kg y contraindicaciones. Alimenta el recetario y da al copiloto una fuente contrastable para sus advertencias de dosis.';
