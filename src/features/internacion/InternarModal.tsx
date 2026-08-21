import { useState, useEffect } from 'react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { FieldGroup, Input, Select, Textarea } from '../../components/ui/Field'
import { useTable } from '../../mocks/useDb'
import { useAuth } from '../../context/AuthContext'
import { internarPaciente } from '../../services/internacion'
import { serviciosDeCategoria } from '../../services/servicios'
import { formatBs } from '../../lib/currency'
import { puedeAtender } from '../../lib/personal'

/**
 * Alta de una internación. La tarifa por día sale del catálogo de servicios
 * (categoría "internación"), no se escribe a mano: así el precio lo sigue
 * definiendo el administrador en un solo lugar.
 */
export function InternarModal({
  pacienteIdInicial,
  citaId,
  sucursalId,
  onClose,
  onInternado,
}: {
  pacienteIdInicial?: string
  citaId?: string | null
  sucursalId: string
  onClose: () => void
  onInternado: () => void
}) {
  const { usuario } = useAuth()
  const pacientes = useTable('pacientes')
  const clientes = useTable('clientes')
  const usuarios = useTable('usuarios')
  const servicios = useTable('servicios')
  const veterinarios = usuarios.filter(puedeAtender)

  const [tarifas, setTarifas] = useState<any[]>([])
  const [servicioDiaId, setServicioDiaId] = useState('')
  
  useEffect(() => {
    let montado = true
    serviciosDeCategoria('internacion').then((data) => {
      if (montado) {
        setTarifas(data)
        if (data.length > 0 && !servicioDiaId) {
          setServicioDiaId(data[0].id)
        }
      }
    })
    return () => { montado = false }
    // `servicioDiaId` se omite a propósito de las dependencias, y el linter lo
    // avisa: el `!servicioDiaId` de arriba solo quiere fijar la primera tarifa
    // como valor inicial. Incluirlo haría que el efecto se repitiera en cuanto
    // el usuario eligiera otra, y la comprobación —ya falsa— dejaría de
    // protegerlo: cada recarga del catálogo le pisaría su elección.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [servicios])

  // Derivados, no inicializados: `useTable` está vacío en el primer render y un
  // `useState` con valor inicial se queda con ese vacío. Los `<Select>` salían
  // en blanco pero el formulario se daba por válido, así que "Internar"
  // mandaba un id vacío y Postgres devolvía un error crudo de uuid.
  const [pacienteElegido, setPacienteElegido] = useState<string | null>(null)
  const [veterinarioElegido, setVeterinarioElegido] = useState<string | null>(null)

  const pacienteId = pacienteIdInicial ?? pacienteElegido ?? pacientes[0]?.id ?? ''
  const veterinarioId =
    veterinarioElegido ??
    (usuario && puedeAtender(usuario) ? usuario.id : veterinarios[0]?.id ?? '')

  const setPacienteId = setPacienteElegido
  const setVeterinarioId = setVeterinarioElegido
  const [motivo, setMotivo] = useState('')
  const [jaula, setJaula] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const tarifa = tarifas.find((t) => t.id === servicioDiaId)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    // Los `<Select>` no llevan `required` y un value vacío no casa con ninguna
    // opción, así que sin esto el formulario se enviaba "válido" con ids vacíos.
    if (!pacienteId || !veterinarioId) {
      setError('Selecciona el paciente y el veterinario responsable')
      return
    }
    setGuardando(true)
    setError(null)
    try {
      await internarPaciente({
        pacienteId,
        veterinarioId,
        sucursalId,
        motivo,
        jaula,
        servicioDiaId,
        citaId: citaId ?? null,
      })
      onInternado()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo internar al paciente')
      setGuardando(false)
    }
  }

  return (
    <Modal title="Internar paciente" onClose={onClose}>
      <form className="space-y-4" onSubmit={handleSubmit}>
        <FieldGroup label="Paciente">
          <Select value={pacienteId} onChange={(e) => setPacienteId(e.target.value)} disabled={!!pacienteIdInicial}>
            {pacientes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre} ({clientes.find((c) => c.id === p.cliente_id)?.nombre})
              </option>
            ))}
          </Select>
        </FieldGroup>

        <FieldGroup label="Motivo de la internación">
          <Textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ej. Gastroenteritis hemorrágica con deshidratación moderada"
            required
          />
        </FieldGroup>

        <div className="grid gap-4 sm:grid-cols-2">
          <FieldGroup label="Veterinario/a responsable">
            <Select value={veterinarioId} onChange={(e) => setVeterinarioId(e.target.value)}>
              {veterinarios.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nombre}
                </option>
              ))}
            </Select>
          </FieldGroup>
          <FieldGroup label="Jaula o box (opcional)">
            <Input value={jaula} onChange={(e) => setJaula(e.target.value)} placeholder="Ej. Box 2" />
          </FieldGroup>
        </div>

        {tarifas.length === 0 ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            No hay tarifas de internación en el catálogo. El administrador debe crearlas en Servicios, categoría
            «Internación (por día)», antes de poder internar.
          </p>
        ) : (
          <FieldGroup label="Tarifa por día">
            <Select value={servicioDiaId} onChange={(e) => setServicioDiaId(e.target.value)}>
              {tarifas.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre} — {formatBs(t.precio_bs)} por día
                </option>
              ))}
            </Select>
          </FieldGroup>
        )}

        {tarifa && (
          <p className="text-xs text-slate-500">
            Se cobra <strong>{formatBs(tarifa.precio_bs)}</strong> por día iniciado. El precio queda congelado en esta
            internación: si el catálogo cambia después, la estadía en curso mantiene su tarifa.
          </p>
        )}

        {error && <p className="text-sm text-rose-600">{error}</p>}

        <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={guardando || !motivo.trim() || !servicioDiaId}>
            {guardando ? 'Internando…' : 'Internar'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
