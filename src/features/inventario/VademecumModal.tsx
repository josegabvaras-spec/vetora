import { useState } from 'react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { FieldGroup, Input, Select, Textarea } from '../../components/ui/Field'
import {
  actualizarFichaVademecum,
  crearFichaVademecum,
  type DatosVademecum,
} from '../../services/vademecum'
import { describirDosis, dosisParaPeso, UNIDAD_LABEL } from '../../lib/vademecum'
import type {
  EspecieVademecum,
  FichaVademecum,
  UnidadDosificacion,
  ViaAdministracion,
} from '../../types/database'

/**
 * Alta y edición de una ficha del vademécum (administrador o veterinario).
 *
 * Casi todo es opcional a propósito: una clínica empieza anotando cuatro
 * fármacos con su dosis y va completando. Exigir la concentración y el rango
 * desde el primer día convertiría el catálogo en un formulario que nadie llena,
 * y un vademécum vacío no sirve para nada.
 *
 * ⚠️ Los campos numéricos se guardan en estado como **texto**, no como número.
 * Con `useState(0)` y `Number(e.target.value)` el cero inicial se queda pegado
 * delante de lo que se escribe («015») y no hay forma de vaciar el campo. La
 * conversión va una sola vez, al enviar.
 */

const ESPECIES: [EspecieVademecum, string][] = [
  ['todos', 'Todas las especies'],
  ['canino', 'Canino'],
  ['felino', 'Felino'],
]

const VIAS: [ViaAdministracion, string][] = [
  ['oral', 'Oral'],
  ['intramuscular', 'Intramuscular'],
  ['subcutanea', 'Subcutánea'],
  ['intravenosa', 'Intravenosa'],
  ['topica', 'Tópica'],
  ['oftalmica', 'Oftálmica'],
  ['otica', 'Ótica'],
]

const UNIDADES: UnidadDosificacion[] = ['ml', 'tableta', 'capsula', 'g', 'gota']

export function VademecumModal({
  ficha,
  onClose,
  onGuardado,
}: {
  ficha: FichaVademecum | null
  onClose: () => void
  onGuardado: () => void
}) {
  const [nombre, setNombre] = useState(ficha?.nombre ?? '')
  const [principioActivo, setPrincipioActivo] = useState(ficha?.principio_activo ?? '')
  const [presentacion, setPresentacion] = useState(ficha?.presentacion ?? '')
  const [concentracion, setConcentracion] = useState(
    ficha?.concentracion_mg != null ? String(ficha.concentracion_mg) : '',
  )
  const [unidad, setUnidad] = useState<UnidadDosificacion>(ficha?.unidad_dosificacion ?? 'ml')
  const [especie, setEspecie] = useState<EspecieVademecum>(ficha?.especie ?? 'todos')
  const [via, setVia] = useState<ViaAdministracion>(ficha?.via ?? 'oral')
  const [dosisMin, setDosisMin] = useState(
    ficha?.dosis_min_mg_kg != null ? String(ficha.dosis_min_mg_kg) : '',
  )
  const [dosisMax, setDosisMax] = useState(
    ficha?.dosis_max_mg_kg != null ? String(ficha.dosis_max_mg_kg) : '',
  )
  const [frecuencia, setFrecuencia] = useState(ficha?.frecuencia ?? '')
  const [duracion, setDuracion] = useState(ficha?.duracion_habitual ?? '')
  const [contraindicaciones, setContraindicaciones] = useState(ficha?.contraindicaciones ?? '')
  const [notas, setNotas] = useState(ficha?.notas ?? '')
  const [activo, setActivo] = useState(ficha?.activo ?? true)

  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const numero = (s: string): number | null => {
    const t = s.trim()
    if (!t) return null
    const n = Number(t)
    return Number.isFinite(n) ? n : null
  }

  // Vista previa con un paciente de 10 kg: enseña, mientras se escribe, qué va
  // a calcular el sistema con estos números. Es la forma más barata de detectar
  // que la concentración se anotó por frasco entero y no por mililitro.
  const previa = dosisParaPeso(
    {
      ...(ficha ?? ({} as FichaVademecum)),
      dosis_min_mg_kg: numero(dosisMin),
      dosis_max_mg_kg: numero(dosisMax),
      concentracion_mg: numero(concentracion),
      unidad_dosificacion: unidad,
    },
    10,
  )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setGuardando(true)
    setError(null)

    const datos: DatosVademecum = {
      nombre,
      principioActivo,
      presentacion,
      concentracionMg: numero(concentracion),
      unidadDosificacion: unidad,
      especie,
      via,
      dosisMinMgKg: numero(dosisMin),
      dosisMaxMgKg: numero(dosisMax),
      frecuencia,
      duracionHabitual: duracion,
      contraindicaciones,
      notas,
      activo,
    }

    try {
      if (ficha) await actualizarFichaVademecum(ficha.id, datos)
      else await crearFichaVademecum(datos)
      onGuardado()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
      setGuardando(false)
    }
  }

  return (
    <Modal title={ficha ? 'Editar medicamento' : 'Nuevo medicamento'} onClose={onClose}>
      <form className="space-y-4" onSubmit={handleSubmit}>
        {error && (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
            {error}
          </p>
        )}

        <FieldGroup label="Nombre">
          <Input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Amoxicilina 500"
            required
            autoFocus
          />
        </FieldGroup>

        <div className="grid gap-4 sm:grid-cols-2">
          <FieldGroup label="Principio activo">
            <Input
              value={principioActivo}
              onChange={(e) => setPrincipioActivo(e.target.value)}
              placeholder="Amoxicilina"
            />
          </FieldGroup>
          <FieldGroup label="Presentación">
            <Input
              value={presentacion}
              onChange={(e) => setPresentacion(e.target.value)}
              placeholder="Frasco 100 ml suspensión"
            />
          </FieldGroup>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FieldGroup label="Especie">
            <Select value={especie} onChange={(e) => setEspecie(e.target.value as EspecieVademecum)}>
              {ESPECIES.map(([v, etiqueta]) => (
                <option key={v} value={v}>
                  {etiqueta}
                </option>
              ))}
            </Select>
          </FieldGroup>
          <FieldGroup label="Vía">
            <Select value={via} onChange={(e) => setVia(e.target.value as ViaAdministracion)}>
              {VIAS.map(([v, etiqueta]) => (
                <option key={v} value={v}>
                  {etiqueta}
                </option>
              ))}
            </Select>
          </FieldGroup>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
          <p className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-500">
            Dosis por kilo
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <FieldGroup label="Mínima (mg/kg)">
              <Input
                type="number"
                min="0"
                step="0.001"
                value={dosisMin}
                onChange={(e) => setDosisMin(e.target.value)}
                placeholder="15"
              />
            </FieldGroup>
            <FieldGroup label="Máxima (mg/kg)">
              <Input
                type="number"
                min="0"
                step="0.001"
                value={dosisMax}
                onChange={(e) => setDosisMax(e.target.value)}
                placeholder="20"
              />
            </FieldGroup>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
          <p className="mb-1 text-xs font-bold uppercase tracking-widest text-slate-500">
            Concentración
          </p>
          {/* Sin esto no hay forma de pasar de miligramos a algo administrable:
              el sistema no puede saber cuántos ml son 180 mg. */}
          <p className="mb-2 text-xs text-slate-500">
            Miligramos de principio activo por cada unidad. Un frasco de 100 ml que trae 250 mg en
            cada 5 ml son <strong>50 mg por ml</strong>.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <FieldGroup label="Miligramos">
              <Input
                type="number"
                min="0"
                step="0.001"
                value={concentracion}
                onChange={(e) => setConcentracion(e.target.value)}
                placeholder="50"
              />
            </FieldGroup>
            <FieldGroup label="Por cada">
              <Select value={unidad} onChange={(e) => setUnidad(e.target.value as UnidadDosificacion)}>
                {UNIDADES.map((u) => (
                  <option key={u} value={u}>
                    {UNIDAD_LABEL[u].replace(/s$/, '')}
                  </option>
                ))}
              </Select>
            </FieldGroup>
          </div>

          {previa && (
            <p className="mt-2 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-medium text-teal-900">
              Con estos números, un paciente de 10 kg saldría en{' '}
              <strong className="break-words">{describirDosis(previa)}</strong>.
            </p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FieldGroup label="Frecuencia habitual">
            <Input
              value={frecuencia}
              onChange={(e) => setFrecuencia(e.target.value)}
              placeholder="Cada 12 horas"
            />
          </FieldGroup>
          <FieldGroup label="Duración habitual">
            <Input
              value={duracion}
              onChange={(e) => setDuracion(e.target.value)}
              placeholder="7 días"
            />
          </FieldGroup>
        </div>

        <FieldGroup label="Contraindicaciones">
          <Textarea
            value={contraindicaciones}
            onChange={(e) => setContraindicaciones(e.target.value)}
            placeholder="No en gestantes · control renal en pacientes mayores"
          />
        </FieldGroup>

        <FieldGroup label="Notas">
          <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} />
        </FieldGroup>

        {/* Retirar sin borrar: las fichas viejas dejan de ofrecerse en el
            recetario pero lo escrito no se pierde. */}
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={activo}
            onChange={(e) => setActivo(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-teal-600"
          />
          En uso (desmárcalo para retirarlo sin borrarlo)
        </label>

        <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={guardando}>
            {guardando ? 'Guardando…' : ficha ? 'Guardar cambios' : 'Crear ficha'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
