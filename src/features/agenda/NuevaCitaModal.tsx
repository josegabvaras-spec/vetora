import { useMemo, useState, useEffect } from 'react'
import { clsx } from 'clsx'
import { formatInTimeZone } from 'date-fns-tz'
import { AlertTriangle, CalendarX2 } from 'lucide-react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { FieldGroup, Input, Select, Textarea } from '../../components/ui/Field'
import { useSuscripcionTabla, useTable } from '../../mocks/useDb'
import { useAuth } from '../../context/AuthContext'
import { citasDelDiaDe, consultasControlables, crearCita } from '../../services/citas'
import { listPacientesParaSelector, type PacienteParaSelector } from '../../services/clientesPacientes'
import { serviciosDeCategoria } from '../../services/servicios'
import { formatBs } from '../../lib/currency'
import { formatClinicDateTime, TIMEZONE } from '../../lib/datetime'
import { calcularDisponibilidad, contarDisponibles } from '../../lib/agenda'
import { requiereConsultaOrigen, requiereProcedimiento, TIPO_LABEL, TIPOS_CITA } from '../../lib/citas'
import { peluqueroAcotado, puedeAtender, puedeHacerPeluqueria, veterinarioAcotado } from '../../lib/personal'
import type { TipoCita, Cita } from '../../types/database'

interface NuevaCitaModalProps {
  sucursalId: string
  onClose: () => void
  onCreated: () => void
  fechaInicial?: string
}

export function NuevaCitaModal({ sucursalId, onClose, onCreated, fechaInicial }: NuevaCitaModalProps) {
  const { usuario } = useAuth()
  const esPeluquero = usuario?.rol === 'peluquero'
  // Pacientes por servicio y no con `useTable`: aquel hace `select('*')` sobre
  // la tabla entera, y `pacientes.foto` es la imagen en base64 (0006). Abrir
  // este modal descargaba las fotos de TODA la clínica para pintar una lista de
  // nombres. `useSuscripcionTabla` conserva la reactividad sin traerse nada.
  const revisionPacientes = useSuscripcionTabla('pacientes')
  const [pacientes, setPacientes] = useState<PacienteParaSelector[]>([])
  useEffect(() => {
    let montado = true
    listPacientesParaSelector()
      .then((data) => { if (montado) setPacientes(data) })
      .catch((err) => {
        if (montado) setError(err instanceof Error ? err.message : 'No se pudieron cargar los pacientes')
      })
    return () => { montado = false }
  }, [revisionPacientes])
  const usuarios = useTable('usuarios')
  // Solo las citas de ESE veterinario en ESE día. Antes era `useTable('citas')`
  // —la tabla entera— filtrada en memoria, y además de pesado era incorrecto:
  // PostgREST corta en 1000 filas, así que la cita que ocupa el hueco podía no
  // venir en el lote y la rejilla enseñaba libre un horario ocupado.
  const revisionCitas = useSuscripcionTabla('citas')
  const [citas, setCitas] = useState<Cita[]>([])

  // Se declara ANTES de `profesionales`: quién puede figurar como responsable
  // depende de qué tipo de cita está elegido (peluquería admite peluqueros,
  // el resto no).
  const [tipoCita, setTipoCita] = useState<TipoCita>(esPeluquero ? 'peluqueria' : 'consulta')

  const profesionales = tipoCita === 'peluqueria' ? usuarios.filter(puedeHacerPeluqueria) : usuarios.filter(puedeAtender)
  // Una clínica recién dada de alta no tiene ni pacientes ni profesionales. Sin
  // distinguir ese caso, los <Select> se dibujaban vacíos y el formulario
  // pedía "selecciona paciente y veterinario" sin nada que seleccionar.
  const sinPacientes = pacientes.length === 0
  const sinProfesionales = profesionales.length === 0
  // Con un solo profesional no hay a quién elegir, pero su nombre SÍ se enseña:
  // en el Plan Consultorio atiende el propio admin y quien agenda suele ser
  // recepción, que necesita ver a nombre de quién queda la cita. Ocultar el
  // campo entero dejaba la agenda sin decir nunca quién atiende.
  // Con NINGUNO hay que decirlo, no esconderlo: `<= 1` tapaba también ese caso,
  // dejando el formulario pidiendo un profesional sin campo donde elegirlo.
  const unSoloProfesional = profesionales.length === 1

  // Estos dos valores se DERIVAN, no se inicializan.
  //
  // `useTable` devuelve la tabla vacía en el primer render (la consulta ocurre
  // después del commit) y un inicializador perezoso corre una sola vez, con lo
  // cual `profesionales[0]` era siempre `undefined`. El fallback caía entonces
  // en `usuario.id`: si abría el modal recepción, la cita quedaba asignada a la
  // propia recepcionista — y con un solo profesional en la clínica el `<Select>`
  // ni se dibuja, así que nadie lo corregía. Encima la rejilla de horas se
  // calculaba con ese id equivocado y enseñaba todo libre.
  //
  // El estado guarda solo la elección explícita; mientras sea null manda el
  // valor derivado, que se corrige solo en cuanto llegan las tablas.
  const [pacienteElegido, setPacienteElegido] = useState<string | null>(null)
  const [veterinarioElegido, setVeterinarioElegido] = useState<string | null>(null)

  // Un veterinario o un peluquero agenda a su propio nombre y nada más. Su
  // agenda solo enseña lo suyo, así que una cita asignada a un colega
  // desaparecería en el mismo instante de crearla — que es exactamente como se
  // ve un guardado que falló. Recepción y admin siguen eligiendo a quien quieran.
  const fijadoASiMismo = veterinarioAcotado(usuario) ?? peluqueroAcotado(usuario)

  const pacienteId = pacienteElegido ?? pacientes[0]?.id ?? ''
  const veterinarioId =
    fijadoASiMismo ??
    veterinarioElegido ??
    (usuario && profesionales.some((p) => p.id === usuario.id) ? usuario.id : profesionales[0]?.id ?? '')

  const setPacienteId = setPacienteElegido
  const setVeterinarioId = setVeterinarioElegido
  const [fecha, setFecha] = useState(fechaInicial ?? formatInTimeZone(new Date(), TIMEZONE, 'yyyy-MM-dd'))
  const [horaSeleccionada, setHoraSeleccionada] = useState<string | null>(null)
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
    consultasControlables(pacienteId)
      .then((data) => {
        if (montado) setConsultasPrevias(data)
      })
      // Sin esto, un fallo de la consulta dejaba la lista vacía y el formulario
      // decía «este paciente no tiene consultas para controlar» — una respuesta
      // clínica falsa a un problema técnico.
      .catch((err) => {
        if (montado) setError(err instanceof Error ? err.message : 'No se pudieron cargar las consultas previas')
      })
    return () => { montado = false }
  }, [pacienteId, revisionCitas])
  useEffect(() => {
    let montado = true
    citasDelDiaDe(veterinarioId, fecha)
      .then((data) => { if (montado) setCitas(data) })
      .catch((err) => {
        if (montado) setError(err instanceof Error ? err.message : 'No se pudo comprobar la disponibilidad')
      })
    return () => { montado = false }
  }, [veterinarioId, fecha, revisionCitas])

  const origenValido = consultasPrevias.some((c) => c.cita_id === citaOrigenId)

  const [cirugias, setCirugias] = useState<any[]>([])
  useEffect(() => {
    let montado = true
    serviciosDeCategoria('cirugia')
      .then((data) => {
        if (montado) setCirugias(data)
      })
      .catch((err) => {
        if (montado) setError(err instanceof Error ? err.message : 'No se pudo cargar el catálogo de cirugías')
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
          : sinProfesionales
            ? tipoCita === 'peluqueria'
              ? 'Da de alta a un peluquero antes de agendar una cita de peluquería'
              : 'Da de alta a un veterinario antes de agendar una cita'
            : 'Selecciona paciente y profesional responsable',
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
                return (
                  <option key={p.id} value={p.id}>
                    {p.nombre} ({p.cliente_nombre})
                  </option>
                )
              })}
            </Select>
          )}
        </FieldGroup>

        {/* En celular la fecha y el profesional van uno debajo del otro: dos
            columnas dejan el campo de fecha en ~150 px y el selector nativo no cabe. */}
        <div className={clsx(!sinProfesionales && 'grid gap-4 sm:grid-cols-2')}>
          <FieldGroup label="Fecha">
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required />
          </FieldGroup>
          <FieldGroup label={tipoCita === 'peluqueria' ? 'Peluquero/a responsable' : 'Veterinario'}>
            {sinProfesionales ? (
              <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                {tipoCita === 'peluqueria'
                  ? 'No hay ningún peluquero activo. Da de alta a uno desde Plataforma antes de agendar.'
                  : 'No hay ningún veterinario activo en la clínica. El administrador debe darlo de alta antes de que se pueda agendar.'}
              </p>
            ) : fijadoASiMismo || unSoloProfesional ? (
              // Sin desplegable, pero visible: es a quien se le asigna la cita.
              // Dos motivos distintos para el mismo recuadro — o solo hay un
              // profesional en la clínica, o quien agenda es ese profesional y la
              // cita es suya por definición.
              <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">
                {fijadoASiMismo ? usuario?.nombre : profesionales[0]?.nombre}
              </p>
            ) : (
              <Select value={veterinarioId} onChange={(e) => setVeterinarioId(e.target.value)}>
                {profesionales.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.nombre}
                  </option>
                ))}
              </Select>
            )}
          </FieldGroup>
        </div>

        {/* Espacios disponibles del profesional para la fecha elegida */}
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
              La agenda de este profesional está completa para el día seleccionado. Elige otra fecha u otro
              profesional.
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
          {esPeluquero ? (
            // Un peluquero solo agenda peluquería: sin desplegable, para que no
            // quede la duda de si podría elegir un tipo clínico que no le toca.
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">
              {TIPO_LABEL.peluqueria}
            </p>
          ) : (
            <Select
              value={tipoCita}
              onChange={(e) => {
                const nuevo = e.target.value as TipoCita
                setTipoCita(nuevo)
                // El procedimiento solo aplica a cirugías: al cambiar de tipo se
                // limpia para no agendar una vacuna con una cirugía adjunta.
                if (!requiereProcedimiento(nuevo)) setServicioId('')
                // Quién puede ser responsable depende del tipo (peluquería admite
                // peluqueros, el resto no): una elección explícita de un tipo
                // podía dejar de calificar en el otro y quedaba huérfana.
                setVeterinarioElegido(null)
              }}
            >
              {TIPOS_CITA.map((t) => (
                <option key={t} value={t}>
                  {TIPO_LABEL[t]}
                </option>
              ))}
            </Select>
          )}
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
