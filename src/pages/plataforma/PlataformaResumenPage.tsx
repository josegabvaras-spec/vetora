import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Building2, MessageCircle, TrendingUp } from 'lucide-react'
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
  detalle?: string
  icono: React.ReactNode
  tono?: 'teal' | 'rose'
}) {
  return (
    <Card className="border border-slate-200/60">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{etiqueta}</p>
          <p className="mt-1 font-display text-2xl font-black text-slate-900">{valor}</p>
          {detalle && <p className="mt-0.5 text-xs text-slate-500">{detalle}</p>}
        </div>
        <div
          className={
            tono === 'rose'
              ? 'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600'
              : 'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-600'
          }
        >
          {icono}
        </div>
      </div>
    </Card>
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
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-xl font-bold text-slate-900">Resumen</h1>
        <p className="mt-0.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Estado del negocio en un vistazo
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Cifra
          etiqueta="Ingreso mensual"
          valor={formatBs(resumen.ingreso_mensual_bs)}
          detalle="Suma de lo acordado con las clínicas activas"
          icono={<TrendingUp size={20} />}
        />
        <Cifra
          etiqueta="Clínicas activas"
          valor={String(resumen.clinicas_activas)}
          detalle={`${resumen.clinicas_suspendidas} suspendida(s)`}
          icono={<Building2 size={20} />}
        />
        <Cifra
          etiqueta="En mora"
          valor={String(resumen.en_mora)}
          detalle={resumen.en_mora > 0 ? `${formatBs(resumen.importe_en_mora_bs)} sin cobrar` : 'Todo al día'}
          icono={<AlertTriangle size={20} />}
          tono={resumen.en_mora > 0 ? 'rose' : 'teal'}
        />
        <Cifra
          etiqueta="WhatsApp del mes"
          valor={`${resumen.whatsapp_enviados}/${resumen.whatsapp_limite}`}
          detalle="Mensajes enviados frente al total contratado"
          icono={<MessageCircle size={20} />}
        />
      </div>

      <Seccion titulo={`Cobros pendientes (${enMora.length})`} tono={enMora.length > 0 ? 'destacado' : 'neutro'}>
        {enMora.length === 0 ? (
          <p className="text-sm text-slate-400">Ninguna clínica está en mora.</p>
        ) : (
          <ul className="space-y-2">
            {enMora.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-900">{c.nombre}</p>
                  <p className="text-xs text-slate-500">
                    {c.responsable} · {c.whatsapp} · vencía el {formatClinicDate(`${c.proximo_cobro}T12:00:00Z`)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-display text-base font-black text-slate-900">
                    {formatBs(c.precio_acordado_bs)}
                  </span>
                  <Link
                    to="/plataforma/clinicas"
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Gestionar
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Seccion>

      <Seccion titulo="Consumo cerca del tope">
        {cerca.length === 0 ? (
          <p className="text-sm text-slate-400">Ninguna clínica pasa del 80 % de su cuota de WhatsApp.</p>
        ) : (
          <ul className="space-y-2">
            {cerca.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3"
              >
                <p className="truncate text-sm font-bold text-slate-900">{c.nombre}</p>
                <Badge tone="amber" size="sm">
                  {c.limites.whatsapp.usados}/{c.limites.whatsapp.maximo} mensajes · plan {c.plan_nombre}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Seccion>

      <Seccion titulo="Herramientas de Administrador" tono="destacado">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-slate-600">
            Puedes importar un respaldo de otra clínica (archivo .zip). Asegúrate de que el archivo fue generado por la herramienta de exportación.
          </p>
          <div className="flex flex-wrap items-center gap-4">
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
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-md hover:bg-slate-800"
            >
              Importar Respaldo ZIP
            </button>
          </div>
        </div>
      </Seccion>
    </div>
  )
}
