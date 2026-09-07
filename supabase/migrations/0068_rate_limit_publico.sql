-- Límite de frecuencia para las dos puertas públicas (VUL-18 / E-2).
--
-- =========================================================
-- El problema
-- =========================================================
-- No existe ningún control de frecuencia en las Edge Functions ni en PostgREST.
-- Los únicos límites del sistema son **cuotas mensuales de negocio**
-- (`consumir_cuota_whatsapp`, `consumir_cuota_ia`), que acotan el gasto pero no
-- la velocidad. Supabase Auth trae el suyo, pero **solo cubre `/auth/v1/*`**.
--
-- Donde importa de verdad son las dos funciones públicas, sin sesión:
--
--   · `registro-portal` — permite sondear a alta velocidad el oráculo que el
--     propio código documenta y acepta: «¿es este número cliente de esta
--     clínica?». Aceptar la fuga de UNA consulta es una cosa; dejar barrer
--     listas de miles de números es otra.
--   · `acceso` — fuerza bruta contra tokens de invitación. El espacio de un
--     UUID v4 lo hace impracticable, pero nada lo frenaba.
--
-- =========================================================
-- Por qué en la base y no en la función
-- =========================================================
-- Las Edge Functions son sin estado y pueden correr en varias instancias a la
-- vez: un contador en memoria no cuenta nada. El estado compartido que ya tiene
-- el proyecto es PostgreSQL, y el patrón correcto ya está escrito dos veces
-- —`consumir_cuota_whatsapp()`— : **comprobar y consumir en una sola
-- sentencia**, porque hacerlo en dos viajes deja pasar dos peticiones
-- simultáneas justo en el límite.

create table if not exists intentos_publicos (
  -- Qué se está limitando y a quién. La clave la compone la función que llama:
  -- 'registro:<ip>', 'acceso:<ip>'. No se guarda nada más de la petición.
  clave text primary key,
  -- Inicio de la ventana en curso.
  ventana_inicio timestamptz not null default now(),
  intentos integer not null default 0 check (intentos >= 0)
);

alter table intentos_publicos enable row level security;

-- ⚠️ **Sin ninguna policy, a propósito.** Nadie —ni `anon`, ni
-- `authenticated`, ni un cliente del portal— tiene por qué leer ni escribir
-- esta tabla: la toca únicamente `consumir_intento_publico()`, que es
-- `security definer` y se salta la RLS. Con RLS activada y cero policies, todo
-- acceso directo queda denegado por defecto, que es justo lo que se quiere.
--
-- Y no lleva `clinica_id`: no es un dato de inquilino, es un contador de
-- peticiones de internet que todavía no se sabe de quién son.

comment on table intentos_publicos is
  'Contador de frecuencia de las puertas publicas (registro del portal y canje '
  'de invitacion). No guarda datos personales: solo una clave, una ventana y un '
  'numero. Se limpia sola: cada ventana vencida se reinicia al siguiente '
  'intento.';

/**
 * Cuenta un intento y dice si se pasó del límite. Comprueba y consume en la
 * MISMA sentencia, igual que `consumir_cuota_whatsapp()`.
 *
 * Devuelve `true` si el intento está permitido, `false` si hay que rechazarlo.
 */
create or replace function consumir_intento_publico(
  p_clave text,
  p_maximo integer default 10,
  p_ventana_minutos integer default 10
) returns boolean
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_intentos integer;
begin
  if p_clave is null or btrim(p_clave) = '' then
    -- Sin clave no se puede limitar; se deja pasar en vez de bloquear a todo el
    -- mundo por no poder identificar el origen. Fallar cerrado aquí convertiría
    -- un problema de cabeceras en una caída del registro.
    return true;
  end if;

  insert into intentos_publicos (clave, ventana_inicio, intentos)
       values (btrim(p_clave), now(), 1)
  on conflict (clave) do update
     set intentos = case
                      -- Ventana vencida: se reinicia el contador. Mismo
                      -- mecanismo que `whatsapp_periodo` — no hay proceso que
                      -- limpie nada, lo reinicia el primer intento de la
                      -- ventana nueva.
                      when intentos_publicos.ventana_inicio < now() - make_interval(mins => p_ventana_minutos)
                        then 1
                      else intentos_publicos.intentos + 1
                    end,
         ventana_inicio = case
                            when intentos_publicos.ventana_inicio < now() - make_interval(mins => p_ventana_minutos)
                              then now()
                            else intentos_publicos.ventana_inicio
                          end
  returning intentos into v_intentos;

  return v_intentos <= p_maximo;
end;
$$;

-- ⚠️ La trampa de `0047`: `EXECUTE` va a `PUBLIC` por defecto y `anon` es
-- miembro de `PUBLIC`. Se revoca de los dos.
--
-- Y **no se concede a nadie**: la llaman `registro-portal` y `acceso` con
-- `service_role`, que no necesita grant. Concedérsela a `anon` permitiría a
-- cualquiera inflar el contador de otra IP para dejarla fuera — convertiría el
-- límite en un arma.
revoke all on function consumir_intento_publico(text, integer, integer) from public;
revoke all on function consumir_intento_publico(text, integer, integer) from anon;
revoke all on function consumir_intento_publico(text, integer, integer) from authenticated;

-- =========================================================
-- Lo que esto NO es
-- =========================================================
-- No es un WAF ni protege contra un ataque distribuido: la clave es la IP que
-- reporta la cabecera, y quien tenga muchas IP puede repartirse. Lo que corta
-- es el caso real —una sola máquina barriendo una lista de números o de
-- tokens—, que es exactamente lo que E-2 describía.
