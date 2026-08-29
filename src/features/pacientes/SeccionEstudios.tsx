import { useEffect, useState } from 'react'
import { ImagePlus, ScanLine, Trash2 } from 'lucide-react'
import { Seccion } from '../../components/ui/Seccion'
import { Button } from '../../components/ui/Button'
import { FieldGroup, Input, Select } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { useAuth } from '../../context/useAuth'
import {
  eliminarEstudio,
  listEstudiosDePaciente,
  subirEstudio,
  urlFirmadaDe,
  TIPO_ESTUDIO_LABEL,
  type EstudioImagen,
  type TipoEstudio,
} from '../../services/estudios'
import { formatClinicDate } from '../../lib/datetime'

/**
 * Estudios de imagen adjuntos a la consulta.
 *
 * A diferencia del resto de secciones no tiene modo diferido: un estudio
 * necesita `historial_id`, así que en el alta de paciente —donde la consulta
 * todavía no existe— esta sección ni se monta.
 */
export function SeccionEstudios({
  historialId,
  pacienteId,
  disabled,
}: {
  historialId: string
  pacienteId: string
  disabled?: boolean
}) {
  const { usuario } = useAuth()
  const [estudios, setEstudios] = useState<EstudioImagen[]>([])
  const [tipo, setTipo] = useState<TipoEstudio>('ecografia')
  const [descripcion, setDescripcion] = useState('')
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ampliado, setAmpliado] = useState<EstudioImagen | null>(null)

  async function recargar() {
    try {
      setEstudios((await listEstudiosDePaciente(pacienteId)).filter((e) => e.historial_id === historialId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los estudios')
    }
  }

  useEffect(() => {
    recargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pacienteId, historialId])

  async function handleArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0]
    // El input se limpia siempre: sin esto, volver a elegir el mismo archivo no
    // dispara `change` y parece que la subida no responde.
    e.target.value = ''
    if (!archivo || !usuario?.clinica_id) return

    setSubiendo(true)
    setError(null)
    try {
      await subirEstudio(usuario.clinica_id, pacienteId, historialId, archivo, tipo, descripcion)
      setDescripcion('')
      await recargar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo subir la imagen')
    } finally {
      setSubiendo(false)
    }
  }

  async function quitar(estudio: EstudioImagen) {
    setError(null)
    try {
      await eliminarEstudio(estudio)
      await recargar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar el estudio')
    }
  }

  return (
    <Seccion titulo="Estudios de imagen" icono={<ScanLine size={13} className="text-teal-600" />}>
      {estudios.length === 0 ? (
        <p className="text-xs text-slate-400">Ninguno adjunto.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {estudios.map((e) => (
            <li key={e.id} className="group relative">
              <button
                type="button"
                onClick={() => setAmpliado(e)}
                className="block w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
              >
                <Miniatura estudio={e} />
                <span className="block px-1.5 py-1 text-left text-[10px] font-medium text-slate-600">
                  {TIPO_ESTUDIO_LABEL[e.tipo]}
                  {e.descripcion && <span className="block truncate text-slate-400">{e.descripcion}</span>}
                </span>
              </button>
              {!disabled && (
                <button
                  type="button"
                  aria-label={`Eliminar ${TIPO_ESTUDIO_LABEL[e.tipo]}`}
                  onClick={() => quitar(e)}
                  className="absolute right-1 top-1 rounded-md bg-white/90 p-1 text-slate-400 opacity-0 transition hover:text-rose-600 group-hover:opacity-100"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {!disabled && (
        <div className="mt-4 flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-end">
          <div className="sm:w-40">
            <FieldGroup label="Tipo">
              <Select value={tipo} onChange={(ev) => setTipo(ev.target.value as TipoEstudio)}>
                {(Object.keys(TIPO_ESTUDIO_LABEL) as TipoEstudio[]).map((t) => (
                  <option key={t} value={t}>
                    {TIPO_ESTUDIO_LABEL[t]}
                  </option>
                ))}
              </Select>
            </FieldGroup>
          </div>
          <div className="flex-1">
            <FieldGroup label="Descripción (opcional)">
              <Input
                value={descripcion}
                onChange={(ev) => setDescripcion(ev.target.value)}
                placeholder="Ej. Abdomen, proyección lateral"
              />
            </FieldGroup>
          </div>
          <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
            <ImagePlus size={14} />
            {subiendo ? 'Subiendo…' : 'Subir imagen'}
            <input type="file" accept="image/*" className="hidden" onChange={handleArchivo} disabled={subiendo} />
          </label>
        </div>
      )}

      {!disabled && (
        <p className="mt-1 text-[11px] text-slate-400">
          La imagen se reduce al subirla y el dueño la verá en su portal cuando la consulta se cierre.
        </p>
      )}

      {error && <p className="mt-2 text-xs font-bold text-rose-600">{error}</p>}

      {ampliado && <VisorEstudio estudio={ampliado} onClose={() => setAmpliado(null)} />}
    </Seccion>
  )
}

/**
 * El bucket es privado: cada imagen necesita su URL firmada, que se pide al
 * montar y caduca. Por eso no se puede poner la ruta directamente en el `src`.
 */
function Miniatura({ estudio }: { estudio: EstudioImagen }) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let montado = true
    urlFirmadaDe(estudio.ruta)
      .then((u) => montado && setUrl(u))
      .catch(() => montado && setUrl(null))
    return () => { montado = false }
  }, [estudio.ruta])

  if (!url) return <span className="block h-24 w-full animate-pulse bg-slate-200" />
  return <img src={url} alt={TIPO_ESTUDIO_LABEL[estudio.tipo]} className="h-24 w-full object-cover" />
}

function VisorEstudio({ estudio, onClose }: { estudio: EstudioImagen; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let montado = true
    urlFirmadaDe(estudio.ruta)
      .then((u) => montado && setUrl(u))
      .catch(() => montado && setUrl(null))
    return () => { montado = false }
  }, [estudio.ruta])

  return (
    <Modal title={TIPO_ESTUDIO_LABEL[estudio.tipo]} onClose={onClose} widthClassName="max-w-3xl">
      <div className="space-y-3">
        {url ? (
          <img src={url} alt={TIPO_ESTUDIO_LABEL[estudio.tipo]} className="max-h-[70vh] w-full object-contain" />
        ) : (
          <div className="h-64 w-full animate-pulse rounded-lg bg-slate-200" />
        )}
        <p className="text-sm text-slate-600">
          {estudio.descripcion || 'Sin descripción'}
          <span className="ml-2 text-xs text-slate-400">{formatClinicDate(estudio.created_at)}</span>
        </p>
        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </div>
    </Modal>
  )
}
