import { supabase } from '../lib/supabase'
import { clinicMonth } from '../lib/datetime'
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

  const fechaMesAnterior = new Date(ahora)
  fechaMesAnterior.setMonth(ahora.getMonth() - 1)
  const mesAnterior = clinicMonth(fechaMesAnterior.toISOString())

  // Traemos los datos para calcular todo
  const { data: cobrosData } = await supabase.from('cobros').select('monto_bs, created_at')
  const { data: pacientesData } = await supabase.from('pacientes').select('created_at')
  const { data: turnosCajaData } = await supabase.from('turnos_caja').select('abierto_at, created_at')
  const { data: productosData } = await supabase.from('productos').select('*')
  const { data: movData } = await supabase.from('movimientos_inventario').select('tipo, cantidad, producto_id, created_at')

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
    const targetDate = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1)
    const tMes = targetDate.getMonth()
    const tAnio = targetDate.getFullYear()
    
    let ing = 0
    let pac = 0
    let tur = 0
    
    for (const cobro of cobros) {
      const fecha = new Date(cobro.created_at)
      if (fecha.getMonth() === tMes && fecha.getFullYear() === tAnio) ing += cobro.monto_bs
    }
    
    for (const paciente of pacientes) {
      const fecha = new Date(paciente.created_at)
      if (fecha.getMonth() === tMes && fecha.getFullYear() === tAnio) pac++
    }
    
    for (const turno of turnosCaja) {
      const fecha = new Date(turno.abierto_at || turno.created_at)
      if (fecha.getMonth() === tMes && fecha.getFullYear() === tAnio) tur++
    }
    
    // Calculamos el valor del inventario para este mes.
    // Partimos del valor actual (almacenado en valorTotal) y deshacemos los movimientos
    // que ocurrieron DESPUÉS del mes que estamos evaluando.
    let valorInvMes = valorTotal
      
    // Necesitamos el precio de cada producto para deshacer su valor
    const mapPrecios = new Map(productos.map(p => [p.id, p.precio_bs]))
    
    // Mes y año del historial se evalúan a fin de mes, así que deshacemos todo lo que sea posterior a eso.
    // Target Date es el mes objetivo (tMes, tAnio). El final de ese mes es:
    const finMesObjetivo = new Date(tAnio, tMes + 1, 1).getTime()

    for (const mov of movs) {
      const fechaMov = new Date(mov.created_at).getTime()
      if (fechaMov >= finMesObjetivo) {
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
      totalPacientes: pacientes.length
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
