# Solicitud de revisión jurídica — Contratos de encargo de tratamiento

**Fecha:** 2026-09-08 · **Alcance:** los tres contratos de encargo de tratamiento (DPA) que publican
los proveedores de infraestructura de Vetora — Supabase, Vercel y Anthropic.

Este documento tiene dos partes: la solicitud en sí (qué se pide revisar y las preguntas concretas),
y el formato sugerido para la respuesta, de modo que el informe de la asesoría cubra todo lo
necesario sin ir y volver varias veces.

---

## PARTE 1 — Solicitud de revisión

### Contexto

Vetora es un SaaS de gestión veterinaria. Para operar, contrata a tres proveedores de
infraestructura que **tratan datos personales por cuenta de Vetora** (no deciden qué hacer con
ellos, solo los procesan siguiendo instrucciones técnicas del sistema):

| Proveedor | Qué procesa |
|---|---|
| **Supabase** | Base de datos completa, autenticación de usuarios, almacenamiento de archivos (fotos, comprobantes, estudios) |
| **Vercel** | Alojamiento de la aplicación web |
| **Anthropic** | El asistente de inteligencia artificial (redacción de avisos y consultas del personal) |

Los tres publican un contrato de encargo de tratamiento (DPA) que se acepta —en distinta medida—
al contratar el servicio. **No se ha ejecutado ninguna firma manuscrita ni digital aparte de esos
términos estándar en ningún caso.**

### Qué se pide

Confirmar si estos tres contratos, tal como están, son **suficientes** para que Vetora cumpla sus
obligaciones frente a las clínicas que lo contratan y frente a los dueños de mascotas cuyos datos
trata — bajo la normativa boliviana aplicable, y con referencia a estándares internacionales
(RGPD, ISO 27001) donde no exista norma boliviana específica.

### Resumen fáctico de cada contrato, verificado el 2026-09-08

#### Supabase

- Documento: [supabase.com/legal/dpa](https://supabase.com/legal/dpa)
- Se incorpora automáticamente al aceptar los Términos de Servicio — **sin firma aparte**, y **en
  el plan gratuito también**.
- Notificación de brecha de seguridad: dentro de 48 horas.
- Al terminar el contrato: 30 días para devolver o eliminar los datos.
- Subencargados: aviso de 30 días ante cambios, 5 días para objetar.
- Auditoría: hasta una vez al año, a cargo del cliente, o aceptar certificaciones SOC 2 / ISO 27001
  ya existentes.

#### Vercel

- Documento: [vercel.com/legal/dpa](https://vercel.com/legal/dpa)
- ⚠️ **El texto excluye explícitamente el plan gratuito («Hobby»)**: solo aplica a los planes Pro y
  Enterprise. **Vetora está hoy en el plan gratuito — este contrato no cubre el proyecto todavía.**
- Notificación de brecha: «sin dilación indebida», sin plazo fijo en horas.
- Al terminar el contrato: plazo «comercialmente razonable», más impreciso que el de Supabase.
- Subencargados: publicados en `security.vercel.com`, 5 días para objetar.

#### Anthropic

- Documento: [anthropic.com/legal/data-processing-addendum](https://www.anthropic.com/legal/data-processing-addendum)
  (vigente desde el 24 de febrero de 2025), incorporado por referencia en los
  [Commercial Terms of Service](https://www.anthropic.com/legal/commercial-terms).
- Se incorpora automáticamente al aceptar esos términos comerciales — **solo si la cuenta usada es
  de API comercial, no una suscripción personal de consumidor**.
- Notificación de brecha: dentro de 48 horas.
- Al terminar el contrato: 30 días para devolver o eliminar los datos.
- Subencargados: aviso «razonable», 15 días para objetar (más corto que los otros dos).

### Preguntas concretas

1. **¿La aceptación automática de estos términos —sin firma manuscrita ni digital aparte— equivale
   jurídicamente a un contrato de encargo de tratamiento válido** bajo la normativa aplicable a
   Vetora, o hace falta gestionar una firma formal con cada proveedor?
2. **Mientras Vercel permanezca en el plan gratuito** (sin DPA activo), ¿qué exposición legal
   implica para Vetora, y qué medida se recomienda mientras no se actualice el plan?
3. **¿Hace falta un contrato adicional entre Vetora y cada clínica que lo contrata**, definiendo
   quién es responsable y quién encargado del tratamiento entre ellos, además de estos tres con los
   proveedores de infraestructura? (Relacionado con la pregunta 1 del informe técnico principal.)
4. **La ley y jurisdicción aplicable de estos tres contratos** (normalmente Estados Unidos o la
   Unión Europea, no Bolivia) **¿genera algún conflicto o requisito adicional** que deba
   gestionarse por separado?
5. **¿Basta con la evidencia de aceptación de términos y una captura fechada de cada documento**,
   o es necesario solicitar formalmente una copia firmada a cada proveedor para el expediente?
6. **¿Existe obligación de informar a las clínicas, o a los dueños de mascotas, sobre la existencia
   de estos subencargados** (Supabase, Vercel, Anthropic) como parte de la política de privacidad?

---

## PARTE 2 — Formato sugerido para el informe de respuesta

Para que la respuesta cubra todo sin necesidad de una segunda ronda de preguntas, se sugiere esta
estructura. No es obligatoria — es una propuesta para ordenar la revisión.

### Por cada uno de los tres contratos

| Campo | Contenido |
|---|---|
| Proveedor | Supabase / Vercel / Anthropic |
| Documento revisado | Nombre y fecha de la versión revisada |
| ¿Cumple lo exigible? | Sí / No / Parcialmente |
| Fundamento | Norma o criterio en el que se basa la conclusión |
| Observaciones | Cualquier matiz, limitación o riesgo detectado |
| Acción requerida | Qué debe hacer Vetora, si algo, y con qué prioridad |
| Plazo sugerido | Si la acción es urgente, en cuánto tiempo debería resolverse |

### Conclusión general

- Veredicto de conjunto: si los tres contratos, tomados juntos, satisfacen la obligación de tener
  encargados de tratamiento debidamente regulados.
- Respuesta a cada una de las seis preguntas de la Parte 1.
- Riesgos identificados, ordenados por prioridad.
- Recomendación sobre si conviene o no un contrato marco propio de Vetora con sus clínicas,
  independiente de estos tres.

### Cierre

Fecha del informe, nombre y matrícula del profesional que lo emite.
