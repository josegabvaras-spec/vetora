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
