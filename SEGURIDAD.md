# Auditoría de seguridad de Vetora

Fecha: 2026-08-22 · Alcance: código de la aplicación, migraciones SQL (0001–0020),
Edge Functions, dependencias. Método: revisión adversaria del código. **No se ejecutaron
ataques contra la base de producción** — ver «Lo que no se pudo probar».

## Resumen

| Severidad | Hallazgos | Estado |
|---|---|---|
| Crítico | 0 | — |
| Alto | 3 | corregidos |
| Medio | 2 | corregidos |
| Bajo / Info | 3 | 2 corregidos, 1 heredado pendiente (rotar la contraseña) |

Segunda pasada con los agentes `pentester`, `supabase-architect` y `qa-engineer`: hallazgos H-5 a
H-8. Cada uno se verificó a mano antes de corregirlo, y **uno de los reportados resultó falso** —
está documentado más abajo, para que nadie lo "arregle" luego.

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

### H-4 · BAJO · Credencial de Postgres en el historial de git — CERRADO (contraseña rotada)

- **Qué:** los scripts `apply_migrations.cjs` y `set_limit.cjs` llevaban la contraseña de Postgres de
  producción en texto plano. **Ya no están en el árbol** (se sacaron en el commit `91725ff`), pero
  **siguen en el historial de git**, que es público en GitHub.
- **Por qué no se «arreglaba» borrando el fichero:** sacar un archivo del árbol no lo saca de la
  historia. Sigue siendo legible con `git show fd6ad0d:apply_migrations.cjs`.
- **Cómo se cerró:** **rotando la contraseña** en Supabase → Project Settings → Database → Reset
  database password. La cadena que queda en el historial apunta ahora a una credencial que ya no
  existe: sigue ahí, pero es inservible. No hizo falta reescribir la historia (que habría exigido un
  push forzado y roto cualquier clon).
- **Por qué la rotación no tuvo coste:** **nada de la aplicación usa esa contraseña.** El frontend va
  con `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` y las Edge Functions con
  `SUPABASE_SERVICE_ROLE_KEY`; ninguna es la de Postgres. El único sitio que la tenía era
  `supabase/.temp/pooler-url`, caché local de la CLI, ya cubierta por `supabase/.gitignore` y no
  versionada. Tampoco hubo que redesplegar: `supabase functions deploy` va por la sesión de
  `supabase login`, no por la contraseña de la base.
- **Lección, que es lo que vale para la próxima:** un secreto que ha estado en un commit se considera
  quemado desde ese momento. La reparación no es borrar el fichero, es **rotar**. Y el freno de mano
  está antes: nada de credenciales en scripts sueltos, ni siquiera «de una sola vez».

### H-5 · ALTO · Reclamar el expediente ajeno sabiendo un CI — CORREGIDO

- **Dónde:** `supabase/functions/registro-portal/index.ts` (registro público del portal del dueño).
- **Qué:** la cuenta nueva se vinculaba a una ficha de `clientes` existente **solo por el CI**. La
  única defensa era `.is('usuario_id', null)`, que impide robar una ficha ya reclamada pero no
  comprueba en absoluto que quien se registra sea esa persona.
- **PoC:** el `clinica_id` es público (lo da `clinicas_para_registro()`, pensada para el desplegable
  del formulario) y un CI boliviano está en cualquier documento. Un `POST` al endpoint con el CI de
  un cliente que aún no se hubiera registrado entregaba su expediente: sus mascotas, su historial,
  sus recetas y su carné de vacunas, que es justo lo que las policies del portal le dan al dueño.
- **Corrección aplicada:** vincular exige ahora que coincidan **el CI *y* el WhatsApp**, cada uno
  normalizado por separado para que el formato en que quedaron guardados no importe: el WhatsApp se
  compara por sus últimos 8 dígitos (`+591 7…`, `7…` y `591-7…` casan entre sí), el CI por su parte
  numérica completa (`1234567`, `1234567 SC` y `1234567-1A` casan entre sí — el complemento de
  departamento no es parte de lo que identifica a la persona). Si no coinciden —o la ficha no tiene
  WhatsApp— **no se vincula**: se crea una ficha nueva, que es el camino seguro que ya existía, y la
  clínica une las dos a mano desde `FichaPacientePage` («Vincular cuenta del portal»).
- **Honestidad sobre el alcance:** esto **no es prueba de identidad**. Sube el listón de «sé tu
  carnet» a «sé tu carnet y tu teléfono», que para un MVP es proporcionado, pero la solución correcta
  es que **la clínica apruebe la vinculación**. Queda como el paso siguiente, no improvisado aquí.
- **El paso siguiente, ya construido:** la aprobación existe en la sección «Clientes» de la clínica
  (`src/pages/ClientesPage.tsx`). Sugiere la coincidencia y la confirma una persona que conoce al
  cliente, y hoy cubre lo que el automático descarta a propósito (ver la revisión de abajo).
- **Revisión posterior — el nivel 2, y por qué no reabre esto:** la exigencia de CI **y** WhatsApp
  dejaba fuera el caso más común, no el más peligroso: `clientes.ci` es nullable y el campo era
  opcional para recepción, así que una ficha sin CI **no podía casar jamás** (`cedula('')` no
  coincide con nada) y el dueño se quedaba mirando un portal vacío sin saber por qué. El
  emparejamiento pasa a tener dos niveles:
  - **Nivel 1 — CI + WhatsApp.** Igual que antes.
  - **Nivel 2 — WhatsApp solo, con guarda de unicidad.** Solo si el nivel 1 no encontró nada, solo
    sobre fichas **sin CI anotado**, y solo si hay **exactamente una** candidata en esa clínica con
    ese número. Con dos o más no se vincula ninguna: se manda a la sugerencia manual.

  No es el agujero original con otro dato, y la diferencia es la guarda: para quedarse con una ficha
  ajena ya no basta con saber un número, hacen falta las cuatro cosas a la vez —saber el número,
  acertar la clínica, que esa ficha no tenga CI anotado, y que no exista ninguna otra con ese mismo
  número—. Además, una ficha cuyo WhatsApp coincide pero cuyo CI anotado **no** coincide queda
  descartada del nivel 2: un CI que no cuadra es una señal activa en contra, no un dato ausente.
- **Y la causa raíz, cerrada a medias:** el CI pasa a ser obligatorio **en el formulario** de alta
  (`FormularioPaciente.tsx`, atributo `required`), así que las fichas nuevas creadas por ahí caen
  siempre en el nivel 1. Pero **la columna sigue siendo nullable** y `registrarClienteYPaciente`
  acepta `ci: … || null`: quien llame al servicio por otra vía puede seguir creando fichas sin CI.
  El nivel 2 sigue haciendo falta, y no solo para el histórico.
- **Confirmación de correo: se intentó y se revirtió el mismo día.** El registro del portal dejó de
  usar `email_confirm: true` para que Supabase exigiera confirmar la dirección — lo único que
  probaría que el correo es de quien se registra, ya que el formulario es público. **Se desplegó sin
  un servidor de correo detrás.** El servicio por defecto de Supabase es de desarrollo: va limitado
  a unos pocos envíos por hora y solo entrega a direcciones de miembros del proyecto. El correo no
  llegó a nadie, sin ningún error visible, y **el registro del portal quedó roto para todos** hasta
  que se restauró `email_confirm`.

  La lección no es que la idea fuera mala, es el orden: **primero el canal, después el requisito**, y
  con una prueba de envío a una dirección ajena al equipo antes de dar por buena ninguna de las dos
  cosas. Los pasos para retomarlo están en `CLAUDE.md`, §«Crear cuentas de Auth».

  El riesgo que iba a mitigar —registrar con el CI y el WhatsApp de otro para reclamar su ficha—
  queda cubierto por lo que sí funcionó de ese trabajo: ahora se puede **desvincular**. Ver el punto
  siguiente.
- **Un vínculo mal hecho ya se puede deshacer.** Hasta la migración `0028` no existía: ningún punto
  del código escribía `clientes.usuario_id = null`, y como `vincularPorIds` **borraba** la ficha del
  portal, el estado anterior tampoco era reconstruible. La única salida era borrar la cuenta entera.
  Ahora `desvincular_cuenta_portal()` la suelta y le devuelve su propia ficha vacía, en una
  transacción, con el botón «Desvincular» de `ClientesPage`.

  La misma migración cerró dos agujeros más de las rutas manuales: **no comprobaban que la ficha
  destino estuviera libre** —pisaban un vínculo existente en silencio y dejaban a la cuenta anterior
  sin ninguna fila en `clientes`, invisible para la pantalla que sirve para recuperarla— y hacían
  `DELETE` y luego `UPDATE` en dos viajes sin transacción, de modo que un fallo entre medias dejaba
  la cuenta huérfana. Las dos operaciones son ahora funciones SQL, **sin `security definer`**: corren
  con los privilegios de quien llama, así que `clientes_personal` sigue aplicando entera.
- **La sugerencia manual dejó de ser más laxa que el automático.** Emparejaba con **un solo** factor
  (CI *o* WhatsApp) y devolvía la primera coincidencia con `.find()`, sin señalar la ambigüedad: con
  dos fichas compartiendo el teléfono —un matrimonio, una familia— proponía una de las dos sin decir
  que había otra, y de ahí salía un vínculo irreversible. Ahora exige unicidad en el dato que gana,
  prefiere las coincidencias de CI **y** WhatsApp, marca cuál fue, y **no propone nada** cuando hay
  más de una candidata o cuando el CI y el teléfono apuntan a fichas distintas.
- **El fallo dejó de ser mudo:** `registro-portal` devuelve `motivo`, y `/registro-cliente` ya no
  navega a un portal vacío cuando no vinculó — explica qué pasó y a quién pedírselo.
- **Cómo confirmar:** registrarse con el CI correcto y un WhatsApp distinto **no** debe vincular la
  ficha existente; con los dos correctos, sí — incluso si el CI guardado por el personal lleva
  espacios, guiones o el complemento de departamento y el dueño lo teclea sin ellos.
- **Corrección de seguimiento (CI sin normalizar):** la primera versión de este arreglo solo
  normalizaba el WhatsApp — el CI seguía comparándose como texto exacto (`.eq('ci', ci)`), así que
  cualquier diferencia de formato entre lo que tecleó el personal y lo que tecleó después el dueño
  rompía el vínculo en silencio (no por falta de identidad, por una coma de más). Corregido en
  `registro-portal/index.ts` con la misma idea que ya usaba el WhatsApp: normalizar y comparar en
  memoria, no en el `where`.

### H-6 · ALTO · Aprobar un pago podía quedarse a medias, sin rastro — CORREGIDO

- **Dónde:** `src/services/plataforma.ts`, `aprobarPago`.
- **Qué:** eran tres viajes desde el navegador —marcar el pago aprobado, leer la fecha de cobro,
  avanzarla—. Un fallo en el segundo o el tercero dejaba el pago **aprobado** con la fecha **sin
  mover**. Y entonces desaparecía: `listPagosPendientes()` filtra por `pendiente`, así que la tarea
  se iba del asistente, la clínica leía «Aprobado», seguía debiendo, y nadie se enteraba. Reintentar
  tampoco valía — el segundo intento no encontraba fila pendiente y devolvía «no tienes permiso».
- **Corrección aplicada:** migración **0021**, función `aprobar_pago_suscripcion()` (`security
  definer` con `set search_path`, y la comprobación de rol dentro) que marca el pago y corre
  `proximo_cobro` **en una sola sentencia**. Mismo criterio que `consumir_cuota_whatsapp()`. El
  `where … and estado = 'pendiente'` sigue haciendo que un doble clic no regale un mes.
- **De regalo, un tercer defecto corregido:** `marcarCobroAlDia` ponía `estado_pago = 'al_dia'`
  **incondicionalmente**, así que una clínica con tres meses de atraso que pagaba uno salía «al día»
  con la fecha aún en el pasado — y desaparecía del contador de morosos. Ahora solo se marca al día
  si la fecha nueva ya es futura.

### H-7 · MEDIO · Dos comprobantes por la misma transferencia — CORREGIDO

- **Dónde:** `src/features/facturacion/PanelFacturacion.tsx` y `src/services/facturacion.ts`.
- **Qué:** el panel calculaba `hayComprobantePendiente` y pintaba el aviso «no hace falta que mandes
  otro», pero el botón era `disabled={enviando || !archivo}` — el aviso era decorativo, y el
  servicio no comprobaba nada. Dos envíos ⇒ dos tareas idénticas ⇒ el superadmin aprueba las dos ⇒
  una sola transferencia acredita el doble de meses.
- **Corrección aplicada**, en las tres capas que pide el proyecto: índice único parcial
  `pagos_un_pendiente_por_clinica` en 0021 (la garantía dura), comprobación en `enviarComprobante`
  (para dar un mensaje legible en vez del error de Postgres), y el botón deshabilitado.

### H-8 · BAJO · Defectos menores — CORREGIDOS

Todos verificados uno por uno antes de tocarlos:

- `espacio_estudios_bytes()` contaba solo el bucket `estudios` e ignoraba `comprobantes`, que 0020
  acababa de crear: el panel de salud subestimaba el almacenamiento justo en el bucket que el propio
  superadmin hace crecer al aprobar comprobantes. Corregido en 0021.
- Faltaba índice para `listConsultasAbiertas` (la pantalla de entrada del veterinario): el único
  índice de `historial_clinico` lleva `paciente_id` en segunda posición y esa columna no está en el
  predicado. Índice parcial `historial_borradores` en 0021.
- **0020 no era re-ejecutable**: sus tres policies `pagos_*` no llevaban `drop policy if exists`, así
  que un reintento tras un fallo a medias reventaba. Añadidas a 0020, que ahora es idempotente.
- `getResumenSuscripcion` caía a `tipo_cambio = 0` en vez de a `TIPO_CAMBIO_POR_DEFECTO`: un fallo
  de lectura le enseñaba al admin «Bs. 0.00», como si el plan fuera gratis.
- El `<input type="file">` no se limpiaba tras enviar, así que seguía mostrando el archivo con el
  botón ya deshabilitado y parecía que había dejado de responder.
- La insignia «Al día» podía contradecir la fecha roja de al lado: ahora usa el mismo criterio que el
  asistente (en mora **o** vencido).
- El bloque «el próximo cobro pasa del X al Y» de `ComprobanteModal` era **código muerto** — nadie
  pasaba el prop. Ahora `listPagosPendientes` trae `proximo_cobro` y la previsualización se ve
  **antes** de pulsar, que era su razón de ser.
- `Bs.` escrito a mano en `lib/asistentePlataforma.ts` en vez de `formatBs()` — el único sitio del
  código de moneda que fijaba el símbolo a mano.
- Un comentario de `enviarComprobante` afirmaba que el importe «se calcula en el servidor y no se
  acepta del formulario». **Es falso**: no hay tal servidor, llega del navegador, y la policy no
  valida el dinero. El control real es que el superadmin mira la foto. Comentario corregido para que
  nadie se apoye en una garantía inexistente.

---

## Rendimiento — CORREGIDO

La deuda que quedó anotada en la primera pasada ya está resuelta, y por el camino
aparecieron **causas mayores que ningún agente había señalado**. Todas se arreglaron con el
mismo patrón que el código ya usaba en `componerDetalleDeCitas`: traer el lote y resolver cada
tabla relacionada con **un `.in(...)`**, en vez de una consulta por fila.

| Dónde | Antes | Ahora |
|---|---|---|
| Agenda (`AgendaPage`) | descargaba la tabla **entera** de citas solo como señal de cambio | `useSuscripcionTabla`: cero datos |
| «Nueva cita» / «Internar» | `select('*')` sobre `pacientes` → **la foto base64 de toda la clínica** | tres columnas de texto |
| Rejilla de horas libres | todas las citas de la clínica, filtradas en memoria | las de ese veterinario ese día |
| Reconsultas en la agenda | 2 consultas **por cita** (120 en una semana de 60) | 2 en total |
| Lista de pacientes | foto de cada uno + 1 consulta por paciente para la internación | sin fotos, 1 consulta |
| Caja y Movimientos | 4–5 consultas **por cobro**, sin tope | 1 por tabla + tope de 500 |
| Internación | 6 consultas **por fila**, hasta 500 filas | 1 por tabla |
| Plataforma → Clínicas | ~6 consultas **por clínica** | 5 en total |

Dos de estos eran además **fallos de corrección**, no solo de velocidad:

- La **rejilla de horas libres** leía las citas con el corte de 1000 filas de PostgREST. En una
  clínica con historial, la cita que ocupaba el hueco podía no venir en el lote y la rejilla
  enseñaba **libre un horario ocupado**. Ahora el filtro lo hace la base.
- Quitar la foto de las lecturas destapó una **trampa de pérdida de datos**:
  `actualizarClienteYPaciente` hacía `foto: input.foto || null`, es decir, convertía «no me la
  pasaron» en «bórrala». Editar el peso de un paciente le habría borrado la foto en silencio. Ahora
  `foto` solo se escribe si viene, y el modal solo la manda si cambió.

**Lo que no se midió:** todo lo anterior sale de contar viajes a la base leyendo el código, no de
un perfilado con datos reales. La comprobación honesta es abrir la pestaña **Red** del navegador
antes y después en la misma pantalla y comparar el número de peticiones.

Sigue pendiente, y es de otra naturaleza: `TABLAS_RESPALDO` (`lib/exportacion.ts`) no incluye
vacunas, desparasitaciones, recetas ni consentimientos, así que el respaldo que la clínica se
descarga está **incompleto**. No es rendimiento; es una funcionalidad a medio terminar.
### Un falso positivo, para que no se repita

El agente reportó que las cuatro funciones `auth_*` no tienen `set search_path`. **Sí lo tienen**:
`0002_correcciones_criticas.sql` hace `alter function … set search_path` sobre las cuatro, y ninguna
migración posterior las reemplaza. Leer solo `0001` da esa impresión equivocada — es exactamente el
error contra el que avisa CLAUDE.md.
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
