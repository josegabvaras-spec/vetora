-- Semilla del entorno LOCAL de pruebas: dos clínicas completas.
--
-- =========================================================
-- Para qué existe
-- =========================================================
-- El aislamiento entre clínicas es la garantía central de Vetora, y hasta ahora
-- **solo se podía leer, no ejecutar**: sin dos sesiones de clínicas distintas,
-- las policies se revisan a ojo. Eso dejó cuatro hallazgos del retest del
-- 2026-09-08 en NEEDS_REVIEW, y permitió que un cambio de RLS en producción
-- pasara horas revertido sin que nadie lo notara.
--
-- Esta semilla monta el escenario mínimo para probarlo de verdad:
--   · dos clínicas, cada una con su sucursal, su personal completo y su
--     expediente clínico;
--   · un superadmin sin clínica;
--   · un cliente de portal por clínica, vinculado a su ficha.
--
-- La usa `supabase db reset`, que aplica antes TODAS las migraciones sobre una
-- base virgen — cosa que tampoco se había probado nunca.
--
-- ⚠️ SOLO LOCAL. Las contraseñas y los uuid son fijos a propósito, para que las
-- pruebas puedan referirse a ellos. Nada de esto debe tocar producción; vive en
-- `supabase/seed.sql`, que solo lee la CLI al resetear la base local.
--
-- =========================================================
-- Los uuid, fijos para que las pruebas los nombren
-- =========================================================
--   Clínica A (Norte)  aaaaaaaa-...-a001      Clínica B (Sur)  bbbbbbbb-...-b001
--   admin A   ...-a010    admin B   ...-b010
--   vet A     ...-a011    vet B     ...-b011
--   recep A   ...-a012    recep B   ...-b012
--   pelu A    ...-a013    pelu B    ...-b013
--   cliente A ...-a014    cliente B ...-b014
--   superadmin  ffffffff-...-f001

begin;

-- ---------------------------------------------------------------------------
-- 1. Plan con TODOS los módulos: que ningún `ModuloRoute` estorbe una prueba
--    de RLS. Lo que se mide aquí es el aislamiento, no el gating comercial.
-- ---------------------------------------------------------------------------
insert into planes (id, nombre, precio_mensual_usd, whatsapp_limite,
                    max_sucursales, max_usuarios, modulos_habilitados,
                    ia_limite_redaccion, ia_limite_copiloto)
values (
  '11111111-1111-1111-1111-111111111111',
  'Pruebas — todo incluido', 0, 9999, 9, 99,
  array['agenda','caja','inventario','historial_clinico','internacion',
        'asistente_ia','portal_cliente','whatsapp','metricas','catalogo',
        'peluqueria','petshop','fichas','servicios'],
  1000, 1000
)
on conflict (nombre) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Las dos clínicas. Ambas ACTIVAS: la suspensión se prueba suspendiendo una
--    dentro de una transacción revertida, no dejándola suspendida de base.
-- ---------------------------------------------------------------------------
insert into clinicas (id, nombre, plan_id, responsable, whatsapp, ciudad, estado)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa001', 'Clínica Norte (A)',
   '11111111-1111-1111-1111-111111111111', 'Ana Norte', '70000001', 'Santa Cruz', 'activa'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb001', 'Clínica Sur (B)',
   '11111111-1111-1111-1111-111111111111', 'Beto Sur', '70000002', 'La Paz', 'activa')
on conflict (id) do nothing;

insert into sucursales (id, clinica_id, nombre, direccion)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa001', 'Norte Central', 'Av. Norte 1'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb002', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb001', 'Sur Central', 'Av. Sur 1')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Las cuentas de Auth.
--
--    Se insertan directamente en `auth.users` porque en local somos dueños de
--    la base y las pruebas de RLS no inician sesión: impersonan con
--    `request.jwt.claims`. La contraseña se deja utilizable igualmente
--    (`Prueba123!`) por si quieres entrar con la aplicación apuntando al
--    Supabase local.
-- ---------------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
)
select
  '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated',
  u.email, crypt('Prueba123!', gen_salt('bf')),
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb
from (values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa010'::uuid, 'admin.a@prueba.local'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa011'::uuid, 'vet.a@prueba.local'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa012'::uuid, 'recep.a@prueba.local'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa013'::uuid, 'pelu.a@prueba.local'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa014'::uuid, 'cliente.a@prueba.local'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb010'::uuid, 'admin.b@prueba.local'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb011'::uuid, 'vet.b@prueba.local'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb012'::uuid, 'recep.b@prueba.local'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb013'::uuid, 'pelu.b@prueba.local'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb014'::uuid, 'cliente.b@prueba.local'),
  ('ffffffff-ffff-ffff-ffff-fffffffff001'::uuid, 'superadmin@prueba.local')
) as u(id, email)
on conflict (id) do nothing;

-- Perfiles. El `superadmin` va sin clínica: lo exige
-- `usuarios_clinica_segun_rol`, y es justo la condición que hace que
-- `auth_clinica_id()` le devuelva null y las policies clínicas le den falso.
insert into usuarios (id, clinica_id, sucursal_id, nombre, email, whatsapp, rol, activo)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa010', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa002', 'Admin A',        'admin.a@prueba.local',    '70010001', 'admin',       true),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa011', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa002', 'Veterinario A',  'vet.a@prueba.local',      '70010002', 'veterinario', true),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa012', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa002', 'Recepcion A',    'recep.a@prueba.local',    '70010003', 'recepcion',   true),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa013', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa002', 'Peluquero A',    'pelu.a@prueba.local',     '70010004', 'peluquero',   true),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa014', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa001', null,                                   'Cliente A',      'cliente.a@prueba.local',  '70010005', 'cliente',     true),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb010', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb002', 'Admin B',        'admin.b@prueba.local',    '70020001', 'admin',       true),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb011', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb002', 'Veterinario B',  'vet.b@prueba.local',      '70020002', 'veterinario', true),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb012', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb002', 'Recepcion B',    'recep.b@prueba.local',    '70020003', 'recepcion',   true),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb013', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb002', 'Peluquero B',    'pelu.b@prueba.local',     '70020004', 'peluquero',   true),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb014', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb001', null,                                   'Cliente B',      'cliente.b@prueba.local',  '70020005', 'cliente',     true),
  ('ffffffff-ffff-ffff-ffff-fffffffff001', null,                                   null,                                   'Superadmin',     'superadmin@prueba.local', '70000000', 'superadmin',  true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 4. Expediente clínico en cada clínica: es lo que las pruebas intentarán
--    cruzar. La ficha del dueño lleva `usuario_id` para que el portal tenga
--    algo que leer y para poder comprobar que no ve la de la otra clínica.
-- ---------------------------------------------------------------------------
insert into clientes (id, clinica_id, nombre, whatsapp, ci, usuario_id)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa020', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa001', 'Dueño Norte', '70010005', '1000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa014'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb020', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb001', 'Dueño Sur',   '70020005', '2000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb014')
on conflict (id) do nothing;

insert into pacientes (id, clinica_id, cliente_id, nombre, especie)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa030', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa020', 'Firulais Norte', 'perro'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb030', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb020', 'Michi Sur',      'gato')
on conflict (id) do nothing;

commit;

-- =========================================================
-- Cómo impersonar a uno de estos usuarios en una consulta
-- =========================================================
-- Las pruebas NO inician sesión: fijan el claim que la RLS lee. Siempre dentro
-- de una transacción que se revierte, para no ensuciar la base:
--
--   begin;
--   select set_config('request.jwt.claims',
--     '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa010","role":"authenticated"}', true);
--   set local role authenticated;
--
--   select count(*) from pacientes;   -- ve solo los de su clínica
--
--   rollback;
--
-- Ver `supabase/verificacion/pruebas_rls.sql`, que lo hace con asertos.
