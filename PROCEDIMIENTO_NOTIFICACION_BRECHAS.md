# Procedimiento de notificación de brechas de seguridad — Vetora

**Versión:** 1.0 · **Fecha:** 2026-09-08 · **Responsable de mantenerlo al día:** dueño del producto

⚠️ **Esto es un procedimiento operativo, no un dictamen legal.** Dice qué hacer y en qué orden. No
afirma cuál es el plazo legal exigible en Bolivia para notificar a una autoridad o a un titular de
datos — eso sigue pendiente de la asesoría jurídica (pregunta 9 del informe técnico principal). Los
plazos de aquí son los que **los propios proveedores prometen contractualmente**, o una práctica
razonable donde no hay plazo contractual ni legal conocido. Se marca cada uno como lo que es.

---

## Qué cuenta como «brecha de seguridad» en Vetora

Cualquiera de estos, no solo la fuga masiva de datos:

- Acceso no autorizado a datos de una clínica (propia o de otra) — incluida la lectura, no solo la
  modificación.
- Un control de seguridad que se cae sin que nadie lo note (ya pasó una vez: ver «Precedente» más
  abajo).
- Pérdida o robo de un dispositivo con acceso a cuentas de administración de la plataforma.
- Un proveedor (Supabase, Vercel, Anthropic) notifica una brecha de la que Vetora depende.
- Credenciales expuestas — una clave, una contraseña, un secreto de la Edge Function.
- Cualquier comportamiento del sistema que sugiera que alguien vio o modificó datos que no debía.

**No hace falta confirmar que hubo daño para arrancar este procedimiento.** La sospecha razonable
basta para pasar al paso 1 — descartarla es parte del proceso, no una condición para empezarlo.

---

## Precedente: lo más parecido a una brecha que ya ocurrió

El 2026-09-08, al re-ejecutar por error una migración antigua, quedaron desactivados sin ningún
error visible el segundo factor del superadmin y el bloqueo de clínicas suspendidas, durante varias
horas. **No fue una brecha** —nadie accedió a datos que no debía, el aislamiento entre clínicas
nunca falló— pero es exactamente el tipo de evento que este procedimiento existe para cubrir: un
control de seguridad cayó, sin aviso, y se detectó porque alguien estaba verificando. Ver H-30/H-31
y el incidente del `0050` en `SEGURIDAD.md`.

Ese incidente es también el origen de dos de las herramientas que alimentan el paso 1 de aquí abajo.

---

## Paso 1 — Detección

Fuentes reales por las que Vetora puede enterarse de que algo pasó, de más a menos probable:

| Fuente | Qué avisa | Plazo que promete |
|---|---|---|
| **Supabase** (DPA) | Si el incidente ocurre en su infraestructura | 48 horas desde que ellos lo detectan |
| **Anthropic** (DPA) | Si ocurre en el procesamiento del asistente de IA | 48 horas |
| **Vercel** (DPA, solo en plan de pago) | Si ocurre en el hosting | «Sin dilación indebida», sin plazo fijo |
| **`supabase/verificacion/estado_rls.sql`** | Deriva entre lo que el código dice y lo que la base tiene aplicado de verdad | Inmediato, si se ejecuta |
| **Una clínica o un dueño de mascota** | Algo que vieron y no debían, o que no ven y deberían | Variable |
| **Revisión propia / retest** | Cualquier hallazgo de seguridad al auditar el código | Cuando se haga la revisión |

⚠️ **`estado_rls.sql` no corre solo.** Hoy es una consulta manual — no hay una tarea programada que
la ejecute periódicamente. Mientras eso no cambie, su valor depende de acordarse de correrla después
de cada migración y de vez en cuando sin motivo aparente.

## Paso 2 — Clasificación inmediata

Antes de investigar a fondo, una primera estimación basta para decidir la urgencia:

| Severidad | Criterio | Ejemplo |
|---|---|---|
| **CRÍTICA** | Cruza el aislamiento entre clínicas, o compromete la cuenta de plataforma | Una clínica lee datos de otra; el superadmin pierde su segundo factor |
| **ALTA** | Compromete datos de una sola clínica, sin cruzar a otras | Credenciales de un usuario filtradas |
| **MEDIA** | Un control cae, pero no hay evidencia de que se haya explotado | El incidente del `0050`: controles caídos, sin acceso indebido detectado |
| **BAJA** | Hallazgo de hardening, sin explotación posible ni sospechada | Una función sin `search_path` fijado |

## Paso 3 — Contención

Antes de notificar a nadie, parar el sangrado si lo hay:

1. Si es una función/policy de la RLS: aplicar el fix en una transacción, verificarlo, y correr
   `estado_rls.sql` para confirmar que no queda ninguna otra deriva relacionada.
2. Si es una credencial expuesta: **rotarla de inmediato** — nunca «limpiar» el historial de git
   (ver H-4 en `SEGURIDAD.md`, la doctrina ya establecida del proyecto).
3. Si es una cuenta comprometida: desactivarla (`activo = false`) y, si hace falta, forzar el cierre
   de sesión cambiando la contraseña.
4. Documentar cada acción de contención con hora exacta — hace falta para el paso 5.

## Paso 4 — Evaluación de alcance

Antes de notificar, saber **a quién** afecta:

- ¿Cuántas clínicas? ¿Cuáles?
- ¿Qué tipo de dato? (¿CI? ¿Historial clínico? ¿Solo metadatos?)
- ¿Cuántas personas, aproximadamente?
- ¿Hay evidencia de que alguien accedió de verdad, o solo de que *pudo* acceder?

Estas dos últimas preguntas son las que separan CRÍTICA de MEDIA en la práctica, y las que un
abogado va a pedir primero si hay que decidir si se notifica a una autoridad.

## Paso 5 — Notificación

### A quién, y en qué orden

```
1. Interno (inmediato)         → quien administra la plataforma se entera y arranca el proceso
2. Clínicas afectadas          → son responsables de los datos de sus clientes; necesitan saber
                                  para decidir si notifican ellas a sus propios dueños de mascota
3. Dueños de mascota afectados → solo si la clínica lo decide, o si Vetora no puede localizar
                                  a la clínica y el riesgo es alto
4. Autoridad competente        → SI la asesoría jurídica confirma que es exigible (pendiente)
```

⚠️ **El orden 2 antes que 3 no es arbitrario.** La clínica es quien tiene la relación directa con
el dueño de la mascota — es su cliente, no el de Vetora. Que Vetora notifique directamente a un
dueño de mascota sin pasar por su clínica sería raro salvo que la clínica sea inlocalizable o el
riesgo sea urgente. Esto depende de cómo se resuelva la pregunta 1 del informe principal (quién es
responsable y quién encargado) — si la asesoría concluye algo distinto, este orden se revisa.

### Plazos

| Notificación | Plazo | Base |
|---|---|---|
| A la clínica afectada | **72 horas** desde que Vetora confirma el incidente | Práctica recomendada (referencia: el estándar de 72h a autoridad del RGPD, usado aquí como buena práctica, NO como obligación legal boliviana confirmada) |
| A la autoridad competente | **Pendiente de confirmar** | Depende de qué exija la normativa boliviana — pregunta abierta para la asesoría |

### Qué debe decir la notificación

- Qué pasó, en lenguaje simple, sin tecnicismos.
- Qué datos están involucrados (categorías, no listas de personas).
- Qué se hizo ya para contenerlo.
- Qué va a hacer la clínica/persona a continuación, si algo.
- Un punto de contacto real, no un buzón genérico.

### Plantilla — aviso a una clínica

```
Asunto: Aviso de seguridad — [nombre de la clínica]

Hola [nombre de contacto],

Te escribimos para informarte de un incidente de seguridad que puede haber afectado
datos de tu clínica en Vetora.

Qué pasó: [descripción breve, sin jerga técnica]
Cuándo lo detectamos: [fecha y hora]
Qué datos pueden estar involucrados: [categorías — nunca listas de personas aquí]
Qué hicimos: [medidas de contención ya aplicadas]
Qué recomendamos: [si la clínica debería avisar a algún cliente, y por qué]

Quedamos disponibles para cualquier pregunta en [contacto directo].

[Firma]
```

## Paso 6 — Documentación

Todo incidente, **cierre o no en notificación externa**, se registra en `SEGURIDAD.md` con el mismo
formato que ya usa el archivo: severidad, qué pasó, impacto, corrección, cómo se confirmó. Un
incidente que no se documenta no deja aprender nada la próxima vez — es lo que ya se hizo hoy mismo
con el incidente del `0050`.

## Paso 7 — Revisión posterior

Después de cerrado cualquier incidente de severidad MEDIA o superior:

1. ¿Qué lo permitió? (causa raíz, no solo el síntoma)
2. ¿Qué lo detectó, y pudo haberse detectado antes?
3. ¿Falta algo en `estado_rls.sql` que lo habría cazado automáticamente?
4. ¿Hay que actualizar este procedimiento con lo aprendido?

---

## Lo que este procedimiento asume y que conviene confirmar

- Que **no hay un equipo**, sino una persona administrando la plataforma — el procedimiento no
  contempla turnos ni escalado entre personas porque hoy no aplicaría.
- Que las clínicas tienen un canal de contacto directo y actualizado (WhatsApp/email) para poder
  cumplir el plazo de 72 horas — si ese dato no se mantiene al día, el plazo es papel mojado.
- Que la pregunta de si existe obligación legal de notificar a una autoridad en Bolivia, y en qué
  plazo, la resuelve la asesoría jurídica antes de que haga falta usarlo de verdad.
