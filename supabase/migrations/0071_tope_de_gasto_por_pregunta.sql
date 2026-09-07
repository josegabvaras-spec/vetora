-- 0071 · Un quinto resultado en la bitácora de IA: «tope».
--
-- Contexto: VUL-37. El bucle del copiloto puede llamar al modelo hasta seis
-- veces para responder UNA pregunta, y la cuota mensual se consume una sola vez
-- por pregunta. Mientras el `contexto` viajaba sin límite (VUL-16), eso
-- significaba que el tope del plan acotaba el NÚMERO de preguntas y no la
-- factura: una unidad de cuota podía costar lo que quisiera.
--
-- VUL-16 ya está cerrada (tope de 20.000 caracteres, 413), así que la entrada
-- de la primera vuelta está acotada. Lo que seguía sin acotar es lo que el
-- bucle acumula: cada resultado de herramienta se añade a `messages` y se
-- reenvía en la vuelta siguiente, así que el coste crece con las vueltas aunque
-- la pregunta sea corta.
--
-- La corrección vive en `orquestador.ts`: un tope de GASTO por pregunta,
-- evaluado con la misma `costoEstimadoUsd()` que ya escribe
-- `ia_uso.costo_estimado_usd`. Cuando se alcanza, el bucle para y entrega lo
-- que tenga, igual que ya hacía al agotar las vueltas.
--
-- Esta migración solo aporta la parte que tiene que vivir en la base: poder
-- DISTINGUIR esas preguntas en la bitácora. Sin ella se registrarían como 'ok'
-- y no habría forma de saber si el tope salta una vez al año o veinte veces al
-- día — es decir, no habría forma de saber si está bien calibrado. Un control
-- que no se puede medir es una afirmación.

alter table ia_uso drop constraint if exists ia_uso_resultado_check;

alter table ia_uso add constraint ia_uso_resultado_check
  check (resultado in ('ok', 'error', 'rechazo', 'sin_cuota', 'tope'));

comment on column ia_uso.resultado is
  'ok = respondió; error = falló; rechazo = el modelo se negó; sin_cuota = el '
  'plan no tenía cupo; tope = respondió, pero el bucle se cortó al alcanzar el '
  'tope de gasto de una sola pregunta (VUL-37). Un "tope" frecuente significa '
  'que el tope está bajo o que alguien pregunta cosas demasiado abiertas; que '
  'no aparezca nunca significa que no está haciendo nada.';
