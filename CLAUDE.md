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

- [supabase/migrations/](supabase/migrations/) es el esquema de verdad y **es normativo** — pero eso es las **veinte** migraciones, no solo la primera. `0001_init.sql` es la base (20 tablas, RLS habilitada en las 20, 35 policies, 3 triggers, 4 funciones `SECURITY DEFINER`); `0002` a `0010` son correcciones de seguridad reales y features que ya están aplicadas encima (RLS de `historial_update`/`internaciones_update`, índices, cuota de WhatsApp, portal del cliente, `pacientes.codigo`/`foto`, venta directa, recetario, tipo de cita `peluqueria`, inventario fraccionado). Leer solo `0001` da una foto vieja del esquema — antes de decir "esta tabla/columna no existe" o "esta policy no tiene `with check`", revisa si una migración posterior ya lo tocó.
- [src/types/database.ts](src/types/database.ts) pretende reflejar fila por fila las tablas del SQL, y [src/types/supabase.ts](src/types/supabase.ts) es el tipo generado desde la base real. Cuando discrepen, **gana el SQL**.

**Regla estructural: solo `src/services/*.ts` habla con Supabase.** Las páginas y los `features` nunca llaman a `supabase` directamente; consumen servicios, que devuelven los tipos de `types/views.ts`. La única excepción legítima es `useTable` (abajo), que es infraestructura de reactividad, no de negocio.

La deuda que sigue viva:

- [lib/exportacion.ts](src/lib/exportacion.ts) e [lib/importacion.ts](src/lib/importacion.ts) — son `lib/` pero leen y escriben tablas enteras, y con `any`. El respaldo no puede salir de ahí.
- **`apply_migrations.cjs` y `set_limit.cjs` (raíz del repo, versionados) llevan una contraseña de Postgres de producción en texto plano** en la cadena de conexión. Son scripts sueltos de una sola vez, no parte del flujo normal — no los uses como plantilla ni los ejecutes contra producción sin que esa contraseña se haya rotado ya.

Cuando toques una regla de negocio, tiene que quedar en los **tres** sitios: el SQL (constraint/trigger/policy), el servicio que la aplica, y el tipo si cambia la forma de la fila. **Un `as any` de por medio significa que los tres no están alineados**: esos casts son exactamente lo que permitió que el esquema y los tipos derivaran sin romper el build.

## El asistente de avisos (IA)

`/asistente` es **una ruta y dos pantallas**: [AsistenteSegunRol](src/components/layout/AsistenteSegunRol.tsx) despacha por rol, igual que `InicioSegunRol` despacha el destino de entrada. Lo que sigue describe la de recepción y administración. La jornada clínica (más abajo) es la del veterinario, y el admin la lleva además como una sección propia: ni WhatsApp ni IA.

Cierra la Épica 4 del PRD: qué toca avisar hoy y con qué texto. **Es interno y one-way** — el PRD §2 excluye del MVP el chatbot conversacional y el agendamiento automático, así que la IA redacta y propone, pero quien envía es una persona.

```
pages/AsistentePage · features/asistente/MensajeModal   revisan y envían
services/asistente.ts                                   ÚNICA puerta a la IA
   ↓ si la función falla o no está desplegada
lib/asistente.ts                                        plantillas deterministas
supabase/functions/asistente/                           Deno + claude-opus-5
```

- **La clave de Anthropic nunca está en el frontend.** Cualquier `VITE_*` viaja dentro del bundle. El modelo se llama desde la Edge Function, con la clave como secreto del proyecto:

  ```powershell
  supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
  supabase functions deploy asistente
  supabase functions serve asistente --env-file supabase/functions/.env.local   # local
  ```

  La función es el **único** código del repositorio que no pasa por `tsc -b` ni por Vite: corre en Deno y no está en el build. Un error ahí no rompe `npm run build`.
- `services/asistente.ts` devuelve `{ texto, origen: 'ia' | 'plantilla' }` y **la interfaz enseña ese origen**: mientras la función no esté desplegada el texto sale de plantilla, y no se puede presentar como escrito por la IA.
- **Lo que sale hacia Anthropic** está acotado en un solo sitio, `contextoDeAviso()` de [lib/asistente.ts](src/lib/asistente.ts): paciente, especie, nombre de pila del dueño, fecha y procedimiento. No salen el teléfono, el CI, el diagnóstico ni el historial. Si añades un aviso, no amplíes ese contexto por comodidad.
- **La IA no escribe en la base.** `services/programados.ts` deriva los avisos de las citas, las vacunas y las desparasitaciones ya registradas; enviar pasa por `enviarAviso()`, y crear una cita sigue siendo `crearCita()` con sus invariantes.
- Los refuerzos de vacuna y desparasitación **no guardan «ya avisado»**. Un refuerzo pendiente deja de aparecer cuando se registra la dosis nueva o se agenda la cita, no cuando alguien manda el mensaje.

### La jornada clínica

[JornadaClinica](src/features/asistente/JornadaClinica.tsx) es la **cola de trabajo clínico**: las consultas abiertas que esperan, las citas de hoy y los internados. Existe para cerrar un camino que estaba a ciegas — recepción abre la consulta desde la cita, y el borrador quedaba colgado del paciente sin ninguna pantalla que los enseñara juntos.

La ven **dos roles**, y `veterinarioId` es lo único que los distingue:

| | veterinario ([AsistenteVeterinarioPage](src/pages/AsistenteVeterinarioPage.tsx)) | admin (sección «Jornada» de [AsistentePage](src/pages/AsistentePage.tsx)) |
|---|---|---|
| `veterinarioId` | `veterinarioAcotado(usuario)` | sin pasar → toda la clínica |
| Rótulos | «Tus citas de hoy» | «Citas de hoy» |
| Columna «Veterinario» | no | sí |

Al admin **no se le acota a propósito**, por lo mismo que en la agenda: coordina la clínica, y en el Plan Consultorio es el único que atiende (`puedeAtender` ya lo cuenta como veterinario), así que «toda la clínica» y «lo suyo» son la misma lista. Los rótulos y la columna se derivan de ese único prop; no hay un segundo que pueda quedar descuadrado. **Recepción no la lleva**: no atiende consultas.

- **Sin WhatsApp y sin IA, a propósito.** El cupo de mensajes del plan se gasta por un solo lado, el de recepción; y esto es una cola derivada de la base, no un redactor de textos (mismo criterio que [lib/asistentePlataforma.ts](src/lib/asistentePlataforma.ts)).
- **Todo se deriva, igual que `listProgramados`.** Una fila desaparece sola cuando deja de ser cierta: se cerró la consulta, se firmó el consentimiento, se escribió la evolución. No hay nada que marcar como hecho.
- `listConsultasAbiertas()` ([services/historial.ts](src/services/historial.ts)) es lo único que hubo que escribir: `CitaConDetalle.historial_id` dice que hay historial pero no si sigue abierto, y un borrador de ayer sin cerrar tiene que seguir apareciendo. `historial_clinico` **no tiene `sucursal_id`** — la sucursal se resuelve por la cita.
- Las otras dos secciones salen de `listCitas` y `listInternaciones` con el `veterinarioId` que ya aceptan.

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

## Invariantes que no se negocian

Cada una tiene su barrera en el SQL y su réplica en un servicio; si escribes código que las esquiva, está mal aunque compile.

| Regla | SQL | Réplica en el servicio |
|---|---|---|
| Historial cerrado es inmutable (HU-02) | policy `historial_update` + `trg_historial_inmutable` | `exigirBorrador()` en [services/historial.ts](src/services/historial.ts) |
| Stock nunca negativo (HU-03) | `check (stock_actual >= 0)` **y** `trg_aplicar_movimiento_inventario` (`security definer` desde 0002), que ajusta el stock al insertar el movimiento | `registrarMovimiento` lanza `'Stock insuficiente'` como aviso temprano; la barrera real es el trigger — no reintroduzcas un ajuste manual de `stock_actual` ahí, ya se hizo y descontaba doble |
| Consentimientos, cobros y notas de internación: solo INSERT | policies sin UPDATE/DELETE | servicios que solo insertan |
| El esquema sanitario **no** está en ese grupo: se corrige | `vacunas_update/delete` y sus gemelas de desparasitación (0014), con `auth_es_personal()` en las cuatro cláusulas | [services/esquemaSanitario.ts](src/services/esquemaSanitario.ts) |
| Internación congelada tras el alta | `trg_internacion_inmutable` | [services/internacion.ts](src/services/internacion.ts) |
| Un veterinario sin citas solapadas (bloques de 30 min) | `exclude using gist` | [lib/agenda.ts](src/lib/agenda.ts) (`SLOT_MINUTOS`, franjas mañana/tarde) |
| Tope **mensual** de WhatsApp por plan | `consumir_cuota_whatsapp()` comprueba y consume en una sola sentencia | `enviarMensajeWhatsapp` la invoca; **todo aviso a un cliente** pasa por ahí |
| Precios congelados en `cobro_lineas` e `internaciones.precio_dia_bs` | columnas persistidas | los servicios copian el precio, no lo recalculan |

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
  | `['admin', 'veterinario', 'recepcion']` | `/agenda`, `/pacientes`, `/pacientes/:id`, `/internacion`, `/inventario`, `/asistente` |
  | `['recepcion', 'admin']` | `/caja`, `/respaldo` |
  | `['admin']` | `/servicios`, `/movimientos`, `/metricas` |
  | `['superadmin']` | `/plataforma`, `/plataforma/clinicas`, `/plataforma/planes` |

  Ese primer `RolRoute` es la barrera de frontend equivalente a `auth_es_personal()`: sin él, una cuenta `cliente` del portal entraría en las mismas pantallas que el personal. El propio portal vive aparte, bajo `/portal-cliente` (`PortalClienteLayout`, sin `RolRoute` porque su propio layout y sus policies de solo-lectura ya acotan lo que se ve).

## Sesión y acceso

`AuthContext` restaura la sesión con `supabase.auth.getSession()` y carga la fila de `usuarios` **antes del primer render** (las páginas consultan servicios al montarse); mientras tanto no pinta nada. El login es `supabase.auth.signInWithPassword()` en [services/cuentas.ts](src/services/cuentas.ts): **la aplicación nunca ve una contraseña**. `motivoDeBloqueo()` se evalúa al entrar y en cada render protegido: suspender una clínica expulsa las sesiones ya abiertas.

**La sucursal activa es el segundo eje de filtrado**, por debajo de la clínica, y a diferencia de esta *no* la aplica el store: la pasan las páginas. `useAuth().sucursalActivaId` es `usuario.sucursal_id ?? sucursalOverride` — quien tiene sucursal asignada queda fijado a ella; el `admin` no tiene ninguna (ve todas) y elige una con `setSucursalActivaId`, que solo vive en memoria. Por eso los servicios reciben `sucursalId` como parámetro **opcional** (`listAtencionesPorCobrar(sucursalId?)`) y sin él no filtran: si una consulta nueva tiene que respetar la sucursal, pásasela tú y ponla en las dependencias del `useEffect`.

**El veterinario es el tercer eje, y solo en dos pantallas.** `veterinarioAcotado(usuario)` ([lib/personal.ts](src/lib/personal.ts)) devuelve el id propio si el rol es `veterinario` y `undefined` en cualquier otro caso; `listCitas(sucursalId?, rango?, veterinarioId?)` y `listInternaciones(sucursalId?, estado?, veterinarioId?)` lo aplican con el mismo patrón opcional que la sucursal, y los formularios de alta (`NuevaCitaModal`, `InternarModal`) lo usan para **fijar** al veterinario en sí mismo — sin eso, agendarle a un colega hace que la cita desaparezca en el mismo instante de crearla.

El `admin` queda fuera **a propósito** aunque atienda (`puedeAtender` lo cuenta como veterinario para el Plan Consultorio): coordina la clínica y necesita la vista completa. Y esto **no es una barrera de seguridad** — la RLS no distingue veterinarios, así que el expediente del paciente (historial, recetas, esquema sanitario) se sigue viendo entero, que es lo correcto para atender sin riesgo. Lo acotado es «mi trabajo de hoy». No lo repliques en las pantallas del expediente.

Las altas de usuario generan una `Invitacion` (token de un solo uso, con caducidad) que se envía por WhatsApp y se canjea en `/acceso/:token`, donde la persona crea su contraseña.

**Ese canje vive entero en la Edge Function `acceso`** ([supabase/functions/acceso/](supabase/functions/acceso/)), y no por capricho: quien abre el enlace **todavía no tiene sesión**, así que para la RLS es un anónimo y no puede leer ni su propia invitación. Fijar la contraseña de otra cuenta es además `auth.admin.updateUserById`, que exige `service_role` — la única función que la usa. El **token es la credencial**: sus defensas son la caducidad, el uso único y el reclamo atómico (`update … .is('usado_at', null)`), que además libera el token si el cambio de contraseña falla después. Al volver, el frontend inicia sesión de verdad con la contraseña recién puesta; sin eso la RLS seguiría viendo un anónimo y la aplicación saldría vacía.

### Crear cuentas de Auth: nunca desde el navegador

El proyecto tiene **«Confirm email» activado** en Supabase Auth, y eso decide la forma de las tres altas. Ninguna crea la cuenta con `supabase.auth.signUp` desde el cliente: las tres usan `service_role` en una Edge Function y marcan `email_confirm: true`, porque **quien demuestra que el correo es suyo es el enlace de WhatsApp o el formulario, no un clic en la bandeja de entrada**.

| Alta | Función | Crea la cuenta con |
|---|---|---|
| Personal (clínica nueva o usuario nuevo) | `crear-cuenta` | `admin.createUser` + `email_confirm` |
| Canje del enlace de acceso | `acceso` | `admin.updateUserById` + `email_confirm` |
| Cliente del portal (`/registro-cliente`) | `registro-portal` | `admin.createUser` + `email_confirm` |

`signUp` desde el navegador falla de tres maneras a la vez con esa opción activa, y las tres están documentadas en la cabecera de [supabase/functions/crear-cuenta/](supabase/functions/crear-cuenta/): manda un correo de confirmación que sobra, **oculta que el correo ya existe** (devuelve un usuario falso con un uuid inventado, que al insertarse en `usuarios.id` —FK a `auth.users`— revienta con un 23503 con la clínica ya creada), y sustituye la sesión de quien opera. Si añades un alta, replica el patrón; no reintroduzcas `signUp`.

`crear-cuenta` **exige que quien llama sea un superadmin activo** (valida el JWT y lee el rol con el cliente admin): crea credenciales, así que no puede ser pública. Su acción `borrar` solo toca cuentas **sin fila en `usuarios`** — es el rollback de un perfil que no llegó a crearse, no un «borrar cualquier cuenta»; las cuentas con perfil se desactivan (`activo = false`), que para eso firman historiales y cobros.

## Respaldo y métricas

Dos áreas que no pasan por el patrón habitual y conviene conocer antes de tocarlas:

- **`/respaldo`** ([lib/exportacion.ts](src/lib/exportacion.ts) / [lib/importacion.ts](src/lib/importacion.ts)): genera un ZIP (JSZip + file-saver) con un CSV por tabla operativa y una carpeta `fotos/` con las de los pacientes indexadas por `codigo` (fuera del CSV, que solo lleva `tiene_foto`). La importación fusiona por `id` sobre lo existente, no reemplaza. El CSV es plano y sin escapes fuertes: no lo trates como un formato de intercambio estable.
- **`/metricas`** ([services/metricas.ts](src/services/metricas.ts)): comparativas mes actual contra mes anterior; los gráficos son `recharts`. **Ojo:** el mes actual/anterior ya usa `clinicMonth()` de `lib/datetime`, pero el bucle que arma el historial de los últimos N meses (`obtenerResumenMetricas`, cerca de la línea 119) todavía compara con `getMonth()`/`getFullYear()` del navegador — si tocas ese servicio, termina de migrarlo.

## Pantallas de impresión

Siete rutas producen documentos en papel: `/recibos/:cobroId`, `/consentimientos/:citaId`, `/pacientes/:id/historial/imprimir`, `/pacientes/:pacienteId/consulta/:consultaId/imprimir`, `/pacientes/:pacienteId/consulta/:consultaId/receta/imprimir`, `/pacientes/:pacienteId/reporte/:tipo/:itemId?` e `/internaciones/:id/imprimir`.

Cuelgan de `ProtectedRoute` pero **fuera de `AppLayout`**: sin barra lateral, sin `Topbar`, la página entera es el documento. Si añades una, va en ese mismo bloque de [App.tsx](src/App.tsx) — dentro de `AppLayout` saldría el menú impreso en el papel.

Las siete comparten el mismo esqueleto, y copiarlo es lo correcto al añadir la séptima: envoltorio `print:bg-white`; una barra con el `Link` «Volver a…» y un `Button` con `window.print()`, marcada `print:hidden` (sin navegación alrededor, ese enlace es la única salida); y la tarjeta del documento con `print:shadow-none print:p-*`.

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
