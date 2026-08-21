-- Firma digital del consentimiento de cirugía, y su lectura desde el portal.
--
-- `metodo_aceptacion` ya admitía 'firma_digital' desde 0001, pero no había
-- dónde guardar la firma: el documento se imprimía con dos rayas en blanco y la
-- firma vivía en el papel. Estas columnas guardan el trazo que tutor y
-- veterinario dibujan en la pantalla táctil.

-- =========================================================
-- 1. Las firmas
-- =========================================================
-- Base64 del PNG que produce el <canvas>, igual que `pacientes.foto` (0006).
-- No es lo ideal —engorda la fila y viaja entera en cada `select *`— pero es el
-- patrón que la aplicación ya usa para imágenes, y una firma son unos pocos KB.
--
-- Nullable a propósito: los consentimientos ya emitidos no tienen firma, y los
-- métodos 'firma_fisica_escaneada' y 'aceptacion_verbal_registrada' siguen
-- siendo válidos y no la producen. Quien exige las dos firmas cuando el método
-- es 'firma_digital' es el servicio, no una constraint: un consentimiento ya
-- guardado sin firma no puede volverse inválido de golpe.
alter table consentimientos_cirugia add column if not exists firma_tutor text;
alter table consentimientos_cirugia add column if not exists firma_veterinario text;

-- El nombre de quien firma se congela aquí en vez de leerse por join.
--
-- Es la misma razón por la que `cobro_lineas` guarda el precio y no lo
-- recalcula: un consentimiento es un documento legal, y tiene que seguir
-- diciendo quién firmó aunque el cliente cambie de nombre en su ficha o el
-- veterinario cause baja en la clínica.
alter table consentimientos_cirugia add column if not exists nombre_tutor text;
alter table consentimientos_cirugia add column if not exists nombre_veterinario text;

-- Quién firmó como veterinario, para trazabilidad interna. Sin cascade: dar de
-- baja a un empleado no borra el consentimiento que firmó.
alter table consentimientos_cirugia add column if not exists veterinario_id uuid
  references usuarios (id) on delete set null;

-- =========================================================
-- 2. El dueño puede ver los consentimientos que firmó
-- =========================================================
-- Hasta ahora `consentimientos_select` (0004:90-92) exige `auth_es_personal()`,
-- así que el portal no veía ni el documento que el propio tutor había firmado.
--
-- Se replica el patrón de 0004: policy de personal aparte de policy de portal,
-- en vez de relajar la existente a solo `clinica_id` —eso devolvería a cada
-- cliente los consentimientos de todas las mascotas de la clínica.
--
-- Solo SELECT: la tabla sigue siendo INSERT-only, y quien inserta sigue siendo
-- el personal. El tutor firma en el dispositivo de la clínica, no desde casa.
drop policy if exists consentimientos_portal on consentimientos_cirugia;
create policy consentimientos_portal on consentimientos_cirugia for select
  using (exists (
    select 1 from pacientes p
    join clientes c on c.id = p.cliente_id
    where p.id = consentimientos_cirugia.paciente_id and c.usuario_id = auth.uid()
  ));
