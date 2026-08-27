-- Catálogo de productos: vitrina comercial de la clínica, visible por
-- cualquier dueño de mascota con sesión en el portal, sin importar de qué
-- clínica sea.
--
-- No es inventario. `productos` (0001, alterada por 0002/0010/0011/0013) es
-- kardex por SUCURSAL: sku, presentación, composición, stock fraccionado —
-- sin foto ni descripción de marketing, y sin ningún acceso para el rol
-- `cliente` (0004 lo deja así a propósito). Mezclar las dos cosas sería
-- forzar un mal ajuste de modelo. `catalogo_productos` es a nivel CLÍNICA
-- (no de sucursal): es un escaparate del negocio, no dosificación por sede.
--
-- No hay carrito ni pago: como en todo el resto de la app, lo comercial se
-- resuelve con un enlace `wa.me` (lib/whatsapp.ts, `enlaceWhatsapp`), nunca
-- con `enviarMensajeWhatsapp` — ese gasta la cuota mensual del plan pensada
-- para avisos que decide mandar el personal, no una consulta que decide un
-- comprador.

-- =========================================================
-- 1. La tabla
-- =========================================================
create table if not exists catalogo_productos (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas (id) on delete cascade
    default auth_clinica_id(),

  nombre text not null,
  descripcion text not null default '',

  -- Texto libre a propósito, a diferencia de `servicios.categoria`
  -- (CategoriaServicio, fijo). Ahí un enum fijo tiene sentido porque son
  -- siete categorías clínicas iguales para cualquier veterinaria. Aquí una
  -- veterinaria, una peluquería y un petshop agrupan sus productos de forma
  -- completamente distinta, y ningún reporte ni policy del sistema depende
  -- de un valor fijo.
  categoria text not null default '',

  precio_bs numeric(12, 2) not null default 0 check (precio_bs >= 0),

  -- Ruta dentro del bucket PÚBLICO `catalogo`: {clinica_id}/{uuid}.jpg
  -- Nullable: se puede publicar sin foto y agregarla después.
  foto_ruta text,

  -- Se oculta de la Tienda en vez de borrarse al agotar temporada o stock;
  -- el admin la reactiva cuando vuelve a tener. Mismo patrón que
  -- `servicios.activo`.
  disponible boolean not null default true,

  created_at timestamptz not null default now()
);

alter table catalogo_productos enable row level security;

create index if not exists catalogo_productos_por_clinica
  on catalogo_productos (clinica_id);

-- =========================================================
-- 2. Quién gestiona: solo el administrador
-- =========================================================
-- Mismo criterio que `servicios` (0001): fija precios públicos del negocio,
-- y eso es exclusivo de admin en toda la aplicación, sin importar el tipo de
-- negocio (veterinaria/peluquería/petshop comparten los mismos roles).

drop policy if exists catalogo_productos_select on catalogo_productos;
create policy catalogo_productos_select on catalogo_productos for select
  using (clinica_id = (select auth_clinica_id()) and (select auth_es_personal()));

drop policy if exists catalogo_productos_admin on catalogo_productos;
create policy catalogo_productos_admin on catalogo_productos for all
  using (clinica_id = (select auth_clinica_id()) and (select auth_es_admin()))
  with check (clinica_id = (select auth_clinica_id()) and (select auth_es_admin()));

-- =========================================================
-- 3. Lectura pública para el portal — SOLO CON SESIÓN
-- =========================================================
-- `to authenticated` es la puerta de "solo con sesión" (decisión ya tomada):
-- calza con `ProtectedRoute`, que ya exige sesión para entrar a
-- /portal-cliente. No hace falta comparar `usuario.rol = 'cliente'` aquí —
-- cualquier cuenta con sesión válida puede ver catálogos ajenos, y eso es
-- exactamente lo que se pide: un escaparate, no un dato sensible.
--
-- La única policy del proyecto que mira `modulos_habilitados`: es la única
-- tabla cuyo propósito ENTERO es mostrarse a quien no es de la clínica. Si
-- el plan de la clínica ya no trae `catalogo` (bajó de plan), sus productos
-- desaparecen de la Tienda aunque sigan en la tabla — no hace falta
-- borrarlos.
--
-- Si el día de mañana la Tienda pasa a ser pública SIN sesión: quitar
-- `to authenticated` de esta policy y agregar el mismo acceso a `anon`. La
-- comprobación del `using` sigue funcionando igual para un anónimo — lo
-- único que impedía el acceso era el `to authenticated`.
drop policy if exists catalogo_productos_portal on catalogo_productos;
create policy catalogo_productos_portal on catalogo_productos for select
  to authenticated
  using (
    disponible = true
    and exists (
      select 1
        from clinicas c
        join planes p on p.id = c.plan_id
       where c.id = catalogo_productos.clinica_id
         and c.estado <> 'suspendida'
         and 'catalogo' = any (p.modulos_habilitados)
    )
  );

-- =========================================================
-- 4. Clínicas visibles en la Tienda
-- =========================================================
-- `clinicas_select` (0001) es `id = auth_clinica_id() or auth_es_plataforma()`:
-- un cliente de la clínica B no puede leer la fila de la clínica A, ni
-- directo ni incrustada en un `select('*, clinicas(...)')` de PostgREST — el
-- embedding respeta la RLS de la tabla incrustada igual que una consulta
-- directa.
--
-- No es corregible con una policy de fila: `clinicas` tiene columnas que NO
-- deben salir de la clínica (responsable, cuota de WhatsApp consumida,
-- estado de pago, plan contratado). Mismo motivo por el que existe
-- `clinicas_para_registro()` (0004) — SECURITY DEFINER para exponer una
-- selección de COLUMNAS, no solo de filas — con distinto filtro (activa +
-- módulo `catalogo` + al menos un producto disponible) y columnas más que sí
-- son seguras porque el portal ya las muestra hoy de su propia clínica
-- (logo, whatsapp, ciudad, tipo de negocio).
--
-- Grant SOLO a `authenticated`, a propósito (a diferencia de
-- `clinicas_para_registro`, que sí va a `anon` porque el registro es previo
-- a tener sesión). Si el día de mañana la Tienda es pública sin sesión,
-- sumar aquí `grant execute ... to anon` es el único cambio que hace falta
-- en esta función.
create or replace function clinicas_con_catalogo()
  returns table (
    id uuid,
    nombre text,
    logo_url text,
    ciudad text,
    tipo_negocio text,
    whatsapp text
  )
  language sql stable security definer
  set search_path = public, pg_temp
as $$
  select distinct c.id, c.nombre, c.logo_url, c.ciudad, c.tipo_negocio, c.whatsapp
    from clinicas c
    join planes p on p.id = c.plan_id
    join catalogo_productos cp on cp.clinica_id = c.id
   where c.estado <> 'suspendida'
     and 'catalogo' = any (p.modulos_habilitados)
     and cp.disponible = true
   order by c.nombre;
$$;

grant execute on function clinicas_con_catalogo() to authenticated;

-- =========================================================
-- 5. El bucket de fotos
-- =========================================================
-- PÚBLICO, a diferencia de `estudios` y `comprobantes` (0016, 0020): esto no
-- es un dato clínico ni financiero, es exactamente lo que se quiere mostrar
-- a cualquiera con el enlace, cacheable, sin firmar cada hora. Se sirve con
-- `getPublicUrl()`, no `createSignedUrl()`.
--
-- 5 MB, igual que `comprobantes`: el navegador ya redimensiona antes de
-- subir (lib/imagen.ts, a máx. 1600px/calidad 0.82), esto es la última
-- barrera contra una petición directa que se salte esa compresión.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('catalogo', 'catalogo', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Por RUTA y no por fila de metadatos, igual que `estudios`/`comprobantes`:
-- el archivo se sube ANTES de que exista la fila que lo referencia.
--
-- El bucket público sirve las imágenes por la ruta /object/public/... que NO
-- pasa por estas policies — por eso no hace falta (ni se agrega) una policy
-- de SELECT abierta a cualquiera. La de aquí abajo es solo para que el
-- propio admin pueda listar/gestionar sus archivos desde el panel, igual
-- que en los otros dos buckets.
drop policy if exists catalogo_objetos_select on storage.objects;
create policy catalogo_objetos_select on storage.objects for select
  using (
    bucket_id = 'catalogo'
    and (storage.foldername(name))[1] = (select auth_clinica_id())::text
    and (select auth_es_admin())
  );

drop policy if exists catalogo_objetos_insert on storage.objects;
create policy catalogo_objetos_insert on storage.objects for insert
  with check (
    bucket_id = 'catalogo'
    and (storage.foldername(name))[1] = (select auth_clinica_id())::text
    and (select auth_es_admin())
  );

drop policy if exists catalogo_objetos_delete on storage.objects;
create policy catalogo_objetos_delete on storage.objects for delete
  using (
    bucket_id = 'catalogo'
    and (storage.foldername(name))[1] = (select auth_clinica_id())::text
    and (select auth_es_admin())
  );

-- =========================================================
-- 6. El panel de salud también cuenta este bucket
-- =========================================================
-- Mismo motivo que 0021 cuando sumó `comprobantes`: el panel de plataforma
-- quedaría subestimando el espacio ocupado en Storage. Nombre de la función
-- SIN CAMBIOS a propósito — la llama `services/salud.ts` por RPC.
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
   where bucket_id in ('estudios', 'comprobantes', 'catalogo');

  return v_total;
end;
$$;

-- El `modulos_habilitados` de `planes` es `text[]` LIBRE (0024, sin CHECK):
-- 'catalogo' no necesita ninguna migración de esquema para poder guardarse
-- ahí, alcanza con que el frontend lo escriba/lea. El enum vive solo en
-- `ModuloVetora` (src/types/database.ts).
