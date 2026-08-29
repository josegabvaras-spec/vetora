import { useEffect, useState } from 'react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { FieldGroup, Input, Select, Textarea } from '../../components/ui/Field'
import { COMPORTAMIENTO_LABEL, getFichaGrooming, guardarFichaGrooming } from '../../services/peluqueria'
import type { Paciente, Cliente, ComportamientoGrooming } from '../../types/database'
import { calcularEdad } from '../../lib/paciente'

interface FichaGroomingModalProps {
  paciente: Paciente & { cliente?: Cliente }
  onClose: () => void
  onSaved: () => void
}

export function FichaGroomingModal({ paciente, onClose, onSaved }: FichaGroomingModalProps) {
  const [corteHabitual, setCorteHabitual] = useState('')
  const [longitudPreferida, setLongitudPreferida] = useState('')
  const [frecuenciaDias, setFrecuenciaDias] = useState<number>(30)
  const [productosPreferidos, setProductosPreferidos] = useState('')
  const [comportamiento, setComportamiento] = useState<ComportamientoGrooming>('tranquilo')
  const [alergiasSensibilidad, setAlergiasSensibilidad] = useState('')
  const [observaciones, setObservaciones] = useState('')

  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getFichaGrooming(paciente.id)
      .then((ficha) => {
        if (ficha) {
          setCorteHabitual(ficha.corte_habitual || '')
          setLongitudPreferida(ficha.longitud_preferida || '')
          setFrecuenciaDias(ficha.frecuencia_dias || 30)
          setProductosPreferidos(ficha.productos_preferidos || '')
          setComportamiento(ficha.comportamiento || 'tranquilo')
          setAlergiasSensibilidad(ficha.alergias_sensibilidad || '')
          setObservaciones(ficha.observaciones || '')
        }
      })
      .finally(() => setCargando(false))
  }, [paciente.id])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setGuardando(true)
    setError(null)

    try {
      await guardarFichaGrooming(paciente.id, {
        corte_habitual: corteHabitual,
        longitud_preferida: longitudPreferida,
        frecuencia_dias: frecuenciaDias,
        productos_preferidos: productosPreferidos,
        comportamiento,
        alergias_sensibilidad: alergiasSensibilidad,
        observaciones,
      })

      onSaved()
      onClose()
    } catch (err: any) {
      setError(err.message || 'Error al guardar la ficha de peluquería')
      setGuardando(false)
    }
  }

  return (
    <Modal onClose={onClose} title={`Ficha de Peluquería · ${paciente.nombre}`} widthClassName="max-w-2xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
            {error}
          </div>
        )}

        {/* Resumen del Paciente */}
        <div className="flex items-center gap-3.5 rounded-2xl border border-slate-100 bg-slate-50/70 p-3.5 text-xs">
          {paciente.foto ? (
            <img
              src={paciente.foto}
              alt={paciente.nombre}
              className="h-12 w-12 rounded-xl object-cover border border-slate-200"
            />
          ) : (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-teal-100 text-teal-700 font-black text-base">
              {paciente.nombre.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h4 className="font-bold text-sm text-slate-900">{paciente.nombre}</h4>
            <p className="text-slate-500 text-[11px]">
              {paciente.especie} · {paciente.raza || 'Mestizo'} · {paciente.sexo} · {calcularEdad(paciente.fecha_nacimiento)}
            </p>
            {paciente.cliente && (
              <p className="text-slate-600 font-medium text-[11px] mt-0.5">
                Tutor: {paciente.cliente.nombre} ({paciente.cliente.whatsapp})
              </p>
            )}
          </div>
        </div>

        {cargando ? (
          <p className="text-center py-6 text-xs text-slate-500">Cargando ficha...</p>
        ) : (
          <>
            {/* Preferencias de Corte */}
            <div className="rounded-xl border border-slate-200/80 bg-white p-3.5 space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Preferencias de Estilo y Corte
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FieldGroup label="Corte Habitual / Estilo">
                  <Input
                    value={corteHabitual}
                    onChange={(e) => setCorteHabitual(e.target.value)}
                    placeholder="Ej. Corte de raza Schnauzer, corte asiático, rebaje..."
                  />
                </FieldGroup>

                <FieldGroup label="Longitud / Largo de Pelaje Preferido">
                  <Input
                    value={longitudPreferida}
                    onChange={(e) => setLongitudPreferida(e.target.value)}
                    placeholder="Ej. Dejar 2 cm en cuerpo, faldón largo, cabeza redonda..."
                  />
                </FieldGroup>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FieldGroup label="Frecuencia Recomendada (días)">
                  <Input
                    type="number"
                    min="7"
                    max="180"
                    value={frecuenciaDias}
                    onChange={(e) => setFrecuenciaDias(parseInt(e.target.value) || 30)}
                  />
                </FieldGroup>

                <FieldGroup label="Productos / Cosmética Preferida">
                  <Input
                    value={productosPreferidos}
                    onChange={(e) => setProductosPreferidos(e.target.value)}
                    placeholder="Ej. Shampoo hipoalergénico, perfume suave frutal..."
                  />
                </FieldGroup>
              </div>
            </div>

            {/* Comportamiento y Sensibilidades */}
            <div className="rounded-xl border border-slate-200/80 bg-white p-3.5 space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Comportamiento y Manejo en Mesa
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FieldGroup label="Comportamiento General">
                  <Select
                    value={comportamiento}
                    onChange={(e) => setComportamiento(e.target.value as ComportamientoGrooming)}
                  >
                    {Object.entries(COMPORTAMIENTO_LABEL).map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </FieldGroup>

                <FieldGroup label="Sensibilidad de Piel / Alergias Cosméticas">
                  <Input
                    value={alergiasSensibilidad}
                    onChange={(e) => setAlergiasSensibilidad(e.target.value)}
                    placeholder="Ej. Piel atópica, no usar perfumes con alcohol..."
                  />
                </FieldGroup>
              </div>

              <FieldGroup label="Observaciones y Notas de Peluquería">
                <Textarea
                  rows={2}
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                  placeholder="Detalles sobre cicatrices, verrugas, preferencias del tutor..."
                />
              </FieldGroup>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={guardando}>
                Cancelar
              </Button>
              <Button type="submit" variant="primary" disabled={guardando}>
                {guardando ? 'Guardando...' : 'Guardar Ficha de Peluquería'}
              </Button>
            </div>
          </>
        )}
      </form>
    </Modal>
  )
}
