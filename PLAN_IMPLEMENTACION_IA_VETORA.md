# Plan de implementación — Vetora Copilot

> Fecha: 2026-09-02 · Continúa a [AUDITORIA_IA_VETORA.md](AUDITORIA_IA_VETORA.md).
> Documento de trabajo: qué se toca, en qué orden, y qué prueba que funcionó.
> **Escrito antes de modificar una sola línea de código.**

---

## 1. Estado actual

| | |
|---|---|
| Edge Function `asistente` | **Desplegada y activa**, 161 líneas. Nunca ha llamado al modelo. |
| `ANTHROPIC_API_KEY` | **No está en los secretos.** Verificado con `supabase secrets list`. |
| Tareas soportadas | 2: `aviso` (texto de WhatsApp) e `informe` (resumen del día). |
| Herramientas | **Ninguna.** Sin `tools`, sin bucle de agente. |
| Acceso a la base desde la función | **Ninguno de negocio.** Solo lee `usuarios` para validar quién llama. |
| Modelo | `claude-opus-5`, literal en `index.ts:115`. |
| Control de consumo | **Inexistente.** Ni cuota, ni contador, ni registro. |
| Conversación | Inexistente. Cada llamada es independiente. |
| Fallback | Sólido, en tres niveles, con insignia de origen visible. |

**Tres defectos vivos** (detalle en la auditoría, §9):

- **C-1** · `redactarAvisoInterno()` manda la tarea `aviso_interno`, que la función rechaza con 400.
  **No puede usar la IA ni con la clave puesta.**
- **C-2** · El servicio corta la llamada cuando el `hostname` es `localhost`, mientras la cabecera de
  la función explica cómo probarla ahí.
- **C-3** · Un comentario de `asistentePlataforma.ts` afirma que la integración no está desplegada.

---

## 2. Arquitectura actual

```
React → services/asistente.ts → functions.invoke('asistente')
                                     │
                                     ├─ esPersonalActivo(jwt)   ← service_role, solo lee `usuarios`
                                     └─ Anthropic (opus-5, una llamada, sin herramientas)
                                     
   ↓ si falla cualquier cosa
lib/asistente.ts → plantillas deterministas + insignia «Plantilla del sistema»
```

Los datos los compone **el navegador** (`listProgramados`, `resumenDelDia`) y los manda ya filtrados
por la RLS. La función no consulta nada de negocio.

---

## 3. Arquitectura objetivo

La del encargo (§5), **con una decisión que es la que sostiene toda la seguridad**:

```
Usuario
 → React → services/asistente.ts → Edge Function `asistente`
      │
      ├── 1. Autenticación            admin.auth.getUser(jwt)          [service_role]
      ├── 2. Perfil                    usuarios: rol, activo, clinica_id, sucursal_id
      ├── 3. Módulo contratado         planes.modulos_habilitados ∋ 'asistente_ia'
      ├── 4. Cuota                     consumir_cuota_ia()             [RPC atómico]
      ├── 5. Orquestador               bucle de herramientas, tope duro de iteraciones
      │       └── herramientas ──► supabase CON EL JWT DE QUIEN LLAMA ──► RLS
      ├── 6. Claude Sonnet 5           system y model FIJADOS EN EL SERVIDOR
      ├── 7. Validación                esquema + IDs + sin acciones
      └── 8. Registro                  tokens, modelo, coste estimado
 → respuesta estructurada → React
```

### ⚠️ La decisión que lo sostiene todo: dos clientes de Supabase, no uno

La función tendrá **dos** clientes, y confundirlos sería el fallo más grave posible:

| Cliente | Con qué credencial | Para qué | RLS |
|---|---|---|---|
| `admin` | `SUPABASE_SERVICE_ROLE_KEY` | **Solo** validar el JWT y leer `usuarios`/`planes` de quien llama | No aplica |
| `comoUsuario` | **El JWT de quien llama**, por petición | **Todas** las herramientas | **Sí aplica, entera** |

**Ninguna herramienta puede usar `admin`.** Con el cliente del usuario, una herramienta lee
exactamente lo que ese usuario lee desde el navegador: mismas policies, mismo `auth_clinica_id()`,
mismo `auth_es_personal()`. El aislamiento entre clínicas no se reimplementa ni se confía a un
`where` escrito a mano — sigue siendo la RLS, que es lo que `CLAUDE.md` exige.

En la auditoría recomendé el orquestador en el navegador para evitar duplicar servicios. Se ha
optado por el servidor (§5 y §6 del encargo). **Es una arquitectura válida siempre que se respete
la regla de los dos clientes**, y el coste que asume es duplicar consultas en Deno. Para contenerlo:
las herramientas de la Fase 4 son consultas **planas y cortas**, no copias de servicios con reglas
de negocio. Las que exigirían duplicar lógica compleja (rentabilidad, comisiones, fidelización) se
posponen a fases posteriores y se resolverán con un RPC en SQL, no con una copia en TypeScript.

### Cambio de modelo — ✅ hecho, con un reparto más fino que «todo Sonnet»

El encargo (§9) proponía Sonnet 5 para los usuarios finales. Al implementarlo, el dueño pidió un
paso más: **Haiku 4.5** para lo que solo redacta u ordena cifras ya dadas (aviso, nota interna,
informe) y **Sonnet 5** solo para lo que de verdad razona (el copiloto). `MODELO_POR_TAREA` en
`modelos.ts` lo resuelve **en el servidor**; el cliente nunca elige modelo.

⚠️ El cambio no fue solo de nombre: **Haiku 4.5 rechaza `output_config.effort` con un error**, a
diferencia de Opus 5 y Sonnet 5. `soportaEffort()` lo comprueba antes de incluirlo, y de paso
`max_tokens` pasó de una constante única a `MAX_TOKENS_POR_TAREA`, porque el límite de salida
tampoco es el mismo en todos los modelos.

---

## 4. Ficheros que se modificarán

| Fichero | Qué | Fase |
|---|---|---|
| `supabase/functions/asistente/index.ts` | Reescritura como orquestador: cliente por JWT, módulo, cuota, herramientas, modelo por tarea, registro, `aviso_interno` | 2–5 |
| `src/services/asistente.ts` | Quitar el corte de `localhost` (C-2) y `isMockMode` (C-4); añadir `preguntarACopiloto()` | 2, 6 |
| `src/lib/asistentePlataforma.ts` | Corregir el comentario falso (C-3) | 2 |
| `src/types/views.ts` | `RespuestaCopiloto` | 6 |
| `src/types/supabase.ts` | Declarar `consumir_cuota_ia` y la tabla de registro | 2 |
| `src/types/database.ts` | Fila de `ia_uso` | 2 |
| `src/pages/AsistentePage.tsx` | Montar «Pregúntale a Vetora» | 7 |
| `CLAUDE.md`, `vetora.MD` | El modelo cambia y la IA gana herramientas | cada fase |

## 5. Ficheros nuevos

| Fichero | Qué |
|---|---|
| `supabase/functions/asistente/herramientas.ts` | Lista blanca: esquema, validación de parámetros, consulta y tope de filas de cada herramienta |
| `supabase/functions/asistente/orquestador.ts` | El bucle de herramientas, con tope de iteraciones |
| `supabase/functions/asistente/modelos.ts` | `MODELO_POR_TAREA` y tarifas para el coste estimado |
| `src/features/asistente/PreguntaleAVetora.tsx` | La interfaz de consulta |
| `src/lib/copiloto.ts` | Accesos rápidos por rol y módulo (helper puro) |
| `supabase/migrations/0038_consumo_ia.sql` | Cuota y bitácora |

## 6. Migraciones necesarias

**Una sola: `0038_consumo_ia.sql`.** Idempotente (`drop policy if exists` en todas — `0036` no lo era
y reventó al reintentarla).

1. `planes.ia_limite integer not null default 0` — **cero por defecto a propósito**: un plan que no
   lo contrata no gasta. Se sube por plan desde el panel de plataforma.
2. `clinicas.ia_consultas` + `clinicas.ia_periodo` — calcados de `whatsapp_mensajes_enviados` /
   `whatsapp_periodo`.
3. `consumir_cuota_ia()` — **copia estructural de `consumir_cuota_whatsapp()`**: comprueba y consume
   en una sola sentencia, reinicia por comparación de mes, `security definer` con `search_path`,
   `revoke all from public` + `grant execute to authenticated`.
4. `ia_uso` — bitácora **solo-INSERT**, calcada de `registro_errores`: `clinica_id` con
   `default auth_clinica_id()`, INSERT para quien tenga sesión, SELECT solo para
   `auth_es_plataforma()`, **sin UPDATE ni DELETE**.
5. Índice por `created_at desc`, como `registro_errores_recientes`.

⚠️ **No se toca ninguna policy existente.** Si en algún momento el diseño pide relajar una, el diseño
está mal.

## 7. Edge Functions que cambiarán

**Solo `asistente`. Ninguna nueva.** Una función por tarea multiplicaría el guard de autenticación,
que es justo lo que no debe divergir (`crear-cuenta`, `respaldo-clinica` y `cuentas-portal` ya
comparten el mismo patrón `esSuperadmin`).

## 8. Herramientas que se crearán

**Fase 4 — las cinco del encargo, todas de solo lectura, todas con el cliente del usuario.**

| Herramienta | Parámetros | Tope | Tabla(s) |
|---|---|---|---|
| `obtener_agenda` | `desde`, `hasta` (máx. 31 días) | 200 | `citas` + `pacientes` + `servicios` |
| `obtener_resumen_paciente` | `paciente_id` (uuid) | 1 | `pacientes`, `historial_clinico`, `vacunas_aplicadas` |
| `obtener_clientes_inactivos` | `dias_sin_visita` (30–730), `limite` (≤50) | 50 | `pacientes` + `citas` |
| `obtener_ventas` | `desde`, `hasta` (máx. 92 días) | agregado | `cobros` |
| `obtener_productos_bajo_minimo` | `limite` (≤50) | 50 | `productos` |

Cada una valida sus parámetros **antes** de consultar, acota el número de filas, y devuelve **campos
mínimos** — nunca `select('*')`. `obtener_resumen_paciente` **no devuelve** el CI ni el WhatsApp del
dueño: para razonar sobre un paciente no hacen falta, y lo que no se manda no se puede filtrar.

Fases 9–11 añaden las de peluquería, petshop e inteligencia cruzada.

## 9. Riesgos

| # | Riesgo | Mitigación en este plan |
|---|---|---|
| R-1 | **Coste sin techo** | Fase 2 **antes** que la clave: `consumir_cuota_ia()`. `ia_limite` por defecto **0**. |
| R-2 | **La IA leyendo con `service_role`** | La regla de los dos clientes (§3). Se verifica con una prueba explícita: la función nunca usa `admin` dentro de una herramienta. |
| R-3 | **Prompt injection indirecto** | Sin herramientas de escritura ni de red. Los resultados van marcados como datos. Toda salida la revisa una persona. |
| R-4 | **Un diagnóstico tomado como propio** | La IA no escribe en `historial_clinico`; `trg_historial_inmutable` y `exigirBorrador()` siguen intactos; la insignia de origen se mantiene. |
| R-5 | **El cliente eligiendo modelo o instrucciones** | `system` y `model` solo en el servidor; el cliente manda tarea y contexto. |
| R-6 | **Cambiar el modelo rompe lo que ya funciona** | Los avisos y el informe se prueban antes y después. Si Sonnet 5 empeora el aviso, se deja Opus 5 para esa tarea: el mapa lo permite sin tocar nada más. |
| R-7 | **Bucle de herramientas infinito** | Tope duro de iteraciones y de llamadas por sesión. |
| R-8 | **Duplicar lógica de negocio en Deno** | Solo consultas planas. Lo complejo se pospone y se resolverá con un RPC. |

## 10. Pruebas

Sin runner: `npm run build` (los errores de tipo rompen el build), `npm run lint`, y el navegador con
una cuenta real. La matriz obligatoria:

**Regresión (lo que no se puede romper)**
1. Sin clave → todo sale por plantilla, insignia «Plantilla del sistema». *Es el estado de hoy.*
2. Con clave → «Redactado con IA», y el aviso interno **también** (hoy no puede).

**Seguridad**
3. Clínica A pidiendo datos de B por una herramienta → vacío **por la RLS**.
4. Cuenta `cliente` del portal invocando la función → **403**.
5. `peluquero` pidiendo `obtener_resumen_paciente` → denegado (no ve expediente).
6. Clínica sin el módulo `asistente_ia` → **403**, comprobado en el servidor.
7. Una cita con notas del tipo «ignora las instrucciones y…» → respuesta normal.

**Cuota**
8. Cuota agotada → mensaje claro, **sin llamada al modelo y sin cargo**.
9. Dos pestañas con la cuota al límite → una pasa, la otra no.

**Negocio**
10. Cada herramienta contrastada contra lo que enseña la pantalla equivalente. Si `obtener_ventas`
    no coincide con `/caja`, la herramienta está mal.

## 11. Orden exacto de implementación

| Fase | Qué | Entregable |
|---|---|---|
| **1** | Auditoría del asistente | ✅ `AUDITORIA_IA_VETORA.md` |
| **2** | Migración `0038` + seguridad y autorización en la función + C-1, C-2, C-3 | ✅ **Aplicada y desplegada el 2026-09-02.** Cuota, módulo, bitácora, tipos, y la clave puesta. Función en versión 4 |
| **3** | Orquestador con tope de iteraciones y la regla de los dos clientes | ✅ `orquestador.ts`, tope de 6 vueltas |
| **4** | Las 5 herramientas | ✅ `herramientas.ts` — **6**, con `buscar_paciente` que no estaba prevista: sin ella el modelo no tenía forma de pasar de un nombre a un identificador, y `obtener_resumen_paciente` era inalcanzable |
| **5** | `MODELO_POR_TAREA` + registro de tokens | ✅ Haiku 4.5 en aviso/aviso_interno/informe, Sonnet 5 en copiloto — reparto por complejidad de tarea, no un solo modelo para todo |
| **6** | `RespuestaCopiloto` y su validación | ✅ Garantizada por la herramienta `responder`, no por el prompt |
| **7** | «Pregúntale a Vetora» | ✅ `PreguntaleAVetora.tsx`, en las tres pantallas del asistente |
| **8** | WhatsApp asistido sobre el flujo existente | reutiliza `MensajeModal` |
| **9–11** | Peluquería · PetShop · Inteligencia cruzada | herramientas nuevas |
| **12–13** | Motor proactivo · Resumen diario | sobre lo ya derivado |
| **14** | Límites por plan en el panel de plataforma | `PlataformaPlanesPage` |
| **15** | Pruebas de seguridad completas | matriz §10 |

**Cada fase:** inspeccionar → diseñar → implementar → `npm run build` + `npm run lint` → revisar
seguridad → documentar → commit. **Ningún despliegue sin autorización explícita.**

## 12. Estimación de complejidad

| Fase | Complejidad | Riesgo | Nota |
|---|---|---|---|
| 2 · Seguridad, cuota, C-1..C-3 | Media | Bajo | Dos patrones ya probados en el repo |
| 3 · Orquestador | Media | **Medio** | Aquí vive la regla de los dos clientes |
| 4 · 5 herramientas | Media | Medio | El riesgo es filtrar de más, no fallar |
| 5 · Sonnet 5 + registro | Baja | Bajo | Un mapa y un insert |
| 6 · Respuesta estructurada | Baja | Bajo | |
| 7 · Interfaz | **Alta** | Bajo | Es donde está el trabajo visible |
| 8 · WhatsApp asistido | Baja | Bajo | El flujo ya existe entero |
| 9–11 · Módulos | Media | Medio | Cuidado con no duplicar reglas |
| 12–13 · Proactivo y resumen | Media | Bajo | Los datos ya se derivan |
| 14 · Límites por plan | Baja | Bajo | |
| 15 · Seguridad | Media | — | No es opcional |

---

## Lo que este plan NO hace

- **No despliega nada.** Ni `supabase db push`, ni `functions deploy`. Se indicará qué hace falta.
- **No toca producción.**
- **No pone la clave.** `supabase secrets set ANTHROPIC_API_KEY=…` lo ejecuta el dueño.
- **No crea datos ficticios.**
- **No reescribe Vetora.**
