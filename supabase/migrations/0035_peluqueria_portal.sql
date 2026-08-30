-- Los servicios de peluqueria, visibles desde el portal del dueño de mascota.
--
-- =========================================================================
-- POR QUE HACEN FALTA DOS FUNCIONES Y NO DOS POLICIES
-- =========================================================================
-- La tarjeta «Agendar Peluqueria» del portal apuntaba a `/portal-cliente/
-- tienda` --copiada de la de al lado-- asi que su boton «Programar Cita»
-- abria la Tienda de productos. No habia ninguna pantalla que enseñara
-- servicios de peluqueria, y NO PODIA HABERLA tal cual:
--
--   `servicios_select` (reescrita en 0004) es
--     clinica_id = auth_clinica_id() and auth_es_personal()
--
-- o sea que una cuenta `cliente` no puede leer `servicios` NI DE SU PROPIA
-- CLINICA, y aqui ademas se quieren ver los de otras.
--
-- Es el mismo problema que resolvio `clinicas_con_catalogo()` en 0027 y antes
-- `clinicas_para_registro()` en 0004, y se resuelve igual: `security definer`
-- para exponer una seleccion de COLUMNAS, no solo de filas. Una policy de fila
-- no serviria, porque lo que hay que ocultar son columnas --la comision del
-- peluquero, las reglas de precio-- dentro de filas que si se pueden ver.
--
-- ⚠️ Estas funciones NO agendan nada. El PRD §2 deja el agendamiento
-- automatico fuera del MVP: la pantalla enseña los servicios y el dueño
-- SOLICITA por WhatsApp con `enlaceWhatsapp()` --un `wa.me` puro, sin cuota--,
-- y quien agenda sigue siendo una persona de la peluqueria. Dejar que una
-- cuenta `cliente` escriba en `citas` es una superficie que esto no abre.

-- =========================================================================
-- 1. Que peluquerias hay
-- =========================================================================
-- Mismas columnas seguras que `clinicas_con_catalogo()`, y por el mismo
-- motivo: `clinicas_select` (0001) es `id = auth_clinica_id() or
-- auth_es_plataforma()`, asi que un cliente no puede leer la fila de otra
-- clinica ni incrustada en un `select('*, clinicas(...)')` -- el embedding de
-- PostgREST respeta la RLS de la tabla incrustada.
--
-- Nunca salen `responsable`, `plan_id`, `whatsapp_enviados`, `estado_pago` ni
-- `precio_acordado_usd`: eso es la relacion de la clinica con la plataforma,
-- no con un comprador.
--
-- El `join` con `servicios` deja fuera a la peluqueria que todavia no cargo
-- ninguno: una ficha vacia no es una tienda. `distinct` porque ese join
-- multiplica la fila por servicio.
create or replace function clinicas_con_peluqueria()
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
    join servicios s on s.clinica_id = c.id
   where c.estado <> 'suspendida'
     and 'peluqueria' = any (p.modulos_habilitados)
     and s.categoria = 'peluqueria'
     and s.activo = true
   order by c.nombre;
$$;

-- =========================================================================
-- 2. Que servicios ofrece cada una
-- =========================================================================
-- `left join` con la configuracion: `peluqueria_servicios_config` es opcional
-- --el servicio existe en `servicios` aunque nadie le haya puesto duracion ni
-- restricciones-- y con un `join` normal esos servicios desaparecerian del
-- escaparate sin que nadie entienda por que.
--
-- ⚠️ LO QUE NO SALE, y es el motivo de que esto sea una funcion:
-- `comision_tipo`, `comision_valor`, `reglas_precio` y los insumos de
-- `peluqueria_servicio_insumos`. Son el margen del negocio y la receta de
-- consumo: quien compra ve el precio, no cuanto se lleva el peluquero ni que
-- shampoo se le pone al perro.
create or replace function servicios_peluqueria_de(p_clinica_id uuid)
  returns table (
    id uuid,
    nombre text,
    precio_bs numeric,
    duracion_minutos integer,
    categoria_grooming text,
    especie_permitida text,
    tamano_permitido text
  )
  language sql stable security definer
  set search_path = public, pg_temp
as $$
  select s.id,
         s.nombre,
         s.precio_bs,
         coalesce(cfg.duracion_minutos, 45),
         coalesce(cfg.categoria_grooming, 'bano'),
         coalesce(cfg.especie_permitida, 'todos'),
         coalesce(cfg.tamano_permitido, 'todos')
    from servicios s
    join clinicas c on c.id = s.clinica_id
    join planes p on p.id = c.plan_id
    left join peluqueria_servicios_config cfg
           on cfg.servicio_id = s.id and cfg.clinica_id = s.clinica_id
   where s.clinica_id = p_clinica_id
     and s.categoria = 'peluqueria'
     and s.activo = true
     -- Las mismas dos condiciones que la funcion de arriba: si la clinica se
     -- suspende o su plan pierde el modulo, sus servicios desaparecen del
     -- portal sin que nadie los borre. Comprobarlo aqui tambien evita que un
     -- id de clinica escrito a mano en la URL se salte el filtro.
     and c.estado <> 'suspendida'
     and 'peluqueria' = any (p.modulos_habilitados)
   order by s.nombre;
$$;

-- Solo con sesion iniciada, igual que la Tienda: a `authenticated`, no a
-- `anon` (a diferencia de `clinicas_para_registro`, que es previa a tener
-- sesion). Si algun dia esto se abre a internet sin cuenta, sumar aqui el
-- grant a `anon` es el unico cambio que hace falta en la base.
grant execute on function clinicas_con_peluqueria() to authenticated;
grant execute on function servicios_peluqueria_de(uuid) to authenticated;
