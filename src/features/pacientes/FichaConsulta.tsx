import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ClipboardList, Printer } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import {
  actualizarBorradorHistorial,
  eliminarRecetaItem,
  finalizarHistorial,
  registrarProductoUsado,
  registrarRecetaItem,
} from '../../services/historial'
import { formatClinicDateTime } from '../../lib/datetime'
import { FormularioClinico, aCamposHistorial, datosClinicosDesde } from './FormularioClinico'
import { SeccionesConsulta } from './SeccionesConsulta'
import { RecetarioModal } from './RecetarioModal'
import type { HistorialConDetalle, PacienteConDueno } from '../../types/views'

/**
 * La ficha clínica de una consulta: anamnesis, examen físico, vacunas y
 * productos, más el cierre irreversible. Vive aparte de quien la muestra para
 * que sea exactamente la misma ficha se despliegue donde se despliegue —hoy,
 * dentro de la tarjeta de su cita.
 */
export function FichaConsulta({
  historial,
  paciente,
  onChanged,
  onFinalized,
}: {
  historial: HistorialConDetalle
  paciente: PacienteConDueno
  onChanged: () => void
  onFinalized?: () => void
}) {
  const [datos, setDatos] = useState(() => datosClinicosDesde(historial))
  const [guardando, setGuardando] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [finalizando, setFinalizando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [verReceta, setVerReceta] = useState(false)

  const cerrado = !historial.editable

  async function guardarBorrador() {
    setGuardando(true)
    setError(null)
    try {
      await actualizarBorradorHistorial(historial.id, aCamposHistorial(datos))
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setGuardando(false)
    }
  }

  async function confirmarFinalizar() {
    setFinalizando(true)
    setError(null)
    try {
      await actualizarBorradorHistorial(historial.id, aCamposHistorial(datos))
      await finalizarHistorial(historial.id)
      setConfirmando(false)
      onChanged()
      onFinalized?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo finalizar el historial')
      setConfirmando(false)
    } finally {
      setFinalizando(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-slate-900">{historial.motivo}</p>
          <p className="mt-0.5 text-[11px] font-semibold text-slate-400">
            Registrada el {formatClinicDateTime(historial.created_at)} · Dr(a). {historial.veterinario_nombre}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {/* Abre el recetario como modal en la misma ventana */}
          <button
            type="button"
            onClick={() => setVerReceta(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-teal-300 bg-teal-50 px-3 py-1.5 text-xs font-medium text-teal-700 hover:bg-teal-100"
          >
            <ClipboardList size={14} /> Recetario
          </button>
          <Link
            to={`/pacientes/${historial.paciente_id}/consulta/${historial.id}/imprimir`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
          >
            <Printer size={14} /> Imprimir informe
          </Link>
        </div>
      </div>

      {(historial.origen || historial.procedimiento) && (
        <p className="rounded-lg border border-teal-100 bg-teal-50/60 p-3 text-xs text-slate-700">
          {historial.origen && (
            <>
              <span className="font-bold text-teal-800">Control de la consulta</span> del{' '}
              {formatClinicDateTime(historial.origen.fecha_hora)}: {historial.origen.motivo}
            </>
          )}
          {historial.procedimiento && (
            <>
              {historial.origen && ' · '}
              <span className="font-bold text-teal-800">Procedimiento:</span> {historial.procedimiento}
            </>
          )}
        </p>
      )}

      <FormularioClinico datos={datos} onChange={setDatos} disabled={cerrado} />

      <SeccionesConsulta
        productos={historial.productosUsados ?? []}
        productosPendientes={[]}
        onAgregarProducto={async (p) => {
          await registrarProductoUsado(historial.id, p.producto_id, p.cantidad)
          onChanged()
        }}
        receta={historial.receta ?? []}
        recetaPendientes={[]}
        onAgregarRecetaItem={async (item) => {
          await registrarRecetaItem(historial.id, item)
          onChanged()
        }}
        onEliminarRecetaItem={async (id) => {
          await eliminarRecetaItem(id, historial.id)
          onChanged()
        }}
        historialId={historial.id}
        pacienteId={historial.paciente_id}
        disabled={cerrado}
      />

      {error && <p className="text-xs font-bold text-rose-600">{error}</p>}

      {!cerrado && (
        <div className="flex flex-wrap justify-end gap-3 border-t border-slate-100 pt-3">
          <Button variant="secondary" onClick={guardarBorrador} disabled={guardando}>
            {guardando ? 'Guardando borrador…' : 'Guardar borrador'}
          </Button>
          <Button
            variant="success"
            onClick={() => {
              if (!datos.motivo?.trim()) {
                setError('El motivo de la consulta no puede quedar vacío')
                return
              }
              if (!datos.diagnostico?.trim() || !datos.tratamiento?.trim()) {
                setError('Completa diagnóstico y tratamiento antes de cerrar el historial')
                return
              }
              setError(null)
              setConfirmando(true)
            }}
          >
            Finalizar y cerrar historial
          </Button>
        </div>
      )}

      {confirmando && (
        <ConfirmDialog
          title="Cerrar historial clínico"
          description="Esta acción es irreversible: una vez cerrado, el historial pasa a solo lectura y no podrá editarse nuevamente."
          confirmLabel="Sí, finalizar y cerrar"
          onCancel={() => setConfirmando(false)}
          onConfirm={confirmarFinalizar}
          loading={finalizando}
        />
      )}

      {/* Modal de receta — se renderiza sobre todo lo demás */}
      {verReceta && (
        <RecetarioModal
          historial={historial}
          paciente={paciente}
          onClose={() => setVerReceta(false)}
          onChanged={onChanged}
        />
      )}
    </div>
  )
}

