import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { 
  TrendingUp, Users, Boxes, Wallet, 
  ArrowUpRight, ArrowDownRight, PackageX
} from 'lucide-react'
import { AvisoError } from '../components/ui/AvisoError'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Seccion } from '../components/ui/Seccion'
import { TablaResponsive, type Columna } from '../components/ui/Tabla'
import { obtenerResumenMetricas, type MetricasResumen } from '../services/metricas'
import { formatBs } from '../lib/currency'
import { useSuscripcionTabla } from '../mocks/useDb'
import { useAuth } from '../context/useAuth'
import { ReporteRentabilidad } from '../features/petshop/ReporteRentabilidad'
import type { Producto } from '../types/database'

import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer
} from 'recharts'
import { Modal } from '../components/ui/Modal'

const COLUMNAS_BAJO_STOCK: Columna<Producto>[] = [
  {
    clave: 'nombre',
    cabecera: 'Producto',
    movil: 'titulo',
    celda: (p) => <span className="font-medium text-slate-900">{p.nombre}</span>,
  },
  {
    clave: 'stock',
    cabecera: 'Stock Actual',
    movil: 'destacado',
    alineadaDerecha: true,
    celda: (p) => (
      <Badge tone={p.stock_actual === 0 ? 'rose' : 'amber'} size="sm" className="font-bold">
        {p.stock_actual}
      </Badge>
    ),
  },
  {
    clave: 'sku',
    cabecera: 'SKU',
    celda: (p) => <span className="font-mono text-xs text-slate-500">{p.sku}</span>,
  },
  {
    clave: 'minimo',
    cabecera: 'Mínimo',
    alineadaDerecha: true,
    celda: (p) => <span className="text-slate-500">{p.stock_minimo}</span>,
  },
  {
    clave: 'accion',
    cabecera: 'Acción',
    movil: 'acciones',
    alineadaDerecha: true,
    celda: (p) => (
      <Link to={`/inventario?buscar=${p.sku}`} className="text-xs font-medium text-teal-600 hover:text-teal-700">
        Reabastecer &rarr;
      </Link>
    ),
  },
]

function MetricCard({
  titulo, 
  valor, 
  descripcion, 
  icono: Icon, 
  tendencia, 
  tono = 'teal',
  onClick
}: { 
  titulo: string 
  valor: string 
  descripcion: string
  icono: any
  tendencia?: number
  tono?: 'teal' | 'rose' | 'amber' | 'blue'
  onClick?: () => void
}) {
  const isPositive = tendencia && tendencia > 0
  const isNegative = tendencia && tendencia < 0
  
  const bgColors = {
    teal: 'bg-teal-50 text-teal-600',
    rose: 'bg-rose-50 text-rose-600',
    amber: 'bg-amber-50 text-amber-600',
    blue: 'bg-blue-50 text-blue-600'
  }

  return (
    <div onClick={onClick} className={onClick ? 'cursor-pointer h-full' : 'h-full'}>
      <Card padding="md" className="relative h-full overflow-hidden group transition-all duration-300 hover:shadow-lg hover:-translate-y-1 border border-slate-200/60">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col z-10">
            <span className="text-[11px] font-extrabold uppercase tracking-widest text-slate-400 mb-1">
              {titulo}
            </span>
            <span className="font-display text-3xl font-black text-slate-900 tracking-tight">
              {valor}
            </span>
            <div className="flex items-center gap-2 mt-2">
              {tendencia !== undefined && (
                <Badge tone={isNegative ? 'rose' : 'teal'} size="sm" className="font-bold">
                  {isPositive ? <ArrowUpRight size={14} className="mr-1" /> : isNegative ? <ArrowDownRight size={14} className="mr-1" /> : null}
                  {Math.abs(tendencia).toFixed(1)}%
                </Badge>
              )}
              <span className="text-xs font-medium text-slate-500">{descripcion}</span>
            </div>
          </div>
          
          <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl shadow-sm ${bgColors[tono]} z-10 transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3`}>
            <Icon size={24} strokeWidth={2.5} />
          </div>
          
          {/* Decoración de fondo */}
          <div className="absolute -right-6 -bottom-6 opacity-[0.03] transform rotate-12 transition-transform duration-700 group-hover:scale-125 z-0">
            <Icon size={120} />
          </div>
        </div>
      </Card>
    </div>
  )
}

function ChartModal({
  isOpen,
  onClose,
  titulo,
  data,
  dataKey,
  color,
  formateador
}: {
  isOpen: boolean
  onClose: () => void
  titulo: string
  data: any[]
  dataKey: string
  color: string
  formateador?: (valor: number) => string
}) {
  if (!isOpen) return null;

  return (
    <Modal onClose={onClose} title={`Curva Histórica: ${titulo}`}>
      <div className="h-72 w-full mt-4">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis dataKey="mes" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} dy={10} />
            <YAxis 
              axisLine={false} 
              tickLine={false} 
              tick={{ fill: '#64748b', fontSize: 12 }}
              tickFormatter={formateador ? (val) => formateador(val as number) : undefined}
            />
            <RechartsTooltip 
              contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)' }}
              formatter={(value: any) => [formateador ? formateador(Number(value)) : value, titulo]}
            />
            <Line 
              type="monotone" 
              dataKey={dataKey} 
              stroke={color} 
              strokeWidth={3}
              activeDot={{ r: 8, fill: color, stroke: '#fff', strokeWidth: 2 }}
              dot={{ r: 4, fill: '#fff', stroke: color, strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Modal>
  )
}

export function MetricasPage() {
  const { tieneModulo } = useAuth()
  const [metricas, setMetricas] = useState<MetricasResumen | null>(null)
  const [chartActivo, setChartActivo] = useState<'ingresos' | 'pacientes' | 'turnos' | 'inventario' | null>(null)
  
  // Escuchar cambios en estas tablas para actualizar métricas en vivo
  // Estas tres solo servían de dependencia del efecto —el comentario de arriba
  // lo dice—, pero `useTable` se traía las tablas completas para no leer ni una
  // fila. La revisión cumple el mismo papel sin descargar nada.
  const revisionMetricas = [
    useSuscripcionTabla('cobros'),
    useSuscripcionTabla('pacientes'),
    useSuscripcionTabla('productos'),
  ].join('-')

  const [errorCarga, setErrorCarga] = useState<string | null>(null)

  /**
   * Un negocio de retail sin expediente clínico ve OTRAS métricas.
   *
   * Todo lo de abajo está pensado para una veterinaria: «Nuevos Pacientes»,
   * «Total Pacientes», y un enlace de stock bajo que apunta a `/inventario` —
   * una ruta que un petshop ya no tiene en su plan. Para él lo que significa
   * «métricas» es ventas, costo de mercadería y margen, que es justo lo que
   * calcula el informe de rentabilidad.
   *
   * Una veterinaria con petshop integrado (plan con `historial_clinico`) sigue
   * viendo las clínicas: ahí el petshop es una sección más, no el negocio.
   */
  const esRetail = tieneModulo('petshop') && !tieneModulo('historial_clinico')

  useEffect(() => {
    if (esRetail) return
    setErrorCarga(null)
    obtenerResumenMetricas()
      .then(setMetricas)
      .catch((err) => setErrorCarga(err instanceof Error ? err.message : 'No se pudieron calcular las métricas'))
  }, [revisionMetricas, esRetail])

  if (esRetail) {
    return (
      <ReporteRentabilidad
        titulo="Métricas y Desempeño"
        subtitulo="Ventas, costo de mercadería vendida (COGS) y margen de utilidad por categoría."
      />
    )
  }

  // Un fallo dejaba la rueda girando para siempre: `metricas` seguía en null y
  // nada distinguía «calculando» de «se rompió».
  if (errorCarga) {
    return (
      <div className="py-10">
        <AvisoError mensaje={errorCarga} />
      </div>
    )
  }

  if (!metricas) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-teal-600"></div>
      </div>
    )
  }

  const m = metricas

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="font-display text-2xl font-extrabold text-slate-900 tracking-tight">Métricas y Desempeño</h1>
        <p className="mt-1 text-sm font-medium text-slate-500">
          Resumen financiero, inventario e ingresos de la clínica.
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard 
          titulo="Ingresos (Mes)"
          valor={formatBs(m.finanzas.ingresosMesActual)}
          descripcion="vs mes anterior"
          icono={Wallet}
          tendencia={m.finanzas.crecimientoIngresos}
          tono="teal"
          onClick={() => setChartActivo('ingresos')}
        />
        <MetricCard 
          titulo="Turnos Caja"
          valor={String(m.turnos.creadosMesActual)}
          descripcion="vs mes anterior"
          icono={Wallet}
          tendencia={m.turnos.crecimientoTurnos}
          tono="teal"
          onClick={() => setChartActivo('turnos')}
        />
        <MetricCard 
          titulo="Nuevos Pacientes"
          valor={String(m.pacientes.nuevosMesActual)}
          descripcion="vs mes anterior"
          icono={Users}
          tendencia={m.pacientes.crecimientoPacientes}
          tono="blue"
          onClick={() => setChartActivo('pacientes')}
        />
        <MetricCard 
          titulo="Valor Inventario"
          valor={formatBs(m.inventario.valorTotal)}
          descripcion="Stock actual"
          icono={Boxes}
          tono="amber"
          onClick={() => setChartActivo('inventario')}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Seccion titulo="Productos con Bajo Stock" tono={m.inventario.productosBajoStock.length > 0 ? 'destacado' : 'neutro'}>
            {m.inventario.productosBajoStock.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-8 text-slate-400 bg-white/50 rounded-xl border border-dashed border-slate-200">
                <Boxes size={48} className="opacity-20 mb-3" />
                <p className="text-sm font-medium">El inventario está en niveles óptimos.</p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <TablaResponsive
                  columnas={COLUMNAS_BAJO_STOCK}
                  filas={m.inventario.productosBajoStock}
                  claveDe={(p) => p.id}
                />
              </div>
            )}
          </Seccion>
        </div>
        
        <div className="lg:col-span-1 space-y-6">
          <Card padding="md" className="border border-slate-200/60 bg-gradient-to-br from-slate-900 to-slate-800 text-white relative overflow-hidden">
            <div className="relative z-10 flex flex-col items-start gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 backdrop-blur-sm">
                <TrendingUp size={20} className="text-teal-400" />
              </div>
              <div>
                <h3 className="font-display text-lg font-bold">Resumen General</h3>
                <p className="mt-1 text-sm text-slate-300">
                  Total acumulado en el sistema.
                </p>
              </div>
              <div className="w-full space-y-3 mt-2">
                <div className="flex justify-between items-end border-b border-white/10 pb-2">
                  <span className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Total Pacientes</span>
                  <span className="font-display font-bold text-xl">{m.pacientes.totalPacientes}</span>
                </div>
                <div className="flex justify-between items-end pb-2">
                  <span className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Alertas de Stock</span>
                  <span className="font-display font-bold text-xl text-amber-400">{m.inventario.productosBajoStock.length}</span>
                </div>
              </div>
            </div>
            
            <div className="absolute top-0 right-0 p-4 opacity-10 blur-[1px]">
              <PackageX size={150} />
            </div>
          </Card>
        </div>
      </div>

      <ChartModal 
        isOpen={chartActivo === 'ingresos'} 
        onClose={() => setChartActivo(null)} 
        titulo="Ingresos Brutos" 
        data={m.historial} 
        dataKey="ingresos" 
        color="#0d9488" 
        formateador={formatBs} 
      />
      <ChartModal 
        isOpen={chartActivo === 'turnos'} 
        onClose={() => setChartActivo(null)} 
        titulo="Aperturas de Turnos" 
        data={m.historial} 
        dataKey="turnos" 
        color="#0d9488" 
      />
      <ChartModal 
        isOpen={chartActivo === 'pacientes'} 
        onClose={() => setChartActivo(null)} 
        titulo="Nuevos Pacientes" 
        data={m.historial} 
        dataKey="pacientes" 
        color="#2563eb" 
      />
      <ChartModal 
        isOpen={chartActivo === 'inventario'} 
        onClose={() => setChartActivo(null)} 
        titulo="Valor Histórico del Inventario" 
        data={m.historial} 
        dataKey="inventario" 
        color="#d97706" 
        formateador={formatBs} 
      />
    </div>
  )
}
