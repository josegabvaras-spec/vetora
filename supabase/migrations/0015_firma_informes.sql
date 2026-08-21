-- Firma de los informes impresos: historial completo e informes específicos.
--
-- A diferencia del consentimiento, estos documentos NO tienen fila propia: se
-- componen al vuelo desde `historial_clinico` cada vez que se abren. Sin una
-- tabla donde anclar la firma, imprimir un informe firmado y volver a abrirlo
-- lo devolvía en blanco.

create table informes_firmados (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null default auth_clinica_id() references clinicas (id) on delete cascade,
  paciente_id uuid not null references pacientes (id) on delete cascade,

  -- Qué documento se firmó. Coincide con el `:tipo` de la ruta
  -- `/pacientes/:id/reporte/:tipo/:itemId?`; 'historial' es el completo.
  tipo text not null check (
    tipo in ('historial', 'consulta', 'laboratorio', 'imagenologia', 'cirugia')
  ),
  -- Consulta concreta a la que se refiere el informe. Null en el historial
  -- completo, que no habla de una sola consulta.
  item_id uuid,

  -- Base64 del PNG, igual que en `consentimientos_cirugia` (0012).
  firma_tutor text not null,
  firma_veterinario text not null,
  -- Congelados al firmar: el documento debe seguir diciendo quién firmó aunque
  -- cambie la ficha del cliente o el veterinario cause baja.
  nombre_tutor text not null,
  nombre_veterinario text not null,
  veterinario_id uuid references usuarios (id) on delete set null,

  created_at timestamptz not null default now()
);

-- La página busca la firma más reciente de ese documento.
create index informes_firmados_lookup
  on informes_firmados (clinica_id, paciente_id, tipo, created_at desc);

-- =========================================================
-- RLS
-- =========================================================
alter table informes_firmados enable row level security;

-- Solo SELECT e INSERT, como los consentimientos y los cobros: un documento
-- firmado no se edita.
--
-- Volver a firmar inserta una fila nueva en vez de pisar la anterior, y es
-- deliberado: el historial completo cambia con el tiempo, así que una firma de
-- marzo no certifica lo que el documento dice en junio. Se conservan todas y la
-- página enseña la última.
create policy informes_firmados_select on informes_firmados for select
  using (clinica_id = (select auth_clinica_id()) and (select auth_es_personal()));

create policy informes_firmados_insert on informes_firmados for insert
  with check (clinica_id = (select auth_clinica_id()) and (select auth_es_personal()));

-- El dueño lee, desde el portal, los informes de sus propias mascotas. Mismo
-- patrón que `consentimientos_portal` (0012): policy aparte, nunca relajar la
-- de personal a solo `clinica_id`, que devolvería los informes de toda la
-- clínica a cualquier cliente.
create policy informes_firmados_portal on informes_firmados for select
  using (exists (
    select 1 from pacientes p
    join clientes c on c.id = p.cliente_id
    where p.id = informes_firmados.paciente_id and c.usuario_id = auth.uid()
  ));
