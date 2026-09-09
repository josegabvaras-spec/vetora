# Solicitud de calificación jurídica — Responsable y encargado del tratamiento

**Fecha:** 2026-09-08 · **Alcance:** determinar el papel de Vetora, de cada clínica, y de los
proveedores de infraestructura, en el tratamiento de los datos personales que pasan por el sistema.

Igual que el documento sobre los contratos de encargo: dos partes en un solo archivo — la solicitud
con los hechos y las preguntas, y el formato sugerido para la respuesta.

---

## PARTE 1 — Solicitud de calificación

### Por qué esta pregunta es central, y no una más de la lista

Esta calificación **no es autónoma** — ya condiciona tres decisiones documentadas y en espera de
ella:

1. **El orden de notificación en caso de brecha** (`PROCEDIMIENTO_NOTIFICACION_BRECHAS.md`, Paso 5):
   se asumió que la clínica se notifica antes que el dueño de mascota porque la clínica sería la
   responsable. Si la calificación es otra, ese orden cambia.
2. **Cómo se redacta la transferencia internacional de datos** en la política de privacidad: la
   obligación de informarla recae de forma distinta según quién sea responsable.
3. **Si hace falta un contrato aparte entre Vetora y cada clínica** que las use, distinto de los
   contratos ya existentes con Supabase, Vercel y Anthropic (pregunta 3 del documento sobre esos
   tres proveedores).

Por eso se separa en su propio documento en vez de dejarla como una pregunta más entre otras nueve.

### Los tres niveles de relación, con los hechos de cada uno

```
Dueño de mascota  →  Clínica  →  Vetora (la plataforma)  →  Proveedores de infraestructura
   (Nivel 1)          (Nivel 2)         (Nivel 3)
```

#### Nivel 1 — Dueño de mascota y clínica

- La clínica decide **por qué** se recogen los datos: para prestar el servicio veterinario
  concreto que ese dueño contrató.
- La clínica decide **qué** dato clínico anotar (diagnóstico, tratamiento, peso, alergias) — el
  criterio médico es enteramente suyo.
- El dueño entrega sus datos a la clínica, no a Vetora — Vetora es la herramienta que la clínica usa
  para registrarlos.

#### Nivel 2 — Clínica y Vetora (la plataforma)

Aquí el reparto es menos claro, y es el núcleo de lo que hay que calificar:

| Decisión | Quién la toma hoy |
|---|---|
| Qué campos de datos existen en el sistema (el esquema: qué se puede o no registrar) | **Vetora**, al diseñar la base de datos |
| Cuánto tiempo se conservan los datos | **Nadie lo decide explícitamente** — el sistema no borra nada por antigüedad; es el comportamiento por defecto, no una elección de la clínica ni documentada como elección de Vetora |
| Si los datos de un paciente se envían a un asistente de inteligencia artificial externo | **Vetora**, al construir qué planes incluyen el módulo de IA — la clínica solo elige qué plan comprar, no activa esa función por sí misma |
| Qué controles de seguridad protegen los datos (aislamiento entre clínicas, cifrado, segundo factor) | **Vetora**, por diseño del sistema |
| Si el dueño de la clínica (superadmin) puede ver el historial clínico de los pacientes | **Nadie puede** — está bloqueado por diseño técnico, verificado: ni el superadmin de la plataforma ve datos clínicos de ninguna clínica |
| Qué servicios concretos presta la clínica y a qué precio | La clínica |

#### Nivel 3 — Vetora y sus proveedores de infraestructura

Aquí no hay duda: Vetora decide contratar a Supabase, Vercel y Anthropic, y ellos procesan
siguiendo instrucciones técnicas de Vetora. Vetora es responsable frente a ellos; ellos son
encargados. Esto ya está tratado en `SOLICITUD_REVISION_ENCARGADOS.md`.

### Por qué no es evidente que la respuesta sea una sola figura para todo

Los hechos del Nivel 2 apuntan en direcciones distintas según el tipo de dato:

- Para los **datos clínicos del día a día** (historial, recetas, vacunas): Vetora no puede
  siquiera leerlos, y quien decide qué anotar es la clínica. Esto se parece a que Vetora sea
  **encargada**.
- Para **decisiones estructurales** (qué campos existen, cuánto se retiene, si hay IA de por
  medio): las toma Vetora, no la clínica, y la clínica no tiene forma de cambiarlas dato por dato.
  Esto se parece más a **responsabilidad conjunta** sobre esas decisiones concretas, aunque no
  sobre el contenido clínico en sí.
- Para los **datos de facturación y suscripción** de la propia clínica hacia Vetora (no de sus
  pacientes): Vetora decide con autonomía plena. Aquí Vetora es claramente responsable.

### Preguntas concretas

1. **¿Vetora es encargada del tratamiento respecto de los datos clínicos y de los dueños de
   mascota, siendo cada clínica la responsable?** Es la calificación por defecto más intuitiva —
   ¿se sostiene con los hechos de arriba?
2. **¿El control que Vetora ejerce sobre el esquema de datos, la retención indefinida por defecto,
   y la decisión de qué planes incluyen IA convierten a Vetora en corresponsable** —junto con la
   clínica— para esas decisiones concretas, aunque siga siendo encargada para el contenido clínico
   del día a día?
3. **¿Aplica una calificación distinta para los datos de facturación/suscripción** entre la clínica
   y Vetora, frente a los datos clínicos de los pacientes de esa clínica?
4. **Si Vetora resulta encargada (o corresponsable en parte), ¿qué debe constar en un contrato
   entre Vetora y cada clínica** que la contrata, además de los términos de uso genéricos que hoy
   existen?
5. **¿Esta calificación cambia por que Bolivia no cuente con una ley integral de protección de
   datos?** ¿Sigue siendo relevante aplicar este marco (responsable/encargado) como referencia de
   buena práctica aunque no sea obligatorio, o no aplica en absoluto sin una norma que lo exija?

---

## PARTE 2 — Formato sugerido para el informe de respuesta

### Calificación por nivel

| Nivel | Calificación (responsable / encargado / corresponsable) | Fundamento | Consecuencia práctica |
|---|---|---|---|
| Clínica ↔ dueño de mascota | | | |
| Vetora ↔ clínica — datos clínicos del día a día | | | |
| Vetora ↔ clínica — decisiones estructurales (esquema, retención, IA) | | | |
| Vetora ↔ clínica — datos de facturación/suscripción | | | |
| Vetora ↔ proveedores de infraestructura | Encargados (ya asumido) | — | Contratos ya identificados en documento aparte |

### Dictamen

- Respuesta a cada una de las cinco preguntas de la Parte 1.
- Si la calificación resulta mixta (distinta según el tipo de dato), qué documento debe reflejar
  esa distinción y con qué palabras exactas.
- Qué cambia, si algo, en:
  - el orden de notificación de brechas ya propuesto;
  - la forma de declarar la transferencia internacional en la política de privacidad;
  - la necesidad de un contrato Vetora–clínica aparte de los términos de uso.

### Cierre

Fecha del informe, nombre y matrícula del profesional, firma — visto bueno explícito o
condicionado (qué falta para el visto bueno pleno, si no es inmediato).
