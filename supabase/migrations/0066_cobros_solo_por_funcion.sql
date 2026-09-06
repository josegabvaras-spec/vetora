-- Un cobro solo puede nacer dentro de una función del servidor.
--
-- =========================================================
-- Por qué esta migración va SOLA y va la última
-- =========================================================
-- `0062` y `0065` movieron los cuatro caminos de cobro —POS, consulta,
-- internación/peluquería y mostrador— a funciones `security definer`. Mientras
-- quedara uno solo insertando directo, `cobros` y `cobro_lineas` tenían que
-- seguir aceptando INSERT de cualquier personal, y esa policy era la puerta por
-- la que un `POST` crudo a PostgREST metía un cobro con el importe, la autoría
-- y el turno que quisiera.
--
-- Ya no queda ninguno. Verificado antes de escribir esto: en todo `src/` no hay
-- un solo `.from('cobros').insert(` ni `.from('cobro_lineas').insert(` — los
-- cuatro caminos llaman a `registrar_venta_pos()` o a `registrar_cobro()`.
--
-- ⚠️ **El orden importa y no es negociable.** Esta migración se aplica DESPUÉS
-- de que el frontend nuevo esté desplegado y comprobado. Aplicarla antes deja a
-- todas las clínicas sin poder cobrar en el mismo instante. Se verificó en el
-- bundle servido por `www.vetora.online` que ya llama a las dos funciones antes
-- de ejecutar esto.
--
-- =========================================================
-- Qué cambia en la práctica
-- =========================================================
-- Las funciones son `security definer`: se saltan la RLS, así que siguen
-- escribiendo sin problema. Lo que deja de existir es la vía directa.
--
--   ANTES:  navegador ──INSERT──> cobros            (RLS: cualquier personal)
--   AHORA:  navegador ──RPC────> registrar_cobro ──> cobros
--                                 ↑ turno, total, autoría, inquilino,
--                                   "ya se cobró", stock, atomicidad
--
-- Y con esto, la afirmación que hasta hoy había que matizar en cada informe —
-- «un INSERT crudo con el precio inventado sigue siendo posible»— deja de ser
-- cierta: no hay permiso para insertar un cobro fuera de la función.

drop policy if exists "cobros_insert" on cobros;
drop policy if exists "cobro_lineas_insert" on cobro_lineas;

-- No se recrean. `cobros` y `cobro_lineas` quedan, para un cliente de
-- PostgREST, en **solo lectura**: sus únicas policies son `cobros_select` y
-- `cobro_lineas_select`. Ni INSERT, ni UPDATE, ni DELETE.
--
-- `respaldo-clinica` restaura las dos tablas con `service_role`, que no pasa
-- por la RLS, así que sigue funcionando igual.

comment on table cobros is
  'INSERT solo por registrar_venta_pos() o registrar_cobro() (0062/0065/0066). '
  'Sin policy de INSERT, UPDATE ni DELETE: un cobro no se crea, edita ni borra '
  'desde el navegador.';

comment on table cobro_lineas is
  'Mismo régimen que cobros: las líneas solo las escriben las funciones de '
  'cobro, dentro de la transacción que crea el cobro al que pertenecen.';

-- =========================================================
-- Pruebas
-- =========================================================
--   · INSERT directo en `cobros` como personal      → 42501
--   · INSERT directo en `cobro_lineas` como personal → 42501
--   · Cobrar por la RPC (las cuatro vías)            → PERMITE
--   · Leer cobros y líneas                           → PERMITE
