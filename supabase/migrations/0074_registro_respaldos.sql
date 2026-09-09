-- Bitácora de uso de `respaldo-clinica` (H-30).
--
-- La política de privacidad declara: «existe una función de respaldo que sí
-- permite extraer los datos de una clínica concreta [...] solo nosotros
-- podemos ejecutarla, y cada uso queda registrado». Las dos primeras partes
-- eran ciertas. La tercera no: la función nunca escribió una sola línea de
-- auditoría. Se prometía al titular de los datos una trazabilidad que no
-- existía — encontrado al preparar el informe para la revisión jurídica.
--
-- Mismo patrón que `ia_uso`/`registro_errores`: solo INSERT desde el
-- servidor, lectura solo del superadmin, sin UPDATE ni DELETE. Una bitácora
-- que se puede editar después no es una bitácora.

create table registro_respaldos (
  id uuid primary key default gen_random_uuid(),
  -- `usuario_id` sin FK a `usuarios`: si algún día se borra la cuenta del
  -- operador, el registro histórico de que USÓ la función tiene que
  -- sobrevivir a que su perfil ya no exista. Es la misma razón por la que
  -- `registro_errores` tampoco encadena FKs a filas que pueden desaparecer.
  usuario_id uuid not null,
  clinica_id uuid not null references clinicas (id) on delete cascade,
  accion text not null check (accion in ('exportar', 'importar')),
  resultado text not null check (resultado in ('ok', 'error')),
  -- Filas movidas si tuvo éxito; null si falló antes de saberlo.
  filas integer,
  -- Detalle del fallo cuando resultado = 'error'. Nunca el cuerpo de los
  -- datos: esto es "quién y cuándo", no una copia de lo que se respaldó.
  detalle text,
  created_at timestamptz not null default now()
);

comment on table registro_respaldos is
  'Bitácora de cada exportación/importación vía respaldo-clinica. Respalda '
  'la promesa de la política de privacidad de que "cada uso queda '
  'registrado" (H-30). Solo INSERT desde la Edge Function con service_role; '
  'solo lee el superadmin.';

alter table registro_respaldos enable row level security;

-- Solo la plataforma lee: es la bitácora de quién auditó a quién, no un dato
-- de la clínica — la clínica no necesita ni debe poder leer esto por RLS
-- normal (si quisiera saberlo, se lo dice el operador, como ya hace
-- `cuentas-portal` con el estado de las cuentas del portal).
create policy registro_respaldos_select on registro_respaldos for select
  to authenticated
  using ((select auth_es_plataforma()));

-- Sin policy de INSERT para `authenticated`: la escribe la Edge Function con
-- `service_role`, que no pasa por RLS. Sin ella, cualquier superadmin podría
-- insertar una fila falsa atribuyéndose (o atribuyendo a otro) un uso que
-- nunca ocurrió — una bitácora que el propio auditado puede falsificar no
-- prueba nada.
--
-- Sin policy de UPDATE ni DELETE, para nadie: es lo que hace que sea una
-- bitácora y no una nota editable.
--
-- ⚠️ Sin GRANT/REVOKE de tabla aquí a propósito: eso es para funciones
-- (donde Postgres concede `execute` a `PUBLIC` por defecto, la trampa de
-- `0047`). Una tabla nueva ya recibe los privilegios que Supabase concede
-- por defecto a `authenticated`/`anon` sobre el esquema `public`; la única
-- barrera real, aquí como en el resto del proyecto, es la RLS de arriba.
