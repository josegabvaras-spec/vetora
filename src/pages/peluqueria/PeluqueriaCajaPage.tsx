import { useEffect, useState, useCallback } from 'react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Modal } from '../../components/ui/Modal'
import {
  Wallet,
  CheckCircle2,
  Receipt,
  QrCode,
  DollarSign,
  RefreshCw,
} from 'lucide-react'
import { useAuth } from '../../context/useAuth'
import { formatBs } from '../../lib/currency'
import {
  getTurnoAbierto,
  listAtencionesPorCobrar,
  registrarCobro,
  type ReferenciaAtencion,
} from '../../services/caja'
import type { AtencionPorCobrar } from '../../types/views'
import type { MetodoPago, TurnoCaja } from '../../types/database'
import { Link } from 'react-router-dom'

export function PeluqueriaCajaPage() {
  const { sucursalActivaId, usuario } = useAuth()
  const [atenciones, setAtenciones] = useState<AtencionPorCobrar[]>([])
  const [turno, setTurno] = useState<TurnoCaja | undefined>(undefined)
  const [cargando, setCargando] = useState(true)

  const [atencionACobrar, setAtencionACobrar] = useState<AtencionPorCobrar | null>(null)
  const [metodoPago, setMetodoPago] = useState<MetodoPago>('efectivo')
  const [cobrando, setCobrando] = useState(false)
  const [errorCobro, setErrorCobro] = useState<string | null>(null)
  const [ultimoCobroId, setUltimoCobroId] = useState<string | null>(null)

  const recargar = useCallback(async () => {
    setCargando(true)
    try {
      const [tur, atens] = await Promise.all([
        sucursalActivaId ? getTurnoAbierto(sucursalActivaId) : Promise.resolve(undefined),
        listAtencionesPorCobrar(sucursalActivaId || undefined),
      ])
      setTurno(tur)
      // Filtrar solo las de peluquería para esta vista dedicada
      setAtenciones(atens.filter((a) => a.tipo === 'peluqueria'))
    } finally {
      setCargando(false)
    }
  }, [sucursalActivaId])

  useEffect(() => {
    recargar()
  }, [recargar])

  async function handleConfirmarCobro(e: React.FormEvent) {
    e.preventDefault()
    if (!atencionACobrar || !usuario?.id) return

    setCobrando(true)
    setErrorCobro(null)

    try {
      const ref: ReferenciaAtencion = {
        tipo: 'peluqueria',
        id: atencionACobrar.referencia_id,
      }

      const cobro = await registrarCobro(ref, metodoPago, usuario.id)
      setUltimoCobroId(cobro.id)
      setAtencionACobrar(null)
      recargar()
    } catch (err: any) {
      setErrorCobro(err.message || 'Error al procesar el cobro')
    } finally {
      setCobrando(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Cabecera Principal */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">
            Caja y Cobro de Peluquería
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Cobro rápido de órdenes de servicio terminadas, sincronizado con la caja general de Vetora.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {turno ? (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-1.5 text-xs font-bold text-emerald-800">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Caja Abierta (Turno #{turno.id.slice(0, 8)})</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-1.5 text-xs font-bold text-amber-800">
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              <span>Caja Cerrada (Abre caja en el módulo de Caja)</span>
            </div>
          )}
          <Button type="button" variant="outline" size="sm" onClick={recargar} disabled={cargando}>
            <RefreshCw size={15} className={cargando ? 'animate-spin' : ''} />
          </Button>
        </div>
      </div>

      {/* Alerta de Cobro Realizado */}
      {ultimoCobroId && (
        <div className="flex items-center justify-between rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-xs text-emerald-900">
          <div className="flex items-center gap-3">
            <CheckCircle2 size={20} className="text-emerald-600 shrink-0" />
            <div>
              <p className="font-bold text-sm">¡Cobro registrado exitosamente!</p>
              <p className="text-emerald-700">Se generó el comprobante y el ingreso en el turno de caja.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link to={`/recibos/${ultimoCobroId}`} target="_blank">
              <Button type="button" variant="outline" size="sm" className="bg-white">
                <Receipt size={14} className="mr-1" />
                <span>Ver Recibo</span>
              </Button>
            </Link>
            <Button type="button" variant="ghost" size="sm" onClick={() => setUltimoCobroId(null)}>
              Cerrar
            </Button>
          </div>
        </div>
      )}

      {/* Lista de Servicios por Cobrar */}
      <Card className="p-0 overflow-hidden border-slate-200">
        <div className="border-b border-slate-200 px-5 py-4 bg-slate-50/60 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-800">
              Servicios Listos para Cobro ({atenciones.length})
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Órdenes de peluquería finalizadas que están listas para facturar en caja.
            </p>
          </div>
        </div>

        {cargando ? (
          <p className="text-center py-12 text-xs text-slate-500">Cargando cuentas por cobrar...</p>
        ) : atenciones.length === 0 ? (
          <div className="text-center py-12 px-4">
            <Wallet size={32} className="mx-auto text-slate-300 mb-2" />
            <p className="text-sm font-semibold text-slate-700">No hay órdenes pendientes de cobro</p>
            <p className="text-xs text-slate-400 mt-1">Al finalizar un servicio de peluquería aparecerá aquí para su cobro.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {atenciones.map((a) => (
              <div
                key={a.referencia_id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 hover:bg-slate-50 transition-colors"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-sm text-slate-900">{a.concepto}</h3>
                    <Badge tone="emerald">Lista para cobrar</Badge>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Mascota: <strong className="text-slate-800">{a.paciente_nombre}</strong> · Dueño: <span className="text-slate-700">{a.cliente_nombre}</span> · Atendió: {a.veterinario_nombre}
                  </p>
                  {a.lineasFijas.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-1 text-[11px] text-slate-500">
                      {a.lineasFijas.map((l, i) => (
                        <span key={i} className="rounded bg-slate-100 px-1.5 py-0.5 font-medium">
                          {l.concepto} ({formatBs(l.subtotal_bs)})
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0">
                  <div className="text-right">
                    <p className="text-lg font-black text-teal-800">{formatBs(a.subtotal_fijo_bs)}</p>
                  </div>

                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    disabled={!turno}
                    onClick={() => setAtencionACobrar(a)}
                  >
                    <Wallet size={14} className="mr-1" />
                    <span>Cobrar</span>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Modal de Cobro */}
      {atencionACobrar && (
        <Modal
          onClose={() => setAtencionACobrar(null)}
          title={`Cobrar · ${atencionACobrar.paciente_nombre}`}
        >
          <form onSubmit={handleConfirmarCobro} className="space-y-4">
            {errorCobro && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
                {errorCobro}
              </div>
            )}

            <div className="rounded-2xl border border-teal-100 bg-teal-50/60 p-4 text-center">
              <p className="text-[10px] font-bold uppercase tracking-wider text-teal-700">Total a Cobrar</p>
              <p className="text-3xl font-black text-teal-900">{formatBs(atencionACobrar.subtotal_fijo_bs)}</p>
              <p className="text-xs text-slate-500 mt-1">
                {atencionACobrar.concepto} · Cliente: {atencionACobrar.cliente_nombre}
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700">Método de Pago</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setMetodoPago('efectivo')}
                  className={`flex flex-col items-center justify-center rounded-2xl border p-4 transition-all ${
                    metodoPago === 'efectivo'
                      ? 'border-teal-600 bg-teal-50/50 text-teal-900 ring-2 ring-teal-600'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <DollarSign size={24} className="mb-1 text-teal-700" />
                  <span className="text-xs font-bold">Efectivo</span>
                </button>

                <button
                  type="button"
                  onClick={() => setMetodoPago('qr')}
                  className={`flex flex-col items-center justify-center rounded-2xl border p-4 transition-all ${
                    metodoPago === 'qr'
                      ? 'border-teal-600 bg-teal-50/50 text-teal-900 ring-2 ring-teal-600'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <QrCode size={24} className="mb-1 text-teal-700" />
                  <span className="text-xs font-bold">Transferencia / QR</span>
                </button>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                onClick={() => setAtencionACobrar(null)}
                disabled={cobrando}
              >
                Cancelar
              </Button>
              <Button type="submit" variant="primary" disabled={cobrando}>
                {cobrando ? 'Procesando cobro...' : `Confirmar Cobro (${formatBs(atencionACobrar.subtotal_fijo_bs)})`}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
