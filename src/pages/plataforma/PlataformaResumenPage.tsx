import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Building2,
  MessageCircle,
  TrendingUp,
  Activity,
  Users,
  PawPrint,
  Server,
  Database,
  Cloud,
  CheckCircle2,
  AlertCircle
} from 'lucide-react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Seccion } from '../../components/ui/Seccion'
import { useTable } from '../../mocks/useDb'
import { listClinicas, resumenPlataforma } from '../../services/plataforma'
import { formatBs } from '../../lib/currency'
import { formatClinicDate } from '../../lib/datetime'
import type { ClinicaConDetalle, ResumenPlataforma } from '../../types/views'

function Cifra({
  etiqueta,
  valor,
  detalle,
  icono,
  tono,
}: {
  etiqueta: string
  valor: string
  detalle?: string | React.ReactNode
  icono: React.ReactNode
  tono?: 'teal' | 'rose' | 'amber' | 'emerald'
}) {
  const bgClass =
    tono === 'rose'
      ? 'bg-rose-50 text-rose-600'
      : tono === 'amber'
        ? 'bg-amber-50 text-amber-600'
        : tono === 'emerald'
          ? 'bg-emerald-50 text-emerald-600'
          : 'bg-teal-50 text-teal-600'

  return (
    <Card className="border border-slate-200/60 transition-all hover:border-slate-300 hover:shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{etiqueta}</p>
          <p className="mt-1 font-display text-2xl font-black text-slate-900">{valor}</p>
          {detalle && <div className="mt-1 text-xs text-slate-500">{detalle}</div>}
        </div>
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${bgClass}`}>
          {icono}
        </div>
      </div>
    </Card>
  )
}

function EstadoServicio({ nombre, estado, icono }: { nombre: string; estado: 'operativo' | 'degradado' | 'caido'; icono: React.ReactNode }) {
  const isOperativo = estado === 'operativo'
  const colorText = isOperativo ? 'text-emerald-700' : estado === 'degradado' ? 'text-amber-700' : 'text-rose-700'
  const colorBg = isOperativo ? 'bg-emerald-50' : estado === 'degradado' ? 'bg-amber-50' : 'bg-rose-50'
  const IconoEstado = isOperativo ? CheckCircle2 : AlertCircle
  const colorIcono = isOperativo ? 'text-emerald-500' : estado === 'degradado' ? 'text-amber-500' : 'text-rose-500'

  return (
    <div className={`flex items-center justify-between rounded-xl border border-slate-100 ${colorBg} px-4 py-3`}>
      <div className="flex items-center gap-3">
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg bg-white shadow-sm ${colorText}`}>
          {icono}
        </div>
        <div>
          <p className={`text-xs font-bold uppercase tracking-wide ${colorText}`}>{nombre}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <IconoEstado size={12} className={colorIcono} />
            <span className={`text-[11px] font-semibold ${colorText} opacity-80 capitalize`}>{estado}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export function PlataformaResumenPage() {
  const [resumen, setResumen] = useState<ResumenPlataforma | null>(null)
  const [clinicas, setClinicas] = useState<ClinicaConDetalle[]>([])
  // Cualquier cambio del panel (alta, plan, cobro) refresca estas cifras.
  const filas = useTable('clinicas')

  useEffect(() => {
    resumenPlataforma().then(setResumen)
    listClinicas().then(setClinicas)
  }, [filas])

  if (!resumen) return <p className="text-sm text-slate-500">Cargando panel…</p>

  const enMora = clinicas.filter((c) => c.estado_pago === 'en_mora')
  const cerca = clinicas.filter((c) => {
    const { usados, maximo } = c.limites.whatsapp
    return maximo > 0 && usados / maximo >= 0.8
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-black text-slate-900">Dashboard General</h1>
          <p className="mt-1 text-sm font-semibold uppercase tracking-wider text-slate-500">
            Métricas y salud de la plataforma SaaS
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700">
          <span className="flex h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)] animate-pulse"></span>
          Sistema en línea ({resumen.uptime_pct}%)
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Cifra
          etiqueta="Ingreso mensual (MRR)"
          valor={formatBs(resumen.ingreso_mensual_bs)}
          detalle={
            <span className={`font-semibold ${resumen.mrr_crecimiento_pct >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {resumen.mrr_crecimiento_pct >= 0 ? '+' : ''}{resumen.mrr_crecimiento_pct}% vs mes anterior
            </span>
          }
          icono={<TrendingUp size={20} />}
          tono="emerald"
        />
        <Cifra
          etiqueta="Clínicas activas"
          valor={String(resumen.clinicas_activas)}
          detalle={`${resumen.clinicas_suspendidas} clínica(s) suspendida(s)`}
          icono={<Building2 size={20} />}
        />
        <Cifra
          etiqueta="Usuarios totales"
          valor={String(resumen.usuarios_totales)}
          detalle="Accediendo a la plataforma"
          icono={<Users size={20} />}
        />
        <Cifra
          etiqueta="Pacientes registrados"
          valor={String(resumen.pacientes_totales)}
          detalle={`${resumen.citas_totales} citas agendadas`}
          icono={<PawPrint size={20} />}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Gráfico Financiero */}
        <div className="lg:col-span-2">
          <Card className="h-full border border-slate-200/60 p-5">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="font-display text-lg font-bold text-slate-800">Evolución MRR</h2>
                <p className="text-xs text-slate-500">Crecimiento del ingreso recurrente (últimos 6 meses)</p>
              </div>
            </div>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={resumen.historial_mrr} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorMrr" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0d9488" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#0d9488" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="mes" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} tickFormatter={(value) => `${value}`} />
                  <Tooltip
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}
                    formatter={(value: any) => [formatBs(Number(value)), 'Ingreso']}
                  />
                  <Area type="monotone" dataKey="mrr" stroke="#0d9488" strokeWidth={3} fillOpacity={1} fill="url(#colorMrr)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>

        {/* Salud del Sistema */}
        <div className="flex flex-col gap-4">
          <Card className="border border-slate-200/60 p-5">
            <h2 className="mb-4 font-display text-base font-bold text-slate-800 flex items-center gap-2">
              <Activity size={18} className="text-teal-600" /> Salud del Sistema
            </h2>
            <div className="space-y-3">
              <EstadoServicio nombre="Base de Datos" estado={resumen.servicios_estado.base_datos} icono={<Database size={16} />} />
              <EstadoServicio nombre="API WhatsApp" estado={resumen.servicios_estado.whatsapp_api} icono={<MessageCircle size={16} />} />
              <EstadoServicio nombre="Almacenamiento" estado={resumen.servicios_estado.storage} icono={<Cloud size={16} />} />
            </div>
            <div className="mt-5 border-t border-slate-100 pt-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">Errores registrados (24h)</span>
                <Badge tone={resumen.errores_plataforma > 0 ? 'amber' : 'emerald'}>{resumen.errores_plataforma}</Badge>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Seccion titulo={`Cobros pendientes (${enMora.length})`} tono={enMora.length > 0 ? 'destacado' : 'neutro'}>
          {enMora.length === 0 ? (
            <p className="text-sm text-slate-400">Excelente. Ninguna clínica está en mora.</p>
          ) : (
            <ul className="space-y-2">
              {enMora.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm hover:border-rose-200"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-900">{c.nombre}</p>
                    <p className="text-xs text-slate-500">
                      {c.responsable} · venció el {formatClinicDate(`${c.proximo_cobro}T12:00:00Z`)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-display text-base font-black text-rose-600">
                      {formatBs(c.precio_acordado_bs)}
                    </span>
                    <Link
                      to="/plataforma/clinicas"
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
                    >
                      Gestionar
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Seccion>

        <Seccion titulo="Uso de WhatsApp al límite" icono={<MessageCircle size={14} className="text-amber-500" />}>
          {cerca.length === 0 ? (
            <p className="text-sm text-slate-400">Las clínicas tienen cuota suficiente para el mes.</p>
          ) : (
            <ul className="space-y-2">
              {cerca.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-900">{c.nombre}</p>
                    <p className="text-xs text-slate-500">Plan {c.plan_nombre}</p>
                  </div>
                  <Badge tone="amber" size="sm">
                    {c.limites.whatsapp.usados}/{c.limites.whatsapp.maximo} msjs
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Seccion>
      </div>

      <Seccion titulo="Herramientas Avanzadas" tono="destacado">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <p className="text-sm text-slate-600 max-w-2xl">
            Herramienta de migración: Puedes importar un archivo `.zip` generado por otra clínica para restaurar su base de datos íntegra.
          </p>
          <div>
            <input
              type="file"
              accept=".zip"
              id="import-zip"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0]
                if (file) {
                  try {
                    const { importarRespaldo } = await import('../../lib/importacion')
                    await importarRespaldo(file)
                    alert('Importación completada con éxito. Actualiza la página para ver los cambios.')
                  } catch (err) {
                    alert('Error en la importación: ' + (err instanceof Error ? err.message : String(err)))
                  }
                }
              }}
            />
            <button
              onClick={() => document.getElementById('import-zip')?.click()}
              className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition-colors hover:bg-slate-800 focus:ring-2 focus:ring-slate-900 focus:ring-offset-2"
            >
              <Server size={16} /> Importar Respaldo ZIP
            </button>
          </div>
        </div>
      </Seccion>
    </div>
  )
}
