import { supabase } from '../lib/supabase'
import type { Cita, Cobro, Internacion, MetodoPago, TurnoCaja } from '../types/database'
import type { AtencionPorCobrar, CobroConDetalle, LineaCobro } from '../types/views'
import { TIPO_LABEL } from '../lib/citas'
import { diasDeEstadia, etiquetaDias } from '../lib/internacion'
import { registrarMovimiento } from './inventario'

async function lineasDeConsumo(columnaFk: 'cita_id' | 'internacion_id', id: string): Promise<LineaCobro[]> {
  const { data: movimientos } = await supabase
    .from('movimientos_inventario')
    .select('*, producto:productos(*)')
    .eq('tipo', 'egreso')
    .eq(columnaFk, id)

  if (!movimientos) return []

  return movimientos.map((m: any) => {
    const precio = m.producto?.precio_bs ?? 0
    return {
      concepto: m.producto?.nombre ?? 'Producto',
      cantidad: m.cantidad,
      precio_unitario_bs: precio,
      subtotal_bs: Number((precio * m.cantidad).toFixed(2)),
      producto_id: m.producto_id,
    }
  })
}

export async function lineasDeProductos(cita: Cita): Promise<LineaCobro[]> {
  return lineasDeConsumo('cita_id', cita.id)
}

export async function lineasDeInternacion(internacion: Internacion): Promise<LineaCobro[]> {
  const dias = diasDeEstadia(internacion.fecha_ingreso, internacion.fecha_alta)
  const { data: servicio } = await supabase.from('servicios').select('*').eq('id', internacion.servicio_dia_id).single()

  const estadia: LineaCobro = {
    concepto: `${servicio?.nombre ?? 'Día de internación'} (${etiquetaDias(dias)})`,
    cantidad: dias,
    precio_unitario_bs: internacion.precio_dia_bs,
    subtotal_bs: Number((dias * internacion.precio_dia_bs).toFixed(2)),
    servicio_id: internacion.servicio_dia_id,
  }

  const consumos = await lineasDeConsumo('internacion_id', internacion.id)
  return [estadia, ...consumos]
}

export interface ServicioSeleccionado {
  servicio_id: string
  cantidad: number
}

export async function lineasDeServicios(seleccion: ServicioSeleccionado[]): Promise<LineaCobro[]> {
  if (seleccion.length === 0) return []
  
  const ids = seleccion.map((s) => s.servicio_id)
  const { data: servicios } = await supabase.from('servicios').select('*').in('id', ids)
  
  if (!servicios) return []

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

export async function getTurnoAbierto(sucursalId: string): Promise<TurnoCaja | undefined> {
  const { data } = await supabase
    .from('turnos_caja')
    .select('*')
    .eq('sucursal_id', sucursalId)
    .eq('estado', 'abierto')
    .maybeSingle()
    
  return (data as any) ?? undefined
}

export async function abrirTurno(sucursalId: string, usuarioId: string, saldoInicial: number): Promise<TurnoCaja> {
  if (saldoInicial < 0) throw new Error('El saldo inicial no puede ser negativo')
  if (await getTurnoAbierto(sucursalId)) {
    throw new Error('Ya hay una caja abierta en esta sucursal')
  }

  const { data: turno, error } = await supabase
    .from('turnos_caja')
    .insert({
      sucursal_id: sucursalId,
      usuario_id: usuarioId,
      saldo_inicial_bs: saldoInicial,
      abierto_at: new Date().toISOString(),
      estado: 'abierto',
    })
    .select()
    .single()

  if (error || !turno) throw new Error(`Error al abrir caja: ${error?.message || 'desconocido'}`)
  return turno as TurnoCaja
}

export interface ResumenTurno {
  efectivo_bs: number
  qr_bs: number
  total_bs: number
  esperado_en_caja_bs: number
  cantidad_cobros: number
}

export async function resumenTurno(turnoId: string): Promise<ResumenTurno> {
  const { data: turno } = await supabase.from('turnos_caja').select('*').eq('id', turnoId).single()
  const { data: cobros } = await supabase.from('cobros').select('*').eq('turno_id', turnoId)
  
  const cobrosList = cobros || []
  const efectivo = cobrosList.filter((c) => c.metodo_pago === 'efectivo').reduce((n, c) => n + c.monto_bs, 0)
  const qr = cobrosList.filter((c) => c.metodo_pago === 'qr').reduce((n, c) => n + c.monto_bs, 0)

  return {
    efectivo_bs: Number(efectivo.toFixed(2)),
    qr_bs: Number(qr.toFixed(2)),
    total_bs: Number((efectivo + qr).toFixed(2)),
    esperado_en_caja_bs: Number(((turno?.saldo_inicial_bs ?? 0) + efectivo).toFixed(2)),
    cantidad_cobros: cobrosList.length,
  }
}

export async function cerrarTurno(turnoId: string, saldoDeclarado: number): Promise<TurnoCaja> {
  const { data: turno } = await supabase.from('turnos_caja').select('*').eq('id', turnoId).single()
  if (!turno) throw new Error('Turno no encontrado')
  if (turno.estado === 'cerrado') throw new Error('Esta caja ya fue cerrada')
  if (saldoDeclarado < 0) throw new Error('El monto contado no puede ser negativo')

  const { esperado_en_caja_bs } = await resumenTurno(turnoId)
  
  // `.eq('estado', 'abierto')` es la parte que cierra la carrera: la comprobación
  // de arriba y este update son dos viajes, así que dos pestañas podían cerrar
  // el mismo turno y la segunda sobrescribía `saldo_declarado_bs` y
  // `diferencia_bs` de un arqueo ya firmado. `turnos_caja_all` no tiene
  // predicado de estado, así que la condición tiene que ir aquí.
  const { data: cerrado, error } = await supabase
    .from('turnos_caja')
    .update({
      estado: 'cerrado',
      cerrado_at: new Date().toISOString(),
      saldo_declarado_bs: saldoDeclarado,
      diferencia_bs: Number((saldoDeclarado - esperado_en_caja_bs).toFixed(2)),
    } as any)
    .eq('id', turnoId)
    .eq('estado', 'abierto')
    .select()
    .single()

  if (error || !cerrado) {
    // PGRST116 = 0 filas: otra pestaña ganó la carrera y ya lo cerró.
    if ((error as { code?: string } | null)?.code === 'PGRST116') {
      throw new Error('Esta caja acaba de ser cerrada desde otra sesión. Recarga para ver el arqueo.')
    }
    throw new Error(`Error al cerrar caja: ${error?.message || 'desconocido'}`)
  }
  return cerrado as TurnoCaja
}

async function conceptoDeCita(cita: Cita): Promise<string> {
  const etiqueta = TIPO_LABEL[cita.tipo_cita as keyof typeof TIPO_LABEL]
  // servicio_id es opcional en la cita: sin él, el concepto es solo el tipo.
  if (!cita.servicio_id) return etiqueta
  const { data: servicio } = await supabase.from('servicios').select('*').eq('id', cita.servicio_id).maybeSingle()
  return servicio ? `${etiqueta} - ${servicio.nombre}` : etiqueta
}

function conceptoDeInternacion(internacion: Internacion): string {
  return `Internación · ${etiquetaDias(diasDeEstadia(internacion.fecha_ingreso, internacion.fecha_alta))}`
}

export async function listAtencionesPorCobrar(sucursalId?: string): Promise<AtencionPorCobrar[]> {
  const { data: cobros } = await supabase.from('cobros').select('cita_id, internacion_id')
  const citasCobradas = new Set((cobros || []).map((c) => c.cita_id).filter(Boolean))
  const internacionesCobradas = new Set((cobros || []).map((c) => c.internacion_id).filter(Boolean))

  let citasQuery = supabase.from('citas').select('*, paciente:pacientes(*, cliente:clientes(*)), veterinario:usuarios(*)').eq('estado', 'completada')
  if (sucursalId) citasQuery = citasQuery.eq('sucursal_id', sucursalId)
  const { data: citas } = await citasQuery

  let intQuery = supabase.from('internaciones').select('*, paciente:pacientes(*, cliente:clientes(*)), veterinario:usuarios(*)').eq('estado', 'alta')
  if (sucursalId) intQuery = intQuery.eq('sucursal_id', sucursalId)
  const { data: internaciones } = await intQuery

  const atenciones: AtencionPorCobrar[] = []

  for (const cita of (citas || [])) {
    if (citasCobradas.has(cita.id)) continue
    const lineasFijas = await lineasDeProductos(cita as any)
    atenciones.push({
      tipo: 'cita',
      referencia_id: cita.id,
      paciente_nombre: cita.paciente?.nombre ?? 'Paciente',
      cliente_nombre: cita.paciente?.cliente?.nombre ?? '—',
      veterinario_nombre: cita.veterinario?.nombre ?? 'Veterinario',
      concepto: await conceptoDeCita(cita as any),
      fecha: cita.fecha_hora,
      lineasFijas,
      subtotal_fijo_bs: totalDe(lineasFijas),
      servicio_sugerido_id: cita.servicio_id ?? null,
    })
  }

  for (const int of (internaciones || [])) {
    if (internacionesCobradas.has(int.id)) continue
    const lineasFijas = await lineasDeInternacion(int as any)
    atenciones.push({
      tipo: 'internacion',
      referencia_id: int.id,
      paciente_nombre: int.paciente?.nombre ?? 'Paciente',
      cliente_nombre: int.paciente?.cliente?.nombre ?? '—',
      veterinario_nombre: int.veterinario?.nombre ?? 'Veterinario',
      concepto: conceptoDeInternacion(int as any),
      fecha: int.fecha_alta ?? int.fecha_ingreso,
      lineasFijas,
      subtotal_fijo_bs: totalDe(lineasFijas),
      servicio_sugerido_id: null,
    })
  }

  return atenciones.sort((a, b) => a.fecha.localeCompare(b.fecha))
}

export type ReferenciaAtencion =
  | { tipo: 'cita'; id: string }
  | { tipo: 'internacion'; id: string }

export async function registrarCobro(
  atencion: ReferenciaAtencion,
  metodoPago: MetodoPago,
  usuarioId: string,
  servicios: ServicioSeleccionado[] = [],
): Promise<Cobro> {
  let sucursalId: string
  let lineasFijas: LineaCobro[]

  if (atencion.tipo === 'cita') {
    const { data: cita } = await supabase.from('citas').select('*').eq('id', atencion.id).single()
    if (!cita) throw new Error('Cita no encontrada')
    const { data: existente } = await supabase.from('cobros').select('id').eq('cita_id', cita.id).maybeSingle()
    if (existente) throw new Error('Esta cita ya fue cobrada')
    sucursalId = cita.sucursal_id
    lineasFijas = await lineasDeProductos(cita as any)
  } else {
    const { data: internacion } = await supabase.from('internaciones').select('*').eq('id', atencion.id).single()
    if (!internacion) throw new Error('Internación no encontrada')
    if (internacion.estado !== 'alta') {
      throw new Error('Da de alta al paciente antes de cobrar la internación')
    }
    const { data: existente } = await supabase.from('cobros').select('id').eq('internacion_id', internacion.id).maybeSingle()
    if (existente) throw new Error('Esta internación ya fue cobrada')
    sucursalId = internacion.sucursal_id
    lineasFijas = await lineasDeInternacion(internacion as any)
  }

  const turno = await getTurnoAbierto(sucursalId)
  if (!turno) throw new Error('Abre la caja antes de registrar cobros')

  const lineasServ = await lineasDeServicios(servicios)
  const lineas = [...lineasServ, ...lineasFijas]
  const monto = totalDe(lineas)
  if (monto <= 0) throw new Error('Agrega al menos un servicio o producto para cobrar')

  const { data: cobro, error } = await supabase
    .from('cobros')
    .insert({
      sucursal_id: sucursalId,
      turno_id: turno.id,
      cita_id: atencion.tipo === 'cita' ? atencion.id : null,
      internacion_id: atencion.tipo === 'internacion' ? atencion.id : null,
      usuario_id: usuarioId,
      monto_bs: monto,
      metodo_pago: metodoPago,
    })
    .select()
    .single()

  if (error || !cobro) throw new Error(`Error al cobrar: ${error?.message || 'desconocido'}`)

  const persistidas = lineas.map((l) => ({
    cobro_id: cobro.id,
    concepto: l.concepto,
    cantidad: l.cantidad,
    precio_unitario_bs: l.precio_unitario_bs,
    subtotal_bs: l.subtotal_bs,
    servicio_id: l.servicio_id ?? null,
    producto_id: l.producto_id ?? null,
  }))

  const { error: errLineas } = await supabase.from('cobro_lineas').insert(persistidas as any)
  if (errLineas) throw new Error(`Error al guardar líneas: ${errLineas.message}`)

  return cobro as Cobro
}

export interface ItemVentaDirecta {
  productoId: string
  cantidad: number
}

export interface DatosVentaDirecta {
  sucursalId: string
  usuarioId: string
  clienteNombre?: string
  items: ItemVentaDirecta[]
  metodoPago: MetodoPago
}

export async function registrarVentaDirecta(datos: DatosVentaDirecta): Promise<Cobro> {
  const turno = await getTurnoAbierto(datos.sucursalId)
  if (!turno) throw new Error('Abre la caja antes de registrar ventas de medicamentos')
  if (datos.items.length === 0) throw new Error('Selecciona al menos un medicamento o producto')

  const lineas: LineaCobro[] = []

  for (const item of datos.items) {
    const { data: p } = await supabase.from('productos').select('*').eq('id', item.productoId).single()
    if (!p) throw new Error('Producto no encontrado')
    if (item.cantidad <= 0) throw new Error(`Cantidad inválida para ${p.nombre}`)
    if (item.cantidad > p.stock_actual) {
      throw new Error(`Stock insuficiente para ${p.nombre} (disponible: ${p.stock_actual})`)
    }
    const precio = Number.isFinite(p.precio_bs) ? p.precio_bs : 0
    lineas.push({
      concepto: p.nombre,
      cantidad: item.cantidad,
      precio_unitario_bs: precio,
      subtotal_bs: Number((precio * item.cantidad).toFixed(2)),
      producto_id: p.id,
    })
  }

  const monto = totalDe(lineas)
  if (monto <= 0) throw new Error('El importe de la venta debe ser mayor a 0')

  const clienteEtiqueta = datos.clienteNombre?.trim() || 'Venta directa'

  const { data: cobro, error } = await supabase
    .from('cobros')
    .insert({
      sucursal_id: datos.sucursalId,
      turno_id: turno.id,
      cliente_nombre: clienteEtiqueta,
      usuario_id: datos.usuarioId,
      monto_bs: monto,
      metodo_pago: datos.metodoPago,
    })
    .select()
    .single()

  if (error || !cobro) throw new Error(`Error al cobrar: ${error?.message || 'desconocido'}`)

  const persistidas = lineas.map((l) => ({
    cobro_id: cobro.id,
    concepto: l.concepto,
    cantidad: l.cantidad,
    precio_unitario_bs: l.precio_unitario_bs,
    subtotal_bs: l.subtotal_bs,
    producto_id: l.producto_id ?? null,
  }))

  const { error: errLineas } = await supabase.from('cobro_lineas').insert(persistidas as any)
  if (errLineas) throw new Error(`Error al guardar líneas: ${errLineas.message}`)

  // El stock se descuenta AL FINAL, no antes del cobro.
  //
  // Al revés, si el insert del cobro fallaba (turno cerrado desde otra pestaña,
  // RLS, red) la mercadería ya había salido del inventario sin ninguna venta
  // que la respaldase: desaparecía sin rastro. Con este orden, el caso malo
  // deja un cobro registrado y visible, que es recuperable a mano.
  //
  // El stock de todos los ítems se validó arriba, así que aquí solo puede
  // fallar por una venta simultánea del mismo producto; la barrera dura sigue
  // siendo `check (stock_actual >= 0)`. No es atomicidad real: para eso haría
  // falta una función `security definer` que hiciera cobro y egresos en una
  // sola transacción.
  for (const item of datos.items) {
    await registrarMovimiento(item.productoId, 'egreso', item.cantidad, `Venta en caja (${clienteEtiqueta})`, {
      usuarioId: datos.usuarioId,
    })
  }

  return cobro as Cobro
}

export async function detalleDeCobro(cobro: Cobro): Promise<CobroConDetalle> {
  let pacienteId: string | undefined
  let veterinarioId: string | undefined
  let concepto = 'Venta de medicamentos / productos'
  let fecha_atencion = cobro.created_at

  if (cobro.cita_id) {
    const { data: cita } = await supabase.from('citas').select('*').eq('id', cobro.cita_id).single()
    if (cita) {
      pacienteId = cita.paciente_id
      veterinarioId = cita.veterinario_id
      concepto = await conceptoDeCita(cita as any)
      fecha_atencion = cita.fecha_hora
    }
  } else if (cobro.internacion_id) {
    const { data: int } = await supabase.from('internaciones').select('*').eq('id', cobro.internacion_id).single()
    if (int) {
      pacienteId = int.paciente_id
      veterinarioId = int.veterinario_id
      concepto = conceptoDeInternacion(int as any)
      fecha_atencion = int.fecha_alta ?? int.fecha_ingreso
    }
  }

  let pacienteNombre = cobro.cliente_nombre || 'Venta directa'
  let clienteNombre = cobro.cliente_nombre || 'Cliente mostrador'

  if (pacienteId) {
    const { data: paciente } = await supabase.from('pacientes').select('*, cliente:clientes(*)').eq('id', pacienteId).single()
    if (paciente) {
      pacienteNombre = paciente.nombre
      clienteNombre = (paciente as any).cliente?.nombre ?? clienteNombre
    }
  }

  const userFetchId = veterinarioId ?? cobro.usuario_id
  const { data: usuario } = await supabase.from('usuarios').select('*').eq('id', userFetchId).maybeSingle()
  const veterinarioNombre = usuario?.nombre ?? 'Caja'

  const { data: lineasData } = await supabase.from('cobro_lineas').select('*').eq('cobro_id', cobro.id)

  const lineas = (lineasData || []).map((l: any) => ({
    concepto: l.concepto,
    cantidad: l.cantidad,
    precio_unitario_bs: l.precio_unitario_bs,
    subtotal_bs: l.subtotal_bs,
    servicio_id: l.servicio_id,
    producto_id: l.producto_id,
  }))

  return {
    ...cobro,
    paciente_nombre: pacienteNombre,
    cliente_nombre: clienteNombre,
    veterinario_nombre: veterinarioNombre,
    concepto_atencion: concepto,
    fecha_atencion,
    lineas,
  }
}

export async function listCobrosDelTurno(turnoId: string): Promise<CobroConDetalle[]> {
  const { data: cobros } = await supabase
    .from('cobros')
    .select('*')
    .eq('turno_id', turnoId)
    .order('created_at', { ascending: false })

  if (!cobros) return []
  return Promise.all(cobros.map((c) => detalleDeCobro(c as any)))
}

export async function getCobro(cobroId: string): Promise<CobroConDetalle | null> {
  const { data: cobro } = await supabase.from('cobros').select('*').eq('id', cobroId).maybeSingle()
  if (!cobro) return null
  return detalleDeCobro(cobro as any)
}
