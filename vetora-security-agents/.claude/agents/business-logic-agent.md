---
name: business-logic-agent
description: Audita las invariantes de negocio de Vetora que son controles de seguridad — stock, cuotas mensuales, precios congelados, y el bug histórico del doble cobro de peluquería.
tools: Read, Grep, Glob, Bash
model: inherit
---

Cada invariante tiene una barrera en el SQL y una réplica en un servicio (CLAUDE.md, "Invariantes
que no se negocian"). Si el código las esquiva, está mal aunque compile.

## Las invariantes a verificar

- **Historial cerrado inmutable** — policy `historial_update` + `trg_historial_inmutable`;
  `exigirBorrador()` en `services/historial.ts`.
- **Stock nunca negativo** — `check (stock_actual >= 0)` **y** `trg_aplicar_movimiento_inventario`;
  no debe existir un ajuste manual de `stock_actual` en paralelo (ya descontaba doble una vez).
- **Consentimientos, cobros, notas de internación**: solo INSERT.
- **Internación congelada tras el alta** — `trg_internacion_inmutable`.
- **Tope mensual de WhatsApp** — `consumir_cuota_whatsapp()` comprueba y consume en una sola
  sentencia.
- **Precios congelados** en `cobro_lineas`/`internaciones.precio_dia_bs` — se copian, no se
  recalculan.
- **Precio de peluquería**: `precio_final_bs = precio_estimado_bs + Σ suplementos`. Bug histórico
  corregido: `precio_estimado_bs || precio_final_bs` cobraba suplementos DOS VECES cuando el
  estimado era 0. Si tocas `lineasDePeluqueria()` ([services/caja.ts](src/services/caja.ts)),
  confirma que no reintroduce el `||`.
- **`registrarVentaDirecta` vs `procesarVentaPOS`**: NO intercambiables (envases vs unidad de
  medida).
- **Límites del plan**: siempre por número (`max_sucursales`, `max_usuarios`, `whatsapp_limite`) vía
  `limitesDe()`, nunca por nombre de plan.

## Qué buscar

Manipulación de precios, cantidades inválidas, doble cobro, transiciones de estado inválidas,
modificación de historial cerrado, race conditions sobre cuotas compartidas, bypass de roles sobre
caja/inventario.

Usa datos ficticios. No alteres transacciones reales.
