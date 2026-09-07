-- La autoría de un registro clínico deja de ser falsificable (VUL-17 / E-1).
--
-- =========================================================
-- El problema
-- =========================================================
-- `historial_insert` ancla el inquilino y el rol, pero **no restringe ninguna
-- otra columna**:
--
--     with check (clinica_id = auth_clinica_id() and auth_ve_expediente())
--
-- Vía `POST /rest/v1/historial_clinico`, cualquiera de los tres roles clínicos
-- puede fijar:
--
--   · **`veterinario_id`** → cualquier usuario de la clínica. **La autoría de
--     un registro clínico es falsificable**, y en un expediente médico eso es
--     justo lo que no puede pasar: de él cuelgan las recetas y los
--     consentimientos, y es el activo con más peso legal del sistema.
--   · **`editable: false`** → el registro **nace cerrado**. `historial_update`
--     exige `editable = true` en su `using`, y `trg_historial_inmutable` lo
--     congela: no hay ninguna ruta de reapertura en todo el esquema. Un
--     registro así queda inmodificable para siempre desde el momento en que se
--     escribe.
--
-- El servicio (`historial.ts`) deriva bien `veterinario_id` de la cita, pero es
-- código de cliente y no constituye barrera.
--
-- =========================================================
-- La corrección, y por qué no es "forzar veterinario_id = auth.uid()"
-- =========================================================
-- Lo obvio sería exigir que el autor sea quien escribe. **Rompería el flujo
-- real**: recepción abre la consulta desde la cita, y el veterinario de esa
-- consulta no es quien la está creando. Es un camino legítimo y documentado.
--
-- Así que:
--
--   1. **Con cita**: el `veterinario_id` se **deriva de la cita**, ignorando lo
--      que venga en el cuerpo. La cita ya dice de quién es la consulta; no hace
--      falta preguntárselo al cliente, y preguntárselo es justamente el
--      agujero.
--   2. **Sin cita**: se exige que el `veterinario_id` sea un usuario **de esta
--      clínica, activo y con rol clínico**. No cualquier uuid.
--   3. **`editable` se fuerza a `true` en el INSERT.** Un registro no nace
--      cerrado: se cierra después, y ese cierre pasa por `historial_update`,
--      que sí está gobernado. Esto no quita ninguna funcionalidad — cerrar
--      sigue siendo un UPDATE, como siempre.
--
-- ⚠️ **La rama 2 es hoy inalcanzable, y conviene decirlo en vez de dejarla
-- pareciendo un camino vivo.** `historial_clinico.cita_id` es **NOT NULL** —se
-- descubrió probando esta misma migración, cuando el caso "sin cita" reventó
-- con un `23502` antes de llegar al trigger—, así que **toda** consulta cuelga
-- de una cita y la autoría se deriva **siempre**. Es un resultado más fuerte
-- que el diseñado: `veterinario_id` deja de ser un campo que el cliente pueda
-- influir, en cualquier caso.
--
-- Se conserva la rama como red: si algún día se relaja ese `NOT NULL` para
-- permitir consultas sueltas, la comprobación ya está puesta y no hay que
-- acordarse de añadirla.

create or replace function autoria_del_historial() returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_vet_de_la_cita uuid;
  v_clinica_cita uuid;
begin
  -- Salida para `respaldo-clinica`, que restaura `historial_clinico` con
  -- `service_role` y sin JWT: sus filas traen su autoría y su `editable`
  -- originales, y re-derivarlos reescribiría el expediente que se restaura.
  -- Misma salida que llevan los triggers de 0056-0059.
  if auth.uid() is null then
    return new;
  end if;

  -- ---------- 1. Un registro no nace cerrado ----------
  new.editable := true;

  -- ---------- 2. La autoría ----------
  if new.cita_id is not null then
    select veterinario_id, clinica_id
      into v_vet_de_la_cita, v_clinica_cita
      from citas where id = new.cita_id;

    if not found or v_clinica_cita is distinct from new.clinica_id then
      raise exception 'La cita no pertenece a esta clínica' using errcode = 'P0001';
    end if;

    -- Se DERIVA, no se valida: da igual lo que traiga el cuerpo.
    new.veterinario_id := v_vet_de_la_cita;

  else
    -- Sin cita no hay de dónde derivarla, así que al menos tiene que ser
    -- alguien real de esta clínica con rol clínico.
    if new.veterinario_id is null then
      raise exception 'Un registro clínico necesita un veterinario responsable'
        using errcode = 'P0001';
    end if;

    if not exists (
      select 1 from usuarios
       where id = new.veterinario_id
         and clinica_id = new.clinica_id
         and activo
         and rol in ('admin', 'veterinario')
    ) then
      raise exception 'El veterinario responsable no es un profesional activo de esta clínica'
        using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_autoria_del_historial on historial_clinico;
create trigger trg_autoria_del_historial
  before insert on historial_clinico
  for each row execute function autoria_del_historial();

-- =========================================================
-- Lo mismo para las recetas, que cuelgan del historial
-- =========================================================
-- Una receta es el otro documento con peso legal, y su tabla tiene el mismo
-- patrón: `recetas_insert` ancla clínica y rol, y nada más. Aquí no hay
-- `veterinario_id` que derivar —la receta pertenece a un historial, y el
-- historial ya lleva su autor— pero sí hay que impedir que se cuelgue de un
-- historial de otra clínica.
create or replace function receta_mismo_expediente() returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if new.historial_id is not null
     and not exists (select 1 from historial_clinico
                      where id = new.historial_id and clinica_id = new.clinica_id) then
    raise exception 'La consulta de esta receta pertenece a otra clínica' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_receta_mismo_expediente on recetas;
create trigger trg_receta_mismo_expediente
  before insert on recetas
  for each row execute function receta_mismo_expediente();

-- =========================================================
-- Pruebas
-- =========================================================
--   · INSERT con cita y `veterinario_id` de otro → se DERIVA el de la cita
--   · INSERT con `editable: false`               → queda en true
--   · INSERT sin cita y con veterinario válido    → PERMITE
--   · INSERT sin cita y sin veterinario           → RECHAZA
--   · INSERT sin cita con un uuid inventado       → RECHAZA
--   · INSERT sin cita con un usuario de recepción → RECHAZA (no es clínico)
--   · Cerrar la consulta después (UPDATE)         → sigue funcionando
--   · Receta colgada de un historial ajeno        → RECHAZA
