import { useCallback, useEffect, useState } from 'react'
import { clsx } from 'clsx'
import { Bug, Pencil, Plus, Syringe, Trash2 } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Modal } from '../../components/ui/Modal'
import { FieldGroup, Input, Select } from '../../components/ui/Field'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { AvisoError } from '../../components/ui/AvisoError'
import {
  actualizarDesparasitacion,
  actualizarVacuna,
  eliminarDesparasitacion,
  eliminarVacuna,
  listDesparasitaciones,
  listVacunas,
  registrarDesparasitacion,
  registrarVacuna,
} from '../../services/esquemaSanitario'
import { clinicDayIso, desdeFechaSola, formatClinicDate } from '../../lib/datetime'
import type { DesparasitacionAplicada, VacunaAplicada, ViaDesparasitacion } from '../../types/database'

const VIA_LABEL: Record<ViaDesparasitacion, string> = {
  oral: 'Oral',
  topica: 'Tópica',
  inyectable: 'Inyectable',
}

/**
 * Fila unificada del calendario: una vacuna y una desparasitación se enseñan
 * juntas porque para quien atiende son lo mismo —qué se le puso y cuándo toca
 * la siguiente—, aunque en la base vivan en tablas distintas.
 */
interface Entrada {
  id: string
  tipo: 'vacuna' | 'desparasitacion'
  titulo: string
  detalle?: string
  fechaAplicacion: string
  fechaProxima?: string | null
}

function aEntradas(vacunas: VacunaAplicada[], desparasitaciones: DesparasitacionAplicada[]): Entrada[] {
  const filas: Entrada[] = [
    ...vacunas.map((v) => ({
      id: v.id,
      tipo: 'vacuna' as const,
      titulo: v.nombre_vacuna,
      fechaAplicacion: v.fecha_aplicacion,
      fechaProxima: v.fecha_refuerzo,
    })),
    ...desparasitaciones.map((d) => ({
      id: d.id,
      tipo: 'desparasitacion' as const,
      titulo: d.producto,
      detalle: VIA_LABEL[d.via],
      fechaAplicacion: d.fecha_aplicacion,
      fechaProxima: d.fecha_proxima,
    })),
  ]
  // Comparación de cadenas `yyyy-mm-dd`: ordena igual que por fecha y no pasa
  // por `new Date()`, que sobre una fecha sola desplaza el día en La Paz.
  return filas.sort((a, b) => b.fechaAplicacion.localeCompare(a.fechaAplicacion))
}

/** Vencida si su día clínico ya pasó. Nunca `new Date()` sobre una fecha sola. */
function estaVencida(fecha: string): boolean {
  return fecha.slice(0, 10) < clinicDayIso()
}

export function EsquemaSanitario({ pacienteId }: { pacienteId: string }) {
  const [vacunas, setVacunas] = useState<VacunaAplicada[]>([])
  const [desparasitaciones, setDesparasitaciones] = useState<DesparasitacionAplicada[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [editando, setEditando] = useState<{ tipo: 'vacuna' | 'desparasitacion'; id?: string } | null>(null)
  const [aEliminar, setAEliminar] = useState<Entrada | null>(null)

  const recargar = useCallback(async () => {
    setError(null)
    try {
      const [v, d] = await Promise.all([listVacunas(pacienteId), listDesparasitaciones(pacienteId)])
      setVacunas(v)
      setDesparasitaciones(d)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el esquema sanitario')
    } finally {
      setCargando(false)
    }
  }, [pacienteId])

  useEffect(() => {
    recargar()
  }, [recargar])

  const entradas = aEntradas(vacunas, desparasitaciones)

  async function confirmarEliminacion() {
    if (!aEliminar) return
    try {
      if (aEliminar.tipo === 'vacuna') await eliminarVacuna(aEliminar.id)
      else await eliminarDesparasitacion(aEliminar.id)
      setAEliminar(null)
      await recargar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar el registro')
      setAEliminar(null)
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-800">
            <Syringe size={16} className="text-teal-600" /> Esquema Sanitario
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Calendario de vacunación y desparasitación: lo aplicado y lo que toca.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => setEditando({ tipo: 'vacuna' })}>
            <Plus size={14} /> Vacuna
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setEditando({ tipo: 'desparasitacion' })}>
            <Plus size={14} /> Desparasitación
          </Button>
        </div>
      </div>

      <AvisoError mensaje={error} />

      {cargando ? (
        <p className="py-6 text-center text-sm text-slate-400">Cargando esquema sanitario…</p>
      ) : entradas.length === 0 ? (
        <Card className="border border-dashed border-slate-200 py-10 text-center">
          <Syringe size={32} className="mx-auto mb-3 text-slate-300" />
          <p className="text-sm font-medium text-slate-700">Sin registros sanitarios</p>
          <p className="mt-1 text-xs text-slate-500">
            Registra la primera vacuna o desparasitación con los botones de arriba.
          </p>
        </Card>
      ) : (
        <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {entradas.map((e) => (
            <li key={`${e.tipo}-${e.id}`} className="flex items-start gap-3 p-4 hover:bg-slate-50">
              <div
                className={clsx(
                  'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                  e.tipo === 'vacuna' ? 'bg-teal-50 text-teal-600' : 'bg-amber-50 text-amber-600',
                )}
              >
                {e.tipo === 'vacuna' ? <Syringe size={15} /> : <Bug size={15} />}
              </div>

              <div className="min-w-0 flex-1">
                <p className="font-medium text-slate-900">
                  {e.titulo}
                  {e.detalle && <span className="ml-2 text-xs font-normal text-slate-500">{e.detalle}</span>}
                </p>
                {/* `desdeFechaSola` porque son columnas `date`: sin ancla
                    horaria saldrían un día antes en la zona del navegador. */}
                <p className="text-xs text-slate-500">
                  Aplicada el {formatClinicDate(desdeFechaSola(e.fechaAplicacion))}
                </p>
                {e.fechaProxima && (
                  <span
                    className={clsx(
                      'mt-1.5 inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset',
                      estaVencida(e.fechaProxima)
                        ? 'bg-rose-50 text-rose-700 ring-rose-600/20'
                        : 'bg-blue-50 text-blue-700 ring-blue-600/20',
                    )}
                  >
                    {estaVencida(e.fechaProxima) ? 'Vencida el ' : 'Próxima el '}
                    {formatClinicDate(desdeFechaSola(e.fechaProxima))}
                  </span>
                )}
              </div>

              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  aria-label={`Corregir ${e.titulo}`}
                  onClick={() => setEditando({ tipo: e.tipo, id: e.id })}
                  className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  <Pencil size={15} />
                </button>
                <button
                  type="button"
                  aria-label={`Eliminar ${e.titulo}`}
                  onClick={() => setAEliminar(e)}
                  className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editando && (
        <RegistroModal
          pacienteId={pacienteId}
          tipo={editando.tipo}
          vacuna={editando.id ? vacunas.find((v) => v.id === editando.id) : undefined}
          desparasitacion={editando.id ? desparasitaciones.find((d) => d.id === editando.id) : undefined}
          onClose={() => setEditando(null)}
          onGuardado={async () => {
            setEditando(null)
            await recargar()
          }}
        />
      )}

      {aEliminar && (
        <ConfirmDialog
          title={`¿Eliminar ${aEliminar.tipo === 'vacuna' ? 'la vacuna' : 'la desparasitación'}?`}
          description={`Se borrará «${aEliminar.titulo}» del esquema sanitario. Esta acción no se puede deshacer.`}
          confirmLabel="Eliminar"
          onConfirm={confirmarEliminacion}
          onCancel={() => setAEliminar(null)}
        />
      )}
    </div>
  )
}

function RegistroModal({
  pacienteId,
  tipo,
  vacuna,
  desparasitacion,
  onClose,
  onGuardado,
}: {
  pacienteId: string
  tipo: 'vacuna' | 'desparasitacion'
  vacuna?: VacunaAplicada
  desparasitacion?: DesparasitacionAplicada
  onClose: () => void
  onGuardado: () => void
}) {
  const existente = vacuna ?? desparasitacion
  const [nombre, setNombre] = useState(vacuna?.nombre_vacuna ?? desparasitacion?.producto ?? '')
  const [via, setVia] = useState<ViaDesparasitacion>(desparasitacion?.via ?? 'oral')
  // Por defecto hoy, pero editable: casi todo lo que se carga por primera vez
  // es historial previo, con fecha pasada.
  const [fechaAplicacion, setFechaAplicacion] = useState(existente?.fecha_aplicacion?.slice(0, 10) ?? clinicDayIso())
  const [fechaProxima, setFechaProxima] = useState(
    (vacuna?.fecha_refuerzo ?? desparasitacion?.fecha_proxima ?? '')?.slice(0, 10) ?? '',
  )
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const esVacuna = tipo === 'vacuna'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setGuardando(true)
    setError(null)
    try {
      if (esVacuna) {
        const datos = { nombre, fechaAplicacion, fechaRefuerzo: fechaProxima || null }
        if (vacuna) await actualizarVacuna(vacuna.id, datos)
        else await registrarVacuna(pacienteId, datos)
      } else {
        const datos = { producto: nombre, via, fechaAplicacion, fechaProxima: fechaProxima || null }
        if (desparasitacion) await actualizarDesparasitacion(desparasitacion.id, datos)
        else await registrarDesparasitacion(pacienteId, datos)
      }
      onGuardado()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el registro')
      setGuardando(false)
    }
  }

  const titulo = `${existente ? 'Corregir' : 'Registrar'} ${esVacuna ? 'vacuna' : 'desparasitación'}`

  return (
    <Modal title={titulo} onClose={onClose}>
      <form className="space-y-4" onSubmit={handleSubmit}>
        <FieldGroup label={esVacuna ? 'Vacuna' : 'Antiparasitario'}>
          <Input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder={esVacuna ? 'Ej. Quíntuple canina' : 'Ej. Drontal Plus'}
            required
          />
        </FieldGroup>

        {!esVacuna && (
          <FieldGroup label="Vía">
            <Select value={via} onChange={(e) => setVia(e.target.value as ViaDesparasitacion)}>
              {(Object.keys(VIA_LABEL) as ViaDesparasitacion[]).map((v) => (
                <option key={v} value={v}>
                  {VIA_LABEL[v]}
                </option>
              ))}
            </Select>
          </FieldGroup>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <FieldGroup label="Fecha de aplicación">
            <Input
              type="date"
              value={fechaAplicacion}
              onChange={(e) => setFechaAplicacion(e.target.value)}
              required
            />
          </FieldGroup>
          <FieldGroup label={esVacuna ? 'Próximo refuerzo (opcional)' : 'Próxima dosis (opcional)'}>
            <Input type="date" value={fechaProxima} onChange={(e) => setFechaProxima(e.target.value)} />
          </FieldGroup>
        </div>

        <p className="text-xs text-slate-500">
          Sin fecha próxima no se genera aviso de refuerzo para el dueño.
        </p>

        {error && <p className="text-sm text-rose-600">{error}</p>}

        <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
