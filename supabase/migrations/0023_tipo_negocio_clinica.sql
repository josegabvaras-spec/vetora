-- Migración 0023: Tipo de negocio del establecimiento
--
-- Agrega `tipo_negocio` a la tabla `clinicas` para distinguir:
--   veterinaria          → clínica veterinaria clásica (flujo actual, sin cambios)
--   peluqueria_canina    → estética canina: agenda de turnos, caja de servicios, sin historial médico
--   petshop              → venta de productos: caja directa, inventario para reventa
--   mixto_vet_peluqueria → veterinaria completa + peluquería integrada
--   mixto_petshop_peluqueria → petshop + peluquería (sin módulos clínicos)
--
-- Todas las clínicas existentes reciben 'veterinaria' como valor por defecto
-- para preservar su comportamiento sin ningún cambio.

ALTER TABLE clinicas
  ADD COLUMN IF NOT EXISTS tipo_negocio TEXT
    NOT NULL DEFAULT 'veterinaria'
    CHECK (tipo_negocio = ANY (ARRAY[
      'veterinaria',
      'peluqueria_canina',
      'petshop',
      'mixto_vet_peluqueria',
      'mixto_petshop_peluqueria'
    ]));

COMMENT ON COLUMN clinicas.tipo_negocio IS
  'Segmento de negocio del establecimiento. Determina qué módulos se muestran y qué flujo es el principal:
   - veterinaria: clínica médica completa (predeterminado)
   - peluqueria_canina: estética y cuidado cosmético, sin historial clínico
   - petshop: venta directa de productos para mascotas
   - mixto_vet_peluqueria: veterinaria + peluquería en el mismo local
   - mixto_petshop_peluqueria: petshop + peluquería sin módulos clínicos';
