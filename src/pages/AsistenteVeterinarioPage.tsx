import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BedDouble, CalendarDays, ClipboardCheck, ShieldAlert, Stethoscope } from 'lucide-react'
import { AvisoError } from '../components/ui/AvisoError'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Seccion } from '../components/ui/Seccion'
import { TablaResponsive, type Columna } from '../components/ui/Tabla'
import { useAuth } from '../context/AuthContext'
import { useSuscripcionTabla } from '../mocks/useDb'
import { listCitas } from '../services/citas'
import { listConsultasAbiertas, iniciarHistorialDesdeCita } from '../services/historial'
import { listInternaciones } from '../services/internacion'
import { veterinarioAcotado } from '../lib/personal'
import { ESTADO_LABEL, ESTADO_TONE, TIPO_LABEL, TIPO_TONE } from '../lib/citas'
import { etiquetaDias, faltaEvolucionDeHoy } from '../lib/internacion'
import { clinicDayIso, formatClinicDate, formatClinicTime, fromClinicTime } from '../lib/datetime'
import type { CitaConDetalle, ConsultaAbierta, InternacionConDetalle } from '../types/views'

/**
 * Asistente del veterinario: lo que le toca a ÉL hoy.
 *
 * Nace de un camino que existía pero era a ciegas: recepción abre la consulta
 * desde la cita, y hasta ahora el borrador quedaba colgado del paciente sin
 * ninguna pantalla que se los enseñara juntos. El veterinario tenía que
 * acordarse de a quién le habían abierto algo y buscarlo en `/pacientes`.
 *
 * **Todo se deriva, nada se guarda.** Igual que `listProgramados`: una fila
 * desaparece sola cuando deja de ser cierta —se cerró la consulta, se firmó el
 * consentimiento, se escribió la evolución—, sin que nadie marque nada.
 *
 * **Sin WhatsApp y sin IA, a propósito.** El asistente de recepción manda
 * avisos a los clientes y cada uno descuenta del cupo del plan; este es una cola
 * de trabajo clínico. Que el cupo se gaste por un solo lado es la razón de que
 * los botones de aviso no estén aquí.
 */
export function AsistenteVeterinarioPage() {
  const { usuario, sucursalActivaId } = useAuth()
  const navigate = useNavigate()

  const [consultas, setConsultas] = useState<ConsultaAbierta[]>([])
  const [citasHoy, setCitasHoy] = useState<CitaConDetalle[]>([])
  const [internados, setInternados] = useState<InternacionConDetalle[]>([])
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [abriendo, setAbriendo] = useState<string | null>(null)

  // Las tres secciones salen de estas tablas: cerrar una consulta, firmar un
  // consentimiento o escribir una evolución tiene que borrar su fila al
  // instante. `useSuscripcionTabla` y no `useTable`: solo interesa enterarse
  // del cambio, no descargar cinco tablas que aquí nadie lee.
  const revisiones = [
    useSuscripcionTabla('historial_clinico'),
    useSuscripcionTabla('citas'),
    useSuscripcionTabla('internaciones'),
    useSuscripcionTabla('notas_internacion'),
    useSuscripcionTabla('consentimientos_cirugia'),
  ].join('-')

  const soloMio = veterinarioAcotado(usuario)
  const sucursal = sucursalActivaId || undefined

  const recargar = useCallback(async () => {
    // El día clínico, no el del navegador: `fromClinicTime` ancla las 00:00 y
    // las 23:59 de La Paz. Con `new Date()` local, un equipo en otro huso
    // pediría el día de al lado y la agenda del día saldría vacía o de más.
    const hoy = clinicDayIso()
    const rango = {
      desde: fromClinicTime(`${hoy}T00:00:00`),
      hasta: fromClinicTime(`${hoy}T23:59:59`),
    }

    const [abiertas, citas, ingresados] = await Promise.all([
      listConsultasAbiertas(soloMio, sucursal),
      listCitas(sucursal, rango, soloMio),
      listInternaciones(sucursal, 'internado', soloMio),
    ])

    setConsultas(abiertas)
    setCitasHoy(citas)
    setInternados(ingresados)
  }, [soloMio, sucursal])

  useEffect(() => {
    setErrorCarga(null)
    recargar()
      .catch((err) => setErrorCarga(err instanceof Error ? err.message : 'No se pudo cargar el asistente'))
      .finally(() => setCargando(false))
  }, [recargar, revisiones])

  /** A la ficha del paciente con esa consulta ya desplegada. */
  function atender(pacienteId: string, historialId: string) {
    navigate(`/pacientes/${pacienteId}?historial=${historialId}`)
  }

  /**
   * Abre (o recupera) el borrador de la cita y lleva a atenderlo. Es el mismo
   * camino que «Registrar historial clínico» de la agenda: `iniciarHistorial`
   * devuelve el existente si ya lo abrió recepción, así que pulsarlo dos veces
   * no crea dos consultas.
   */
  async function abrirDesdeCita(cita: CitaConDetalle) {
    setAbriendo(cita.id)
    setErrorCarga(null)
    try {
      const historial = await iniciarHistorialDesdeCita(cita.id)
      atender(cita.paciente_id, historial.id)
    } catch (err) {
      setErrorCarga(err instanceof Error ? err.message : 'No se pudo abrir la consulta')
      setAbriendo(null)
    }
  }

  const columnasConsultas: Columna<ConsultaAbierta>[] = [
    {
      clave: 'paciente',
      cabecera: 'Paciente',
      movil: 'titulo',
      celda: (c) => (
        <div className="min-w-0">
          <p className="truncate font-bold text-slate-900">{c.paciente_nombre}</p>
          <p className="truncate text-xs text-slate-500">{c.cliente_nombre}</p>
        </div>
      ),
    },
    {
      clave: 'tipo',
      cabecera: 'Tipo',
      movil: 'destacado',
      celda: (c) => (
        <Badge tone={TIPO_TONE[c.tipo_cita]} size="sm">
          {TIPO_LABEL[c.tipo_cita]}
        </Badge>
      ),
    },
    {
      clave: 'motivo',
      cabecera: 'Motivo',
      celda: (c) => <span className="text-slate-600">{c.motivo}</span>,
    },
    {
      clave: 'cuando',
      cabecera: 'Citado',
      celda: (c) =>
        c.atrasada ? (
          <span className="font-semibold text-amber-600">
            {formatClinicDate(c.fecha_hora)} · sin cerrar
          </span>
        ) : (
          <span className="text-slate-600">{formatClinicTime(c.fecha_hora)}</span>
        ),
    },
    {
      clave: 'accion',
      cabecera: 'Acción',
      movil: 'acciones',
      alineadaDerecha: true,
      celda: (c) => (
        <Button size="sm" onClick={() => atender(c.paciente_id, c.historial_id)}>
          <Stethoscope size={14} /> Atender
        </Button>
      ),
    },
  ]

  const columnasCitas: Columna<CitaConDetalle>[] = [
    {
      clave: 'hora',
      cabecera: 'Hora',
      movil: 'destacado',
      celda: (c) => <span className="font-bold text-slate-900">{formatClinicTime(c.fecha_hora)}</span>,
    },
    {
      clave: 'paciente',
      cabecera: 'Paciente',
      movil: 'titulo',
      celda: (c) => (
        <div className="min-w-0">
          <p className="truncate font-bold text-slate-900">{c.paciente.nombre}</p>
          <p className="truncate text-xs text-slate-500">{c.paciente.cliente.nombre}</p>
        </div>
      ),
    },
    {
      clave: 'tipo',
      cabecera: 'Tipo',
      celda: (c) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={TIPO_TONE[c.tipo_cita]} size="sm">
            {TIPO_LABEL[c.tipo_cita]}
          </Badge>
          <Badge tone={ESTADO_TONE[c.estado]} size="sm">
            {ESTADO_LABEL[c.estado]}
          </Badge>
          {/* El aviso va junto a la cita, que es donde se puede hacer algo con
              él, y no en una lista aparte que habría que cruzar a mano. */}
          {c.tipo_cita === 'cirugia' && !c.consentimiento && (
            <Link
              to={`/consentimientos/${c.id}`}
              className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 hover:bg-rose-100"
            >
              <ShieldAlert size={12} /> Falta el consentimiento
            </Link>
          )}
        </div>
      ),
    },
    {
      clave: 'accion',
      cabecera: 'Acción',
      movil: 'acciones',
      alineadaDerecha: true,
      celda: (c) =>
        c.estado === 'cancelada' ? (
          <span className="text-xs text-slate-400">Cancelada</span>
        ) : (
          <Button
            size="sm"
            variant={c.historial_id ? 'secondary' : 'primary'}
            disabled={abriendo === c.id}
            onClick={() => abrirDesdeCita(c)}
          >
            <Stethoscope size={14} />
            {abriendo === c.id ? 'Abriendo…' : c.historial_id ? 'Ver consulta' : 'Abrir consulta'}
          </Button>
        ),
    },
  ]

  const columnasInternados: Columna<InternacionConDetalle>[] = [
    {
      clave: 'paciente',
      cabecera: 'Paciente',
      movil: 'titulo',
      celda: (i) => (
        <div className="min-w-0">
          <p className="truncate font-bold text-slate-900">{i.paciente.nombre}</p>
          <p className="truncate text-xs text-slate-500">{i.paciente.cliente.nombre}</p>
        </div>
      ),
    },
    {
      clave: 'estadia',
      cabecera: 'Estadía',
      movil: 'destacado',
      celda: (i) => <span className="text-slate-600">{etiquetaDias(i.dias)}</span>,
    },
    {
      clave: 'motivo',
      cabecera: 'Motivo',
      celda: (i) => <span className="text-slate-600">{i.motivo}</span>,
    },
    {
      clave: 'evolucion',
      cabecera: 'Evolución de hoy',
      celda: (i) =>
        faltaEvolucionDeHoy(i.notas) ? (
          <Badge tone="amber" size="sm">
            Pendiente
          </Badge>
        ) : (
          <Badge tone="emerald" size="sm">
            Registrada
          </Badge>
        ),
    },
    {
      clave: 'accion',
      cabecera: 'Acción',
      movil: 'acciones',
      alineadaDerecha: true,
      // `navigate` y no un `<Link>` envolviendo el botón: eso anida un
      // `<button>` dentro de un `<a>`, que es HTML inválido y deja el foco del
      // teclado en dos elementos superpuestos.
      celda: (i) => (
        <Button size="sm" variant="secondary" onClick={() => navigate(`/internacion?internacion=${i.id}`)}>
          <BedDouble size={14} /> Abrir
        </Button>
      ),
    },
  ]

  const evolucionesPendientes = internados.filter((i) => faltaEvolucionDeHoy(i.notas)).length

  return (
    <div className="space-y-6">
      <AvisoError mensaje={errorCarga} />

      <div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
          Asistente
        </h1>
        <p className="mt-1 text-sm font-medium text-slate-500">
          Tu jornada: a quién atiendes hoy y qué te queda pendiente. Las consultas que abre recepción
          aparecen aquí, sin que tengas que buscar al paciente.
        </p>
      </div>

      {/* Tres cifras, no cinco: son las que se corresponden con las tres
          secciones de abajo, así que la tarjeta es un índice, no un panel. */}
      <Card padding="md" className="border border-slate-200/60">
        <div className="grid grid-cols-3 gap-4">
          <Cifra etiqueta="Por atender" valor={String(consultas.length)} alerta={consultas.length > 0} />
          <Cifra etiqueta="Citas hoy" valor={String(citasHoy.length)} />
          <Cifra
            etiqueta="Evoluciones"
            valor={String(evolucionesPendientes)}
            alerta={evolucionesPendientes > 0}
          />
        </div>
      </Card>

      <Seccion
        titulo="Consultas por atender"
        icono={<ClipboardCheck size={14} />}
        tono={consultas.length > 0 ? 'destacado' : 'neutro'}
      >
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <TablaResponsive
            columnas={columnasConsultas}
            filas={consultas}
            claveDe={(c) => c.historial_id}
            vacio={
              <span className="flex flex-col items-center gap-2 text-slate-400">
                <ClipboardCheck size={32} className="opacity-20" />
                {cargando ? 'Cargando…' : 'No hay consultas abiertas esperándote.'}
              </span>
            }
          />
        </div>
      </Seccion>

      <Seccion titulo="Tus citas de hoy" icono={<CalendarDays size={14} />}>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <TablaResponsive
            columnas={columnasCitas}
            filas={citasHoy}
            claveDe={(c) => c.id}
            vacio={
              <span className="flex flex-col items-center gap-2 text-slate-400">
                <CalendarDays size={32} className="opacity-20" />
                {cargando ? 'Cargando…' : 'No tienes citas agendadas para hoy.'}
              </span>
            }
          />
        </div>
      </Seccion>

      <Seccion titulo="Internados a tu cargo" icono={<BedDouble size={14} />}>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <TablaResponsive
            columnas={columnasInternados}
            filas={internados}
            claveDe={(i) => i.id}
            vacio={
              <span className="flex flex-col items-center gap-2 text-slate-400">
                <BedDouble size={32} className="opacity-20" />
                {cargando ? 'Cargando…' : 'No tienes pacientes internados.'}
              </span>
            }
          />
        </div>
      </Seccion>
    </div>
  )
}

/** Cifra de cabecera, con el mismo aspecto que las del asistente de recepción. */
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
