-- Cierra escrituras y lecturas que hoy acepta cualquier cuenta autenticada.
--
-- ⚠️ NO APLICADA TODAVÍA. Escrita para revisión; se aplica cuando se apruebe.
--
-- El defecto es uno solo y se repite en las siete tablas de `0030`:
--
--     using      (clinica_id = auth_clinica_id() and auth_es_personal())
--     with check (clinica_id = auth_clinica_id())
--
-- **En un INSERT, PostgreSQL evalúa SOLO `with check`.** El rol se comprueba al
-- leer, actualizar y borrar; al insertar, no. Y su policy hermana de lectura
-- (`*_lectura`) tampoco lo comprueba. Como un cliente del portal tiene
-- `clinica_id` y es `authenticated`, puede leer y escribir las siete.
--
-- Lo que eso permite hoy, verificado contra las policies desplegadas:
--   · crear promociones con `codigo_cupon` y `valor_descuento` a su gusto — el
--     POS las honra por código y la tabla no guarda quién las creó, así que el
--     cajero cobra el descuento sin poder saber de dónde salió;
--   · crear proveedores, órdenes de compra, lotes y devoluciones a nombre de la
--     clínica;
--   · leer `producto_lotes.costo_unitario_bs`, es decir el margen de la clínica.
--
-- Las policies de `0001` no tienen este defecto: llevan `auth_es_personal()` en
-- las dos cláusulas. Esto las alinea con aquellas.
--
-- Re-ejecutable: cada policy se borra antes de recrearse.

-- =========================================================
-- 1. Las seis de inventario y petshop: rol en las DOS cláusulas
-- =========================================================
-- `ordenes_compra`
drop policy if exists ordenes_compra_lectura on ordenes_compra;
create policy ordenes_compra_lectura on ordenes_compra for select to authenticated
  using (clinica_id = auth_clinica_id() and auth_es_personal());

drop policy if exists ordenes_compra_escritura on ordenes_compra;
create policy ordenes_compra_escritura on ordenes_compra for all to authenticated
  using (clinica_id = auth_clinica_id() and auth_es_personal())
  with check (clinica_id = auth_clinica_id() and auth_es_personal());

-- `orden_compra_detalles`
drop policy if exists orden_compra_detalles_lectura on orden_compra_detalles;
create policy orden_compra_detalles_lectura on orden_compra_detalles for select to authenticated
  using (clinica_id = auth_clinica_id() and auth_es_personal());

drop policy if exists orden_compra_detalles_escritura on orden_compra_detalles;
create policy orden_compra_detalles_escritura on orden_compra_detalles for all to authenticated
  using (clinica_id = auth_clinica_id() and auth_es_personal())
  with check (clinica_id = auth_clinica_id() and auth_es_personal());

-- `producto_lotes` — la que además filtra el costo de compra.
drop policy if exists producto_lotes_lectura on producto_lotes;
create policy producto_lotes_lectura on producto_lotes for select to authenticated
  using (clinica_id = auth_clinica_id() and auth_es_personal());

drop policy if exists producto_lotes_escritura on producto_lotes;
create policy producto_lotes_escritura on producto_lotes for all to authenticated
  using (clinica_id = auth_clinica_id() and auth_es_personal())
  with check (clinica_id = auth_clinica_id() and auth_es_personal());

-- `proveedores`
drop policy if exists proveedores_lectura on proveedores;
create policy proveedores_lectura on proveedores for select to authenticated
  using (clinica_id = auth_clinica_id() and auth_es_personal());

drop policy if exists proveedores_escritura on proveedores;
create policy proveedores_escritura on proveedores for all to authenticated
  using (clinica_id = auth_clinica_id() and auth_es_personal())
  with check (clinica_id = auth_clinica_id() and auth_es_personal());

-- `petshop_devoluciones`
drop policy if exists petshop_devoluciones_lectura on petshop_devoluciones;
create policy petshop_devoluciones_lectura on petshop_devoluciones for select to authenticated
  using (clinica_id = auth_clinica_id() and auth_es_personal());

drop policy if exists petshop_devoluciones_escritura on petshop_devoluciones;
create policy petshop_devoluciones_escritura on petshop_devoluciones for all to authenticated
  using (clinica_id = auth_clinica_id() and auth_es_personal())
  with check (clinica_id = auth_clinica_id() and auth_es_personal());

-- `petshop_promociones` — la del cupón.
drop policy if exists petshop_promociones_lectura on petshop_promociones;
create policy petshop_promociones_lectura on petshop_promociones for select to authenticated
  using (clinica_id = auth_clinica_id() and auth_es_personal());

drop policy if exists petshop_promociones_escritura on petshop_promociones;
create policy petshop_promociones_escritura on petshop_promociones for all to authenticated
  using (clinica_id = auth_clinica_id() and auth_es_personal())
  with check (clinica_id = auth_clinica_id() and auth_es_personal());

-- `petshop_configuracion` — su escritura ya exigía admin en el `using`; se
-- replica en el `with check`, que era lo que faltaba.
drop policy if exists petshop_config_lectura on petshop_configuracion;
create policy petshop_config_lectura on petshop_configuracion for select to authenticated
  using (clinica_id = auth_clinica_id() and auth_es_personal());

drop policy if exists petshop_config_escritura on petshop_configuracion;
create policy petshop_config_escritura on petshop_configuracion for all to authenticated
  using (clinica_id = auth_clinica_id() and auth_es_admin())
  with check (clinica_id = auth_clinica_id() and auth_es_admin());

-- =========================================================
-- 2. Las dos bitácoras: que nadie firme con el nombre de otro
-- =========================================================
-- `ia_uso` alimenta la alerta de costo de plataforma. Su `with check` solo
-- exigía tener sesión y la clínica propia, así que `usuario_id`, `modelo`,
-- `tarea` y `costo_estimado_usd` iban libres: cualquiera podía inventar un
-- gasto y atribuírselo a otra persona. La escribe la Edge Function `asistente`
-- con el token de quien pregunta, y `autorizar()` ya solo deja pasar a
-- admin/veterinario/recepción, así que exigir personal no cambia nada legítimo.
drop policy if exists ia_uso_insert on ia_uso;
create policy ia_uso_insert on ia_uso for insert
  with check (
    clinica_id is not distinct from (select auth_clinica_id())
    and usuario_id = (select auth.uid())
    and (select auth_es_personal())
  );

-- `registro_errores` es distinto A PROPÓSITO: lo escribe `lib/errores.ts`, que
-- es el registrador genérico de toda la aplicación **incluido el portal**.
-- Exigir `auth_es_personal()` aquí dejaría de registrar los errores de los
-- clientes, que son los que menos se pueden reproducir. Lo que sí se cierra es
-- la suplantación: la fila tiene que ir a nombre de quien la inserta.
drop policy if exists registro_errores_insert on registro_errores;
create policy registro_errores_insert on registro_errores for insert
  with check (
    clinica_id is not distinct from (select auth_clinica_id())
    and usuario_id = (select auth.uid())
  );

-- =========================================================
-- 3. Peluquería: la comisión no la fija quien la cobra
-- =========================================================
-- `peluqueria_comisiones`, `peluqueria_configuracion` y
-- `peluqueria_servicios_config` eran `for all` para todo `auth_es_personal()`,
-- y de esas tres tablas sale el porcentaje y el precio con los que se paga al
-- peluquero. La lectura se deja abierta al personal —necesita ver sus propias
-- comisiones— y la escritura pasa a ser del admin.
drop policy if exists peluqueria_comisiones_personal on peluqueria_comisiones;
create policy peluqueria_comisiones_select on peluqueria_comisiones for select
  using (clinica_id = auth_clinica_id() and auth_es_personal());
create policy peluqueria_comisiones_escritura on peluqueria_comisiones for all
  using (clinica_id = auth_clinica_id() and auth_es_admin())
  with check (clinica_id = auth_clinica_id() and auth_es_admin());

drop policy if exists peluqueria_configuracion_personal on peluqueria_configuracion;
create policy peluqueria_configuracion_select on peluqueria_configuracion for select
  using (clinica_id = auth_clinica_id() and auth_es_personal());
create policy peluqueria_configuracion_escritura on peluqueria_configuracion for all
  using (clinica_id = auth_clinica_id() and auth_es_admin())
  with check (clinica_id = auth_clinica_id() and auth_es_admin());

drop policy if exists peluqueria_servicios_config_personal on peluqueria_servicios_config;
create policy peluqueria_servicios_config_select on peluqueria_servicios_config for select
  using (clinica_id = auth_clinica_id() and auth_es_personal());
create policy peluqueria_servicios_config_escritura on peluqueria_servicios_config for all
  using (clinica_id = auth_clinica_id() and auth_es_admin())
  with check (clinica_id = auth_clinica_id() and auth_es_admin());

-- =========================================================
-- 4. Storage: un estudio de una consulta cerrada tampoco se borra
-- =========================================================
-- `estudios_delete` (la tabla) exige `historial_clinico.editable = true`; su
-- gemela del bucket no lo hacía, así que el fichero se podía borrar y dejar la
-- fila apuntando a nada dentro de un expediente ya cerrado. Se replica la
-- condición que la tabla ya tenía.
drop policy if exists estudios_objetos_delete on storage.objects;
create policy estudios_objetos_delete on storage.objects for delete
  using (
    bucket_id = 'estudios'
    and (storage.foldername(name))[1] = (select auth_clinica_id())::text
    and (select auth_es_personal())
    and exists (
      select 1
        from estudios_imagen e
        join historial_clinico h on h.id = e.historial_id
       where e.ruta = objects.name
         and h.editable = true
    )
  );
