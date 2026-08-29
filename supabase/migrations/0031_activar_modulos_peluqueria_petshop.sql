-- Dar a cada plan el modulo que le da nombre.
--
-- Las 26 pantallas de peluqueria y petshop existen (0029, 0030), sus rutas
-- existen y su menu existe. Lo que no existia era NINGUNA forma de activar los
-- modulos, asi que `tieneModulo('peluqueria')` era siempre falso, `ModuloRoute`
-- rebotaba a /agenda y todo negocio veia la interfaz de veterinaria.
--
-- Tres eslabones rotos, en cadena:
--
--   1. 0026 creo los planes 'Peluqueria' y 'PetShop', pero sus
--      `modulos_habilitados` NO incluyen 'peluqueria' ni 'petshop'. No fue un
--      descuido: 0026 es ANTERIOR a 0029/0030, que son las que crean esos
--      modulos. Cuando se escribio, el valor no existia todavia.
--   2. 0029 y 0030 crean las tablas y no tocan `planes`: cero menciones a
--      `modulos_habilitados`.
--   3. `PlataformaPlanesPage` omitia las dos casillas, asi que tampoco se
--      podian marcar a mano. (Se arregla en el frontend, no aqui.)
--
-- Es la MISMA trampa que CLAUDE.md ya documento para `catalogo`: añadir un
-- valor al tipo `ModuloVetora` no lo hace alcanzable. Hacen falta las dos
-- cosas -- que algun plan lo traiga, y que el editor de planes lo ofrezca.
--
-- Idempotente por el `not ... = any(...)`: aplicarla dos veces no duplica el
-- valor en el array. Se acota por `nombre`, que es la clave que uso 0026 en su
-- `on conflict`.

update planes
   set modulos_habilitados = modulos_habilitados || array['peluqueria']
 where nombre = 'Peluquería'
   and not ('peluqueria' = any (modulos_habilitados));

update planes
   set modulos_habilitados = modulos_habilitados || array['petshop']
 where nombre = 'PetShop'
   and not ('petshop' = any (modulos_habilitados));

-- Los planes que el superadmin haya creado a mano NO se tocan aqui: no hay
-- forma de adivinar cual es de peluqueria y cual de petshop. Esos se arreglan
-- desde el editor de planes, que a partir de ahora si ofrece las casillas.

-- ---------------------------------------------------------------------------
-- Y corregir el COMMENT de `tipo_negocio`, que afirma algo falso.
-- ---------------------------------------------------------------------------
-- 0023 dejo escrito que la columna «Determina que modulos se muestran y que
-- flujo es el principal». No determina nada: se verifico que `tipo_negocio`
-- tiene 18 apariciones en el frontend y CERO cambios de comportamiento --
-- `AuthContext` lo carga y lo expone, y ningun componente lo consume. Su unico
-- efecto visible es una etiqueta en la Tienda del portal.
--
-- Quien decide que se ve es el par rol + `planes.modulos_habilitados` (0024).
-- Ese COMMENT es parte de por que se esperaba que crear un plan de peluqueria
-- cambiara la interfaz.
--
-- Se corrige aqui y no editando 0023 porque las migraciones son append-only:
-- esa ya esta aplicada, y cambiar su fichero lo dejaria sin corresponder con lo
-- que de verdad corrio.
comment on column clinicas.tipo_negocio is
  'Segmento de negocio del establecimiento. DESCRIPTIVO: no decide nada en la aplicacion.
   Quien determina que secciones se ven es el par rol + planes.modulos_habilitados (0024).
   Se fija desde el panel de plataforma y se enseña como etiqueta en la Tienda del portal.
   - veterinaria: clinica medica completa (predeterminado)
   - peluqueria_canina: estetica y cuidado cosmetico, sin historial clinico
   - petshop: venta directa de productos para mascotas
   - mixto_vet_peluqueria: veterinaria + peluqueria en el mismo local
   - mixto_petshop_peluqueria: petshop + peluqueria sin modulos clinicos';
