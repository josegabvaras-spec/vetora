# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Proyecto

Vetora es un SaaS de gestión veterinaria (MVP) para clínicas de Tarija, Bolivia. **[vetora.MD](vetora.MD) es el PRD y manda**: alcance, reglas de negocio (§5.2), modelo de datos (§6) y paleta/pantallas (§8). Antes de añadir una regla o una tabla, revisa si el PRD ya la define.

Todo el código, los comentarios, los identificadores y la interfaz están **en español** (incluidos los nombres de columnas: `clinica_id`, `fecha_hora`, `stock_actual`). Mantén esa convención.

`README.md` es la plantilla de Vite sin tocar: no documenta nada de Vetora. La documentación del proyecto son el PRD y este archivo.

## Comandos

```powershell
npm run dev       # Vite dev server
npm run build     # tsc -b && vite build  (los errores de tipos rompen el build)
npm run lint      # oxlint (rápido, NO type-aware)
npm run preview   # sirve dist/
```

No hay runner de tests configurado. La verificación real es `npm run build` (typecheck) + probar en el navegador con una cuenta real de Supabase.

## Supabase es el backend, y ya está conectado

**No queda modo mock.** `src/mocks/db.ts` y `seed.ts` fueron eliminados en la migración; hoy son ficheros vacíos que solo existen por un motivo de build (ver más abajo). `isMockMode` sigue exportándose en [src/lib/supabase.ts](src/lib/supabase.ts) pero es `const false`: cualquier `if (isMockMode)` es código muerto.

- [supabase/migrations/0001_init.sql](supabase/migrations/0001_init.sql) es el esquema de verdad y **es normativo**: 20 tablas, RLS habilitada en las 20, 35 policies, 3 triggers, 4 funciones `SECURITY DEFINER`.
- [src/types/database.ts](src/types/database.ts) pretende reflejar fila por fila las tablas del SQL, y [src/types/supabase.ts](src/types/supabase.ts) es el tipo generado desde la base real. **Hoy los tres divergen** (ver «Estado real» abajo): cuando discrepen, **gana el SQL**.

**Regla estructural: solo `src/services/*.ts` habla con Supabase.** Las páginas y los `features` nunca llaman a `supabase` directamente; consumen servicios, que devuelven los tipos de `types/views.ts`. La única excepción legítima es `useTable` (abajo), que es infraestructura de reactividad, no de negocio.

La deuda que sigue viva:

- [lib/exportacion.ts](src/lib/exportacion.ts) e [lib/importacion.ts](src/lib/importacion.ts) — son `lib/` pero leen y escriben tablas enteras, y con `any`. El respaldo no puede salir de ahí.
- [lib/password.ts](src/lib/password.ts) — **huérfano**: nadie lo importa. Supabase Auth se encarga de las contraseñas desde la migración. Bórralo cuando toques esa zona.

Cuando toques una regla de negocio, tiene que quedar en los **tres** sitios: el SQL (constraint/trigger/policy), el servicio que la aplica, y el tipo si cambia la forma de la fila. **Un `as any` de por medio significa que los tres no están alineados**: esos casts son exactamente lo que permitió que el esquema y los tipos derivaran sin romper el build.

## El asistente de avisos (IA)

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
- Los refuerzos de vacuna y desparasitación **no guardan «ya avisado»**: sus tablas son solo INSERT. Un refuerzo pendiente deja de aparecer cuando se registra la dosis nueva o se agenda la cita, no cuando alguien manda el mensaje.

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
                db.ts y seed.ts están vacíos (ver «Estado real»)
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
| Stock nunca negativo (HU-03) | `check (stock_actual >= 0)` **y** `trg_aplicar_movimiento_inventario`, que ya ajusta el stock al insertar el movimiento | `registrarMovimiento` lanza `'Stock insuficiente'` — **hoy además lo aplica a mano y duplica el descuento; ver «Estado real»** |
| Consentimientos, cobros y notas de internación: solo INSERT | policies sin UPDATE/DELETE | servicios que solo insertan |
| Internación congelada tras el alta | `trg_internacion_inmutable` | [services/internacion.ts](src/services/internacion.ts) |
| Un veterinario sin citas solapadas (bloques de 30 min) | `exclude using gist` | [lib/agenda.ts](src/lib/agenda.ts) (`SLOT_MINUTOS`, franjas mañana/tarde) |
| Tope mensual de WhatsApp antes de disparar el API | — | `enviarMensajeWhatsapp` valida contra el plan; **todo** envío pasa por ahí |
| Precios congelados en `cobro_lineas` e `internaciones.precio_dia_bs` | columnas persistidas | los servicios copian el precio, no lo recalculan |

Además:

- **Moneda:** siempre `formatBs()` de [lib/currency.ts](src/lib/currency.ts) (`Bs. 0.00`).
- **Tiempo:** siempre los helpers de [lib/datetime.ts](src/lib/datetime.ts) (`America/La_Paz`). Nunca `toLocaleString` ni `new Date().getHours()` sobre una fecha de negocio: el navegador puede estar en otra zona.
- **Límites del plan:** se consultan por sus **números** (`max_sucursales`, `max_usuarios`, `whatsapp_limite`), nunca por el nombre del plan — el dueño de la plataforma crea planes desde el panel. `limitesDe()` en [services/plataforma.ts](src/services/plataforma.ts) es la fuente única para validar y para mostrar.
- **Roles:** ocultar un enlace en el `Sidebar` no basta; la ruta va envuelta en `RolRoute` en [App.tsx](src/App.tsx). Ambas cosas. El reparto actual:

  | `RolRoute` | Rutas |
  |---|---|
  | sin restricción (cualquier sesión) | `/agenda`, `/pacientes`, `/pacientes/:id`, `/internacion`, `/inventario` |
  | `['recepcion', 'admin']` | `/caja`, `/asistente`, `/respaldo` |
  | `['admin']` | `/servicios`, `/movimientos`, `/metricas` |
  | `['superadmin']` | `/plataforma`, `/plataforma/clinicas`, `/plataforma/planes` |

## Sesión y acceso

`AuthContext` restaura la sesión con `supabase.auth.getSession()` y carga la fila de `usuarios` **antes del primer render** (las páginas consultan servicios al montarse); mientras tanto no pinta nada. El login es `supabase.auth.signInWithPassword()` en [services/cuentas.ts](src/services/cuentas.ts): **la aplicación nunca ve una contraseña**. `motivoDeBloqueo()` se evalúa al entrar y en cada render protegido: suspender una clínica expulsa las sesiones ya abiertas.

**La sucursal activa es el segundo eje de filtrado**, por debajo de la clínica, y a diferencia de esta *no* la aplica el store: la pasan las páginas. `useAuth().sucursalActivaId` es `usuario.sucursal_id ?? sucursalOverride` — quien tiene sucursal asignada queda fijado a ella; el `admin` no tiene ninguna (ve todas) y elige una con `setSucursalActivaId`, que solo vive en memoria. Por eso los servicios reciben `sucursalId` como parámetro **opcional** (`listAtencionesPorCobrar(sucursalId?)`) y sin él no filtran: si una consulta nueva tiene que respetar la sucursal, pásasela tú y ponla en las dependencias del `useEffect`.

Las altas de usuario generan una `Invitacion` (token de un solo uso, con caducidad) que se envía por WhatsApp y se canjea en `/acceso/:token`, donde la persona crea su contraseña.

**Ese canje vive entero en la Edge Function `acceso`** ([supabase/functions/acceso/](supabase/functions/acceso/)), y no por capricho: quien abre el enlace **todavía no tiene sesión**, así que para la RLS es un anónimo y no puede leer ni su propia invitación. Fijar la contraseña de otra cuenta es además `auth.admin.updateUserById`, que exige `service_role` — la única función que la usa. El **token es la credencial**: sus defensas son la caducidad, el uso único y el reclamo atómico (`update … .is('usado_at', null)`), que además libera el token si el cambio de contraseña falla después. Al volver, el frontend inicia sesión de verdad con la contraseña recién puesta; sin eso la RLS seguiría viendo un anónimo y la aplicación saldría vacía.

## Respaldo y métricas

Dos áreas que no pasan por el patrón habitual y conviene conocer antes de tocarlas:

- **`/respaldo`** ([lib/exportacion.ts](src/lib/exportacion.ts) / [lib/importacion.ts](src/lib/importacion.ts)): genera un ZIP (JSZip + file-saver) con un CSV por tabla operativa y una carpeta `fotos/` con las de los pacientes indexadas por `codigo` (fuera del CSV, que solo lleva `tiene_foto`). La importación fusiona por `id` sobre lo existente, no reemplaza. El CSV es plano y sin escapes fuertes: no lo trates como un formato de intercambio estable.
- **`/metricas`** ([services/metricas.ts](src/services/metricas.ts)): comparativas mes actual contra mes anterior; los gráficos son `recharts`. **Ojo:** hoy calcula los meses con `new Date().getMonth()` en vez de los helpers de `lib/datetime`, así que salta la regla de zona horaria — si tocas ese servicio, arréglalo de paso.

## Pantallas de impresión

Seis rutas producen documentos en papel: `/recibos/:cobroId`, `/consentimientos/:citaId`, `/pacientes/:id/historial/imprimir`, `/pacientes/:pacienteId/consulta/:consultaId/imprimir`, `/pacientes/:pacienteId/reporte/:tipo/:itemId?` e `/internaciones/:id/imprimir`.

Cuelgan de `ProtectedRoute` pero **fuera de `AppLayout`**: sin barra lateral, sin `Topbar`, la página entera es el documento. Si añades una, va en ese mismo bloque de [App.tsx](src/App.tsx) — dentro de `AppLayout` saldría el menú impreso en el papel.

Las seis comparten el mismo esqueleto, y copiarlo es lo correcto al añadir la séptima: envoltorio `print:bg-white`; una barra con el `Link` «Volver a…» y un `Button` con `window.print()`, marcada `print:hidden` (sin navegación alrededor, ese enlace es la única salida); y la tarjeta del documento con `print:shadow-none print:p-*`.

El `@media print` de [src/index.css](src/index.css) es genérico y no conoce ningún documento (márgenes `@page`, `print-color-adjust`, `thead` repetido, `break-inside` en filas e imágenes): lo que cada página esconde o aplana va en sus propias utilidades `print:`.

## Estado real: lo que está roto ahora mismo

La migración a Supabase se hizo deprisa y dejó cosas a medias. Esto está **verificado leyendo el código y el SQL**, no supuesto. Si vas a trabajar en estas zonas, cuenta con ello:

1. **El stock se descuenta dos veces.** El trigger `trg_aplicar_movimiento_inventario` ya ajusta `productos.stock_actual` al insertar el movimiento, pero [services/inventario.ts:122-125](src/services/inventario.ts#L122) lo ajusta **también a mano** justo antes. Cada ingreso suma el doble y cada egreso resta el doble; y si el `check (stock_actual >= 0)` aborta el insert, el `update` manual ya se confirmó y el stock queda movido sin movimiento que lo respalde. **Lo correcto es borrar el `update` manual**: la autoridad es el trigger.
2. **Ninguna internación se guarda.** [services/internacion.ts:136](src/services/internacion.ts#L136) inserta `estado: 'ingreso'`, y el CHECK solo admite `('internado', 'alta')`.
3. **Se pierden constantes vitales en silencio.** [services/internacion.ts:180-181](src/services/internacion.ts#L180) leen `(datos as any).frecuenciaRespiratoria` y `.pesoKg` (camelCase), pero la interfaz declara `frecuencia_respiratoria` y `peso_kg`. Siempre guardan `null`, sin error.
4. **`clinica_id` es `not null` sin `default` en 17 tablas**, y casi ningún INSERT de negocio lo envía. Lo sensato es `alter column clinica_id set default auth_clinica_id()`, que además impide escribir en otra clínica.
5. **El tope de WhatsApp no se aplica.** `whatsapp.ts` incrementa el contador con un `update` sobre `clinicas`, pero el inquilino no tiene policy de UPDATE ahí. PostgREST **no da error** cuando la RLS filtra filas: afecta 0 filas, `error` es `null`, y el contador no sube. Además `whatsapp_mensajes_enviados` no tiene columna de periodo, así que el modelo no puede expresar un tope *mensual*.
6. **Deriva entre tipos y esquema.** `database.ts` declara columnas y tablas que no existen (`Paciente.codigo`, `Paciente.foto`, `Cliente.usuario_id`, `Cobro.cliente_nombre`, la tabla `recetas`), y roles/categorías que el CHECK rechaza (`'cliente'`, `'peluqueria'`). Todas las llamadas afectadas van con `(supabase as any)`, que es lo que impidió que `tsc` lo detectara.
7. **`src/mocks/db.ts` y `seed.ts` existen vacíos a propósito.** Son un parche: el repositorio tiene copias fantasma cuyo *nombre* lleva backslashes literales (`"src\mocks\seed.ts"` en la raíz), y TypeScript, que normaliza `\` a `/`, las confunde con `src/mocks/seed.ts` y falla el build en Linux. **Borrar los ficheros vacíos sin borrar antes los fantasmas rompe Vercel.**
8. **Cerrar un historial y dar un alta los rechaza la RLS.** `historial_update` ([0001_init.sql:574](supabase/migrations/0001_init.sql#L574)) e `internaciones_update` ([:609](supabase/migrations/0001_init.sql#L609)) declaran `using` **sin `with check`**, y PostgreSQL entonces aplica el `using` también a la fila resultante. Como el `using` exige `editable = true` / `estado = 'internado'`, la fila *nueva* tendría que cumplirlo igual: `update({editable:false})` y `update({estado:'alta'})` fallan con `42501`. ⚠️ **La corrección NO es quitar la condición del `using`** —eso abriría la edición de historiales cerrados—: es añadir un `with check` que solo exija `clinica_id`, dejando el sentido único a los triggers `trg_historial_inmutable` y `trg_internacion_inmutable`.
9. **Suspender una clínica no revoca el acceso.** `motivoDeBloqueo()` lanza y la UI bloquea, pero `AuthContext` **nunca llama a `supabase.auth.signOut()`**, y la sesión ya se creó en `verificarCredenciales`. El JWT sigue siendo válido contra PostgREST. Ninguna policy consulta `clinicas.estado`: la suspensión es hoy un control solo de frontend, es decir, ninguno.

**Credencial a revisar ya:** `seed.mjs` (versionado) ejecuta `signUp({ email: 'admin@vetora.bo', password: 'admin' })`. Si se llegó a lanzar contra el proyecto real, esa cuenta existe con esa contraseña. Sin fila en `usuarios` la RLS no le concede nada, pero es una credencial viva y adivinable: compruébala en el panel de Auth y bórrala.

⚠️ **Trampa al arreglar el punto 6:** ampliar el CHECK de `usuarios.rol` para admitir `'cliente'` parece la corrección obvia, pero `clientes_all`, `pacientes_all` y `citas_all` son `for all` con `clinica_id = auth_clinica_id()`. Un usuario del portal pasaría a tener **acceso de negocio completo al inquilino**: vería y modificaría los pacientes y las citas de todos los demás clientes de esa clínica. El portal necesita policies propias y estrechas (`clientes.usuario_id = auth.uid()`) **antes** de que ese rol exista en la base.

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
