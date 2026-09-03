# PRD — Vetora: Plataforma SaaS para negocios de mascotas

> **Este documento manda.** Alcance, reglas de negocio (§6), modelo de datos (§7) y pantallas (§10).
> Antes de añadir una regla o una tabla, revisa si aquí ya está definida.
>
> Su compañero es [CLAUDE.md](CLAUDE.md), que es otra cosa: **cómo** se trabaja el repositorio y
> **por qué** cada decisión técnica se tomó así. Este dice *qué es el producto y para quién*.
> Se referencian, no se duplican.
>
> Última revisión contra el código y contra la base de producción: **2026-09-02**.

---

## 1. Visión general del producto

**Problema**

Los negocios de mascotas en Bolivia —veterinarias, peluquerías caninas y petshops— gestionan citas, historiales, inventario y comunicación de forma manual o dispersa entre cuadernos, Excel y WhatsApp personal. Eso produce pérdida de tiempo, citas mal coordinadas, historiales incompletos y una experiencia poco profesional para el dueño de la mascota.

**Propuesta de valor**

Una plataforma que **se adapta al negocio que realmente eres**: una veterinaria con historial clínico e internación, una peluquería con órdenes de servicio y comisiones, o un petshop con punto de venta y control de lotes. El mismo sistema, tres productos distintos, y un portal donde el dueño de la mascota ve su expediente.

**Lo que decide qué ve cada quien es el par `rol` + `módulos del plan`** — no el tipo de negocio, que es solo descriptivo. Un plan sin `historial_clinico` no enseña el expediente; un plan con `peluqueria` cambia el menú entero.

**Visión a largo plazo**

Ser el sistema de referencia para la gestión de negocios de mascotas en Bolivia, integrando administración, inventario, comunicación y la relación con el dueño en un solo lugar.

**Mercado objetivo**

Veterinarias, consultorios independientes, peluquerías caninas y petshops de Bolivia.

---

## 2. Estado del producto

No es un MVP: es un producto en producción, en `vetora.online`.

| | |
|---|---|
| Pantallas | 68 |
| Servicios (lógica de negocio) | 42 |
| Modales y formularios | 55 |
| Tablas | 42 |
| Policies RLS | 132 |
| Migraciones | 37 |
| Edge Functions | 8 |
| TypeScript | ~25.600 líneas |

### 2.1. Lo que está entregado

**Área clínica (veterinaria)**
- Agenda con vistas de día y semana, seis tipos de cita, y bloqueo de solapes por veterinario.
- Historial clínico SOAP completo: anamnesis, examen físico, diagnóstico, tratamiento. **Inmutable al cerrarse.**
- Esquema sanitario (vacunas y desparasitaciones) **independiente de la consulta**: se carga el historial previo con su fecha real.
- Internación con notas de evolución y precio por día congelado.
- Recetario, informes firmados, consentimientos de cirugía con firma digital.
- Estudios de imagen en Storage privado con URL firmada.
- Siete pantallas de impresión, sin generación de PDF: el diálogo del navegador da texto vectorial y seleccionable.

**Caja e inventario**
- Turnos de caja con apertura, cierre y arqueo.
- Cobro de atenciones, internaciones y órdenes de peluquería; venta directa de medicamentos con escaneo de código de barras.
- Inventario con **stock fraccionado**: se compra en envases y se aplica en mililitros.
- Lotes con semáforo de vencimiento, proveedores, órdenes de compra y recepción, sugerencia de reposición.

**Peluquería** (11 pantallas)
- Dashboard operativo, agenda propia, órdenes de servicio con estados, evaluación inicial con suplementos.
- Servicios con reglas de precio, insumos por servicio, comisiones por peluquero, clientes frecuentes.

**Petshop** (12 pantallas)
- Punto de venta con escaneo, promociones y cupones, devoluciones.
- Productos con costo y margen, inventario con lotes, compras, proveedores, reportes de rentabilidad.

**Portal del dueño de mascota** (9 pantallas)
- Registro público, acotado a quien ya es cliente de esa clínica.
- Expediente de sus mascotas: visitas, vacunas, recetas, consentimientos, estudios descargables.
- Citas y avisos, mezclando citas clínicas, órdenes de peluquería y refuerzos de vacuna.
- **Tienda**: catálogos de cualquier negocio de la plataforma, con búsqueda por producto.
- **Peluquerías**: servicios y precios de cualquier peluquería, con solicitud de cita por WhatsApp.

**Plataforma** (5 pantallas, rol `superadmin`)
- Alta y baja de clínicas, planes con módulos y precios, usuarios de todos los inquilinos.
- Cobro de la suscripción con QR y comprobante, aprobado a mano.
- Salud del sistema y respaldo por clínica.

**Transversal**
- Tour de bienvenida guiado sobre la propia interfaz, distinto por rol.
- Respaldo en ZIP con un CSV por tabla y las fotos de los pacientes.
- Avisos por WhatsApp con cuota mensual por plan, consumida de forma atómica en la base.

### 2.2. Lo que sigue fuera de alcance

- **Agendamiento automático desde el portal.** El dueño *solicita* por WhatsApp; quien agenda es una persona. No hay INSERT de `citas` para el rol `cliente`.
- **Chatbot conversacional de WhatsApp.** Los avisos son de una sola dirección.
- **Pagos en línea.** La suscripción se paga por transferencia con comprobante; los cobros de la clínica son presenciales.
- **Aplicación móvil nativa.** La web es responsive en celular, tablet y escritorio.
- **Telemedicina.**
- **Multi-sede comparativo.** La estructura multi-sucursal está en la base y el plan existe, pero faltan reportes comparativos y traspaso de inventario entre sedes.

---

## 3. Personas

| Persona | Rol | Qué necesita |
|---|---|---|
| **Veterinario independiente** (Plan Consultorio) | `admin` que además atiende | Ordenar su agenda y separar su WhatsApp personal del trabajo. Es el único que atiende, así que su vista de administración y su vista clínica son la misma. |
| **Dueño/a de clínica** (Plan Clínica) — **PRIMARIA** | `admin` | Visibilidad centralizada, historiales estandarizados, control de inventario y de caja. |
| **Veterinario de plantilla** | `veterinario` | Su cola de trabajo del día: consultas abiertas, sus citas, sus internados. |
| **Recepción** | `recepcion` | Agendar, cobrar, avisar a los clientes, dar de alta pacientes. |
| **Peluquero/a** | `peluquero` | Sus órdenes y sus comisiones. **Da de alta mascotas y dueños, pero no ve el expediente clínico** — no es asistencia médica y no le hace falta. |
| **Dueño de mascota** | `cliente` | Ver el expediente de su mascota, sus próximas citas, y encontrar dónde comprar o dónde bañarla. |
| **Operador de la plataforma** | `superadmin` | Administrar clínicas, planes y cobros. **No puede ver datos clínicos de ningún inquilino.** |

---

## 4. Planes y precios

La suscripción es **la única cosa del sistema que va en dólares** — lo que la sostiene (dominio, Supabase, Vercel) se paga en dólares y sus tarifas se mueven. Todo lo demás de la aplicación va en bolivianos. Se muestra el dólar como precio y el boliviano debajo, al cambio que fija el operador.

| Plan | USD/mes | Sedes | Usuarios | WhatsApp/mes | Módulos |
|---|---|---|---|---|---|
| **PetShop** | 12 | 1 | 3 | 60 | 7 |
| **Peluquería** | 15 | 1 | 3 | 100 | 11 |
| **Consultorio** | 20 | 1 | 2 | 499 | 12 |
| **Clínica** | 40 | 1 | 8 | 999 | 12 |
| **Multi-sede** | 80 | 5 | 25 | 20.000 | 12 |

**Cómo se cobra: sin pasarela.** El administrador elige 1, 3, 6 o 12 meses, escanea el QR del operador y sube la foto del comprobante. El operador lo revisa y aprueba. Una clínica **suspendida no entra y por tanto no puede pagar** desde ahí: eso se resuelve hablando. El estado `en_mora` sí puede.

### 4.1. Los 14 módulos

`agenda` · `caja` · `inventario` · `historial_clinico` · `internacion` · `asistente_ia` · `portal_cliente` · `whatsapp` · `metricas` · `catalogo` · `peluqueria` · `petshop` · `fichas` · `servicios`

⚠️ **Un módulo nuevo necesita TRES cosas para ser alcanzable**, y si falta una las pantallas quedan muertas: que algún plan lo traiga, que el editor de planes lo ofrezca, y la ruta con su enlace. Ha fallado tres veces.

---

## 5. Épicas

1. **Autenticación, usuarios y roles** — inquilinos, seis roles, invitación por WhatsApp con token de un solo uso, recuperación de contraseña.
2. **Clientes y pacientes** — dueños con WhatsApp y CI, ficha de mascota con foto y código, expediente centralizado.
3. **Agenda, citas y procedimientos** — calendario, estados, consentimiento de cirugía con firma.
4. **Avisos por WhatsApp** — recordatorios, refuerzos de vacuna, cumpleaños, clientes que no vuelven. **Una sola dirección**, con cuota por plan.
5. **Inventario y facturación** — stock fraccionado sin negativos, lotes y vencimientos, compras, turnos de caja, recibos.
6. **Portal del dueño** — expediente, citas, Tienda y peluquerías.
7. **Peluquería** — panel propio con órdenes, comisiones y fidelización.
8. **Petshop** — punto de venta, promociones, devoluciones, rentabilidad.
9. **Plataforma** — clínicas, planes, suscripción y salud del sistema.
10. **Asistente** — qué toca avisar hoy y con qué texto; cola de trabajo clínico; reposición y vencimientos en retail.

---

## 6. Reglas de negocio estrictas

Cada una tiene su barrera en la base de datos. Si el código las esquiva, está mal aunque compile.

**Aislamiento**
- **Multi-inquilino solo con RLS de PostgreSQL**, nunca solo en frontend. Todo cuelga de cuatro funciones `SECURITY DEFINER`: `auth_clinica_id`, `auth_sucursal_id`, `auth_es_admin`, `auth_es_plataforma`, más `auth_es_personal` para separar al personal del rol `cliente`.
- El `superadmin` tiene `clinica_id = null` y por eso **no ve datos clínicos de nadie**. No se le abren excepciones en policies de negocio.

**Inmutabilidad**
- Historial clínico cerrado: no se edita. Consentimientos firmados, cobros, notas de internación e informes: **solo INSERT**.
- Internación congelada tras el alta.
- El esquema sanitario **sí se corrige** — es la excepción, y es deliberada: se carga historial previo y hay que poder enmendarlo.

**Dinero e inventario**
- **Stock nunca negativo**, garantizado por constraint y por trigger.
- **Stock fraccionado**: el stock se cuenta en envases y la aplicación en unidad de medida. De un frasco de 50 ml, aplicar 5 ml descuenta la fracción.
- **Precios congelados** en `cobro_lineas` y en `internaciones.precio_dia_bs`: se copian, no se recalculan.
- **Cobro de peluquería**: `precio_final_bs = precio_estimado_bs + Σ suplementos`. Las líneas del cobro tienen que sumar exactamente eso.
- **Bolivianos** con dos decimales en todo el negocio; **dólares** solo en la suscripción.

**Comunicación**
- **Tope mensual de WhatsApp por plan**, comprobado y consumido en una sola sentencia en la base. El contador lo reinicia el primer envío de cada mes, no la medianoche.
- WhatsApp **no es una API**: se compone un enlace `wa.me` y lo envía una persona desde su teléfono.

**Otras**
- **Zona horaria estricta `America/La_Paz`** en toda la lógica de fechas.
- **Secretos en variables de entorno.** Un secreto que entró en un commit está quemado: se rota, no se limpia.
- **Borrar un cliente**: solo fichas sin mascotas. La cascada se llevaría el expediente médico de cada una.
- **Todo el código, la interfaz y los identificadores en español**, incluidos los nombres de columna.

---

## 7. Modelo de datos

42 tablas. Todas las de dominio llevan `clinica_id` (para RLS) y `created_at`.

**Núcleo y plataforma** — `planes`, `clinicas`, `sucursales`, `usuarios`, `invitaciones`, `configuracion_plataforma`, `pagos_suscripcion`, `registro_errores`, `onboarding_usuario`

**Clientes y pacientes** — `clientes`, `pacientes`

**Clínico** — `citas`, `historial_clinico`, `vacunas_aplicadas`, `desparasitaciones_aplicadas`, `consentimientos_cirugia`, `recetas`, `informes_firmados`, `estudios_imagen`, `internaciones`, `notas_internacion`

**Inventario y compras** — `productos`, `movimientos_inventario`, `producto_lotes`, `proveedores`, `ordenes_compra`, `orden_compra_detalles`

**Caja** — `turnos_caja`, `cobros`, `cobro_lineas`, `servicios`

**Peluquería** — `peluqueria_fichas`, `peluqueria_servicios_config`, `peluqueria_servicio_insumos`, `peluqueria_ordenes`, `peluqueria_fotos`, `peluqueria_comisiones`, `peluqueria_configuracion`

**Petshop** — `petshop_promociones`, `petshop_devoluciones`, `petshop_configuracion`

**Vitrina** — `catalogo_productos`

**Storage**: tres buckets — `estudios` y `comprobantes` privados con URL firmada de una hora, `catalogo` público porque su propósito entero es mostrarse.

---

## 8. Historias de usuario (BDD)

**HU-01 — Consentimiento de cirugía**
*Dado* que se crea una cita de tipo `cirugia`, *cuando* se guarda, *entonces* el sistema la registra en `America/La_Paz` y habilita «Generar consentimiento». *Cuando* se firma, el registro queda inmutable.

**HU-02 — Cierre inmutable del historial**
*Dado* un historial en borrador con los datos obligatorios, *cuando* el veterinario cierra, *entonces* `editable` pasa a `false` y la RLS rechaza cualquier UPDATE.

**HU-03 — Stock nunca negativo**
*Dado* un producto con una unidad, *cuando* se intenta un egreso de dos, *entonces* la base rechaza la transacción y la pantalla dice «Stock insuficiente».

**HU-04 — El portal solo para clientes de la clínica**
*Dado* alguien que se registra eligiendo una clínica, *cuando* su WhatsApp no aparece en ninguna ficha de esa clínica, *entonces* no se crea nada —ni cuenta ni ficha— y se le dice que pida a su veterinaria que lo registre.

**HU-05 — Una mascota nueva no duplica a su dueño**
*Dado* un dueño que ya tiene ficha, *cuando* se registra otra mascota con su mismo WhatsApp, *entonces* la mascota cuelga de la ficha existente. *Y* si dos fichas comparten ese número, se crea una nueva en vez de adivinar.

**HU-06 — El dueño ve que vino, aunque falte el informe**
*Dado* una mascota con visitas cuya consulta el veterinario no ha firmado, *cuando* el dueño abre su ficha en el portal, *entonces* ve la visita con su fecha y el aviso de que el informe está pendiente.

**HU-07 — Borrar un cliente no destruye un expediente**
*Dado* una ficha con mascotas, *cuando* se intenta borrarla, *entonces* la base lo rechaza diciendo cuántas mascotas tiene. Solo se borran fichas vacías.

**HU-08 — La vitrina es el inventario**
*Dado* un producto del inventario, *cuando* el administrador lo publica en la Tienda, *entonces* se copian nombre, categoría y precio de venta —nunca el costo ni el stock— y el precio se mantiene al día solo.

---

## 9. Estado de la inteligencia artificial

**Encendida el 2 de septiembre de 2026.** Hasta ese día la función estaba desplegada pero
`ANTHROPIC_API_KEY` no estaba en los secretos, así que **nunca había llamado al modelo**: todo salía de las plantillas deterministas de `lib/asistente.ts` y la interfaz lo indicaba con la insignia «Plantilla del sistema».

**Lo que hace:** la Edge Function `asistente`, en Deno, con salida estructurada, caché del prompt y respaldo ante rechazos del clasificador. Redacta tres cosas: **el aviso de WhatsApp al cliente**, **la nota interna al equipo** y **el informe del día** para administración — y responde preguntas abiertas sobre el negocio con el copiloto **«Pregúntale a Vetora»**, que consulta la base con herramientas de solo lectura y RLS (detalle técnico en `CLAUDE.md`).

**No es un solo modelo, son dos, y la elección vive en el servidor** (`modelos.ts`): redactar y ordenar cifras ya dadas no exige razonar, así que aviso, nota interna e informe van con **`claude-haiku-4-5`**; el copiloto —que decide qué consultar y encadena varias herramientas— va con **`claude-sonnet-5`**. El modelo nunca llega del cliente.

**El tope de gasto es una segunda palanca, y va aparte del módulo.** `planes.ia_limite` cuenta consultas al mes y lo consume `consumir_cuota_ia()` (migración 0038), con el mismo mecanismo atómico que la cuota de WhatsApp. **Cero significa sin copiloto aunque el plan traiga `asistente_ia`**: el módulo abre la pantalla, el tope paga los tokens. Se reparte a razón de unas tres consultas por dólar de suscripción, y `ia_uso` registra qué costó cada llamada — sin guardar la pregunta, la respuesta ni ningún identificador de paciente.

**Las reglas que ya gobiernan su uso, y que cualquier ampliación tiene que respetar:**

- **La clave nunca está en el frontend.** Cualquier `VITE_*` viaja en el bundle. El modelo se llama desde la Edge Function.
- **La IA no escribe en la base.** Redacta y propone; quien guarda o envía es una persona.
- **Lo que sale hacia Anthropic está acotado en un solo sitio** (`contextoDeAviso()`): paciente, especie, nombre de pila del dueño, fecha y procedimiento. No salen el teléfono, el CI, el diagnóstico ni el historial.
- **La interfaz enseña el origen del texto.** Mientras salga de plantilla, no se puede presentar como escrito por la IA.
- Lo que se deriva de la base —los avisos programados, el resumen del día, la sugerencia de reposición— **es determinista y no se le pide a un modelo**. Una cuenta no se conjetura.

**Lo que queda por decidir:** qué papel más profundo cumple. Las candidatas que el producto sostiene hoy son leer el carnet de vacunas en papel, redactar el borrador de la consulta a partir de notas, y apoyo diagnóstico durante la consulta. Es una decisión de producto pendiente, no un compromiso de este documento.

---

## 10. Interfaz

### 10.1. Paleta

- **Primario / marca:** `teal-600` (hover `teal-700`)
- **Superficies:** `slate-50` global, `white` tarjetas
- **Texto:** `slate-800` principal, `slate-500` etiquetas
- **Éxito / pagado:** `emerald-600`
- **Peligro / cirugía:** `rose-600`
- **Advertencia / stock bajo:** `amber-500`

Tailwind v4 sin `tailwind.config.js`: el tema vive en `src/index.css`. Iconos `lucide-react`. **No hay modo oscuro.**

### 10.2. Tres formatos

La aplicación se usa en celular, tablet y escritorio, y la frontera es `md` (768 px). Casi todo se resuelve con clases, salvo tres piezas: `useEsEscritorio()` cuando la decisión es qué se monta y no cómo se ve, `PanelLateral` para el menú, y `TablaResponsive` — **una sola definición de columnas** que en celular se dibuja como tarjeta. Nunca dos marcados en paralelo.

### 10.3. El menú es el negocio

Cuando el negocio **es** una peluquería o un petshop, sus secciones **son** el menú lateral y de lo clínico solo sobreviven cuatro entradas: Caja General, Asistente, Respaldo y Catálogo. Una veterinaria con peluquería integrada no cambia: ahí es una sección más.

⚠️ La ruta `/agenda` **nunca se gatea por módulo**: es el destino al que rebotan los guardianes, y cerrarla colgaría la aplicación en un bucle de redirecciones. Su entrada del menú sí se gatea, que es otra cosa.

---

## 11. Stack técnico

| | |
|---|---|
| Frontend | React 19 + Vite 8, TypeScript estricto |
| Estilos | Tailwind CSS v4 |
| Base de datos y auth | Supabase — PostgreSQL + Auth + Edge Functions + Storage |
| Modelo de IA | `claude-haiku-4-5` (redacción) + `claude-sonnet-5` (copiloto), vía Edge Function en Deno |
| Despliegue | Vercel desde `main`; funciones y migraciones a mano |

**Verificación:** no hay runner de tests. La comprobación real es `npm run build` (los errores de tipo rompen el build), `npm run lint` y probar en el navegador con una cuenta real.

⚠️ **Las Edge Functions y las migraciones no viajan con `git push`.** Requieren `supabase functions deploy` y aplicar el SQL. Es la causa más frecuente de que un cambio «no aparezca».

---

## 12. Contacto

**José Gabriel Varas Arenas** — Técnico Veterinario Zootecnista, Gerente Propietario.
Contacto: 76838767 · [vetora.online](https://vetora.online)
