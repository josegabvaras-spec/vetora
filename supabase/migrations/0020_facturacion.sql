-- Facturación de la suscripción: la clínica paga con QR y manda el comprobante.
--
-- Hasta ahora el cobro vivía entero FUERA del sistema: el dueño de la
-- plataforma veía quién debía, escribía por WhatsApp, y al recibir el dinero
-- pulsaba «Registrar cobro del mes» a mano. La clínica no tenía ninguna
-- pantalla: ni cuánto paga, ni cuándo vence, ni dónde mandar el comprobante.
--
-- No hay pasarela de pago. El circuito es: QR → foto del comprobante → tarea en
-- el asistente del superadmin → aprobación → la fecha del próximo cobro avanza.

-- =========================================================
-- 1. El QR y los datos de cobro
-- =========================================================
-- Van en `configuracion_plataforma` (0019), que es de UNA sola fila por
-- construcción: el QR es el mismo para todas las clínicas porque es la cuenta
-- del dueño de la plataforma, no de cada veterinaria.
alter table configuracion_plataforma
  add column if not exists qr_pago text,
  add column if not exists datos_pago text not null default '';

-- La policy de SELECT de 0019 era `auth.uid() is not null`: cualquiera con
-- sesión, incluido un cliente del portal. Ahora esa fila lleva datos bancarios,
-- así que se estrecha a los dos que de verdad la leen — el admin de la clínica
-- (pantalla de Facturación) y el dueño de la plataforma.
drop policy if exists configuracion_select on configuracion_plataforma;
create policy configuracion_select on configuracion_plataforma for select
  using (auth_es_admin() or auth_es_plataforma());

-- =========================================================
-- 2. Los comprobantes
-- =========================================================
-- PRIVADO y con URLs firmadas, igual que `estudios` (0016). Un comprobante de
-- transferencia lleva nombre, banco y número de operación.
--
-- 5 MB: el navegador ya redimensiona antes de subir (lib/imagen.ts), pero eso
-- se puede saltar con una petición directa.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('comprobantes', 'comprobantes', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Una fila por comprobante enviado.
--
-- ⚠️ ESTA TABLA LLEVA `auth_es_plataforma()` EN SUS POLICIES, Y NO CONTRADICE
--    LA REGLA DE CLAUDE.md. Esa regla prohíbe abrirle al superadmin las tablas
--    CLÍNICAS (pacientes, historial, cobros de la veterinaria). Esto es del
--    dominio de la plataforma —como `clinicas` y `planes`, que ya lo llevan
--    desde 0001—: es el cobro que la plataforma le hace a su cliente, no el
--    dato de un paciente. No lo uses como precedente para lo otro.
create table if not exists pagos_suscripcion (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas (id) on delete cascade
    default auth_clinica_id(),

  -- Cuántos meses de suscripción cubre este pago. Al aprobarlo, `proximo_cobro`
  -- avanza justo esto.
  meses int not null check (meses > 0 and meses <= 24),

  -- CONGELADOS en el momento de pagar, igual que `cobro_lineas` congela los
  -- precios: si mañana sube la tarifa o se mueve el tipo de cambio, este
  -- comprobante tiene que seguir diciendo lo que se pagó y a cuánto.
  monto_usd numeric(12, 2) not null check (monto_usd >= 0),
  tipo_cambio_usd numeric(10, 4) not null check (tipo_cambio_usd > 0),
  monto_bs numeric(12, 2) not null check (monto_bs >= 0),

  -- Ruta dentro del bucket: {clinica_id}/{uuid}.jpg
  -- La clínica va PRIMERA para que las policies de `storage.objects` aíslen
  -- inquilinos con (storage.foldername(name))[1]. `unique` para que dos filas
  -- no apunten al mismo archivo.
  ruta_comprobante text not null unique,

  -- Número de operación o de transacción, tal como lo teclea quien paga.
  referencia text not null default '',

  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'aprobado', 'rechazado')),

  -- Los escribe SOLO el superadmin al revisar. El motivo del rechazo lo lee la
  -- clínica en su historial, así que no es una nota interna.
  motivo_rechazo text,
  revisado_por uuid references usuarios (id),
  revisado_at timestamptz,

  created_at timestamptz not null default now()
);

alter table pagos_suscripcion enable row level security;

-- La clínica ve lo suyo. Es cosa del admin: recepción y el veterinario no
-- gestionan la suscripción.
drop policy if exists pagos_clinica_select on pagos_suscripcion;
create policy pagos_clinica_select on pagos_suscripcion for select
  using (clinica_id = (select auth_clinica_id()) and (select auth_es_admin()));

-- Y solo INSERTA. El `with check` es la barrera de verdad: sin él, el admin
-- podía enviar el comprobante ya marcado como aprobado y saltarse la revisión
-- entera. Nace pendiente y sin nada de la revisión rellenado.
drop policy if exists pagos_clinica_insert on pagos_suscripcion;
create policy pagos_clinica_insert on pagos_suscripcion for insert
  with check (
    clinica_id = (select auth_clinica_id())
    and (select auth_es_admin())
    and estado = 'pendiente'
    and motivo_rechazo is null
    and revisado_por is null
    and revisado_at is null
  );

-- Sin UPDATE ni DELETE para la clínica, a propósito: como los cobros y los
-- consentimientos, un comprobante enviado no se retira ni se retoca. Si estaba
-- mal, el superadmin lo rechaza con un motivo y se manda otro.

drop policy if exists pagos_plataforma on pagos_suscripcion;
create policy pagos_plataforma on pagos_suscripcion for all
  using (auth_es_plataforma())
  with check (auth_es_plataforma());

create index if not exists pagos_por_clinica on pagos_suscripcion (clinica_id, created_at desc);
-- Índice parcial: el asistente del superadmin solo pregunta por los pendientes,
-- y son un puñado frente a todo el histórico.
create index if not exists pagos_pendientes on pagos_suscripcion (created_at) where estado = 'pendiente';

-- =========================================================
-- 3. Quién puede tocar los archivos
-- =========================================================
-- Por RUTA y no por la fila de metadatos, y es obligatorio: el archivo se sube
-- ANTES de que exista su fila, así que en ese momento no hay nada contra lo que
-- comprobar. Mismo razonamiento que en 0016.
--
-- El superadmin no empareja por ruta —su `auth_clinica_id()` es null—, así que
-- necesita su propia rama: sin ella no podría ver el comprobante que tiene que
-- aprobar, que es justo el objetivo de todo esto.

drop policy if exists comprobantes_select on storage.objects;
create policy comprobantes_select on storage.objects for select
  using (
    bucket_id = 'comprobantes'
    and (
      ((storage.foldername(name))[1] = (select auth_clinica_id())::text and (select auth_es_admin()))
      or (select auth_es_plataforma())
    )
  );

drop policy if exists comprobantes_insert on storage.objects;
create policy comprobantes_insert on storage.objects for insert
  with check (
    bucket_id = 'comprobantes'
    and (storage.foldername(name))[1] = (select auth_clinica_id())::text
    and (select auth_es_admin())
  );

-- Borrar solo la clínica, y existe por un motivo concreto: si el INSERT de la
-- fila falla después de subir el archivo, el servicio lo retira para que no
-- quede ocupando cuota e invisible desde la aplicación.
drop policy if exists comprobantes_delete on storage.objects;
create policy comprobantes_delete on storage.objects for delete
  using (
    bucket_id = 'comprobantes'
    and (storage.foldername(name))[1] = (select auth_clinica_id())::text
    and (select auth_es_admin())
  );
