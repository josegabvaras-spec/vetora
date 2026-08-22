-- Estudios de imagen (ecografía, rayos X) colgados de la consulta.
--
-- Es la primera vez que el proyecto usa Supabase Storage. Hasta ahora todas las
-- imágenes viven en base64 dentro de columnas `text` (`pacientes.foto`, las
-- firmas), y para una radiografía eso no sirve: pesan varios MB, base64 añade
-- un tercio, y `useTable` hace `select('*')` sin filtro sobre `pacientes`, que
-- ya se descarga entera con sus fotos en la agenda y en internación.

-- =========================================================
-- 1. El bucket
-- =========================================================
-- PRIVADO. Uno público entrega la imagen a cualquiera que tenga la URL, sin
-- sesión, y esto son datos clínicos. Se leen con URLs firmadas y caducas.
--
-- El tope de 10 MB es la última barrera: el navegador ya redimensiona antes de
-- subir (lib/imagen.ts), pero esa comprobación se puede saltar con una petición
-- directa.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('estudios', 'estudios', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- =========================================================
-- 2. Metadatos del estudio
-- =========================================================
-- Mismo patrón que `recetas` (0008): cuelga del historial, se escribe solo
-- mientras la consulta es borrador y el dueño la ve cuando ya está cerrada.
create table if not exists estudios_imagen (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas (id) on delete cascade
    default auth_clinica_id(),
  historial_id uuid not null references historial_clinico (id) on delete cascade,
  paciente_id uuid not null references pacientes (id) on delete cascade,

  -- Ruta dentro del bucket: {clinica_id}/{paciente_id}/{uuid}.jpg
  -- La clínica va PRIMERA para que las policies de storage.objects puedan
  -- aislar inquilinos con (storage.foldername(name))[1].
  --
  -- `unique` para que dos filas no puedan apuntar al mismo archivo: al borrar
  -- una se llevaría la imagen de la otra por delante.
  ruta text not null unique,

  tipo text not null check (tipo in ('ecografia', 'radiografia', 'otro')),
  descripcion text not null default '',
  created_at timestamptz not null default now()
);

alter table estudios_imagen enable row level security;

create policy estudios_select on estudios_imagen for select
  using (clinica_id = (select auth_clinica_id()) and (select auth_es_personal()));

-- Solo se adjuntan mientras la consulta sigue abierta, igual que las recetas.
create policy estudios_insert on estudios_imagen for insert
  with check (
    clinica_id = (select auth_clinica_id())
    and (select auth_es_personal())
    and exists (
      select 1 from historial_clinico h
      where h.id = historial_id and h.editable = true
    )
  );

create policy estudios_delete on estudios_imagen for delete
  using (
    clinica_id = (select auth_clinica_id())
    and (select auth_es_personal())
    and exists (
      select 1 from historial_clinico h
      where h.id = historial_id and h.editable = true
    )
  );

-- Sin UPDATE a propósito: un estudio adjunto a una consulta firmada no se
-- reemplaza en silencio. Se borra en borrador y se vuelve a subir.

-- El dueño ve los estudios de SUS mascotas, y solo de consultas ya cerradas.
create policy estudios_portal on estudios_imagen for select
  using (
    exists (
      select 1 from historial_clinico h
      where h.id = estudios_imagen.historial_id and h.editable = false
    )
    and exists (
      select 1 from pacientes p
      join clientes c on c.id = p.cliente_id
      where p.id = estudios_imagen.paciente_id and c.usuario_id = auth.uid()
    )
  );

create index if not exists estudios_por_historial on estudios_imagen (historial_id);
create index if not exists estudios_por_paciente  on estudios_imagen (clinica_id, paciente_id);

-- =========================================================
-- 3. Quién puede tocar los archivos
-- =========================================================
-- Las policies de personal van por RUTA y no por la fila de metadatos, y es
-- obligatorio: el archivo se sube ANTES de que exista su fila, así que en ese
-- momento no hay metadato contra el que comprobar nada.

drop policy if exists estudios_objetos_select on storage.objects;
create policy estudios_objetos_select on storage.objects for select
  using (
    bucket_id = 'estudios'
    and (storage.foldername(name))[1] = (select auth_clinica_id())::text
    and (select auth_es_personal())
  );

drop policy if exists estudios_objetos_insert on storage.objects;
create policy estudios_objetos_insert on storage.objects for insert
  with check (
    bucket_id = 'estudios'
    and (storage.foldername(name))[1] = (select auth_clinica_id())::text
    and (select auth_es_personal())
  );

drop policy if exists estudios_objetos_delete on storage.objects;
create policy estudios_objetos_delete on storage.objects for delete
  using (
    bucket_id = 'estudios'
    and (storage.foldername(name))[1] = (select auth_clinica_id())::text
    and (select auth_es_personal())
  );

-- El dueño, en cambio, se resuelve POR LA FILA DE METADATOS y no por la ruta:
-- así puede leer exactamente los archivos cuya ficha se le permite ver, y el
-- requisito de «consulta cerrada» queda cerrado en las dos capas. Comprobarlo
-- por ruta le habría dado acceso a cualquier estudio de su mascota, incluidos
-- los de una consulta que el veterinario todavía está escribiendo.
drop policy if exists estudios_objetos_portal on storage.objects;
create policy estudios_objetos_portal on storage.objects for select
  using (
    bucket_id = 'estudios'
    and exists (
      select 1
        from estudios_imagen e
        join historial_clinico h on h.id = e.historial_id
        join pacientes p on p.id = e.paciente_id
        join clientes c on c.id = p.cliente_id
       where e.ruta = storage.objects.name
         and h.editable = false
         and c.usuario_id = auth.uid()
    )
  );
