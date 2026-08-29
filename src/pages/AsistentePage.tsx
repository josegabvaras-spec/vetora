import { useEffect, useMemo, useState } from 'react'
import { clsx } from 'clsx'
import { BellRing, MessageCircle, Send, Sparkles } from 'lucide-react'
import { AvisoError } from '../components/ui/AvisoError'
import { Card } from '../components/ui/Card'
import { Cifra } from '../components/ui/Cifra'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Seccion } from '../components/ui/Seccion'
import { Textarea } from '../components/ui/Field'
import { TablaResponsive, type Columna } from '../components/ui/Tabla'
import { MensajeModal } from '../features/asistente/MensajeModal'
import { JornadaClinica } from '../features/asistente/JornadaClinica'
import { useAuth } from '../context/useAuth'
import { useSuscripcionTabla } from '../mocks/useDb'
import { listProgramados, resumenDelDia } from '../services/programados'
import { contactoAdministracion, redactarInforme, type Redaccion } from '../services/asistente'
import { enviarMensajeWhatsapp } from '../services/whatsapp'
import { TIPO_AVISO_LABEL, cuandoLegible } from '../lib/asistente'
import { formatBs } from '../lib/currency'
import type { Programado, ResumenDelDia, TipoAviso } from '../types/views'

const TONO_AVISO: Record<TipoAviso, 'teal' | 'rose' | 'amber' | 'slate' | 'indigo'> = {
  recordatorio_cita: 'teal',
  preparacion_cirugia: 'rose',
  refuerzo_vacuna: 'amber',
  proxima_desparasitacion: 'amber',
  seguimiento_post_consulta: 'teal',
  cumpleanos_paciente: 'indigo',
  atencion_sin_cobrar: 'rose',
  examen_listo: 'teal',
  paciente_inactivo: 'slate',
}

export function AsistentePage() {
  const { usuario, sucursalActivaId } = useAuth()
  // Suscripción: los avisos se derivan de estas tablas, así que registrar una
  // vacuna o agendar una cita tiene que hacer desaparecer su aviso al instante.
  // `useSuscripcionTabla` en vez de `useTable`: solo interesa enterarse del
  // cambio, no descargar cuatro tablas enteras que nadie lee aquí.
  //
  // Y ahora sí funciona: con `useTable` el cambio provocaba un re-render, pero
  // `recargar` vive en un efecto que solo dependía de la sucursal, así que los
  // avisos no se recalculaban. Lo que prometía el comentario de arriba no
  // ocurría; con estas revisiones en las dependencias, sí.
  const revisiones = [
    useSuscripcionTabla('citas'),
    useSuscripcionTabla('vacunas_aplicadas'),
    useSuscripcionTabla('desparasitaciones_aplicadas'),
    useSuscripcionTabla('cobros'),
  ].join('-')

  const [avisos, setAvisos] = useState<Programado[]>([])
  const [resumen, setResumen] = useState<ResumenDelDia | null>(null)
  const [filtroCategoria, setFiltroCategoria] = useState<'todos' | 'citas' | 'prevencion' | 'otros'>('todos')
  const [seleccionado, setSeleccionado] = useState<{ aviso: Programado; destino: 'cliente' | 'equipo' } | null>(null)

  const [informe, setInforme] = useState<Redaccion | null>(null)
  const [textoInforme, setTextoInforme] = useState('')
  const [redactandoInforme, setRedactandoInforme] = useState(false)
  // Sin esto, un doble clic en "Enviar informe" gastaba dos unidades de cuota.
  const [enviandoInforme, setEnviandoInforme] = useState(false)
  const [errorInforme, setErrorInforme] = useState<string | null>(null)

  // Aquí vivía "Sincronizar WhatsApp (IA)". Se retiró porque era falso de
  // principio a fin: esperaba 1,5 s para aparentar trabajo y luego marcaba como
  // 'confirmada' TODA cita pendiente con recordatorio enviado, anunciando que
  // "la IA ha leído los últimos mensajes". No existe integración de entrada de
  // WhatsApp — el PRD §2 excluye el chatbot conversacional del MVP —, así que
  // no había ningún mensaje que leer: confirmaba citas sin que nadie hubiera
  // respondido, y encima escribía en la base desde la página, saltándose la
  // capa de servicios y el principio de que la IA no escribe en la base.
  //
  // Confirmar una cita sigue siendo una acción explícita de una persona desde
  // el detalle de la cita en la agenda.

  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  async function recargar() {
    const sucursal = sucursalActivaId || undefined
    setAvisos(await listProgramados(sucursal))
    setResumen(await resumenDelDia(sucursal))
  }

  useEffect(() => {
    setErrorCarga(null)
    recargar().catch((err) =>
      setErrorCarga(err instanceof Error ? err.message : 'No se pudieron cargar los avisos'),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sucursalActivaId, revisiones])

  const avisosFiltrados = useMemo(() => {
    return avisos.filter((a) => {
      if (filtroCategoria === 'todos') return true
      if (filtroCategoria === 'citas') return a.tipo === 'recordatorio_cita' || a.tipo === 'preparacion_cirugia'
      if (filtroCategoria === 'prevencion') return a.tipo === 'refuerzo_vacuna' || a.tipo === 'proxima_desparasitacion'
      if (filtroCategoria === 'otros') return !['recordatorio_cita', 'preparacion_cirugia', 'refuerzo_vacuna', 'proxima_desparasitacion'].includes(a.tipo)
      return true
    })
  }, [avisos, filtroCategoria])

  const pendientes = useMemo(() => avisosFiltrados.filter((a) => !a.ya_avisado), [avisosFiltrados])
  const yaAvisados = useMemo(() => avisosFiltrados.filter((a) => a.ya_avisado), [avisosFiltrados])

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
    if (!usuario?.clinica_id || enviandoInforme) return
    setErrorInforme(null)
    setEnviandoInforme(true)

    // Igual que en MensajeModal: la pestaña se abre dentro del gesto del clic y
    // se le pone la dirección después, porque `enviarMensajeWhatsapp` ya
    // consumió cuota del plan cuando termina y un popup bloqueado la habría
    // gastado sin enviar nada.
    const ventana = window.open('', '_blank')
    if (ventana) ventana.opener = null

    try {
      const { whatsapp } = await contactoAdministracion()
      const enlace = await enviarMensajeWhatsapp(usuario.clinica_id, whatsapp, textoInforme)
      if (ventana) ventana.location.href = enlace
      else window.location.href = enlace
      setInforme(null)
      await recargar()
    } catch (err) {
      ventana?.close()
      setErrorInforme(err instanceof Error ? err.message : 'No se pudo enviar el informe')
    } finally {
      setEnviandoInforme(false)
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
      <AvisoError mensaje={errorCarga} />

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
          {usuario?.rol !== 'recepcion' && (
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
          )}

          {usuario?.rol !== 'recepcion' && resumen.productos_bajo_minimo.length > 0 && (
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

      {/* El administrador atiende —en el Plan Consultorio es el único que lo
          hace, y por eso `puedeAtender` ya lo cuenta como veterinario—, así que
          necesita la misma cola de trabajo. Va ANTES de los avisos: atender a
          quien está esperando pesa más que mandar un recordatorio.

          Sin acotar a nadie: ve la clínica entera, con la columna que dice de
          quién es cada fila. En el Consultorio eso es exactamente lo suyo; con
          varios veterinarios, es lo que le deja coordinar. */}
      {usuario?.rol === 'admin' && (
        <>
          <div className="pt-4">
            <h2 className="text-xl font-bold text-slate-900">Jornada</h2>
            <p className="mt-1 text-sm text-slate-500">
              Lo que hay abierto en la clínica: consultas por atender, las citas de hoy y los internados.
            </p>
          </div>
          <JornadaClinica sucursalId={sucursalActivaId || undefined} />
        </>
      )}

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-4">
        <h2 className="text-xl font-bold text-slate-900">Tareas de Seguimiento</h2>
      </div>

      <div className="border-b border-slate-200">
        <nav className="-mb-px flex space-x-6 overflow-x-auto" aria-label="Tabs">
          <button
            onClick={() => setFiltroCategoria('todos')}
            className={clsx(
              filtroCategoria === 'todos'
                ? 'border-teal-500 text-teal-600'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700',
              'whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium transition-colors'
            )}
          >
            Todos
          </button>
          <button
            onClick={() => setFiltroCategoria('citas')}
            className={clsx(
              filtroCategoria === 'citas'
                ? 'border-teal-500 text-teal-600'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700',
              'whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium transition-colors'
            )}
          >
            Citas
          </button>
          <button
            onClick={() => setFiltroCategoria('prevencion')}
            className={clsx(
              filtroCategoria === 'prevencion'
                ? 'border-teal-500 text-teal-600'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700',
              'whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium transition-colors'
            )}
          >
            Prevención
          </button>
          <button
            onClick={() => setFiltroCategoria('otros')}
            className={clsx(
              filtroCategoria === 'otros'
                ? 'border-teal-500 text-teal-600'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700',
              'whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium transition-colors'
            )}
          >
            Otros
          </button>
        </nav>
      </div>

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
