import { useMemo, useState, useEffect } from 'react'
import { clsx } from 'clsx'
import { formatInTimeZone } from 'date-fns-tz'
import { AlertTriangle, CalendarX2 } from 'lucide-react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { FieldGroup, Input, Select, Textarea } from '../../components/ui/Field'
import { useTable } from '../../mocks/useDb'
import { useAuth } from '../../context/AuthContext'
import { consultasControlables, crearCita } from '../../services/citas'
import { serviciosDeCategoria } from '../../services/servicios'
import { formatBs } from '../../lib/currency'
import { formatClinicDateTime, TIMEZONE } from '../../lib/datetime'
import { calcularDisponibilidad, contarDisponibles } from '../../lib/agenda'
import { requiereConsultaOrigen, requiereProcedimiento, TIPO_LABEL, TIPOS_CITA } from '../../lib/citas'
import type { TipoCita, Cita } from '../../types/database'

interface NuevaCitaModalProps {
  sucursalId: string
  onClose: () => void
  onCreated: () => void
  fechaInicial?: string
}

export function NuevaCitaModal({ sucursalId, onClose, onCreated, fechaInicial }: NuevaCitaModalProps) {
  const { usuario } = useAuth()
  const pacientes = useTable('pacientes')
  const clientes = useTable('clientes')
  const usuarios = useTable('usuarios')
  const citas = useTable('citas') as Cita[]
  const veterinarios = usuarios.filter((u) => u.rol === 'veterinario' && u.activo)
  // Una clínica recién dada de alta no tiene ni pacientes ni veterinarios. Sin
  // distinguir ese caso, los `<Select>` se dibujaban vacíos y el formulario
  // pedía "selecciona paciente y veterinario" sin nada que seleccionar.
  const sinPacientes = pacientes.length === 0
  const sinVeterinarios = veterinarios.length === 0
  // Con un solo veterinario en la clínica no hay a quién elegir: el campo sobra.
  // Con NINGUNO hay que decirlo, no esconderlo: `<= 1` tapaba también ese caso,
  // dejando el formulario pidiendo un veterinario sin campo donde elegirlo.
  const unSoloVeterinario = veterinarios.length === 1

  // Estos dos valores se DERIVAN, no se inicializan.
  //
  // `useTable` devuelve la tabla vacía en el primer render (la consulta ocurre
  // después del commit) y un inicializador perezoso corre una sola vez, con lo
  // cual `veterinarios[0]` era siempre `undefined`. El fallback caía entonces
  // en `usuario.id`: si abría el modal recepción, la cita quedaba asignada a la
  // propia recepcionista — y con un solo veterinario en la clínica el `<Select>`
  // ni se dibuja, así que nadie lo corregía. Encima la rejilla de horas se
  // calculaba con ese id equivocado y enseñaba todo libre.
  //
  // El estado guarda solo la elección explícita; mientras sea null manda el
  // valor derivado, que se corrige solo en cuanto llegan las tablas.
  const [pacienteElegido, setPacienteElegido] = useState<string | null>(null)
  const [veterinarioElegido, setVeterinarioElegido] = useState<string | null>(null)

  const pacienteId = pacienteElegido ?? pacientes[0]?.id ?? ''
  const veterinarioId =
    veterinarioElegido ??
    (usuario?.rol === 'veterinario' ? usuario.id : veterinarios[0]?.id ?? '')

  const setPacienteId = setPacienteElegido
  const setVeterinarioId = setVeterinarioElegido
  const [fecha, setFecha] = useState(fechaInicial ?? formatInTimeZone(new Date(), TIMEZONE, 'yyyy-MM-dd'))
  const [horaSeleccionada, setHoraSeleccionada] = useState<string | null>(null)
  const [tipoCita, setTipoCita] = useState<TipoCita>('consulta')
  const [citaOrigenId, setCitaOrigenId] = useState('')
  const [servicioId, setServicioId] = useState('')
  const [notas, setNotas] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const servicios = useTable('servicios')

  // Una reconsulta controla una consulta anterior del mismo paciente; si cambia
  // el paciente, la que estuviera elegida deja de ser válida.
  const [consultasPrevias, setConsultasPrevias] = useState<any[]>([])
  useEffect(() => {
    // Sin paciente no hay nada que controlar, y preguntarlo igual es un 400:
    // PostgREST recibe `paciente_id=eq.` (vacío) y lo rechaza por no ser un
    // uuid. Pasaba en cada apertura del modal —la tabla llega vacía en el
    // primer render— y siempre en una clínica que aún no tiene pacientes.
    if (!pacienteId) {
      setConsultasPrevias([])
      return
    }
    let montado = true
    consultasControlables(pacienteId).then((data) => {
      if (montado) setConsultasPrevias(data)
    })
    return () => { montado = false }
  }, [pacienteId, citas])
  const origenValido = consultasPrevias.some((c) => c.cita_id === citaOrigenId)

  const [cirugias, setCirugias] = useState<any[]>([])
  useEffect(() => {
    let montado = true
    serviciosDeCategoria('cirugia').then((data) => {
      if (montado) setCirugias(data)
    })
    return () => { montado = false }
  }, [servicios])

  const faltaOrigen = requiereConsultaOrigen(tipoCita) && !origenValido
  const faltaProcedimiento = requiereProcedimiento(tipoCita) && !servicioId

  // Un veterinario no puede estar en dos sucursales a la vez: el conflicto se
  // evalúa sobre todas sus citas, no solo las de la sucursal activa.
  const bloques = useMemo(
    () => calcularDisponibilidad(fecha, citas.filter((c) => c.veterinario_id === veterinarioId)),
    [fecha, veterinarioId, citas],
  )
  const { libres, total } = contarDisponibles(bloques)

  const espacioElegido = bloques.flatMap((b) => b.espacios).find((e) => e.hora === horaSeleccionada)
  // Si cambió el veterinario o la fecha, el espacio elegido puede haber dejado de estar libre.
  const espacioValido = espacioElegido && !espacioElegido.ocupado ? espacioElegido : undefined

  function nombrePaciente(pacienteIdBuscado: string): string {
    return pacientes.find((p) => p.id === pacienteIdBuscado)?.nombre ?? 'otro paciente'
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!pacienteId || !veterinarioId) {
      // Decir "selecciona" cuando no hay nada que seleccionar manda a la persona
      // a buscar un campo que no existe: el aviso tiene que nombrar lo que falta.
      setError(
        sinPacientes
          ? 'Registra un paciente antes de agendar una cita'
          : sinVeterinarios
            ? 'Da de alta a un veterinario antes de agendar una cita'
            : 'Selecciona paciente y veterinario',
      )
      return
    }
    if (!espacioValido) {
      setError('Selecciona un espacio disponible')
      return
    }
    if (faltaOrigen) {
      setError('Indica de qué consulta es la reconsulta')
      return
    }
    if (faltaProcedimiento) {
      setError('Indica qué cirugía se va a realizar')
      return
    }
    setEnviando(true)
    try {
      await crearCita({
        pacienteId,
        veterinarioId,
        sucursalId,
        fechaHoraIso: espacioValido.inicioIso,
        tipoCita,
        citaOrigenId: requiereConsultaOrigen(tipoCita) ? citaOrigenId : null,
        servicioId: servicioId || null,
        notas: notas.trim() || undefined,
      })
      onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la cita')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Modal title="+ Nueva Cita" onClose={onClose}>
      <form className="space-y-4" onSubmit={handleSubmit}>
        <FieldGroup label="Paciente">
          {sinPacientes ? (
            <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <AlertTriangle size={18} className="mt-0.5 shrink-0" />
              Todavía no hay pacientes registrados. Da de alta al cliente y a su mascota desde Pacientes antes de
              agendar una cita.
            </p>
          ) : (
            <Select value={pacienteId} onChange={(e) => setPacienteId(e.target.value)}>
              {pacientes.map((p) => {
                const cliente = clientes.find((c) => c.id === p.cliente_id)
                return (
                  <option key={p.id} value={p.id}>
                    {p.nombre} ({cliente?.nombre})
                  </option>
                )
              })}
            </Select>
          )}
        </FieldGroup>

        {/* En celular la fecha y el veterinario van uno debajo del otro: dos
            columnas dejan el campo de fecha en ~150 px y el selector nativo no cabe. */}
        <div className={clsx(!unSoloVeterinario && !sinVeterinarios && 'grid gap-4 sm:grid-cols-2')}>
          <FieldGroup label="Fecha">
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required />
          </FieldGroup>
          {sinVeterinarios && (
            <FieldGroup label="Veterinario">
              <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                No hay ningún veterinario activo en la clínica. El administrador debe darlo de alta antes de que se
                pueda agendar.
              </p>
            </FieldGroup>
          )}
          {!unSoloVeterinario && !sinVeterinarios && (
            <FieldGroup label="Veterinario">
              <Select value={veterinarioId} onChange={(e) => setVeterinarioId(e.target.value)}>
                {veterinarios.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.nombre}
                  </option>
                ))}
              </Select>
            </FieldGroup>
          )}
        </div>

        {/* Espacios disponibles del veterinario para la fecha elegida */}
        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Espacios disponibles</span>
            <span className={clsx('text-xs font-medium', libres === 0 ? 'text-rose-600' : 'text-slate-500')}>
              {libres} de {total} libres
            </span>
          </div>

          {libres === 0 ? (
            <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <CalendarX2 size={18} className="mt-0.5 shrink-0" />
              La agenda de este veterinario está completa para el día seleccionado. Elige otra fecha u otro veterinario.
            </p>
          ) : (
            <div className="space-y-3 rounded-lg border border-slate-200 p-3">
              {bloques.map((bloque) => (
                <div key={bloque.nombre}>
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    {bloque.nombre}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {bloque.espacios.map((espacio) => {
                      const seleccionado = espacio.hora === horaSeleccionada && !espacio.ocupado
                      return (
                        <button
                          key={espacio.hora}
                          type="button"
                          disabled={espacio.ocupado}
                          onClick={() => setHoraSeleccionada(espacio.hora)}
                          title={
                            espacio.ocupado && espacio.citaOcupante
                              ? `Ocupado: ${nombrePaciente(espacio.citaOcupante.paciente_id)}`
                              : undefined
                          }
                          className={clsx(
                            'rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                            espacio.ocupado
                              ? 'cursor-not-allowed border border-rose-100 bg-rose-50 text-rose-400 line-through'
                              : seleccionado
                                ? 'bg-teal-600 text-white'
                                : 'border border-slate-200 bg-white text-slate-700 hover:border-teal-300 hover:bg-teal-50',
                          )}
                        >
                          {espacio.hora}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {horaSeleccionada && !espacioValido && libres > 0 && (
            <p className="mt-2 text-xs text-amber-700">
              El espacio de las {horaSeleccionada} ya no está disponible. Elige otro.
            </p>
          )}
        </div>

        <FieldGroup label="Tipo de cita">
          <Select
            value={tipoCita}
            onChange={(e) => {
              const nuevo = e.target.value as TipoCita
              setTipoCita(nuevo)
              // El procedimiento solo aplica a cirugías: al cambiar de tipo se
              // limpia para no agendar una vacuna con una cirugía adjunta.
              if (!requiereProcedimiento(nuevo)) setServicioId('')
            }}
          >
            {TIPOS_CITA.map((t) => (
              <option key={t} value={t}>
                {TIPO_LABEL[t]}
              </option>
            ))}
          </Select>
        </FieldGroup>

        {requiereConsultaOrigen(tipoCita) &&
          (consultasPrevias.length === 0 ? (
            <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <CalendarX2 size={18} className="mt-0.5 shrink-0" />
              Este paciente no tiene consultas atendidas para controlar. Agenda una consulta primero, o elige otro tipo
              de cita.
            </p>
          ) : (
            <FieldGroup label="¿De qué consulta es el control?">
              <Select value={citaOrigenId} onChange={(e) => setCitaOrigenId(e.target.value)}>
                <option value="">Selecciona la consulta a controlar…</option>
                {consultasPrevias.map((c) => (
                  <option key={c.cita_id} value={c.cita_id}>
                    {formatClinicDateTime(c.fecha_hora)} — {c.motivo}
                  </option>
                ))}
              </Select>
            </FieldGroup>
          ))}

        {requiereProcedimiento(tipoCita) && (
          <>
            <FieldGroup label="¿Qué cirugía?">
              <Select value={servicioId} onChange={(e) => setServicioId(e.target.value)}>
                <option value="">Selecciona el procedimiento…</option>
                {cirugias.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre} — {formatBs(s.precio_bs)}
                  </option>
                ))}
              </Select>
            </FieldGroup>
            <p className="text-xs text-slate-500">
              El procedimiento se imprime en el consentimiento y llega preseleccionado a caja. El administrador
              gestiona la lista en Servicios.
            </p>
            <Badge tone="rose">Requiere Consentimiento</Badge>
          </>
        )}

        <FieldGroup label="Notas (opcional)">
          <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Motivo, indicaciones previas…" />
        </FieldGroup>

        {error && <p className="text-sm text-rose-600">{error}</p>}

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={
              enviando || !pacienteId || !veterinarioId || !espacioValido || faltaOrigen || faltaProcedimiento
            }
          >
            {enviando ? 'Guardando…' : 'Guardar cita'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
