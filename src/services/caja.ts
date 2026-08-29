import { supabase } from '../lib/supabase'
import type { Cita, Cobro, Internacion, MetodoPago, TurnoCaja } from '../types/database'
import type { AtencionPorCobrar, CobroConDetalle, LineaCobro } from '../types/views'
import { TIPO_LABEL } from '../lib/citas'
import { diasDeEstadia, etiquetaDias } from '../lib/internacion'
import { dosisDisponible, formatDosis } from '../lib/inventario'
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
      movimiento_id: m.id,
    }
  })
}

/**
 * Importe que caja fijó a mano para una línea de producto.
 *
 * El cálculo del catálogo (`precio_bs × dosis`) queda como **referencia
 * interna**: el precio está expresado por unidad de medida, así que aplicar
 * 2 ml de un producto a Bs. 2/ml daría un recibo de "2 ml × Bs. 2", que no es
 * lo que la clínica cobra ni lo que el cliente debe leer. Quien cobra escribe
 * el importe final y **eso** es lo que se congela en `cobro_lineas`.
 *
 * Del navegador se acepta únicamente este número. El concepto, el producto y la
 * cantidad se siguen derivando del catálogo y de los movimientos en el
 * servidor, así que un operador puede fijar el precio —que es la
 * funcionalidad— pero no renombrar conceptos ni inventar líneas.
 */
function conImporteAjustado(linea: LineaCobro, importe: number | undefined): LineaCobro {
  if (importe === undefined) return linea
  if (!Number.isFinite(importe) || importe < 0) {
    throw new Error(`Importe inválido para ${linea.concepto}`)
  }

  const subtotal = Number(importe.toFixed(2))
  return {
    ...linea,
    subtotal_bs: subtotal,
    precio_unitario_bs: linea.cantidad > 0 ? Number((subtotal / linea.cantidad).toFixed(2)) : subtotal,
  }
}

/** Importes fijados en caja, indexados por `movimiento_id`. */
export type AjustesDePrecio = Record<string, number>

function aplicarAjustes(lineas: LineaCobro[], ajustes: AjustesDePrecio = {}): LineaCobro[] {
  return lineas.map((l) => (l.movimiento_id ? conImporteAjustado(l, ajustes[l.movimiento_id]) : l))
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

export async function lineasDePeluqueria(orden: any): Promise<LineaCobro[]> {
  const lineas: LineaCobro[] = []
  const servNombre = orden.servicio?.nombre || 'Servicio de Peluquería'
  const precioBase = Number(orden.precio_estimado_bs) || Number(orden.precio_final_bs) || 0

  lineas.push({
    concepto: `Peluquería · ${servNombre}`,
    cantidad: 1,
    precio_unitario_bs: precioBase,
    subtotal_bs: precioBase,
    servicio_id: orden.servicio_id ?? null,
  })

  if (Array.isArray(orden.suplementos)) {
    for (const sup of orden.suplementos) {
      if (sup && sup.concepto && Number(sup.monto_bs) > 0) {
        const m = Number(sup.monto_bs)
        lineas.push({
          concepto: `Suplemento: ${sup.concepto}`,
          cantidad: 1,
          precio_unitario_bs: m,
          subtotal_bs: m,
        })
      }
    }
  }

  return lineas
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
    if ((error as { code?: string } | null)?.code === 'PGRST116') {
      throw new Error('Esta caja acaba de ser cerrada desde otra sesión. Recarga para ver el arqueo.')
    }
    throw new Error(`Error al cerrar caja: ${error?.message || 'desconocido'}`)
  }
  return cerrado as TurnoCaja
}

function conceptoDeCitaConServicio(cita: Cita, servicioNombre?: string): string {
  const etiqueta = TIPO_LABEL[cita.tipo_cita as keyof typeof TIPO_LABEL]
  if (!cita.servicio_id) return etiqueta
  return servicioNombre ? `${etiqueta} - ${servicioNombre}` : etiqueta
}

async function conceptoDeCita(cita: Cita): Promise<string> {
  if (!cita.servicio_id) return conceptoDeCitaConServicio(cita)
  const { data: servicio } = await supabase
    .from('servicios')
    .select('nombre')
    .eq('id', cita.servicio_id)
    .maybeSingle()
  return conceptoDeCitaConServicio(cita, servicio?.nombre)
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

  let pelQuery = supabase
    .from('peluqueria_ordenes')
    .select('*, paciente:pacientes(*, cliente:clientes(*)), peluquero:usuarios(*), servicio:servicios(*)')
    .in('estado', ['terminada', 'lista_recoger', 'entregada'])
    .is('cobro_id', null)
  if (sucursalId) pelQuery = pelQuery.eq('sucursal_id', sucursalId)
  const { data: peluquerias } = await pelQuery

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

  for (const pel of (peluquerias || [])) {
    const lineasFijas = await lineasDePeluqueria(pel)
    atenciones.push({
      tipo: 'peluqueria',
      referencia_id: pel.id,
      paciente_nombre: pel.paciente?.nombre ?? 'Mascota',
      cliente_nombre: pel.paciente?.cliente?.nombre ?? '—',
      veterinario_nombre: pel.peluquero?.nombre ?? 'Peluquero',
      concepto: `Peluquería · Orden #${pel.numero_orden} (${pel.servicio?.nombre || 'Grooming'})`,
      fecha: pel.hora_fin ?? pel.hora_ingreso ?? pel.created_at,
      lineasFijas,
      subtotal_fijo_bs: totalDe(lineasFijas),
      servicio_sugerido_id: pel.servicio_id ?? null,
    })
  }

  return atenciones.sort((a, b) => a.fecha.localeCompare(b.fecha))
}

export type ReferenciaAtencion =
  | { tipo: 'cita'; id: string }
  | { tipo: 'internacion'; id: string }
  | { tipo: 'peluqueria'; id: string }

export async function registrarCobro(
  atencion: ReferenciaAtencion,
  metodoPago: MetodoPago,
  usuarioId: string,
  servicios: ServicioSeleccionado[] = [],
  ajustes: AjustesDePrecio = {},
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
  } else if (atencion.tipo === 'internacion') {
    const { data: internacion } = await supabase.from('internaciones').select('*').eq('id', atencion.id).single()
    if (!internacion) throw new Error('Internación no encontrada')
    if (internacion.estado !== 'alta') {
      throw new Error('Da de alta al paciente antes de cobrar la internación')
    }
    const { data: existente } = await supabase.from('cobros').select('id').eq('internacion_id', internacion.id).maybeSingle()
    if (existente) throw new Error('Esta internación ya fue cobrada')
    sucursalId = internacion.sucursal_id
    lineasFijas = await lineasDeInternacion(internacion as any)
  } else {
    const { data: orden } = await supabase
      .from('peluqueria_ordenes')
      .select('*, servicio:servicios(*)')
      .eq('id', atencion.id)
      .single()
    if (!orden) throw new Error('Orden de peluquería no encontrada')
    if (orden.cobro_id) throw new Error('Esta orden ya fue cobrada')
    sucursalId = orden.sucursal_id
    lineasFijas = await lineasDePeluqueria(orden)
  }

  const turno = await getTurnoAbierto(sucursalId)
  if (!turno) throw new Error('Abre la caja antes de registrar cobros')

  const lineasServ = await lineasDeServicios(servicios)
  const lineas = [...lineasServ, ...aplicarAjustes(lineasFijas, ajustes)]
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

  if (atencion.tipo === 'peluqueria') {
    await supabase.from('peluqueria_ordenes').update({ cobro_id: cobro.id }).eq('id', atencion.id)
  }

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
  /** Importe fijado en caja. Sin él se cobra el cálculo del catálogo. */
  monto_bs?: number
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

  const lineas: LineaCobro[] = []

  for (const item of datos.items) {
    const { data: p } = await supabase.from('productos').select('*').eq('id', item.productoId).single()
    if (!p) throw new Error('Producto no encontrado')
    if (item.cantidad <= 0) throw new Error(`Cantidad inválida para ${p.nombre}`)
    // La venta se expresa en la unidad de medida (ml, g), igual que el precio;
    // el stock, en envases desde 0013. Sin convertir, vender 5 ml de un producto
    // con 3 frascos en ficha daba "stock insuficiente".
    const disponible = dosisDisponible(p)
    if (item.cantidad > disponible) {
      throw new Error(
        `Stock insuficiente para ${p.nombre} (disponible: ${formatDosis(disponible)} ${p.unidad_medida})`,
      )
    }
    const precio = Number.isFinite(p.precio_bs) ? p.precio_bs : 0
    const calculada: LineaCobro = {
      concepto: p.nombre,
      cantidad: item.cantidad,
      precio_unitario_bs: precio,
      subtotal_bs: Number((precio * item.cantidad).toFixed(2)),
      producto_id: p.id,
    }
    // El mostrador cobra igual que la consulta: el cálculo por unidad de medida
    // es la referencia y quien vende fija el importe.
    lineas.push(conImporteAjustado(calculada, item.monto_bs))
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

/**
 * Lo mismo que `detalleDeCobro`, pero para un lote: **una consulta por tabla**
 * en vez de cuatro o cinco por cobro.
 *
 * La pantalla de Caja y la bitácora de Movimientos componían el detalle fila a
 * fila. Un informe de un mes con 300 cobros eran más de mil peticiones desde el
 * navegador, encadenadas, con el usuario mirando una pantalla en blanco. Es el
 * mismo patrón que `componerDetalleDeCitas`.
 *
 * `detalleDeCobro` se conserva para el recibo individual, donde un solo cobro
 * no justifica montar los mapas.
 */
export async function componerDetalleDeCobros(cobros: Cobro[]): Promise<CobroConDetalle[]> {
  if (cobros.length === 0) return []

  const unicos = <T,>(valores: (T | null | undefined)[]): T[] =>
    [...new Set(valores.filter((v): v is T => !!v))]

  const citaIds = unicos(cobros.map((c) => c.cita_id))
  const internacionIds = unicos(cobros.map((c) => c.internacion_id))

  const [{ data: citas }, { data: internaciones }, { data: lineas }] = await Promise.all([
    citaIds.length
      ? supabase.from('citas').select('*').in('id', citaIds)
      : Promise.resolve({ data: [] as any[] }),
    internacionIds.length
      ? supabase.from('internaciones').select('*').in('id', internacionIds)
      : Promise.resolve({ data: [] as any[] }),
    supabase.from('cobro_lineas').select('*').in('cobro_id', cobros.map((c) => c.id)),
  ])

  const mapaCitas = new Map((citas ?? []).map((c: any) => [c.id, c]))
  const mapaInternaciones = new Map((internaciones ?? []).map((i: any) => [i.id, i]))

  // Los servicios que nombran las cirugías, de una vez: `conceptoDeCita` los
  // pedía uno a uno.
  const servicioIds = unicos((citas ?? []).map((c: any) => c.servicio_id))
  const { data: servicios } = servicioIds.length
    ? await supabase.from('servicios').select('id, nombre').in('id', servicioIds)
    : { data: [] as any[] }
  const mapaServicios = new Map((servicios ?? []).map((s: any) => [s.id, s]))

  // Pacientes y usuarios salen de lo ya resuelto arriba.
  const pacienteIds = unicos([
    ...(citas ?? []).map((c: any) => c.paciente_id),
    ...(internaciones ?? []).map((i: any) => i.paciente_id),
  ])
  const usuarioIds = unicos([
    ...(citas ?? []).map((c: any) => c.veterinario_id),
    ...(internaciones ?? []).map((i: any) => i.veterinario_id),
    ...cobros.map((c) => c.usuario_id),
  ])

  const [{ data: pacientes }, { data: usuarios }] = await Promise.all([
    pacienteIds.length
      ? supabase.from('pacientes').select('id, nombre, cliente:clientes(nombre)').in('id', pacienteIds)
      : Promise.resolve({ data: [] as any[] }),
    usuarioIds.length
      ? supabase.from('usuarios').select('id, nombre').in('id', usuarioIds)
      : Promise.resolve({ data: [] as any[] }),
  ])

  const mapaPacientes = new Map((pacientes ?? []).map((p: any) => [p.id, p]))
  const mapaUsuarios = new Map((usuarios ?? []).map((u: any) => [u.id, u]))

  const lineasPorCobro = new Map<string, any[]>()
  for (const l of lineas ?? []) {
    const acumulado = lineasPorCobro.get((l as any).cobro_id) ?? []
    acumulado.push(l)
    lineasPorCobro.set((l as any).cobro_id, acumulado)
  }

  return cobros.map((cobro) => {
    let pacienteId: string | undefined
    let veterinarioId: string | undefined
    let concepto = 'Venta de medicamentos / productos'
    let fecha_atencion = cobro.created_at

    const cita = cobro.cita_id ? mapaCitas.get(cobro.cita_id) : undefined
    const internacion = cobro.internacion_id ? mapaInternaciones.get(cobro.internacion_id) : undefined

    if (cita) {
      pacienteId = cita.paciente_id
      veterinarioId = cita.veterinario_id
      concepto = conceptoDeCitaConServicio(cita, mapaServicios.get(cita.servicio_id)?.nombre)
      fecha_atencion = cita.fecha_hora
    } else if (internacion) {
      pacienteId = internacion.paciente_id
      veterinarioId = internacion.veterinario_id
      concepto = conceptoDeInternacion(internacion as any)
      fecha_atencion = internacion.fecha_alta ?? internacion.fecha_ingreso
    }

    const paciente = pacienteId ? mapaPacientes.get(pacienteId) : undefined

    return {
      ...cobro,
      paciente_nombre: paciente?.nombre ?? cobro.cliente_nombre ?? 'Venta directa',
      cliente_nombre: paciente?.cliente?.nombre ?? cobro.cliente_nombre ?? 'Cliente mostrador',
      veterinario_nombre: mapaUsuarios.get(veterinarioId ?? cobro.usuario_id)?.nombre ?? 'Caja',
      concepto_atencion: concepto,
      fecha_atencion,
      lineas: (lineasPorCobro.get(cobro.id) ?? []).map((l: any) => ({
        concepto: l.concepto,
        cantidad: l.cantidad,
        precio_unitario_bs: l.precio_unitario_bs,
        subtotal_bs: l.subtotal_bs,
        servicio_id: l.servicio_id,
        producto_id: l.producto_id,
      })),
    } as CobroConDetalle
  })
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
  return componerDetalleDeCobros(cobros as any[])
}

export async function getCobro(cobroId: string): Promise<CobroConDetalle | null> {
  const { data: cobro } = await supabase.from('cobros').select('*').eq('id', cobroId).maybeSingle()
  if (!cobro) return null
  return detalleDeCobro(cobro as any)
}
