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
