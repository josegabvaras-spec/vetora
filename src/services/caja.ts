import { db, newId } from '../mocks/db'
import type { Cita, Cobro, CobroLinea, Internacion, MetodoPago, TurnoCaja } from '../types/database'
import type { AtencionPorCobrar, CobroConDetalle, LineaCobro } from '../types/views'
import { TIPO_LABEL } from '../lib/citas'
import { diasDeEstadia, etiquetaDias } from '../lib/internacion'

function delay<T>(value: T): Promise<T> {
  return Promise.resolve(value)
}

/**
 * Productos consumidos en la atención, rastreados por el movimiento de
 * inventario que los descontó. Los servicios NO se derivan de la atención: los
 * elige recepción del catálogo al momento de cobrar.
 */
function lineasDeConsumo(perteneceA: (m: { cita_id?: string | null; internacion_id?: string | null }) => boolean) {
  const productos = db.get('productos')
  const lineas: LineaCobro[] = []

  for (const m of db.get('movimientos_inventario')) {
    if (m.tipo !== 'egreso' || !perteneceA(m)) continue
    const producto = productos.find((p) => p.id === m.producto_id)
    const precio = producto?.precio_bs ?? 0
    lineas.push({
      concepto: producto?.nombre ?? 'Producto',
      cantidad: m.cantidad,
      precio_unitario_bs: precio,
      subtotal_bs: Number((precio * m.cantidad).toFixed(2)),
      producto_id: m.producto_id,
    })
  }

  return lineas
}

export function lineasDeProductos(cita: Cita): LineaCobro[] {
  return lineasDeConsumo((m) => m.cita_id === cita.id)
}

/**
 * Lo devengado por una internación: los días de estadía a la tarifa congelada
 * al ingreso, más los productos consumidos durante ella.
 */
export function lineasDeInternacion(internacion: Internacion): LineaCobro[] {
  const dias = diasDeEstadia(internacion.fecha_ingreso, internacion.fecha_alta)
  const servicio = db.get('servicios').find((s) => s.id === internacion.servicio_dia_id)

  const estadia: LineaCobro = {
    concepto: `${servicio?.nombre ?? 'Día de internación'} (${etiquetaDias(dias)})`,
    cantidad: dias,
    precio_unitario_bs: internacion.precio_dia_bs,
    subtotal_bs: Number((dias * internacion.precio_dia_bs).toFixed(2)),
    servicio_id: internacion.servicio_dia_id,
  }

  return [estadia, ...lineasDeConsumo((m) => m.internacion_id === internacion.id)]
}

/** Servicio elegido en caja, con su cantidad. */
export interface ServicioSeleccionado {
  servicio_id: string
  cantidad: number
}

/** Convierte la selección de caja en líneas, tomando el precio vigente del catálogo. */
export function lineasDeServicios(seleccion: ServicioSeleccionado[]): LineaCobro[] {
  const servicios = db.get('servicios')
  return seleccion.map((s) => {
    const servicio = servicios.find((x) => x.id === s.servicio_id)
    if (!servicio) throw new Error('Servicio no encontrado en el catálogo')
    const precio = Number.isFinite(servicio.precio_bs) ? servicio.precio_bs : 0
    return {
      concepto: servicio.nombre,
      cantidad: s.cantidad,
      precio_unitario_bs: precio,
      subtotal_bs: Number((precio * s.cantidad).toFixed(2)),
      servicio_id: servicio.id,
    }
  })
}

export function totalDe(lineas: LineaCobro[]): number {
  return Number(lineas.reduce((n, l) => n + l.subtotal_bs, 0).toFixed(2))
}

/** Turno de caja abierto en la sucursal, si lo hay. */
export function getTurnoAbierto(sucursalId: string): TurnoCaja | undefined {
  return db.get('turnos_caja').find((t) => t.sucursal_id === sucursalId && t.estado === 'abierto')
}

export async function abrirTurno(sucursalId: string, usuarioId: string, saldoInicial: number): Promise<TurnoCaja> {
  if (saldoInicial < 0) throw new Error('El saldo inicial no puede ser negativo')
  if (getTurnoAbierto(sucursalId)) {
    throw new Error('Ya hay una caja abierta en esta sucursal')
  }

  const turno: TurnoCaja = {
    id: newId('turno'),
    clinica_id: db.clinicaActivaId(),
    sucursal_id: sucursalId,
    usuario_id: usuarioId,
    saldo_inicial_bs: saldoInicial,
    abierto_at: new Date().toISOString(),
    cerrado_at: null,
    saldo_declarado_bs: null,
    diferencia_bs: null,
    estado: 'abierto',
    created_at: new Date().toISOString(),
  }
  db.set('turnos_caja', [...db.get('turnos_caja'), turno])
  return delay(turno)
}

export interface ResumenTurno {
  efectivo_bs: number
  qr_bs: number
  total_bs: number
  /** Efectivo que debería haber en caja: saldo inicial + cobros en efectivo. */
  esperado_en_caja_bs: number
  cantidad_cobros: number
}

export function resumenTurno(turnoId: string): ResumenTurno {
  const turno = db.get('turnos_caja').find((t) => t.id === turnoId)
  const cobros = db.get('cobros').filter((c) => c.turno_id === turnoId)
  const efectivo = cobros.filter((c) => c.metodo_pago === 'efectivo').reduce((n, c) => n + c.monto_bs, 0)
  const qr = cobros.filter((c) => c.metodo_pago === 'qr').reduce((n, c) => n + c.monto_bs, 0)

  return {
    efectivo_bs: Number(efectivo.toFixed(2)),
    qr_bs: Number(qr.toFixed(2)),
    total_bs: Number((efectivo + qr).toFixed(2)),
    // El QR no pasa por la caja física, así que no entra al arqueo.
    esperado_en_caja_bs: Number(((turno?.saldo_inicial_bs ?? 0) + efectivo).toFixed(2)),
    cantidad_cobros: cobros.length,
  }
}

export async function cerrarTurno(turnoId: string, saldoDeclarado: number): Promise<TurnoCaja> {
  const turno = db.get('turnos_caja').find((t) => t.id === turnoId)
  if (!turno) throw new Error('Turno no encontrado')
  if (turno.estado === 'cerrado') throw new Error('Esta caja ya fue cerrada')
  if (saldoDeclarado < 0) throw new Error('El monto contado no puede ser negativo')

  const { esperado_en_caja_bs } = resumenTurno(turnoId)
  const cerrado: TurnoCaja = {
    ...turno,
    estado: 'cerrado',
    cerrado_at: new Date().toISOString(),
    saldo_declarado_bs: saldoDeclarado,
    diferencia_bs: Number((saldoDeclarado - esperado_en_caja_bs).toFixed(2)),
  }
  db.set(
    'turnos_caja',
    db.get('turnos_caja').map((t) => (t.id === turnoId ? cerrado : t)),
  )
  return delay(cerrado)
}

/** Descripción legible de la atención cobrada, para la lista y el recibo. */
function conceptoDeCita(cita: Cita): string {
  const servicio = db.get('servicios').find((s) => s.id === cita.servicio_id)
  return servicio ? `${TIPO_LABEL[cita.tipo_cita]} · ${servicio.nombre}` : TIPO_LABEL[cita.tipo_cita]
}

function conceptoDeInternacion(internacion: Internacion): string {
  return `Internación · ${etiquetaDias(diasDeEstadia(internacion.fecha_ingreso, internacion.fecha_alta))}`
}

/**
 * Atenciones terminadas y aún no cobradas: citas completadas e internaciones
 * dadas de alta. Una estadía en curso no se cobra todavía, porque sus días
 * siguen sumando.
 */
export async function listAtencionesPorCobrar(sucursalId?: string): Promise<AtencionPorCobrar[]> {
  const cobros = db.get('cobros')
  const citasCobradas = new Set(cobros.map((c) => c.cita_id).filter(Boolean))
  const internacionesCobradas = new Set(cobros.map((c) => c.internacion_id).filter(Boolean))
  const pacientes = db.get('pacientes')
  const clientes = db.get('clientes')
  const usuarios = db.get('usuarios')

  const nombreVet = (id: string) => usuarios.find((u) => u.id === id)?.nombre ?? 'Veterinario'

  const deCitas = db
    .get('citas')
    .filter((c) => c.estado === 'completada' && !citasCobradas.has(c.id))
    .filter((c) => !sucursalId || c.sucursal_id === sucursalId)
    .map((cita) => {
      const paciente = pacientes.find((p) => p.id === cita.paciente_id)
      const cliente = clientes.find((cl) => cl.id === paciente?.cliente_id)
      const lineasFijas = lineasDeProductos(cita)
      return {
        tipo: 'cita',
        referencia_id: cita.id,
        paciente_nombre: paciente?.nombre ?? 'Paciente',
        cliente_nombre: cliente?.nombre ?? '—',
        veterinario_nombre: nombreVet(cita.veterinario_id),
        concepto: conceptoDeCita(cita),
        fecha: cita.fecha_hora,
        lineasFijas,
        subtotal_fijo_bs: totalDe(lineasFijas),
        // La cirugía agendada llega preseleccionada en caja: ya se sabe qué se hizo.
        servicio_sugerido_id: cita.servicio_id ?? null,
      } satisfies AtencionPorCobrar
    })

  const deInternaciones = db
    .get('internaciones')
    .filter((i) => i.estado === 'alta' && !internacionesCobradas.has(i.id))
    .filter((i) => !sucursalId || i.sucursal_id === sucursalId)
    .map((internacion) => {
      const paciente = pacientes.find((p) => p.id === internacion.paciente_id)
      const cliente = clientes.find((cl) => cl.id === paciente?.cliente_id)
      const lineasFijas = lineasDeInternacion(internacion)
      return {
        tipo: 'internacion',
        referencia_id: internacion.id,
        paciente_nombre: paciente?.nombre ?? 'Paciente',
        cliente_nombre: cliente?.nombre ?? '—',
        veterinario_nombre: nombreVet(internacion.veterinario_id),
        concepto: conceptoDeInternacion(internacion),
        fecha: internacion.fecha_alta ?? internacion.fecha_ingreso,
        lineasFijas,
        subtotal_fijo_bs: totalDe(lineasFijas),
        servicio_sugerido_id: null,
      } satisfies AtencionPorCobrar
    })

  return delay([...deCitas, ...deInternaciones].sort((a, b) => a.fecha.localeCompare(b.fecha)))
}

/** Qué se está cobrando: una cita atendida o una internación dada de alta. */
export type ReferenciaAtencion =
  | { tipo: 'cita'; id: string }
  | { tipo: 'internacion'; id: string }

/**
 * Registra el cobro de una atención. Exige turno abierto y rechaza el doble
 * cobro; en Supabase esas mismas reglas las garantizan el índice único parcial
 * de `turnos_caja` y los índices únicos de `cita_id` / `internacion_id` de
 * `cobros`.
 */
export async function registrarCobro(
  atencion: ReferenciaAtencion,
  metodoPago: MetodoPago,
  usuarioId: string,
  servicios: ServicioSeleccionado[] = [],
): Promise<Cobro> {
  let sucursalId: string
  let lineasFijas: LineaCobro[]

  if (atencion.tipo === 'cita') {
    const cita = db.get('citas').find((c) => c.id === atencion.id)
    if (!cita) throw new Error('Cita no encontrada')
    if (db.get('cobros').some((c) => c.cita_id === cita.id)) {
      throw new Error('Esta cita ya fue cobrada')
    }
    sucursalId = cita.sucursal_id
    lineasFijas = lineasDeProductos(cita)
  } else {
    const internacion = db.get('internaciones').find((i) => i.id === atencion.id)
    if (!internacion) throw new Error('Internación no encontrada')
    if (internacion.estado !== 'alta') {
      throw new Error('Da de alta al paciente antes de cobrar la internación')
    }
    if (db.get('cobros').some((c) => c.internacion_id === internacion.id)) {
      throw new Error('Esta internación ya fue cobrada')
    }
    sucursalId = internacion.sucursal_id
    lineasFijas = lineasDeInternacion(internacion)
  }

  const turno = getTurnoAbierto(sucursalId)
  if (!turno) throw new Error('Abre la caja antes de registrar cobros')

  const lineas = [...lineasDeServicios(servicios), ...lineasFijas]
  const monto = totalDe(lineas)
  if (monto <= 0) throw new Error('Agrega al menos un servicio o producto para cobrar')

  const cobro: Cobro = {
    id: newId('cobro'),
    clinica_id: db.clinicaActivaId(),
    sucursal_id: sucursalId,
    turno_id: turno.id,
    cita_id: atencion.tipo === 'cita' ? atencion.id : null,
    internacion_id: atencion.tipo === 'internacion' ? atencion.id : null,
    usuario_id: usuarioId,
    monto_bs: monto,
    metodo_pago: metodoPago,
    created_at: new Date().toISOString(),
  }
  db.set('cobros', [...db.get('cobros'), cobro])

  // Se guarda el precio aplicado en este momento: si el catálogo cambia
  // después, el recibo ya emitido debe seguir mostrando lo que se cobró.
  const persistidas: CobroLinea[] = lineas.map((l) => ({
    id: newId('linea'),
    clinica_id: db.clinicaActivaId(),
    cobro_id: cobro.id,
    concepto: l.concepto,
    cantidad: l.cantidad,
    precio_unitario_bs: l.precio_unitario_bs,
    subtotal_bs: l.subtotal_bs,
    servicio_id: l.servicio_id ?? null,
    producto_id: l.producto_id ?? null,
  }))
  db.set('cobro_lineas', [...db.get('cobro_lineas'), ...persistidas])

  return delay(cobro)
}

export function detalleDeCobro(cobro: Cobro): CobroConDetalle {
  const cita = db.get('citas').find((c) => c.id === cobro.cita_id)
  const internacion = db.get('internaciones').find((i) => i.id === cobro.internacion_id)
  const pacienteId = cita?.paciente_id ?? internacion?.paciente_id
  const veterinarioId = cita?.veterinario_id ?? internacion?.veterinario_id

  const paciente = db.get('pacientes').find((p) => p.id === pacienteId)
  const cliente = db.get('clientes').find((cl) => cl.id === paciente?.cliente_id)
  const veterinario = db.get('usuarios').find((u) => u.id === veterinarioId)

  return {
    ...cobro,
    paciente_nombre: paciente?.nombre ?? 'Paciente',
    cliente_nombre: cliente?.nombre ?? '—',
    veterinario_nombre: veterinario?.nombre ?? 'Veterinario',
    concepto_atencion: cita
      ? conceptoDeCita(cita)
      : internacion
        ? conceptoDeInternacion(internacion)
        : 'Atención',
    fecha_atencion: cita?.fecha_hora ?? internacion?.fecha_alta ?? cobro.created_at,
    // Se LEEN las líneas guardadas, no se recalculan: así el recibo refleja
    // los precios del momento del cobro aunque el catálogo haya cambiado.
    lineas: db
      .get('cobro_lineas')
      .filter((l) => l.cobro_id === cobro.id)
      .map((l) => ({
        concepto: l.concepto,
        cantidad: l.cantidad,
        precio_unitario_bs: l.precio_unitario_bs,
        subtotal_bs: l.subtotal_bs,
        servicio_id: l.servicio_id,
        producto_id: l.producto_id,
      })),
  }
}

export async function listCobrosDelTurno(turnoId: string): Promise<CobroConDetalle[]> {
  const result = db
    .get('cobros')
    .filter((c) => c.turno_id === turnoId)
    .map(detalleDeCobro)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
  return delay(result)
}

export async function getCobro(cobroId: string): Promise<CobroConDetalle | null> {
  const cobro = db.get('cobros').find((c) => c.id === cobroId)
  return delay(cobro ? detalleDeCobro(cobro) : null)
}
