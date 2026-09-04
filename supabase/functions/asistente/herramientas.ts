// Las herramientas del copiloto: la lista blanca de lo que la IA puede mirar.
//
// ⚠️ **TODAS son de SOLO LECTURA, y eso no es una convención: es la garantía.**
// No hay ninguna que escriba, borre o llame a la red. Un modelo no puede hacer
// lo que no tiene herramienta para hacer, así que la forma de garantizar que la
// IA no modifica el expediente clínico no es pedírselo en el prompt — es no
// darle el verbo.
//
// ⚠️ **TODAS consultan con `clienteDeUsuario(jwt)`**, que lleva el token de
// quien preguntó. Eso hace que PostgREST aplique sus policies tal cual: la
// herramienta lee exactamente lo que esa persona lee desde el navegador, ni una
// fila más. El aislamiento entre clínicas sigue siendo la RLS y no un `where`
// que haya que acertar cinco veces.
//
// Y todas: validan sus parámetros ANTES de consultar, acotan el número de filas,
// y devuelven campos mínimos — nunca `select('*')`.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@^2.58.0'

/** Bolivia no tiene horario de verano: el desfase es fijo todo el año. */
const OFFSET_BOLIVIA = '-04:00'

const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}$/
const FORMATO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Un fallo de validación no es una excepción: es una respuesta que el modelo lee y corrige. */
export class ParametroInvalido extends Error {}

function exigirFecha(valor: unknown, campo: string): string {
  if (typeof valor !== 'string' || !FORMATO_FECHA.test(valor)) {
    throw new ParametroInvalido(`${campo} tiene que ser una fecha con formato aaaa-mm-dd`)
  }
  return valor
}

function exigirUuid(valor: unknown, campo: string): string {
  if (typeof valor !== 'string' || !FORMATO_UUID.test(valor)) {
    throw new ParametroInvalido(`${campo} tiene que ser el identificador de la ficha`)
  }
  return valor
}

function entero(valor: unknown, campo: string, min: number, max: number, porDefecto: number): number {
  if (valor === undefined || valor === null) return porDefecto
  const n = Math.trunc(Number(valor))
  if (!Number.isFinite(n) || n < min || n > max) {
    throw new ParametroInvalido(`${campo} tiene que estar entre ${min} y ${max}`)
  }
  return n
}

/**
 * Rango de días, con tope.
 *
 * El tope no es burocracia: sin él, «dame la agenda de este año» se traería
 * miles de filas a un prompt, y lo que no cabe se trunca en silencio. Es mejor
 * que el modelo reciba «pide como mucho N días» y vuelva a preguntar.
 */
function rango(desde: unknown, hasta: unknown, campo: string, maxDias: number) {
  const d = exigirFecha(desde, 'desde')
  const h = exigirFecha(hasta, 'hasta')
  if (h < d) throw new ParametroInvalido('hasta no puede ser anterior a desde')

  const dias = (Date.parse(`${h}T00:00:00Z`) - Date.parse(`${d}T00:00:00Z`)) / 86_400_000
  if (dias > maxDias) {
    throw new ParametroInvalido(`${campo}: el rango no puede pasar de ${maxDias} días (pediste ${dias})`)
  }
  // El día de la clínica, no el del servidor: `hasta` incluye su jornada entera.
  return { inicio: `${d}T00:00:00${OFFSET_BOLIVIA}`, fin: `${h}T23:59:59${OFFSET_BOLIVIA}` }
}

/** Fallar con un motivo legible vale más que devolver una lista vacía que el modelo interpretará como «no hay nada». */
function exigirSinError(error: { message: string } | null, que: string) {
  if (error) throw new Error(`No se pudo consultar ${que}: ${error.message}`)
}

const hoyEnLaClinica = () =>
  new Date(Date.now() - 4 * 3_600_000).toISOString().slice(0, 10)

// =====================================================================
// Los esquemas que ve el modelo
// =====================================================================
// Las descripciones son parte del contrato: si dicen de más, el modelo pide
// datos que no necesita; si dicen de menos, no usa la herramienta que tocaba.

export const ESQUEMAS_HERRAMIENTAS = [
  {
    name: 'obtener_agenda',
    description:
      'Citas agendadas entre dos fechas, con su paciente, tipo y estado. ' +
      'Úsala para preguntas sobre la agenda, el día de trabajo o qué hay pendiente. ' +
      'El rango no puede pasar de 31 días.',
    input_schema: {
      type: 'object',
      properties: {
        desde: { type: 'string', description: 'Primer día, aaaa-mm-dd' },
        hasta: { type: 'string', description: 'Último día incluido, aaaa-mm-dd' },
      },
      required: ['desde', 'hasta'],
    },
  },
  {
    name: 'obtener_resumen_paciente',
    description:
      'Ficha de un paciente: datos básicos, alergias, antecedentes, sus últimas consultas ' +
      'cerradas, su esquema de vacunas y sus recetas —medicamento, dosis, vía, frecuencia—. ' +
      'Úsala también para preguntas sobre medicamentos o dosis de un paciente concreto. ' +
      'Necesita el identificador del paciente, que sale de obtener_agenda o de buscar_paciente.',
    input_schema: {
      type: 'object',
      properties: {
        paciente_id: { type: 'string', description: 'Identificador del paciente' },
      },
      required: ['paciente_id'],
    },
  },
  {
    name: 'buscar_paciente',
    description:
      'Busca pacientes por su nombre o por el nombre de su dueño. Devuelve el identificador ' +
      'de cada uno, que es lo que necesita obtener_resumen_paciente.',
    input_schema: {
      type: 'object',
      properties: {
        texto: { type: 'string', description: 'Parte del nombre de la mascota o del dueño' },
      },
      required: ['texto'],
    },
  },
  {
    name: 'obtener_clientes_inactivos',
    description:
      'Pacientes que llevan mucho tiempo sin una cita completada, con su dueño. ' +
      'Úsala para reactivación y seguimiento comercial.',
    input_schema: {
      type: 'object',
      properties: {
        dias_sin_visita: { type: 'integer', description: 'Umbral en días, entre 30 y 730. Por defecto 180' },
        limite: { type: 'integer', description: 'Cuántos devolver, hasta 50. Por defecto 20' },
      },
    },
  },
  {
    name: 'obtener_ventas',
    description:
      'Lo cobrado entre dos fechas: total, número de cobros y desglose por método de pago y por día. ' +
      'El rango no puede pasar de 92 días.',
    input_schema: {
      type: 'object',
      properties: {
        desde: { type: 'string', description: 'Primer día, aaaa-mm-dd' },
        hasta: { type: 'string', description: 'Último día incluido, aaaa-mm-dd' },
      },
      required: ['desde', 'hasta'],
    },
  },
  {
    name: 'obtener_productos_bajo_minimo',
    description:
      'Productos activos cuyo stock está en o por debajo de su mínimo, para reponer. ' +
      'El stock va en envases.',
    input_schema: {
      type: 'object',
      properties: {
        limite: { type: 'integer', description: 'Cuántos devolver, hasta 50. Por defecto 20' },
      },
    },
  },
  {
    name: 'consultar_vademecum',
    description:
      'El vademécum PROPIO de esta clínica: los medicamentos que ella misma anotó, con su ' +
      'concentración, su rango de dosis en mg/kg, su vía, su frecuencia y sus ' +
      'contraindicaciones. Úsala SIEMPRE antes de comentar una dosis: lo que hay aquí es el ' +
      'criterio de esta clínica y manda sobre lo que tú sepas de forma general. Si el fármaco ' +
      'no está en el vademécum, dilo — no lo sustituyas en silencio por tu conocimiento. ' +
      'Sin `texto` devuelve el catálogo entero.',
    input_schema: {
      type: 'object',
      properties: {
        texto: {
          type: 'string',
          description: 'Parte del nombre o del principio activo. Omítelo para traer todo.',
        },
        especie: {
          type: 'string',
          enum: ['canino', 'felino'],
          description: 'Acota a las fichas de esa especie y a las que valen para todas.',
        },
        limite: { type: 'integer', description: 'Cuántos devolver, hasta 50. Por defecto 25' },
      },
    },
  },
]

export const NOMBRES_DE_HERRAMIENTA = ESQUEMAS_HERRAMIENTAS.map((h) => h.name)

// =====================================================================
// La ejecución
// =====================================================================

type Argumentos = Record<string, unknown>

/**
 * Tope de filas que se traen para agregar en memoria.
 *
 * Mismo criterio y mismo motivo que `TOPE_CARTERA` en `services/programados.ts`:
 * un límite explícito y documentado en vez del corte invisible de 1000 filas de
 * PostgREST, que hacía desaparecer datos sin decir nada.
 */
const TOPE_CARTERA = 3000

async function obtenerAgenda(sb: SupabaseClient, args: Argumentos) {
  const { inicio, fin } = rango(args.desde, args.hasta, 'obtener_agenda', 31)

  const { data, error } = await sb
    .from('citas')
    .select('id, fecha_hora, tipo_cita, estado, notas, pacientes(id, nombre, especie)')
    .gte('fecha_hora', inicio)
    .lte('fecha_hora', fin)
    .order('fecha_hora')
    .limit(200)
  exigirSinError(error, 'la agenda')

  return {
    total: data?.length ?? 0,
    citas: (data ?? []).map((c: any) => ({
      paciente_id: c.pacientes?.id ?? null,
      paciente: c.pacientes?.nombre ?? null,
      especie: c.pacientes?.especie ?? null,
      cuando: c.fecha_hora,
      tipo: c.tipo_cita,
      estado: c.estado,
      notas: c.notas ?? null,
    })),
  }
}

async function buscarPaciente(sb: SupabaseClient, args: Argumentos) {
  const texto = typeof args.texto === 'string' ? args.texto.trim() : ''
  if (texto.length < 2) throw new ParametroInvalido('texto tiene que tener al menos 2 caracteres')

  // ⚠️ Dos consultas y unión en memoria, NUNCA un `.or()` con el texto dentro.
  // La coma, el punto y el paréntesis son sintaxis de filtro en PostgREST, y
  // ese es exactamente el hallazgo H-1 de SEGURIDAD.md. Aquí el término viaja
  // siempre como VALOR de un `ilike`, no como sintaxis.
  const patron = `%${texto}%`

  const [porMascota, porDueno] = await Promise.all([
    sb.from('pacientes').select('id, nombre, especie, clientes(nombre)').ilike('nombre', patron).limit(15),
    sb.from('clientes').select('id, nombre, pacientes(id, nombre, especie)').ilike('nombre', patron).limit(15),
  ])
  exigirSinError(porMascota.error, 'los pacientes')
  exigirSinError(porDueno.error, 'los dueños')

  const encontrados = new Map<string, { paciente_id: string; paciente: string; especie: string; dueno: string | null }>()

  for (const p of (porMascota.data ?? []) as any[]) {
    encontrados.set(p.id, {
      paciente_id: p.id, paciente: p.nombre, especie: p.especie,
      dueno: p.clientes?.nombre ?? null,
    })
  }
  for (const c of (porDueno.data ?? []) as any[]) {
    for (const p of c.pacientes ?? []) {
      if (!encontrados.has(p.id)) {
        encontrados.set(p.id, { paciente_id: p.id, paciente: p.nombre, especie: p.especie, dueno: c.nombre })
      }
    }
  }

  return { total: encontrados.size, pacientes: [...encontrados.values()].slice(0, 20) }
}

async function obtenerResumenPaciente(sb: SupabaseClient, args: Argumentos) {
  const id = exigirUuid(args.paciente_id, 'paciente_id')

  // ⚠️ Del dueño sale el NOMBRE y nada más. Ni el CI ni el WhatsApp: para
  // razonar sobre un paciente no hacen falta, y lo que no se manda no se filtra.
  // Es el mismo criterio que `contextoDeAviso()` en `lib/asistente.ts`.
  const { data: paciente, error } = await sb
    .from('pacientes')
    .select('id, nombre, especie, raza, sexo, fecha_nacimiento, alergias, antecedentes, codigo, clientes(nombre)')
    .eq('id', id)
    .maybeSingle()
  exigirSinError(error, 'el paciente')
  if (!paciente) return { encontrado: false }

  const [consultas, vacunas, recetas] = await Promise.all([
    // Solo las CERRADAS: un borrador es una consulta a medio escribir, y
    // resumirla como si fuera un hecho clínico sería inventar.
    sb.from('historial_clinico')
      .select('created_at, motivo, diagnostico, tratamiento, peso_kg, temperatura_c')
      .eq('paciente_id', id).eq('editable', false)
      .order('created_at', { ascending: false }).limit(5),
    sb.from('vacunas_aplicadas')
      .select('nombre_vacuna, fecha_aplicacion, fecha_refuerzo')
      .eq('paciente_id', id)
      .order('fecha_aplicacion', { ascending: false }).limit(15),
    // Las recetas SÍ incluyen las de una consulta todavía abierta —a propósito:
    // es justo ahí donde revisar una dosis antes de firmar es más útil— pero se
    // anota `cerrada` para que no se presente como definitivo algo que el
    // veterinario todavía puede cambiar.
    sb.from('recetas')
      .select('medicamento, dosis, via, frecuencia, duracion, indicaciones, created_at, historial_clinico(editable)')
      .eq('paciente_id', id)
      .order('created_at', { ascending: false }).limit(10),
  ])
  exigirSinError(consultas.error, 'el historial')
  exigirSinError(vacunas.error, 'las vacunas')
  exigirSinError(recetas.error, 'las recetas')

  const p = paciente as any
  return {
    encontrado: true,
    paciente: {
      nombre: p.nombre, especie: p.especie, raza: p.raza, sexo: p.sexo,
      fecha_nacimiento: p.fecha_nacimiento, codigo: p.codigo,
      alergias: p.alergias, antecedentes: p.antecedentes,
      dueno: p.clientes?.nombre ?? null,
    },
    ultimas_consultas: consultas.data ?? [],
    vacunas: vacunas.data ?? [],
    recetas: (recetas.data ?? []).map((r: any) => ({
      medicamento: r.medicamento,
      dosis: r.dosis,
      via: r.via,
      frecuencia: r.frecuencia,
      duracion: r.duracion,
      indicaciones: r.indicaciones,
      fecha: r.created_at,
      // false si la consulta que la recetó todavía está en borrador.
      cerrada: r.historial_clinico?.editable === false,
    })),
  }
}

async function obtenerClientesInactivos(sb: SupabaseClient, args: Argumentos) {
  const dias = entero(args.dias_sin_visita, 'dias_sin_visita', 30, 730, 180)
  const limite = entero(args.limite, 'limite', 1, 50, 20)

  const [pacientes, citas] = await Promise.all([
    sb.from('pacientes').select('id, nombre, especie, clientes(nombre, whatsapp)').limit(TOPE_CARTERA),
    // Solo lo necesario para saber CUÁNDO vino cada uno por última vez.
    sb.from('citas').select('paciente_id, fecha_hora').eq('estado', 'completada').limit(TOPE_CARTERA * 2),
  ])
  exigirSinError(pacientes.error, 'los pacientes')
  exigirSinError(citas.error, 'las citas')

  const ultima = new Map<string, string>()
  for (const c of (citas.data ?? []) as any[]) {
    const previa = ultima.get(c.paciente_id)
    if (!previa || c.fecha_hora > previa) ultima.set(c.paciente_id, c.fecha_hora)
  }

  const corte = new Date(Date.now() - dias * 86_400_000).toISOString()
  const inactivos = ((pacientes.data ?? []) as any[])
    .map((p) => ({ p, visto: ultima.get(p.id) ?? null }))
    .filter(({ visto }) => visto === null || visto < corte)
    .sort((a, b) => (a.visto ?? '').localeCompare(b.visto ?? ''))

  return {
    umbral_dias: dias,
    total: inactivos.length,
    devueltos: Math.min(inactivos.length, limite),
    pacientes: inactivos.slice(0, limite).map(({ p, visto }) => ({
      paciente_id: p.id,
      paciente: p.nombre,
      especie: p.especie,
      dueno: p.clientes?.nombre ?? null,
      // El teléfono sí sale aquí, y a propósito: el sentido de esta herramienta
      // es preparar un contacto, y quien la invoca ya ve ese número en pantalla.
      whatsapp: p.clientes?.whatsapp ?? null,
      ultima_visita: visto,
    })),
  }
}

async function obtenerVentas(sb: SupabaseClient, args: Argumentos) {
  const { inicio, fin } = rango(args.desde, args.hasta, 'obtener_ventas', 92)

  const { data, error } = await sb
    .from('cobros')
    .select('monto_bs, metodo_pago, created_at')
    .gte('created_at', inicio).lte('created_at', fin)
    .limit(TOPE_CARTERA)
  exigirSinError(error, 'los cobros')

  const cobros = (data ?? []) as any[]
  const porMetodo: Record<string, number> = {}
  const porDia: Record<string, number> = {}
  let total = 0

  for (const c of cobros) {
    const monto = Number(c.monto_bs) || 0
    total += monto
    porMetodo[c.metodo_pago] = (porMetodo[c.metodo_pago] ?? 0) + monto
    // El día de la clínica, no el UTC: en La Paz el día cambia a las 20:00 UTC.
    const dia = new Date(Date.parse(c.created_at) - 4 * 3_600_000).toISOString().slice(0, 10)
    porDia[dia] = (porDia[dia] ?? 0) + monto
  }

  return {
    moneda: 'BOB',
    total_bs: Math.round(total * 100) / 100,
    cobros: cobros.length,
    por_metodo_bs: porMetodo,
    por_dia_bs: porDia,
  }
}

async function obtenerProductosBajoMinimo(sb: SupabaseClient, args: Argumentos) {
  const limite = entero(args.limite, 'limite', 1, 50, 20)

  // PostgREST no compara dos columnas entre sí, así que el filtro va en memoria
  // sobre los activos. `activo` no es opcional: un producto dado de baja
  // seguiría apareciendo como pendiente de reponer.
  const { data, error } = await sb
    .from('productos')
    .select('id, nombre, presentacion, stock_actual, stock_minimo, precio_bs')
    .eq('activo', true)
    .limit(TOPE_CARTERA)
  exigirSinError(error, 'los productos')

  const bajos = ((data ?? []) as any[])
    .filter((p) => Number(p.stock_actual) <= Number(p.stock_minimo))
    .sort((a, b) => Number(a.stock_actual) - Number(b.stock_actual))

  return {
    unidad: 'envases',
    total: bajos.length,
    devueltos: Math.min(bajos.length, limite),
    productos: bajos.slice(0, limite).map((p) => ({
      nombre: p.nombre,
      presentacion: p.presentacion || null,
      stock_actual: Number(p.stock_actual),
      stock_minimo: Number(p.stock_minimo),
      agotado: Number(p.stock_actual) <= 0,
    })),
  }
}

/**
 * El vademécum propio de la clínica (migración 0042).
 *
 * ⚠️ Es la ÚNICA herramienta que devuelve criterio clínico escrito por una
 * persona, no un dato operativo. Existe justamente para eso: sin ella, cuando
 * el copiloto dice «esa dosis parece alta» la fuente es su entrenamiento y no
 * hay nada que el veterinario pueda abrir y contrastar, aunque la pantalla
 * enseñe qué se consultó.
 *
 * Devuelve `concentracion_mg` con su unidad —no una dosis ya calculada— porque
 * el cálculo depende del peso del paciente, que sale de `obtener_resumen_paciente`.
 */
async function consultarVademecum(sb: SupabaseClient, args: Argumentos) {
  const limite = entero(args.limite, 'limite', 1, 50, 25)
  const texto = typeof args.texto === 'string' ? args.texto.trim() : ''
  const especie = typeof args.especie === 'string' ? args.especie.trim() : ''
  if (especie && especie !== 'canino' && especie !== 'felino') {
    throw new ParametroInvalido('especie tiene que ser "canino" o "felino"')
  }

  const COLUMNAS =
    'nombre, principio_activo, presentacion, concentracion_mg, unidad_dosificacion, ' +
    'especie, via, dosis_min_mg_kg, dosis_max_mg_kg, frecuencia, duracion_habitual, ' +
    'contraindicaciones, notas'

  // Solo las fichas en uso: una retirada sigue en la tabla para no perder lo
  // escrito, pero presentarla como vigente sería justo lo contrario de por qué
  // se retiró.
  const base = () => sb.from('vademecum').select(COLUMNAS).eq('activo', true)

  let fichas: any[]
  if (texto.length >= 2) {
    // ⚠️ Dos consultas y unión en memoria, NUNCA un `.or()` con el texto
    // dentro: la coma y el paréntesis son sintaxis de filtro en PostgREST
    // (hallazgo H-1 de SEGURIDAD.md). El término viaja como VALOR de un `ilike`.
    const patron = `%${texto}%`
    const [porNombre, porPrincipio] = await Promise.all([
      base().ilike('nombre', patron).limit(limite),
      base().ilike('principio_activo', patron).limit(limite),
    ])
    exigirSinError(porNombre.error, 'el vademécum')
    exigirSinError(porPrincipio.error, 'el vademécum')

    const unicas = new Map<string, any>()
    for (const f of [...(porNombre.data ?? []), ...(porPrincipio.data ?? [])] as any[]) {
      unicas.set(`${f.nombre}|${f.especie}`, f)
    }
    fichas = [...unicas.values()]
  } else {
    const { data, error } = await base().order('nombre').limit(TOPE_CARTERA)
    exigirSinError(error, 'el vademécum')
    fichas = (data ?? []) as any[]
  }

  // Una ficha marcada «todos» aplica a la especie pedida: acotar a la especie
  // exacta escondería justo las de uso general, que son la mayoría.
  if (especie) fichas = fichas.filter((f) => f.especie === especie || f.especie === 'todos')

  return {
    total: fichas.length,
    devueltos: Math.min(fichas.length, limite),
    // Que el modelo sepa distinguir «la clínica no lo tiene anotado» de «la
    // clínica no tiene vademécum»: son dos respuestas distintas.
    vademecum_vacio: fichas.length === 0 && !texto && !especie,
    medicamentos: fichas.slice(0, limite).map((f) => ({
      nombre: f.nombre,
      principio_activo: f.principio_activo || null,
      presentacion: f.presentacion || null,
      concentracion_mg_por_unidad: f.concentracion_mg != null ? Number(f.concentracion_mg) : null,
      unidad: f.unidad_dosificacion,
      especie: f.especie,
      via: f.via,
      dosis_min_mg_kg: f.dosis_min_mg_kg != null ? Number(f.dosis_min_mg_kg) : null,
      dosis_max_mg_kg: f.dosis_max_mg_kg != null ? Number(f.dosis_max_mg_kg) : null,
      frecuencia: f.frecuencia || null,
      duracion_habitual: f.duracion_habitual || null,
      contraindicaciones: f.contraindicaciones || null,
      notas: f.notas || null,
    })),
  }
}

const EJECUTORES: Record<string, (sb: SupabaseClient, args: Argumentos) => Promise<unknown>> = {
  obtener_agenda: obtenerAgenda,
  buscar_paciente: buscarPaciente,
  obtener_resumen_paciente: obtenerResumenPaciente,
  obtener_clientes_inactivos: obtenerClientesInactivos,
  obtener_ventas: obtenerVentas,
  obtener_productos_bajo_minimo: obtenerProductosBajoMinimo,
  consultar_vademecum: consultarVademecum,
}

/**
 * Ejecuta una herramienta de la lista blanca.
 *
 * Nunca lanza hacia arriba: un fallo se devuelve al modelo como texto para que
 * lo lea y reaccione —corrigiendo el parámetro, o diciendo que no puede
 * responder—. Tirar la petición entera por un parámetro mal puesto convertiría
 * un tropiezo recuperable en un error de cara al usuario.
 */
export async function ejecutarHerramienta(
  sb: SupabaseClient,
  nombre: string,
  args: Argumentos,
): Promise<{ ok: boolean; contenido: string }> {
  const ejecutor = EJECUTORES[nombre]
  if (!ejecutor) {
    return { ok: false, contenido: `La herramienta "${nombre}" no existe.` }
  }

  try {
    const datos = await ejecutor(sb, args ?? {})
    // El envoltorio `datos` es deliberado: deja claro dónde acaba lo que dice el
    // sistema y dónde empieza lo que escribió una persona en la base.
    return { ok: true, contenido: JSON.stringify({ datos }) }
  } catch (error) {
    const motivo = error instanceof ParametroInvalido
      ? error.message
      : `No se pudieron obtener los datos: ${error instanceof Error ? error.message : 'error desconocido'}`
    return { ok: false, contenido: motivo }
  }
}

export { hoyEnLaClinica }
