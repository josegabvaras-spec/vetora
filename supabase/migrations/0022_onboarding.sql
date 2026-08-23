-- Estado del tour de bienvenida, por usuario.
--
-- ⚠️ POR QUÉ ES UNA TABLA APARTE Y NO DOS COLUMNAS EN `usuarios`.
--
-- Lo natural sería añadir `onboarding_completado` y `onboarding_version` a
-- `usuarios`. Pero hoy la ÚNICA policy de UPDATE sobre esa tabla es
-- `usuarios_plataforma` (solo el superadmin), y para que cada persona marcara
-- su propio tour haría falta algo como:
--
--     create policy ... on usuarios for update using (id = auth.uid())
--
-- **La RLS de PostgreSQL es por FILA, no por columna.** Esa policy no sabe
-- distinguir «marca tu onboarding» de «cámbiate el rol»: con ella, cualquier
-- usuario podría hacer `update usuarios set rol = 'admin' where id = auth.uid()`
-- y ascenderse solo. Es exactamente la escalada de privilegios que la auditoría
-- comprobó que NO existe hoy (ver SEGURIDAD.md).
--
-- Aquí no hay nada que valga la pena falsificar: lo peor que consigue alguien
-- tocando su fila es volver a ver el tutorial.

create table if not exists onboarding_usuario (
  usuario_id uuid primary key references usuarios (id) on delete cascade,
  completado boolean not null default false,

  -- Versión del tour que esta persona ya vio. El código lleva la suya
  -- (`VERSION_ONBOARDING` en src/lib/onboarding.ts) y el tour salta solo cuando
  -- la de aquí es menor. Subirla el día que se añada una función importante lo
  -- vuelve a mostrar a todos, sin tocar la base ni borrar filas.
  version int not null default 0,

  actualizado_at timestamptz not null default now()
);

alter table onboarding_usuario enable row level security;

-- Cada quien, y solo sobre lo suyo. Sirve para las cuatro operaciones: la fila
-- no existe hasta que alguien termina (o cierra) el tour por primera vez, así
-- que el servicio hace `upsert` y necesita tanto INSERT como UPDATE.
drop policy if exists onboarding_propio on onboarding_usuario;
create policy onboarding_propio on onboarding_usuario for all
  using (usuario_id = (select auth.uid()))
  with check (usuario_id = (select auth.uid()));
