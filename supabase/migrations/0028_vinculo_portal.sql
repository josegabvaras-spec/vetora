-- Vincular y desvincular una cuenta del portal, como operaciones atomicas.
--
-- Hasta ahora las dos rutas manuales (`vincularPorIds` y `vincularCuentaPortal`
-- en services/clientesPacientes.ts) hacian DELETE y despues UPDATE desde el
-- navegador, en dos viajes. Eso arrastraba tres problemas:
--
--   1. NO SE PODIA DESHACER. Ningun punto del codigo escribia
--      `clientes.usuario_id = null`; los cuatro que tocan esa columna asignan
--      un id. La unica forma de soltar un vinculo era borrar la cuenta entera
--      (la FK es `on delete set null`). Un vinculo mal hecho dejaba a alguien
--      viendo el historial, las recetas y los estudios de una mascota ajena,
--      sin ninguna pantalla para repararlo.
--
--   2. SIN GUARDA. El UPDATE era `.eq('id', ...)` a secas, sin comprobar que
--      la ficha destino estuviera libre. Vincular sobre una ficha ya reclamada
--      pisaba el `usuario_id` anterior en silencio y dejaba a esa cuenta sin
--      ninguna fila en `clientes` — invisible para la propia pantalla que
--      sirve para recuperarla. El camino automatico (`registro-portal`) si
--      lleva esa guarda; el manual no.
--
--   3. SIN TRANSACCION. Si el DELETE iba y el UPDATE fallaba (RLS, red,
--      pestaña cerrada), la ficha del portal ya no existia y el vinculo no se
--      habia escrito: cuenta huerfana, sin rastro.
--
-- Una funcion corre dentro de una transaccion, asi que resuelve el 3 de
-- gratis; el 1 y el 2 se resuelven explicitamente aqui dentro.
--
-- NINGUNA de las dos es `security definer`, y es deliberado: corren con los
-- privilegios de quien llama, de modo que `clientes_personal` sigue aplicando
-- entera. Esto NO abre ninguna puerta lateral — a diferencia de
-- `consumir_cuota_whatsapp`, que si necesita `definer` porque escribe en
-- `clinicas`, una tabla sobre la que el personal no tiene UPDATE. Aqui el
-- personal ya puede escribir `clientes`; lo que le faltaba era hacerlo de una
-- pieza y con las comprobaciones en el mismo sitio.

-- ---------------------------------------------------------------------------
-- Unir la cuenta del portal de una ficha vacia con la ficha que tiene las
-- mascotas. Devuelve el id de la ficha que se queda.
-- ---------------------------------------------------------------------------
create or replace function vincular_cuenta_portal(
  p_ficha_destino uuid,
  p_ficha_portal uuid
) returns uuid
  language plpgsql
  set search_path = public, pg_temp
as $$
declare
  v_usuario_id uuid;
  v_destino_ocupada uuid;
  v_mascotas_portal integer;
begin
  if p_ficha_destino = p_ficha_portal then
    raise exception 'Es la misma ficha' using errcode = 'P0001';
  end if;

  -- `for update` sobre las dos filas: sin el, dos pestañas resolviendo la
  -- misma sugerencia a la vez podrian pisarse entre ellas.
  select usuario_id into v_usuario_id
    from clientes where id = p_ficha_portal for update;

  if not found then
    raise exception 'La cuenta del portal ya no existe' using errcode = 'P0001';
  end if;
  if v_usuario_id is null then
    raise exception 'Esa ficha ya no tiene una cuenta del portal' using errcode = 'P0001';
  end if;

  select usuario_id into v_destino_ocupada
    from clientes where id = p_ficha_destino for update;

  if not found then
    raise exception 'La ficha de destino ya no existe' using errcode = 'P0001';
  end if;

  -- LA GUARDA QUE FALTABA. Sin esto se pisaba el vinculo anterior y su cuenta
  -- quedaba sin ficha, sin que nada lo dijera.
  if v_destino_ocupada is not null then
    raise exception 'Esa ficha ya tiene una cuenta del portal vinculada: desvinculala primero'
      using errcode = 'P0001';
  end if;

  -- Solo se absorbe una ficha VACIA. Si la cuenta ya registro mascotas por su
  -- cuenta, unirlas perderia esas mascotas al borrar la fila.
  select count(*) into v_mascotas_portal from pacientes where cliente_id = p_ficha_portal;
  if v_mascotas_portal > 0 then
    raise exception 'Esa cuenta ya tiene sus propias mascotas registradas: no se puede unir automaticamente'
      using errcode = 'P0001';
  end if;

  -- Soltar antes de tomar: el indice unico parcial `clientes_por_usuario`
  -- (0004) no deja que dos fichas compartan la misma cuenta ni un instante.
  delete from clientes where id = p_ficha_portal;

  -- Si la RLS filtra el DELETE, borra 0 filas SIN error. El indice unico
  -- acabaria reventando en el UPDATE de abajo, pero con un mensaje ilegible
  -- sobre una restriccion; mejor decirlo aqui.
  if not found then
    raise exception 'No tienes permiso para soltar la ficha del portal' using errcode = 'P0001';
  end if;

  update clientes set usuario_id = v_usuario_id where id = p_ficha_destino;

  if not found then
    -- La RLS filtro la fila. Al ir todo en una transaccion, el delete de
    -- arriba se deshace solo: no queda a medias.
    raise exception 'No tienes permiso para vincular esta ficha' using errcode = 'P0001';
  end if;

  return p_ficha_destino;
end;
$$;

-- ---------------------------------------------------------------------------
-- Soltar una cuenta del portal de la ficha a la que se vinculo por error.
-- Devuelve el id de la ficha nueva que queda para esa cuenta.
-- ---------------------------------------------------------------------------
create or replace function desvincular_cuenta_portal(p_ficha uuid) returns uuid
  language plpgsql
  set search_path = public, pg_temp
as $$
declare
  v_usuario_id uuid;
  v_clinica_id uuid;
  v_nombre text;
  v_whatsapp text;
  v_nueva uuid;
begin
  select usuario_id, clinica_id into v_usuario_id, v_clinica_id
    from clientes where id = p_ficha for update;

  if not found then
    raise exception 'La ficha ya no existe' using errcode = 'P0001';
  end if;
  if v_usuario_id is null then
    raise exception 'Esa ficha no tiene ninguna cuenta del portal vinculada' using errcode = 'P0001';
  end if;

  select nombre, whatsapp into v_nombre, v_whatsapp
    from usuarios where id = v_usuario_id;

  -- Primero soltar, por el indice unico parcial.
  update clientes set usuario_id = null where id = p_ficha;

  if not found then
    raise exception 'No tienes permiso para desvincular esta ficha' using errcode = 'P0001';
  end if;

  -- Y devolverle a la cuenta una ficha propia y vacia, que es el estado en el
  -- que la deja `registro-portal` cuando no encuentra a quien vincularla.
  --
  -- No es un extra: sin esta fila la cuenta no aparece en NINGUNA pantalla
  -- —`listClientesDeClinica` lista `clientes`—, asi que desvincular la haria
  -- desaparecer en vez de devolverla a la cola de sugerencias. El dueño
  -- seguiria pudiendo entrar al portal, y lo veria vacio para siempre.
  insert into clientes (clinica_id, usuario_id, nombre, whatsapp)
  values (v_clinica_id, v_usuario_id, coalesce(v_nombre, 'Cuenta del portal'), coalesce(v_whatsapp, ''))
  returning id into v_nueva;

  return v_nueva;
end;
$$;

revoke all on function vincular_cuenta_portal(uuid, uuid) from public;
grant execute on function vincular_cuenta_portal(uuid, uuid) to authenticated;

revoke all on function desvincular_cuenta_portal(uuid) from public;
grant execute on function desvincular_cuenta_portal(uuid) to authenticated;
