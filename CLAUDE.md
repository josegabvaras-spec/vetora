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

- [supabase/migrations/](supabase/migrations/) es el esquema de verdad y **es normativo** — pero eso es las **treinta y cuatro** migraciones, no solo la primera. `0001_init.sql` es la base (20 tablas, RLS habilitada en las 20, 35 policies, 3 triggers, 4 funciones `SECURITY DEFINER`); `0002` a `0010` son correcciones de seguridad reales y features que ya están aplicadas encima (RLS de `historial_update`/`internaciones_update`, índices, cuota de WhatsApp, portal del cliente, `pacientes.codigo`/`foto`, venta directa, recetario, tipo de cita `peluqueria`, inventario fraccionado). Leer solo `0001` da una foto vieja del esquema — antes de decir "esta tabla/columna no existe" o "esta policy no tiene `with check`", revisa si una migración posterior ya lo tocó.
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
- ⚠️ **`/caja` sobrevive, y no es opcional.** La caja del panel **no abre ni cierra turno**: `PetshopCajaPage` lo dice ella misma («Debes abrir un turno en el módulo de Caja para facturar en el POS») y `PeluqueriaCajaPage` deja el botón de cobrar deshabilitado sin turno. Quitarla del menú dejaba el POS **sin poder facturar**. Se renombra a «Caja General» —y la del panel a «Caja Peluquería» / «Caja Pet Shop»— porque dos entradas llamadas «Caja» no dicen cuál es cuál. Las otras tres supervivientes son Asistente, Respaldo y Catálogo: no son clínicas y no existen dentro de los paneles.
- ⚠️ **Las secciones llevan `roles`, incluidas las que no lo tenían.** Las 12 del petshop no llevaban ninguno y las de peluquería iban a medias. Sus paneles sí (`['admin','recepcion','veterinario']` y `['admin','recepcion','peluquero']`), así que sin ese suelo un peluquero de un plan mixto vería el POS en su menú y el enlace le rebotaría — el mismo error que `enlacesClinicos` ya documenta para `/internacion`.

**El Asistente se reparte también por negocio**, no solo por rol ([AsistenteSegunRol](src/components/layout/AsistenteSegunRol.tsx)):

- **Petshop → [AsistentePetshopPage](src/pages/AsistentePetshopPage.tsx), para todos los roles.** Las otras dos derivan todo de pacientes, citas e historiales, y un petshop no tiene nada de eso: le habrían dejado una pantalla con todas las cifras en cero. Lo suyo es qué reponer —`getSugerenciasReposicion()`, que ya trae proveedor y cantidad— y qué lotes vencen. **El pedido al proveedor es `enlaceWhatsapp()`, nunca `enviarMensajeWhatsapp()`**: la cuota del plan es para avisos a clientes, y una orden de compra es logística interna. `0034` le da `asistente_ia` al plan, que nunca lo tuvo.
- **Peluquería → `AsistentePage` adaptada.** No cambia de dónde salen los avisos —`listProgramados` se adapta sola: los refuerzos de vacuna, las desparasitaciones y los seguimientos derivan de tablas que no llena— pero sí lo que la pantalla dice: fuera «Vencidos», «Sin consentimiento», la pestaña «Prevención» y la sección «Jornada» (que sería su Dashboard otra vez, con dos tablas vacías al lado). Le quedan citas, cumpleaños, atenciones sin cobrar y clientes que no vuelven.

## El catálogo y la Tienda

`/catalogo` (migración `0027`) es la vitrina comercial de la clínica —veterinaria, peluquería o petshop, sin distinción por `tipo_negocio`—, y la Tienda es su reverso: una sección del portal del cliente donde el dueño de mascota ve catálogos de **cualquier** clínica activa con el módulo, no solo la suya. Es la primera vez que el sistema expone, a propósito, datos de una clínica a alguien que no es su cliente — todo lo demás del portal está acotado por `clientes.usuario_id = auth.uid()`.

- **`catalogo_productos` no es `productos`.** Ese es kardex por sucursal (sku, presentación, stock fraccionado), sin foto ni descripción, y el rol `cliente` no tiene ningún acceso ahí a propósito. `catalogo_productos` es a nivel de **clínica**, sin stock: un escaparate, no inventario.
- **Gating comercial por `ModuloVetora`, como el resto** — `/catalogo` va detrás de `ModuloRoute modulo="catalogo"`, solo para `admin` (mismo criterio que `/servicios`: fija precios públicos del negocio). Pero la policy de lectura pública (`catalogo_productos_portal`) es **la única del proyecto que mira `modulos_habilitados`**: si el plan pierde el módulo, sus productos desaparecen de la Tienda sin que nadie los borre — es la única tabla cuyo propósito entero es mostrarse a quien no es de la clínica.
- **`clinicas_con_catalogo()`** es una función `security definer`, mismo patrón que `clinicas_para_registro()` (registro público, §Sesión y acceso): `clinicas_select` (`id = auth_clinica_id() or auth_es_plataforma()`) no deja leer la fila de otra clínica, ni siquiera incrustada en un `select('*, clinicas(...)')`. La función expone solo las columnas seguras (`nombre`, `logo_url`, `ciudad`, `tipo_negocio`, `whatsapp`) — nunca `responsable`, cuota de WhatsApp, estado de pago ni plan contratado. `grant execute` va a `authenticated`, no a `anon`: la Tienda solo se ve con sesión iniciada en el portal.
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

`AuthContext` restaura la sesión con `supabase.auth.getSession()` y carga la fila de `usuarios` **antes del primer render** (las páginas consultan servicios al montarse); mientras tanto no pinta nada. El login es `supabase.auth.signInWithPassword()` en [services/cuentas.ts](src/services/cuentas.ts): **la aplicación nunca ve una contraseña**. `motivoDeBloqueo()` se evalúa al entrar y en cada render protegido: suspender una clínica expulsa las sesiones ya abiertas.

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
