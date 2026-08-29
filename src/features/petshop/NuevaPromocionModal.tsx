import { useState } from 'react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { FieldGroup, Input, Select, Textarea } from '../../components/ui/Field'
import {
  TIPO_PROMOCION_LABEL,
  crearPromocion,
  actualizarPromocion,
} from '../../services/promociones'
import type { PetshopPromocion, TipoPromocionPetshop } from '../../types/database'

interface NuevaPromocionModalProps {
  promocionAEditar?: PetshopPromocion | null
  onClose: () => void
  onSaved: () => void
}

export function NuevaPromocionModal({
  promocionAEditar,
  onClose,
  onSaved,
}: NuevaPromocionModalProps) {
  const [titulo, setTitulo] = useState(promocionAEditar?.titulo || '')
  const [descripcion, setDescripcion] = useState(promocionAEditar?.descripcion || '')
  const [tipo, setTipo] = useState<TipoPromocionPetshop>(
    promocionAEditar?.tipo || 'porcentaje',
  )
  const [codigoCupon, setCodigoCupon] = useState(promocionAEditar?.codigo_cupon || '')
  const [valorDescuento, setValorDescuento] = useState<number>(
    promocionAEditar?.valor_descuento || 10,
  )
  const [fechaInicio, setFechaInicio] = useState(
    promocionAEditar?.fecha_inicio || new Date().toISOString().slice(0, 10),
  )
  const [fechaFin, setFechaFin] = useState(
    promocionAEditar?.fecha_fin ||
      new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
  )
  const [limiteUso, setLimiteUso] = useState<number>(promocionAEditar?.limite_uso || 100)

  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!titulo.trim()) {
      setError('El título de la promoción es obligatorio')
      return
    }

    setGuardando(true)
    setError(null)

    try {
      if (promocionAEditar) {
        await actualizarPromocion(promocionAEditar.id, {
          titulo,
          descripcion,
          tipo,
          codigoCupon: codigoCupon || undefined,
          valorDescuento,
          fechaInicio,
          fechaFin,
          limiteUso,
        })
      } else {
        await crearPromocion({
          titulo,
          descripcion,
          tipo,
          codigoCupon: codigoCupon || undefined,
          valorDescuento,
          fechaInicio,
          fechaFin,
          limiteUso,
        })
      }

      onSaved()
      onClose()
    } catch (err: any) {
      setError(err.message || 'Error al guardar promoción')
      setGuardando(false)
    }
  }

  return (
    <Modal
      onClose={onClose}
      title={promocionAEditar ? 'Editar Promoción' : 'Nueva Promoción / Cupón'}
      widthClassName="max-w-lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
            {error}
          </div>
        )}

        <FieldGroup label="Título de la Promoción">
          <Input
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Ej. Descuento 15% en Alimentos Cachorro"
            required
          />
        </FieldGroup>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FieldGroup label="Tipo de Promoción">
            <Select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as TipoPromocionPetshop)}
              required
            >
              {Object.entries(TIPO_PROMOCION_LABEL).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </Select>
          </FieldGroup>

          <FieldGroup
            label={
              tipo === 'porcentaje'
                ? 'Porcentaje Descuento (%)'
                : 'Monto Descuento (Bs.)'
            }
          >
            <Input
              type="number"
              step="0.5"
              min="0"
              value={valorDescuento}
              onChange={(e) => setValorDescuento(parseFloat(e.target.value) || 0)}
              required
            />
          </FieldGroup>
        </div>

        {tipo === 'cupon' && (
          <FieldGroup label="Código del Cupón (Texto para canjear en POS)">
            <Input
              value={codigoCupon}
              onChange={(e) => setCodigoCupon(e.target.value.toUpperCase())}
              placeholder="Ej. VERANO2026"
              required
            />
          </FieldGroup>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FieldGroup label="Fecha Inicio">
            <Input
              type="date"
              value={fechaInicio}
              onChange={(e) => setFechaInicio(e.target.value)}
              required
            />
          </FieldGroup>

          <FieldGroup label="Fecha Fin">
            <Input
              type="date"
              value={fechaFin}
              onChange={(e) => setFechaFin(e.target.value)}
              required
            />
          </FieldGroup>
        </div>

        <FieldGroup label="Límite Máximo de Usos">
          <Input
            type="number"
            min="1"
            value={limiteUso}
            onChange={(e) => setLimiteUso(parseInt(e.target.value) || 1)}
          />
        </FieldGroup>

        <FieldGroup label="Descripción / Términos">
          <Textarea
            rows={2}
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Válido solo en pagos en efectivo o QR..."
          />
        </FieldGroup>

        <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
          <Button type="button" variant="outline" onClick={onClose} disabled={guardando}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={guardando}>
            {guardando ? 'Guardando...' : promocionAEditar ? 'Guardar Cambios' : 'Crear Promoción'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
