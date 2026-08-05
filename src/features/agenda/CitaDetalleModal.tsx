import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BedDouble, CheckCircle2, FileCheck2, MessageCircle, Printer, ShieldCheck, Stethoscope } from 'lucide-react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Select } from '../../components/ui/Field'
import type { CitaConDetalle } from '../../types/views'
import { formatClinicDateTime } from '../../lib/datetime'
import { ESTADO_LABEL, ESTADO_TONE, TIPO_LABEL } from '../../lib/citas'
import { actualizarEstadoCita } from '../../services/citas'
import { avisoDeCita } from '../../services/programados'
import { generarConsentimiento } from '../../services/consentimientos'
import { iniciarHistorialDesdeCita } from '../../services/historial'
import { MensajeModal } from '../asistente/MensajeModal'
import type { EstadoCita, MetodoAceptacionConsentimiento } from '../../types/database'

export function CitaDetalleModal({ cita, onClose, onChanged }: { cita: CitaConDetalle; onClose: () => void; onChanged: () => void }) {
  const [metodo, setMetodo] = useState<MetodoAceptacionConsentimiento>('firma_digital')
  const [generando, setGenerando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [avisando, setAvisando] = useState(false)
  const [abriendoHistorial, setAbriendoHistorial] = useState(false)
  const [errorHistorial, setErrorHistorial] = useState<string | null>(null)
  const navigate = useNavigate()

  async function cambiarEstado(estado: EstadoCita) {
    await actualizarEstadoCita(cita.id, estado)
    onChanged()
  }

  /** Abre (o crea) el historial clínico ligado a esta cita y navega a la ficha. */
  async function handleAbrirHistorial() {
    setAbriendoHistorial(true)
    setErrorHistorial(null)
    try {
      const historial = await iniciarHistorialDesdeCita(cita.id)
      navigate(`/pacientes/${cita.paciente_id}?historial=${historial.id}`)
    } catch (err) {
      setErrorHistorial(err instanceof Error ? err.message : 'No se pudo abrir el historial clínico')
      setAbriendoHistorial(false)
    }
  }

  async function handleGenerarConsentimiento() {
    setGenerando(true)
    setError(null)
    try {
      await generarConsentimiento(cita.id, cita.paciente_id, metodo)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo generar el consentimiento')
    } finally {
      setGenerando(false)
    }
  }

  return (
    <Modal title="Detalle de la cita" onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <Link to={`/pacientes/${cita.paciente_id}`} className="text-base font-semibold text-teal-700 hover:underline">
              {cita.paciente.nombre}
            </Link>
            <p className="text-sm text-slate-500">Dueño: {cita.paciente.cliente.nombre}</p>
          </div>
          <Badge tone={ESTADO_TONE[cita.estado]}>{ESTADO_LABEL[cita.estado]}</Badge>
        </div>

        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs text-slate-500">Fecha y hora</dt>
            <dd className="text-slate-800">{formatClinicDateTime(cita.fecha_hora)}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Tipo</dt>
            <dd className="text-slate-800">{TIPO_LABEL[cita.tipo_cita]}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Veterinario</dt>
            <dd className="text-slate-800">{cita.veterinario_nombre}</dd>
          </div>
          {cita.servicio_nombre && (
            <div>
              <dt className="text-xs text-slate-500">Procedimiento</dt>
              <dd className="text-slate-800">{cita.servicio_nombre}</dd>
            </div>
          )}
        </dl>

        {cita.origen && (
          <p className="rounded-lg border border-teal-100 bg-teal-50/60 p-3 text-sm text-slate-700">
            <span className="font-semibold text-teal-800">Control de la consulta</span> del{' '}
            {formatClinicDateTime(cita.origen.fecha_hora)}: {cita.origen.motivo}
          </p>
        )}

        {cita.notas && <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{cita.notas}</p>}

        {cita.estado !== 'cancelada' && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            {cita.recordatorio_enviado ? (
              <p className="flex items-center gap-2 text-sm text-emerald-700">
                <CheckCircle2 size={18} className="shrink-0" />
                Recordatorio de WhatsApp enviado a {cita.paciente.cliente.whatsapp}
              </p>
            ) : (
              <div className="space-y-2">
                <p className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <MessageCircle size={16} className="text-teal-600" /> Recordatorio de WhatsApp pendiente
                </p>
                <p className="text-xs text-slate-500">
                  Se enviará al {cita.paciente.cliente.whatsapp} (dueño/a: {cita.paciente.cliente.nombre}).
                </p>
                <Button variant="secondary" onClick={() => setAvisando(true)}>
                  <MessageCircle size={16} />
                  Preparar recordatorio
                </Button>
              </div>
            )}
          </div>
        )}

        {cita.estado !== 'cancelada' && (
          <div className="rounded-lg border border-teal-100 bg-teal-50/60 p-4">
            <p className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <Stethoscope size={16} className="text-teal-600" />
              {cita.historial_id ? 'Historial clínico registrado' : 'Historial clínico sin registrar'}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {cita.historial_id
                ? 'La consulta de esta cita ya está en el expediente del paciente.'
                : 'Registra la consulta para dejarla en el expediente del paciente.'}
            </p>
            {errorHistorial && <p className="mt-2 text-sm text-rose-600">{errorHistorial}</p>}
            <Button className="mt-3 w-full" onClick={handleAbrirHistorial} disabled={abriendoHistorial}>
              <Stethoscope size={16} />
              {abriendoHistorial
                ? 'Abriendo…'
                : cita.historial_id
                  ? 'Ver historial clínico'
                  : 'Registrar historial clínico'}
            </Button>
          </div>
        )}

        {cita.estado !== 'cancelada' && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <BedDouble size={16} className="text-teal-600" />
              {cita.internacion_id ? 'Paciente internado desde esta cita' : 'Internación'}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {cita.internacion_id
                ? 'La estadía se controla desde la sala de internación.'
                : 'Si el paciente debe quedar hospitalizado, regístralo para que la estadía se cuente por días.'}
            </p>
            <Button
              variant="secondary"
              className="mt-3 w-full"
              onClick={() =>
                navigate(
                  cita.internacion_id
                    ? `/internacion?internacion=${cita.internacion_id}`
                    : `/internacion?paciente=${cita.paciente_id}&cita=${cita.id}`,
                )
              }
            >
              <BedDouble size={16} />
              {cita.internacion_id ? 'Ver internación' : 'Internar paciente'}
            </Button>
          </div>
        )}

        {cita.tipo_cita === 'cirugia' && (
          <div className="space-y-3 rounded-lg border border-rose-100 bg-rose-50 p-4">
            {cita.consentimiento ? (
              <div className="flex items-start gap-2 text-sm text-emerald-700">
                <ShieldCheck size={18} className="mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">Consentimiento aceptado (inmutable)</p>
                  <p className="text-xs text-slate-500">
                    Método: {cita.consentimiento.metodo_aceptacion.replaceAll('_', ' ')} ·{' '}
                    {formatClinicDateTime(cita.consentimiento.created_at)}
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="flex items-center gap-2 text-sm font-medium text-rose-700">
                  <FileCheck2 size={16} /> Requiere Consentimiento
                </p>
                <Select value={metodo} onChange={(e) => setMetodo(e.target.value as MetodoAceptacionConsentimiento)}>
                  <option value="firma_digital">Firma digital en tableta</option>
                  <option value="firma_fisica_escaneada">Firma física escaneada</option>
                  <option value="aceptacion_verbal_registrada">Aceptación verbal registrada</option>
                </Select>
                {error && <p className="text-sm text-rose-600">{error}</p>}
                <Button variant="danger" onClick={handleGenerarConsentimiento} disabled={generando}>
                  {generando ? 'Generando…' : 'Generar Consentimiento'}
                </Button>
              </div>
            )}

            <Link
              to={`/consentimientos/${cita.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <Printer size={16} />
              {cita.consentimiento ? 'Ver / Imprimir consentimiento' : 'Imprimir borrador para firma'}
            </Link>
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
          {cita.estado !== 'cancelada' && cita.estado !== 'completada' && (
            <Button variant="danger" onClick={() => cambiarEstado('cancelada')}>
              Cancelar cita
            </Button>
          )}
          {cita.estado === 'pendiente' && <Button onClick={() => cambiarEstado('confirmada')}>Confirmar</Button>}
          {cita.estado === 'confirmada' && (
            <Button variant="success" onClick={() => cambiarEstado('completada')}>
              Marcar completada
            </Button>
          )}
        </div>
      </div>

      {/* El texto se redacta y se revisa antes de salir: nunca se manda a ciegas. */}
      {avisando && (
        <MensajeModal
          aviso={avisoDeCita(cita)}
          onClose={() => setAvisando(false)}
          onEnviado={() => {
            setAvisando(false)
            onChanged()
          }}
        />
      )}
    </Modal>
  )
}
