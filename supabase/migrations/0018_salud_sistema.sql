-- Salud del sistema medida de verdad.
--
-- El panel de plataforma enseñaba cinco indicadores que eran literales en el
-- código (`plataforma.ts`: uptime 99.98 %, cero errores, tres servicios
-- «operativo»). Un tablero que siempre dice que todo va bien es peor que no
-- tenerlo: da confianza justo cuando más importa desconfiar.
--
-- De los cinco:
--   · base de datos y almacenamiento pasan a medirse (abajo y en el cliente),
--   · el contador de errores necesita esta tabla, que no existía,
--   · «API WhatsApp» se elimina: Vetora no llama a ninguna API de WhatsApp,
--     compone un enlace wa.me que abre una persona,
--   · el uptime se elimina: una aplicación no puede medir su propio tiempo en
--     línea, solo puede informar mientras está funcionando.

-- =========================================================
-- 1. Registro de errores
-- =========================================================
create table if not exists registro_errores (
  id uuid primary key default gen_random_uuid(),
  -- Nulo si el fallo ocurrió sin sesión resuelta (por ejemplo en el login).
  clinica_id uuid references clinicas (id) on delete cascade default auth_clinica_id(),
  usuario_id uuid references usuarios (id) on delete set null,
  mensaje text not null,
  -- Dónde ocurrió: ruta, componente o servicio. Nunca datos del paciente.
  contexto text not null default '',
  created_at timestamptz not null default now()
);

-- La consulta del panel es siempre «las últimas 24 h».
create index if not exists registro_errores_recientes on registro_errores (created_at desc);

alter table registro_errores enable row level security;

-- Cualquiera con sesión puede dejar constancia del fallo que acaba de sufrir:
-- si solo pudiera hacerlo el personal, los errores del portal del cliente
-- —que son los que nadie ve— no llegarían nunca.
--
-- `is not distinct from` y no `=`: para el superadmin `auth_clinica_id()` es
-- null, y `null = null` es null, que la policy trataría como falso.
create policy registro_errores_insert on registro_errores for insert
  with check (
    auth.uid() is not null
    and clinica_id is not distinct from (select auth_clinica_id())
  );

-- Solo la plataforma los lee. Un mensaje de error puede arrastrar el nombre de
-- un paciente o de un cliente, así que no se devuelve a otros inquilinos.
create policy registro_errores_plataforma on registro_errores for select
  using ((select auth_es_plataforma()));

-- Sin UPDATE ni DELETE: una bitácora que se puede reescribir no sirve de nada.

-- =========================================================
-- 2. Espacio ocupado por los estudios de imagen
-- =========================================================
-- `security definer` porque las policies de `storage.objects` (0016) acotan por
-- clínica, y el superadmin tiene `clinica_id` nulo: sin esto vería siempre 0.
-- La comprobación de rol va DENTRO, para que la elevación no sirva a nadie más.
create or replace function espacio_estudios_bytes() returns bigint
  language plpgsql
  security definer
  set search_path = public, storage, pg_temp
as $$
declare
  v_total bigint;
begin
  if not auth_es_plataforma() then
    raise exception 'Solo la plataforma puede consultar el espacio ocupado';
  end if;

  select coalesce(sum((metadata->>'size')::bigint), 0)
    into v_total
    from storage.objects
   where bucket_id = 'estudios';

  return v_total;
end;
$$;

revoke all on function espacio_estudios_bytes() from public;
grant execute on function espacio_estudios_bytes() to authenticated;
