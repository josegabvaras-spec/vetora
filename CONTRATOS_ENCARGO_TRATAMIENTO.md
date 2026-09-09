# Registro de encargados de tratamiento — Vetora

**Qué es esto:** no es el contrato en sí — los contratos ya existen, los publica cada proveedor.
Esto es el **registro interno** de que los revisaste, cuándo, en qué plan, y dónde guardaste la
prueba. Sin este registro, "está en sus términos" no es demostrable ante nadie; con él, sí.

⚠️ **No es un documento legal ni sustituye la revisión de tu asesor.** Confirma únicamente que el
contrato existe y qué dice — no si es *suficiente* para lo que exige la normativa boliviana. Eso
sigue siendo del abogado (ver pregunta 5 del informe jurídico).

---

## Por qué guardar copia, y no solo el enlace

Un enlace público puede cambiar de contenido sin avisar. Si algún día hace falta demostrar **qué
aceptaste y en qué fecha**, el enlace de hoy no prueba nada por sí solo — necesitas una copia fechada
de lo que viste. Guardarla en este repositorio, en un commit de Git, funciona especialmente bien
para eso: el propio commit lleva fecha y no se puede alterar después sin que se note.

---

## Los tres proveedores, verificado el 2026-09-08

### Supabase

- **Contrato:** [supabase.com/legal/dpa](https://supabase.com/legal/dpa)
- **Se activa:** automáticamente al aceptar sus Términos de Servicio — **en el plan gratuito
  también**, no hace falta pagar ni firmar nada aparte.
- **Cubre:** cualquier dato personal que Vetora le entregue para operar el servicio (la base de
  datos entera, en la práctica).
- **Subencargados:** puede usarlos; si añaden uno nuevo, avisan con 30 días y hay 5 días para
  objetar.
- **Notificación de brecha:** «sin dilación indebida, y cuando sea posible, dentro de 48 horas».
- **Al terminar el contrato:** 30 días para pedir tus datos; pasado ese plazo, los borra.
- **Copia formal firmada:** si hace falta un documento firmado en PDF para el expediente (no solo
  la página web), se pide con un ticket desde el panel o escribiendo a `support@supabase.io`.

### Vercel

- **Contrato:** [vercel.com/legal/dpa](https://vercel.com/legal/dpa)
- **Se activa:** ⚠️ **solo en planes Pro y Enterprise.** El texto dice literalmente que aplica «a
  clientes que están en los planes Enterprise y Pro» — el plan Hobby (gratuito) no aparece
  mencionado, y no se activa en él.
- **Hoy, con Vetora en el plan gratuito, este contrato NO te cubre.**
- **Cubre:** los datos personales que viajan dentro de lo que tu aplicación sirve (no los datos de
  contacto de tu propia cuenta de Vercel, que ellos tratan aparte).
- **Subencargados:** lista pública en `security.vercel.com`; puedes suscribirte a avisos de cambios.
- **Notificación de brecha:** «sin dilación indebida», sin plazo fijo en horas.
- **Al terminar el contrato:** borra los datos «en un plazo comercialmente razonable» — más
  impreciso que el de Supabase.

### Anthropic

- **Contrato:** [anthropic.com/legal/data-processing-addendum](https://www.anthropic.com/legal/data-processing-addendum)
  (vigente desde el 24 de febrero de 2025). ⚠️ A diferencia de Supabase y Vercel, no basta con este
  enlace solo: hay que confirmar que tus *Commercial Terms of Service* lo incorporan por referencia
  — el propio documento lo dice así, y en la práctica lo incorporan salvo que se use por una vía de
  terceros. Los términos comerciales están en
  [anthropic.com/legal/commercial-terms](https://www.anthropic.com/legal/commercial-terms), sección C.
- **Se activa:** automáticamente al aceptar esos términos comerciales, sin firma aparte — **solo si
  la cuenta es de API comercial, no una suscripción personal de Claude** (esa va por otros términos,
  de consumidor, sin este DPA). Confirmar que `ANTHROPIC_API_KEY` sale de esa cuenta comercial.
- **Subencargados:** puede añadirlos con «aviso razonable»; 15 días para objetar antes de que se
  entienda aceptado en silencio — más corto que los 30+5 días de Supabase y Vercel.
- **Notificación de brecha:** por escrito, «sin dilación indebida, y en cualquier caso dentro de 48
  horas» — igual que Supabase.
- **Al terminar el contrato:** 30 días para devolver o borrar tus datos por completo, salvo
  obligación legal de conservarlos o disputa en curso.
- **Certificaciones:** SOC 2 y otras, públicas en `trust.anthropic.com`, si hace falta acreditar
  algo sin pedir una auditoría propia.

---

## Registro — rellenar cada vez que se confirme algo

| Proveedor | Plan actual | ¿DPA activo hoy? | Fecha de esta verificación | Evidencia guardada | Revisado por |
|---|---|---|---|---|---|
| Supabase | Gratuito | ✅ Sí | 2026-09-08 | *(pendiente, ver abajo)* | — |
| Vercel | Hobby (gratuito) | ❌ **No** | 2026-09-08 | *(pendiente, ver abajo)* | — |
| Anthropic | API comercial | ✅ Sí, si la cuenta es la correcta | 2026-09-08 | *(pendiente, ver abajo)* | — |

**Cuando actualices el plan de Vercel a Pro:**
1. Confirma que el DPA queda activo (debería serlo automáticamente al pasar de plan).
2. Guarda una captura fechada de `vercel.com/legal/dpa` mostrando la fecha.
3. Actualiza la fila de Vercel en la tabla de arriba.
4. Si tu asesor lo pide, solicita la copia formal desde el soporte de Vercel.

**Cuando pases Supabase a un plan de pago:**
El contrato no cambia (ya estaba activo en gratuito), pero conviene volver a guardar una captura
fechada de ese momento, por si las condiciones del plan de pago añaden algo distinto.

---

## Cómo guardar la evidencia (recomendado)

1. Abre cada enlace de arriba en el navegador.
2. Guarda la página como PDF (`Ctrl+P` → «Guardar como PDF») — no una captura de pantalla recortada,
   la página completa con la fecha visible del sistema si es posible.
3. Colócalo en una carpeta `legal/encargados-de-tratamiento/` en este repositorio, con un nombre que
   incluya la fecha: `2026-09-08_supabase_dpa.pdf`, `2026-09-08_vercel_dpa.pdf`, etc.
4. Haz commit de esos archivos. El propio commit de Git queda como sello de fecha — es más difícil de
   cuestionar que un archivo suelto en tu escritorio.

Este archivo (`CONTRATOS_ENCARGO_TRATAMIENTO.md`) es el índice; los PDF son la prueba.
