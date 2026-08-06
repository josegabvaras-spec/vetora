import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Activity, LogOut, Package, Plus, Printer } from 'lucide-react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Seccion } from '../../components/ui/Seccion'
import { FieldGroup, Textarea } from '../../components/ui/Field'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { SeccionProductos } from '../pacientes/SeccionesConsulta'
import { darDeAlta, registrarProductoInternacion } from '../../services/internacion'
import { formatBs } from '../../lib/currency'
import { formatClinicDateTime } from '../../lib/datetime'
import { etiquetaDias } from '../../lib/internacion'
import { RegistrarEvolucionModal } from './RegistrarEvolucionModal'
import type { InternacionConDetalle } from '../../types/views'

/** Par etiqueta/valor de la cabecera de la internación. */
function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{etiqueta}</dt>
      <dd className="text-sm font-semibold text-slate-800">{valor}</dd>
    </div>
  )
}

export function InternacionModal({
  internacion,
  onClose,
  onChanged,
}: {
  internacion: InternacionConDetalle
  onClose: () => void
  onChanged: () => void
}) {
  const [indicaciones, setIndicaciones] = useState('')
  const [confirmandoAlta, setConfirmandoAlta] = useState(false)
  const [dandoAlta, setDandoAlta] = useState(false)
  const [abriendoEvolucion, setAbriendoEvolucion] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const internado = internacion.estado === 'internado'
  const puedeEscribir = internado
  const total = Number((internacion.costo_estadia_bs + internacion.costo_productos_bs).toFixed(2))

  async function confirmarAlta() {
    setDandoAlta(true)
    setError(null)
    try {
      await darDeAlta(internacion.id, indicaciones)
      setConfirmandoAlta(false)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo dar de alta')
      setConfirmandoAlta(false)
    } finally {
      setDandoAlta(false)
    }
  }

  return (
    <Modal
      title={`Internación — ${internacion.paciente.nombre}`}
      onClose={onClose}
      widthClassName="max-w-3xl"
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-800">{internacion.motivo}</p>
            <p className="text-xs text-slate-500">
              Dueño/a: {internacion.paciente.cliente.nombre} · Dr(a). {internacion.veterinario_nombre}
            </p>
          </div>
          <Badge tone={internado ? 'teal' : 'slate'}>{internado ? 'Internado' : 'De alta'}</Badge>
        </div>

        <dl className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-4">
          <Dato etiqueta="Ingreso" valor={formatClinicDateTime(internacion.fecha_ingreso)} />
          <Dato
            etiqueta="Alta"
            valor={internacion.fecha_alta ? formatClinicDateTime(internacion.fecha_alta) : 'En curso'}
          />
          <Dato etiqueta="Jaula" valor={internacion.jaula || '—'} />
          <Dato etiqueta="Estadía" valor={etiquetaDias(internacion.dias)} />
        </dl>

        {/* El importe se muestra a título informativo: quien cobra es caja. */}
        <dl className="grid grid-cols-3 gap-3 rounded-xl border border-teal-200 bg-teal-50/60 p-4">
          <Dato
            etiqueta={`Estadía (${formatBs(internacion.precio_dia_bs)}/día)`}
            valor={formatBs(internacion.costo_estadia_bs)}
          />
          <Dato etiqueta="Productos" valor={formatBs(internacion.costo_productos_bs)} />
          <Dato etiqueta="Acumulado" valor={formatBs(total)} />
        </dl>

        <Seccion titulo="Evolución diaria" icono={<Activity size={13} className="text-teal-600" />}>
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-xs text-slate-500 font-medium">
              Historial de evoluciones del paciente ({internacion.notas.length})
            </p>
            {puedeEscribir && (
              <Button onClick={() => setAbriendoEvolucion(true)} className="shadow-sm">
                <Plus size={14} /> Registrar evolución
              </Button>
            )}
          </div>

          {internacion.notas.length === 0 ? (
            <p className="text-xs text-slate-400">Todavía no hay evoluciones registradas.</p>
          ) : (
            <ul className="space-y-2">
              {internacion.notas.map((n) => (
                <li key={n.id} className="rounded-lg border border-slate-200 bg-white p-3">
                  <p className="text-[11px] font-semibold text-slate-400">
                    {formatClinicDateTime(n.created_at)} · Dr(a). {n.veterinario_nombre}
                  </p>
                  <p className="mt-1 text-sm text-slate-700">{n.nota}</p>
                  <p className="mt-1.5 text-[11px] text-slate-500">
                    {[
                      n.temperatura_c != null && `T° ${n.temperatura_c} °C`,
                      n.frecuencia_cardiaca != null && `FC ${n.frecuencia_cardiaca} lpm`,
                      n.frecuencia_respiratoria != null && `FR ${n.frecuencia_respiratoria} rpm`,
                      n.peso_kg != null && `Peso ${n.peso_kg} kg`,
                    ]
                      .filter(Boolean)
                      .join(' · ') || 'Sin constantes registradas'}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Seccion>

        <SeccionProductos
          titulo="Productos usados en la internación"
          registrados={internacion.productosUsados}
          pendientes={[]}
          disabled={!internado}
          onAgregar={async (p) => {
            await registrarProductoInternacion(internacion.id, p.producto_id, p.cantidad)
            onChanged()
          }}
        />

        {!internado && internacion.indicaciones_alta && (
          <Seccion titulo="Indicaciones al alta" icono={<Package size={13} className="text-teal-600" />}>
            <p className="text-sm text-slate-700">{internacion.indicaciones_alta}</p>
          </Seccion>
        )}

        {internado && (
          <Seccion titulo="Alta del paciente" icono={<LogOut size={13} className="text-teal-600" />}>
            <FieldGroup label="Indicaciones al alta (opcional)">
              <Textarea
                value={indicaciones}
                onChange={(e) => setIndicaciones(e.target.value)}
                placeholder="Medicación en casa, dieta, control en X días…"
              />
            </FieldGroup>
            <p className="text-xs text-slate-500">
              Al dar de alta se cierra la estadía en {etiquetaDias(internacion.dias)} y la internación pasa a
              pendientes de cobro en caja.
            </p>
            <div className="flex justify-end">
              <Button variant="success" onClick={() => setConfirmandoAlta(true)}>
                <LogOut size={15} /> Dar de alta
              </Button>
            </div>
          </Seccion>
        )}

        {error && <p className="text-sm text-rose-600">{error}</p>}

        <div className="flex flex-wrap justify-end gap-3 border-t border-slate-200 pt-4">
          <Link
            to={`/internaciones/${internacion.id}/imprimir`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <Printer size={16} /> Imprimir hoja de internación
          </Link>
          <Button variant="secondary" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </div>

      {confirmandoAlta && (
        <ConfirmDialog
          title="Dar de alta al paciente"
          description={`Se cierra la internación con ${etiquetaDias(internacion.dias)} de estadía. A partir de aquí no podrán registrarse más evoluciones ni productos.`}
          confirmLabel="Sí, dar de alta"
          onCancel={() => setConfirmandoAlta(false)}
          onConfirm={confirmarAlta}
          loading={dandoAlta}
        />
      )}
      {abriendoEvolucion && (
        <RegistrarEvolucionModal
          internacionId={internacion.id}
          pacienteNombre={internacion.paciente.nombre}
          onClose={() => setAbriendoEvolucion(false)}
          onGuardado={() => {
            setAbriendoEvolucion(false)
            onChanged()
          }}
        />
      )}
    </Modal>
  )
}
