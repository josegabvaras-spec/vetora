import { supabase } from '../lib/supabase'
import type { Cliente, Especie, Sexo } from '../types/database'
import type {
  FichaPaciente,
  InternacionResumen,
  PacienteConDueno,
  ProductoUsado,
} from '../types/views'
import { consultaOrigenDe, origenesDe } from './citas'
import { detalleDeInternacion, internacionAbiertaDe } from './internacion'
import { diasDeEstadia } from '../lib/internacion'
import { COLUMNAS_PACIENTE_SIN_FOTO } from '../lib/paciente'
import { cedula, movil } from '../lib/identidad'
import { actualizarBorradorHistorial, iniciarConsultaLibre, type CamposEditablesHistorial } from './historial'
import { clinicDayIso, formatClinicDate, fromClinicTime } from '../lib/datetime'

async function internacionActivaDe(pacienteId: string): Promise<InternacionResumen | null> {
  const abierta = await internacionAbiertaDe(pacienteId)
  if (!abierta) return null
  return {
    id: abierta.id,
    fecha_ingreso: abierta.fecha_ingreso,
    dias: diasDeEstadia(abierta.fecha_ingreso, abierta.fecha_alta),
    motivo: abierta.motivo,
    jaula: abierta.jaula,
  }
}

/** Tope de la lista de pacientes. Suficiente para una pantalla, con margen. */
export const LIMITE_PACIENTES = 200

/** Lo justo para pintar un desplegable de pacientes. */
export interface PacienteParaSelector {
  id: string
  nombre: string
  cliente_id: string
  /** Para el rótulo «Fido (Ana Pérez)» sin descargar la tabla de clientes. */
  cliente_nombre: string
}

/**
 * Pacientes para un `<Select>`, y **nada más**.
 *
 * Los modales de alta usaban `useTable('pacientes')`, que hace `select('*')`
 * sobre la tabla entera: con la foto en base64 de cada paciente, abrir «Nueva
 * cita» descargaba decenas de MB para pintar una lista de nombres.
 *
 * No lleva `limit`: son tres columnas de texto y el desplegable los necesita
 * todos —si falta uno, no se le puede agendar—. El corte de 1000 filas de
 * PostgREST sigue ahí y es la razón de que la lista GRANDE (`listPacientes`)
 * filtre en el servidor; aquí, en una clínica con más de mil pacientes, habría
 * que cambiar el desplegable por un buscador.
 */
export async function listPacientesParaSelector(): Promise<PacienteParaSelector[]> {
  const { data, error } = await supabase
    .from('pacientes')
    .select('id, nombre, cliente_id, cliente:clientes(nombre)')
    .order('nombre')

  if (error) throw new Error(`No se pudieron cargar los pacientes: ${error.message}`)
  return (data ?? []).map((p: any) => ({
    id: p.id,
    nombre: p.nombre,
    cliente_id: p.cliente_id,
    cliente_nombre: p.cliente?.nombre ?? '',
  }))
}

/**
 * Cartera de pacientes, filtrada **en el servidor**.
 *
 * Antes traía todos los pacientes más cuatro tablas completas y la página
 * filtraba en memoria. PostgREST corta en 1000 filas, así que a partir de ahí
 * había pacientes que no se podían encontrar por mucho que se escribiera su
 * nombre: no aparecían y nada avisaba.
 *
 * `busqueda` compara contra el nombre del paciente y el de su dueño. Como son
 * dos tablas, se resuelve en dos pasos: primero los dueños que casan, después
 * los pacientes cuyo nombre casa **o** que pertenecen a esos dueños.
 */
export async function listPacientes(busqueda = '', limite = LIMITE_PACIENTES): Promise<PacienteConDueno[]> {
  const termino = busqueda.trim()
  // `%` y `_` son comodines de LIKE: sin escaparlos, buscar "50%" listaría de más.
  const patron = `%${termino.replace(/[\\%_]/g, (c) => `\\${c}`)}%`

  let pacientes: any[] | null

  if (!termino) {
    const { data, error } = await supabase
      .from('pacientes')
      .select(COLUMNAS_PACIENTE_SIN_FOTO)
      .order('nombre')
      .limit(limite)
    if (error) throw new Error(`No se pudo cargar la lista de pacientes: ${error.message}`)
    pacientes = data
  } else {
    const { data: duenosQueCasan } = await supabase
      .from('clientes')
      .select('id')
      .ilike('nombre', patron)
      .limit(limite)

    const idsDuenos = (duenosQueCasan ?? []).map((c) => c.id)

    // DOS consultas y una unión en memoria, en vez de un `.or()`.
    //
    // Antes esto era `.or(\`nombre.ilike.${patron},cliente_id.in.(…)\`)`, y ahí
    // el término del usuario entraba **dentro de la sintaxis de filtros de
    // PostgREST**, cuyos separadores son la coma, el punto y los paréntesis.
    // El escape de LIKE de arriba no los cubre: buscar `a,b` partía la
    // expresión en dos condiciones y buscar `a)` la reventaba con un error
    // crudo de PostgREST. La RLS seguía encerrando al inquilino —no había fuga
    // entre clínicas—, pero el filtro dejaba de decir lo que aparentaba.
    //
    // No se arregla escapando: serían dos gramáticas de escape superpuestas
    // (la de LIKE dentro de la de PostgREST), y el `\%` del patrón se comería
    // el escape de la otra. Con dos consultas, el término viaja SIEMPRE como
    // valor de un parámetro y nunca como sintaxis.
    const [porNombre, porDueno] = await Promise.all([
      supabase.from('pacientes').select(COLUMNAS_PACIENTE_SIN_FOTO).ilike('nombre', patron).order('nombre').limit(limite),
      idsDuenos.length
        ? supabase.from('pacientes').select(COLUMNAS_PACIENTE_SIN_FOTO).in('cliente_id', idsDuenos).order('nombre').limit(limite)
        : Promise.resolve({ data: [] as any[], error: null }),
    ])

    const error = porNombre.error ?? porDueno.error
    if (error) throw new Error(`No se pudo cargar la lista de pacientes: ${error.message}`)

    // Un paciente puede casar por su nombre y por el de su dueño a la vez.
    const unicos = new Map<string, any>()
    for (const p of [...(porNombre.data ?? []), ...(porDueno.data ?? [])]) unicos.set(p.id, p)
    pacientes = [...unicos.values()]
      .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)))
      .slice(0, limite)
  }

  if (!pacientes || pacientes.length === 0) return []

  const todayStr = formatClinicDate(new Date().toISOString())
  const pacienteIds = pacientes.map((p: any) => p.id)
  const clienteIds = [...new Set(pacientes.map((p: any) => p.cliente_id).filter(Boolean))]

  // Solo las citas de HOY de estos pacientes: es lo único que la lista pinta.
  const desdeHoy = fromClinicTime(`${clinicDayIso()}T00:00:00`)
  const hastaHoy = fromClinicTime(`${clinicDayIso()}T23:59:59`)

  const [{ data: clientes }, { data: citas }] = await Promise.all([
    supabase.from('clientes').select('*').in('id', clienteIds),
    supabase
      .from('citas')
      .select('*')
      .in('paciente_id', pacienteIds)
      .gte('fecha_hora', desdeHoy)
      .lte('fecha_hora', hastaHoy),
  ])

  const citasDeHoy = citas ?? []
  const veterinarioIds = [...new Set(citasDeHoy.map((c: any) => c.veterinario_id).filter(Boolean))]
  const servicioIds = [...new Set(citasDeHoy.map((c: any) => c.servicio_id).filter(Boolean))]

  const [{ data: usuarios }, { data: servicios }] = await Promise.all([
    veterinarioIds.length
      ? supabase.from('usuarios').select('id, nombre').in('id', veterinarioIds)
      : Promise.resolve({ data: [] as any[] }),
    servicioIds.length
      ? supabase.from('servicios').select('id, nombre').in('id', servicioIds)
      : Promise.resolve({ data: [] as any[] }),
  ])

  // Las internaciones abiertas de TODOS los pacientes del lote, en una consulta.
  // Antes se preguntaba paciente por paciente: 200 filas eran 200 peticiones
  // más, encadenadas al render de la lista.
  const { data: internacionesAbiertas } = await supabase
    .from('internaciones')
    .select('id, paciente_id, fecha_ingreso, fecha_alta, motivo, jaula')
    .in('paciente_id', pacienteIds)
    .eq('estado', 'internado')

  const internacionPorPaciente = new Map(
    (internacionesAbiertas ?? []).map((i: any) => [
      i.paciente_id,
      {
        id: i.id,
        fecha_ingreso: i.fecha_ingreso,
        dias: diasDeEstadia(i.fecha_ingreso, i.fecha_alta),
        motivo: i.motivo,
        jaula: i.jaula,
      } as InternacionResumen,
    ]),
  )

  // Y los orígenes de las reconsultas de hoy, también en lote.
  const mapaOrigenes = await origenesDe(citasDeHoy as any[])

  const result = pacientes.map((p: any) => {
    const cliente = clientes?.find((c) => c.id === p.cliente_id) ?? null
    const internacion_activa = internacionPorPaciente.get(p.id) ?? null

    const citas_hoy = citasDeHoy
      .filter((c: any) => c.paciente_id === p.id && formatClinicDate(c.fecha_hora) === todayStr)
      .map((c: any) => ({
        ...c,
        paciente: { ...p, cliente, internacion_activa },
        veterinario_nombre: usuarios?.find((u: any) => u.id === c.veterinario_id)?.nombre ?? 'Veterinario',
        servicio_nombre: servicios?.find((s: any) => s.id === c.servicio_id)?.nombre ?? null,
        origen: mapaOrigenes.get(c.id) ?? null,
      }) as any)
    citas_hoy.sort((a: any, b: any) => a.fecha_hora.localeCompare(b.fecha_hora))

    return {
      ...p,
      cliente,
      internacion_activa,
      citas_hoy,
    }
  })

  return result as any
}

export async function getFichaPaciente(pacienteId: string): Promise<FichaPaciente | null> {
  const { data: paciente } = await supabase.from('pacientes').select('*').eq('id', pacienteId).single()
  if (!paciente) return null
  
  const { data: cliente } = await supabase.from('clientes').select('*').eq('id', paciente.cliente_id).single()
  const { data: usuarios } = await supabase.from('usuarios').select('*')
  const { data: vacunas } = await supabase.from('vacunas_aplicadas').select('*').eq('paciente_id', pacienteId)
  const { data: desparasitaciones } = await supabase.from('desparasitaciones_aplicadas').select('*').eq('paciente_id', pacienteId)
  const { data: recetas } = await supabase.from('recetas').select('*').eq('paciente_id', pacienteId)
  const { data: citas } = await supabase.from('citas').select('*').eq('paciente_id', pacienteId)
  const { data: servicios } = await supabase.from('servicios').select('*')
  const { data: internacionesData } = await supabase.from('internaciones').select('*').eq('paciente_id', pacienteId)

  // Los movimientos se acotan a las citas de ESTE paciente, y los productos a
  // los que esos movimientos referencian. Antes se traían las dos tablas
  // enteras —`movimientos_inventario` crece sin techo— para quedarse con un
  // puñado de filas, y por encima de 1000 los consumos de una consulta reciente
  // simplemente no aparecían en su ficha.
  const citaIdsDelPaciente = (citas ?? []).map((c: any) => c.id)
  const { data: movimientos } = citaIdsDelPaciente.length
    ? await supabase.from('movimientos_inventario').select('*').in('cita_id', citaIdsDelPaciente)
    : { data: [] as any[] }

  const productoIds = [...new Set((movimientos ?? []).map((m: any) => m.producto_id).filter(Boolean))]
  const { data: productos } = productoIds.length
    ? await supabase.from('productos').select('*').in('id', productoIds)
    : { data: [] as any[] }
  const { data: consentimientos } = await supabase.from('consentimientos_cirugia').select('*').eq('paciente_id', pacienteId)
  const { data: historialesClinicos } = await supabase.from('historial_clinico').select('*').eq('paciente_id', pacienteId)

  const historiales: any[] = await Promise.all((historialesClinicos || []).map(async (h) => {
    const cita = citas?.find((c) => c.id === h.cita_id)
    const productosUsados: ProductoUsado[] = (movimientos || [])
      .filter((m) => m.cita_id === h.cita_id && m.tipo === 'egreso')
      .map((m) => {
        const producto = productos?.find((p) => p.id === m.producto_id)
        return {
          movimiento_id: m.id,
          producto_id: m.producto_id,
          nombre: producto?.nombre ?? 'Producto',
          cantidad: m.cantidad,
          unidad_medida: producto?.unidad_medida ?? '',
          precio_bs: producto?.precio_bs ?? 0,
        }
      })

    return {
      ...h,
      veterinario_nombre: usuarios?.find((u) => u.id === h.veterinario_id)?.nombre ?? 'Veterinario',
      vacunas: (vacunas || []).filter((v) => v.historial_id === h.id),
      desparasitaciones: (desparasitaciones || []).filter((d) => d.historial_id === h.id),
      productosUsados,
      receta: (recetas || []).filter((r: any) => r.historial_id === h.id),
      tipo_cita: cita?.tipo_cita ?? 'consulta',
      procedimiento: servicios?.find((s) => s.id === cita?.servicio_id)?.nombre ?? null,
      origen: cita ? await consultaOrigenDe(cita as any) : null,
    }
  }))
  historiales.sort((a, b) => b.created_at.localeCompare(a.created_at))

  const internaciones: any[] = await Promise.all((internacionesData || []).map((i) => detalleDeInternacion(i as any)))
  internaciones.sort((a, b) => b.fecha_ingreso.localeCompare(a.fecha_ingreso))

  const internacion_activa = await internacionActivaDe(pacienteId)

  const patientCitas: any[] = await Promise.all((citas || []).map(async (c) => {
    return {
      ...c,
      paciente: { ...paciente, cliente, internacion_activa },
      veterinario_nombre: usuarios?.find((u) => u.id === c.veterinario_id)?.nombre ?? 'Veterinario',
      servicio_nombre: servicios?.find((s) => s.id === c.servicio_id)?.nombre ?? null,
      consentimiento: consentimientos?.find((con) => con.cita_id === c.id) ?? null,
      historial_id: historialesClinicos?.find((h) => h.cita_id === c.id)?.id ?? null,
      origen: await consultaOrigenDe(c as any),
    } as any
  }))
  patientCitas.sort((a, b) => b.fecha_hora.localeCompare(a.fecha_hora))

  return {
    paciente: { ...paciente, cliente: cliente as Cliente, internacion_activa } as any,
    historiales,
    internaciones,
    citas: patientCitas,
    vacunas: (vacunas || []).sort((a, b) => b.fecha_aplicacion.localeCompare(a.fecha_aplicacion)),
    // Ordenadas por cadena `yyyy-mm-dd`: ordena igual que por fecha y no pasa
    // por `new Date()`, que sobre una fecha sola desplaza el día en La Paz.
    desparasitaciones: (desparasitaciones || []).sort((a, b) =>
      b.fecha_aplicacion.localeCompare(a.fecha_aplicacion),
    ),
  } as any
}

export type PrimeraConsultaInput = CamposEditablesHistorial & { motivo: string }

export interface NuevoClientePaciente {
  clienteNombre: string
  clienteWhatsapp: string
  clienteCi: string
  pacienteNombre: string
  especie: Especie
  raza: string
  sexo: Sexo
  foto?: string | null
  fechaNacimiento?: string | null
  alergias?: string | null
  antecedentes?: string | null
  veterinarioId?: string
  sucursalId?: string
  primeraConsulta?: PrimeraConsultaInput
}

export interface AltaPacienteResultado {
  paciente: PacienteConDueno
  historialId: string | null
}

export async function registrarClienteYPaciente(input: NuevoClientePaciente): Promise<AltaPacienteResultado> {
  // 1. Prevenir duplicidad accidental
  const { data: duplicados } = await supabase
    .from('pacientes')
    .select('id, clientes!inner(nombre)')
    .ilike('nombre', input.pacienteNombre.trim())
    .ilike('clientes.nombre', input.clienteNombre.trim())
    .limit(1)

  if (duplicados && duplicados.length > 0) {
    throw new Error(`El paciente "${input.pacienteNombre}" ya está registrado a nombre de "${input.clienteNombre}".`)
  }

  // 2. Registrar cliente
  const { data: cliente, error: cliError } = await supabase
    .from('clientes')
    .insert({
      nombre: input.clienteNombre,
      // Solo `.trim()`, no una limpieza agresiva: se guarda tal cual lo
      // tecleó el personal (con su complemento de departamento si lo anotó),
      // no una versión normalizada. La normalización para el vínculo con el
      // portal vive en `registro-portal` (Edge Function), en el punto donde
      // se compara, no aquí donde se guarda.
      whatsapp: input.clienteWhatsapp.trim(),
      ci: input.clienteCi?.trim() || null,
    })
    .select()
    .single()

  if (cliError || !cliente) throw new Error(`Error al registrar cliente: ${cliError?.message || 'desconocido'}`)

  // El `codigo` lo asigna el trigger `trg_codigo_paciente`. Formarlo aquí con
  // `count(*) + 1` era un check-then-act: dos altas simultáneas leían el mismo
  // total y generaban el mismo código.
  const { data: paciente, error: pacError } = await supabase
    .from('pacientes')
    .insert({
      cliente_id: cliente.id,
      nombre: input.pacienteNombre,
      especie: input.especie,
      raza: input.raza,
      sexo: input.sexo,
      foto: input.foto || null,
      fecha_nacimiento: input.fechaNacimiento || null,
      alergias: input.alergias?.trim() || null,
      antecedentes: input.antecedentes?.trim() || null,
    })
    .select()
    .single()

  if (pacError || !paciente) {
    // El cliente ya se insertó: si el paciente falla (CHECK de especie/sexo,
    // colisión del índice de código, RLS) hay que deshacerlo. Sin esto cada
    // reintento dejaba otra ficha de dueño duplicada, y el guardián de
    // duplicados de arriba no las detecta porque solo compara pacientes.
    await supabase.from('clientes').delete().eq('id', cliente.id)
    throw new Error(`Error al registrar paciente: ${pacError?.message || 'desconocido'}`)
  }

  let historialId: string | null = null
  if (input.primeraConsulta && input.veterinarioId && input.sucursalId) {
    const { motivo, ...campos } = input.primeraConsulta
    const historial = await iniciarConsultaLibre(paciente.id, input.sucursalId, input.veterinarioId, motivo)
    await actualizarBorradorHistorial(historial.id, campos)
    historialId = historial.id
  }

  return { paciente: { ...paciente, cliente: cliente as any, internacion_activa: null } as any, historialId }
}

export async function actualizarClienteYPaciente(
  pacienteId: string,
  clienteId: string,
  input: Omit<NuevoClientePaciente, 'primeraConsulta' | 'veterinarioId' | 'sucursalId'>
): Promise<void> {
  const { error: cliError } = await supabase
    .from('clientes')
    .update({
      nombre: input.clienteNombre,
      whatsapp: input.clienteWhatsapp.trim(),
      ci: input.clienteCi?.trim() || null,
    })
    .eq('id', clienteId)

  if (cliError) throw new Error(`Error al actualizar cliente: ${cliError.message}`)

  const { error: pacError } = await supabase
    .from('pacientes')
    .update({
      nombre: input.pacienteNombre,
      especie: input.especie,
      raza: input.raza,
      sexo: input.sexo,
      // `foto` SOLO se escribe si viene en el input.
      //
      // Antes era `foto: input.foto || null`, y eso convertía «no me la
      // pasaron» en «bórrala». Mientras la foto viajaba en todas las lecturas
      // no se notaba, pero en cuanto una pantalla deja de pedirla —que es lo
      // que hace falta para que la lista de pacientes no descargue megas de
      // base64— editar cualquier dato del paciente le habría borrado la foto
      // en silencio. `undefined` es «no la toques»; `null` y '' siguen siendo
      // «quítala», que es lo que manda el formulario cuando se elimina.
      ...(input.foto !== undefined ? { foto: input.foto || null } : {}),
      fecha_nacimiento: input.fechaNacimiento || null,
      alergias: input.alergias?.trim() || null,
      antecedentes: input.antecedentes?.trim() || null,
    })
    .eq('id', pacienteId)

  if (pacError) throw new Error(`Error al actualizar paciente: ${pacError.message}`)
}

/**
 * Une a mano una cuenta del portal ya creada con la ficha de cliente que
 * tiene la mascota — el camino de recuperación que `registro-portal` deja
 * cuando el enlace automático no encuentra coincidencia (CI/WhatsApp con
 * formato distinto, o la persona se registró antes de que existiera esa
 * clínica en su ficha). Sin esto, la cuenta y la ficha quedan separadas para
 * siempre: nada más las vuelve a juntar solas.
 *
 * La cuenta que se está uniendo tiene, por diseño de `registro-portal`
 * (siempre inserta una fila en `clientes` si no pudo vincular), una ficha
 * propia vacía — sin mascotas. Se borra esa ficha vacía y se traslada su
 * `usuario_id` a la ficha real, en ese orden: el índice único parcial
 * `clientes_por_usuario` (0004) no deja que dos filas compartan la misma
 * cuenta a la vez, así que hay que soltarla antes de poder tomarla.
 */
export async function vincularCuentaPortal(clienteId: string, clinicaId: string, email: string): Promise<void> {
  const correo = email.trim().toLowerCase()
  if (!correo) throw new Error('Escribe el correo con el que se registró')

  const { data: usuario, error: errorUsuario } = await supabase
    .from('usuarios')
    .select('id')
    .eq('clinica_id', clinicaId)
    .eq('rol', 'cliente')
    .ilike('email', correo)
    .maybeSingle()

  if (errorUsuario) throw new Error(`No se pudo buscar la cuenta: ${errorUsuario.message}`)
  if (!usuario) throw new Error('No se encontró ninguna cuenta de portal con ese correo en esta clínica')

  const { data: fichaDuplicada, error: errorFicha } = await supabase
    .from('clientes')
    .select('id')
    .eq('usuario_id', usuario.id)
    .maybeSingle()

  if (errorFicha) throw new Error(`No se pudo comprobar la cuenta: ${errorFicha.message}`)
  if (!fichaDuplicada) throw new Error('Esa cuenta no tiene ninguna ficha para unir')
  if (fichaDuplicada.id === clienteId) throw new Error('Esa cuenta ya está vinculada a esta ficha')

  // El resto —que la ficha del portal esté vacía, que la destino esté LIBRE, y
  // que soltar y tomar ocurran de una pieza— lo hace el RPC (0028). Aquí solo
  // se resuelve el correo tecleado, que es lo propio de este camino.
  //
  // Antes esto era un DELETE y luego un UPDATE desde el navegador, sin
  // transacción y sin comprobar que la ficha destino estuviera libre: pisaba un
  // vínculo existente en silencio, y si el segundo viaje fallaba dejaba la
  // cuenta sin ninguna ficha.
  const { error } = await supabase.rpc('vincular_cuenta_portal', {
    p_ficha_destino: clienteId,
    p_ficha_portal: fichaDuplicada.id,
  })

  if (error) throw new Error(error.message)
}

/** Un dueño de la clínica, con lo que hace falta para gestionarlo desde «Clientes». */
export interface ClienteConEstado {
  id: string
  nombre: string
  whatsapp: string
  ci: string | null
  /** Cuenta del portal vinculada a esta ficha, si la hay. */
  usuario_id: string | null
  /** Correo de esa cuenta — lo único que identifica al dueño en el portal. */
  email: string | null
  total_pacientes: number
}

/**
 * Todos los dueños de la clínica, con su nº de mascotas y si tienen cuenta
 * del portal.
 *
 * Existe porque el sistema no tenía NINGUNA lista de dueños: `/pacientes`
 * lista mascotas, así que una ficha sin mascotas —justo la que crea
 * `registro-portal` cuando no logra vincular— era invisible en toda la
 * aplicación. Sin poder verla, nadie podía arreglarla.
 */
export async function listClientesDeClinica(clinicaId: string): Promise<ClienteConEstado[]> {
  const { data: clientes, error } = await supabase
    .from('clientes')
    .select('id, nombre, whatsapp, ci, usuario_id')
    .eq('clinica_id', clinicaId)
    .order('nombre')

  if (error) throw new Error(`No se pudieron cargar los clientes: ${error.message}`)
  const filas = (clientes ?? []) as ClienteConEstado[]
  if (filas.length === 0) return []

  // Dos consultas más, no una por fila: el conteo de mascotas se agrupa en
  // memoria y los correos salen de un solo `in`.
  const [{ data: pacientes }, { data: cuentas }] = await Promise.all([
    supabase.from('pacientes').select('cliente_id').eq('clinica_id', clinicaId),
    supabase
      .from('usuarios')
      .select('id, email')
      .in('id', filas.map((c) => c.usuario_id).filter((id): id is string => Boolean(id))),
  ])

  const porCliente = new Map<string, number>()
  for (const p of pacientes ?? []) {
    const id = (p as { cliente_id: string }).cliente_id
    porCliente.set(id, (porCliente.get(id) ?? 0) + 1)
  }
  const correos = new Map((cuentas ?? []).map((u) => [u.id as string, u.email as string]))

  return filas.map((c) => ({
    ...c,
    email: c.usuario_id ? correos.get(c.usuario_id) ?? null : null,
    total_pacientes: porCliente.get(c.id) ?? 0,
  }))
}

/** Una cuenta del portal que quedó suelta, y la ficha con la que probablemente sea. */
export interface SugerenciaVinculo {
  /** La ficha vacía que creó `registro-portal` al no poder vincular. */
  cuenta: ClienteConEstado
  /** Ficha con mascotas, sin cuenta, cuyo CI o WhatsApp coincide. */
  posible: ClienteConEstado
  /**
   * Por qué se sugiere, para que quien aprueba sepa qué está confirmando.
   * `ci_y_whatsapp` es el mismo listón que el vínculo automático; los otros dos
   * son una pista con un solo dato, y solo se emiten si no hay ambigüedad.
   */
  coincide: 'ci_y_whatsapp' | 'ci' | 'whatsapp'
}

/**
 * Empareja cuentas del portal sueltas con la ficha que probablemente les
 * corresponda, **sin aplicar nada**: decide una persona de la clínica.
 *
 * Es la red de seguridad de lo que `registro-portal` no pudo resolver solo.
 * Esa función ya vincula automáticamente en dos casos —CI + WhatsApp, y
 * WhatsApp solo cuando la ficha no tiene CI y es la única candidata—, así que
 * lo que llega aquí es lo que quedó fuera: sobre todo fichas con un CI anotado
 * que no coincide, y coincidencias ambiguas donde varias fichas comparten el
 * número. Vincular esas automáticamente sí sería el agujero de H-5; con una
 * persona de por medio no lo es, porque quien confirma conoce al cliente.
 *
 * Se cruza por los dos datos: por CI cuando ambos lados lo tienen (cubre a
 * quien cambió de número) y por WhatsApp en el resto. El CI manda, por ser el
 * más específico.
 */
export function sugerenciasDeVinculo(clientes: ClienteConEstado[]): SugerenciaVinculo[] {
  const sueltas = clientes.filter((c) => c.usuario_id && c.total_pacientes === 0)
  const conMascotas = clientes.filter((c) => !c.usuario_id && c.total_pacientes > 0)

  return sueltas.flatMap((cuenta): SugerenciaVinculo[] => {
    const suCi = cedula(cuenta.ci ?? '')
    const suMovil = movil(cuenta.whatsapp)

    // Se busca por cada dato POR SEPARADO y se exige unicidad en el que gane.
    // Antes se usaba `.find()`, que devuelve la primera por orden alfabético:
    // con dos fichas compartiendo el teléfono —un matrimonio, una familia— se
    // sugería una de las dos sin decir que había otra, y el vínculo que salía
    // de ahí no se podía deshacer.
    const porCi = suCi ? conMascotas.filter((f) => cedula(f.ci ?? '') === suCi) : []
    const porMovil = suMovil ? conMascotas.filter((f) => movil(f.whatsapp) === suMovil) : []

    // Los dos datos a la vez y sobre la misma ficha: el mismo listón que el
    // automático de `registro-portal`, y la única que se sugiere sin reservas.
    const ambos = porCi.filter((f) => porMovil.some((m) => m.id === f.id))
    if (ambos.length === 1) return [{ cuenta, posible: ambos[0], coincide: 'ci_y_whatsapp' }]

    // Un solo dato: vale como pista, pero solo si no hay ninguna ambigüedad.
    // Con dos candidatas no se propone ninguna — quien aprueba no puede
    // distinguirlas, y la pantalla lo dirá.
    if (porCi.length === 1 && porMovil.length === 0) {
      return [{ cuenta, posible: porCi[0], coincide: 'ci' }]
    }
    if (porMovil.length === 1 && porCi.length === 0) {
      return [{ cuenta, posible: porMovil[0], coincide: 'whatsapp' }]
    }

    return []
  })
}

/**
 * Une una cuenta del portal con la ficha que tiene las mascotas, por ids.
 *
 * Misma operación que `vincularCuentaPortal` —y con las mismas comprobaciones
 * de seguridad— pero partiendo de dos fichas que ya se tienen a la vista, en
 * vez de un correo tecleado a ciegas. Las dos conviven a propósito: esta se
 * usa desde «Clientes», donde la sugerencia ya está delante; la otra desde la
 * ficha del paciente, donde solo se sabe el correo.
 */
export async function vincularPorIds(clienteConMascotasId: string, clienteDelPortalId: string): Promise<void> {
  const { error } = await supabase.rpc('vincular_cuenta_portal', {
    p_ficha_destino: clienteConMascotasId,
    p_ficha_portal: clienteDelPortalId,
  })

  if (error) throw new Error(error.message)
}

/**
 * Suelta la cuenta del portal de una ficha, y le devuelve una ficha propia.
 *
 * **La reparación que no existía.** Ningún punto del código escribía
 * `clientes.usuario_id = null`: los cuatro que tocan esa columna asignan un id.
 * Un vínculo mal hecho —y `ClientesPage` los propone a partir de coincidencias
 * de teléfono— era irreversible desde la interfaz, dejando a alguien viendo el
 * historial, las recetas y los estudios de una mascota ajena. La única salida
 * era borrar la cuenta entera, porque la FK es `on delete set null`.
 *
 * Deja a la cuenta en el mismo estado en que la deja `registro-portal` cuando
 * no encuentra a quién vincularla: con su propia ficha vacía, visible en
 * «Clientes» y candidata a una sugerencia nueva. Eso lo hace el RPC en la misma
 * transacción; ver `0028_vinculo_portal.sql` para por qué esa ficha nueva no es
 * opcional.
 */
export async function desvincularCuentaPortal(clienteId: string): Promise<void> {
  const { error } = await supabase.rpc('desvincular_cuenta_portal', { p_ficha: clienteId })
  if (error) throw new Error(error.message)
}

/**
 * Borra una ficha de dueño **vacía**: duplicados, errores de tipeo y las que
 * deja «Desvincular».
 *
 * ⚠️ **Con mascotas no se borra, y no es una comodidad.**
 * `pacientes.cliente_id` es `on delete cascade`, y desde `pacientes` cascadean
 * doce tablas más —historial, citas, vacunas, desparasitaciones,
 * internaciones, consentimientos, recetas, informes, estudios de imagen y las
 * tres de peluquería—, así que borrar un dueño con mascotas **destruye el
 * expediente médico completo de cada una**. Es lo contrario de lo que protegen
 * `trg_historial_inmutable` y las policies INSERT-only.
 *
 * La barrera de verdad está en la RLS (`clientes_delete`, migración 0036): sin
 * mascotas, por cualquier camino. Lo de aquí es para **decir por qué** en vez
 * de devolver un «no se borró» sin motivo, que es lo que daría la policy sola.
 *
 * Mismo criterio que `eliminarPaciente` justo debajo: comprobar antes en vez de
 * cambiar la cascada, porque el resto de la cadena sí debe irse con su dueño.
 */
export async function eliminarCliente(clienteId: string): Promise<void> {
  const { data: pacientes, error: errorPac } = await supabase
    .from('pacientes')
    .select('id')
    .eq('cliente_id', clienteId)
  if (errorPac) throw new Error(`No se pudo comprobar el cliente: ${errorPac.message}`)

  if (pacientes && pacientes.length > 0) {
    throw new Error(
      `Este cliente tiene ${pacientes.length} mascota(s) y no se puede eliminar: ` +
        'borrar la ficha se llevaría su historial, sus vacunas y sus recetas. ' +
        'Cambia primero las mascotas de dueño o dales de baja.',
    )
  }

  // `peluqueria_ordenes.cliente_id` también cascadea. Sin mascotas no debería
  // haber ninguna —una orden exige `paciente_id`— pero las dos columnas son
  // independientes y nada obliga a que sean del mismo dueño. Una consulta por
  // no destruir una orden y su cobro.
  const { data: ordenes, error: errorOrd } = await supabase
    .from('peluqueria_ordenes')
    .select('id')
    .eq('cliente_id', clienteId)
  if (errorOrd) throw new Error(`No se pudo comprobar el cliente: ${errorOrd.message}`)

  if (ordenes && ordenes.length > 0) {
    throw new Error(
      `Este cliente tiene ${ordenes.length} orden(es) de peluquería y no se puede eliminar.`,
    )
  }

  // La cuenta del portal se quedaría SIN NINGUNA FICHA: invisible incluso para
  // la pantalla que sirve para recuperarla, que es el agujero que 0028 vino a
  // tapar. Se suelta primero con «Desvincular», que le deja una ficha propia.
  const { data: ficha, error: errorFicha } = await supabase
    .from('clientes')
    .select('usuario_id')
    .eq('id', clienteId)
    .maybeSingle()
  if (errorFicha) throw new Error(`No se pudo comprobar el cliente: ${errorFicha.message}`)
  if (!ficha) throw new Error('Esta ficha ya no existe')

  if (ficha.usuario_id) {
    throw new Error(
      'Esta ficha tiene una cuenta del portal vinculada. Usa «Desvincular» primero: ' +
        'si se borra, esa cuenta se queda sin ninguna ficha y deja de verse en el sistema.',
    )
  }

  // `.select('id')`: cuando la RLS filtra la fila, PostgREST devuelve 204 con
  // `error` en null. Sin esto la pantalla diría «borrado» sin haber borrado.
  const { data, error } = await supabase
    .from('clientes')
    .delete()
    .eq('id', clienteId)
    .select('id')

  if (error) throw new Error(`Error al eliminar el cliente: ${error.message}`)
  if (!data || data.length === 0) {
    throw new Error('No tienes permiso para eliminar este cliente')
  }
}

/**
 * Borra un paciente, salvo que tenga dinero cobrado detrás.
 *
 * La cadena de claves foráneas es toda `on delete cascade`
 * (`pacientes` → `citas` → `cobros` → `cobro_lineas`, y lo mismo por
 * `internaciones`), y **los cascades de PostgreSQL no evalúan la RLS**. Así que
 * borrar un paciente se llevaba por delante cobros ya contabilizados en turnos
 * de caja cerrados y arqueados: el arqueo firmado dejaba de cuadrar
 * retroactivamente y las métricas del mes se reescribían solas, sin ningún
 * error por medio.
 *
 * Se comprueba antes en vez de cambiar la cascada porque el resto de la cadena
 * (historial, vacunas, notas) sí debe irse con el paciente; lo que no puede
 * desaparecer es la caja.
 */
export async function eliminarPaciente(pacienteId: string): Promise<void> {
  const { data: citas, error: errorCitas } = await supabase
    .from('citas')
    .select('id')
    .eq('paciente_id', pacienteId)
  if (errorCitas) throw new Error(`No se pudo comprobar el paciente: ${errorCitas.message}`)

  const { data: internaciones, error: errorInt } = await supabase
    .from('internaciones')
    .select('id')
    .eq('paciente_id', pacienteId)
  if (errorInt) throw new Error(`No se pudo comprobar el paciente: ${errorInt.message}`)

  const citaIds = (citas ?? []).map((c) => c.id)
  const internacionIds = (internaciones ?? []).map((i) => i.id)

  if (citaIds.length > 0 || internacionIds.length > 0) {
    let cobrosQuery = supabase.from('cobros').select('id')
    // Este `.or()` sí es seguro, y conviene decir por qué: lo que se interpola
    // son uuids que acaban de salir de la base, no texto de nadie. Un uuid no
    // puede llevar una coma ni un paréntesis, así que no hay forma de partir la
    // expresión. La regla es esa —**nunca** entrada de usuario dentro de un
    // `.or()`—, no que `.or()` esté prohibido; ver `listPacientes` arriba.
    cobrosQuery =
      citaIds.length > 0 && internacionIds.length > 0
        ? cobrosQuery.or(
            `cita_id.in.(${citaIds.join(',')}),internacion_id.in.(${internacionIds.join(',')})`,
          )
        : citaIds.length > 0
          ? cobrosQuery.in('cita_id', citaIds)
          : cobrosQuery.in('internacion_id', internacionIds)

    const { data: cobros, error: errorCobros } = await cobrosQuery
    if (errorCobros) throw new Error(`No se pudo comprobar el paciente: ${errorCobros.message}`)

    if (cobros && cobros.length > 0) {
      throw new Error(
        `Este paciente tiene ${cobros.length} cobro(s) registrados en caja y no se puede eliminar. ` +
          'Borrarlo descuadraría turnos de caja ya cerrados.',
      )
    }
  }

  const { data, error } = await supabase
    .from('pacientes')
    .delete()
    .eq('id', pacienteId)
    .select('id')

  if (error) throw new Error(`Error al eliminar paciente: ${error.message}`)
  if (!data || data.length === 0) {
    throw new Error('No tienes permiso para eliminar este paciente')
  }
}
