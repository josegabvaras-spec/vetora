import { useEffect, useState } from 'react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { FieldGroup, Input, Select, Textarea } from '../../components/ui/Field'
import { Badge } from '../../components/ui/Badge'
import { useAuth } from '../../context/useAuth'
import { useTable } from '../../mocks/useDb'
import { puedeHacerPeluqueria } from '../../lib/personal'
import { listPacientes } from '../../services/clientesPacientes'
import { crearOrden, getConfiguracionPeluqueria, listServiciosPeluqueria } from '../../services/peluqueria'
import { formatBs } from '../../lib/currency'
import type { PeluqueriaServicioConConfig, PacienteConDueno } from '../../types/views'
import type { SuplementoOrden } from '../../types/database'
import { Plus, Trash2 } from 'lucide-react'

interface NuevaOrdenModalProps {
  sucursalId: string
  onClose: () => void
  onCreated: (ordenId?: string) => void
  pacientePreseleccionadoId?: string
}

export function NuevaOrdenModal({
  sucursalId,
  onClose,
  onCreated,
  pacientePreseleccionadoId,
}: NuevaOrdenModalProps) {
  const { usuario } = useAuth()
  const usuarios = useTable('usuarios')
  const peluqueros = usuarios.filter(puedeHacerPeluqueria)

  const [pacientes, setPacientes] = useState<PacienteConDueno[]>([])
  const [pacienteId, setPacienteId] = useState(pacientePreseleccionadoId || '')
  const [peluqueroId, setPeluqueroId] = useState(
    usuario && peluqueros.some((p) => p.id === usuario.id) ? usuario.id : peluqueros[0]?.id || '',
  )

  const [servicios, setServicios] = useState<PeluqueriaServicioConConfig[]>([])
  const [servicioId, setServicioId] = useState('')
  const [precioBase, setPrecioBase] = useState<number>(0)
  const [suplementos, setSuplementos] = useState<SuplementoOrden[]>([])
  const [suplementosDisponibles, setSuplementosDisponibles] = useState<SuplementoOrden[]>([])

  const [nuevoSuplementoConcepto, setNuevoSuplementoConcepto] = useState('')
  const [nuevoSuplementoMonto, setNuevoSuplementoMonto] = useState('')

  const [observaciones, setObservaciones] = useState('')
  const [crearCita, setCrearCita] = useState(false)
  const [fechaCita, setFechaCita] = useState('')
  const [horaCita, setHoraCita] = useState('')

  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listPacientes(sucursalId || undefined).then((res) => {
      setPacientes(res)
      // Se preselecciona el primero SOLO si no hay ninguno elegido ya (puede
      // venir por `pacientePreseleccionadoId`, o haberlo tocado el usuario
      // mientras cargaba). Va con la forma funcional para no tener que leer
      // `pacienteId` aquí: si lo leyera, sería una dependencia del efecto y
      // este se relanzaría al preseleccionar, volviendo a pedir la lista.
      if (res.length > 0) setPacienteId((actual) => actual || res[0].id)
    })
    listServiciosPeluqueria().then((res) => {
      setServicios(res)
      if (res.length > 0) {
        setServicioId(res[0].id)
        setPrecioBase(res[0].precio_bs)
      }
    })
    getConfiguracionPeluqueria().then((cfg) => {
      setSuplementosDisponibles(cfg.suplementos_predeterminados || [])
    })
  }, [sucursalId])

  const pacienteSeleccionado = pacientes.find((p) => p.id === pacienteId)

  // Actualizar precio base al cambiar servicio
  function handleServicioChange(id: string) {
    setServicioId(id)
    const serv = servicios.find((s) => s.id === id)
    if (serv) {
      setPrecioBase(serv.precio_bs)
    }
  }

  function agregarSuplementoPredefinido(sup: SuplementoOrden) {
    if (suplementos.some((s) => s.concepto === sup.concepto)) return
    setSuplementos([...suplementos, { ...sup }])
  }

  function agregarSuplementoManual() {
    if (!nuevoSuplementoConcepto.trim()) return
    const monto = parseFloat(nuevoSuplementoMonto) || 0
    if (monto <= 0) return
    setSuplementos([...suplementos, { concepto: nuevoSuplementoConcepto.trim(), monto_bs: monto }])
    setNuevoSuplementoConcepto('')
    setNuevoSuplementoMonto('')
  }

  function quitarSuplemento(index: number) {
    setSuplementos(suplementos.filter((_, i) => i !== index))
  }

  const totalSuplementos = suplementos.reduce((acc, s) => acc + (Number(s.monto_bs) || 0), 0)
  const precioTotal = Number((precioBase + totalSuplementos).toFixed(2))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!pacienteId || !pacienteSeleccionado) {
      setError('Debes seleccionar una mascota')
      return
    }
    if (!peluqueroId) {
      setError('Debes asignar a un peluquero responsable')
      return
    }

    setGuardando(true)
    setError(null)

    try {
      let fechaHoraIso: string | undefined
      if (crearCita && fechaCita && horaCita) {
        fechaHoraIso = new Date(`${fechaCita}T${horaCita}:00`).toISOString()
      }

      const orden = await crearOrden({
        sucursalId,
        pacienteId,
        clienteId: pacienteSeleccionado.cliente_id,
        peluqueroId,
        servicioId: servicioId || null,
        precioEstimadoBs: precioBase,
        precioFinalBs: precioTotal,
        suplementos,
        observacionesRecepcion: observaciones,
        usuarioId: usuario?.id,
        crearCitaSimultanea: crearCita,
        fechaHoraCita: fechaHoraIso,
      })

      onCreated(orden.id)
      onClose()
    } catch (err: any) {
      setError(err.message || 'Error al crear orden de servicio')
      setGuardando(false)
    }
  }

  return (
    <Modal onClose={onClose} title="Nueva Orden de Peluquería" widthClassName="max-w-2xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FieldGroup label="Mascota / Paciente">
            <Select value={pacienteId} onChange={(e) => setPacienteId(e.target.value)} required>
              <option value="">Selecciona una mascota...</option>
              {pacientes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre} ({p.especie}) — Dueño: {p.cliente?.nombre}
                </option>
              ))}
            </Select>
          </FieldGroup>

          <FieldGroup label="Peluquero / Responsable">
            <Select value={peluqueroId} onChange={(e) => setPeluqueroId(e.target.value)} required>
              <option value="">Asigna un responsable...</option>
              {peluqueros.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre} ({p.rol})
                </option>
              ))}
            </Select>
          </FieldGroup>
        </div>

        {pacienteSeleccionado && (
          <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-xs text-slate-600 flex flex-wrap gap-x-6 gap-y-1">
            <div>
              <span className="font-bold text-slate-400 uppercase text-[10px]">Dueño:</span>{' '}
              <span className="font-semibold text-slate-800">{pacienteSeleccionado.cliente?.nombre}</span>
            </div>
            <div>
              <span className="font-bold text-slate-400 uppercase text-[10px]">WhatsApp:</span>{' '}
              <span className="font-semibold text-slate-800">{pacienteSeleccionado.cliente?.whatsapp || '—'}</span>
            </div>
            <div>
              <span className="font-bold text-slate-400 uppercase text-[10px]">Raza:</span>{' '}
              <span className="font-semibold text-slate-800">{pacienteSeleccionado.raza || 'Mestizo'}</span>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FieldGroup label="Servicio Principal">
            <Select value={servicioId} onChange={(e) => handleServicioChange(e.target.value)}>
              <option value="">Servicio personalizado / Sin catálogo</option>
              {servicios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre} — {formatBs(s.precio_bs)}
                </option>
              ))}
            </Select>
          </FieldGroup>

          <FieldGroup label="Precio Base (Bs.)">
            <Input
              type="number"
              step="0.5"
              min="0"
              value={precioBase}
              onChange={(e) => setPrecioBase(parseFloat(e.target.value) || 0)}
              required
            />
          </FieldGroup>
        </div>

        {/* Suplementos y adicionales */}
        <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Suplementos y Adicionales
            </h4>
            {totalSuplementos > 0 && (
              <Badge tone="teal">+{formatBs(totalSuplementos)}</Badge>
            )}
          </div>

          {/* Botones de sugerencias rápidas */}
          {suplementosDisponibles.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {suplementosDisponibles.map((sup, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => agregarSuplementoPredefinido(sup)}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-teal-400 hover:text-teal-700 transition-colors"
                >
                  <Plus size={12} />
                  <span>{sup.concepto} (+{formatBs(sup.monto_bs)})</span>
                </button>
              ))}
            </div>
          )}

          {/* Lista de suplementos aplicados */}
          {suplementos.length > 0 && (
            <div className="space-y-1.5 pt-1">
              {suplementos.map((s, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs"
                >
                  <span className="font-medium text-slate-800">{s.concepto}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-teal-700">{formatBs(s.monto_bs)}</span>
                    <button
                      type="button"
                      onClick={() => quitarSuplemento(idx)}
                      className="text-slate-400 hover:text-red-600 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Agregar suplemento manual */}
          <div className="flex items-center gap-2 pt-1">
            <Input
              placeholder="Otro suplemento o servicio extra..."
              value={nuevoSuplementoConcepto}
              onChange={(e) => setNuevoSuplementoConcepto(e.target.value)}
              className="text-xs"
            />
            <div className="w-28 shrink-0">
              <Input
                type="number"
                placeholder="Bs."
                step="1"
                min="0"
                value={nuevoSuplementoMonto}
                onChange={(e) => setNuevoSuplementoMonto(e.target.value)}
                className="text-xs"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={agregarSuplementoManual}
              disabled={!nuevoSuplementoConcepto.trim() || !nuevoSuplementoMonto}
            >
              <Plus size={14} />
            </Button>
          </div>
        </div>

        {/* Agendar cita simultánea */}
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2.5">
          <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-800">
            <input
              type="checkbox"
              checked={crearCita}
              onChange={(e) => setCrearCita(e.target.checked)}
              className="rounded text-teal-600 focus:ring-teal-500"
            />
            <span>Vincular y agendar cita en el calendario</span>
          </label>

          {crearCita && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <FieldGroup label="Fecha">
                <Input
                  type="date"
                  value={fechaCita}
                  onChange={(e) => setFechaCita(e.target.value)}
                  required={crearCita}
                />
              </FieldGroup>
              <FieldGroup label="Hora">
                <Input
                  type="time"
                  value={horaCita}
                  onChange={(e) => setHoraCita(e.target.value)}
                  required={crearCita}
                />
              </FieldGroup>
            </div>
          )}
        </div>

        <FieldGroup label="Observaciones de recepción / Pedido del dueño">
          <Textarea
            rows={2}
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            placeholder="Ej. Corte rebajado en lomo, dejar copete, cuidado con oreja derecha..."
          />
        </FieldGroup>

        {/* Resumen Total */}
        <div className="flex items-center justify-between rounded-xl border border-teal-100 bg-teal-50/60 p-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-teal-700">Precio Total Estimado</p>
            <p className="text-2xl font-black text-teal-900">{formatBs(precioTotal)}</p>
          </div>
          <div className="text-right text-xs text-slate-500">
            <p>Base: {formatBs(precioBase)}</p>
            {totalSuplementos > 0 && <p>Suplementos: +{formatBs(totalSuplementos)}</p>}
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={guardando}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={guardando}>
            {guardando ? 'Creando orden...' : 'Crear Orden de Servicio'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
