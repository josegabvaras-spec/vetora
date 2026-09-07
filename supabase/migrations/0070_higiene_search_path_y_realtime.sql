-- Dos higienes que llevaban tiempo anotadas y nunca se hicieron.
--
-- =========================================================
-- 1. `search_path` en las dos funciones de trigger que no lo tenían (VUL-38)
-- =========================================================
-- `generar_numero_orden_compra()` y `fn_asignar_numero_orden_peluqueria()` son
-- las dos únicas funciones del proyecto sin `search_path` fijado; las otras
-- veinte sí lo llevan.
--
-- ⚠️ **El riesgo real es bajo y conviene decir por qué**, para que nadie lo
-- lea como un agujero que estuvo abierto: un `search_path` mutable es vector de
-- escalada de privilegios **cuando la función es `SECURITY DEFINER`**, porque
-- corre como su dueño y un esquema inyectado en el path se ejecutaría con ese
-- privilegio. Estas dos son **`SECURITY INVOKER`**: corren con los privilegios
-- de quien las llama, así que no hay privilegio que capturar. Es higiene
-- inconsistente, no una vulnerabilidad explotable — y se arregla porque una
-- excepción sin motivo en una regla que el proyecto cumple veinte veces es
-- justo lo que hace dudar de la regla.
--
-- `alter function … set search_path` no toca el cuerpo: no hay riesgo de
-- reescribir mal la lógica de numeración, que es lo único delicado aquí.
alter function generar_numero_orden_compra() set search_path = public, pg_temp;
alter function fn_asignar_numero_orden_peluqueria() set search_path = public, pg_temp;

-- ⚠️ Hay una TERCERA sin `search_path`, `get_citas_end_time()`, y **se deja
-- así a propósito.** Apareció al verificar esta misma migración, no estaba en
-- el informe. Es `IMMUTABLE`, `SECURITY INVOKER`, y su cuerpo entero es
-- `select start_time + interval '30 minutes'`: no resuelve ninguna tabla ni
-- ninguna función, así que no hay nada que un `search_path` inyectado pueda
-- secuestrar.
--
-- Y tocarla sí tiene riesgo: la usa el `exclude using gist` que impide que un
-- veterinario tenga dos citas solapadas. Añadirle una cláusula `SET` la vuelve
-- no-inlinable dentro de la expresión de esa restricción. Cambiar el guardián
-- de la agenda para arreglar algo que no puede fallar es mal negocio.

-- =========================================================
-- 2. La publicación de Realtime (VUL-40 / R-6 de la fase 1)
-- =========================================================
-- `useTable()` se suscribe por `postgres_changes` a nueve tablas, y la
-- publicación `supabase_realtime` solo tiene dos: `planes` y
-- `configuracion_plataforma`, que las añadió `0043`.
--
-- ⚠️ **El modo de fallo es mudo, y es lo que lo hizo durar tanto.**
-- `.subscribe()` conecta sin lanzar ningún error y sencillamente no llega ni un
-- evento. Desde el navegador es indistinguible de «no hay cambios». Es la misma
-- trampa que `CLAUDE.md` documenta desde `0043`, y que volvió a pasar: la
-- suscripción se escribió, se dio por hecha, y la migración de publicación no
-- se hizo.
--
-- No es un problema de seguridad —no expone nada— pero sí de frescura: la
-- agenda, el inventario y la caja no se actualizan solos aunque el código diga
-- que sí.
--
-- Se añaden las tablas a las que la aplicación **realmente** se suscribe. El
-- `if not exists` sobre `pg_publication_tables` hace la migración
-- re-ejecutable, igual que `0043`.
do $$
declare
  v_tabla text;
begin
  foreach v_tabla in array array[
    'citas',        -- la agenda, que es donde más se nota
    'pacientes',
    'clientes',
    'productos',    -- stock en el POS y en inventario
    'cobros',       -- caja
    'servicios',
    'usuarios',
    'sucursales',
    'invitaciones'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = v_tabla
    ) then
      execute format('alter publication supabase_realtime add table %I', v_tabla);
    end if;
  end loop;
end $$;

-- ⚠️ **Estar en la publicación NO se salta la RLS.** Supabase evalúa las
-- policies del que escucha antes de entregarle un evento: un cliente del portal
-- suscrito a `citas` solo recibiría las suyas. Añadir una tabla aquí no expone
-- nada que su policy no exponga ya por PostgREST.
--
-- Lo que sí hay que tener presente al añadir una tabla nueva en el futuro: si
-- crece sin techo y la aplicación la recarga entera ante cada evento —que es lo
-- que hace `useTable`—, el coste es de ancho de banda, no de seguridad.
-- `CLAUDE.md` ya avisa de eso para `citas`, `historial_clinico` y
-- `movimientos_inventario`; por eso las dos últimas **no** entran aquí.
