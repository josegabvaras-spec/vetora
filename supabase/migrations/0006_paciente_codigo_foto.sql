-- `pacientes.codigo` y `pacientes.foto`: columnas que el código ya escribía y
-- que nunca existieron en la base.
--
-- Sintoma: POST /rest/v1/pacientes devolvia 400 con
--   {"code":"42703","message":"column pacientes.codigo does not exist"}
-- es decir, dar de alta un paciente era imposible. Los `as any` del servicio
-- son lo que impidio que `tsc` lo detectara.
--
-- Se anaden en vez de quitarse del insert porque las dos se usan de verdad:
-- el formulario captura la foto, el portal del cliente la muestra, y el
-- respaldo (`lib/exportacion.ts`) nombra cada fichero de la carpeta `fotos/`
-- con el `codigo` del paciente.

alter table pacientes add column if not exists codigo text;

-- Base64 de la imagen. No es lo ideal —engorda cada fila y viaja entera en
-- todo `select *`—, pero es lo que el codigo ya guarda; migrarlo a Storage es
-- otra conversacion.
alter table pacientes add column if not exists foto text;

-- El codigo es lo que el personal dicta por telefono: unico dentro de la
-- clinica, no globalmente. Parcial porque las filas ya existentes no lo tienen.
create unique index if not exists pacientes_codigo_por_clinica
  on pacientes (clinica_id, codigo) where codigo is not null;

-- El codigo lo asigna la base, no el navegador.
--
-- `clientesPacientes.ts` lo formaba con `count(*) + 1`, que es un
-- check-then-act: dos altas simultaneas leen el mismo total y generan el mismo
-- codigo, y con el indice unico de arriba la segunda fallaria. El lock por
-- advisory es a nivel de clinica, asi que dos altas en clinicas distintas no
-- compiten entre si.
create or replace function siguiente_codigo_paciente()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_n integer;
begin
  if new.codigo is not null then return new; end if;

  perform pg_advisory_xact_lock(hashtextextended(new.clinica_id::text, 0));

  select coalesce(max(substring(codigo from '[0-9]+$')::integer), 0) + 1
    into v_n
    from pacientes
   where clinica_id = new.clinica_id and codigo ~ '^MAS-[0-9]+$';

  new.codigo := 'MAS-' || lpad(v_n::text, 3, '0');
  return new;
end;
$$;

drop trigger if exists trg_codigo_paciente on pacientes;
create trigger trg_codigo_paciente
  before insert on pacientes
  for each row execute function siguiente_codigo_paciente();
