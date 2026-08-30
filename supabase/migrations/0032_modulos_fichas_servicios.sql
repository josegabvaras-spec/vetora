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
