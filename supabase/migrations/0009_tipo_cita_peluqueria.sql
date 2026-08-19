-- `peluqueria` es un tipo de cita valido en el codigo (TipoCita en database.ts)
-- pero faltaba en el CHECK constraint de la base de datos, lo que provocaba
-- un 400 Bad Request al intentar registrar una cita de peluqueria.

ALTER TABLE citas DROP CONSTRAINT IF EXISTS citas_tipo_cita_check;
ALTER TABLE citas ADD CONSTRAINT citas_tipo_cita_check CHECK (
  tipo_cita = ANY (ARRAY['consulta'::text, 'reconsulta'::text, 'vacuna'::text, 'cirugia'::text, 'desparasitacion'::text, 'peluqueria'::text])
);
