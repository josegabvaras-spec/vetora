# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Proyecto

Vetora es un SaaS de gestión veterinaria (MVP) para clínicas de Bolivia. **[vetora.MD](vetora.MD) es el PRD y manda**: alcance, reglas de negocio (§5.2), modelo de datos (§6) y paleta/pantallas (§8). Antes de añadir una regla o una tabla, revisa si el PRD ya la define.

Todo el código, los comentarios, los identificadores y la interfaz están **en español** (incluidos los nombres de columnas: `clinica_id`, `fecha_hora`, `stock_actual`). Mantén esa convención.

`README.md` es la plantilla de Vite sin tocar: no documenta nada de Vetora. La documentación del proyecto son el PRD y este archivo.

## Comandos

```powershell
npm run dev       # Vite dev server
npm run build     # tsc -b --force && vite build  (los errores de tipos rompen el build)
npm run lint      # oxlint (rápido, NO type-aware)
npm run preview   # sirve dist/
```

No hay runner de tests configurado. La verificación real es `npm run build` (typecheck) + probar en el navegador con una cuenta real de Supabase.

## Supabase es el backend, y ya está conectado

**No queda modo mock.** `src/mocks/db.ts` y `seed.ts` fueron eliminados en la migración; hoy son ficheros vacíos que solo existen por un motivo de build (ver más abajo). `isMockMode` sigue exportándose en [src/lib/supabase.ts](src/lib/supabase.ts) pero es `const false`: cualquier `if (isMockMode)` es código muerto.

- [supabase/migrations/](supabase/migrations/) es el esquema de verdad y **es normativo** — pero eso es las **treinta y siete** migraciones, no solo la primera. `0001_init.sql` es la base (20 tablas, RLS habilitada en las 20, 35 policies, 3 triggers, 4 funciones `SECURITY DEFINER`); `0002` a `0010` son correcciones de seguridad reales y features que ya están aplicadas encima (RLS de `historial_update`/`internaciones_update`, índices, cuota de WhatsApp, portal del cliente, `pacientes.codigo`/`foto`, venta directa, recetario, tipo de cita `peluqueria`, inventario fraccionado). Leer solo `0001` da una foto vieja del esquema — antes de decir "esta tabla/columna no existe" o "esta policy no tiene `with check`", revisa si una migración posterior ya lo tocó.
- [src/types/database.ts](src/types/database.ts) pretende reflejar fila por fila las tablas del SQL, y [src/types/supabase.ts](src/types/supabase.ts) es el tipo generado desde la base real. Cuando discrepen, **gana el SQL**.

**Regla estructural: solo `src/services/*.ts` habla con Supabase.** Las páginas y los `features` nunca llaman a `supabase` directamente; consumen servicios, que devuelven los tipos de `types/views.ts`. La única excepción legítima es `useTable` (abajo), que es infraestructura de reactividad, no de negocio.

La deuda que sigue viva:

- [lib/exportacion.ts](src/lib/exportacion.ts) e [lib/importacion.ts](src/lib/importacion.ts) — son `lib/` pero leen y escriben tablas enteras, y con `any`. El respaldo no puede salir de ahí.
- **Hubo una contraseña de Postgres de producción en el historial de git, y está rotada.** `apply_migrations.cjs` y `set_limit.cjs` la llevaban en texto plano; ya no están en la raíz (`91725ff`), pero **eso no la borró de la historia** —sigue legible con `git show fd6ad0d:apply_migrations.cjs`— y por eso se cerró **rotando la credencial**, no borrando el fichero. Lo que queda ahí ya no abre nada. La lección, que es lo que importa: **un secreto que entró en un commit está quemado**; se rota, no se limpia. Y no se meten credenciales en scripts sueltos, ni «de una sola vez». Ver H-4 en [SEGURIDAD.md](SEGURIDAD.md).

Cuando toques una regla de negocio, tiene que quedar en los **tres** sitios: el SQL (constraint/trigger/policy), el servicio que la aplica, y el tipo si cambia la forma de la fila. **Un `as any` de por medio significa que los tres no están alineados**: esos casts son exactamente lo que permitió que el esquema y los tipos derivaran sin romper el build.

## El asistente de avisos (IA)

`/asistente` es **una ruta y dos pantallas**: [AsistenteSegunRol](src/components/layout/AsistenteSegunRol.tsx) despacha por rol, igual que `InicioSegunRol` despacha el destino de entrada. Lo que sigue describe la de recepción y administración. La jornada clínica (más abajo) es la de quien atiende directamente al paciente —veterinario o peluquero—, y el admin la lleva además como una sección propia: ni WhatsApp ni IA.

Cierra la Épica 4 del PRD: qué toca avisar hoy y con qué texto. **Es interno y one-way** — el PRD §2 excluye del MVP el chatbot conversacional y el agendamiento automático, así que la IA redacta y propone, pero quien envía es una persona.

```
pages/AsistentePage · features/asistente/MensajeModal   revisan y envían
services/asistente.ts                                   ÚNICA puerta a la IA
   ↓ si la función falla, no hay cuota o el plan no lo trae
lib/asistente.ts                                        plantillas deterministas
supabase/functions/asistente/                           Deno + haiku-4-5 / sonnet-5 según la tarea
  index.ts     autorización · módulo · cuota · llamada · bitácora
  modelos.ts   MODELO_POR_TAREA · esfuerzo · tarifas del coste estimado
```

- **La clave de Anthropic nunca está en el frontend.** Cualquier `VITE_*` viaja dentro del bundle. El modelo se llama desde la Edge Function, con la clave como secreto del proyecto:

  ```powershell
  supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
  supabase functions deploy asistente
  supabase functions serve asistente --env-file supabase/functions/.env.local   # local
  ```

  La clave se puso el **2026-09-02**; hasta entonces la función estaba desplegada pero no había llamado nunca al modelo, y todo salía de plantilla.

  La función es el **único** código del repositorio que no pasa por `tsc -b` ni por Vite: corre en Deno y no está en el build. Un error ahí no rompe `npm run build`. Lo que sí la cubre es `npx deno check --node-modules-dir=auto supabase/functions/asistente/index.ts` — úsalo al tocarla, y borra el `deno.lock` que genera (el proyecto no usa tooling de Deno). Hoy pasa limpio, y para que siguiera pasando hubo que agrupar en `parametrosNoDeclaradosPorElSdk()` los dos parámetros que **el SDK fijado (0.68) no declara y la API sí acepta**: `fallbacks` y `output_config`. Dentro del literal de la llamada, TypeScript rechaza la llamada entera y el chequeo deja de servir para nada.
- ⚠️ **DOS clientes de Supabase dentro de la función, y confundirlos es el fallo más grave posible.** `admin` (`service_role`) **solo** valida el JWT y lee `usuarios`: es para saber *quién* llama. Todo lo demás —la cuota, la bitácora, la comprobación del módulo, y las herramientas cuando existan— va con `clienteDeUsuario(jwt)`, que lleva el token de quien llamó y por tanto **aplica la RLS entera**. Con él, una consulta lee exactamente lo que ese usuario lee desde el navegador. Leer datos de negocio con `admin` dejaría el aislamiento multi-inquilino colgando de que ninguna consulta se equivoque de `clinica_id`, veinte veces seguidas. Hasta el módulo se comprueba así a propósito: `clinicas_select` hace imposible mirar el plan de otra clínica.
- **El tope de gasto es una segunda palanca, aparte del módulo** (migración `0038`). `asistente_ia` en `modulos_habilitados` abre la pantalla; el tope paga los tokens, y **en cero no hay nada aunque el módulo esté**. Lo consume `consumir_cuota_ia(p_tarea)` **antes** de llamar al modelo y en una sola sentencia, igual que `consumir_cuota_whatsapp()`. ⚠️ Lleva un `and p.ia_limite_* > 0` que su gemela no necesita: la de WhatsApp tiene `check (>= 1)` en la columna, y sin esa condición aquí la rama del periodo viejo regalaría **una consulta al mes** a un plan con tope cero. La cuota se consume **una vez por pregunta**, no por llamada al modelo: un bucle de herramientas puede llamar tres veces para responder una sola cosa.
  ⚠️ **Son DOS cupos, no uno** (migración `0039`): `ia_limite_redaccion`/`ia_consultas_redaccion`/`ia_periodo_redaccion` para aviso/aviso_interno/informe (Haiku), y `ia_limite_copiloto`/`ia_consultas_copiloto`/`ia_periodo_copiloto` para el copiloto (Sonnet), cada uno con su propio contador y su propio mes. Antes eran un solo `ia_limite` contando cualquier tarea igual, y un aviso (~$0,001) gastaba la misma unidad que una pregunta al copiloto (~$0,017, verificado contra la consola real de Anthropic): un mes con muchos avisos podía dejar sin cupo al copiloto. `consumir_cuota_ia(p_tarea)` decide la rama por `p_tarea = 'copiloto'`, con **dos ramas SQL estáticas**, nunca el nombre de columna interpolado — en una función `security definer` que hace un `UPDATE`, ese patrón es justo lo que el proyecto evita (mismo espíritu que H-1 en `SEGURIDAD.md`, otro riesgo). El punto de partida: copiloto conserva el `ia_limite` de antes (ya validado en ~5 % del plan); redacción es 20× eso, calculado para costar **lo mismo en dólares**, no el mismo número de llamadas, porque un aviso cuesta ~19 veces menos.
- **`ia_uso` es la bitácora del coste**, calcada de `registro_errores`: solo INSERT, lectura solo del superadmin, sin UPDATE ni DELETE. **No guarda la pregunta, ni la respuesta, ni ningún identificador de paciente** — para medir un coste no hacen falta, y lo que no se guarda no se filtra. El coste se estima en el servidor con las tarifas de `modelos.ts`; si llegara del cliente no valdría nada.
  ⚠️ **Esas tarifas estuvieron mal desde que se escribió el fichero**, y nadie lo notó hasta contrastarlas con la tabla de precios vigente: Opus a $15/$75 (precio de una generación vieja) y Sonnet a $3/$15 (precio de Sonnet 4.6, no de Sonnet 5) — el coste mostrado salía 3× y 1,5× más alto que el real. Correctas: Opus 5 $5/$25, Sonnet 5 $2/$10, Haiku 4.5 $1/$5 (esta última ya estaba bien). Vuelve a contrastarlas contra la documentación de Anthropic si las tocas — es fácil arrastrar un precio de memoria y que sea el de otro modelo.
- **El bucle del copiloto cachea dos cosas, no una.** El `cache_control` del bloque del *system prompt* (`orquestador.ts`) cubre lo que no cambia entre vueltas: instrucciones y herramientas. Pero la conversación **sí** crece —cada resultado de herramienta se acumula en `messages`— y sin nada que la cachee, se reenvía entera y a precio completo en cada vuelta. Por eso hay un **segundo** `cache_control` **a nivel superior** de la llamada (`cache_control: { type: 'ephemeral' }`, hermano de `model`/`system`/`messages`), que autocachea el último bloque cacheable de la petición. Con `obtener_resumen_paciente` devolviendo el historial completo de un paciente, esta era la parte que más pesaba en la factura: la vuelta N+1 ahora lee de caché (a la décima parte del precio) todo lo que la vuelta N ya mandó.
- **El modelo y las instrucciones se eligen en el servidor**, en `MODELO_POR_TAREA` e `INSTRUCCIONES_POR_TAREA` de la propia función. Si el cliente pudiera mandar `model`, cualquiera con la clave anónima —que viaja en el bundle— forzaría el más caro de la plataforma.
- **No es un modelo, son dos, según lo que la tarea exige — y el criterio es "decide" contra "redacta", no "texto libre" contra "datos fijos".** Redactar un aviso o reordenar cifras ya calculadas no razona nada — va con `claude-haiku-4-5`. El copiloto sí: decide qué herramienta consultar y en qué orden — va con `claude-sonnet-5`. ⚠️ **Haiku 4.5 rechaza `output_config.effort` con error**, a diferencia de Opus y Sonnet 5; `soportaEffort()` en `modelos.ts` lo comprueba antes de incluirlo, y `parametrosNoDeclaradosPorElSdk()` recibe el modelo por eso. Al añadir una tarea nueva, decide su modelo con el mismo criterio — no copies `claude-opus-5` por costumbre — y si el modelo elegido no soporta `effort`, esa comprobación ya te cubre.
  - **`mensaje_libre` (migración de código, no de SQL) es la prueba de que el criterio es "decide" y no "el texto de entrada es libre".** Es un pedido suelto sin `Programado` detrás — "escríbele a Juan que traiga la muestra mañana" — y aun así va en Haiku: sigue sin decidir nada, solo redacta a partir de una instrucción. Nació porque el cuadro de "Pregúntale a Vetora" era el único sitio donde redactar un mensaje sin aviso pendiente, y eso lo mandaba siempre por el copiloto — Sonnet, ~19× más caro, y gastando el cupo de copiloto (el pequeño) en vez del de redacción (el que es 20× más grande a propósito). El `pedido` viaja en `pregunta` con el mismo tope de 3 a 2000 caracteres que ya tenía el copiloto — es la otra tarea que recibe texto libre de quien pregunta, así que necesita el mismo tope de coste — y se le suma al `contexto` acotado (`clinica`, `dueno`, `paciente`) antes de mandarlo al modelo, nunca al revés: `contexto` no lleva teléfono ni CI, mismo criterio que `contextoDeAviso()`. `services/asistente.ts` expone `redactarMensajeLibre()`, y `RedactarMensajeModal` es su pantalla en `/asistente` — un modal aparte, no una opción dentro de `PreguntaleAVetora`, porque mezclar los dos casos en un cuadro de texto es exactamente lo que llevaba a que un mensaje simple se pagara como una pregunta de negocio.
- **`MAX_TOKENS_POR_TAREA` también es por tarea, no una constante.** El límite de salida no es el mismo en todos los modelos —Haiku 4.5 es más bajo que Opus o Sonnet—, y pasarse de ese límite es un 400, no un recorte silencioso.
- ⚠️ **`fallbacks` tampoco es universal, y eso rompió producción el primer día que el copiloto (Sonnet) y los avisos (Haiku) dejaron de ser Opus.** `betas: ['server-side-fallback-2026-07-01']` + `fallbacks: 'default'` se mandaban sin condición a los cuatro modelos, pero la documentación de Anthropic solo lo describe para Opus 5 y la familia Fable. Hasta el cambio de modelo, todo corría en Opus, así que esta combinación nunca se había probado fuera de ahí — el 500 no era un bug de lógica, era un parámetro que la API rechaza en un modelo donde nunca se había usado. `soportaFallbacks()` en `modelos.ts` lo comprueba antes de incluir tanto el `beta` como `fallbacks`, en **los dos sitios** que llaman al modelo (`index.ts` y el bucle de `orquestador.ts`) — hay que actualizar los dos si algún día se confirma que Sonnet o Haiku lo admiten.
- ⚠️ **El catch general no registraba nada en `ia_uso`.** `jwt` y `perfil` se resolvían dentro del `try`, así que el `catch` no los veía y un fallo real —como el de arriba— no dejaba ningún rastro salvo la consola de la función, que nadie puede leer sin el panel de Supabase (esta CLI ni siquiera tiene `functions logs`). Ahora `jwt`/`perfil`/la tarea/el modelo se declaran **antes** del `try`, y el `catch` registra `resultado: 'error'` si ya se conocía quién llamaba — sin eso, diagnosticar este mismo incidente habría costado mucho más.
- `services/asistente.ts` devuelve `{ texto, origen: 'ia' | 'plantilla' }` y **la interfaz enseña ese origen**: si la función falla, el texto sale de plantilla y no se puede presentar como escrito por la IA. El `motivo` distingue «sin cuota» (429) de «el plan no lo incluye» (403) y de un fallo cualquiera — sin esa diferencia, una clínica que agotó su cupo ve lo mismo que una sin clave y concluye que la IA está rota.
- ⚠️ **`aviso_interno` estuvo roto desde que se escribió.** `redactarAvisoInterno()` mandaba esa tarea y la función solo aceptaba `aviso` e `informe`: devolvía 400, el servicio se lo tragaba y caía a plantilla **siempre**, incluso con la clave puesta. Era mudo, porque la insignia decía «Plantilla del sistema», que es cierto pero por diseño roto y no por falta de configuración. Corregido con instrucciones propias: el equipo no lee lo mismo que el dueño de la mascota.
- ⚠️ **No cortes la IA en `localhost`.** Hubo una guarda `window.location.hostname === 'localhost'` que la apagaba en desarrollo, mientras la cabecera de la función explica cómo probarla ahí con `supabase functions serve`. Las dos cosas no podían ser ciertas: sin la función servida, `invoke` falla y se cae a plantilla igual, que es justo lo que tiene que pasar.
- **Lo que sale hacia Anthropic** está acotado en un solo sitio, `contextoDeAviso()` de [lib/asistente.ts](src/lib/asistente.ts): paciente, especie, nombre de pila del dueño, fecha y procedimiento. No salen el teléfono, el CI, el diagnóstico ni el historial. Si añades un aviso, no amplíes ese contexto por comodidad.
- **La IA no escribe en la base.** `services/programados.ts` deriva los avisos de las citas, las vacunas y las desparasitaciones ya registradas; enviar pasa por `enviarAviso()`, y crear una cita sigue siendo `crearCita()` con sus invariantes.
- Los refuerzos de vacuna y desparasitación **no guardan «ya avisado»**. Un refuerzo pendiente deja de aparecer cuando se registra la dosis nueva o se agenda la cita, no cuando alguien manda el mensaje.

### El copiloto: «Pregúntale a Vetora»

Además de redactar textos, el asistente **responde preguntas sobre el negocio** — «¿qué citas tengo hoy?», «¿qué productos tengo que reponer?», «¿qué pacientes no vienen hace seis meses?». Lo monta [PreguntaleAVetora](src/features/asistente/PreguntaleAVetora.tsx) en las **tres** pantallas del asistente.

```
PreguntaleAVetora → services/asistente.ts  preguntarACopiloto()
                         ↓  tarea: 'copiloto'
supabase/functions/asistente/orquestador.ts   el bucle, tope de 6 vueltas
                         ↓
supabase/functions/asistente/herramientas.ts  la lista blanca
                         ↓  clienteDeUsuario(jwt)  →  PostgREST  →  RLS
```

⚠️ **El modelo no toca la base.** Pide una herramienta, la ejecutamos **nosotros** con el token de quien preguntó, y le devolvemos el resultado. Así una herramienta lee exactamente lo que esa persona lee desde el navegador: **no hay un `where clinica_id` escrito a mano en ninguna**, que es justo lo que no habría que acertar seis veces seguidas.

- **Que la IA no pueda modificar nada no se le pide en el prompt: no tiene el verbo.** Ninguna herramienta escribe, borra ni llama a la red, y un modelo no puede hacer aquello para lo que no tiene herramienta. El prompt lo dice además, pero la garantía es la lista.
- **La estructura de la respuesta no se pide, se garantiza.** Llega como una llamada a la herramienta `responder`, cuyo `input_schema` valida la propia API. Pedir un JSON en el prompt y confiar en que salga bien es lo que produce respuestas que hay que parsear a la defensiva. ⚠️ Por eso el copiloto **no** lleva `output_config.format`: serían dos formas de la misma respuesta compitiendo.
- ⚠️ **Sin plantilla de respaldo, al revés que los avisos.** Ahí, cuando el modelo falla, hay un texto determinista sensato que escribir. Aquí no: inventarse la respuesta a una pregunta abierta es exactamente lo que el copiloto tiene prohibido. Si falla, se dice que falló.
- **La pantalla enseña siempre qué se consultó** (`RespuestaCopiloto.fuentes`, rotulado en [lib/copiloto.ts](src/lib/copiloto.ts)). Sin eso, una recomendación es una afirmación sin respaldo y quien la lee no puede comprobarla.
- **Lo que NO sale hacia el modelo**, con el mismo criterio que `contextoDeAviso()`: `obtener_resumen_paciente` no manda el CI ni el WhatsApp del dueño ni la foto, y solo incluye consultas **cerradas** (`editable = false`) — un borrador es una consulta a medio escribir, y resumirla como hecho clínico sería inventar.
- ⚠️ **Ningún `.or()` con texto del usuario dentro.** `buscar_paciente` hace **dos** consultas y las une en memoria: es el hallazgo H-1 de [SEGURIDAD.md](SEGURIDAD.md), y aquí el término viaja siempre como **valor** de un `ilike`, nunca como sintaxis de filtro.
- **El tope de 6 vueltas es de coste, no de corrección.** Sin él, un modelo confundido encadena llamadas hasta agotar la función. Cuando se agota se explica qué pasó en vez de devolver un error opaco.
- ⚠️ **`puedeUsarCopiloto()` ([lib/personal.ts](src/lib/personal.ts)) tiene que listar los MISMOS roles que `autorizar()` en la Edge Function.** Aquí es decisión de pantalla —no enseñar un formulario que va a devolver 403— y allí es la barrera. Si divergen, o se oculta algo que funciona, o se ofrece algo que falla al pulsar. El `peluquero` queda fuera **por ahora**: las herramientas de hoy son de agenda clínica, pacientes, ventas e inventario. Cuando existan las de peluquería hay que abrirlo **en los dos sitios a la vez**.
- **Añadir una herramienta son tres sitios**, y el que se olvida es el tercero: su esquema y su ejecutor en `herramientas.ts`, y su rótulo en `ETIQUETA_HERRAMIENTA` de `lib/copiloto.ts` — sin él la interfaz enseña el nombre técnico.
- **Los dos cupos se ven en tres sitios, y los tres tienen que estar o ninguno sirve de nada.** `getCuotaIa()` (`services/asistente.ts`) es la única puerta de lectura, calcada de `getCuotaWhatsapp()` y reutilizando su misma `enviadosEsteMes()` (es genérica: contador + periodo, nada específico de WhatsApp). Se muestra en `Topbar.tsx` (`CuotaCopiloto`, ambiente, solo el del copiloto —el de redacción es ~20× más grande a propósito, para que nadie tenga que vigilarlo) y en `PreguntaleAVetora.tsx` (justo donde se decide gastarlo, y bloquea el envío con un mensaje claro en vez de dejar que la petición falle sola). Y se **edita** desde `PlataformaPlanesPage.tsx` — esto faltaba: `ia_limite` (y luego su división en 0039) nunca llegó a `DatosPlan` ni al formulario del plan, así que decir «se ajusta desde Plataforma → Planes» era falso hasta este cambio. Los campos solo aparecen si `asistente_ia` está marcado en el propio formulario: un cupo sin el módulo no sirve de nada.
- **`obtener_resumen_paciente` también trae las recetas** (medicamento, dosis, vía, frecuencia, duración): es la herramienta que responde «¿qué le recetamos y tiene sentido para su peso?». Se decidió **enriquecerla** en vez de crear `obtener_recetas` aparte — la pregunta típica necesita paciente, historial y recetas a la vez, y dos herramientas habrían costado dos vueltas del bucle por una sola respuesta coherente. ⚠️ **No filtra por consulta cerrada, al revés que `ultimas_consultas`**: incluye las recetas de un borrador todavía abierto —es justo ahí donde revisar una dosis antes de firmar sirve de algo— pero cada una lleva `cerrada: boolean` para que el copiloto no la presente como definitiva. Sobre esto, `INSTRUCCIONES_COPILOTO` tiene una regla propia, más concreta que el «no diagnostiques ni recetes» general: puede señalar que una dosis no cuadra con el peso o la especie, nunca decir «aplícale X» como si fuera una orden. Es una verificación para que la revise el veterinario, no una receta.
- ⚠️ **Un modelo más grande no era lo que faltaba aquí.** Antes de esto se evaluó llevar el copiloto a Opus para «investigar farmacología»; el hallazgo fue que Sonnet 5 ya trae ese conocimiento de su entrenamiento — lo que le faltaba era ver las recetas de **ese** paciente, que es una consulta más, no un modelo más caro. Y bajarlo a Haiku, la otra opción evaluada, tampoco: la diferencia de costo con Sonnet es de 2×, no de 15× como con Opus, y el copiloto hace justo el tipo de juicio —elegir herramienta, tratar los resultados como datos y no como órdenes— para el que Haiku no es el modelo adecuado. Antes de subir el nivel de un modelo, revisa primero si el hueco real es de **datos** que la herramienta no trae.
- **El vademécum (`vademecum`, migración 0042) es esa regla aplicada.** No nació por la IA: `recetas.medicamento` y `recetas.dosis` son `text` libre desde 0008, así que «Amoxicilina», «Amoxi 500» y «amoxi clavulánico» conviven como cosas distintas — un problema del recetario, no del copiloto. La segunda razón sí es del copiloto: hoy, cuando dice «esa dosis parece alta», la fuente es su entrenamiento y no hay nada que el veterinario pueda abrir y contrastar. Con el vademécum, la fuente es una fila que escribió la propia clínica.
  - ⚠️ **No cuelga de `productos`, y es deliberado.** `productos` es por **sucursal** (`unique (sucursal_id, sku)` en 0001): el mismo fármaco es una fila distinta en cada sede, y un FK desde una tabla de clínica elegiría una sede arbitraria. Lo que hace falta para pasar de mg/kg a mililitros no es el producto, es la **concentración** (`concentracion_mg` por `unidad_dosificacion`), que es del fármaco y no de dónde se vende. `services/vademecum.ts` es explícito: no manda `clinica_id` en el insert porque el `default auth_clinica_id()` ya lo pone — la lección de 0040/0041.
  - **Escribir es de `admin` y `veterinario`** (`auth_es_clinico()`, `security definer` por el mismo motivo que las cuatro `auth_*` de 0001: lee `usuarios`, que está bajo RLS). **Leer es de todo el personal**, peluquero incluido — saber que un producto no va en gatos le sirve aunque no atienda consultas. `PanelVademecum` oculta los botones de editar/eliminar a quien no puede usarlos, convención de pantalla como el resto: evita ofrecer un formulario que iba a devolver 403.
  - **`consultar_vademecum` es la séptima herramienta del copiloto**, y la única que devuelve criterio clínico escrito por una persona en vez de un dato operativo. `INSTRUCCIONES_COPILOTO` la hace obligatoria antes de comentar cualquier dosis, y le pide decir explícitamente «no está en el vademécum de la clínica» cuando el fármaco no está — para que quien lee distinga lo que la clínica fijó de lo que el modelo sabe de forma general. Sigue sin poder recetar: el rango que devuelve es para que lo revise el veterinario, igual que las recetas de `obtener_resumen_paciente`.
  - **La calculadora de mg/kg → ml vive en `lib/vademecum.ts`, pura y sin red.** `dosisParaPeso()` devuelve `null` cuando falta el dato, nunca cero — un cero se leería como «no le des nada», que es una afirmación, y la verdad es «esta ficha no lo dice». La pantalla la usa para una vista previa mientras se escribe la ficha; el copiloto para convertir el rango en algo administrable cuando ya tiene el peso del paciente.

### La jornada clínica

[JornadaClinica](src/features/asistente/JornadaClinica.tsx) es la **cola de trabajo clínico**: las consultas abiertas que esperan, las citas de hoy y los internados. Existe para cerrar un camino que estaba a ciegas — recepción abre la consulta desde la cita, y el borrador quedaba colgado del paciente sin ninguna pantalla que los enseñara juntos.

La ven **tres roles**, y `veterinarioId` (el prop, no el rol) es lo único que los distingue:

| | veterinario / peluquero ([AsistenteJornadaPage](src/pages/AsistenteJornadaPage.tsx)) | admin (sección «Jornada» de [AsistentePage](src/pages/AsistentePage.tsx)) |
|---|---|---|
| `veterinarioId` | `veterinarioAcotado(usuario) ?? peluqueroAcotado(usuario)` | sin pasar → toda la clínica |
| Rótulos | «Tus citas de hoy» | «Citas de hoy» |
| Columna «Veterinario» | no | sí |

Al admin **no se le acota a propósito**, por lo mismo que en la agenda: coordina la clínica, y en el Plan Consultorio es el único que atiende (`puedeAtender` ya lo cuenta como veterinario), así que «toda la clínica» y «lo suyo» son la misma lista. Los rótulos y la columna se derivan de ese único prop; no hay un segundo que pueda quedar descuadrado. **Recepción no la lleva**: no atiende consultas.

El peluquero comparte la misma pantalla y el mismo componente que el veterinario —no una copia— porque el mecanismo es idéntico: acotar `veterinarioId` a uno mismo. `JornadaClinica` no filtra por `tipo_cita`, así que un veterinario o un admin que también atienda peluquería (migración `0025`, `puedeHacerPeluqueria()` en [lib/personal.ts](src/lib/personal.ts)) ya ve esas citas mezcladas con las suyas, con su propio badge. Lo que sí filtra por tipo es la acción de la fila: una cita `peluqueria` no abre historial clínico (ni en [CitaDetalleModal](src/features/agenda/CitaDetalleModal.tsx) ni en la propia `JornadaClinica`) porque no es una consulta médica.

- **Sin WhatsApp y sin IA, a propósito.** El cupo de mensajes del plan se gasta por un solo lado, el de recepción; y esto es una cola derivada de la base, no un redactor de textos (mismo criterio que [lib/asistentePlataforma.ts](src/lib/asistentePlataforma.ts)).
- **Todo se deriva, igual que `listProgramados`.** Una fila desaparece sola cuando deja de ser cierta: se cerró la consulta, se firmó el consentimiento, se escribió la evolución. No hay nada que marcar como hecho.
- `listConsultasAbiertas()` ([services/historial.ts](src/services/historial.ts)) es lo único que hubo que escribir: `CitaConDetalle.historial_id` dice que hay historial pero no si sigue abierto, y un borrador de ayer sin cerrar tiene que seguir apareciendo. `historial_clinico` **no tiene `sucursal_id`** — la sucursal se resuelve por la cita.
- Las otras dos secciones salen de `listCitas` y `listInternaciones` con el `veterinarioId` que ya aceptan. Para el peluquero quedan naturalmente vacías: nunca tiene historiales ni internaciones a su nombre — da de alta pacientes, pero no abre consultas ni interna (ver el reparto de `RolRoute` más abajo).

## Los módulos de Peluquería y Petshop

Dos paneles propios y completos (13 pantallas cada uno, en `src/pages/peluqueria/` y `src/pages/petshop/`), con su layout aparte del área clínica. Van detrás de `ModuloRoute modulo="peluqueria"` y `modulo="petshop"`, y el admin de un negocio no clínico **aterriza directamente ahí** ([InicioSegunRol](src/components/layout/InicioSegunRol.tsx)) en vez de en la agenda.

⚠️ **Añadir un valor a `ModuloVetora` NO lo hace alcanzable. Hacen falta TRES cosas, y si falta una las pantallas quedan muertas:**

1. **Que algún plan lo traiga** en `planes.modulos_habilitados`.
2. **Que [PlataformaPlanesPage](src/pages/plataforma/PlataformaPlanesPage.tsx) lo ofrezca** en su lista `MODULOS`; si no, el superadmin no puede marcarlo ni en un plan nuevo.
3. La ruta con su `ModuloRoute` y el enlace en el `Sidebar`.

Esto falló dos veces. Con `catalogo` quedó anotado; con `peluqueria` y `petshop` volvió a pasar y **26 pantallas estuvieron construidas y sin ninguna puerta**: `0026` creó los planes «Peluquería» y «PetShop» antes de que existieran los módulos (`0029`/`0030`), esas dos migraciones no tocaron `planes`, y el editor omitía las casillas. `tieneModulo('peluqueria')` era siempre falso y `ModuloRoute` rebotaba a `/agenda`, así que todo negocio veía la interfaz de veterinaria. Lo arregla `0031`.

**El plan manda, aunque venga vacío.** `AuthContext` aplica `modulos_habilitados` tal cual; `MODULOS_VETERINARIA_COMPLETA` es solo el respaldo de cuando **no se pudo leer** el plan (red, RLS, clínica sin plan). Antes la guarda era `.length > 0` sin `else`, así que un plan con `[]` no se aplicaba nunca y dejaba el menú **completo** — al revés de lo que espera quien desmarca todas las casillas.

**`tipo_negocio` no participa en nada de esto.** Es descriptivo: se fija en el panel de plataforma y se enseña como etiqueta en la Tienda del portal, pero ninguna pantalla de la clínica lo consulta. Lo que segmenta el producto es el par **rol + módulo del plan**. Hubo tres comentarios que afirmaban que decidía la interfaz —el `COMMENT` de `0023`, el docstring de `TipoNegocio` y uno en `InicioSegunRol`— y los tres eran falsos; corregidos, porque son la razón de que se esperara que cambiar el tipo de negocio cambiara algo.

### Que el menú diga lo que el negocio es (migración `0032`)

Aunque el módulo ya fuera alcanzable, un petshop seguía viendo un menú de clínica: Agenda, Pacientes, Clientes, Inventario y Servicios, cuatro de ellas **duplicadas dentro de su propio panel**. Lo que faltaba era que esas entradas tuvieran módulo:

- **`fichas`** gatea `/pacientes` y `/clientes` — el mismo fichero visto por los dos lados. Una **peluquería sí lo lleva**: da de alta mascotas para poder agendarles.
- **`servicios`** gatea `/servicios`, cuyo catálogo es de categorías clínicas mientras un petshop cobra por `productos`.
- `inventario` sale del plan PetShop: el POS ya enseña stock y `/petshop/inventario` lleva lotes y vencimientos.

⚠️ **Gatear una ENTRADA DEL MENÚ no es gatear la RUTA, y con `/agenda` la diferencia es crítica.** El campo `modulo` de `EnlaceClinico` solo lo lee `enlacesVisibles`; las rutas se gatean con `ModuloRoute`. `/agenda` **lleva `modulo: 'agenda'` en el menú** (un petshop no lo tiene y no ve el enlace) y su **ruta sigue sin gatear**, porque es el terminal al que se cae cuando nada encaja: gatearla colgaría la aplicación en un bucle de redirecciones.

**El rebote va a la casa del negocio.** `rutaDeInicioSegunModulos()` ([lib/personal.ts](src/lib/personal.ts)) la comparten `InicioSegunRol`, `RolRoute` y `ModuloRoute`, para que entrar y rebotar lleven al mismo sitio. **Comprueba el ROL además del módulo, y no es opcional**: los paneles llevan su propio `RolRoute` —`/petshop/dashboard` no admite `peluquero`—, así que sin esa comprobación un peluquero en un plan de petshop rebotaría allí, sería rechazado, y volvería a rebotar: bucle infinito. Cuando el rol no encaja se cae a `/agenda`, que admite a todo el personal.

**Y Métricas habla del negocio que es.** `MetricasPage` enseñaba «Nuevos Pacientes» y un enlace de stock que apunta a `/inventario` — ruta que un petshop ya no tiene. Cuando hay `petshop` y no `historial_clinico`, pinta [ReporteRentabilidad](src/features/petshop/ReporteRentabilidad.tsx), el mismo componente que `/petshop/reportes`, para que no diverjan. Una veterinaria con petshop integrado sigue viendo las métricas clínicas: ahí el petshop es una sección más, no el negocio.

### El menú del panel **es** el menú principal (migración `0034`)

Gatear las entradas clínicas no bastó: seguía habiendo **dos menús a la vez**. El lateral con lo que quedaba de clínica, y las secciones propias escondidas una capa más abajo, en la barra horizontal que cada layout pintaba dentro de `/peluqueria/*` y `/petshop/*` — para llegar a «Órdenes» o «Proveedores» había que entrar al panel y buscar en un segundo menú.

**`menuDelNegocio(rol, modulos)`** ([enlacesClinicos.ts](src/components/layout/enlacesClinicos.ts)) sustituye a `enlacesVisibles` en `Sidebar` y `MobileNav`: cuando el negocio *es* uno de los dos, el menú lateral son **sus 12 secciones** más las cuatro entradas clínicas que sobreviven. Las listas viven en `enlacesPeluqueria.ts` y `enlacesPetshop.ts` —fuera de sus `*Nav`, por el Fast Refresh— y los dos layouts dejan de pintar su barra cuando esas secciones ya están arriba.

- **El criterio es `panelDelNegocio(modulos)`** ([lib/personal.ts](src/lib/personal.ts)): el módulo **y no** `historial_clinico`, la misma forma que `rutaDeInicioSegunModulos`. Una **veterinaria con peluquería o petshop integrados no cambia** — ahí son una sección más, conservan su entrada única y su barra interna, que es su única navegación.
- ⚠️ **`/caja` sobrevive, y no es opcional.** La caja de los paneles **no abre ni cierra turno**: `PetshopCajaPage` lo dice ella misma («Debes abrir un turno en el módulo de Caja para facturar en el POS»). Quitarla del menú dejaba el POS **sin poder facturar**. Las otras tres supervivientes son Asistente, Respaldo y Catálogo: no son clínicas y no existen dentro de los paneles.
- **La peluquería tiene UNA caja, el petshop dos, y la diferencia es real.** `PeluqueriaCajaPage` era una lista filtrada de órdenes terminadas que tampoco sabía abrir turno —dejaba el botón de cobrar deshabilitado y mandaba «al módulo de Caja»—, y `/caja` ya lista y cobra esas mismas órdenes con más opciones: eran dos entradas para lo mismo y solo una servía. Se borró, `/peluqueria/caja` monta `CajaPage` (la ruta se conserva por los enlaces guardados) y el menú lleva **«Caja»** a secas. El petshop **sí** conserva la suya: `PetshopCajaPage` es otra vista —la recaudación del POS dentro del turno—, así que ahí siguen «Caja General» y «Caja Pet Shop». Lo decide `RENOMBRES_POR_PANEL` en `enlacesClinicos`.

⚠️ **La invariante del cobro de peluquería: `precio_final_bs = precio_estimado_bs + Σ suplementos`.** La escriben `NuevaOrdenModal` y `EvaluacionInicialModal`, y de ella salen la comisión del peluquero y los ingresos del día del panel. `lineasDePeluqueria()` ([services/caja.ts](src/services/caja.ts)) tiene que sumar exactamente eso. Su base era `precio_estimado_bs || precio_final_bs`, y ese `||` **cobraba los suplementos dos veces** cuando el estimado era 0 —un servicio sin precio configurado, o una orden que se valora entera en la evaluación—: caía al final, que ya los incluye, y luego los listaba uno a uno. Una orden de Bs. 50 se cobraba a Bs. 100. Ahora la base se **despeja** (`final − suplementos`, nunca negativa) en vez de caer al final entero.
- ⚠️ **Las secciones llevan `roles`, incluidas las que no lo tenían.** Las 12 del petshop no llevaban ninguno y las de peluquería iban a medias. Sus paneles sí (`['admin','recepcion','veterinario']` y `['admin','recepcion','peluquero']`), así que sin ese suelo un peluquero de un plan mixto vería el POS en su menú y el enlace le rebotaría — el mismo error que `enlacesClinicos` ya documenta para `/internacion`.

### El inventario avanzado es de la clínica, y siempre lo fue

⚠️ **Lotes, proveedores y órdenes de compra NO son del petshop.** Se construyeron ahí, pero `producto_lotes`, `proveedores` y `ordenes_compra` (`0030`) tienen policies por `clinica_id` sin ninguna relación con el módulo del plan, y sus tres pantallas no llevaban una sola referencia a nada de retail. Estaban detrás de `ModuloRoute modulo="petshop"` por accidente de dónde nacieron, y el precio lo pagaba la veterinaria: **no había forma de saber que un fármaco vencía**.

Las tres viven ahora en `features/inventario/` —`PanelLotes`, `PanelProveedores`, `PanelCompras`— y las páginas del petshop son envoltorios finos, mismo patrón que `ReporteRentabilidad`. `/inventario` las monta como **secciones**.

- ⚠️ **Las secciones no son los filtros.** «Todos / Bajo Stock / Agotados» acota la lista de productos y vive **dentro** de la sección «Productos»; las secciones eligen qué se está mirando. Son dos niveles y mezclarlos dejaría un menú donde «Agotados» y «Proveedores» parecen lo mismo.
- **`DatosProducto` ignoraba cinco columnas que `0030` añadió para todos**: `costo_bs`, `codigo_barras`, `marca`, `proveedor_id` y `requiere_lote`. Sin el costo la clínica no podía ver su margen en ninguna pantalla; sin el código de barras no había nada que escanear. Todas opcionales — el alta rápida de un fármaco sigue siendo nombre, precio y presentación. **El costo es interno y no viaja a la vitrina del portal** (`publicarProductoEnTienda` copia solo el precio de venta), y `productos_all` tampoco lo deja leer a un cliente —exige `auth_es_admin()` o coincidir de sucursal, y una cuenta de portal no tiene ninguna—. ⚠️ **Pero `producto_lotes.costo_unitario_bs` sí se le escapa:** su policy de lectura (`0030`) es `using (clinica_id = auth_clinica_id())` para `authenticated`, **sin `auth_es_personal()`**, y un cliente del portal tiene `clinica_id`. Lo mismo pasa con `proveedores`, `ordenes_compra`, `orden_compra_detalles`, `petshop_devoluciones`, `petshop_promociones` y `petshop_configuracion`: las seis de `0030` se leen desde cualquier cuenta autenticada de esa clínica. Las policies de `0001` no tienen ese defecto porque llevan `auth_es_personal()` en las dos cláusulas.
- **`exigirSkuLibre()`** ([services/inventario.ts](src/services/inventario.ts)) se exporta porque `crearProductoPetshop` **no validaba el SKU**: insertaba a pelo y el `unique (sucursal_id, sku)` reventaba con un `23505` crudo.

⚠️ **`registrarVentaDirecta` y `procesarVentaPOS` NO se fusionan.** Parecen la misma función —las dos exigen turno abierto y crean un `cobro`— pero **usan la cantidad al revés**: la del POS la trata como **envases** (`dosisDesdeEnvases(item.cantidad, …)`) y la de la clínica como **unidad de medida**, porque una veterinaria vende 5 ml de un frasco de 50. Sustituir una por la otra descuadraría el stock de toda venta fraccionada.

En el mismo modal de venta: escanear el código de barras (coincidencia **exacta** con `codigo_barras` o `sku`, y una sola — un SKU corto puede ser prefijo de otro, y añadir el producto equivocado a un cobro es peor que no añadir ninguno) y un badge «LOTE VENCIDO». Y se corrigió su tope de cantidad, que era `stock_actual` —**envases**— sobre una cantidad expresada en ml: de un frasco de 50 ml con 3 envases solo dejaba vender 3 ml. Ahora es `dosisDisponible(p)`.

El Asistente suma `productos_vencidos` y `lotes_por_vencer` a `resumenDelDia`, en rojo y aparte del stock bajo: que queden dos unidades es un aviso de compra; que esté caducado es algo que no se puede aplicar.

**El Asistente se reparte también por negocio**, no solo por rol ([AsistenteSegunRol](src/components/layout/AsistenteSegunRol.tsx)):

- **Petshop → [AsistentePetshopPage](src/pages/AsistentePetshopPage.tsx), para todos los roles.** Las otras dos derivan todo de pacientes, citas e historiales, y un petshop no tiene nada de eso: le habrían dejado una pantalla con todas las cifras en cero. Lo suyo es qué reponer —`getSugerenciasReposicion()`, que ya trae proveedor y cantidad— y qué lotes vencen. **El pedido al proveedor es `enlaceWhatsapp()`, nunca `enviarMensajeWhatsapp()`**: la cuota del plan es para avisos a clientes, y una orden de compra es logística interna. `0034` le da `asistente_ia` al plan, que nunca lo tuvo.
- **Peluquería → `AsistentePage` adaptada.** No cambia de dónde salen los avisos —`listProgramados` se adapta sola: los refuerzos de vacuna, las desparasitaciones y los seguimientos derivan de tablas que no llena— pero sí lo que la pantalla dice: fuera «Vencidos», «Sin consentimiento», la pestaña «Prevención» y la sección «Jornada» (que sería su Dashboard otra vez, con dos tablas vacías al lado). Le quedan citas, cumpleaños, atenciones sin cobrar y clientes que no vuelven.

## El catálogo y la Tienda

`/catalogo` (migración `0027`) es la vitrina comercial de la clínica —veterinaria, peluquería o petshop, sin distinción por `tipo_negocio`—, y la Tienda es su reverso: una sección del portal del cliente donde el dueño de mascota ve catálogos de **cualquier** clínica activa con el módulo, no solo la suya. Es la primera vez que el sistema expone, a propósito, datos de una clínica a alguien que no es su cliente — todo lo demás del portal está acotado por `clientes.usuario_id = auth.uid()`.

- **`catalogo_productos` no es `productos`.** Ese es kardex por sucursal (sku, presentación, stock fraccionado), sin foto ni descripción, y el rol `cliente` no tiene ningún acceso ahí a propósito. `catalogo_productos` es a nivel de **clínica**, sin stock: un escaparate, no inventario.
- **Gating comercial por `ModuloVetora`, como el resto** — `/catalogo` va detrás de `ModuloRoute modulo="catalogo"`, solo para `admin` (mismo criterio que `/servicios`: fija precios públicos del negocio). Pero la policy de lectura pública (`catalogo_productos_portal`) es **la única del proyecto que mira `modulos_habilitados`**: si el plan pierde el módulo, sus productos desaparecen de la Tienda sin que nadie los borre — es la única tabla cuyo propósito entero es mostrarse a quien no es de la clínica.
- **`clinicas_con_catalogo()`** es una función `security definer`, mismo patrón que `clinicas_para_registro()` (registro público, §Sesión y acceso): `clinicas_select` (`id = auth_clinica_id() or auth_es_plataforma()`) no deja leer la fila de otra clínica, ni siquiera incrustada en un `select('*, clinicas(...)')`. La función expone solo las columnas seguras (`nombre`, `logo_url`, `ciudad`, `tipo_negocio`, `whatsapp`) — nunca `responsable`, cuota de WhatsApp, estado de pago ni plan contratado. `grant execute` va a `authenticated`, no a `anon`: la Tienda solo se ve con sesión iniciada en el portal. ⚠️ **Esa frase describía la intención, no lo que estaba desplegado — corregido en `0047`.** Durante meses `clinicas_con_catalogo` respondió **HTTP 200 con datos** a la clave anónima sin sesión, y lo mismo `clinicas_con_peluqueria` y `servicios_peluqueria_de`: se exponían nombre, logo, ciudad y **WhatsApp** de cada clínica con el módulo, a todo internet.

**La causa, que hay que entender porque afecta a cualquier función futura: son DOS vías, no una.** La primera es el grant explícito a `anon` (`anon=X` en el ACL). La segunda —la que de verdad estaba abierta— es el **pseudo-rol `PUBLIC`**: toda función recién creada concede `execute` a `PUBLIC` por defecto, y **todo rol es miembro de `PUBLIC`**, `anon` incluido. En el ACL se ve como una entrada con el beneficiario vacío:

```
=X/postgres | postgres=X/postgres | authenticated=X/postgres | …
^^^^^^^^^^^ esto es PUBLIC
```

El primer intento de `0047` solo revocaba de `anon` y **no cambió nada**: la llamada seguía devolviendo 200 porque el permiso llegaba por `PUBLIC`. Hay que revocar de los dos. ⚠️ Y `create or replace function` **preserva** el ACL, pero un `drop` + `create` lo reinicia al valor por defecto y vuelve a abrir `PUBLIC` en silencio: si recreas una de estas tres, revoca otra vez.

`clinicas_para_registro()` es la excepción y sigue siendo pública a propósito — la llama `/registro-cliente` antes de que exista ninguna sesión.
- **Fotos: bucket `catalogo`, `public: true`** — el primero público del repo (`estudios` y `comprobantes` son privados con URL firmada de una hora, que no sirve para un grid cacheable). Se sirve con `getPublicUrl()`.
- **WhatsApp: `enlaceWhatsapp()`, nunca `enviarMensajeWhatsapp()`.** El botón «Consultar por WhatsApp» de un producto es un link `wa.me` puro hacia `clinicas.whatsapp`, compuesto en el cliente sin tocar Supabase. `enviarMensajeWhatsapp` gasta la cuota mensual del plan (pensada para avisos que decide mandar el personal) — una consulta que decide un comprador no puede salir de esa misma cuota.
- Borrar una clínica (`eliminar-clinica`, más abajo) también vacía el bucket `catalogo`, igual que `estudios`/`comprobantes`; y `PlataformaPlanesPage` necesita `'catalogo'` en su lista de checkboxes para que el superadmin pueda activarlo en algún plan — ninguna de las dos cosas es automática por el solo hecho de que el tipo `ModuloVetora` tenga el valor nuevo.

⚠️ **Y la Tienda estuvo vacía para todo el mundo desde `0027` hasta `0033`, por la misma trampa de los tres eslabones — esta vez el primero.** `catalogo` tenía su casilla y su ruta, pero **ningún plan lo traía**: no había un solo `update planes` con ese valor, y `0026` creó «Peluquería» y «PetShop» con un array explícito sin él. Como las **dos** puertas de la Tienda miran `modulos_habilitados` —la policy y `clinicas_con_catalogo()`—, la función devolvía cero filas y `/catalogo` rebotaba, así que ningún admin había podido publicar nunca nada. Lo arregla `0033`, que se lo da a **todos** los planes: es un escaparate donde el dueño «elige la tienda que desee», y con una sola clínica publicando no hay entre qué elegir.

### `/catalogo` **es el inventario**, no una lista aparte

`catalogo_productos.producto_id` (`0033`) dice de qué producto del kardex salió una ficha —null en las escritas a mano—, y con eso `/catalogo` deja de ser una lista propia: `listArticulosDeCatalogo()` ([services/catalogo.ts](src/services/catalogo.ts)) parte de `productos` y le cuelga a cada uno su ficha de vitrina si la tiene. Lo único que se decide ahí es **cuáles se venden**, con `publicarProductoEnTienda()`.

Era una lista aparte, y publicar significaba volver a escribir un producto que ya estaba en el POS: nombre, categoría y precio otra vez, y a partir de ahí dos precios que se separaban solos. Las fichas sin `producto_id` siguen existiendo —las de antes, y las de algo que se vende sin llevarle stock— y se pintan en su propia sección, «Productos sueltos».

- **La vitrina es lo único editable de un artículo del inventario.** `CatalogoProductoModal` tiene dos formas: para una ficha vinculada enseña nombre, categoría y precio **deshabilitados** (se cambian en el inventario) y deja la foto y la descripción; para una suelta se escribe todo. Si el precio se pudiera tocar en los dos sitios, el de la Tienda se separaría del que se cobra en el mostrador — y el trigger lo pisaría al siguiente cambio, sin avisar.
- **Publicar es un acto explícito del admin: la Tienda nunca refleja el kardex entero.** Se copian nombre, categoría (el rótulo en español) y precio de **venta**; el costo, el stock, el sku y los lotes no salen. La pantalla entera es de `admin` por `RolRoute`, igual que `/servicios`.
- **No hay un segundo sitio donde publicar.** Hubo un botón «Publicar en la Tienda» en la pantalla de Productos del petshop; se quitó al mover la decisión aquí. El panel del petshop enlaza a `/catalogo` desde su propia barra (`PetshopNav`), que sí necesita el módulo y el rol porque la ruta los exige.
- **El precio lo mantiene un trigger, no el servicio.** `trg_sincronizar_precio_catalogo` (`security definer`, acotado a esa única columna de la fila vinculada). Se intentó primero desde `actualizarProductoPetshop` y no cubre el caso: un `update` lanzado por `recepcion` —que sí edita productos— no afecta ninguna fila de `catalogo_productos` y **no da error**, así que el precio público se quedaba viejo en silencio. Sincroniza solo el precio: el nombre y la descripción de la vitrina son del escaparate y el admin los reescribe para que vendan.
- **Los rótulos de `categoria_retail` viven en [lib/retail.ts](src/lib/retail.ts)**, no en `services/petshop.ts` de donde salieron: los necesitan dos servicios, y con el mapa dentro de uno se importaban en círculo. `CATEGORIAS_RETAIL` se **deriva** del mapa — eran dos listas paralelas y ya habían divergido.
- **La Tienda se recorre por producto además de por tienda.** `buscarProductosEnTiendas()` ([services/tienda.ts](src/services/tienda.ts)) busca en los catálogos de todas a la vez; no hace falta RPC ni policy nueva porque `catalogo_productos_portal` ya autoriza leer sin filtrar por clínica. El nombre y el WhatsApp de cada tienda se cruzan en el cliente con `listClinicasConCatalogo()`, que es lo único que puede darlos.

### La misma vitrina para los servicios de peluquería (migración `0035`)

La tarjeta «Agendar Peluquería» del portal apuntaba a `/portal-cliente/tienda` —copiada de la de al lado—, así que su botón «Programar Cita» abría la Tienda de productos. Ahora lleva a `/portal-cliente/peluqueria`, gemela de la Tienda: cualquier peluquería activa de la plataforma, con sus servicios y precios.

- **Son dos funciones y no dos policies, y ese es el punto.** `servicios_select` (0004) es `clinica_id = auth_clinica_id() and auth_es_personal()`: una cuenta `cliente` **no puede leer `servicios` ni de su propia clínica**. `clinicas_con_peluqueria()` y `servicios_peluqueria_de(uuid)` son `security definer`, mismo patrón que `clinicas_con_catalogo()`. Una policy de fila no habría servido: lo que hay que ocultar son **columnas** —`comision_tipo`, `comision_valor`, `reglas_precio` y los insumos— dentro de filas que sí se pueden ver.
- **Solicitar no es agendar.** El PRD §2 deja el agendamiento automático fuera del MVP: el dueño elige mascota, servicio y día, y sale un `enlaceWhatsapp()` — `wa.me` puro, sin cuota, mismo criterio que el botón del catálogo. Quien agenda sigue siendo una persona. **No se abre ningún INSERT de `citas` para el rol `cliente`.**
- `left join` con `peluqueria_servicios_config`: es opcional, y con un `join` normal un servicio sin configurar desaparecía del escaparate sin motivo visible.

### «Citas» del portal mezcla tres orígenes

`getNotificacionesPortal()` ([services/portalCliente.ts](src/services/portalCliente.ts)) leía `citas` y `vacunas_aplicadas`. Le faltaba lo importante:

- **La peluquería no agenda en `citas`.** Su agenda lee `peluqueria_ordenes`, y la casilla que además crea la cita (`crearCitaSimultanea` en `NuevaOrdenModal`) **viene desmarcada por defecto**: el dueño no veía ni una sola de sus citas de peluquería. Ahora también se leen las órdenes —la policy `peluqueria_ordenes_portal` de `0029` ya lo permitía—, saltándose las que llevan `cita_id` para no duplicarlas, y una ya recibida va a un grupo propio, «Ahora mismo»: «lista para recoger» no es una cita de un día, es ahora.
- **El rótulo sale de `TIPO_LABEL`**, no de un ternario sobre `tipo_cita === 'vacuna'` que hacía decir «Cita Veterinaria» a los otros cinco tipos.
- ⚠️ **Se ordena por `instanteDeNotificacion()`, el mismo valor que se pinta.** Antes se ordenaba por la fecha cruda y se dibujaba por la normalizada: `fecha_refuerzo` es una columna `date` y `new Date('2026-08-20')` es medianoche **UTC**, o sea las 20:00 del día 19 en La Paz, mientras la pantalla la escribía con `desdeFechaSola` (mediodía UTC). Doce horas de desfase entre la clave de orden y lo que se lee. **El fallo era estrecho** —solo se notaba con una cita entre las 20:00 y las 08:00— pero ordenar por una cosa y enseñar otra no se sostiene: la normalización vive ahora en el servicio y la usan los dos.
- **Sigue acotado a la clínica del dueño**, como todo el portal. Si pide cita en otra peluquería de la plataforma, esa cita vive en la clínica de ella y no aparece aquí: la cuenta del portal pertenece a una clínica.

## Aislamiento multi-inquilino

**El aislamiento lo garantiza la RLS de PostgreSQL, y solo ella.** No hay ninguna barrera en el cliente: los servicios consultan sin filtrar por clínica porque la policy añade el predicado. Si una policy falta o está mal, no hay una segunda red debajo.

Todo cuelga de cuatro funciones `SECURITY DEFINER` ([0001_init.sql:483-498](supabase/migrations/0001_init.sql#L483)):

| Función | Devuelve |
|---|---|
| `auth_clinica_id()` | la clínica del usuario de `auth.uid()` — el inquilino |
| `auth_sucursal_id()` | su sucursal asignada, o null |
| `auth_es_admin()` | si su rol es `admin` |
| `auth_es_plataforma()` | si su rol es `superadmin` |

Son `SECURITY DEFINER` porque leen `usuarios`, que a su vez está bajo RLS: sin eso la policy se llamaría a sí misma. Cualquier cambio ahí se propaga a las 35 policies a la vez.

`planes` es global (`using (true)` en SELECT): cada clínica necesita leer sus propios límites, pero solo la plataforma pone precios.

El `superadmin` tiene `clinica_id = null`: administra clínicas, planes y cobros de suscripción, y **no puede ver datos clínicos de ningún inquilino**. Eso sale gratis porque `auth_clinica_id()` es null y `clinica_id = null` da null, que las policies tratan como falso. **No lo sustituyas por excepciones explícitas** del tipo `or auth_es_plataforma()` en policies de negocio: eso es precisamente lo que abriría el acceso lateral que hoy no existe.

Hay una tercera cara de esto: el rol `cliente` del portal ([migración 0004](supabase/migrations/0004_portal_cliente.sql)). Tener `clinica_id` ya no basta para el CRUD clínico — `auth_es_personal()` (`rol in ('admin','veterinario','recepcion')`) es lo que separa las policies de negocio (`clientes_personal`, `pacientes_personal`, …) de las de solo-lectura del portal (`clientes.usuario_id = auth.uid()` y sus joins hacia pacientes/citas/historial cerrado/vacunas/recetas). Si añades una tabla al expediente clínico, replica el patrón — policy de personal aparte de policy de portal — en vez de reabrir un `for all` a solo `clinica_id`; eso fue justo lo que este rol tuvo que esperar hasta tener policies propias antes de existir en la base. El alta de una cuenta de portal es pública: `/registro-cliente` llama a `clinicas_para_registro()`, `security definer`, que expone únicamente `id` y `nombre` de clínicas no suspendidas — ampliar ese `select` es ampliar lo que ve todo internet sin sesión.

⚠️ **`clientes` es la excepción: desde `0036` ya no tiene un solo `for all`.** Se parte en select / insert / update para el personal, y el DELETE va aparte. `pacientes.cliente_id` es `on delete cascade` y desde `pacientes` cascadean **doce** tablas —historial, citas, vacunas, desparasitaciones, internaciones, consentimientos, recetas, informes, estudios y las tres de peluquería—, así que borrar un dueño con mascotas destruiría el expediente médico entero de cada una.

⚠️ **Esa condición NO puede vivir dentro de la policy, y `0036` se estrelló ahí.** Puso `not exists (select 1 from pacientes …)` en el `using` del DELETE, y esa subconsulta cierra un ciclo: `clientes` (delete) → `pacientes` (select) → `pacientes_portal`, que consulta `clientes`. PostgreSQL aborta con `42P17`, «infinite recursion detected in policy», y PostgREST lo devuelve como un **500**: borrar fallaba siempre, con mascotas y sin ellas. **Es la misma trampa que estas cuatro funciones `auth_*` evitan siendo `SECURITY DEFINER`** — una policy no puede consultar libremente otra tabla con RLS.

`0037` lo corrige: la policy se queda con el inquilino y el rol, y la invariante baja a **`trg_cliente_sin_expediente`**, `security definer` —lo que rompe el ciclo *y* garantiza que la comprobación vea todas las mascotas, no las que la RLS del que llama deje ver—. Es como se protege el resto (`trg_historial_inmutable`, `trg_internacion_inmutable`), y además dice **cuántas** mascotas hay en vez de filtrar la fila en silencio. ⚠️ Lleva una salida para `eliminar-clinica`: **una cascada sí dispara los triggers de la tabla hija**, así que sin comprobar primero que la fila de `clinicas` siga existiendo, dar de baja a un cliente de la plataforma se volvía imposible.

Ninguna de las dos barreras **mira el rol, y es deliberado**. El botón de `/clientes` es solo del `admin` —convención de pantalla, como `veterinarioAcotado`— pero dos caminos legítimos borran fichas **vacías** corriendo como `recepcion`, y exigir `auth_es_admin()` los rompería: `vincular_cuenta_portal()` (`0028`), que hace `delete from clientes` y **no es `security definer` a propósito**, y el rollback de `registrarClienteYPaciente` cuando el `insert` del paciente falla. `eliminarCliente()` ([services/clientesPacientes.ts](src/services/clientesPacientes.ts)) comprueba antes las mascotas, las órdenes de peluquería y la cuenta del portal —que se quedaría sin ninguna ficha, el agujero que `0028` tapó— como aviso temprano, igual que `registrarMovimiento` con «Stock insuficiente».

## Capas

```
pages/          rutas (App.tsx las cablea) — orquestan, no contienen reglas
features/       modales y formularios por dominio (agenda, pacientes, inventario, internacion, plataforma, asistente)
components/ui/  primitivas (Button, Card, Badge, Modal, Field, ConfirmDialog, Seccion, Tabla)
components/layout/  AppLayout, PlataformaLayout, Sidebar, Topbar, PanelLateral, MobileNav,
                    ProtectedRoute, RolRoute, InicioSegunRol
services/       TODAS las reglas de negocio; devuelven los tipos de types/views.ts
hooks/          usePlanActivo / useMultiSucursal (puertas según el plan), useMediaQuery / useEsEscritorio
lib/            helpers puros: datetime, currency, numeros, agenda, citas, anamnesis, paciente,
                internacion, whatsapp (enlace wa.me), asistente (plantillas),
                supabase (cliente) + exportacion/importacion (respaldo, ver abajo)
types/          database.ts (filas = SQL), views.ts (formas compuestas = joins),
                supabase.ts (generado desde la base real)
mocks/          useDb.ts — mal ubicado: ya no es un mock, es la suscripción realtime.
                db.ts y seed.ts están vacíos a propósito (residuo de la migración desde mocks)
```

### Patrón de datos en las páginas

Los servicios son asíncronos y devuelven vistas ya compuestas; `useTable` aporta la reactividad. Las páginas combinan las dos cosas:

```tsx
useTable('citas')                    // suscripción realtime: re-render cuando cambia la tabla
const [citas, setCitas] = useState([])
async function recargar() { setCitas(await listCitas(sucursalId)) }
useEffect(() => { recargar() }, [sucursalActivaId])
```

`useTable` ([src/mocks/useDb.ts](src/mocks/useDb.ts)) mantiene **una sola suscripción y una sola consulta por tabla, compartidas por toda la aplicación**, sobre `useSyncExternalStore`. Dos detalles que no son negociables:

- `supabase.channel(topico)` **reutiliza** el canal que ya exista con ese nombre, y un canal ya suscrito rechaza nuevos `.on()`. Por eso el tópico es único por tabla y el registro vive a nivel de módulo: con un canal por componente, el segundo en montarse reventaba.
- `getSnapshot` devuelve una **referencia estable**; devolver un array nuevo en cada lectura es un bucle infinito de render.

Hace `select('*')` sin filtro y delega el filtrado a la RLS. Es correcto en aislamiento, pero se trae la tabla entera del inquilino y la recarga ante cualquier cambio: sirve para catálogos acotados (`sucursales`, `usuarios`, `servicios`, `productos`), no para tablas que crecen sin techo (`citas`, `historial_clinico`, `movimientos_inventario`). Para esas, consulta con rango explícito desde un servicio.

Los modales reciben `onGuardado` y llaman a `recargar()` del padre.

**Una suscripción `postgres_changes` fuera de `useTable`** —como la de `PlanesModal.tsx` (el modal público de precios) y `PlataformaPlanesPage.tsx`, que se suscriben directo a `planes` porque una vive sin sesión y la otra necesita reaccionar también a `configuracion_plataforma`— necesita algo que `useTable` no expone porque nunca hizo falta: **la tabla tiene que estar en la publicación `supabase_realtime`**, y eso es una migración aparte (`alter publication supabase_realtime add table …`), no una policy ni un grant. Sin ella, `.subscribe()` conecta sin lanzar ningún error y sencillamente no llega ningún evento — indistinguible de "no se actualiza" para quien lo prueba, porque no hay ni un mensaje en consola que lo delate. `0043_planes_realtime.sql` es esa migración para `planes` y `configuracion_plataforma`; si añades una suscripción de este tipo sobre una tabla nueva, replica el patrón (una migración `alter publication`, y el callback de `.subscribe((estado) => …)` avisando en consola si `CHANNEL_ERROR`/`TIMED_OUT`) y no des por hecho que "ya está en tiempo real" solo porque el código de la suscripción compila.

## Invariantes que no se negocian

Cada una tiene su barrera en el SQL y su réplica en un servicio; si escribes código que las esquiva, está mal aunque compile.

| Regla | SQL | Réplica en el servicio |
|---|---|---|
| Historial cerrado es inmutable (HU-02) — **salvo por cascada, ver abajo** | policy `historial_update` + `trg_historial_inmutable` | `exigirBorrador()` en [services/historial.ts](src/services/historial.ts) |
| Stock nunca negativo (HU-03) | `check (stock_actual >= 0)` **y** `trg_aplicar_movimiento_inventario` (`security definer` desde 0002), que ajusta el stock al insertar el movimiento | `registrarMovimiento` lanza `'Stock insuficiente'` como aviso temprano; la barrera real es el trigger — no reintroduzcas un ajuste manual de `stock_actual` ahí, ya se hizo y descontaba doble |
| Consentimientos, cobros y notas de internación: solo INSERT — **salvo por cascada, ver abajo** | policies sin UPDATE/DELETE | servicios que solo insertan |
| El esquema sanitario **no** está en ese grupo: se corrige | `vacunas_update/delete` y sus gemelas de desparasitación (0014), con `auth_es_personal()` en las cuatro cláusulas | [services/esquemaSanitario.ts](src/services/esquemaSanitario.ts) |
| Internación congelada tras el alta | `trg_internacion_inmutable` | [services/internacion.ts](src/services/internacion.ts) |
| Un veterinario sin citas solapadas (bloques de 30 min) | `exclude using gist` | [lib/agenda.ts](src/lib/agenda.ts) (`SLOT_MINUTOS`, franjas mañana/tarde) |
| Tope **mensual** de WhatsApp por plan | `consumir_cuota_whatsapp()` comprueba y consume en una sola sentencia | `enviarMensajeWhatsapp` la invoca; **todo aviso a un cliente** pasa por ahí |
| Precios congelados en `cobro_lineas` e `internaciones.precio_dia_bs` | columnas persistidas | los servicios copian el precio, no lo recalculan |

⚠️ **Dos de esas invariantes se vencen borrando al PADRE, y hoy nada lo impide en la API.** `pacientes_personal` es `for all` para todo el personal, y desde `pacientes` cascadean doce tablas: `citas` → `cobros` → `cobro_lineas`, e `internaciones` → `cobros`. **Las cascadas de clave foránea no evalúan la RLS ni disparan los triggers `before update`**, así que un `DELETE /rest/v1/pacientes?id=eq.X` se lleva por delante el historial cerrado (el trigger es `before update`, no salta) y cobros ya contabilizados en un turno arqueado (`cobros` no tiene policy de UPDATE ni DELETE, y da igual). El arqueo firmado deja de cuadrar retroactivamente y no queda rastro de qué se borró.

`eliminarPaciente()` ([services/clientesPacientes.ts](src/services/clientesPacientes.ts)) comprueba los cobros antes y aborta — pero **es una guarda de servicio, no una barrera**: quien llama a PostgREST directamente no pasa por ahí. La invariante no estará cerrada hasta que baje a un trigger `before delete` sobre `pacientes`, con la misma salida para `eliminar-clinica` que ya lleva `trg_cliente_sin_expediente` (una cascada sí dispara los triggers de la tabla hija).

Además:

- **El esquema sanitario vive fuera de la consulta** (migración 0014). `vacunas_aplicadas` y `desparasitaciones_aplicadas` tienen `historial_id` **nullable**: se registran desde la pestaña «Esquema Sanitario» de la ficha del paciente ([features/pacientes/EsquemaSanitario.tsx](src/features/pacientes/EsquemaSanitario.tsx)), con la fecha de aplicación como campo — casi todo lo que se carga por primera vez es historial previo, con fecha pasada. Las filas anteriores conservan su `historial_id`, así que el historial impreso de una consulta antigua sigue mostrando lo que se aplicó ese día. No las reintroduzcas en `SeccionesConsulta`: tenerlas en dos sitios obliga a elegir uno como el bueno.
- **Moneda: dos, y no se mezclan.** Todo lo de la clínica —consultas, productos, caja, recibos— va en bolivianos con `formatBs()` de [lib/currency.ts](src/lib/currency.ts) (`Bs. 0.00`): quien paga ahí es un dueño de mascota en Bolivia.

  **La suscripción a la plataforma es la única excepción y va en dólares** (`planes.precio_mensual_usd`, `clinicas.precio_acordado_usd`, migración 0019), porque lo que sostiene el servicio —dominio, Supabase, Vercel— se paga en dólares y sus tarifas se mueven. Se enseña con `formatUsd()` y se convierte con `usdABs()` al cambio de `configuracion_plataforma.tipo_cambio_usd`, tabla de **una sola fila** por construcción (`id boolean primary key check (id)`) que edita el superadmin en Plataforma → Planes. Las cuatro pantallas de plataforma enseñan **el dólar como precio y el boliviano debajo**: es lo que la clínica transfiere, pero la cifra que manda es la de arriba.

  `formatBs` y `formatUsd` son dos funciones a propósito. Una sola con un parámetro de moneda es exactamente cómo se acaba imprimiendo `Bs.` sobre un importe en dólares el día que alguien olvida pasarlo.

  **Cómo se cobra esa suscripción (migración 0020): sin pasarela.** El admin abre la pestaña **Facturación** de su panel de cuenta —[PanelFacturacion](src/features/facturacion/PanelFacturacion.tsx), dentro de [PerfilModal](src/features/auth/PerfilModal.tsx)—, elige 1, 3, 6 o 12 meses, escanea el QR del dueño de la plataforma —que vive en `configuracion_plataforma.qr_pago`, junto al tipo de cambio, y se sube en Plataforma → Planes— y sube la **foto del comprobante**. Eso inserta un `pagos_suscripcion`, que aparece en el asistente del superadmin como tarea `comprobante_pendiente`; él lo mira en [ComprobanteModal](src/features/plataforma/ComprobanteModal.tsx) y aprueba o rechaza.

  **No tiene ruta propia ni entrada de menú, a propósito**: pagar la suscripción es una gestión de la cuenta, no del trabajo del día, y en el menú lateral quedaba mezclada con la agenda y el inventario. La pestaña solo se dibuja para el `admin` — `PerfilModal` sigue siendo el modal estrecho de siempre para el veterinario y para recepción.

  Tres cosas que no se negocian ahí:

  - **La clínica solo INSERTA.** `pagos_clinica_insert` exige `estado = 'pendiente'` y los campos de revisión en null: sin ese `with check`, el admin enviaba el comprobante ya aprobado. No hay policy de UPDATE ni DELETE para la clínica — un comprobante enviado no se retira, se rechaza con un motivo que ella lee.
  - **`aprobarPago()` vive en [services/plataforma.ts](src/services/plataforma.ts)**, no en `facturacion.ts`, porque hace dos cosas —marcar el pago y correr `proximo_cobro`— bajo las dos policies de superadmin. Lleva `.eq('estado','pendiente')` para que un doble clic no regale un mes.
  - **`pagos_suscripcion` sí lleva `auth_es_plataforma()` en sus policies, y no contradice la regla de más abajo**: esa prohíbe abrirle al superadmin las tablas **clínicas**. Esta es del dominio de la plataforma, como `clinicas` y `planes` desde `0001` — es el cobro que la plataforma le hace a su cliente, no el dato de un paciente. No lo uses como precedente para lo otro.

  Una clínica **suspendida no puede entrar y por tanto no puede pagar desde aquí**: eso es a propósito y se resuelve hablando con el dueño de la plataforma. Facturación sirve al estado **`en_mora`**, que es el previo. Dejar entrar a un admin suspendido convertiría la suspensión en fachada, porque hoy no está en la RLS: su JWT seguiría leyendo su clínica entera desde PostgREST.
- **Tiempo:** siempre los helpers de [lib/datetime.ts](src/lib/datetime.ts) (`America/La_Paz`). Nunca `toLocaleString` ni `new Date().getHours()` sobre una fecha de negocio: el navegador puede estar en otra zona.
- **Límites del plan:** se consultan por sus **números** (`max_sucursales`, `max_usuarios`, `whatsapp_limite`), nunca por el nombre del plan — el dueño de la plataforma crea planes desde el panel. `limitesDe()` en [services/plataforma.ts](src/services/plataforma.ts) es la fuente única para validar y para mostrar.
- **WhatsApp no es una API.** [lib/whatsapp.ts](src/lib/whatsapp.ts) compone un enlace `wa.me` y **lo envía una persona** desde su propio teléfono; no hay token, ni webhook, ni coste por mensaje. El `whatsapp_limite` es una palanca comercial, no la repercusión de una factura.

  El tope se consume en la base con `consumir_cuota_whatsapp()`: comprobar y sumar son la misma sentencia, porque hacerlo en tres viajes desde el navegador deja pasar dos pestañas con la cuota al límite. Es `security definer` **a propósito y acotado** — dar al admin una policy de UPDATE sobre `clinicas` le permitiría cambiarse `plan_id` y `precio_acordado_usd`.

  El contador **no se reinicia a medianoche**: lo reinicia el primer envío de cada mes, comparando `whatsapp_periodo`. Por eso quien lo muestre debe leer las dos columnas — `enviadosEsteMes()` en [services/whatsapp.ts](src/services/whatsapp.ts) es la fuente única.

  Los enlaces de acceso del superadmin (`EnviarAccesoModal`) **no consumen cuota**, y es correcto: los manda el dueño de la plataforma, que tiene `clinica_id = null`, y son alta de personal, no aviso a un cliente.
- **Roles:** ocultar un enlace en el `Sidebar` no basta; la ruta va envuelta en `RolRoute` en [App.tsx](src/App.tsx). Ambas cosas. El reparto actual:

  | `RolRoute` | Rutas |
  |---|---|
  | `['admin', 'veterinario', 'recepcion', 'peluquero']` | `/agenda`, `/asistente`, `/pacientes`, `/pacientes/:id`, `/clientes` |
  | `['admin', 'veterinario', 'recepcion']` | `/internacion`, `/inventario`, y **las seis rutas de impresión clínica** |
  | `['recepcion', 'admin']` | `/caja`, `/respaldo` |
  | `['admin']` | `/servicios`, `/movimientos`, `/metricas` |
  | `['superadmin']` | `/plataforma`, `/plataforma/clinicas`, `/plataforma/usuarios`, `/plataforma/planes` |

  Estos `RolRoute` son la barrera de frontend equivalente a `auth_es_personal()`: sin ellos, una cuenta `cliente` del portal entraría en las mismas pantallas que el personal. El propio portal vive aparte, bajo `/portal-cliente` (`PortalClienteLayout`, sin `RolRoute` porque su propio layout y sus policies de solo-lectura ya acotan lo que se ve).

  **El peluquero da de alta mascotas y dueños, pero no ve el expediente clínico.** Al principio se le negó `/pacientes` entera, porque `FichaPacientePage` no distinguía quién escribe. Eso dejaba a una peluquería sin poder registrar a su propio paciente —y sin paciente no hay a quién agendarle, ni nada que enseñarle al dueño en el portal—, cuando es exactamente el mismo alta que hace una clínica. Ahora entra a `/pacientes` y `/clientes`, y lo que se acota es el expediente, en dos sitios que van emparejados: `puedeVerHistorialClinico()` ([lib/personal.ts](src/lib/personal.ts)) le oculta las tres pestañas (historial, esquema sanitario, internaciones) y el menú de impresión, y el `RolRoute` de las rutas de impresión cierra la puerta de atrás — esas seis colgaban solo de `ProtectedRoute` y se abrían tecleando la URL. Si añades una pantalla clínica, decide en cuál de las dos listas va; la RLS no te va a frenar, `auth_es_personal()` incluye al peluquero desde `0025`.

  ⚠️ `/agenda` tiene que llevar SIEMPRE a `peluquero` (y a cualquier rol de personal nuevo que se añada): `RolRoute` rebota ahí cuando el rol no encaja, e `InicioSegunRol` también manda ahí por defecto — sin él en la lista, el rol queda en un bucle de redirección infinito.

## El tour de bienvenida

Recorrido guiado sobre la propia interfaz (migración 0022): la pantalla se oscurece y el elemento explicado queda iluminado. Lo montan [AppLayout](src/components/layout/AppLayout.tsx) y [PortalClienteLayout](src/components/layout/PortalClienteLayout.tsx) con `OnboardingProvider`, cada uno con sus pasos. El superadmin no lo lleva.

- **El estado vive en `onboarding_usuario`, NO en `usuarios`, y es una decisión de seguridad.** La RLS es por fila, no por columna: una policy `for update using (id = auth.uid())` sobre `usuarios` —que es lo que haría falta para guardar ahí dos columnas— le dejaría a cualquiera cambiarse su propio `rol` a `admin`. La tabla aparte no tiene nada que valga la pena falsificar.
- **El motor es propio** ([features/onboarding/Tour.tsx](src/features/onboarding/Tour.tsx)), sin dependencia nueva. El foco de luz es un `div` con `box-shadow: 0 0 0 9999px`: oscurece todo lo demás sin máscaras SVG y anima solo.
- **Los pasos son datos** ([lib/onboarding.ts](src/lib/onboarding.ts)), separados del motor. `VERSION_ONBOARDING` es del código: subirla vuelve a mostrarlo a todos sin tocar la base.
- **Un paso cuyo elemento no exista se salta.** No es defensivo: el menú cambia según el rol (`enlacesVisibles`), así que recepción y el veterinario no ven los mismos pasos. Los anclajes son atributos `data-tour` sobre elementos que ya existían.
- **Nunca puede bloquear la aplicación.** Cerrar —termine o no— marca el tour como visto, y ningún fallo suyo deja la pantalla oscurecida sin salida. Repetirlo está en «Mi cuenta», y en el portal en el botón `?` de la cabecera: no hay menú «Ayuda» donde ponerlo.
- **No hay modo oscuro** en Vetora; el tour usa la misma paleta clara que el resto.

## Sesión y acceso

`AuthContext` restaura la sesión con `supabase.auth.getSession()` y carga la fila de `usuarios` **antes del primer render** (las páginas consultan servicios al montarse); mientras tanto no pinta nada. El login es `supabase.auth.signInWithPassword()` en [services/cuentas.ts](src/services/cuentas.ts): **la aplicación nunca ve una contraseña**. `motivoDeBloqueo()` se evalúa al entrar y en cada render protegido: suspender una clínica **saca a sus usuarios de la interfaz**.

⚠️ **Eso NO es una revocación, y la diferencia importa.** Ni la suspensión de la clínica ni `activo = false` en un usuario existen para la RLS: de las cinco funciones de las que cuelgan las 103 policies, solo `auth_es_clinico()` (la más reciente, de 0042) mira `activo`; `auth_clinica_id()`, `auth_es_admin()`, `auth_es_personal()` y `auth_es_plataforma()` resuelven el rol sin comprobarlo. Y `alternarActivoUsuario()` no revoca la sesión ni toca `auth.users`. Un empleado desactivado conserva su JWT —y lo renueva con su refresh token— así que **sigue leyendo y escribiendo las 44 tablas por PostgREST** aunque la aplicación no le deje entrar. Las Edge Functions sí comprueban `activo`, pero casi nada pasa por ellas. Dar de baja a alguien de verdad exige hoy borrarlo (`eliminar-usuario`) o cambiarle la contraseña.

**La sucursal activa es el segundo eje de filtrado**, por debajo de la clínica, y a diferencia de esta *no* la aplica el store: la pasan las páginas. `useAuth().sucursalActivaId` es `usuario.sucursal_id ?? sucursalOverride` — quien tiene sucursal asignada queda fijado a ella; el `admin` no tiene ninguna (ve todas) y elige una con `setSucursalActivaId`, que solo vive en memoria. Por eso los servicios reciben `sucursalId` como parámetro **opcional** (`listAtencionesPorCobrar(sucursalId?)`) y sin él no filtran: si una consulta nueva tiene que respetar la sucursal, pásasela tú y ponla en las dependencias del `useEffect`.

**El veterinario es el tercer eje, y solo en dos pantallas.** `veterinarioAcotado(usuario)` ([lib/personal.ts](src/lib/personal.ts)) devuelve el id propio si el rol es `veterinario` y `undefined` en cualquier otro caso; `listCitas(sucursalId?, rango?, veterinarioId?)` y `listInternaciones(sucursalId?, estado?, veterinarioId?)` lo aplican con el mismo patrón opcional que la sucursal, y los formularios de alta (`NuevaCitaModal`, `InternarModal`) lo usan para **fijar** al veterinario en sí mismo — sin eso, agendarle a un colega hace que la cita desaparezca en el mismo instante de crearla.

El `admin` queda fuera **a propósito** aunque atienda (`puedeAtender` lo cuenta como veterinario para el Plan Consultorio): coordina la clínica y necesita la vista completa. Y esto **no es una barrera de seguridad** — la RLS no distingue veterinarios, así que el expediente del paciente (historial, recetas, esquema sanitario) se sigue viendo entero, que es lo correcto para atender sin riesgo. Lo acotado es «mi trabajo de hoy». No lo repliques en las pantallas del expediente.

`peluqueroAcotado(usuario)` (migración `0025`) es la misma función, un rol distinto: mismo criterio, mismo hueco intencional para el admin. Se usa para acotar «mi trabajo de hoy» —`AgendaPage` y `AsistenteJornadaPage`, siempre combinada con `veterinarioAcotado(usuario) ?? peluqueroAcotado(usuario)`—, nunca en `InternarModal` ni `listInternaciones`: el peluquero no interna pacientes y no tiene acceso a `/internacion`. En `/pacientes` y `/clientes`, que sí lleva, **no se acota nada**: las mascotas y los dueños son de la clínica, no de quien los dio de alta.

Las altas de usuario generan una `Invitacion` (token de un solo uso, con caducidad) que se envía por WhatsApp y se canjea en `/acceso/:token`, donde la persona crea su contraseña.

**Ese canje vive entero en la Edge Function `acceso`** ([supabase/functions/acceso/](supabase/functions/acceso/)), y no por capricho: quien abre el enlace **todavía no tiene sesión**, así que para la RLS es un anónimo y no puede leer ni su propia invitación. Fijar la contraseña de otra cuenta es además `auth.admin.updateUserById`, que exige `service_role` — la única función que la usa. El **token es la credencial**: sus defensas son la caducidad, el uso único y el reclamo atómico (`update … .is('usado_at', null)`), que además libera el token si el cambio de contraseña falla después. Al volver, el frontend inicia sesión de verdad con la contraseña recién puesta; sin eso la RLS seguiría viendo un anónimo y la aplicación saldría vacía.

### Crear cuentas de Auth: nunca desde el navegador

El proyecto tiene **«Confirm email» activado** en Supabase Auth, y eso decide la forma de las tres altas. Ninguna crea la cuenta con `supabase.auth.signUp` desde el cliente: las tres usan `service_role` en una Edge Function.

| Alta | Función | Crea la cuenta con |
|---|---|---|
| Personal (clínica nueva o usuario nuevo) | `crear-cuenta` | `admin.createUser` + `email_confirm` |
| Canje del enlace de acceso | `acceso` | `admin.updateUserById` + `email_confirm` |
| Cliente del portal (`/registro-cliente`) | `registro-portal` | `admin.createUser` + `email_confirm` |

Las tres marcan `email_confirm: true`, y en las dos primeras el motivo es que **quien demuestra que el correo es suyo es el enlace de WhatsApp que la persona ya recibió**, no un clic en la bandeja de entrada.

**En el registro del portal no hay tal enlace, y aun así se marca. Es una deuda consciente, no un olvido.** Se intentó quitarlo —el formulario es público, cualquiera escribe cualquier dirección, y la confirmación sería lo único que probara que la cuenta pertenece a alguien— y **hubo que revertirlo el mismo día**: se desplegó sin un servidor de correo detrás. El servicio por defecto de Supabase es de desarrollo, va limitado a unos pocos envíos por hora y **solo entrega a direcciones de miembros del proyecto**; el correo no llegaba a nadie, sin ningún error visible, y el registro del portal quedó completamente roto.

Para retomarlo hace falta, **en este orden**: un SMTP de verdad (Resend/SendGrid) en Authentication → Emails, el dominio verificado con SPF/DKIM (si no, cae en spam), `Site URL` y `Redirect URLs` apuntando a `vetora.online`, y **una prueba de envío a una dirección que no sea del equipo** — ese último paso es el que lo habría detectado. Solo entonces se quita `email_confirm` de `registro-portal`.

Mientras tanto, el riesgo que la confirmación iba a mitigar —registrar con el CI y el WhatsApp de otro para reclamar su ficha— lo cubre lo que sí funcionó: desde `0028` un vínculo mal hecho **se puede deshacer**, que era el agujero de verdad. Ver «Vincular y desvincular» más abajo.

(Un captcha tampoco es la alternativa: Supabase no tiene uno propio, su `[auth.captcha]` es un conector a hCaptcha/Turnstile, y aquí ni se dispararía porque el alta no pasa por `signUp`.)

`signUp` desde el navegador falla de tres maneras a la vez con esa opción activa, y las tres están documentadas en la cabecera de [supabase/functions/crear-cuenta/](supabase/functions/crear-cuenta/): manda un correo de confirmación que sobra, **oculta que el correo ya existe** (devuelve un usuario falso con un uuid inventado, que al insertarse en `usuarios.id` —FK a `auth.users`— revienta con un 23503 con la clínica ya creada), y sustituye la sesión de quien opera. Si añades un alta, replica el patrón; no reintroduzcas `signUp`.

`crear-cuenta` **exige que quien llama sea un superadmin activo** (valida el JWT y lee el rol con el cliente admin): crea credenciales, así que no puede ser pública. Su acción `borrar` solo toca cuentas **sin fila en `usuarios`** — es el rollback de un perfil que no llegó a crearse, no un «borrar cualquier cuenta»; las cuentas con perfil se desactivan (`activo = false`), que para eso firman historiales y cobros.

**Borrar una clínica entera es aparte, en `eliminar-clinica`** (para cuando el cliente da de baja el servicio, no para el rollback de un alta). Mismo guard de superadmin, pero hace tres cosas que `crear-cuenta` no hace: vacía los buckets privados (`estudios`, `comprobantes`, `catalogo`) de esa clínica, borra la fila de `clinicas` —que en cascada de FK se lleva sola las ~20 tablas del inquilino—, y solo entonces borra la cuenta de `auth.users` de cada uno de sus usuarios (borrar `usuarios` por cascada no toca `auth.users`; la flecha corre al revés). Es irreversible a propósito, distinto de `cambiarEstadoClinica` (suspender), que no borra nada.

### El portal es para clientes YA registrados en esa clínica

⚠️ **Antes no se comprobaba nada.** `/registro-cliente` lista **todas** las clínicas activas y `registro-portal` creaba la cuenta primero y emparejaba después; si no encontraba ficha, **insertaba una vacía en esa clínica igualmente**. O sea que cualquiera podía crear cuenta en cualquier veterinaria sin haber sido cliente nunca, dejándole una ficha que nadie reconocía.

Ahora hay una puerta, **antes de `admin.auth.admin.createUser`**: si ninguna ficha sin reclamar de esa clínica tiene ese WhatsApp, se rechaza y **no se crea nada** — ni cuenta de Auth, ni `usuarios`, ni `clientes`. Que vaya antes no es orden caprichoso: comprobarlo después obligaría a deshacer una cuenta de Auth ya creada, y ese rollback es de donde salen las cuentas huérfanas.

- **El listón es que el número aparezca, no que el vínculo se resuelva.** Con dos fichas compartiendo número, o con un CI anotado que no coincide, la cuenta **sí** se crea sin vincular: esa persona es cliente, y la sugerencia de «Clientes» necesita justamente esa cuenta con ficha vacía para poder repararlo. Cerrar también ese caso dejaría al cliente fuera y sin arreglo posible.
- **El desplegable sigue listando todas las clínicas.** Filtrarlo antes de enviar exigiría el teléfono primero y sería un oráculo peor («¿en qué clínicas está este número?»). La puerta va en el envío, con la clínica ya elegida.
- El mensaje de rechazo **confirma que ese número no es cliente de esa clínica**. La fuga es pequeña —hay que saber el número *y* acertar la clínica— y un mensaje vago dejaría al cliente legítimo sin saber qué pedirle a su veterinaria.

### Por qué el portal se veía vacío: el alta creaba una SEGUNDA ficha

⚠️ **`registrarClienteYPaciente` insertaba siempre un `clientes` nuevo**, y `NuevoPacienteModal` es el único camino para dar de alta una mascota: no había forma de decir «este dueño ya existe». Su única guarda comparaba nombre de mascota + nombre de dueño, y solo para abortar.

Así que la secuencia normal —el dueño se registra en el portal, y días después trae su mascota— dejaba **dos fichas de la misma persona**: la cuenta colgando de una y la mascota de la otra. `getPacientesPortal` busca la ficha con `usuario_id = auth.uid()` y le lee las mascotas, así que devolvía cero. **El portal se veía vacío para siempre y no había ningún error que lo explicara**; la única salida era que alguien notara la sugerencia de «Clientes» y la aplicara a mano.

Ahora el alta **reusa la ficha del mismo dueño** (`fichaDelMismoDueno()`), con el mismo listón y en el mismo orden que el vínculo automático de `registro-portal`: CI + WhatsApp, o WhatsApp solo cuando la ficha no tiene CI y es la única candidata. Normaliza con `movil()` y `cedula()` de [lib/identidad.ts](src/lib/identidad.ts), no con una copia.

- ⚠️ **Ante cualquier ambigüedad crea ficha nueva, nunca adivina.** Dos fichas compartiendo teléfono —un matrimonio, una familia— no se distinguen aquí, y enganchar la mascota al dueño equivocado la haría aparecer en el portal de otra persona, con su historial y sus recetas. Un duplicado se repara desde «Clientes»; una ficha ajena vista por quien no debe, no.
- **Rellena el CI que faltaba, y solo eso.** El nombre de la ficha existente no se pisa: es el que ya está impreso en consentimientos y recibos.
- ⚠️ **El rollback solo borra la ficha si la creó él.** Con una reusada, borrarla se llevaría a un dueño real — y si aún no tuviera mascotas, ni `trg_cliente_sin_expediente` lo frenaría: se perdería su ficha y, con ella, el vínculo de su cuenta.

**Y las lecturas del portal ignoraban su `error`.** Las nueve consultas de `portalCliente.ts` destructuraban solo `data`, así que un fallo de RLS o de red dejaba `data` en null y la pantalla decía «No hay mascotas registradas». Un portal roto era indistinguible de uno vacío, que es exactamente por qué esto costó tanto de ver. Ahora lanzan, y `PortalMascotasPage` y `PortalCitasPage` pintan el motivo.

### Vincular y desvincular una cuenta del portal

El vínculo entre una cuenta del portal y la ficha de `clientes` que tiene las mascotas se resuelve por tres caminos: automático en `registro-portal` (CI+WhatsApp, o WhatsApp solo si la ficha no tiene CI y es la única candidata), y dos manuales —la sugerencia de «Clientes» y «Vincular cuenta del portal» desde la ficha del paciente.

**Los dos manuales pasan por `vincular_cuenta_portal()` (migración `0028`), y su gemela `desvincular_cuenta_portal()` es la reparación.** Antes de esa migración:

- **No se podía deshacer.** Ningún punto del código escribía `usuario_id = null`, y como el camino manual **borraba** la ficha del portal, el estado anterior tampoco era reconstruible. Un vínculo mal hecho dejaba a alguien viendo el expediente de una mascota ajena, para siempre.
- **No había guarda.** El `UPDATE` era `.eq('id', …)` a secas: vincular sobre una ficha ya reclamada pisaba el `usuario_id` anterior en silencio y dejaba a esa cuenta sin ninguna fila en `clientes` — invisible para la propia pantalla que sirve para recuperarla.
- **No había transacción.** `DELETE` y luego `UPDATE` en dos viajes desde el navegador; un fallo entre medias dejaba la cuenta huérfana.

Las dos funciones son **SQL sin `security definer`, a propósito**: corren con los privilegios de quien llama, así que `clientes_personal` sigue aplicando entera y esto no abre ninguna puerta lateral. Lo que aportan es atomicidad y tener las comprobaciones en un solo sitio. Al desvincular se le devuelve a la cuenta **una ficha propia y vacía**, que no es un extra: sin ella la cuenta no aparecería en ninguna pantalla —`listClientesDeClinica` lista `clientes`— y desvincular la haría desaparecer en vez de devolverla a la cola de sugerencias.

⚠️ Al añadir un RPC hay que declararlo también en [types/supabase.ts](src/types/supabase.ts): ese fichero se genera desde la base, y `supabase.rpc()` rechaza por tipos cualquier nombre que no esté en su unión `Functions`.

**El superadmin ve el estado, y solo eso.** `cuentas-portal` (Edge Function, `service_role`, guard de superadmin) devuelve por cada cuenta **un booleano y un conteo** — ni nombres, ni CI, ni nada clínico. Es lo justo para responder «¿su cuenta quedó suelta?» en un soporte sin abrir el expediente de nadie: la RLS le sigue negando `clientes`, y eso no cambia. **No lo conviertas en un lector de fichas**; para el volcado completo ya está `respaldo-clinica`, que es explícito sobre lo que hace. Y no puede *editar* cuentas del portal: `actualizarUsuario` lo rechaza, porque el desplegable de roles solo tiene los de clínica y ascender a un dueño a `admin` le daría el sistema entero.

**Borrar un usuario suelto, sin borrar la clínica entera, es `eliminar-usuario`** — corrige la frase de arriba: "las cuentas con perfil se desactivan" ya no es una regla absoluta. Antes de borrar comprueba, con `service_role` (el superadmin no tiene RLS sobre esas tablas, no puede ver datos clínicos de ningún inquilino), que el usuario no tenga ninguna fila en `citas`/`historial_clinico`/`internaciones`/`notas_internacion`/`turnos_caja`/`cobros` — ninguna de esas seis tiene cascada a propósito (son historiales y cobros inmutables), así que Postgres bloquearía el `DELETE` de todos modos, pero la función lo comprueba antes para devolver un mensaje claro en vez de un 23503 críptico. También rechaza borrar al único admin activo de una clínica, mismo chequeo que ya hacía `alternarActivoUsuario()` — ahora extraído a `exigirOtroAdminActivo()` en `services/plataforma.ts`, reusado también por `actualizarUsuario()` al degradar el rol de un admin activo.

## Respaldo y métricas

Dos áreas que no pasan por el patrón habitual y conviene conocer antes de tocarlas:

- **`/respaldo`** ([lib/exportacion.ts](src/lib/exportacion.ts) / [lib/importacion.ts](src/lib/importacion.ts)): genera un ZIP (JSZip + file-saver) con un CSV por tabla operativa y una carpeta `fotos/` con las de los pacientes indexadas por `codigo` (fuera del CSV, que solo lleva `tiene_foto`). La importación fusiona por `id` sobre lo existente, no reemplaza. El CSV es plano y sin escapes fuertes: no lo trates como un formato de intercambio estable.
- **`/metricas`** ([services/metricas.ts](src/services/metricas.ts)): comparativas mes actual contra mes anterior; los gráficos son `recharts`. **Ojo:** el mes actual/anterior ya usa `clinicMonth()` de `lib/datetime`, pero el bucle que arma el historial de los últimos N meses (`obtenerResumenMetricas`, cerca de la línea 119) todavía compara con `getMonth()`/`getFullYear()` del navegador — si tocas ese servicio, termina de migrarlo.

## Pantallas de impresión

Siete rutas producen documentos en papel: `/recibos/:cobroId`, `/consentimientos/:citaId`, `/pacientes/:id/historial/imprimir`, `/pacientes/:pacienteId/consulta/:consultaId/imprimir`, `/pacientes/:pacienteId/consulta/:consultaId/receta/imprimir`, `/pacientes/:pacienteId/reporte/:tipo/:itemId?` e `/internaciones/:id/imprimir`.

Cuelgan de `ProtectedRoute` pero **fuera de `AppLayout`**: sin barra lateral, sin `Topbar`, la página entera es el documento. Si añades una, va en ese mismo bloque de [App.tsx](src/App.tsx) — dentro de `AppLayout` saldría el menú impreso en el papel.

Las siete comparten el mismo esqueleto, y copiarlo es lo correcto al añadir la séptima: envoltorio `print:bg-white`; una barra con el `Link` «Volver a…» y un `Button` con `window.print()`, marcada `print:hidden` (sin navegación alrededor, ese enlace es la única salida); y la tarjeta del documento con `print:shadow-none print:p-*`.

**No hay generación de PDF, y es deliberado.** El «PDF» lo produce el diálogo del navegador sobre estas páginas: sale vectorial y con texto seleccionable, mejor que lo que daría `html2canvas` (que rasteriza), sin dependencia nueva y sin ocupar Storage. Tampoco hay nada que archivar: el expediente ya es inmutable —`trg_historial_inmutable` congela la consulta al cerrarla, y `consentimientos_cirugia` e `informes_firmados` son INSERT-only con la firma en base64—, así que **regenerar un documento da exactamente el mismo papel**. `consentimientos_cirugia.url_pdf` existe desde `0001` pero guarda un placeholder (`#consentimiento-<id>.pdf`): nunca hubo un PDF detrás.

**Cuatro de las siete las abren dos roles distintos.** El expediente (historial, consulta, receta, informe) lo ve el personal desde la ficha clínica y **el dueño desde su portal** — es su expediente, y poder descargarlo es el punto. El recibo y la hoja de internación se quedan solo para el personal (`cobros` e `internaciones` no tienen policy de portal). El `peluquero` queda fuera de las cuatro, emparejado con `puedeVerHistorialClinico()` que ya le oculta las pestañas: sin ese `RolRoute` bastaba con teclear la URL.

De dónde carga cada página lo decide **`cargarFichaDeDocumento()`** ([services/documentos.ts](src/services/documentos.ts)), y es una barrera de privacidad, no una comodidad: `getFichaPaciente` hace `select('*')` sobre `usuarios`, y un `cliente` tiene `clinica_id`, así que `usuarios_select` le dejaría bajarse el directorio del personal —correos y teléfonos— a su celular. Que la RLS lo permita no lo hace correcto. Por eso el dueño pasa por `getFichaPacientePortal()`, que resuelve los nombres de veterinario con un `.in('id', […])` acotado y omite `servicios`, `productos`, `movimientos_inventario` e internaciones — con ellos, el consumo de inventario y los precios internos, que no tienen por qué salir en el papel del cliente. `volverDeDocumento()` es su pareja: sin navegación alrededor ese enlace es la única salida, y apuntaba siempre a pantallas del personal.

**El inventario de documentos es una función pura**, `documentosDePaciente()` en [lib/documentos.ts](src/lib/documentos.ts). La consumen la pestaña «Documentos» de la ficha y la sección del portal, cada una pasándole lo que su rol puede leer: así el orden y los rótulos no divergen entre lo que ve el dueño y lo que ve su veterinario, aunque el envoltorio sea distinto (el portal no importa nada de `components/ui`). Los estudios de imagen se **descargan** con `urlDescargaDe()`, que es `createSignedUrl` con `{ download }`; la firma se pide **al pulsar**, no al pintar la lista, porque caduca en una hora.

El `@media print` de [src/index.css](src/index.css) es genérico y no conoce ningún documento (márgenes `@page`, `print-color-adjust`, `thead` repetido, `break-inside` en filas e imágenes): lo que cada página esconde o aplana va en sus propias utilidades `print:`.

## Estilos

Tailwind v4 vía `@tailwindcss/vite` — **no hay `tailwind.config.js`**; el tema (`@theme`, paleta teal, fuentes Inter/Outfit) vive en [src/index.css](src/index.css), junto con las utilidades propias (`glass-panel`, `glass-panel-heavy`, `shadow-premium`, `bg-mesh`) y el bloque `@media print` (ver arriba).

Paleta según PRD §8.1: `teal` marca/acción, `slate` superficies y texto, `emerald` cerrar/pagado, `rose` cancelar/cirugía, `amber` advertencia (stock bajo). Usa las primitivas de `components/ui` antes de escribir un `<button>` con clases sueltas. Iconos: `lucide-react`.

## Tres formatos de pantalla

La aplicación se usa en celular, tablet y escritorio, y la frontera es `md` (768 px) — `CONSULTA_MD` en [hooks/useMediaQuery.ts](src/hooks/useMediaQuery.ts). Casi todo se resuelve con clases de Tailwind, pero hay tres piezas compartidas:

- **`useEsEscritorio()`** cuando la decisión no es de CSS sino de qué se monta (la agenda elige vista). Va sobre `useSyncExternalStore` para acertar en el **primer** render; con `useState` + `useEffect` se vería un parpadeo de la vista de escritorio.
- **`PanelLateral`** envuelve el menú del área clínica y el de plataforma: columna fija desde `md`, cajón con velo por debajo. Cerrado en móvil queda `invisible`, no solo desplazado — si solo se trasladara, sus enlaces seguirían en el orden de tabulación. `MobileNav` es la barra inferior que lo abre.
- **`TablaResponsive`** ([components/ui/Tabla.tsx](src/components/ui/Tabla.tsx)): una sola definición de columnas para los dos formatos. Cada columna declara su `movil` (`titulo` | `destacado` | `detalle` | `acciones` | `oculta`) y por debajo de `md` la fila se dibuja como tarjeta. No escribas dos marcados en paralelo para una lista: acaban divergiendo.

## TypeScript

`verbatimModuleSyntax` está activo: los tipos se importan con `import type`. `noUnusedLocals` y `noUnusedParameters` también, así que una variable sin usar rompe el build (prefija con `_` lo que exista por contrato pero no se use).

`erasableSyntaxOnly` prohíbe la sintaxis de TypeScript que genera código: nada de `enum`, de propiedades de parámetro en el constructor ni de `namespace`. Donde tocaría un enum, un tipo unión de literales (así están ya `MetodoPago`, `Rol` y los estados en [types/database.ts](src/types/database.ts)) y, si hace falta el mapa, un `Record<Union, string>` al lado de quien lo pinta.

`tsc -b` solo cubre `src` (más `vite.config.ts`); [supabase/](supabase/) queda fuera, migración y Edge Function incluidas.
