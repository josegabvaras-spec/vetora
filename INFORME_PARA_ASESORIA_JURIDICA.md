# Informe técnico para la asesoría jurídica — Vetora

**Fecha:** 2026-09-08 · **Preparado por:** revisión técnica del código y de la base de datos de producción

---

## Qué es este documento, y qué no

**No es un dictamen legal ni pretende serlo.** Es el inventario factual de qué datos personales trata Vetora, dónde están, quién puede verlos y qué los protege — todo verificado contra el código y contra la base de datos real, no de memoria.

Su propósito es que el tiempo de la asesoría se gaste en **criterio jurídico** y no en averiguar cómo funciona el sistema. Al final hay una lista de preguntas concretas que solo un abogado puede responder.

⚠️ **Toda afirmación sobre la normativa boliviana aplicable está fuera del alcance de este informe.** Hasta donde alcanza esta revisión, Bolivia no cuenta con una ley integral de protección de datos personales equivalente al RGPD, y la protección se articula por vía constitucional (acción de protección de privacidad) y normas sectoriales — **pero esto debe verificarse y actualizarse por la asesoría**, no darse por bueno: es precisamente el tipo de afirmación que este proyecto tiene por norma no hacer sin evidencia.

---

## 1. Resumen ejecutivo — lo que requiere decisión

| # | Asunto | Estado |
|---|---|---|
| 1 | La política **no informa de la transferencia internacional de datos** | Omisión deliberada, pendiente de redacción jurídica |
| 2 | La política afirma que **cada uso del respaldo queda registrado** — no es cierto | ⚠️ **Declaración no respaldada por el sistema** |
| 3 | La política afirma que el historial cerrado **no se puede borrar** — solo es cierto a medias | ⚠️ **Declaración parcialmente inexacta** |
| 4 | El sistema envía datos clínicos a un tercero en EE. UU. (Anthropic) | Implementado y acotado; declarado en la política |
| 5 | No existe contrato de encargo de tratamiento con los proveedores | Pendiente |
| 6 | No hay procedimiento documentado de notificación de brechas | Pendiente |
| 7 | Quién es responsable y quién encargado del tratamiento | **Calificación jurídica pendiente** |

Los puntos **2 y 3 son hallazgos nuevos de esta revisión** y son los más urgentes: un documento legal publicado que promete algo que el sistema no hace es peor que no prometerlo.

---

## 2. Datos personales que trata el sistema

### 2.1 Del dueño de la mascota (tabla `clientes`)

| Dato | Columna | Obligatorio | Notas |
|---|---|---|---|
| Nombre completo | `nombre` | Sí | |
| WhatsApp / teléfono | `whatsapp` | Sí | Se usa como factor de vinculación de cuentas |
| **Cédula de identidad** | `ci` | No (nullable) | **El dato más sensible que se guarda de una persona** |
| Correo electrónico | `usuarios.email` | Solo si abre cuenta en el portal | |

### 2.2 Del personal de la clínica (tabla `usuarios`)

Nombre, correo electrónico, WhatsApp y rol. La contraseña **no** está aquí: la gestiona Supabase Auth y la aplicación nunca la ve.

### 2.3 De la mascota (no es dato personal de una persona, pero acompaña al del dueño)

Historial clínico, diagnósticos, tratamientos, recetas, vacunas, desparasitaciones, peso, alergias, fotografía. **No son datos de salud humana.**

### 2.4 Firmas manuscritas — merece punto propio

Tres tablas guardan **firmas capturadas en el dispositivo, en base64**:

- `consentimientos_cirugia.firma_tutor` y `.firma_veterinario`
- `informes_firmados.firma_tutor` y `.firma_veterinario`
- La firma de recibos (`0017`)

⚠️ **Una firma manuscrita puede tener consideración de dato biométrico o de categoría especial en algunas jurisdicciones.** Es una pregunta directa para la asesoría, y no se había planteado antes.

### 2.5 Documentos e imágenes

| Contenido | Dónde | Visibilidad |
|---|---|---|
| Fotografía del paciente | Columna `pacientes.foto`, **dentro de la base**, como data URL base64 | Privada por RLS |
| Estudios de imagen | Bucket `estudios` | **Privado**, URL firmada de 1 hora |
| Comprobantes de pago | Bucket `comprobantes` | **Privado**, URL firmada de 1 hora |
| Fotos del catálogo comercial | Bucket `catalogo` | **PÚBLICO a propósito** — escaparate de productos |

⚠️ Los **comprobantes de pago** son fotografías de transferencias bancarias subidas por la clínica: pueden contener nombres de titulares, números de cuenta e importes. Están en bucket privado.

---

## 3. Dónde están físicamente los datos

| Componente | Proveedor | Ubicación |
|---|---|---|
| Base de datos, Auth y archivos | **Supabase** | **São Paulo, Brasil** |
| Aplicación web (estático + CDN) | **Vercel** | EE. UU. / red global |
| Asistente de IA | **Anthropic** | EE. UU. |

⚠️ **La ubicación de Supabase (São Paulo) procede de la documentación interna del proyecto y debe confirmarse en el panel de Supabase antes de declararla en un documento legal.** No pude verificarla independientemente desde el entorno de revisión.

**Hay transferencia internacional de datos personales en los tres casos.** Es el punto 1 del resumen.

---

## 4. Qué se envía al proveedor de IA, exactamente

Esto está acotado en el código en un solo sitio (`contextoDeAviso()`), y **verificado**:

**Se envía:** nombre de la mascota, especie, **nombre de pila** del dueño (no el apellido), fecha, tipo de procedimiento. Cuando el personal consulta sobre un paciente concreto, además su historial clínico cerrado y sus recetas.

**No se envía nunca:** cédula de identidad, teléfono, correo electrónico, fotografías.

**La separación está implementada, no es una intención**: las herramientas del asistente son una lista blanca de solo lectura y ninguna devuelve esos campos. Verificado en esta revisión.

---

## 5. Controles técnicos existentes (verificados)

| Control | Estado | Cómo se verificó |
|---|---|---|
| Aislamiento entre clínicas | ✅ En la base de datos (RLS), no en la pantalla | Retest del 2026-09-08, 29 hallazgos |
| El operador no ve datos clínicos | ✅ Por diseño (`clinica_id` nulo) | Verificado en producción |
| Segundo factor obligatorio para el operador | ✅ Exigido por la RLS, no solo por la pantalla | Verificado en producción |
| Cifrado en tránsito | ✅ HTTPS + HSTS | `curl -I` contra producción |
| Cifrado en reposo | ⚠️ **Nunca verificado** — propiedad del proveedor | La política ya lo dice así, correctamente |
| Historial cerrado inmutable ante modificación | ✅ Trigger + policy | Lectura del SQL |
| Contraseñas | ✅ La aplicación nunca las ve | Supabase Auth |
| Buckets privados | ✅ `estudios` y `comprobantes`, URL firmada 1 h | Verificado |

---

## 6. ⚠️ Discrepancias entre la política publicada y el sistema

**Son hallazgos de esta revisión. Los dos son declaraciones publicadas que el sistema no respalda.**

### 6.1 «Cada uso [de la función de respaldo] queda registrado» — NO ES CIERTO

La política, sección 4, declara que existe una función que permite al operador extraer los datos de una clínica, y añade: *«solo nosotros podemos ejecutarla, y cada uso queda registrado»*.

**Las dos primeras afirmaciones son ciertas. La tercera no.** La Edge Function `respaldo-clinica` valida quién llama, exige superadmin con segundo factor y vuelca las 37 tablas — pero **no escribe ningún registro de auditoría**. No hay `insert` en ninguna bitácora: ni en `registro_errores`, ni en `ia_uso`, ni en una tabla propia.

**Consecuencia:** se le promete al titular de los datos una trazabilidad que no existe. Si alguien preguntara «¿quién accedió a mis datos y cuándo?», hoy no hay forma de responder.

**Dos salidas posibles**, y la elección es en parte jurídica:
1. **Implementar el registro** — es una tabla y un `insert`; técnicamente es trabajo de una tarde.
2. **Corregir la política** para no afirmarlo.

Recomendación técnica: la primera. Es una promesa razonable y barata de cumplir, y una vez implementada la política pasa a ser cierta.

### 6.2 «El historial clínico, una vez cerrado, no se puede modificar ni borrar» — CIERTO A MEDIAS

- **«No se puede modificar»**: ✅ cierto. `trg_historial_inmutable` y la policy `historial_update` lo impiden.
- **«Ni borrar»**: ⚠️ **no está garantizado.**

`trg_paciente_sin_caja` (migración `0049`, verificada aplicada) bloquea el borrado de un paciente **solo si tiene cobros registrados en caja** — cuenta `cobros`, no historiales. Un paciente **con historial clínico cerrado pero sin ningún cobro asociado** puede borrarse, y la cascada de claves foráneas se lleva el historial, las recetas, las vacunas y los consentimientos firmados.

Las cascadas de clave foránea **no evalúan la RLS ni disparan los triggers `before update`**, así que la inmutabilidad no las alcanza.

**Consecuencia:** el expediente médico de un animal puede desaparecer por una vía que la política declara imposible. El caso realista no es malicioso: alguien borra una ficha duplicada.

**Salida:** extender `trg_paciente_sin_caja` para que cuente también historiales cerrados, con el mismo escape que ya lleva para `eliminar-clinica`. Técnicamente es añadir una condición al trigger que ya existe.

---

## 7. Ejercicio de derechos: qué se puede hacer hoy

| Derecho | Dueño de mascota | Clínica |
|---|---|---|
| **Acceso** | ✅ Portal: ve y descarga el expediente de sus mascotas | ✅ `/respaldo`: exporta 37 tablas en ZIP |
| **Rectificación** | ⚠️ Indirecto — debe pedírselo a su clínica | ✅ Directo |
| **Supresión** | ⚠️ Indirecto, y ver 6.2 | ✅ Baja completa e irreversible |
| **Portabilidad** | ⚠️ Parcial — puede imprimir, no exportar en formato estructurado | ✅ CSV en ZIP |
| **Oposición** | ❌ No existe mecanismo | ❌ No existe |

⚠️ **No hay borrado automático por antigüedad.** Los datos se conservan mientras la clínica mantenga la cuenta. Para un expediente médico veterinario eso puede ser lo correcto —conviene que lo confirme la asesoría— pero **es una decisión que hoy no está justificada por escrito en ningún sitio**.

---

## 8. Lo que no existe y probablemente haga falta

1. **Contrato de encargo de tratamiento** con Supabase, Vercel y Anthropic. Los tres tratan datos personales por cuenta de Vetora.
2. **Procedimiento de notificación de brechas**: a quién se avisa, en qué plazo, con qué contenido.
3. **Registro de actividades de tratamiento**, si la normativa lo exige.
4. **Base de licitud del tratamiento** documentada — ¿consentimiento, ejecución de contrato, interés legítimo?
5. **Consentimiento informado para el tratamiento de datos**, distinto del consentimiento quirúrgico que ya existe (ese es médico, no de protección de datos).
6. **Términos y condiciones** del servicio para las clínicas.
7. **Cláusula sobre menores**: no se recogen datos de menores, pero no está declarado.

---

## 9. Preguntas concretas para la asesoría

Ordenadas por lo que bloquea más decisiones técnicas:

1. **¿Vetora es responsable o encargado del tratamiento?** ¿Y la clínica? La política tenía una afirmación al respecto y **se retiró precisamente porque es una calificación jurídica que no nos corresponde hacer**. De la respuesta depende quién responde ante el titular.

2. **¿Cómo debe declararse la transferencia internacional** (Brasil y EE. UU.)? Hay dos secciones ya redactadas y retiradas de la vista esperando esta respuesta.

3. **¿Una firma manuscrita capturada en pantalla es dato biométrico** o de categoría especial? Afecta a tres tablas.

4. **¿La cédula de identidad tiene régimen especial** en Bolivia? Es el identificador más sensible que se guarda, y se usa para vincular cuentas.

5. **¿Cuánto tiempo debe conservarse un expediente clínico veterinario?** Hoy es indefinido, sin justificación escrita.

6. **¿Hace falta consentimiento expreso** para tratar los datos del dueño, más allá de la relación contractual con la clínica?

7. **¿Es suficiente que el dueño ejerza sus derechos a través de su clínica**, o Vetora debe ofrecer un canal directo?

8. **¿Qué obligación de registro de accesos existe?** Determina si el punto 6.1 se resuelve implementando o redactando.

9. **¿Es exigible la notificación de brechas** y en qué plazo?

---

## 10. Lo que esta revisión NO cubre

- **No es un dictamen legal.** Nada aquí debe leerse como afirmación de cumplimiento.
- **No verifiqué la ubicación física de Supabase** — procede de documentación interna.
- **No verifiqué el cifrado en reposo.** Es una propiedad del proveedor que nadie ha comprobado, y la política ya lo dice así, que es lo correcto.
- **No revisé las condiciones contractuales** de Supabase, Vercel ni Anthropic.
- **No evalué normativa sanitaria veterinaria** boliviana, que puede imponer sus propias obligaciones de conservación.
