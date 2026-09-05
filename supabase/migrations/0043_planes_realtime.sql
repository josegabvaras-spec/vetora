-- Migración 0043: Sincronización en tiempo real de planes y configuración
-- Asegura que la tabla planes y configuracion_plataforma emitan eventos a través de supabase_realtime
-- para que tanto el modal de planes de la página de inicio como el panel del superadmin
-- se actualicen automáticamente sin recargar la página.

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and tablename = 'planes'
    ) then
      alter publication supabase_realtime add table planes;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and tablename = 'configuracion_plataforma'
    ) then
      alter publication supabase_realtime add table configuracion_plataforma;
    end if;
  end if;
end $$;
