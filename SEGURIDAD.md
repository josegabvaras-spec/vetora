# Auditoría de seguridad de Vetora

Fecha: 2026-08-22 · Alcance: código de la aplicación, migraciones SQL (0001–0020),
Edge Functions, dependencias. Método: revisión adversaria del código. **No se ejecutaron
ataques contra la base de producción** — ver «Lo que no se pudo probar».

## Resumen

| Severidad | Hallazgos | Estado |
|---|---|---|
| Crítico | 0 | — |
| Alto | 1 | corregido (dependencia) |
| Medio | 1 | corregido |
| Bajo / Info | 2 | 1 verificado, 1 heredado pendiente |

El aislamiento entre clínicas (lo que de verdad importa en un SaaS multi-inquilino) **se
sostiene en la lectura**: no se encontró ninguna policy que se salte `clinica_id`, ni un
`or auth_es_plataforma()` de más en una tabla clínica. El fallo real que se corrigió no cruza
inquilinos: es una inyección de filtro acotada a la propia clínica. Aun así, esto **no
sustituye** la prueba en vivo con dos sesiones (ver abajo).

---

## Hallazgos

### H-1 · MEDIO · Inyección de filtro PostgREST — CORREGIDO

- **Dónde:** `src/services/clientesPacientes.ts`, función `listPacientes` (búsqueda de pacientes).
- **Qué:** el término de búsqueda del usuario se interpolaba dentro de un filtro
  `.or(\`nombre.ilike.${patron},cliente_id.in.(…)\`)`. La sintaxis de filtros de PostgREST usa la
  coma, el punto y los paréntesis como separadores; el escape que había (`\%`, `\_`, `\\`) es el de
  `LIKE`, que no cubre esos caracteres.
- **PoC:** buscar `a,b` partía la expresión en dos condiciones distintas; buscar `a)` la rompía con
  un error crudo de PostgREST.
- **Impacto:** **acotado, no cruza clínicas** — la RLS sigue encerrando al inquilino, así que un
  atacante no llega a datos de otra clínica. Dentro de la propia clínica podía alterar lo que el
  filtro devolvía o provocar un error. Por eso es MEDIO y no ALTO.
- **Corrección aplicada:** se eliminó el `.or()` con entrada de usuario. Ahora la búsqueda se hace en
  **dos consultas** (por nombre de paciente y por nombre de dueño) que se unen en memoria; el término
  viaja siempre como **valor** de un parámetro `ilike`, nunca como sintaxis. No se «escapó» el
  carácter porque serían dos gramáticas de escape superpuestas —la de LIKE dentro de la de
  PostgREST— y una se comería a la otra.
- **Cómo confirmar:** en la lista de pacientes, buscar `a,b`, `nombre)` y `50%`. Debe devolver lo
  razonable y **no** romper ni listar de más.

### H-2 · ALTO · Dependencia vulnerable (react-router) — CORREGIDO

- **Qué:** `react-router` 7.18.1 tenía el aviso GHSA-qwww-vcr4-c8h2 (bypass de CSRF en modo RSC).
- **Corrección aplicada:** `npm audit fix` → `react-router` 7.18.2. `npm audit --omit=dev` reporta
  ahora **0 vulnerabilidades**.
- **Nota:** Vetora no usa el modo RSC de react-router, así que la explotabilidad real era baja; se
  parchea igual porque el arreglo es trivial y sin riesgo.

### H-3 · INFO · `.or()` sobre ids de la base — VERIFICADO SEGURO

- **Dónde:** `src/services/clientesPacientes.ts` (comprobación de cobros antes de borrar un paciente)
  y otros puntos con `.in(...)`.
- **Veredicto:** seguro. Lo que se interpola son **uuids recién leídos de la base**, no texto de
  usuario; un uuid no puede contener una coma ni un paréntesis. Se dejó un comentario en el código
  fijando la regla: *nunca* entrada de usuario dentro de un `.or()` — no que `.or()` esté prohibido.

### H-4 · BAJO · Credencial de Postgres en el historial de git — HEREDADO, PENDIENTE (acción del usuario)

- **Qué:** los scripts `apply_migrations.cjs` y `set_limit.cjs` llevaban la contraseña de Postgres de
  producción en texto plano. **Ya no están en el árbol** (se sacaron en el commit `91725ff`), pero
  **siguen en el historial de git**, que es público en GitHub.
- **Por qué no se «arregla» aquí:** borrar el archivo no borra el historial. La única solución real es
  **rotar la contraseña** en Supabase → Settings → Database. Mientras no se rote, esa credencial está
  comprometida.
- **Acción:** rotar la contraseña de Postgres. (Recordatorio, no corrección de código.)

---

## Áreas verificadas (sin hallazgo)

Cada una **leída**, no asumida:

- **Aislamiento por `clinica_id`** — las policies de negocio (`clientes_personal`, `pacientes_personal`,
  `citas_personal`, …) anclan `clinica_id = auth_clinica_id()` **y** `auth_es_personal()`. Las
  permisivas de 0001 (`clientes_all`, etc.) fueron **reemplazadas** por 0004 con `drop policy` — no
  coexisten. Un `cliente` del portal no entra por ellas.
- **`superadmin` sin acceso clínico** — no aparece `or auth_es_plataforma()` en ninguna tabla clínica.
  Donde sí aparece (`planes`, `clinicas`, `sucursales`, `usuarios`, `configuracion_plataforma`,
  `pagos_suscripcion`) es dominio de la plataforma, no datos de pacientes. `pagos_suscripcion` (0020)
  se revisó expresamente: es el cobro de la suscripción, no el expediente de nadie.
- **Escalada de rol** — la única policy de UPDATE sobre `usuarios` es `usuarios_plataforma`
  (solo superadmin). Un usuario no puede cambiarse su `rol`, `clinica_id` ni `sucursal_id`.
- **Las 4 `SECURITY DEFINER`** y las de 0004/0005/0013/0018 llevan `set search_path` explícito (fijado
  en 0002). Ninguna nueva quedó sin él.
- **Tope de WhatsApp** — `consumir_cuota_whatsapp()` comprueba y consume en **una sola sentencia**
  (`where … and contador < límite … returning`), así que dos pestañas a la vez no pueden gastar dos.
  Es `security definer` acotado, con `revoke all from public` + `grant a authenticated`.
- **Inmutabilidad** — historial cerrado (`editable = false`), consentimientos, cobros y notas de
  internación: policies sin UPDATE/DELETE, más triggers. Un registro firmado no se reescribe.
- **Edge Function `acceso`** — reclamo atómico del token (`update … is('usado_at', null)`), un solo
  uso, caducidad, y **libera el token** si el cambio de contraseña falla después (no lo quema).
- **Edge Function `registro-portal`** — valida la clínica en servidor, y el mensaje de «correo ya
  registrado» es **idéntico** al de datos inválidos para no permitir enumerar correos.
- **Edge Function `crear-cuenta`** — exige superadmin activo (valida el JWT y lee el rol con el
  cliente admin), no confía en el cuerpo.
- **Edge Function `asistente`** — valida que quien llama sea personal activo (`esPersonalActivo`), así
  que el anon key por sí solo no puede quemar créditos de Anthropic.
- **`motivoDeBloqueo`** — se evalúa al montar `ProtectedRoute` **y** en un canal realtime sobre
  `UPDATE` de la clínica, así que suspender expulsa sesiones abiertas. (Ojo: es control de fachada; la
  barrera real es el `signOut` al iniciar sesión y la RLS.)
- **Secretos** — no hay `VITE_*` con `service_role` ni Anthropic; `.env` y `*.local` están en
  `.gitignore`. Lo único en `localStorage` es `vetora_sucursal`, un id no secreto.
- **XSS** — no hay `dangerouslySetInnerHTML` ni `innerHTML` en todo `src/`.

---

## Lo que NO se pudo probar (requiere prueba manual en vivo)

Sin un Supabase administrable y **dos sesiones de clínicas distintas**, las policies RLS **se leyeron,
no se ejecutaron**. Que el SQL se vea correcto no es prueba de que la base lo aplique como se cree.
El guion de abajo es para cerrar esa brecha contra un **proyecto de prueba desechable** — nunca
producción.

### Guion de pruebas manual (proyecto de prueba)

Prepara dos clínicas (A y B) con un usuario cada una, y ten a mano la `anon key` y la URL del proyecto
de prueba.

**Prepara el cliente en la consola.** La app **no** expone su cliente en `window` a propósito, así que
en la pestaña con la sesión de A abierta, crea uno que reutilice su sesión (lee el token que Supabase
ya guardó en `localStorage`):

```js
const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
const URL = '<TU_URL>.supabase.co', ANON = '<TU_ANON_KEY>'
// Reutiliza la sesión que la app ya guardó, para atacar COMO el usuario de A.
const sb = createClient(URL, ANON)
const guardada = Object.keys(localStorage).find(k => k.endsWith('-auth-token'))
await sb.auth.setSession(JSON.parse(localStorage.getItem(guardada)).currentSession ?? JSON.parse(localStorage.getItem(guardada)))
```

Si `esm.sh` está bloqueado por la CSP de la página, abre una pestaña en blanco (`about:blank`) y corre
el guion ahí; el ataque no necesita la página de la app, solo la URL, la anon key y el token.

**1. Aislamiento entre clínicas (lo más importante).**

```js
const { data, error } = await sb
  .from('pacientes').select('*').eq('clinica_id', '<UUID_DE_LA_CLINICA_B>')
console.log(data, error)   // debe salir [] — la RLS filtra, no la app
```

Repite con `historial_clinico`, `cobros`, `citas`. Todos deben devolver `[]`.

**2. Modificar dato ajeno.** Como A, intenta tocar una fila de B por su id:

```js
await sb.from('pacientes')
  .update({ nombre: 'hackeado' }).eq('id', '<UUID_PACIENTE_DE_B>').select()
// data: [] (no tocó nada). Si devuelve la fila, es CRÍTICO.
```

**3. Escalada de rol.** Como `recepcion` o `veterinario`, intenta ascenderte:

```js
await sb.from('usuarios')
  .update({ rol: 'admin' }).eq('id', '<TU_PROPIO_UUID>').select()
// data: [] — no hay policy de UPDATE de usuarios salvo superadmin.
```

**4. Cliente del portal en pantallas del personal.** Inicia sesión con una cuenta `cliente` y escribe
a mano `/agenda`, `/inventario`, `/caja`. Debe rebotar al portal, y una consulta directa a `pacientes`
de su clínica debe devolver solo sus propias mascotas, no toda la cartera.

**5. Inyección de filtro (H-1, ya corregido).** En la lista de pacientes busca `a,b`, `nombre)`,
`50%`. No debe romper ni listar de más.

**6. Auto-aprobar un pago (Facturación).** Como `admin`, intenta marcar tu propio comprobante:

```js
await sb.from('pagos_suscripcion')
  .update({ estado: 'aprobado' }).eq('id', '<UUID_DE_UN_PAGO_TUYO>').select()
// data: [] — no hay policy de UPDATE para la clínica. Si cambia, es ALTO.
```

**7. Token de invitación de un solo uso.** Canjea un enlace `/acceso/:token`, y vuelve a abrir el
mismo enlace. La segunda vez debe fallar («enlace no válido o ya usado»).

Marca cada prueba como **pasa / falla**. Cualquier `falla` en 1, 2, 3 o 6 es un incidente grave:
detén el despliegue y avísame.

---

## Cómo relanzar esta auditoría

Está disponible el agente **`pentester`** (`.claude/agents/pentester.md`), con mentalidad de atacante,
para dirigirlo a una funcionalidad concreta o repasar antes de un despliegue. El `security-engineer`
(defensivo, desde el diseño) sigue disponible para lo suyo.
