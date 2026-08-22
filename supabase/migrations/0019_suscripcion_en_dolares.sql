-- La suscripción de las clínicas pasa a fijarse en dólares.
--
-- Lo que sostiene la plataforma —dominio, Supabase, Vercel— se paga en dólares
-- y se mueve. Con el precio fijado en bolivianos, cada movimiento del tipo de
-- cambio se comía el margen sin que nadie lo viera.
--
-- ⚠️ SOLO cambia la suscripción. Lo que cada clínica le cobra a SUS clientes
--    (consultas, productos, recibos, caja) sigue en bolivianos, como fija el
--    PRD: quien paga ahí es un dueño de mascota en Bolivia.

-- =========================================================
-- 1. Tipo de cambio, configurable
-- =========================================================
-- `boolean primary key check (id)` fuerza que exista UNA sola fila: con `true`
-- como único valor admitido, no hay forma de insertar una segunda. Así nadie
-- tiene que preguntarse cuál de dos tipos de cambio es el bueno.
create table if not exists configuracion_plataforma (
  id boolean primary key default true check (id),
  tipo_cambio_usd numeric(10, 4) not null check (tipo_cambio_usd > 0),
  actualizado_at timestamptz not null default now()
);

-- 6.96 es el cambio oficial boliviano de los últimos años. Es un punto de
-- partida, no un dato de la aplicación: se corrige desde el panel.
insert into configuracion_plataforma (id, tipo_cambio_usd)
values (true, 6.96)
on conflict (id) do nothing;

alter table configuracion_plataforma enable row level security;

-- Un tipo de cambio no es un secreto, y la clínica podría querer ver a cuánto
-- se le convierte su cuota.
create policy configuracion_select on configuracion_plataforma for select
  using (auth.uid() is not null);

-- Fijarlo es cosa del dueño de la plataforma: de ahí sale lo que se factura.
create policy configuracion_plataforma_admin on configuracion_plataforma for all
  using (auth_es_plataforma())
  with check (auth_es_plataforma());

-- =========================================================
-- 2. Los precios pasan a dólares
-- =========================================================
-- ⚠️ LOS VALORES NO SE CONVIERTEN. Un plan que hoy vale «300» seguirá diciendo
--    «300», ahora leído como dólares. Dividir por una tasa supuesta inventaría
--    precios que nadie decidió, y esto es lo que se factura.
--
--    DESPUÉS DE APLICAR ESTA MIGRACIÓN hay que revisar el precio de cada plan
--    y de cada clínica desde el panel de plataforma.
alter table planes rename column precio_mensual_bs to precio_mensual_usd;
alter table clinicas rename column precio_acordado_bs to precio_acordado_usd;

-- Los `check` viajan con la columna al renombrarla, así que el «>= 0» sigue en
-- pie sin tener que recrearlo.
