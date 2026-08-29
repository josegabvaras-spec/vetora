import { useState } from 'react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { FieldGroup, Input, Select, Textarea } from '../../components/ui/Field'
import { AlertTriangle, Plus, Trash2 } from 'lucide-react'
import { formatBs } from '../../lib/currency'
import {
  NIVEL_NUDOS_LABEL,
  NIVEL_SUCIEDAD_LABEL,
  COMPORTAMIENTO_LABEL,
  registrarEvaluacionInicial,
  avanzarEstadoOrden,
} from '../../services/peluqueria'
import type { PeluqueriaOrdenConDetalle } from '../../types/views'
import type { NivelNudos, NivelSuciedad, SuplementoOrden } from '../../types/database'

interface EvaluacionInicialModalProps {
  orden: PeluqueriaOrdenConDetalle
  onClose: () => void
  onSaved: () => void
}

export function EvaluacionInicialModal({ orden, onClose, onSaved }: EvaluacionInicialModalProps) {
  const [condicionPelaje, setCondicionPelaje] = useState(orden.condicion_pelaje || '')
  const [nivelNudos, setNivelNudos] = useState<NivelNudos>(orden.nivel_nudos || 'ninguno')
  const [nivelSuciedad, setNivelSuciedad] = useState<NivelSuciedad>(orden.nivel_suciedad || 'normal')
  const [lesionesVisibles, setLesionesVisibles] = useState(orden.lesiones_visibles || '')
  const [alertaVeterinaria, setAlertaVeterinaria] = useState(orden.alerta_veterinaria || false)
  const [comportamiento, setComportamiento] = useState(orden.comportamiento_recepcion || 'tranquilo')
  const [observaciones, setObservaciones] = useState(orden.observaciones_recepcion || '')

  const [suplementos, setSuplementos] = useState<SuplementoOrden[]>(orden.suplementos || [])
  const [nuevoConcepto, setNuevoConcepto] = useState('')
  const [nuevoMonto, setNuevoMonto] = useState('')

  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function agregarSuplemento() {
    if (!nuevoConcepto.trim()) return
    const monto = parseFloat(nuevoMonto) || 0
    if (monto <= 0) return
    setSuplementos([...suplementos, { concepto: nuevoConcepto.trim(), monto_bs: monto }])
    setNuevoConcepto('')
    setNuevoMonto('')
  }

  function quitarSuplemento(idx: number) {
    setSuplementos(suplementos.filter((_, i) => i !== idx))
  }

  const baseBs = Number(orden.precio_estimado_bs) || 0
  const totalSuplementos = suplementos.reduce((acc, s) => acc + (Number(s.monto_bs) || 0), 0)
  const precioFinalCalculado = Number((baseBs + totalSuplementos).toFixed(2))

  // Si se escribe alguna lesión, marcar alerta médica automáticamente
  function handleLesionesChange(texto: string) {
    setLesionesVisibles(texto)
    if (texto.trim().length > 3) {
      setAlertaVeterinaria(true)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setGuardando(true)
    setError(null)

    try {
      await registrarEvaluacionInicial(orden.id, {
        condicionPelaje,
        nivelNudos,
        nivelSuciedad,
        lesionesVisibles,
        alertaVeterinaria,
        comportamientoRecepcion: comportamiento,
        suplementos,
        precioFinalBs: precioFinalCalculado,
        observacionesRecepcion: observaciones,
      })

      // Pasar a en_espera o en_proceso
      await avanzarEstadoOrden(orden.id, 'en_espera', { precioFinalBs: precioFinalCalculado })

      onSaved()
      onClose()
    } catch (err: any) {
      setError(err.message || 'Error al guardar la evaluación inicial')
      setGuardando(false)
    }
  }

  return (
    <Modal onClose={onClose} title={`Evaluación Inicial · Orden #${orden.numero_orden}`} widthClassName="max-w-2xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
            {error}
          </div>
        )}

        <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-xs flex justify-between items-center">
          <div>
            <span className="font-bold text-slate-400 uppercase text-[10px]">Mascota:</span>{' '}
            <span className="font-bold text-slate-800 text-sm">{orden.paciente?.nombre}</span>{' '}
            <span className="text-slate-500">({orden.paciente?.especie} · {orden.paciente?.raza || 'Mestizo'})</span>
          </div>
          <div>
            <span className="font-bold text-slate-400 uppercase text-[10px]">Dueño:</span>{' '}
            <span className="font-semibold text-slate-700">{orden.cliente?.nombre}</span>
          </div>
        </div>

        {/* Estado del Manto y Pelaje */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FieldGroup label="Nivel de Nudos">
            <Select value={nivelNudos} onChange={(e) => setNivelNudos(e.target.value as NivelNudos)}>
              {(Object.keys(NIVEL_NUDOS_LABEL) as NivelNudos[]).map((k) => (
                <option key={k} value={k}>
                  {NIVEL_NUDOS_LABEL[k]}
                </option>
              ))}
            </Select>
          </FieldGroup>

          <FieldGroup label="Nivel de Suciedad / Grasa">
            <Select value={nivelSuciedad} onChange={(e) => setNivelSuciedad(e.target.value as NivelSuciedad)}>
              {(Object.keys(NIVEL_SUCIEDAD_LABEL) as NivelSuciedad[]).map((k) => (
                <option key={k} value={k}>
                  {NIVEL_SUCIEDAD_LABEL[k]}
                </option>
              ))}
            </Select>
          </FieldGroup>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FieldGroup label="Comportamiento en Recepción">
            <Select value={comportamiento} onChange={(e) => setComportamiento(e.target.value)}>
              {Object.entries(COMPORTAMIENTO_LABEL).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </Select>
          </FieldGroup>

          <FieldGroup label="Condición del Pelaje (Detalles)">
            <Input
              value={condicionPelaje}
              onChange={(e) => setCondicionPelaje(e.target.value)}
              placeholder="Ej. Pelo apelmazado, resequedad, muda excesiva..."
            />
          </FieldGroup>
        </div>

        {/* Detección de lesiones y Advertencia Médica */}
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3.5 space-y-2.5">
          <FieldGroup label="Lesiones visibles / Afecciones cutáneas observadas">
            <Input
              value={lesionesVisibles}
              onChange={(e) => handleLesionesChange(e.target.value)}
              placeholder="Ej. Rojez en axilas, costra en oreja derecha, ectoparásitos, secreción ocular..."
            />
          </FieldGroup>

          <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-amber-900">
            <input
              type="checkbox"
              checked={alertaVeterinaria}
              onChange={(e) => setAlertaVeterinaria(e.target.checked)}
              className="rounded text-amber-600 focus:ring-amber-500"
            />
            <span>Marcar para recomendación de evaluación veterinaria al propietario</span>
          </label>

          {alertaVeterinaria && (
            <div className="flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-100/70 p-3 text-xs font-medium text-amber-900">
              <AlertTriangle size={18} className="text-amber-700 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Se recomienda evaluación veterinaria.</p>
                <p className="text-amber-800 text-[11px]">
                  Se informará al propietario en la entrega y comprobante para que un médico veterinario examine la mascota.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Ajuste de Suplementos por estado del pelaje */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Suplementos / Ajustes de Precio
            </h4>
            <span className="text-xs font-bold text-teal-700">Total: {formatBs(precioFinalCalculado)}</span>
          </div>

          {suplementos.length > 0 && (
            <div className="space-y-1.5">
              {suplementos.map((s, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs"
                >
                  <span className="font-medium text-slate-800">{s.concepto}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-teal-700">+{formatBs(s.monto_bs)}</span>
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

          <div className="flex items-center gap-2">
            <Input
              placeholder="Suplemento adicional (ej. Desenredado complejo)..."
              value={nuevoConcepto}
              onChange={(e) => setNuevoConcepto(e.target.value)}
              className="text-xs"
            />
            <div className="w-24 shrink-0">
              <Input
                type="number"
                placeholder="Bs."
                step="1"
                min="0"
                value={nuevoMonto}
                onChange={(e) => setNuevoMonto(e.target.value)}
                className="text-xs"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={agregarSuplemento}
              disabled={!nuevoConcepto.trim() || !nuevoMonto}
            >
              <Plus size={14} />
            </Button>
          </div>
        </div>

        <FieldGroup label="Observaciones adicionales de evaluación">
          <Textarea
            rows={2}
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            placeholder="Instrucciones específicas para el peluquero..."
          />
        </FieldGroup>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={guardando}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={guardando}>
            {guardando ? 'Guardando...' : 'Completar Evaluación y Pasar a Espera'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
