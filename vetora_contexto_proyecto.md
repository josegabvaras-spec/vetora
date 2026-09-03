# Vetora — Contexto del proyecto (para trabajar desde el celular)

> Revisado contra el código y contra la base de producción: **2026-09-02**.
> Pégalo entero como primer mensaje al abrir una conversación nueva sobre Vetora
> cuando no tengas el repositorio delante.
>
> El documento que manda es [vetora.MD](vetora.MD) (el PRD). Esto es su resumen.

## 1. Qué es Vetora

SaaS para **negocios de mascotas en Bolivia**, en producción en `vetora.online`. No es
un producto sino tres, sobre el mismo sistema:

- **Veterinaria** — historial clínico, agenda, internación, recetas, consentimientos.
- **Peluquería canina** — órdenes de servicio, comisiones, fidelización (11 pantallas).
- **PetShop** — punto de venta, promociones, devoluciones, rentabilidad (12 pantallas).

Más un **portal del dueño de mascota** (9 pantallas) y un **panel de plataforma** para el
operador (5 pantallas).

⚠️ **Lo que decide qué ve cada quien es el par `rol` + `módulos del plan`.** El
`tipo_negocio` de la clínica es solo descriptivo: ninguna pantalla lo consulta.

**Tamaño:** 68 pantallas · 42 servicios · 55 modales · 42 tablas · 132 policies RLS ·
37 migraciones · 8 Edge Functions · ~25.600 líneas de TypeScript.

## 2. Stack (obligatorio, sin desviaciones sin aprobación)

- **Frontend:** React 19 + Vite 8, TypeScript estricto (`verbatimModuleSyntax`,
  `noUnusedLocals/Parameters`, `erasableSyntaxOnly` — sin `enum`).
- **Estilos:** Tailwind CSS v4, tema en `src/index.css`, sin `tailwind.config.js`.
- **Backend:** Supabase completo — Postgres + Auth + Edge Functions + Storage. No hay
  modo mock: `isMockMode` es `false` constante.
- **IA:** `claude-haiku-4-5` (redacción) + `claude-sonnet-5` (copiloto), desde una Edge Function en Deno.
- **Idioma:** todo en español, incluidos los nombres de columna.
- **Moneda:** bolivianos con dos decimales; **solo la suscripción va en dólares**.
- **Zona horaria:** estricta `America/La_Paz`.

## 3. Reglas de negocio estrictas

- **Aislamiento solo con RLS**, nunca en frontend. Cuelga de `auth_clinica_id`,
  `auth_sucursal_id`, `auth_es_admin`, `auth_es_plataforma` y `auth_es_personal`.
- El **`superadmin` no ve datos clínicos de ningún inquilino** — su `clinica_id` es null.
- **Inmutable:** historial cerrado e internación con alta. **Solo INSERT:** cobros,
  consentimientos, notas de internación, informes. **El esquema sanitario sí se corrige**,
  y es la excepción deliberada.
- **Stock nunca negativo** y **fraccionado**: se compra en envases, se aplica en ml.
- **Precios congelados** en `cobro_lineas` e `internaciones.precio_dia_bs`.
- **Peluquería:** `precio_final_bs = precio_estimado_bs + Σ suplementos`.
- **WhatsApp:** cuota mensual por plan, comprobada y consumida en una sola sentencia. No
  es una API: se compone un `wa.me` y lo envía una persona.
- **Borrar un cliente:** solo fichas sin mascotas — la cascada se llevaría el expediente.
- **Secretos en `.env`.** La contraseña de Postgres que estuvo en el historial de git **ya
  fue rotada** (ver H-4 en `SEGURIDAD.md`).

## 4. Roles

`superadmin` · `admin` · `veterinario` · `recepcion` · `peluquero` · `cliente`

El **peluquero** da de alta mascotas y dueños pero **no ve el expediente clínico**. El
**cliente** es el portal, y sus policies son de solo lectura.

## 5. Estructura (`src/`)

**Solo `src/services/*.ts` habla con Supabase.** Páginas y `features/` consumen servicios.

- `pages/` — 68 pantallas, con subcarpetas `peluqueria/`, `petshop/`, `plataforma/`,
  `portal-cliente/`.
- `features/` — modales por dominio: agenda, asistente, auth, catalogo, facturacion,
  internacion, inventario, onboarding, pacientes, peluqueria, petshop, plataforma.
- `services/` — 42 ficheros con toda la lógica de negocio.
- `lib/` — helpers puros: `datetime` (La Paz), `currency`, `identidad` (CI y WhatsApp
  normalizados), `inventario` (envases ↔ dosis), `whatsapp`, `asistente`, `personal`.
- `components/ui/` — 12 primitivas propias. `components/layout/` — shell y guardianes.
- `types/` — `database.ts` (filas), `views.ts` (joins), `supabase.ts` (generado).

## 6. Backend

**Edge Functions:** `acceso` · `asistente` · `crear-cuenta` · `cuentas-portal` ·
`eliminar-clinica` · `eliminar-usuario` · `registro-portal` · `respaldo-clinica`.

**Migraciones:** 37, de `0001_init` a `0037_borrar_cliente_sin_recursion`. Las últimas
añadieron los módulos de peluquería y petshop, el catálogo, la Tienda del portal y el
borrado de clientes.

**Storage:** `estudios` y `comprobantes` privados con URL firmada de una hora; `catalogo`
público.

⚠️ **Ni las Edge Functions ni las migraciones viajan con `git push`.** Requieren
`supabase functions deploy` y aplicar el SQL. Es la causa más frecuente de que un cambio
«no aparezca» después de subirlo.

## 7. Planes

| Plan | USD/mes | Sedes | Usuarios | WhatsApp |
|---|---|---|---|---|
| PetShop | 12 | 1 | 3 | 60 |
| Peluquería | 15 | 1 | 3 | 100 |
| Consultorio | 20 | 1 | 2 | 499 |
| Clínica | 40 | 1 | 8 | 999 |
| Multi-sede | 80 | 5 | 25 | 20.000 |

Se cobra sin pasarela: QR, comprobante subido por el admin y aprobación del superadmin.

## 8. Estado de la IA

**Encendida el 2026-09-02.** La función `asistente` está desplegada y con clave, con salida
estructurada, caché de prompt y respaldo ante rechazos. Redacta el aviso al cliente, la nota
interna al equipo y el informe del día, y responde preguntas abiertas sobre el negocio con el
copiloto «Pregúntale a Vetora». Hasta ese día la clave no estaba puesta y todo salía de
plantilla.

**Dos modelos, no uno, elegidos en el servidor.** `claude-haiku-4-5` redacta y ordena cifras
ya dadas (aviso, nota interna, informe); `claude-sonnet-5` razona en el copiloto, que decide
qué herramienta consultar y encadena varias. El modelo nunca llega del cliente.

**Dos palancas, no una.** El módulo `asistente_ia` del plan abre la pantalla;
`planes.ia_limite` paga los tokens, y **en cero no hay copiloto aunque el módulo esté**. Lo
consume `consumir_cuota_ia()` (migración 0038) en una sola sentencia, igual que la cuota de
WhatsApp, y `ia_uso` registra el coste de cada llamada.

Reglas que gobiernan su uso: la clave nunca en el frontend, **la IA no escribe en la
base**, lo que sale hacia Anthropic está acotado en `contextoDeAviso()`, y dentro de la
Edge Function hay **dos clientes de Supabase** — `service_role` solo para saber quién
llama, y el JWT de quien llama para todo lo demás, de modo que la RLS siga siendo la
barrera.

## 9. Verificación

No hay runner de tests. La comprobación real es `npm run build` (los errores de tipo
rompen el build), `npm run lint` (oxlint) y probar en el navegador con una cuenta real.

## 10. Documentación

- **`vetora.MD`** — el PRD. Manda.
- **`CLAUDE.md`** — cómo se trabaja el repo y **por qué** cada decisión técnica se tomó
  así. Es largo a propósito: recoge los errores ya cometidos para no repetirlos.
- **`SEGURIDAD.md`** — auditoría adversaria.
- `README.md` es la plantilla de Vite sin tocar: no documenta nada de Vetora.

## 11. Marca y contacto

Paleta: `teal-600` marca · `slate-50`/`white` superficies · `slate-800`/`slate-500` texto ·
`emerald-600` éxito · `rose-600` peligro · `amber-500` advertencia. Sin modo oscuro.

**José Gabriel Varas Arenas** — Técnico Veterinario Zootecnista, Gerente Propietario.
76838767 · vetora.online
