-- Los recibos también se firman antes de imprimirse.
--
-- Reutiliza `informes_firmados` (0015) en vez de crear otra tabla: el trámite
-- es el mismo —dos firmas ancladas a un documento— y duplicarlo obligaría a
-- mantener dos juegos de policies en paralelo.

-- =========================================================
-- 1. Un recibo no tiene paciente
-- =========================================================
-- `cobros` liquida una cita o una internación, pero la venta de mostrador
-- (0007) no tiene ninguna de las dos: se cobra a un nombre suelto, sin ficha.
-- Con `paciente_id not null` esos recibos no se podían firmar.
alter table informes_firmados alter column paciente_id drop not null;

-- Pero solo el recibo puede ir sin paciente: un historial o un informe de
-- laboratorio sin mascota no significa nada, y sin esta comprobación un error
-- de programación los dejaría entrar igual.
alter table informes_firmados drop constraint if exists informes_firmados_paciente_segun_tipo;
alter table informes_firmados add constraint informes_firmados_paciente_segun_tipo check (
  tipo = 'recibo' or paciente_id is not null
);

-- =========================================================
-- 2. 'recibo' entra en los tipos admitidos
-- =========================================================
-- Para un recibo, `item_id` es el `cobros.id`.
alter table informes_firmados drop constraint if exists informes_firmados_tipo_check;
alter table informes_firmados add constraint informes_firmados_tipo_check check (
  tipo in ('historial', 'consulta', 'laboratorio', 'imagenologia', 'cirugia', 'recibo')
);

-- La policy del portal (0015) resuelve por `pacientes → clientes`, así que un
-- recibo con `paciente_id` nulo simplemente no le sale al dueño. Es lo
-- correcto: el portal enseña el expediente clínico, no la caja.
