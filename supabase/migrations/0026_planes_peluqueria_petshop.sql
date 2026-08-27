-- Planes de arranque para peluqueria y petshop.
--
-- `clinicas.tipo_negocio` (0023) ya admite 'peluqueria_canina' y 'petshop',
-- pero la tabla `planes` nace vacia (0001) y hasta hoy solo se habian creado a
-- mano, desde Plataforma -> Planes, planes pensados para veterinaria. Al dar
-- de alta o editar una clinica de peluqueria o petshop, el selector de "Plan"
-- solo tenia esas opciones clinicas para elegir.
--
-- Son solo un punto de partida: el superadmin los edita como cualquier otro
-- plan (precio, limites, modulos) desde Plataforma -> Planes en cuanto los
-- vea. No hay ninguna relacion automatica entre `tipo_negocio` y que plan se
-- puede elegir -- eso ya era asi para los planes de veterinaria y sigue
-- siendolo aqui: el selector de "Nueva clinica" y el de "editar plan de la
-- clinica" muestran TODOS los planes activos, sin filtrar por tipo_negocio.
--
-- Ninguno de los dos lleva `historial_clinico` ni `internacion`: no son
-- negocios que atiendan medicamente a un paciente.
insert into planes (nombre, precio_mensual_usd, whatsapp_limite, max_sucursales, max_usuarios, modulos_habilitados)
values
  (
    'Peluquería',
    15.00,
    100,
    1,
    3,
    array['agenda', 'caja', 'inventario', 'asistente_ia', 'portal_cliente', 'whatsapp', 'metricas']
  ),
  (
    'PetShop',
    12.00,
    60,
    1,
    3,
    array['caja', 'inventario', 'portal_cliente', 'whatsapp', 'metricas']
  )
on conflict (nombre) do nothing;
