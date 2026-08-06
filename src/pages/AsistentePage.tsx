import { useEffect, useMemo, useState } from 'react'
import { BellRing, MessageCircle, Send, Sparkles } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Seccion } from '../components/ui/Seccion'
import { Textarea } from '../components/ui/Field'
import { TablaResponsive, type Columna } from '../components/ui/Tabla'
import { MensajeModal } from '../features/asistente/MensajeModal'
import { useAuth } from '../context/AuthContext'
import { useTable } from '../mocks/useDb'
import { listProgramados, resumenDelDia } from '../services/programados'
import { contactoAdministracion, redactarInforme, type Redaccion } from '../services/asistente'
import { enviarMensajeWhatsapp } from '../services/whatsapp'
import { TIPO_AVISO_LABEL, cuandoLegible } from '../lib/asistente'
import { formatBs } from '../lib/currency'
import type { Programado, ResumenDelDia, TipoAviso } from '../types/views'

const TONO_AVISO: Record<TipoAviso, 'teal' | 'rose' | 'amber'> = {
  recordatorio_cita: 'teal',
  preparacion_cirugia: 'rose',
  refuerzo_vacuna: 'amber',
  proxima_desparasitacion: 'amber',
}

/** Cifra del resumen del día. */
function Cifra({ etiqueta, valor, alerta }: { etiqueta: string; valor: string; alerta?: boolean }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{etiqueta}</p>
      <p
        className={
          alerta
            ? 'font-display text-2xl font-black text-amber-600'
            : 'font-display text-2xl font-black text-slate-900'
        }
      >
        {valor}
      </p>
    </div>
  )
}

export function AsistentePage() {
  const { sucursalActivaId } = useAuth()
  // Suscripción: los avisos se derivan de estas tablas, así que registrar una
  // vacuna o agendar una cita tiene que hacer desaparecer su aviso al instante.
  useTable('citas')
  useTable('vacunas_aplicadas')
  useTable('desparasitaciones_aplicadas')

  const [avisos, setAvisos] = useState<Programado[]>([])
  const [resumen, setResumen] = useState<ResumenDelDia | null>(null)
  const [seleccionado, setSeleccionado] = useState<{ aviso: Programado; destino: 'cliente' | 'equipo' } | null>(null)

  const [informe, setInforme] = useState<Redaccion | null>(null)
  const [textoInforme, setTextoInforme] = useState('')
  const [redactandoInforme, setRedactandoInforme] = useState(false)
  const [errorInforme, setErrorInforme] = useState<string | null>(null)

  async function recargar() {
    const sucursal = sucursalActivaId || undefined
    setAvisos(await listProgramados(sucursal))
    setResumen(await resumenDelDia(sucursal))
  }

  useEffect(() => {
    recargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sucursalActivaId])

  const pendientes = useMemo(() => avisos.filter((a) => !a.ya_avisado), [avisos])
  const yaAvisados = useMemo(() => avisos.filter((a) => a.ya_avisado), [avisos])

  async function prepararInforme() {
    if (!resumen) return
    setRedactandoInforme(true)
    setErrorInforme(null)
    try {
      const redaccion = await redactarInforme(resumen)
      setInforme(redaccion)
      setTextoInforme(redaccion.texto)
    } catch (err) {
      setErrorInforme(err instanceof Error ? err.message : 'No se pudo redactar el informe')
    } finally {
      setRedactandoInforme(false)
    }
  }

  async function enviarInforme() {
    setErrorInforme(null)
    try {
      const { whatsapp } = await contactoAdministracion()
      const enlace = await enviarMensajeWhatsapp(whatsapp, textoInforme)
      window.open(enlace, '_blank', 'noopener,noreferrer')
      setInforme(null)
      await recargar()
    } catch (err) {
      setErrorInforme(err instanceof Error ? err.message : 'No se pudo enviar el informe')
    }
  }

  const columnas: Columna<Programado>[] = [
    {
      clave: 'paciente',
      cabecera: 'Paciente',
      movil: 'titulo',
      celda: (a) => (
        <div className="min-w-0">
          <p className="truncate font-bold text-slate-900">{a.paciente_nombre}</p>
          <p className="truncate text-xs text-slate-500">{a.cliente_nombre}</p>
        </div>
      ),
    },
    {
      clave: 'tipo',
      cabecera: 'Aviso',
      movil: 'destacado',
      celda: (a) => (
        <Badge tone={TONO_AVISO[a.tipo]} size="sm">
          {TIPO_AVISO_LABEL[a.tipo]}
        </Badge>
      ),
    },
    {
      clave: 'detalle',
      cabecera: 'Detalle',
      celda: (a) => <span className="text-slate-600">{a.detalle}</span>,
    },
    {
      clave: 'cuando',
      cabecera: 'Cuándo',
      celda: (a) => (
        <span className={a.vencido ? 'font-semibold text-rose-600' : 'text-slate-600'}>
          {cuandoLegible(a)}
        </span>
      ),
    },
    {
      clave: 'accion',
      cabecera: 'Acción',
      movil: 'acciones',
      alineadaDerecha: true,
      celda: (a) => (
        <div className="flex flex-col gap-1 sm:flex-row sm:justify-end">
          <Button
            variant="secondary"
            className="px-3 py-1.5 text-xs"
            onClick={() => setSeleccionado({ aviso: a, destino: 'cliente' })}
            disabled={!a.whatsapp}
          >
            <MessageCircle size={14} />
            {a.whatsapp ? 'Avisar a cliente' : 'Sin WhatsApp'}
          </Button>
          <Button
            variant="secondary"
            className="px-3 py-1.5 text-xs border-teal-200 text-teal-700 hover:bg-teal-50 hover:text-teal-800"
            onClick={() => setSeleccionado({ aviso: a, destino: 'equipo' })}
          >
            <MessageCircle size={14} />
            Avisar a equipo
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
          Asistente
        </h1>
        <p className="mt-1 text-sm font-medium text-slate-500">
          Lo que toca avisar hoy: citas, refuerzos de vacuna y desparasitaciones. El texto se redacta
          solo; usted lo revisa y lo envía.
        </p>
      </div>

      {/* Resumen del día */}
      {resumen && (
        <Card padding="md" className="border border-slate-200/60">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <Cifra etiqueta="Citas hoy" valor={String(resumen.citas_hoy)} />
            <Cifra
              etiqueta="Sin confirmar"
              valor={String(resumen.sin_confirmar)}
              alerta={resumen.sin_confirmar > 0}
            />
            <Cifra
              etiqueta="Vencidos"
              valor={String(resumen.refuerzos_vencidos)}
              alerta={resumen.refuerzos_vencidos > 0}
            />
            <Cifra
              etiqueta="Sin consentimiento"
              valor={String(resumen.cirugias_sin_consentimiento)}
              alerta={resumen.cirugias_sin_consentimiento > 0}
            />
            <Cifra etiqueta="Cobrado hoy" valor={formatBs(resumen.ingresos_hoy_bs)} />
          </div>

          {resumen.productos_bajo_minimo.length > 0 && (
            <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Stock bajo mínimo: {resumen.productos_bajo_minimo.join(', ')}
            </p>
          )}

          <div className="mt-4 border-t border-slate-100 pt-4">
            {informe === null ? (
              <Button variant="secondary" onClick={prepararInforme} disabled={redactandoInforme}>
                <Sparkles size={16} />
                {redactandoInforme ? 'Redactando…' : 'Preparar informe para administración'}
              </Button>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Informe del día
                  </span>
                  <Badge tone={informe.origen === 'ia' ? 'teal' : 'slate'} size="sm">
                    {informe.origen === 'ia' ? 'Redactado con IA' : 'Plantilla del sistema'}
                  </Badge>
                </div>
                <Textarea
                  value={textoInforme}
                  onChange={(e) => setTextoInforme(e.target.value)}
                  rows={6}
                  aria-label="Texto del informe"
                />
                <p className="text-xs text-slate-400">
                  Se envía al WhatsApp registrado de la clínica y descuenta un mensaje del plan.
                </p>
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <Button variant="secondary" onClick={() => setInforme(null)}>
                    Descartar
                  </Button>
                  <Button onClick={enviarInforme} disabled={!textoInforme.trim()}>
                    <Send size={16} /> Enviar informe
                  </Button>
                </div>
              </div>
            )}
            {errorInforme && <p className="mt-2 text-sm text-rose-600">{errorInforme}</p>}
          </div>
        </Card>
      )}

      <Seccion titulo="Por avisar" tono={pendientes.some((a) => a.vencido) ? 'destacado' : 'neutro'}>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <TablaResponsive
            columnas={columnas}
            filas={pendientes}
            claveDe={(a) => a.id}
            vacio={
              <span className="flex flex-col items-center gap-2 text-slate-400">
                <BellRing size={32} className="opacity-20" />
                No hay avisos pendientes. Todo al día.
              </span>
            }
          />
        </div>
      </Seccion>

      {yaAvisados.length > 0 && (
        <Seccion titulo="Ya avisados">
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white opacity-70 shadow-sm">
            <TablaResponsive columnas={columnas} filas={yaAvisados} claveDe={(a) => a.id} />
          </div>
        </Seccion>
      )}

      {seleccionado && (
        <MensajeModal
          aviso={seleccionado.aviso}
          destino={seleccionado.destino}
          onClose={() => setSeleccionado(null)}
          onEnviado={async () => {
            setSeleccionado(null)
            await recargar()
          }}
        />
      )}
    </div>
  )
}
