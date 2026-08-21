import { supabase } from '../lib/supabase'
import { clinicMonth, sumarMeses } from '../lib/datetime'
import type { Producto } from '../types/database'

export interface MetricasResumen {
  finanzas: {
    ingresosMesActual: number
    ingresosMesAnterior: number
    crecimientoIngresos: number
  }
  pacientes: {
    nuevosMesActual: number
    nuevosMesAnterior: number
    crecimientoPacientes: number
    totalPacientes: number
  }
  turnos: {
    creadosMesActual: number
    creadosMesAnterior: number
    crecimientoTurnos: number
  }
  inventario: {
    valorTotal: number
    productosBajoStock: Producto[]
  }
  historial: {
    mes: string
    ingresos: number
    pacientes: number
    turnos: number
    inventario: number
  }[]
}

function calcularCrecimiento(actual: number, anterior: number): number {
  if (anterior === 0) return actual > 0 ? 100 : 0
  return ((actual - anterior) / anterior) * 100
}


export async function obtenerResumenMetricas(): Promise<MetricasResumen> {
  // Los meses se comparan como 'yyyy-MM' en la zona de la clínica: con
  // getMonth() se resolvían en la del navegador y el cierre de mes se
  // descuadraba en las horas nocturnas, que son las de más caja.
  const ahora = new Date()
  const mesActual = clinicMonth(ahora.toISOString())
  const mesAnterior = sumarMeses(mesActual, -1)

  // Solo se piden los seis meses que el panel dibuja.
  //
  // Antes estas cinco consultas traían el histórico completo para pintar medio
  // año, y PostgREST corta en 1000 filas: con volumen, los meses recientes
  // podían quedar fuera del lote y las cifras salían mal sin ningún error.
  //
  // El inventario es la excepción que confirma el recorte: su histórico se
  // calcula deshaciendo los movimientos *posteriores* a cada mes desde el stock
  // de hoy, y todos esos posteriores caen dentro de esta misma ventana.
  const inicioVentana = `${sumarMeses(mesActual, -5)}-01T00:00:00Z`

  const [
    { data: cobrosData },
    { data: pacientesData },
    { count: totalPacientes },
    { data: turnosCajaData },
    { data: productosData },
    { data: movData },
  ] = await Promise.all([
    supabase.from('cobros').select('monto_bs, created_at').gte('created_at', inicioVentana),
    supabase.from('pacientes').select('created_at').gte('created_at', inicioVentana),
    // El total de la cartera es un conteo en servidor, no `pacientes.length`:
    // esa lista va acotada a seis meses y contarla daría solo las altas
    // recientes. Con `head: true` no viaja ninguna fila.
    supabase.from('pacientes').select('*', { count: 'exact', head: true }),
    supabase.from('turnos_caja').select('abierto_at, created_at').gte('created_at', inicioVentana),
    // `productos` no se acota por fecha: es el catálogo vivo, y de él sale el
    // stock actual y el valor de inventario. Tiene techo por sucursal.
    supabase.from('productos').select('*').eq('activo', true),
    supabase
      .from('movimientos_inventario')
      .select('tipo, cantidad, producto_id, created_at')
      .gte('created_at', inicioVentana),
  ])

  const cobros = cobrosData || []
  const pacientes = pacientesData || []
  const turnosCaja = turnosCajaData || []
  const productos = productosData || []
  const movs = (movData || []) as {tipo: string, cantidad: number, producto_id: string, created_at: string}[]

  // --- FINANZAS ---
  let ingresosMesActual = 0
  let ingresosMesAnterior = 0

  for (const cobro of cobros) {
    const mes = clinicMonth(cobro.created_at)
    if (mes === mesActual) {
      ingresosMesActual += cobro.monto_bs
    } else if (mes === mesAnterior) {
      ingresosMesAnterior += cobro.monto_bs
    }
  }

  // --- PACIENTES ---
  let nuevosMesActual = 0
  let nuevosMesAnterior = 0

  for (const paciente of pacientes) {
    const mes = clinicMonth(paciente.created_at)
    if (mes === mesActual) {
      nuevosMesActual++
    } else if (mes === mesAnterior) {
      nuevosMesAnterior++
    }
  }

  // --- TURNOS DE CAJA ---
  let turnosCreadosMesActual = 0
  let turnosCreadosMesAnterior = 0

  for (const turno of turnosCaja) {
    const mes = clinicMonth(turno.abierto_at || turno.created_at)
    if (mes === mesActual) {
      turnosCreadosMesActual++
    } else if (mes === mesAnterior) {
      turnosCreadosMesAnterior++
    }
  }

  // --- INVENTARIO ---
  let valorTotal = 0
  const productosBajoStock: Producto[] = []

  for (const prod of (productos as Producto[])) {
    valorTotal += prod.precio_bs * prod.stock_actual
    if (prod.stock_actual <= prod.stock_minimo) {
      productosBajoStock.push(prod)
    }
  }

  // --- HISTORIAL (Últimos 6 meses) ---
  const historial = []
  const nombresMeses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  
  for (let i = 5; i >= 0; i--) {
    // El mes se compara como 'yyyy-MM' en la zona de la clínica, igual que las
    // tarjetas de arriba. Con getMonth() se resolvía en la del navegador, así
    // que un cobro del 31 a las 21:00 en Tarija caía en el mes siguiente para
    // el gráfico y en el correcto para la tarjeta: la misma pantalla se
    // contradecía a sí misma.
    const mesObjetivo = sumarMeses(mesActual, -i)
    const [tAnio, tMesNumero] = mesObjetivo.split('-').map(Number)
    const tMes = tMesNumero - 1

    let ing = 0
    let pac = 0
    let tur = 0

    for (const cobro of cobros) {
      if (clinicMonth(cobro.created_at) === mesObjetivo) ing += cobro.monto_bs
    }

    for (const paciente of pacientes) {
      if (clinicMonth(paciente.created_at) === mesObjetivo) pac++
    }

    for (const turno of turnosCaja) {
      if (clinicMonth(turno.abierto_at || turno.created_at) === mesObjetivo) tur++
    }


    // Calculamos el valor del inventario para este mes.
    // Partimos del valor actual (almacenado en valorTotal) y deshacemos los movimientos
    // que ocurrieron DESPUÉS del mes que estamos evaluando.
    let valorInvMes = valorTotal
      
    // Necesitamos el precio de cada producto para deshacer su valor
    const mapPrecios = new Map(productos.map(p => [p.id, p.precio_bs]))
    
    // El histórico se evalúa a fin de mes, así que se deshace todo lo posterior.
    // Comparar los meses ya formateados en la zona de la clínica evita volver a
    // construir un `Date` local, que es lo que descuadraba el corte.
    for (const mov of movs) {
      if (clinicMonth(mov.created_at) > mesObjetivo) {
        // Este movimiento ocurrió después del mes objetivo, hay que deshacerlo.
        const precio = mapPrecios.get(mov.producto_id) || 0
        if (mov.tipo === 'ingreso') {
          // Si ingresó después, en el mes objetivo había MENOS
          valorInvMes -= (mov.cantidad * precio)
        } else if (mov.tipo === 'egreso') {
          // Si salió después, en el mes objetivo había MÁS
          valorInvMes += (mov.cantidad * precio)
        }
      }
    }

    historial.push({
      mes: `${nombresMeses[tMes]} ${tAnio.toString().slice(2)}`,
      ingresos: ing,
      pacientes: pac,
      turnos: tur,
      inventario: Math.round(Math.max(0, valorInvMes))
    })
  }

  return {
    finanzas: {
      ingresosMesActual,
      ingresosMesAnterior,
      crecimientoIngresos: calcularCrecimiento(ingresosMesActual, ingresosMesAnterior)
    },
    pacientes: {
      nuevosMesActual,
      nuevosMesAnterior,
      crecimientoPacientes: calcularCrecimiento(nuevosMesActual, nuevosMesAnterior),
      totalPacientes: totalPacientes ?? 0
    },
    turnos: {
      creadosMesActual: turnosCreadosMesActual,
      creadosMesAnterior: turnosCreadosMesAnterior,
      crecimientoTurnos: calcularCrecimiento(turnosCreadosMesActual, turnosCreadosMesAnterior)
    },
    inventario: {
      valorTotal,
      productosBajoStock
    },
    historial
  }
}
