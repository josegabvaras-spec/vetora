import { useState } from 'react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { actualizarClienteYPaciente } from '../../services/clientesPacientes'
import { FormularioPaciente, type DatosPaciente } from './FormularioPaciente'
import type { PacienteConDueno } from '../../types/views'

export function EditarPacienteModal({
  paciente,
  onClose,
  onUpdated,
}: {
  paciente: PacienteConDueno
  onClose: () => void
  onUpdated: () => void
}) {
  const { cliente } = paciente

  const [datosPaciente, setDatosPaciente] = useState<DatosPaciente>({
    clienteNombre: cliente.nombre,
    clienteWhatsapp: cliente.whatsapp,
    clienteCi: cliente.ci || '',
    pacienteNombre: paciente.nombre,
    foto: paciente.foto || '',
    fechaNacimiento: paciente.fecha_nacimiento || '',
    especie: paciente.especie,
    raza: paciente.raza || '',
    sexo: paciente.sexo,
    alergias: paciente.alergias || '',
    antecedentes: paciente.antecedentes || '',
  })

  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * La foto se manda **solo si cambió**.
   *
   * Las pantallas que listan pacientes ya no piden la columna `foto` —es base64
   * y pesa megas—, así que aquí puede llegar vacía sin que eso signifique que el
   * paciente no tenga ninguna. Mandarla igualmente convertía «no la tengo
   * cargada» en «bórrala», y editar el peso de un paciente le borraba la foto.
   * Comparar contra el valor de partida distingue los dos casos, y de paso
   * quitarla sigue funcionando: pasa a ser distinta de la original.
   */
  const fotoOriginal = paciente.foto ?? ''

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setEnviando(true)
    try {
      await actualizarClienteYPaciente(paciente.id, cliente.id, {
        ...datosPaciente,
        foto: datosPaciente.foto !== fotoOriginal ? datosPaciente.foto : undefined,
      })
      onUpdated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido al actualizar')
      setEnviando(false)
    }
  }

  return (
    <Modal title="Editar Perfil" onClose={onClose} widthClassName="max-w-4xl">
      <form id="form-editar-paciente" onSubmit={handleSubmit} className="space-y-6">
        <FormularioPaciente datos={datosPaciente} onChange={setDatosPaciente} />

        {error && <p className="text-sm font-medium text-rose-600">{error}</p>}

        <div className="flex justify-end gap-3 pt-6 border-t border-slate-100">
          <Button type="button" variant="secondary" onClick={onClose} disabled={enviando}>
            Cancelar
          </Button>
          <Button type="submit" disabled={enviando}>
            {enviando ? 'Guardando…' : 'Guardar Cambios'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
