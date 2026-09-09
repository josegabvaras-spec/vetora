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
| 2 | La política afirmaba que **cada uso del respaldo queda registrado** — no era cierto | ✅ **Corregido el mismo día**: la bitácora ya existe y registra cada uso |
| 3 | La política afirmaba que el historial cerrado **no se puede borrar** — era cierto solo a medias, por tres vías distintas | ✅ **Corregidas las tres vías el mismo día** |
| 4 | El sistema envía datos clínicos a un tercero en EE. UU. (Anthropic) | Implementado y acotado; declarado en la política |
| 5 | No existe contrato de encargo de tratamiento con los proveedores | Pendiente |
| 6 | No hay procedimiento documentado de notificación de brechas | Pendiente |
| 7 | Quién es responsable y quién encargado del tratamiento | **Calificación jurídica pendiente** |

Los puntos 2 y 3 fueron hallazgos nuevos de esta revisión, detectados y **corregidos técnicamente el mismo día**. Se conservan en este informe con su historial completo — qué decía la política, qué hacía el sistema, y qué se hizo — porque forman parte del registro de cómo se trató el hallazgo, no porque sigan abiertos.

---

## 2. Datos personales que trata el sistema

### 2.1 Del dueño de la mascota (tabla `clientes`)

| Dato | Columna | Obligatorio | Notas |
|---|---|---|---|
| Nombre completo | `nombre` | Sí | |
| WhatsApp / teléfono | `whatsapp` | Sí | Se usa como factor de vinculación de cuentas |
| **Cédula de identidad** | `ci` | No (nullable) | **El dato más sensible que se guarda de una persona** |
| Correo electrónico | `usuarios.email` | Solo si abre cuenta en el portal | |

⚠️ **El CI merece punto propio, por lo que representa y por lo poco que el sistema lo distingue del resto de la ficha.** Verificado contra el código, no supuesto:

- **Qué es hoy, técnicamente:** la columna (`clientes.ci`, migración `0001`) es texto libre — sin `unique`, sin `check` de formato, sin dígito verificador. Nunca se valida ni la longitud ni la forma de lo escrito, solo se recorta el espacio en blanco. Es nullable: una ficha puede no tenerlo.
- **Para qué se usa realmente:** nunca como control de acceso ni como prueba de identidad, sino como clave de coincidencia entre dos escrituras del mismo número, para dos decisiones concretas: vincular una cuenta nueva del portal a una ficha de cliente ya existente, y reusar la ficha de un dueño cuando se registra una segunda mascota a su nombre. El propio código lo dice sin rodeos: *"No es prueba de identidad —los dos son datos que un conocido podría saber—, sube el listón de «sé tu carnet» a «sé tu carnet y tu teléfono»."* Nadie en el sistema lo comprueba contra ningún documento ni servicio real —no hay integración con SEGIP ni con nada parecido—: es autodeclarado de principio a fin.
- **Quién lo ve, sin ninguna restricción adicional a la de cualquier otro dato de la ficha:** los tres roles de personal por igual —admin, veterinario, recepción; la policy de la base no distingue esta columna de las demás—, el propio dueño desde su portal, seis documentos que se imprimen (cuatro de ellos accesibles también al dueño, porque es su propio dato), y el volcado completo del respaldo en CSV, que puede generar tanto el admin como recepción sin que esa columna se excluya. El operador de la plataforma también puede extraerlo clínica por clínica, pero eso ya está acotado con MFA y registrado en bitácora (punto 6.1).
- **Lo que no cambia:** sigue sin enviarse nunca al asistente de IA — reverificado al ampliar este punto.

Es "el dato más sensible que se guarda" por lo que representa —identifica a una persona de forma unívoca en Bolivia—, no porque el sistema lo trate con un régimen distinto al resto de la ficha del cliente. Esa distancia entre lo sensible que es y lo poco que se lo distingue es justo lo que las preguntas 4.1 a 4.3 de la sección 9 le piden a la asesoría.

### 2.2 Del personal de la clínica (tabla `usuarios`)

Nombre, correo electrónico, WhatsApp y rol. La contraseña **no** está aquí: la gestiona Supabase Auth y la aplicación nunca la ve.

### 2.3 De la mascota (no es dato personal de una persona, pero acompaña al del dueño)

Historial clínico, diagnósticos, tratamientos, recetas, vacunas, desparasitaciones, peso, alergias, fotografía. **No son datos de salud humana.**

### 2.4 Firmas manuscritas — merece punto propio

**Dos tablas** guardan **firmas capturadas en el dispositivo, en base64** — no tres, como decía una versión anterior de este informe: `consentimientos_cirugia.firma_tutor`/`.firma_veterinario`, e `informes_firmados.firma_tutor`/`.firma_veterinario`, donde también vive la firma de recibos. La migración `0017` no crea una tabla propia para el recibo: añade `'recibo'` como un valor más de `tipo` en `informes_firmados`, con `paciente_id` opcional para la venta de mostrador.

⚠️ **Verificado contra el código, no supuesto:**

- **Qué es exactamente lo que se guarda:** un único componente en todo el sistema captura el trazo sobre un `<canvas>` y, al soltar, lo convierte en una imagen PNG (`toDataURL()`). Solo se persiste **la imagen final rasterizada** — nunca la secuencia de puntos, la velocidad ni la presión del trazo, que existen momentáneamente en pantalla mientras se dibuja pero se descartan de inmediato y no llegan a guardarse en ningún campo. Es el equivalente digital de una foto de una firma en papel, no un dato biométrico dinámico.
- **Cuándo es obligatoria:** para el consentimiento firmado digitalmente (uno de sus tres métodos posibles; los otros dos —firma física escaneada, aceptación verbal registrada— no producen ningún trazo), y como condición para **imprimir** un informe, un historial o un recibo: el botón de imprimir permanece deshabilitado sin firma. No es obligatoria para cerrar una consulta ni para cobrar — firmar es un paso posterior y separado, solo para poder emitir el papel.
- **Inmutabilidad:** las dos tablas son solo INSERT y SELECT — no existe ninguna policy de UPDATE ni DELETE sobre una firma ya guardada, con la misma salvedad de las cascadas por FK que ya se explica en el punto 6.2 de este informe.
- **Quién la ve:** el personal con acceso al expediente clínico (admin, veterinario, recepción; el peluquero queda fuera desde `0053`), y el propio dueño desde su portal —incluida la firma del veterinario, no solo la suya— para los consentimientos e informes de su mascota. La **única excepción es el recibo**: al no llevar paciente asociado, la política de acceso del portal no puede resolverlo, y esa firma queda estructuralmente invisible para el dueño aunque conozca la dirección del documento.
- **Ya no sale en el respaldo CSV.** Hasta esta revisión sí salía íntegra, en las dos tablas, sin ningún filtro —al contrario que la fotografía del paciente, que ya se excluía del CSV y se movía a una carpeta aparte—. Se corrigió el mismo día (H-32 en `SEGURIDAD.md`): la firma recibe ahora el mismo tratamiento que la foto, en una carpeta `firmas/` propia dentro del mismo ZIP, sin perder el dato. No es una corrección exigida por ninguna norma confirmada —es minimización de datos, aplicada por decisión propia mientras se espera la calificación legal—. Nunca se envía al asistente de IA.
- **Nunca se compara contra ninguna firma de referencia.** Se guarda y se muestra, pero no hay ningún proceso de verificación: es evidencia de que alguien trazó algo en el dispositivo en ese momento, no una comprobación de identidad.

Es sensible en un sentido distinto al del CI (punto 2.1): no identifica por sí sola a nadie de forma unívoca, pero su naturaleza —un trazo manuscrito capturado digitalmente— es justo lo que algunas jurisdicciones tratan como dato biométrico o de categoría especial, sin que el sistema le dé hoy ningún tratamiento reforzado frente al resto del expediente.

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

**Sobre la ubicación de la base de datos:** confirmada por el responsable del producto — São Paulo (`sa-east-1`) es la única región sudamericana que ofrece Supabase, elegida por proximidad a Bolivia. No pude verificarla desde el entorno de revisión (las cabeceras HTTP devuelven el nodo de CDN en La Paz, no la ubicación de la base). ⚠️ **Para el expediente conviene una captura del panel** (Supabase → proyecto → Settings → General): evidencia primaria en vez de declaración de parte.

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

## 6. Dos discrepancias encontradas y corregidas el mismo día

Se conservan aquí con su historial completo — qué decía la política, qué hacía realmente el sistema, y qué se corrigió — porque forman parte de cómo se trató el hallazgo, no porque sigan abiertas. Un informe que borrara el problema en cuanto se resuelve no serviría para acreditar diligencia.

### 6.1 «Cada uso [de la función de respaldo] queda registrado» — CORREGIDO

**Lo que decía la política, sección 4:** que existe una función que permite al operador extraer los datos de una clínica, y que *«solo nosotros podemos ejecutarla, y cada uso queda registrado»*.

**Lo que hacía el sistema hasta hoy:** las dos primeras partes eran ciertas. La tercera no. La función validaba quién llamaba, exigía segundo factor y volcaba las tablas — pero **no escribía ningún registro de auditoría**. Se prometía al titular de los datos una trazabilidad que no existía.

**Corrección aplicada:** se creó una bitácora dedicada (mismo patrón que ya usan otras tablas de auditoría del sistema: solo puede insertarse, solo el operador puede leerla, nadie puede editarla ni borrarla después — una bitácora editable no sería prueba de nada). Cada uso de la función queda ahora registrado con quién la ejecutó, sobre qué clínica, qué operación, si tuvo éxito y cuántos datos movió. Se registra también cuando falla, para que un intento fallido no desaparezca sin dejar rastro.

**Estado:** la política ya es cierta tal como está redactada. No fue necesario cambiar el texto.

### 6.2 «El historial clínico, una vez cerrado, no se puede modificar ni borrar» — CORREGIDO (tres vías, las tres cerradas)

- **«No se puede modificar»**: cierto, y seguía siéndolo antes de esta corrección.
- **«Ni borrar»**: no estaba garantizado, y por **tres vías distintas** — la tercera se descubrió al cerrar las dos primeras.

**Vía 1 — borrar la ficha del paciente.** La única protección existente impedía borrar un paciente si tenía cobros pendientes en caja; no comprobaba en absoluto si tenía historial clínico. Un paciente con consultas cerradas y sin ningún cobro asociado podía borrarse, arrastrando su historial, recetas, vacunas y consentimientos firmados.

**Vía 2 — borrar la cita, no el paciente (la más grave de las tres).** El historial clínico está vinculado a la cita en la que se generó, y al borrarse esa cita el historial se borraba con ella. Borrar una cita es una operación habitual del personal —cancelaciones, limpieza de agenda—, muy distinta de borrar un paciente entero. Cualquier miembro del personal podía, sin darse cuenta, destruir un expediente médico simplemente al borrar la cita asociada.

**Vía 3 — borrar el paciente arrastrando una internación ya cerrada.** El mismo problema de la vía 1, aplicado a otro tipo de registro: una internación que ya había concluido (dado de alta el animal) se prometía «congelada», pero solo frente a modificaciones, no frente a que se borrara el paciente completo. Sin ningún cobro asociado a esa internación, se perdía igual que el historial de la vía 1.

**Corrección aplicada:**
- Se retiró la posibilidad de borrar citas directamente. El personal sigue pudiendo cancelarlas —que es la operación que realmente usa la aplicación—, pero ya no puede eliminarlas de la base de datos.
- La protección existente sobre el borrado de pacientes se amplió para bloquear también cuando el paciente tiene historiales clínicos **cerrados**, y también cuando tiene internaciones **ya concluidas**. En ambos casos, lo que sigue en curso —una consulta sin terminar, una internación activa— no bloquea el borrado: solo se protege lo que ya se cerró y se promete definitivo.

**Estado:** las tres vías quedan cerradas y verificadas en producción. La política ya es cierta en su totalidad.

### 6.3 Los controles pueden revertirse en silencio — incidente del 2026-09-08

Se declara porque es material para valorar si las medidas son adecuadas, aunque no hubo filtración.

**Qué pasó:** durante esta misma revisión se reejecutó por error una actualización antigua de la base de datos. Al hacerlo se desactivaron **dos controles de seguridad** que llevaban semanas funcionando: el **segundo factor obligatorio** de la cuenta de operador, y el **bloqueo de clínicas suspendidas**. Estuvieron caídos varias horas.

**Por qué no se notó:** no hubo ningún error. El sistema siguió funcionando con normalidad, y la pantalla que pide el código de verificación **seguía apareciendo igual** — porque esa pantalla es una comodidad, no la barrera real. Nada en la aplicación lo delataba.

**Alcance real, para no exagerarlo ni minimizarlo:**

- **No hubo acceso indebido ni filtración entre clínicas.** El aislamiento por clínica siguió intacto en todo momento: ninguna cuenta pudo ver datos de otra.
- Lo que quedó temporalmente sin protección fueron **el segundo factor de la cuenta de operador** y **la restricción de acceso a clínicas suspendidas**.
- Se detectó porque se estaba verificando el estado real de la base, no porque el sistema avisara.

**Qué se hizo:** los dos controles se restauraron el mismo día y se verificó su funcionamiento por los dos caminos afectados. Además se creó un **procedimiento de comprobación** que contrasta el estado real de las protecciones contra lo que deberían ser y devuelve un resultado inmediato. Ejecutado tras la reparación: sin discrepancias.

**Por qué está en este informe:** una lista de medidas de seguridad no dice nada si esas medidas pueden desactivarse sin dejar rastro. La pregunta relevante para la asesoría no es solo *qué controles existen*, sino *cómo se sabe que siguen activos* — y hasta hoy no había respuesta a la segunda.

---

## 7. Ejercicio de derechos: qué se puede hacer hoy

| Derecho | Dueño de mascota | Clínica |
|---|---|---|
| **Acceso** | ✅ Portal: ve y descarga el expediente de sus mascotas | ✅ `/respaldo`: exporta 37 tablas en ZIP |
| **Rectificación** | ⚠️ Indirecto — debe pedírselo a su clínica | ✅ Directo |
| **Supresión** | ⚠️ Indirecto (debe solicitarse a la clínica) | ✅ Baja completa e irreversible |
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

3. **Sobre las firmas manuscritas**, ampliado con los hechos verificados en la sección 2.4 (afecta a **dos** tablas, no tres):
   - 3.a. ¿Una imagen estática del trazo final —sin presión, velocidad ni secuencia de puntos— sigue considerándose dato biométrico, o esa calificación exige el componente dinámico que aquí no se guarda?
   - 3.b. Si se considera dato sensible de todos modos, ¿bastan las protecciones ya existentes (inmutabilidad, acceso acotado al personal con expediente y al propio dueño, y desde esta revisión también fuera del respaldo en CSV — ver sección 2.4), o hace falta algo adicional?
   - 3.c. ¿Cambia algo que el dueño pueda ver también la firma del veterinario, no solo la suya, en el consentimiento de su propia mascota?

4. **Sobre la cédula de identidad**, ampliado con los hechos verificados en la sección 2.1:
   - 4.1. ¿Tiene el CI boliviano un **régimen jurídico especial** (dato sensible o de categoría reforzada) que exija medidas más allá de las que ya existen?
   - 4.2. ¿Es jurídicamente aceptable que se use **solo como clave de coincidencia autodeclarada**, nunca verificada contra un documento real, tal como el propio sistema lo documenta y lo limita?
   - 4.3. ¿El **nivel de exposición actual** —igual para los tres roles de personal, impreso en varios documentos, volcado íntegro en el respaldo en CSV— es adecuado para "el dato más sensible que se guarda", o debería acotarse (por ejemplo, ocultarlo a algún rol, excluirlo del CSV, o enmascararlo en lo impreso)?

5. **¿Cuánto tiempo debe conservarse un expediente clínico veterinario?** Hoy es indefinido, sin justificación escrita.

6. **¿Hace falta consentimiento expreso** para tratar los datos del dueño, más allá de la relación contractual con la clínica?

7. **¿Es suficiente que el dueño ejerza sus derechos a través de su clínica**, o Vetora debe ofrecer un canal directo?

8. **¿La bitácora ya implementada (punto 6.1) satisface el estándar de registro de accesos exigible?** Registra quién, sobre qué clínica, qué operación, resultado y volumen de datos — pero no queda claro si ese nivel de detalle es suficiente o si hace falta algo adicional (por ejemplo, la dirección IP de origen).

9. **¿Es exigible la notificación de brechas** y en qué plazo?

---

## 10. Lo que esta revisión NO cubre

- **No es un dictamen legal.** Nada aquí debe leerse como afirmación de cumplimiento.
- **No verifiqué la ubicación física de Supabase** — procede de documentación interna.
- **No verifiqué el cifrado en reposo.** Es una propiedad del proveedor que nadie ha comprobado, y la política ya lo dice así, que es lo correcto.
- **No revisé las condiciones contractuales** de Supabase, Vercel ni Anthropic.
- **No evalué normativa sanitaria veterinaria** boliviana, que puede imponer sus propias obligaciones de conservación.
