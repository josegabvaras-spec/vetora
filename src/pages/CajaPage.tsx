import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Banknote, Lock, Printer, QrCode, Wallet } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { Seccion } from '../components/ui/Seccion'
import { FieldGroup, Input } from '../components/ui/Field'
import { useAuth } from '../context/AuthContext'
import { useTable } from '../mocks/useDb'
import {
  abrirTurno,
  cerrarTurno,
  getTurnoAbierto,
  listAtencionesPorCobrar,
  listCobrosDelTurno,
  registrarCobro,
  resumenTurno,
  type ResumenTurno,
  type ServicioSeleccionado,
} from '../services/caja'
import { CATEGORIA_LABEL, CATEGORIAS } from '../services/servicios'
import { formatBs } from '../lib/currency'
import { formatClinicDateTime } from '../lib/datetime'
import type { MetodoPago, TurnoCaja } from '../types/database'
import type { AtencionPorCobrar, CobroConDetalle } from '../types/views'

const METODO_LABEL: Record<MetodoPago, string> = { efectivo: 'Efectivo', qr: 'QR' }

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
  useTable('cobros')
  useTable('turnos_caja')

  const sucursalId = sucursalActivaId || usuario?.sucursal_id || sucursales[0]?.id || ''

  const [turno, setTurno] = useState<TurnoCaja | undefined>(undefined)
  const [resumen, setResumen] = useState<ResumenTurno | null>(null)
  const [pendientes, setPendientes] = useState<AtencionPorCobrar[]>([])
  const [cobros, setCobros] = useState<CobroConDetalle[]>([])

  const [saldoInicial, setSaldoInicial] = useState('0')
  const [abriendo, setAbriendo] = useState(false)
  const [cobrando, setCobrando] = useState<AtencionPorCobrar | null>(null)
  const [cerrando, setCerrando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const recargar = useCallback(async () => {
    if (!sucursalId) return
    const abierto = getTurnoAbierto(sucursalId)
    setTurno(abierto)
    setResumen(abierto ? resumenTurno(abierto.id) : null)
    setPendientes(await listAtencionesPorCobrar(sucursalId))
    setCobros(abierto ? await listCobrosDelTurno(abierto.id) : [])
  }, [sucursalId])

  useEffect(() => {
    recargar()
  }, [recargar])

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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold text-slate-900">Caja</h1>
          <p className="mt-0.5 text-xs font-semibold uppercase tracking-wider text-slate-400">{sucursalNombre}</p>
        </div>
        {turno && (
          <Button variant="secondary" className="w-full sm:w-auto" onClick={() => setCerrando(true)}>
            <Lock size={15} /> Cerrar turno
          </Button>
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
  const total = Number(
    [...lineasServicios, ...atencion.lineasFijas].reduce((n, l) => n + l.subtotal_bs, 0).toFixed(2),
  )

  async function confirmar() {
    setEnviando(true)
    setError(null)
    try {
      await registrarCobro({ tipo: atencion.tipo, id: atencion.referencia_id }, metodo, usuario!.id, seleccion)
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
        {/* Catálogo: el administrador define los precios, aquí se escoge lo realizado */}
        <Seccion titulo="Servicios realizados">
          {catalogo.length === 0 ? (
            <p className="text-sm text-slate-400">
              No hay servicios en el catálogo. El administrador puede crearlos en la pantalla de Servicios.
            </p>
          ) : (
            <div className="max-h-64 space-y-3 overflow-y-auto pr-1">
              {CATEGORIAS.filter((cat) => catalogo.some((s) => s.categoria === cat)).map((cat) => (
                <div key={cat}>
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    {CATEGORIA_LABEL[cat]}
                  </p>
                  <ul className="space-y-1">
                    {catalogo
                      .filter((s) => s.categoria === cat)
                      .map((s) => {
                        const cantidad = cantidadDe(s.id)
                        return (
                          <li
                            key={s.id}
                            className={
                              cantidad > 0
                                ? 'flex items-center justify-between gap-2 rounded-lg border border-teal-300 bg-teal-50 px-3 py-1.5'
                                : 'flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5'
                            }
                          >
                            <span className="min-w-0 flex-1 truncate text-sm text-slate-800">{s.nombre}</span>
                            <span className="shrink-0 text-sm font-semibold text-slate-600">
                              {formatBs(s.precio_bs)}
                            </span>
                            {/* Botones de 36 px: se pulsan con el pulgar sin ampliar */}
                            <div className="flex shrink-0 items-center gap-1">
                              <button
                                type="button"
                                aria-label={`Quitar ${s.nombre}`}
                                onClick={() => cambiarCantidad(s.id, -1)}
                                disabled={cantidad === 0}
                                className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-md border border-slate-300 bg-white text-slate-600 disabled:opacity-40"
                              >
                                −
                              </button>
                              <span className="w-6 text-center text-sm font-bold text-slate-800">{cantidad}</span>
                              <button
                                type="button"
                                aria-label={`Agregar ${s.nombre}`}
                                onClick={() => cambiarCantidad(s.id, 1)}
                                className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-md border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                              >
                                +
                              </button>
                            </div>
                          </li>
                        )
                      })}
                  </ul>
                </div>
              ))}
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
            {[...lineasServicios, ...atencion.lineasFijas].map((l, i) => (
              <tr key={i}>
                <td className="py-1.5 text-slate-800">{l.concepto}</td>
                <td className="py-1.5 text-right text-slate-600">{l.cantidad}</td>
                <td className="py-1.5 text-right text-slate-800">{formatBs(l.subtotal_bs)}</td>
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
