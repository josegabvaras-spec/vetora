-- Recetario: la tabla `recetas`, que el codigo llamaba y nunca existio.
--
-- Sintoma: cualquier operacion del recetario devolvia
--   {"code":"PGRST205","message":"Could not find the table 'public.recetas'"}
-- Los `(supabase as any)` de historial.ts:250,273 y clientesPacientes.ts:77
-- son lo que impidio que `tsc` lo detectara. `views.ts` ya exige
-- `receta: RecetaItem[]` en `HistorialConDetalle`, asi que la ficha del
-- paciente dependia de una tabla inexistente.

create table if not exists recetas (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas (id) on delete cascade
    default auth_clinica_id(),
  historial_id uuid not null references historial_clinico (id) on delete cascade,
  paciente_id uuid not null references pacientes (id) on delete cascade,
  medicamento text not null,
  dosis text not null,
  -- Mismo conjunto que el tipo `ViaAdministracion` de types/database.ts.
  via text not null check (
    via in ('oral','intramuscular','subcutanea','intravenosa','topica','oftalmica','otica')
  ),
  frecuencia text not null,
  duracion text not null,
  indicaciones text,
  created_at timestamptz not null default now()
);

alter table recetas enable row level security;

-- La receta forma parte del expediente: mismo trato que las vacunas, salvo que
-- SI se puede borrar mientras la consulta siga en borrador (el veterinario se
-- equivoca al teclear un medicamento y lo quita antes de firmar).
create policy recetas_select on recetas for select
  using (clinica_id = (select auth_clinica_id()) and (select auth_es_personal()));

-- Solo se escriben mientras el historial es borrador. `exigirBorrador()` en
-- services/historial.ts hace la misma comprobacion; esta es la que no se puede
-- saltar desde una peticion HTTP directa.
create policy recetas_insert on recetas for insert
  with check (
    clinica_id = (select auth_clinica_id())
    and (select auth_es_personal())
    and exists (
      select 1 from historial_clinico h
      where h.id = historial_id and h.editable = true
    )
  );

create policy recetas_delete on recetas for delete
  using (
    clinica_id = (select auth_clinica_id())
    and (select auth_es_personal())
    and exists (
      select 1 from historial_clinico h
      where h.id = historial_id and h.editable = true
    )
  );

-- Sin UPDATE a proposito: una linea de receta se borra y se vuelve a escribir,
-- igual que los consentimientos y los cobros. Una posologia editada en
-- silencio sobre una consulta ya firmada seria un documento clinico alterado.

-- El cliente del portal ve las recetas de SUS mascotas, y solo de consultas ya
-- cerradas: un borrador es trabajo en curso del veterinario.
create policy recetas_portal on recetas for select
  using (
    exists (
      select 1 from historial_clinico h
      where h.id = recetas.historial_id and h.editable = false
    )
    and exists (
      select 1 from pacientes p
      join clientes c on c.id = p.cliente_id
      where p.id = recetas.paciente_id and c.usuario_id = auth.uid()
    )
  );

create index if not exists recetas_por_historial on recetas (historial_id);
create index if not exists recetas_por_paciente  on recetas (clinica_id, paciente_id);
