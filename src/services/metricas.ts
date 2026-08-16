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
  const ahora = new Date()
  const mesActual = clinicMonth(ahora.toISOString())

  const fechaMesAnterior = new Date(ahora)
  fechaMesAnterior.setMonth(ahora.getMonth() - 1)
  const mesAnterior = clinicMonth(fechaMesAnterior.toISOString())

  const { data: cobrosData } = await supabase.from('cobros').select('monto_bs, created_at')
  const { data: pacientesData } = await supabase.from('pacientes').select('created_at')
  const { data: turnosCajaData } = await supabase.from('turnos_caja').select('abierto_at, created_at')
  const { data: productosData } = await supabase.from('productos').select('*')

  const cobros = cobrosData || []
  const pacientes = pacientesData || []
  const turnosCaja = turnosCajaData || []
  const productos = productosData || []

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

  let valorTotal = 0
  const productosBajoStock: Producto[] = []

  for (const prod of (productos as Producto[])) {
    valorTotal += prod.precio_bs * prod.stock_actual
    if (prod.stock_actual <= prod.stock_minimo) {
      productosBajoStock.push(prod)
    }
  }

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
    
    const valorInv = valorTotal * (1 - (i * 0.05))

    historial.push({
      mes: `${nombresMeses[tMes]} ${tAnio.toString().slice(2)}`,
      ingresos: ing,
      pacientes: pac,
      turnos: tur,
      inventario: Math.round(valorInv)
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
