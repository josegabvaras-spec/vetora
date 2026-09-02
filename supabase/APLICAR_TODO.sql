-- ===========================================================================
-- APLICAR TODO: las seis migraciones pendientes, en orden y de una sola vez.
-- ===========================================================================
--
-- Pegalo ENTERO en el editor SQL de Supabase y ejecutalo. Es el atajo para no
-- ir fichero por fichero.
--
-- SE PUEDE EJECUTAR LAS VECES QUE HAGA FALTA. Todo va con `if not exists`,
-- `create or replace` o un `drop` previo, y los `update planes` solo tocan
-- las filas a las que les falta el modulo. Si ya aplicaste alguna, esas partes
-- no cambian nada; si aplicaste media, esto termina el trabajo.
--
-- ⚠️ EL ORDEN IMPORTA EN UN SITIO: 0036 crea una policy de DELETE sobre
-- `clientes` que se llamaba a si misma (500 al borrar), y 0037 la sustituye.
-- Ejecutandolo entero quedas con la buena.
--
-- ⚠️ Y ESTO NO CUBRE LAS EDGE FUNCTIONS. Corren en Deno, fuera del build, y un
-- `git push` no las actualiza. Hace falta, aparte:
--     supabase functions deploy registro-portal
--
-- Generado desde supabase/migrations/ -- si tocas una migracion, vuelve a
-- generar este fichero.


-- ###########################################################################
-- 0032_modulos_fichas_servicios
-- ###########################################################################

-- Modulos `fichas` y `servicios`, y el petshop deja de traer `inventario`.
--
-- Un admin con el plan «PetShop» veia un menu lateral de clinica: Agenda,
-- Pacientes, Clientes, Inventario y Servicios, cuatro de ellas DUPLICADAS
-- dentro de su propio panel -- el POS ya enseña stock, `/petshop/inventario`
-- lleva lotes y vencimientos, y `/petshop/clientes` existe. Y `servicios` es un
-- catalogo de categorias clinicas (consulta, cirugia, internacion...), mientras
-- los precios de un petshop viven en `productos`.
--
-- Agenda no hace falta tocarla aqui: `agenda` YA es un modulo y el plan PetShop
-- nunca lo trajo (0026 le dio un array explicito sin el). Solo faltaba gatear su
-- entrada del menu, que es cambio de frontend.
--
-- Pacientes, Clientes y Servicios si necesitan modulo nuevo: no tenian ninguno,
-- asi que se veian con cualquier plan.
--
--   fichas    -> `/pacientes` y `/clientes`. Van juntos: son el mismo fichero
--                visto por los dos lados (la mascota y su dueño). Una
--                PELUQUERIA SI LO NECESITA -- da de alta mascotas para poder
--                agendarles, ver `puedeVerHistorialClinico` en lib/personal.
--   servicios -> `/servicios`, el catalogo de tarifas.
--
-- ⚠️ ORDEN AL APLICAR: esta migracion va ANTES de que el codigo llegue a
-- produccion. El frontend empieza a exigir estos modulos en cuanto Vercel
-- despliega; si los planes no los tienen todavia, las veterinarias se quedan sin
-- Pacientes hasta que se aplique.

-- ---------------------------------------------------------------------------
-- 1. Los modulos nuevos, a todos los planes MENOS al de petshop.
-- ---------------------------------------------------------------------------
-- Se identifica el petshop por traer el modulo `petshop`, no por el nombre: un
-- plan que el superadmin haya creado a mano puede llamarse de cualquier forma.
-- Idempotente por el `not ... = any(...)`.

update planes
   set modulos_habilitados = modulos_habilitados || array['fichas']
 where not ('fichas' = any (modulos_habilitados))
   and not ('petshop' = any (modulos_habilitados));

update planes
   set modulos_habilitados = modulos_habilitados || array['servicios']
 where not ('servicios' = any (modulos_habilitados))
   and not ('petshop' = any (modulos_habilitados));

-- ---------------------------------------------------------------------------
-- 2. El petshop deja de traer `inventario`.
-- ---------------------------------------------------------------------------
-- Comprobado que nada del modulo petshop depende de `tieneModulo('inventario')`
-- --sus pantallas van bajo el modulo `petshop`-- y que `/movimientos` esta
-- gateado por `caja`, no por este, asi que no se cae con el.

update planes
   set modulos_habilitados = array_remove(modulos_habilitados, 'inventario')
 where 'petshop' = any (modulos_habilitados)
   and 'inventario' = any (modulos_habilitados);

-- ---------------------------------------------------------------------------
-- 3. El default de la columna, para los planes que se creen sin tocar modulos.
-- ---------------------------------------------------------------------------
-- 0024 lo dejo en cinco. Se le suman los dos nuevos para que un plan creado sin
-- pasar por el editor no nazca sin fichero de clientes ni tarifas.

alter table planes
  alter column modulos_habilitados
  set default array['agenda', 'caja', 'inventario', 'portal_cliente', 'whatsapp', 'fichas', 'servicios'];


-- ###########################################################################
-- 0033_catalogo_en_planes
-- ###########################################################################

-- El modulo `catalogo` a los planes, y el vinculo entre el producto del POS y
-- su ficha de vitrina.
--
-- =========================================================================
-- POR QUE: la Tienda del portal lleva vacia desde que se creo (0027)
-- =========================================================================
-- El dueño de mascota tiene en su portal una tarjeta «Tiendas de Mascotas»
-- que lleva a `/portal-cliente/tienda`. La pantalla esta entera desde 0027,
-- pero enseña «Todavia ninguna clinica tiene tienda activa» a todo el mundo.
--
-- Es la MISMA trampa de los tres eslabones que CLAUDE.md documenta, por
-- tercera vez (paso con `catalogo`, con `peluqueria` y con `petshop`), y esta
-- vez el eslabon que faltaba es el primero:
--
--   1. Que algun plan lo traiga          <- ESTE. No hay un solo `update
--                                           planes` con 'catalogo' en las 32
--                                           migraciones, y 0026 creo los
--                                           planes «Peluqueria» y «PetShop»
--                                           con un array explicito sin el.
--   2. Que el editor de planes lo ofrezca   ya estaba (PlataformaPlanesPage).
--   3. La ruta con su ModuloRoute + menu    ya estaba (enlacesClinicos).
--
-- Las DOS puertas de la Tienda miran `modulos_habilitados`: la policy
-- `catalogo_productos_portal` y la funcion `clinicas_con_catalogo()`. Con el
-- modulo en ningun plan, la primera no deja leer un solo producto y la
-- segunda devuelve cero filas. Y por el otro lado `/catalogo` rebotaba, asi
-- que ningun admin habia podido publicar nunca nada.
--
-- ⚠️ Esta migracion solo AÑADE. A diferencia de 0032, aplicarla tarde no le
-- quita ninguna pantalla a nadie: la Tienda sigue vacia hasta que se aplique,
-- que es exactamente lo que pasa hoy.

-- =========================================================================
-- 1. El modulo, a todos los planes
-- =========================================================================
-- A TODOS, no solo a los de retail: la Tienda es un escaparate comun donde el
-- dueño «elige la tienda que desee», y con una sola clinica publicando no hay
-- entre que elegir. Una veterinaria tambien vende alimento y antiparasitarios.
--
-- El superadmin puede quitarselo a un plan cuando quiera desde Plataforma ->
-- Planes; esto es el punto de partida, no una regla.
--
-- Idempotente por el `not ... = any(...)`, igual que 0031 y 0032.

update planes
   set modulos_habilitados = modulos_habilitados || array['catalogo']
 where not ('catalogo' = any (modulos_habilitados));

-- =========================================================================
-- 2. El default de la columna
-- =========================================================================
-- Para que un plan creado sin pasar por el editor nazca con vitrina. 0032 lo
-- dejo en siete.

alter table planes
  alter column modulos_habilitados
  set default array['agenda', 'caja', 'inventario', 'portal_cliente', 'whatsapp', 'fichas', 'servicios', 'catalogo'];

-- =========================================================================
-- 3. De que producto del POS salio esta ficha de vitrina
-- =========================================================================
-- `catalogo_productos` (vitrina por CLINICA: foto, descripcion, precio
-- publico) y `productos` (kardex por SUCURSAL: sku, costo, stock, lotes) son
-- dos tablas distintas a proposito -- 0027 lo argumenta largo y no se
-- fusionan. Pero un petshop con 200 SKUs no va a teclearlos dos veces, asi
-- que la pantalla de Productos gana un boton «Publicar en la Tienda» que
-- copia nombre, categoria y precio de venta.
--
-- Sin esta columna la pantalla no puede decir «ya publicado» ni evitar que el
-- mismo producto se publique dos veces.
--
-- `on delete set null`, NO `cascade`: si el admin borra el producto del
-- kardex, la ficha de vitrina sobrevive como producto suelto en vez de
-- desaparecer de la Tienda sin que nadie se entere. Es la misma tabla que ya
-- admite fichas escritas a mano.

alter table catalogo_productos
  add column if not exists producto_id uuid references productos (id) on delete set null;

-- Indice PARCIAL. Un unique normal se comportaria igual --en Postgres los
-- nulls no chocan entre si, asi que las fichas creadas a mano convivirian de
-- todos modos-- pero indexaria filas que nunca se consultan por esta columna.
-- El `where` deja escrito para que se lee: «un producto del kardex se publica
-- una sola vez».
create unique index if not exists catalogo_productos_producto_unico
  on catalogo_productos (producto_id) where producto_id is not null;

comment on column catalogo_productos.producto_id is
  'Producto del kardex del que se publico esta ficha, si salio de ahi. Null en las creadas a mano desde /catalogo. Nunca se copia el costo: solo nombre, categoria y precio de venta.';

-- =========================================================================
-- 4. El precio publicado no se queda viejo
-- =========================================================================
-- Un precio publico desfasado es peor que no publicar: el comprador escribe
-- por WhatsApp con una cifra que la tienda no le va a respetar.
--
-- ⚠️ POR QUE UN TRIGGER Y NO EL SERVICIO. Se intento primero desde
-- `actualizarProductoPetshop`, y no cubre el caso: `catalogo_productos_admin`
-- exige `auth_es_admin()`, asi que un `update` lanzado por un usuario
-- `recepcion` --que SI puede editar productos, la pantalla lo admite-- no
-- afecta ninguna fila y no da error. El precio de la Tienda se quedaba viejo
-- en silencio. Y `/inventario`, en el area clinica, edita la misma tabla por
-- otro camino.
--
-- `security definer` por lo mismo, y acotado a lo minimo: una sola columna de
-- una sola fila, la que ya esta vinculada por `producto_id`. No lee ni
-- escribe nada mas, y no acepta parametros -- mismo criterio que
-- `trg_aplicar_movimiento_inventario` (0002).
--
-- Solo el PRECIO, a proposito. El nombre y la descripcion de la vitrina son
-- del escaparate: el admin los reescribe en /catalogo para que vendan, y
-- pisarlos cada vez que alguien corrige una falta en el kardex seria borrarle
-- el trabajo.
create or replace function sincronizar_precio_catalogo()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
begin
  if new.precio_bs is distinct from old.precio_bs then
    update catalogo_productos
       set precio_bs = new.precio_bs
     where producto_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sincronizar_precio_catalogo on productos;
create trigger trg_sincronizar_precio_catalogo
  after update of precio_bs on productos
  for each row
  execute function sincronizar_precio_catalogo();


-- ###########################################################################
-- 0034_asistente_petshop
-- ###########################################################################

-- El modulo `asistente_ia` al plan PetShop.
--
-- =========================================================================
-- POR QUE
-- =========================================================================
-- El menu de una peluqueria y de un petshop pasa a ser el de su propio panel
-- (`menuDelNegocio`), y de lo clinico solo sobreviven cuatro entradas: Caja
-- General, Asistente, Respaldo y Catalogo.
--
-- La peluqueria ya tenia `asistente_ia` desde 0026. El plan PetShop nunca lo
-- tuvo, asi que su admin no veria la entrada, y `/asistente` le rebotaria: su
-- ruta va detras de `ModuloRoute modulo="asistente_ia"`.
--
-- El asistente de un petshop no es el de una clinica --no tiene pacientes ni
-- citas, asi que todos sus avisos y todas sus cifras serian cero-- sino la
-- pantalla propia `AsistentePetshopPage`: que hay que reponer, con que
-- proveedor, y que lotes estan por vencer. `AsistenteSegunRol` reparte por rol
-- y ahora tambien por negocio.
--
-- ⚠️ Ojo con el nombre del modulo: es `asistente_ia`, pero la pantalla del
-- petshop NO llama a la IA ni gasta cuota de WhatsApp. El boton de pedido al
-- proveedor es `enlaceWhatsapp()` --un `wa.me` puro, compuesto en el cliente--
-- por el mismo criterio que el boton del catalogo: la cuota mensual del plan
-- esta pensada para AVISOS A CLIENTES, y una orden de compra a un proveedor es
-- logistica interna. Gastar ahi los mensajes con los que se avisa a los
-- clientes seria quemar la palanca comercial por el lado equivocado.
--
-- Solo AÑADE. Aplicarla tarde no le quita nada a nadie: el petshop sigue sin
-- ver el Asistente hasta que se aplique, que es lo que pasa hoy.

-- Idempotente por el `not ... = any(...)`, igual que 0031, 0032 y 0033.
-- Se acota por el modulo `petshop` y no por el nombre del plan: un plan que el
-- superadmin haya creado a mano puede llamarse de cualquier forma.
update planes
   set modulos_habilitados = modulos_habilitados || array['asistente_ia']
 where 'petshop' = any (modulos_habilitados)
   and not ('asistente_ia' = any (modulos_habilitados));


-- ###########################################################################
-- 0035_peluqueria_portal
-- ###########################################################################

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


-- ###########################################################################
-- 0036_borrar_cliente
-- ###########################################################################

-- Borrar una ficha de dueño, sin poder llevarse un expediente por delante.
--
-- =========================================================================
-- POR QUE ESTO NO ES UN `DELETE` A SECAS
-- =========================================================================
-- `pacientes.cliente_id` es `on delete cascade` (0001), y desde `pacientes`
-- cascadean DOCE tablas mas: historial_clinico, citas, vacunas_aplicadas,
-- desparasitaciones_aplicadas, internaciones, consentimientos_cirugia,
-- recetas, informes_firmados, estudios_imagen y las tres de peluqueria.
--
-- O sea que borrar un dueño con mascotas DESTRUYE EL EXPEDIENTE MEDICO
-- COMPLETO de cada una, sin vuelta atras y sin que nada lo avise -- lo
-- contrario de lo que protegen `trg_historial_inmutable` y las policies
-- INSERT-only de cobros, consentimientos e informes.
--
-- Hasta hoy eso no habia pasado solo porque ninguna pantalla ofrecia borrar.
-- Pero `clientes_personal` (0004) es un `for all`, asi que EL DELETE YA ESTABA
-- PERMITIDO en la base para recepcion, veterinario y peluquero: bastaba un
-- `fetch` a PostgREST. Añadir el boton sin tocar esto dejaria la unica
-- proteccion en el frontend, que no es una proteccion.
--
-- Se parte la policy y el DELETE pasa a llevar la condicion que importa.

-- Los `drop if exists` de las cuatro no son decorativos: sin ellos, volver a
-- ejecutar este fichero reventaba a mitad con «policy already exists», y quien
-- lo aplica a mano se quedaba sin saber qué había entrado y qué no.
drop policy if exists clientes_personal on clientes;
drop policy if exists clientes_personal_select on clientes;
drop policy if exists clientes_personal_insert on clientes;
drop policy if exists clientes_personal_update on clientes;
drop policy if exists clientes_delete on clientes;

create policy clientes_personal_select on clientes for select
  using (clinica_id = (select auth_clinica_id()) and (select auth_es_personal()));

create policy clientes_personal_insert on clientes for insert
  with check (clinica_id = (select auth_clinica_id()) and (select auth_es_personal()));

create policy clientes_personal_update on clientes for update
  using (clinica_id = (select auth_clinica_id()) and (select auth_es_personal()))
  with check (clinica_id = (select auth_clinica_id()) and (select auth_es_personal()));

-- =========================================================================
-- La barrera: una ficha con mascotas NO se borra por ningun camino
-- =========================================================================
-- Ni la pantalla, ni un `fetch` a PostgREST, ni un script. La garantia deja de
-- depender de que el servicio se acuerde de comprobarlo.
--
-- ⚠️ NO exige `auth_es_admin()` aunque el boton sea solo del administrador, y
-- no es un olvido: hay DOS caminos legitimos que borran fichas VACIAS siendo
-- recepcion, y los dos se romperian.
--
--   1. `vincular_cuenta_portal()` (0028) hace `delete from clientes` para
--      soltar la ficha del portal antes de mover la cuenta, y NO es
--      `security definer` a proposito -- corre con los privilegios de quien
--      llama. Con la policy acotada a admin, una recepcionista resolviendo una
--      sugerencia se topaba con el `raise` que esa funcion ya tiene previsto
--      para este caso: «No tienes permiso para soltar la ficha del portal».
--   2. El rollback de `registrarClienteYPaciente`: si el insert del paciente
--      falla, borra el cliente recien creado. Sin eso, cada reintento deja
--      otra ficha duplicada.
--
-- Los dos borran fichas SIN MASCOTAS, que es justo lo que esto sigue
-- permitiendo. El «solo el administrador» es una convencion de pantalla --como
-- `veterinarioAcotado`--, y la barrera dura es la que no se puede saltar: no
-- se borra nada que tenga un expediente detras.
create policy clientes_delete on clientes for delete
  using (
    clinica_id = (select auth_clinica_id())
    and (select auth_es_personal())
    and not exists (select 1 from pacientes p where p.cliente_id = clientes.id)
  );

comment on policy clientes_delete on clientes is
  'Solo fichas sin mascotas: `pacientes.cliente_id` cascadea a doce tablas y se llevaria el expediente medico entero. No mira el rol a proposito -- ver 0036.';


-- ###########################################################################
-- 0037_borrar_cliente_sin_recursion
-- ###########################################################################

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
