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
import { AvisoError } from '../../components/ui/AvisoError'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Seccion } from '../../components/ui/Seccion'
import { useTable } from '../../mocks/useDb'
import { listClinicas, resumenPlataforma } from '../../services/plataforma'
import { medirSaludSistema, formatBytes, type SaludSistema } from '../../services/salud'
import { getConfiguracion, TIPO_CAMBIO_POR_DEFECTO } from '../../services/configuracion'
import { formatBs, formatUsd, usdABs } from '../../lib/currency'
import { formatClinicDate, formatClinicTime } from '../../lib/datetime'
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

function EstadoServicio({
  nombre,
  estado,
  icono,
  detalle,
  mensaje,
}: {
  nombre: string
  estado: 'operativo' | 'degradado' | 'caido'
  icono: React.ReactNode
  /** La medición concreta: latencia, espacio ocupado. Es lo que hace creíble el estado. */
  detalle?: string
  /** El motivo del fallo, si lo hubo. */
  mensaje?: string | null
}) {
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
            {detalle && <span className="text-[11px] text-slate-500">· {detalle}</span>}
          </div>
          {/* El motivo, cuando lo hay. Un «caído» a secas obliga a adivinar. */}
          {mensaje && <p className={`mt-1 text-[11px] ${colorText} opacity-90`}>{mensaje}</p>}
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

  // La salud se mide en cada carga, aparte del resumen: es lo único de esta
  // pantalla que depende del momento y no de los datos.
  const [salud, setSalud] = useState<SaludSistema | null>(null)
  const [detalleAbierto, setDetalleAbierto] = useState(false)

  const [errorCarga, setErrorCarga] = useState<string | null>(null)

  // La suscripción se fija en dólares y se cobra en bolivianos: sin el tipo de
  // cambio, el MRR no se puede expresar en la moneda en que entra el dinero.
  const [tipoCambio, setTipoCambio] = useState(TIPO_CAMBIO_POR_DEFECTO)

  useEffect(() => {
    setErrorCarga(null)
    resumenPlataforma()
      .then(setResumen)
      .catch((err) => setErrorCarga(err instanceof Error ? err.message : 'No se pudo cargar el panel'))
    listClinicas()
      .then(setClinicas)
      .catch((err) => setErrorCarga(err instanceof Error ? err.message : 'No se pudieron cargar las clínicas'))
    // Un fallo aquí no vacía el panel: `getConfiguracion` ya cae al valor por
    // defecto, y el precio que manda —el dólar— se sigue viendo igual.
    getConfiguracion()
      .then((cfg) => setTipoCambio(cfg.tipo_cambio_usd))
      .catch(() => setTipoCambio(TIPO_CAMBIO_POR_DEFECTO))
  }, [filas])

  useEffect(() => {
    // `medirSaludSistema` ya devuelve los fallos como estado ('caido'), pero si
    // reventara antes de eso la tarjeta se quedaría en «Midiendo…» para siempre.
    medirSaludSistema()
      .then(setSalud)
      .catch((err) => {
        const motivo = err instanceof Error ? err.message : String(err)
        setSalud({
          baseDatos: { estado: 'caido', latenciaMs: null, mensaje: motivo },
          almacenamiento: { estado: 'caido', bytesUsados: null, mensaje: motivo },
          errores24h: null,
          erroresMensaje: motivo,
        })
      })
  }, [])

  // Un fallo dejaba «Cargando panel…» fijo, indistinguible de una consulta lenta.
  if (errorCarga) {
    return (
      <div className="py-10">
        <AvisoError mensaje={errorCarga} />
      </div>
    )
  }

  if (!resumen) return <p className="text-sm text-slate-500">Cargando panel…</p>

  // Hay algo que explicar si un servicio no está operativo o si el contador de
  // errores no se pudo leer.
  const hayIncidencias =
    !!salud &&
    (salud.baseDatos.mensaje !== null ||
      salud.almacenamiento.mensaje !== null ||
      salud.erroresMensaje !== null)

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
        {/* Antes decía «Sistema en línea (99.98 %)», con el número escrito a
            mano. Una aplicación no puede medir su propio tiempo en línea: solo
            informa mientras está funcionando. Lo que sí se puede decir con
            verdad es cuándo se tomó la medición. */}
        {salud && (
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">
            <Server size={13} className="text-slate-400" />
            Medido {formatClinicTime(new Date().toISOString())}
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Cifra
          etiqueta="Ingreso mensual (MRR)"
          valor={formatUsd(resumen.ingreso_mensual_usd)}
          detalle={
            <>
              {/* El dólar es el precio, el boliviano es lo que entra en caja. */}
              <span className="block text-slate-400">
                ≈ {formatBs(usdABs(resumen.ingreso_mensual_usd, tipoCambio))}
              </span>
              <span className={`font-semibold ${resumen.mrr_crecimiento_pct >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {resumen.mrr_crecimiento_pct >= 0 ? '+' : ''}{resumen.mrr_crecimiento_pct}% vs mes anterior
              </span>
            </>
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
                    formatter={(value: any) => [formatUsd(Number(value)), 'Ingreso']}
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
            {/* Ya no hay fila de «API WhatsApp»: Vetora no llama a ninguna API
                de WhatsApp, compone un enlace wa.me que abre una persona. */}
            {salud === null ? (
              <p className="py-4 text-center text-sm text-slate-400">Midiendo…</p>
            ) : (
              <>
                <div className="space-y-3">
                  <EstadoServicio
                    nombre="Base de Datos"
                    estado={salud.baseDatos.estado}
                    icono={<Database size={16} />}
                    detalle={salud.baseDatos.latenciaMs !== null ? `${salud.baseDatos.latenciaMs} ms` : undefined}
                    mensaje={detalleAbierto ? salud.baseDatos.mensaje : null}
                  />
                  <EstadoServicio
                    nombre="Almacenamiento"
                    estado={salud.almacenamiento.estado}
                    icono={<Cloud size={16} />}
                    detalle={
                      salud.almacenamiento.bytesUsados !== null
                        ? `${formatBytes(salud.almacenamiento.bytesUsados)} en estudios`
                        : undefined
                    }
                    mensaje={detalleAbierto ? salud.almacenamiento.mensaje : null}
                  />
                </div>
                <div className="mt-5 border-t border-slate-100 pt-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-500">Errores registrados (24h)</span>
                    {/* `null` es «no se pudo contar», que no es lo mismo que cero. */}
                    {salud.errores24h === null ? (
                      <Badge tone="slate">Sin datos</Badge>
                    ) : (
                      <Badge tone={salud.errores24h > 0 ? 'amber' : 'emerald'}>{salud.errores24h}</Badge>
                    )}
                  </div>
                  {detalleAbierto && salud.erroresMensaje && (
                    <p className="mt-1 text-[11px] text-rose-700">{salud.erroresMensaje}</p>
                  )}
                </div>

                {/* El motivo del fallo no se enseña de entrada: en un panel que
                    casi siempre está en verde, tres mensajes técnicos serían
                    ruido permanente. Se piden cuando hacen falta. */}
                {hayIncidencias && (
                  <button
                    type="button"
                    onClick={() => setDetalleAbierto((abierto) => !abierto)}
                    className="mt-4 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    {detalleAbierto ? 'Ocultar el motivo' : '¿Por qué? Ver el motivo'}
                  </button>
                )}
              </>
            )}
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
                    <span className="text-right">
                      <span className="block font-display text-base font-black text-rose-600">
                        {formatUsd(c.precio_acordado_usd)}
                      </span>
                      <span className="block text-[11px] font-medium text-slate-400">
                        ≈ {formatBs(usdABs(c.precio_acordado_usd, tipoCambio))}
                      </span>
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

      {/*
        Aquí había un «Importar Respaldo ZIP» suelto que llamaba a la función de
        la clínica. No podía funcionar: esa versión escribe con la sesión de
        quien opera, y el superadmin tiene `clinica_id` nulo — las filas o las
        rechazaba la RLS o habrían entrado sin clínica a la que pertenecer.
        Sobre todo, **no preguntaba a qué clínica restaurar**, que es el dato
        que decide dónde acaban los datos de un paciente.

        El respaldo vive ahora dentro de cada clínica, donde el destino es
        inequívoco.
      */}
      <Seccion titulo="Respaldo de datos" tono="neutro">
        <p className="max-w-2xl text-sm text-slate-600">
          Exportar e importar los datos de una clínica se hace desde su propia ficha, para que el destino de la
          restauración quede siempre explícito.
        </p>
        <Link
          to="/plataforma/clinicas"
          className="mt-3 inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
        >
          <Server size={16} /> Ir a Clínicas
        </Link>
      </Seccion>
    </div>
  )
}
