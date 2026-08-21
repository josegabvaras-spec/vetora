import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity,
  Banknote,
  BedDouble,
  ChevronDown,
  ChevronRight,
  FlaskConical,
  LogOut,
  Pill,
  Printer,
  QrCode,
  Scissors,
  Search,
  Sparkles,
  Stethoscope,
  Wallet,
} from 'lucide-react'
import clsx from 'clsx'
import { AvisoError } from '../components/ui/AvisoError'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { Seccion } from '../components/ui/Seccion'
import { FieldGroup, Input } from '../components/ui/Field'
import { useAuth } from '../context/AuthContext'
import { useSuscripcionTabla, useTable } from '../mocks/useDb'
import {
  abrirTurno,
  cerrarTurno,
  getTurnoAbierto,
  listAtencionesPorCobrar,
  listCobrosDelTurno,
  registrarCobro,
  registrarVentaDirecta,
  resumenTurno,
  type ResumenTurno,
  type ServicioSeleccionado,
} from '../services/caja'
import { CATEGORIA_LABEL, CATEGORIAS } from '../services/servicios'
import { formatBs } from '../lib/currency'
import { formatClinicDateTime } from '../lib/datetime'
import type { CategoriaServicio, MetodoPago, TurnoCaja } from '../types/database'
import type { AtencionPorCobrar, CobroConDetalle, LineaCobro } from '../types/views'

const METODO_LABEL: Record<MetodoPago, string> = { efectivo: 'Efectivo', qr: 'QR' }

const CATEGORIA_ICON: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  consulta: Stethoscope,
  cirugia: Scissors,
  laboratorio: FlaskConical,
  imagenologia: Activity,
  internacion: BedDouble,
  peluqueria: Scissors,
  otros: Sparkles,
}

function Cifra({ etiqueta, valor, destacado }: { etiqueta: string; valor: string; destacado?: boolean }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{etiqueta}</p>
      <p className={destacado ? 'font-display text-xl font-black text-slate-900' : 'text-sm font-bold text-slate-800'}>
        {valor}
      </p>
    </div>
  )
}

export function CajaPage() {
  const { usuario, sucursalActivaId } = useAuth()
  const sucursales = useTable('sucursales')
  // Suscripción sin descarga: estas tres tablas no se leen aquí, solo hacen
  // falta para saber cuándo recargar. Con `useTable` se bajaban enteras y,
  // además, el cambio no llegaba a disparar `recargar` (el efecto solo dependía
  // de la sucursal), así que un cobro hecho en otra pestaña no aparecía.
  const revisionCaja = [
    useSuscripcionTabla('cobros'),
    useSuscripcionTabla('turnos_caja'),
    useSuscripcionTabla('productos'),
  ].join('-')

  const sucursalId = sucursalActivaId || usuario?.sucursal_id || sucursales[0]?.id || ''

  const [turno, setTurno] = useState<TurnoCaja | undefined>(undefined)
  const [resumen, setResumen] = useState<ResumenTurno | null>(null)
  const [pendientes, setPendientes] = useState<AtencionPorCobrar[]>([])
  const [cobros, setCobros] = useState<CobroConDetalle[]>([])

  const [saldoInicial, setSaldoInicial] = useState('0')
  const [abriendo, setAbriendo] = useState(false)
  const [cobrando, setCobrando] = useState<AtencionPorCobrar | null>(null)
  const [vendiendoMedicamentos, setVendiendoMedicamentos] = useState(false)
  const [cerrando, setCerrando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const recargar = useCallback(async () => {
    if (!sucursalId) return
    const abierto = await getTurnoAbierto(sucursalId)
    setTurno(abierto)
    setResumen(abierto ? await resumenTurno(abierto.id) : null)
    setPendientes(await listAtencionesPorCobrar(sucursalId))
    setCobros(abierto ? await listCobrosDelTurno(abierto.id) : [])
  }, [sucursalId])

  useEffect(() => {
    setErrorCarga(null)
    recargar().catch((err) =>
      setErrorCarga(err instanceof Error ? err.message : 'No se pudo cargar la caja'),
    )
  }, [recargar, revisionCaja])

  async function handleAbrir() {
    setError(null)
    setAbriendo(true)
    try {
      await abrirTurno(sucursalId, usuario!.id, Number(saldoInicial) || 0)
      await recargar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo abrir la caja')
    } finally {
      setAbriendo(false)
    }
  }

  const sucursalNombre = sucursales.find((s) => s.id === sucursalId)?.nombre ?? 'Sucursal'

  return (
    <div className="space-y-5">
      <AvisoError mensaje={errorCarga} />

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">Caja</h1>
          <p className="mt-0.5 text-xs font-semibold uppercase tracking-wider text-slate-400">{sucursalNombre}</p>
        </div>
        {/* Sin turno abierto no va ningún botón aquí: el formulario de apertura
            ya ocupa la pantalla justo debajo. El que había llamaba a
            `setAbriendo(true)`, que es el flag de "enviando" del propio
            formulario, así que pulsarlo dejaba el botón "Abrir caja"
            deshabilitado en "Abriendo…" para siempre — solo `handleAbrir` lo
            devuelve a false, y estaba deshabilitado. La caja no se podía abrir
            sin recargar la página, y sin caja no se cobra. */}
        {!turno ? null : (
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <Button
              onClick={() => setVendiendoMedicamentos(true)}
              className="w-full sm:w-auto shadow-xs"
            >
              <Pill size={16} /> Venta de Medicamentos
            </Button>
            <Button variant="secondary" onClick={() => setCerrando(true)} className="w-full sm:w-auto">
              <LogOut size={16} /> Cerrar Turno
            </Button>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      {!turno ? (
        <Card className="mx-auto max-w-md text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-50 text-teal-600">
            <Wallet size={24} />
          </div>
          <h2 className="font-display text-lg font-bold text-slate-900">Caja cerrada</h2>
          <p className="mt-1 text-sm text-slate-500">
            Abre la caja con el efectivo con el que inicias el turno para poder registrar cobros.
          </p>
          <div className="mx-auto mt-5 max-w-xs text-left">
            <FieldGroup label="Saldo inicial en efectivo (Bs.)">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={saldoInicial}
                onChange={(e) => setSaldoInicial(e.target.value)}
              />
            </FieldGroup>
          </div>
          <Button className="mt-4 w-full max-w-xs" onClick={handleAbrir} disabled={abriendo}>
            {abriendo ? 'Abriendo…' : 'Abrir caja'}
          </Button>
        </Card>
      ) : (
        <>
          <Card>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
              <Cifra etiqueta="Saldo inicial" valor={formatBs(turno.saldo_inicial_bs)} />
              <Cifra etiqueta="Efectivo" valor={formatBs(resumen?.efectivo_bs ?? 0)} />
              <Cifra etiqueta="QR" valor={formatBs(resumen?.qr_bs ?? 0)} />
              <Cifra etiqueta="Cobrado" valor={formatBs(resumen?.total_bs ?? 0)} destacado />
              <Cifra etiqueta="Esperado en caja" valor={formatBs(resumen?.esperado_en_caja_bs ?? 0)} destacado />
            </div>
            <p className="mt-3 border-t border-slate-200 pt-3 text-xs text-slate-500">
              Turno abierto el {formatClinicDateTime(turno.abierto_at)} · El cobro por QR no entra al efectivo de caja.
            </p>
          </Card>

          <Seccion titulo={`Pendientes de cobro (${pendientes.length})`}>
            {pendientes.length === 0 ? (
              <p className="text-sm text-slate-400">No hay atenciones pendientes de cobro.</p>
            ) : (
              <ul className="space-y-2">
                {pendientes.map((p) => (
                  <li
                    key={`${p.tipo}-${p.referencia_id}`}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-slate-900">{p.paciente_nombre}</p>
                      <p className="text-xs text-slate-500">
                        {p.cliente_nombre} · {p.concepto} · {formatClinicDateTime(p.fecha)}
                      </p>
                    </div>
                    <div className="flex w-full items-center justify-between gap-3 sm:w-auto">
                      <span className="text-xs text-slate-500 sm:text-right">
                        {p.lineasFijas.length > 0 ? (
                          <>
                            {p.tipo === 'internacion' ? 'Estadía y productos' : 'Productos'}:{' '}
                            <strong className="text-slate-800">{formatBs(p.subtotal_fijo_bs)}</strong>
                          </>
                        ) : (
                          'Sin consumos'
                        )}
                        <br />
                        <span className="text-slate-400">servicios al cobrar</span>
                      </span>
                      <Button className="shrink-0" onClick={() => setCobrando(p)}>
                        Cobrar
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Seccion>

          <Seccion titulo={`Cobros del turno (${cobros.length})`}>
            {cobros.length === 0 ? (
              <p className="text-sm text-slate-400">Todavía no se registraron cobros en este turno.</p>
            ) : (
              <ul className="space-y-2">
                {cobros.map((c) => (
                  <li
                    key={c.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-slate-900">{c.paciente_nombre}</p>
                      <p className="text-xs text-slate-500">{formatClinicDateTime(c.created_at)}</p>
                    </div>
                    <div className="flex w-full items-center gap-3 sm:w-auto">
                      <Badge tone={c.metodo_pago === 'efectivo' ? 'emerald' : 'teal'} size="sm">
                        {METODO_LABEL[c.metodo_pago]}
                      </Badge>
                      <span className="text-sm font-bold text-slate-800">{formatBs(c.monto_bs)}</span>
                      <Link
                        to={`/recibos/${c.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-auto inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        <Printer size={13} /> Recibo
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Seccion>
        </>
      )}

      {cobrando && turno && (
        <CobrarModal
          atencion={cobrando}
          onClose={() => setCobrando(null)}
          onCobrado={async () => {
            setCobrando(null)
            await recargar()
          }}
        />
      )}

      {vendiendoMedicamentos && turno && (
        <VentaMedicamentosModal
          sucursalId={sucursalId}
          onClose={() => setVendiendoMedicamentos(false)}
          onVentaCompletada={async () => {
            setVendiendoMedicamentos(false)
            await recargar()
          }}
        />
      )}

      {cerrando && turno && resumen && (
        <CerrarTurnoModal
          turno={turno}
          resumen={resumen}
          onClose={() => setCerrando(false)}
          onCerrado={async () => {
            setCerrando(false)
            await recargar()
          }}
        />
      )}
    </div>
  )
}

function CobrarModal({
  atencion,
  onClose,
  onCobrado,
}: {
  atencion: AtencionPorCobrar
  onClose: () => void
  onCobrado: () => void
}) {
  const { usuario } = useAuth()
  const catalogo = useTable('servicios').filter((s) => s.activo)
  const [metodo, setMetodo] = useState<MetodoPago>('efectivo')
  // La cirugía que se agendó llega ya marcada: recepción solo confirma o ajusta.
  const [seleccion, setSeleccion] = useState<ServicioSeleccionado[]>(() =>
    atencion.servicio_sugerido_id ? [{ servicio_id: atencion.servicio_sugerido_id, cantidad: 1 }] : [],
  )
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Categorías que tienen al menos un servicio activo en el catálogo
  const categoriasDisponibles = CATEGORIAS.filter((cat) => catalogo.some((s) => s.categoria === cat))

  // Categoría sugerida si existe (ej. cirugía)
  const categoriaSugerida = atencion.servicio_sugerido_id
    ? catalogo.find((s) => s.id === atencion.servicio_sugerido_id)?.categoria
    : undefined

  // Estado para desplegar/plegar cada categoría
  const [categoriasAbiertas, setCategoriasAbiertas] = useState<Record<string, boolean>>(() => {
    const inicial: Record<string, boolean> = {}
    categoriasDisponibles.forEach((cat) => {
      // Si hay una categoría sugerida, se abre esa de forma destacada, o todas por defecto
      inicial[cat] = categoriaSugerida ? cat === categoriaSugerida : true
    })
    return inicial
  })

  const [busqueda, setBusqueda] = useState('')

  function toggleCategoria(cat: string) {
    setCategoriasAbiertas((prev) => ({
      ...prev,
      [cat]: !prev[cat],
    }))
  }

  const cantidadDe = (id: string) => seleccion.find((s) => s.servicio_id === id)?.cantidad ?? 0

  function cambiarCantidad(id: string, delta: number) {
    setSeleccion((prev) => {
      const actual = prev.find((s) => s.servicio_id === id)
      const nueva = (actual?.cantidad ?? 0) + delta
      if (nueva <= 0) return prev.filter((s) => s.servicio_id !== id)
      if (actual) return prev.map((s) => (s.servicio_id === id ? { ...s, cantidad: nueva } : s))
      return [...prev, { servicio_id: id, cantidad: nueva }]
    })
  }

  // Cantidad de servicios seleccionados por categoría
  function countSelectedInCategory(cat: CategoriaServicio): number {
    return seleccion.reduce((total, sel) => {
      const serv = catalogo.find((s) => s.id === sel.servicio_id)
      if (!serv) return total
      if (serv.categoria === cat) {
        return total + sel.cantidad
      }
      return total
    }, 0)
  }

  // Filtrado de categorías según la búsqueda activa
  const categoriasAMostrar = categoriasDisponibles.filter((cat) => {
    if (!busqueda.trim()) return true
    return catalogo.some(
      (s) => s.categoria === cat && s.nombre.toLowerCase().includes(busqueda.trim().toLowerCase()),
    )
  })

  // Un servicio desactivado tras agendarse deja de estar en el catálogo: se
  // descarta de la selección en vez de romper el cálculo del total.
  const lineasServicios = seleccion.flatMap((s) => {
    const servicio = catalogo.find((x) => x.id === s.servicio_id)
    if (!servicio) return []
    return [
      {
        concepto: servicio.nombre,
        cantidad: s.cantidad,
        subtotal_bs: Number((servicio.precio_bs * s.cantidad).toFixed(2)),
      },
    ]
  })
  // Importe que se le cobra al cliente por cada línea de producto. Arranca en
  // el cálculo del catálogo (precio por ml × dosis), que queda como referencia
  // interna, y quien cobra lo ajusta a lo que la clínica realmente cobra.
  const [ajustes, setAjustes] = useState<Record<string, string>>({})

  function importeDe(linea: LineaCobro): number {
    if (!linea.movimiento_id) return linea.subtotal_bs
    const escrito = ajustes[linea.movimiento_id]
    if (escrito === undefined || escrito.trim() === '') return linea.subtotal_bs
    const n = Number(escrito)
    return Number.isFinite(n) && n >= 0 ? n : linea.subtotal_bs
  }

  const total = Number(
    [
      ...lineasServicios.map((l) => l.subtotal_bs),
      ...atencion.lineasFijas.map(importeDe),
    ].reduce((n, s) => n + s, 0).toFixed(2),
  )

  async function confirmar() {
    setEnviando(true)
    setError(null)
    try {
      // Solo se mandan las líneas realmente tocadas; el resto conserva su
      // cálculo en el servidor.
      const ajustesNumericos: Record<string, number> = {}
      for (const linea of atencion.lineasFijas) {
        if (!linea.movimiento_id) continue
        const escrito = ajustes[linea.movimiento_id]
        if (escrito === undefined || escrito.trim() === '') continue
        ajustesNumericos[linea.movimiento_id] = Number(escrito)
      }

      await registrarCobro(
        { tipo: atencion.tipo, id: atencion.referencia_id },
        metodo,
        usuario!.id,
        seleccion,
        ajustesNumericos,
      )
      onCobrado()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar el cobro')
      setEnviando(false)
    }
  }

  return (
    <Modal title={`Cobrar — ${atencion.paciente_nombre}`} onClose={onClose} widthClassName="max-w-2xl">
      <div className="space-y-4">
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
          {atencion.concepto} · {formatClinicDateTime(atencion.fecha)}
        </p>

        {/* Pestañas de Servicios realizados */}
        <Seccion titulo="Servicios realizados">
          {catalogo.length === 0 ? (
            <p className="text-sm text-slate-400">
              No hay servicios en el catálogo. El administrador puede crearlos en la pantalla de Servicios.
            </p>
          ) : (
            <div className="space-y-3">
              {/* Filtro rápido de búsqueda */}
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar servicio por nombre..."
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-7 text-xs text-slate-800 placeholder-slate-400 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
                {busqueda && (
                  <button
                    type="button"
                    aria-label="Limpiar búsqueda"
                    onClick={() => setBusqueda('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400 hover:text-slate-600"
                  >
                    ×
                  </button>
                )}
              </div>

              {/* Contenedor de pestañas desplegables (Acordeón) */}
              <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                {categoriasAMostrar.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">
                    {busqueda
                      ? 'No se encontraron servicios que coincidan con la búsqueda.'
                      : 'No hay servicios disponibles en esta categoría.'}
                  </div>
                ) : (
                  categoriasAMostrar.map((cat) => {
                    const Icon = CATEGORIA_ICON[cat] || Sparkles
                    const isOpen = !!categoriasAbiertas[cat] || !!busqueda.trim()
                    const countCat = countSelectedInCategory(cat)
                    const serviciosCat = catalogo.filter(
                      (s) =>
                        s.categoria === cat &&
                        (!busqueda.trim() || s.nombre.toLowerCase().includes(busqueda.trim().toLowerCase())),
                    )

                    return (
                      <div
                        key={cat}
                        className="rounded-lg border border-slate-200 bg-white shadow-xs overflow-hidden"
                      >
                        {/* Pestaña / Encabezado desplegable */}
                        <button
                          type="button"
                          onClick={() => toggleCategoria(cat)}
                          className="flex w-full cursor-pointer items-center justify-between gap-2 bg-slate-50/90 px-3 py-2 text-left transition-colors hover:bg-slate-100/90"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {isOpen ? (
                              <ChevronDown size={14} className="text-slate-500 shrink-0" />
                            ) : (
                              <ChevronRight size={14} className="text-slate-400 shrink-0" />
                            )}
                            <Icon size={14} className="text-teal-600 shrink-0" />
                            <span className="truncate text-xs font-bold text-slate-800">
                              {CATEGORIA_LABEL[cat] ?? cat}
                            </span>
                            <span className="text-[10px] font-semibold text-slate-400 shrink-0">
                              ({serviciosCat.length})
                            </span>
                          </div>

                          {countCat > 0 && (
                            <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-bold text-teal-800 shrink-0">
                              {countCat} seleccionado{countCat > 1 ? 's' : ''}
                            </span>
                          )}
                        </button>

                        {/* Lista de servicios desplegados */}
                        {isOpen && (
                          <div className="border-t border-slate-100 p-2 space-y-1.5 bg-white">
                            {serviciosCat.map((s) => {
                              const cantidad = cantidadDe(s.id)
                              return (
                                <div
                                  key={s.id}
                                  className={clsx(
                                    'flex items-center justify-between gap-2 rounded-lg border px-3 py-1.5 transition-colors',
                                    cantidad > 0
                                      ? 'border-teal-300 bg-teal-50/70 ring-1 ring-teal-400/20'
                                      : 'border-slate-100 bg-slate-50/40 hover:border-slate-200 hover:bg-slate-50',
                                  )}
                                >
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-xs font-semibold text-slate-800">{s.nombre}</p>
                                    <p className="text-[11px] font-bold text-teal-700">{formatBs(s.precio_bs)}</p>
                                  </div>

                                  {/* Botones de cantidad */}
                                  <div className="flex shrink-0 items-center gap-1">
                                    <button
                                      type="button"
                                      aria-label={`Quitar ${s.nombre}`}
                                      onClick={() => cambiarCantidad(s.id, -1)}
                                      disabled={cantidad === 0}
                                      className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30"
                                    >
                                      −
                                    </button>
                                    <span className="w-6 text-center text-xs font-bold text-slate-800">{cantidad}</span>
                                    <button
                                      type="button"
                                      aria-label={`Agregar ${s.nombre}`}
                                      onClick={() => cambiarCantidad(s.id, 1)}
                                      className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-teal-300 bg-white text-xs font-bold text-teal-700 hover:bg-teal-50"
                                    >
                                      +
                                    </button>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )}
        </Seccion>

        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="border-b border-slate-200 pb-2 text-left text-[10px] font-bold uppercase tracking-wide text-slate-500">
                Concepto
              </th>
              <th className="border-b border-slate-200 pb-2 text-right text-[10px] font-bold uppercase tracking-wide text-slate-500">
                Cant.
              </th>
              <th className="border-b border-slate-200 pb-2 text-right text-[10px] font-bold uppercase tracking-wide text-slate-500">
                Subtotal
              </th>
            </tr>
          </thead>
          <tbody>
            {lineasServicios.map((l, i) => (
              <tr key={`serv-${i}`}>
                <td className="py-1.5 text-slate-800">{l.concepto}</td>
                <td className="py-1.5 text-right text-slate-600">{l.cantidad}</td>
                <td className="py-1.5 text-right text-slate-800">{formatBs(l.subtotal_bs)}</td>
              </tr>
            ))}
            {/* Las líneas de producto llevan el importe editable: el cálculo por
                unidad de medida queda debajo como referencia interna, y es lo
                único que el cliente NO ve. */}
            {atencion.lineasFijas.map((l, i) => (
              <tr key={`fija-${i}`}>
                <td className="py-1.5 text-slate-800">
                  {l.concepto}
                  {l.movimiento_id && (
                    <span className="block text-[11px] text-slate-400">
                      Referencia: {l.cantidad} × {formatBs(l.precio_unitario_bs)} = {formatBs(l.subtotal_bs)}
                    </span>
                  )}
                </td>
                <td className="py-1.5 text-right text-slate-600">{l.cantidad}</td>
                <td className="py-1.5 text-right text-slate-800">
                  {l.movimiento_id ? (
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      className="w-24 text-right"
                      value={ajustes[l.movimiento_id] ?? String(l.subtotal_bs)}
                      onChange={(e) =>
                        setAjustes((prev) => ({ ...prev, [l.movimiento_id!]: e.target.value }))
                      }
                    />
                  ) : (
                    formatBs(l.subtotal_bs)
                  )}
                </td>
              </tr>
            ))}
            {lineasServicios.length === 0 && atencion.lineasFijas.length === 0 && (
              <tr>
                <td className="py-3 text-sm text-slate-400" colSpan={3}>
                  Selecciona al menos un servicio para cobrar.
                </td>
              </tr>
            )}
            <tr>
              <td className="border-t border-slate-300 pt-2 font-bold text-slate-900" colSpan={2}>
                Total
              </td>
              <td className="border-t border-slate-300 pt-2 text-right font-display text-lg font-black text-slate-900">
                {formatBs(total)}
              </td>
            </tr>
          </tbody>
        </table>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Método de pago</p>
          <div className="grid grid-cols-2 gap-3">
            {(['efectivo', 'qr'] as MetodoPago[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMetodo(m)}
                className={
                  metodo === m
                    ? 'flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-teal-600 bg-teal-50 px-4 py-3 text-sm font-bold text-teal-800'
                    : 'flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50'
                }
              >
                {m === 'efectivo' ? <Banknote size={16} /> : <QrCode size={16} />}
                {METODO_LABEL[m]}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-rose-600">{error}</p>}

        <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="success" onClick={confirmar} disabled={enviando || total <= 0}>
            {enviando ? 'Registrando…' : `Cobrar ${formatBs(total)}`}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function CerrarTurnoModal({
  turno,
  resumen,
  onClose,
  onCerrado,
}: {
  turno: TurnoCaja
  resumen: ResumenTurno
  onClose: () => void
  onCerrado: () => void
}) {
  const [declarado, setDeclarado] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const contado = Number(declarado)
  const hayValor = declarado.trim() !== '' && Number.isFinite(contado)
  const diferencia = hayValor ? Number((contado - resumen.esperado_en_caja_bs).toFixed(2)) : null

  async function confirmar() {
    setEnviando(true)
    setError(null)
    try {
      await cerrarTurno(turno.id, contado)
      onCerrado()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cerrar la caja')
      setEnviando(false)
    }
  }

  return (
    <Modal title="Cerrar turno de caja" onClose={onClose}>
      <div className="space-y-4">
        <dl className="space-y-1.5 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-slate-500">Saldo inicial</dt>
            <dd className="font-semibold text-slate-800">{formatBs(turno.saldo_inicial_bs)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">Cobros en efectivo</dt>
            <dd className="font-semibold text-slate-800">{formatBs(resumen.efectivo_bs)}</dd>
          </div>
          <div className="flex justify-between border-t border-slate-300 pt-1.5">
            <dt className="font-bold text-slate-700">Esperado en caja</dt>
            <dd className="font-display font-black text-slate-900">{formatBs(resumen.esperado_en_caja_bs)}</dd>
          </div>
          <p className="pt-1 text-xs text-slate-500">
            Los {formatBs(resumen.qr_bs)} cobrados por QR no forman parte del efectivo.
          </p>
        </dl>

        <FieldGroup label="Efectivo contado (Bs.)">
          <Input
            type="number"
            min="0"
            step="0.01"
            value={declarado}
            onChange={(e) => setDeclarado(e.target.value)}
            placeholder="Cuenta el dinero en caja"
          />
        </FieldGroup>

        {diferencia !== null && (
          <p
            className={
              diferencia === 0
                ? 'rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700'
                : 'rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800'
            }
          >
            {diferencia === 0
              ? 'La caja cuadra exactamente.'
              : diferencia > 0
                ? `Sobran ${formatBs(diferencia)} respecto a lo esperado.`
                : `Faltan ${formatBs(Math.abs(diferencia))} respecto a lo esperado.`}
          </p>
        )}

        {error && <p className="text-sm text-rose-600">{error}</p>}

        <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="success" onClick={confirmar} disabled={enviando || !hayValor}>
            {enviando ? 'Cerrando…' : 'Cerrar turno'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function VentaMedicamentosModal({
  sucursalId,
  onClose,
  onVentaCompletada,
}: {
  sucursalId: string
  onClose: () => void
  onVentaCompletada: () => void
}) {
  const { usuario } = useAuth()
  // Un producto dado de baja no se vende, aunque siga en los recibos antiguos.
  const productosSucursal = useTable('productos').filter((p) => p.sucursal_id === sucursalId && p.activo)
  const [clienteNombre, setClienteNombre] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [metodo, setMetodo] = useState<MetodoPago>('efectivo')
  const [items, setItems] = useState<Array<{ productoId: string; cantidad: number }>>([])
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cantidadDe = (id: string) => items.find((it) => it.productoId === id)?.cantidad ?? 0

  function cambiarCantidad(id: string, delta: number, maxStock: number) {
    setItems((prev) => {
      const actual = prev.find((it) => it.productoId === id)
      const actualCantidad = actual?.cantidad ?? 0
      const nueva = actualCantidad + delta
      if (nueva <= 0) return prev.filter((it) => it.productoId !== id)
      if (nueva > maxStock) return prev // no permitir superar stock disponible
      if (actual) return prev.map((it) => (it.productoId === id ? { ...it, cantidad: nueva } : it))
      return [...prev, { productoId: id, cantidad: nueva }]
    })
  }

  const productosFiltrados = productosSucursal.filter((p) => {
    if (!busqueda.trim()) return true
    const q = busqueda.trim().toLowerCase()
    return p.nombre.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)
  })

  // Igual que al cobrar una atención: el cálculo del catálogo es la referencia
  // interna y quien vende fija el importe que se le cobra al cliente.
  const [ajustes, setAjustes] = useState<Record<string, string>>({})

  const lineasVenta = items.flatMap((it) => {
    const prod = productosSucursal.find((p) => p.id === it.productoId)
    if (!prod) return []
    const referencia = Number((prod.precio_bs * it.cantidad).toFixed(2))
    const escrito = ajustes[it.productoId]
    const ajustado = escrito !== undefined && escrito.trim() !== '' ? Number(escrito) : NaN
    return [
      {
        productoId: it.productoId,
        concepto: prod.nombre,
        cantidad: it.cantidad,
        precio_unitario_bs: prod.precio_bs,
        referencia_bs: referencia,
        subtotal_bs: Number.isFinite(ajustado) && ajustado >= 0 ? ajustado : referencia,
      },
    ]
  })

  const total = Number(lineasVenta.reduce((n, l) => n + l.subtotal_bs, 0).toFixed(2))

  async function confirmarVenta() {
    if (items.length === 0) {
      setError('Selecciona al menos un medicamento o producto para vender')
      return
    }
    setEnviando(true)
    setError(null)
    try {
      await registrarVentaDirecta({
        sucursalId,
        usuarioId: usuario!.id,
        clienteNombre: clienteNombre.trim() || undefined,
        // El importe solo viaja si se tocó; si no, el servidor cobra su cálculo.
        items: items.map((it) => {
          const escrito = ajustes[it.productoId]
          if (escrito === undefined || escrito.trim() === '') return it
          return { ...it, monto_bs: Number(escrito) }
        }),
        metodoPago: metodo,
      })
      onVentaCompletada()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar la venta')
      setEnviando(false)
    }
  }

  return (
    <Modal title="Venta de medicamentos e inventario" onClose={onClose} widthClassName="max-w-2xl">
      <div className="space-y-4">
        {/* Nombre del cliente */}
        <FieldGroup label="Nombre del cliente / comprador (opcional)">
          <Input
            value={clienteNombre}
            onChange={(e) => setClienteNombre(e.target.value)}
            placeholder="Ej. Juan Pérez (Venta mostrador)"
          />
        </FieldGroup>

        {/* Buscador de medicamentos */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Medicamentos disponibles</p>
            <span className="text-xs text-slate-400">{productosSucursal.length} productos en sucursal</span>
          </div>

          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por nombre o código SKU..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-7 text-xs text-slate-800 placeholder-slate-400 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
            {busqueda && (
              <button
                type="button"
                aria-label="Limpiar búsqueda"
                onClick={() => setBusqueda('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400 hover:text-slate-600"
              >
                ×
              </button>
            )}
          </div>

          {/* Lista de productos de inventario */}
          <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
            {productosFiltrados.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">
                {busqueda
                  ? 'No se encontraron medicamentos con ese criterio.'
                  : 'No hay productos registrados en el inventario de esta sucursal.'}
              </div>
            ) : (
              <ul className="space-y-1.5">
                {productosFiltrados.map((p) => {
                  const cantidad = cantidadDe(p.id)
                  const sinStock = p.stock_actual <= 0
                  return (
                    <li
                      key={p.id}
                      className={clsx(
                        'flex items-center justify-between gap-2 rounded-lg border px-3 py-2 transition-colors',
                        cantidad > 0
                          ? 'border-teal-400 bg-teal-50/70 shadow-xs ring-1 ring-teal-400/20'
                          : sinStock
                            ? 'border-slate-100 bg-slate-50 opacity-60'
                            : 'border-slate-200 bg-white hover:border-slate-300',
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-sm font-semibold text-slate-800">{p.nombre}</span>
                          <span className="rounded-sm bg-slate-100 px-1.5 py-0.5 font-mono text-[9px] font-bold text-slate-500">
                            {p.sku}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs font-bold text-teal-700">{formatBs(p.precio_bs)}</span>
                          <span className="text-[10px] text-slate-400">·</span>
                          <span
                            className={clsx(
                              'text-[10px] font-semibold',
                              sinStock
                                ? 'text-rose-600 font-bold'
                                : p.stock_actual <= p.stock_minimo
                                  ? 'text-amber-600'
                                  : 'text-slate-500',
                            )}
                          >
                            {sinStock ? 'Sin stock (0)' : `Stock: ${p.stock_actual} disp.`}
                          </span>
                        </div>
                      </div>

                      {/* Stepper de cantidad */}
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          aria-label={`Quitar ${p.nombre}`}
                          onClick={() => cambiarCantidad(p.id, -1, p.stock_actual)}
                          disabled={cantidad === 0}
                          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-slate-200 bg-white text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30"
                        >
                          −
                        </button>
                        <span className="w-7 text-center text-sm font-bold text-slate-800">{cantidad}</span>
                        <button
                          type="button"
                          aria-label={`Agregar ${p.nombre}`}
                          onClick={() => cambiarCantidad(p.id, 1, p.stock_actual)}
                          disabled={sinStock || cantidad >= p.stock_actual}
                          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-teal-300 bg-white text-sm font-bold text-teal-700 hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-30"
                        >
                          +
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Tabla resumen de lo que se cobrará */}
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="border-b border-slate-200 pb-2 text-left text-[10px] font-bold uppercase tracking-wide text-slate-500">
                Medicamento / Producto
              </th>
              <th className="border-b border-slate-200 pb-2 text-right text-[10px] font-bold uppercase tracking-wide text-slate-500">
                Cant.
              </th>
              <th className="border-b border-slate-200 pb-2 text-right text-[10px] font-bold uppercase tracking-wide text-slate-500">
                Subtotal
              </th>
            </tr>
          </thead>
          <tbody>
            {lineasVenta.map((l, i) => (
              <tr key={i}>
                <td className="py-1.5 text-slate-800">
                  {l.concepto}
                  <span className="block text-[11px] text-slate-400">
                    Referencia: {l.cantidad} × {formatBs(l.precio_unitario_bs)} = {formatBs(l.referencia_bs)}
                  </span>
                </td>
                <td className="py-1.5 text-right text-slate-600">{l.cantidad}</td>
                <td className="py-1.5 text-right text-slate-800">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    className="w-24 text-right"
                    value={ajustes[l.productoId] ?? String(l.referencia_bs)}
                    onChange={(e) => setAjustes((prev) => ({ ...prev, [l.productoId]: e.target.value }))}
                  />
                </td>
              </tr>
            ))}
            {lineasVenta.length === 0 && (
              <tr>
                <td className="py-3 text-sm text-slate-400" colSpan={3}>
                  Selecciona al menos un medicamento para cobrar.
                </td>
              </tr>
            )}
            <tr>
              <td className="border-t border-slate-300 pt-2 font-bold text-slate-900" colSpan={2}>
                Total
              </td>
              <td className="border-t border-slate-300 pt-2 text-right font-display text-lg font-black text-slate-900">
                {formatBs(total)}
              </td>
            </tr>
          </tbody>
        </table>

        {/* Método de pago */}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Método de pago</p>
          <div className="grid grid-cols-2 gap-3">
            {(['efectivo', 'qr'] as MetodoPago[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMetodo(m)}
                className={
                  metodo === m
                    ? 'flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-teal-600 bg-teal-50 px-4 py-3 text-sm font-bold text-teal-800'
                    : 'flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50'
                }
              >
                {m === 'efectivo' ? <Banknote size={16} /> : <QrCode size={16} />}
                {METODO_LABEL[m]}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-rose-600">{error}</p>}

        <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="success" onClick={confirmarVenta} disabled={enviando || total <= 0}>
            {enviando ? 'Procesando…' : `Cobrar ${formatBs(total)}`}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
