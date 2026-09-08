-- Pruebas de aislamiento y de las invariantes, EJECUTADAS de verdad.
--
-- =========================================================
-- Qué es esto y qué no
-- =========================================================
-- Hasta ahora el aislamiento entre clínicas de Vetora **se leía**: sin dos
-- sesiones de clínicas distintas, una policy solo se puede revisar a ojo. Eso
-- dejó cuatro hallazgos del retest del 2026-09-08 sin poder cerrarse, y no es
-- un tecnicismo: ese mismo día un cambio de RLS estuvo horas revertido en
-- producción sin que nada lo delatara.
--
-- Esto lo ejecuta. Impersona a cada usuario fijando `request.jwt.claims` —el
-- mismo claim que la RLS lee de un JWT real— y comprueba qué ve y qué no.
--
-- ⚠️ SOLO CONTRA LA BASE LOCAL (`supabase start`). Necesita la semilla de
-- `supabase/seed.sql`. **Nunca contra producción**: aunque casi todo va en
-- transacciones revertidas, algunas pruebas suspenden clínicas y desactivan
-- usuarios.
--
-- Uso:
--   npx supabase db reset          # migraciones + semilla, base limpia
--   psql "$(npx supabase status -o env | grep DB_URL | cut -d= -f2-)" \
--        -f supabase/verificacion/pruebas_rls.sql
--
-- O pegándolo en el Studio local (http://127.0.0.1:54323).
--
-- Devuelve una fila por aserto. Cualquier `FALLA` es un fallo real de la RLS.

\set ON_ERROR_STOP off

drop table if exists resultados_prueba;
create temp table resultados_prueba (
  n serial,
  area text,
  aserto text,
  esperado text,
  obtenido text,
  estado text
);

-- Fija quién es el usuario actual para la RLS. `true` = solo esta transacción.
create or replace function prueba_actuar_como(p_usuario uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_usuario, 'role', 'authenticated')::text, true);
end $$;

-- Igual, pero declarando el nivel de autenticación (para el MFA de 0072).
create or replace function prueba_actuar_como(p_usuario uuid, p_aal text) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_usuario, 'role', 'authenticated', 'aal', p_aal)::text, true);
end $$;

create or replace function anotar(p_area text, p_aserto text, p_esperado anyelement, p_obtenido anyelement)
returns void language plpgsql as $$
begin
  insert into resultados_prueba (area, aserto, esperado, obtenido, estado)
  values (p_area, p_aserto, p_esperado::text, p_obtenido::text,
          case when p_esperado::text is not distinct from p_obtenido::text then 'ok' else 'FALLA' end);
end $$;

-- ===========================================================================
-- 1. AISLAMIENTO ENTRE CLÍNICAS — la garantía central del producto
-- ===========================================================================
do $$
declare v int;
begin
  perform prueba_actuar_como('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa010'); -- admin A
  set local role authenticated;

  select count(*) into v from pacientes where clinica_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa001';
  perform anotar('aislamiento', 'admin A ve los pacientes de SU clínica', 1, v);

  select count(*) into v from pacientes where clinica_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb001';
  perform anotar('aislamiento', 'admin A NO ve pacientes de la clínica B', 0, v);

  select count(*) into v from clientes where clinica_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb001';
  perform anotar('aislamiento', 'admin A NO ve clientes de la clínica B', 0, v);

  select count(*) into v from usuarios where clinica_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb001';
  perform anotar('aislamiento', 'admin A NO ve el personal de la clínica B', 0, v);

  reset role;
end $$;

-- Escritura cruzada: lo que de verdad importa, porque un SELECT vacío puede
-- engañar pero un INSERT aceptado es una fuga consumada.
do $$
declare v int; ok boolean := false;
begin
  perform prueba_actuar_como('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa010');
  set local role authenticated;
  begin
    insert into clientes (clinica_id, nombre, whatsapp)
    values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb001', 'Intruso', '70099999');
    ok := true;   -- si llega aquí, la RLS lo permitió
  exception when others then
    ok := false;  -- rechazado, que es lo correcto
  end;
  perform anotar('aislamiento', 'admin A NO puede INSERTAR en la clínica B', false, ok);
  reset role;
end $$;

-- ===========================================================================
-- 2. EL SUPERADMIN NO VE DATOS CLÍNICOS  (+ MFA de 0072)
-- ===========================================================================
do $$
declare v int; b boolean;
begin
  -- Con aal2: es superadmin de pleno derecho.
  perform prueba_actuar_como('ffffffff-ffff-ffff-ffff-fffffffff001', 'aal2');
  set local role authenticated;

  select auth_es_plataforma() into b;
  perform anotar('plataforma', 'superadmin con aal2 ES plataforma', true, b);

  select count(*) into v from pacientes;
  perform anotar('plataforma', 'superadmin NO ve ningún paciente de ninguna clínica', 0, v);

  select count(*) into v from historial_clinico;
  perform anotar('plataforma', 'superadmin NO ve ningún historial clínico', 0, v);

  select count(*) into v from clinicas;
  perform anotar('plataforma', 'superadmin SÍ ve las clínicas (es su dominio)', 2, v);

  reset role;
end $$;

do $$
declare b boolean; v int;
begin
  -- Con aal1 y MFA configurado, 0072 le cierra la plataforma. Sin factor
  -- verificado en la semilla, `auth_mfa_suficiente()` devuelve true y sigue
  -- entrando: ese es el diseño (no se exige lo que aún no se puede dar).
  perform prueba_actuar_como('ffffffff-ffff-ffff-ffff-fffffffff001', 'aal1');
  set local role authenticated;
  select auth_es_plataforma() into b;
  perform anotar('mfa',
    'superadmin SIN factor verificado entra con aal1 (no hay ventana de bloqueo)', true, b);
  reset role;
end $$;

-- Ahora con un factor TOTP verificado: aal1 deja de bastar. Transacción
-- revertida, así que el factor simulado no sobrevive.
begin;
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
values (gen_random_uuid(), 'ffffffff-ffff-ffff-ffff-fffffffff001', 'prueba', 'totp', 'verified', now(), now());

do $$
declare b boolean; v int;
begin
  perform prueba_actuar_como('ffffffff-ffff-ffff-ffff-fffffffff001', 'aal1');
  set local role authenticated;

  select auth_es_plataforma() into b;
  perform anotar('mfa', 'CON factor verificado y aal1, auth_es_plataforma es FALSE', false, b);

  select count(*) into v from clinicas;
  perform anotar('mfa', 'CON factor verificado y aal1, no lee clinicas', 0, v);

  select count(*) into v from usuarios where id = 'ffffffff-ffff-ffff-ffff-fffffffff001';
  perform anotar('mfa', 'PERO sigue leyendo su propia fila (si no, no llega al MFA)', 1, v);

  reset role;
end $$;

do $$
declare b boolean;
begin
  perform prueba_actuar_como('ffffffff-ffff-ffff-ffff-fffffffff001', 'aal2');
  set local role authenticated;
  select auth_es_plataforma() into b;
  perform anotar('mfa', 'CON factor verificado y aal2, todo vuelve', true, b);
  reset role;
end $$;
rollback;

-- ===========================================================================
-- 3. EL PELUQUERO NO ENTRA AL EXPEDIENTE  (H-18 / 0053)
-- ===========================================================================
do $$
declare v int; b boolean;
begin
  perform prueba_actuar_como('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa013'); -- peluquero A
  set local role authenticated;

  select auth_es_personal() into b;
  perform anotar('peluquero', 'el peluquero ES personal (da de alta mascotas)', true, b);

  select auth_ve_expediente() into b;
  perform anotar('peluquero', 'el peluquero NO ve el expediente', false, b);

  select count(*) into v from pacientes;
  perform anotar('peluquero', 'SÍ ve los pacientes de su clínica', 1, v);

  select count(*) into v from historial_clinico;
  perform anotar('peluquero', 'NO ve ningún historial clínico', 0, v);

  select count(*) into v from recetas;
  perform anotar('peluquero', 'NO ve ninguna receta', 0, v);

  reset role;
end $$;

-- ===========================================================================
-- 4. EL CLIENTE DEL PORTAL  (rol `cliente`)
-- ===========================================================================
do $$
declare v int; b boolean;
begin
  perform prueba_actuar_como('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa014'); -- cliente A
  set local role authenticated;

  select auth_es_personal() into b;
  perform anotar('portal', 'un cliente NO es personal', false, b);

  select count(*) into v from clientes;
  perform anotar('portal', 've exactamente su propia ficha, y solo esa', 1, v);

  select count(*) into v from pacientes;
  perform anotar('portal', 've su mascota', 1, v);

  select count(*) into v from usuarios where rol <> 'cliente';
  perform anotar('portal', 'NO ve el directorio del personal (VUL-03)', 0, v);

  -- 0045: las 7 tablas de 0030 no son suyas.
  select count(*) into v from producto_lotes;
  perform anotar('portal', 'NO lee producto_lotes (margen de compra) — 0045', 0, v);
  select count(*) into v from petshop_promociones;
  perform anotar('portal', 'NO lee petshop_promociones (cupones) — 0045', 0, v);

  reset role;
end $$;

-- Escritura: crear un cupón de descuento a su gusto era lo que 0045 cerró.
do $$
declare ok boolean := false;
begin
  perform prueba_actuar_como('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa014');
  set local role authenticated;
  begin
    insert into petshop_promociones (clinica_id, nombre, tipo_descuento, valor_descuento, activa)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa001', 'Cupon del intruso', 'porcentaje', 99, true);
    ok := true;
  exception when others then ok := false;
  end;
  perform anotar('portal', 'un cliente NO puede crear promociones — 0045', false, ok);
  reset role;
end $$;

-- ===========================================================================
-- 5. USUARIO DESACTIVADO  (0050)
-- ===========================================================================
begin;
update usuarios set activo = false where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa010';
do $$
declare v int; b boolean;
begin
  perform prueba_actuar_como('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa010');
  set local role authenticated;
  select auth_es_personal() into b;
  perform anotar('activo', 'un usuario con activo=false NO es personal', false, b);
  select count(*) into v from pacientes;
  perform anotar('activo', 'y no lee ningún paciente por PostgREST', 0, v);
  reset role;
end $$;
rollback;

-- ===========================================================================
-- 6. CLÍNICA SUSPENDIDA  (0067) — el control que sostiene el cobro
-- ===========================================================================
begin;
update clinicas set estado = 'suspendida' where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa001';
do $$
declare v int; b boolean; c uuid;
begin
  perform prueba_actuar_como('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa010');
  set local role authenticated;

  select auth_es_personal() into b;
  perform anotar('suspension', 'clínica suspendida: su admin NO es personal', false, b);

  select count(*) into v from pacientes;
  perform anotar('suspension', 'y no lee pacientes por PostgREST', 0, v);

  -- ⚠️ Pero auth_clinica_id() SIGUE resolviendo: es lo que necesita el login
  -- para decir «suspendida» en vez de «esta clínica ya no existe» (regresión H-15).
  select auth_clinica_id() into c;
  perform anotar('suspension', 'PERO auth_clinica_id sigue devolviendo su clínica (H-15)',
                 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa001'::uuid, c);

  reset role;
end $$;
rollback;

-- ===========================================================================
-- 7. ESCALADA DE PRIVILEGIOS
-- ===========================================================================
do $$
declare ok boolean := false; r text;
begin
  perform prueba_actuar_como('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa012'); -- recepción A
  set local role authenticated;
  begin
    update usuarios set rol = 'superadmin', clinica_id = null
     where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa012';
    ok := found;
  exception when others then ok := false;
  end;
  perform anotar('escalada', 'nadie puede cambiarse su propio rol a superadmin', false, ok);
  reset role;
end $$;

-- ===========================================================================
-- 8. INVARIANTES CON BARRERA SQL  (H-19 a H-25)
-- ===========================================================================
-- Historial cerrado inmutable.
do $$
declare ok boolean := false; h uuid;
begin
  set local role postgres;
  insert into historial_clinico (clinica_id, paciente_id, veterinario_id, motivo, editable)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa030',
          'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa011','Prueba cerrada', false)
  returning id into h;

  perform prueba_actuar_como('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa011'); -- veterinario A
  set local role authenticated;
  begin
    update historial_clinico set motivo = 'modificado' where id = h;
    ok := found;
  exception when others then ok := false;
  end;
  perform anotar('invariantes', 'un historial CERRADO no se puede modificar', false, ok);
  reset role;
end $$;

-- Stock nunca negativo.
do $$
declare ok boolean := false; p uuid;
begin
  set local role postgres;
  insert into productos (clinica_id, sucursal_id, nombre, sku, precio_venta_bs, stock_actual, stock_minimo)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa002',
          'Producto prueba','SKU-PRUEBA-1', 10, 5, 1)
  returning id into p;
  begin
    update productos set stock_actual = -1 where id = p;
    ok := found;
  exception when others then ok := false;
  end;
  perform anotar('invariantes', 'el stock no puede quedar negativo', false, ok);
  reset role;
end $$;

-- ===========================================================================
-- RESULTADO
-- ===========================================================================
select area, aserto, esperado, obtenido, estado
from resultados_prueba
order by (estado = 'ok'), n;

select count(*) filter (where estado = 'FALLA') as fallas,
       count(*) filter (where estado = 'ok')    as correctos,
       count(*)                                  as total
from resultados_prueba;
