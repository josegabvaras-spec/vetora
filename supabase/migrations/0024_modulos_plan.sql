-- Migración 0024: Módulos habilitados por plan
--
-- Agrega `modulos_habilitados` a la tabla `planes`.
-- Controla qué secciones de la UI y qué servicios del backend puede usar
-- cada clínica según el plan que contrató.
--
-- Módulos disponibles:
--   agenda              → Calendario de citas
--   caja                → Registro de cobros y turnos de caja
--   inventario          → Control de stock (medicamentos, insumos, productos)
--   historial_clinico   → Ficha SOAP, recetas, consentimientos, internación
--   internacion         → Hospitalización de pacientes (depende de historial_clinico)
--   asistente_ia        → Copiloto con IA (Anthropic API)
--   portal_cliente      → Acceso de los dueños a fichas de sus mascotas
--   whatsapp            → Recordatorios y avisos automáticos por WhatsApp
--   metricas            → Reportes de ingresos, citas y rendimiento

ALTER TABLE planes
  ADD COLUMN IF NOT EXISTS modulos_habilitados TEXT[]
    NOT NULL DEFAULT ARRAY['agenda', 'caja', 'inventario', 'portal_cliente', 'whatsapp'];

COMMENT ON COLUMN planes.modulos_habilitados IS
  'Lista de módulos activos para el plan. Cada módulo habilita una sección de la UI y sus endpoints de datos.';

-- Los planes que YA existían reciben todos los módulos, para que ninguna
-- clínica pierda funciones que hoy usa.
--
-- ⚠️ NO se filtra por `activo = true`. Un plan retirado sigue teniendo clínicas
-- contratadas en él —por eso se desactivan en vez de borrarse (0001)—, y
-- dejarlo con el DEFAULT de cinco módulos le habría quitado de golpe el
-- historial clínico, la internación, el asistente y las métricas a clínicas
-- que los venían usando.
--
-- La condición mira el DEFAULT de la columna en vez de no llevar ninguna: en la
-- primera pasada TODAS las filas acaban de recibir ese valor con el ADD COLUMN,
-- así que las alcanza a todas; y si esta migración se reejecuta más adelante,
-- no pisa los planes que el dueño de la plataforma ya haya configurado a mano
-- (un plan de peluquería o de petshop con menos módulos).
UPDATE planes
SET modulos_habilitados = ARRAY[
  'agenda',
  'caja',
  'inventario',
  'historial_clinico',
  'internacion',
  'asistente_ia',
  'portal_cliente',
  'whatsapp',
  'metricas'
]
WHERE modulos_habilitados = ARRAY['agenda', 'caja', 'inventario', 'portal_cliente', 'whatsapp'];
