import { useCallback, useEffect, useMemo, useState } from 'react'
import { AvisoError } from '../components/ui/AvisoError'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { FieldGroup, Input, Select } from '../components/ui/Field'
import { TablaResponsive, type Columna } from '../components/ui/Tabla'
import { useSuscripcionTabla, useTable } from '../mocks/useDb'
import { useMultiSucursal } from '../hooks/usePlanActivo'
import { listMovimientos, resumirMovimientos, type ResumenMovimientos } from '../services/movimientos'
import { formatBs } from '../lib/currency'
import { formatClinicDateTime, TIMEZONE } from '../lib/datetime'
import { formatInTimeZone } from 'date-fns-tz'
import type { MovimientoUnificado, OrigenMovimiento } from '../types/views'

function Cifra({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{etiqueta}</p>
      <p className="font-display text-xl font-black text-slate-900">{valor}</p>
    </div>
  )
}

export function MovimientosPage() {
  const sucursales = useTable('sucursales')
  // Solo suscripción: la bitácora se recarga con su propia consulta acotada.
  const revisionBitacora = [
    useSuscripcionTabla('cobros'),
    useSuscripcionTabla('movimientos_inventario'),
  ].join('-')

  const hoy = formatInTimeZone(new Date(), TIMEZONE, 'yyyy-MM-dd')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [sucursalId, setSucursalId] = useState('')
  const [origen, setOrigen] = useState<'' | OrigenMovimiento>('')

  const [movimientos, setMovimientos] = useState<MovimientoUnificado[]>([])
  const [resumen, setResumen] = useState<ResumenMovimientos | null>(null)

  const isMultiSede = useMultiSucursal()

  const comparativaPorSucursal = useMemo(() => {
    if (!isMultiSede) return []
    return sucursales.map((s) => {
      const movimientosDeSucursal = movimientos.filter((m) => m.sucursal_id === s.id)
      const ingresos = movimientosDeSucursal
        .filter((m) => m.origen === 'caja' && m.monto_bs !== null)
        .reduce((sum, m) => sum + m.monto_bs!, 0)
      const inventario = movimientosDeSucursal.filter((m) => m.origen === 'inventario').length
      return {
        id: s.id,
        nombre: s.nombre,
        ingresos,
        inventario,
      }
    })
  }, [isMultiSede, sucursales, movimientos])

  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const recargar = useCallback(async () => {
    const datos = await listMovimientos({
      desde: desde || undefined,
      hasta: hasta || undefined,
      sucursalId: sucursalId || undefined,
      origen: origen || undefined,
    })
    setMovimientos(datos)
    setResumen(resumirMovimientos(datos))
  }, [desde, hasta, sucursalId, origen])

  useEffect(() => {
    setErrorCarga(null)
    recargar().catch((err) =>
      setErrorCarga(err instanceof Error ? err.message : 'No se pudo cargar la bitácora'),
    )
  }, [recargar, revisionBitacora])

  const columnas = useMemo<Columna<MovimientoUnificado>[]>(
    () => [
      {
        clave: 'descripcion',
        cabecera: 'Descripción',
        movil: 'titulo',
        celda: (m) => <span className="font-semibold text-slate-800">{m.descripcion}</span>,
      },
      {
        clave: 'importe',
        cabecera: 'Importe',
        movil: 'destacado',
        alineadaDerecha: true,
        celda: (m) =>
          m.monto_bs === null ? (
            <span className="text-slate-300">—</span>
          ) : (
            <span className="font-bold text-slate-800">{formatBs(m.monto_bs)}</span>
          ),
      },
      {
        clave: 'fecha',
        cabecera: 'Fecha',
        className: 'whitespace-nowrap',
        celda: (m) => <span className="text-xs text-slate-500">{formatClinicDateTime(m.fecha)}</span>,
      },
      {
        clave: 'tipo',
        cabecera: 'Tipo',
        celda: (m) => (
          <Badge tone={m.origen === 'caja' ? 'emerald' : 'slate'} size="sm">
            {m.origen === 'caja' ? 'Caja' : 'Inventario'}
          </Badge>
        ),
      },
      {
        clave: 'detalle',
        cabecera: 'Detalle',
        celda: (m) => <span className="text-xs text-slate-500">{m.detalle}</span>,
      },
      {
        clave: 'sucursal',
        cabecera: 'Sucursal',
        celda: (m) => (
          <span className="text-xs text-slate-500">
            {sucursales.find((s) => s.id === m.sucursal_id)?.nombre ?? '—'}
          </span>
        ),
      },
    ],
    [sucursales],
  )

  return (
    <div className="space-y-5">
      <AvisoError mensaje={errorCarga} />

      <div>
        <h1 className="font-display text-xl font-bold text-slate-900">Movimientos</h1>
        <p className="mt-0.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Registro de caja e inventario
        </p>
      </div>

      <Card>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <FieldGroup label="Desde">
            <Input type="date" max={hoy} value={desde} onChange={(e) => setDesde(e.target.value)} />
          </FieldGroup>
          <FieldGroup label="Hasta">
            <Input type="date" max={hoy} value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </FieldGroup>
          <FieldGroup label="Sucursal">
            <Select value={sucursalId} onChange={(e) => setSucursalId(e.target.value)}>
              <option value="">Todas</option>
              {sucursales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </Select>
          </FieldGroup>
          <FieldGroup label="Tipo">
            <Select value={origen} onChange={(e) => setOrigen(e.target.value as '' | OrigenMovimiento)}>
              <option value="">Todos</option>
              <option value="caja">Caja</option>
              <option value="inventario">Inventario</option>
            </Select>
          </FieldGroup>
        </div>
      </Card>

      <Card>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          <Cifra etiqueta="Ingresos" valor={formatBs(resumen?.ingresos_bs ?? 0)} />
          <Cifra etiqueta="Efectivo" valor={formatBs(resumen?.efectivo_bs ?? 0)} />
          <Cifra etiqueta="QR" valor={formatBs(resumen?.qr_bs ?? 0)} />
          <Cifra etiqueta="Cobros" valor={String(resumen?.cantidad_caja ?? 0)} />
          <Cifra etiqueta="Mov. inventario" valor={String(resumen?.cantidad_inventario ?? 0)} />
        </div>
      </Card>

      {isMultiSede && comparativaPorSucursal.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {comparativaPorSucursal.map((s) => {
            const maxIngresos = Math.max(...comparativaPorSucursal.map((comp) => comp.ingresos), 1)
            const totalIngresos = comparativaPorSucursal.reduce((sum, comp) => sum + comp.ingresos, 0)
            const cuotaPct = totalIngresos > 0 ? (s.ingresos / totalIngresos) * 100 : 0
            const relativePct = (s.ingresos / maxIngresos) * 100

            return (
              <Card key={s.id} className="border border-slate-200/60 bg-white shadow-xs">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-display font-bold text-slate-800 text-sm">{s.nombre}</h3>
                  <Badge tone="teal" size="sm">Activa</Badge>
                </div>
                <div className="space-y-3.5">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase block tracking-wider mb-0.5">Ingresos Totales</span>
                      <span className="text-base font-black text-slate-800">{formatBs(s.ingresos)}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase block tracking-wider mb-0.5">Ajustes Inventario</span>
                      <span className="text-base font-black text-slate-800">{s.inventario} movs</span>
                    </div>
                  </div>
                  {/* Barra de participación en ingresos */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                      <span>Participación de ingresos</span>
                      <span>{Math.round(cuotaPct)}%</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full bg-teal-500 rounded-full transition-all duration-300" style={{ width: `${relativePct}%` }} />
                    </div>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <Card padding="none" className="overflow-hidden">
        <TablaResponsive
          columnas={columnas}
          filas={movimientos}
          claveDe={(m) => `${m.origen}-${m.id}`}
          vacio="No hay movimientos para los filtros seleccionados."
        />
      </Card>
    </div>
  )
}
