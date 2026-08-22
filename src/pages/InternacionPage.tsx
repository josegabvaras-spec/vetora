import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { BedDouble, Plus } from 'lucide-react'
import { AvisoError } from '../components/ui/AvisoError'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Seccion } from '../components/ui/Seccion'
import { useAuth } from '../context/AuthContext'
import { useSuscripcionTabla, useTable } from '../mocks/useDb'
import { listInternaciones } from '../services/internacion'
import { InternarModal } from '../features/internacion/InternarModal'
import { InternacionModal } from '../features/internacion/InternacionModal'
import { RegistrarEvolucionModal } from '../features/internacion/RegistrarEvolucionModal'
import { formatBs } from '../lib/currency'
import { formatClinicDateTime } from '../lib/datetime'
import { etiquetaDias } from '../lib/internacion'
import { Activity } from 'lucide-react'
import type { InternacionConDetalle } from '../types/views'

function TarjetaInternacion({
  internacion,
  onAbrir,
  onRegistrarEvolucion,
}: {
  internacion: InternacionConDetalle
  onAbrir: () => void
  onRegistrarEvolucion?: () => void
}) {
  const internado = internacion.estado === 'internado'
  const total = Number((internacion.costo_estadia_bs + internacion.costo_productos_bs).toFixed(2))

  return (
    <div
      onClick={onAbrir}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onAbrir()
        }
      }}
      role="button"
      tabIndex={0}
      className="w-full cursor-pointer rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-colors hover:border-teal-400 hover:bg-teal-50/30"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-slate-900">{internacion.paciente.nombre}</p>
          <p className="truncate text-xs text-slate-500">{internacion.paciente.cliente.nombre}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {internacion.jaula && (
            <Badge tone="slate" size="sm">
              {internacion.jaula}
            </Badge>
          )}
          <Badge tone={internado ? 'teal' : 'slate'} size="sm">
            {etiquetaDias(internacion.dias)}
          </Badge>
          {!internado && (
            <Badge tone={internacion.cobrada ? 'emerald' : 'amber'} size="sm">
              {internacion.cobrada ? 'Cobrada' : 'Por cobrar'}
            </Badge>
          )}
        </div>
      </div>

      <p className="mt-2 line-clamp-2 text-xs text-slate-600">{internacion.motivo}</p>

      {/* Tres columnas en un celular parten la fecha de ingreso en varias líneas. */}
      <dl className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 sm:grid-cols-3">
        <div>
          <dt className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Ingreso</dt>
          <dd className="text-xs font-semibold text-slate-700">{formatClinicDateTime(internacion.fecha_ingreso)}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Evoluciones</dt>
          <dd className="text-xs font-semibold text-slate-700">{internacion.notas.length}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Acumulado</dt>
          <dd className="font-display text-sm font-black text-slate-900">{formatBs(total)}</dd>
        </div>
      </dl>

      {internado && onRegistrarEvolucion && (
        <div className="mt-3 border-t border-slate-100 pt-2 flex justify-end">
          <Button
            onClick={(e) => {
              e.stopPropagation()
              onRegistrarEvolucion()
            }}
            className="text-xs py-1 px-3 shadow-sm"
          >
            <Activity size={13} /> Registrar evolución
          </Button>
        </div>
      )}
    </div>
  )
}

export function InternacionPage() {
  const { usuario, sucursalActivaId } = useAuth()
  const sucursales = useTable('sucursales')
  // Solo suscripción: `listInternaciones` ya trae lo que hace falta.
  const revisionInternacion = [
    useSuscripcionTabla('internaciones'),
    useSuscripcionTabla('notas_internacion'),
  ].join('-')

  const [searchParams, setSearchParams] = useSearchParams()
  const [internaciones, setInternaciones] = useState<InternacionConDetalle[]>([])
  const [seleccionada, setSeleccionada] = useState<InternacionConDetalle | null>(null)
  const [modalEvolucion, setModalEvolucion] = useState<InternacionConDetalle | null>(null)
  const [internando, setInternando] = useState(false)

  // La agenda enlaza aquí con el paciente y la cita ya elegidos.
  const pacienteInicial = searchParams.get('paciente') ?? undefined
  const citaInicial = searchParams.get('cita')
  const internacionInicial = searchParams.get('internacion')

  const sucursalId = sucursalActivaId || usuario?.sucursal_id || sucursales[0]?.id || ''

  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const recargar = useCallback(async () => {
    const data = await listInternaciones(sucursalActivaId || undefined)
    setInternaciones(data)
    setSeleccionada((actual) => (actual ? data.find((i) => i.id === actual.id) ?? null : null))
    return data
  }, [sucursalActivaId])

  useEffect(() => {
    setErrorCarga(null)
    recargar().catch((err) =>
      setErrorCarga(err instanceof Error ? err.message : 'No se pudieron cargar las internaciones'),
    )
  }, [recargar, revisionInternacion])

  // Abre directamente lo que pidió el enlace de la agenda, una sola vez.
  useEffect(() => {
    if (pacienteInicial) setInternando(true)
    if (!internacionInicial) return
    listInternaciones()
      .then((todas) => {
        const encontrada = todas.find((i) => i.id === internacionInicial)
        if (encontrada) setSeleccionada(encontrada)
      })
      // Sin esto, llegar desde la agenda con un enlace a una internación que no
      // se pudo cargar simplemente no abría nada, sin decir por qué.
      .catch((err) =>
        setErrorCarga(err instanceof Error ? err.message : 'No se pudo abrir la internación solicitada'),
      )
  }, [pacienteInicial, internacionInicial])

  function limpiarParametros() {
    if (searchParams.toString()) setSearchParams({}, { replace: true })
  }

  const internados = internaciones.filter((i) => i.estado === 'internado')
  const dadasDeAlta = internaciones.filter((i) => i.estado === 'alta')

  return (
    <div className="space-y-5">
      <AvisoError mensaje={errorCarga} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold text-slate-900">Internación</h1>
          <p className="mt-0.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Pacientes hospitalizados y su evolución diaria
          </p>
        </div>
        <Button onClick={() => setInternando(true)}>
          <Plus size={16} /> Internar paciente
        </Button>
      </div>

      <Seccion titulo={`Internados (${internados.length})`} tono="destacado">
        {internados.length === 0 ? (
          <Card className="border border-dashed border-slate-300 py-10 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
              <BedDouble size={24} />
            </div>
            <p className="text-sm text-slate-400">No hay pacientes internados en este momento.</p>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {internados.map((i) => (
              <TarjetaInternacion
                key={i.id}
                internacion={i}
                onAbrir={() => setSeleccionada(i)}
                onRegistrarEvolucion={() => setModalEvolucion(i)}
              />
            ))}
          </div>
        )}
      </Seccion>

      <Seccion titulo={`Altas registradas (${dadasDeAlta.length})`}>
        {dadasDeAlta.length === 0 ? (
          <p className="text-sm text-slate-400">Todavía no hay altas registradas.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {dadasDeAlta.map((i) => (
              <TarjetaInternacion key={i.id} internacion={i} onAbrir={() => setSeleccionada(i)} />
            ))}
          </div>
        )}
      </Seccion>

      {internando && (
        <InternarModal
          pacienteIdInicial={pacienteInicial}
          citaId={citaInicial}
          sucursalId={sucursalId}
          onClose={() => {
            setInternando(false)
            limpiarParametros()
          }}
          onInternado={async () => {
            setInternando(false)
            limpiarParametros()
            await recargar()
          }}
        />
      )}

      {seleccionada && (
        <InternacionModal
          internacion={seleccionada}
          onClose={() => {
            setSeleccionada(null)
            limpiarParametros()
          }}
          onChanged={recargar}
        />
      )}

      {modalEvolucion && (
        <RegistrarEvolucionModal
          internacionId={modalEvolucion.id}
          pacienteNombre={modalEvolucion.paciente.nombre}
          onClose={() => setModalEvolucion(null)}
          onGuardado={async () => {
            setModalEvolucion(null)
            await recargar()
          }}
        />
      )}
    </div>
  )
}
