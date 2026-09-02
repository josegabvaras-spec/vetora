-- Corrige el 500 al borrar un cliente: la policy de 0036 se llamaba a si misma.
--
-- =========================================================================
-- QUE PASABA
-- =========================================================================
-- 0036 puso la condicion dentro de la propia policy:
--
--   create policy clientes_delete on clientes for delete
--     using (... and not exists (select 1 from pacientes p
--                                 where p.cliente_id = clientes.id));
--
-- y esa subconsulta cierra un CICLO, porque `pacientes` tambien tiene RLS:
--
--   clientes (delete)  ->  pacientes (select)  ->  clientes (select)
--                          `pacientes_portal` (0004) hace
--                          `exists (select 1 from clientes c where ...)`
--
-- PostgreSQL lo detecta y aborta con 42P17, «infinite recursion detected in
-- policy for relation "clientes"», que PostgREST devuelve como HTTP 500. O sea
-- que borrar un cliente fallaba SIEMPRE, tuviera mascotas o no.
--
-- Es exactamente la trampa que CLAUDE.md ya documenta para las cuatro
-- funciones de `auth_*`: «son SECURITY DEFINER porque leen `usuarios`, que a su
-- vez esta bajo RLS: sin eso la policy se llamaria a si misma».
--
-- =========================================================================
-- COMO SE ARREGLA
-- =========================================================================
-- La policy se queda con lo que puede comprobar sin salir de la tabla, y la
-- invariante --NINGUNA ficha con mascotas-- baja a un TRIGGER, que es como el
-- proyecto protege el resto de sus invariantes (`trg_historial_inmutable`,
-- `trg_internacion_inmutable`, `trg_aplicar_movimiento_inventario`).
--
-- Se gana ademas lo que una policy no puede dar: en vez de filtrar la fila en
-- silencio --que desde fuera es un «no se borro» sin motivo-- el trigger dice
-- CUANTAS mascotas hay y por que eso impide borrar.

-- ---------------------------------------------------------------------------
-- 1. La policy, sin la subconsulta que cerraba el ciclo
-- ---------------------------------------------------------------------------
drop policy if exists clientes_delete on clientes;

create policy clientes_delete on clientes for delete
  using (
    clinica_id = (select auth_clinica_id())
    and (select auth_es_personal())
  );

comment on policy clientes_delete on clientes is
  'Solo acota el inquilino y el rol. Que la ficha no tenga mascotas lo exige trg_cliente_sin_expediente: dentro de la policy cerraba un ciclo con pacientes_portal (ver 0037).';

-- ---------------------------------------------------------------------------
-- 2. La invariante, en un trigger
-- ---------------------------------------------------------------------------
-- `pacientes.cliente_id` es `on delete cascade`, y desde `pacientes` cascadean
-- DOCE tablas mas: historial_clinico, citas, vacunas_aplicadas,
-- desparasitaciones_aplicadas, internaciones, consentimientos_cirugia,
-- recetas, informes_firmados, estudios_imagen y las tres de peluqueria. Borrar
-- un dueño con mascotas destruiria el expediente medico completo de cada una.
--
-- `security definer` por dos motivos, y los dos importan:
--   - Rompe el ciclo: la consulta a `pacientes` ya no expande sus policies.
--   - Una barrera de seguridad tiene que ver TODO. Si la RLS del que llama le
--     ocultara una mascota, la comprobacion pasaria y la cascada se la
--     llevaria igual.
create or replace function cliente_sin_expediente()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_mascotas integer;
  v_ordenes integer;
begin
  -- ⚠️ LA CLINICA ENTERA. `eliminar-clinica` borra la fila de `clinicas`, que
  -- cascadea hasta aqui -- y una cascada SI dispara los triggers de la tabla
  -- hija. Sin esta salida, dar de baja a un cliente de la plataforma se volvia
  -- imposible en cuanto tuviera un solo paciente. Cuando llegamos por ese
  -- camino la fila de `clinicas` ya no existe, porque el padre se borra antes
  -- que los hijos.
  if not exists (select 1 from clinicas where id = old.clinica_id) then
    return old;
  end if;

  select count(*) into v_mascotas from pacientes where cliente_id = old.id;
  if v_mascotas > 0 then
    raise exception
      'Este cliente tiene % mascota(s): borrar la ficha se llevaria su historial, sus vacunas y sus recetas. Cambia primero las mascotas de dueño o dales de baja.',
      v_mascotas
      using errcode = 'P0001';
  end if;

  -- `peluqueria_ordenes.cliente_id` tambien cascadea. Sin mascotas no deberia
  -- haber ninguna --una orden exige `paciente_id`-- pero las dos columnas son
  -- independientes y nada obliga a que sean del mismo dueño.
  select count(*) into v_ordenes from peluqueria_ordenes where cliente_id = old.id;
  if v_ordenes > 0 then
    raise exception
      'Este cliente tiene % orden(es) de peluqueria y no se puede eliminar.',
      v_ordenes
      using errcode = 'P0001';
  end if;

  return old;
end;
$$;

drop trigger if exists trg_cliente_sin_expediente on clientes;
create trigger trg_cliente_sin_expediente
  before delete on clientes
  for each row
  execute function cliente_sin_expediente();

-- Los dos caminos que borran fichas VACIAS siendo recepcion siguen pasando, y
-- por eso ninguna de las dos barreras mira el rol:
--   - `vincular_cuenta_portal()` (0028), que ya comprueba `v_mascotas_portal`.
--   - El rollback de `registrarClienteYPaciente` cuando falla el paciente.
