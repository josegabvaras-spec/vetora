# Guía para presentar esto a un abogado generalista (sin especialidad en protección de datos)

**Para quién es esta guía:** para ti, no para el abogado. Es el paso a paso de qué mostrarle, en qué
orden y con qué encuadre, dado que en Bolivia no hay un gremio de especialistas en protección de
datos al que recurrir — vas a trabajar con un abogado generalista, y el objetivo de esta guía es que
pueda producir un informe útil sin necesitar esa especialidad previa.

---

## El problema de fondo, y por qué hay que decirlo primero

**No le pidas que "busque el artículo que dice esto".** Bolivia no tiene una ley integral de
protección de datos personales (no hay un equivalente al RGPD europeo, ni una autoridad de
protección de datos como la que sí tienen Argentina o algunos países vecinos). Si no se lo explicas
antes de entregarle nada, va a buscar una norma que no existe, no la va a encontrar, y va a concluir
—equivocadamente— que "no hay problema porque no hay ley". Eso sería un error, no una respuesta.

Lo que sí existe, y es lo que tiene que investigar y confirmar él (esto es una **hipótesis a
verificar por él, no un hecho que le estemos entregando ya comprobado**):

- La protección constitucional del derecho a la privacidad e intimidad, y el mecanismo boliviano
  parecido al "hábeas data" para pedir acceso, rectificación o eliminación de datos en registros
  públicos o privados (verificar el nombre exacto y los artículos — no des por buena la referencia
  de memoria).
- Normas sectoriales que puedan tocar esto de forma indirecta: telecomunicaciones/comercio
  electrónico, protección al consumidor, código civil (derechos de la personalidad), y cualquier
  norma penal sobre uso indebido de datos o secretos.
- **Marcos de referencia que NO son ley boliviana pero sirven como estándar de "buena práctica
  razonable"**: el RGPD europeo, la ley argentina de protección de datos personales (25.326, con
  autoridad de aplicación propia) y la LGPD brasileña —esta última con algo de peso adicional
  porque los datos están alojados físicamente en Brasil (São Paulo)—. Pídele que los use como
  vara de comparación, dejando siempre explícito si algo es **exigible** en Bolivia o solo
  **recomendable** sin obligación legal confirmada. Esta distinción ya está aplicada en el
  procedimiento de brechas que le vas a entregar (ahí el plazo de 72 horas se marca así, como
  ejemplo de cómo se espera que razone el resto).

Dile esto con esas palabras, o parecidas, **antes** de pasarle ningún documento — por escrito, para
que quede como encuadre del encargo y no se pierda en una llamada.

---

## Qué mostrarle, y en qué orden

### Paso 1 — El encuadre (arriba), antes que cualquier documento

Un mensaje corto, en texto plano, con las tres ideas de la sección anterior. No hace falta que sea
formal todavía; sirve para que la primera vez que abra el informe ya sepa qué está mirando y qué no
va a encontrar.

### Paso 2 — El informe principal

`INFORME_PARA_ASESORIA_JURIDICA.md` (o el `.docx`). Explícale que:

- Las secciones 1 a 8 son **hechos ya verificados contra el código y la base de datos real** — no
  tiene que auditar nada de eso, solo entenderlo como contexto.
- Su trabajo empieza en la **sección 9** ("Preguntas para la asesoría"): nueve preguntas concretas,
  y ahora la 4 se abrió en tres sub-preguntas (4.1 a 4.3) sobre el CI.
- Dile explícitamente que **la pregunta 4 (el CI) es la más urgente de las nueve**, porque el propio
  informe lo llama "el dato más sensible que se guarda" y hoy no tiene ningún tratamiento distinto
  al resto de la ficha del cliente.

### Paso 3 — Los tres documentos satélite, en este orden (no es arbitrario)

1. **`SOLICITUD_CALIFICACION_RESPONSABLE_ENCARGADO.md`** primero — porque su respuesta cambia cómo
   se leen los otros dos (el orden de notificación de una brecha, y qué debe pedirse en los
   contratos con los proveedores).
2. **`SOLICITUD_REVISION_ENCARGADOS.md`** (los tres DPA de Supabase/Vercel/Anthropic) — depende en
   parte de la respuesta anterior.
3. **`PROCEDIMIENTO_NOTIFICACION_BRECHAS.md`** — el orden de notificación que propone (clínica antes
   que dueño de mascota) también depende de cómo se responda el documento 1.

Si el tiempo del abogado es limitado, este orden es también el de prioridad: que responda el 1
primero, aunque tarde más en los otros dos.

### Paso 4 — Qué debe entregar

Cada documento ya trae, en su "Parte 2", el **formato exacto de la respuesta** (tabla de
calificación, dictamen, y una casilla de visto bueno: pleno / condicionado / no procede). Díselo
explícitamente: **no tiene que inventar el formato del informe, solo llenarlo con su criterio.**
Eso baja mucho la barrera para alguien que no se dedica a esto todos los días.

Pídele además, en cada respuesta, que distinga siempre estos tres tipos de conclusión:

- "Esto lo exige una norma boliviana concreta" (y cuál).
- "No hay norma que lo exija, pero es buena práctica razonable" (y por qué, con qué referencia).
- "No aplica / no hay riesgo real aquí" (y por qué).

Esa distinción es la que te va a permitir a ti, después, decidir qué se implementa ya y qué queda
como riesgo aceptado y documentado — el mismo criterio que ya se usó para decidir qué se corregía
de inmediato y qué quedaba pendiente de calificación jurídica en este propio proceso.

---

## Qué NO conviene hacer

- **No le pidas que audite el código.** Ya está hecho y verificado; su valor está en el criterio
  jurídico, no en repetir esa parte del trabajo.
- **No implementes cambios en el sistema basados en una suposición de lo que "probablemente" diría
  la ley**, antes de tener su respuesta — en particular para el CI: restringir quién lo ve o
  sacarlo del respaldo son decisiones de producto con costo real (recepción lo necesita para
  atender en mostrador), y no conviene tomarlas sin el fundamento legal que las justifique.
- **No trates un "no hay ley que lo exija" como un "no hay que hacer nada".** Pídele siempre la
  segunda pregunta: aunque no sea exigible, ¿es razonable hacerlo de todos modos?

---

## Un mensaje de ejemplo para enviarle junto con los documentos

```
Hola [nombre]. Te comparto una revisión técnica que hicimos de Vetora, el sistema que uso para
gestionar clínicas veterinarias, enfocada en qué datos personales trata y cómo los protege.

Un aviso antes de que empieces: en Bolivia no hay una ley integral de protección de datos como el
RGPD europeo, así que no vas a encontrar un artículo que responda cada pregunta directamente. Lo
que necesito es que investigues qué SÍ existe (derecho constitucional a la privacidad, el mecanismo
parecido al hábeas data, y cualquier norma sectorial que aplique) y que, donde no haya norma
boliviana clara, me digas qué es razonable hacer de todos modos como buena práctica, usando como
referencia marcos como el RGPD o la ley argentina — dejando siempre claro qué es obligatorio y qué
es solo recomendable.

Te mando cuatro documentos. El primero es el informe completo, con todos los hechos ya verificados
técnicamente — tu trabajo empieza en la sección 9, donde hay nueve preguntas concretas (la 4, sobre
la cédula de identidad, es la más urgente). Los otros tres son solicitudes puntuales, y conviene
que las veas en este orden: primero la de responsable/encargado, porque cambia la respuesta de las
otras dos.

Cada documento ya trae al final el formato en el que necesito la respuesta, para que no tengas que
armarlo desde cero — solo completarlo con tu criterio.

Cualquier duda, coordinamos una llamada antes de que empieces.
```

Ajusta el tono según cómo trates ya con esa persona — esto es una base, no un texto para copiar
literal.
