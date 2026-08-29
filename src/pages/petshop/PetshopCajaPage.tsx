import { useEffect, useState, useCallback } from 'react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import {
  Wallet,
  DollarSign,
  QrCode,
  Banknote,
  RefreshCw,
  ShoppingCart,
} from 'lucide-react'
import { useAuth } from '../../context/useAuth'
import { formatBs } from '../../lib/currency'
import { formatClinicDateTime } from '../../lib/datetime'
import { getTurnoAbierto } from '../../services/caja'
import { supabase } from '../../lib/supabase'
import { Link } from 'react-router-dom'
import type { TurnoCaja } from '../../types/database'

export function PetshopCajaPage() {
  const { sucursalActivaId } = useAuth()
  const [turno, setTurno] = useState<TurnoCaja | null>(null)
  const [ventasPetshop, setVentasPetshop] = useState<any[]>([])
  const [cargando, setCargando] = useState(true)

  const recargar = useCallback(async () => {
    setCargando(true)
    try {
      if (sucursalActivaId) {
        const t = await getTurnoAbierto(sucursalActivaId)
        setTurno(t || null)

        if (t) {
          const { data: cobros } = await supabase
            .from('cobros')
            .select(`
              *,
              cliente:clientes(*),
              lineas:cobro_lineas(*)
            `)
            .eq('turno_id', t.id)
            .order('created_at', { ascending: false })

          setVentasPetshop(cobros || [])
        }
      }
    } finally {
      setCargando(false)
    }
  }, [sucursalActivaId])

  useEffect(() => {
    recargar()
  }, [recargar])

  const totalVentasTurno = ventasPetshop.reduce((acc, v) => acc + (Number(v.total_bs) || 0), 0)
  const totalEfectivo = ventasPetshop
    .filter((v) => v.metodo_pago === 'efectivo')
    .reduce((acc, v) => acc + (Number(v.total_bs) || 0), 0)
  const totalQR = ventasPetshop
    .filter((v) => v.metodo_pago === 'qr')
    .reduce((acc, v) => acc + (Number(v.total_bs) || 0), 0)

  return (
    <div className="space-y-6">
      {/* Cabecera Principal */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900 flex items-center gap-2">
            <Wallet className="text-teal-700" size={24} />
            <span>Caja Pet Shop y Flujo de Cobros</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Turno activo, recaudación por método de pago y arqueo sincronizado con la Caja General.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => recargar()}>
            <RefreshCw size={14} className={cargando ? 'animate-spin' : ''} />
          </Button>
          <Link to="/petshop/pos">
            <Button type="button" variant="primary" size="sm">
              <ShoppingCart size={15} className="mr-1.5" />
              <span>Ir al POS</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Estado del Turno */}
      {!turno ? (
        <Card className="p-12 text-center border-slate-200">
          <Wallet size={36} className="mx-auto text-slate-300 mb-2" />
          <p className="font-bold text-sm text-slate-700">No hay un turno de caja abierto</p>
          <p className="text-xs text-slate-400 mt-1">
            Debes abrir un turno en el módulo de Caja para facturar en el POS.
          </p>
          <Link to="/caja" className="inline-block mt-4">
            <Button type="button" variant="primary" size="sm">
              Abrir Turno en Caja General →
            </Button>
          </Link>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Tarjetas de Recaudación del Turno */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="p-4 border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Total Recaudado (Turno)
                </span>
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                  <DollarSign size={16} />
                </div>
              </div>
              <p className="text-2xl font-black text-teal-800">{formatBs(totalVentasTurno)}</p>
              <p className="text-[11px] text-slate-500">
                {ventasPetshop.length} tickets emitidos en este turno
              </p>
            </Card>

            <Card className="p-4 border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Efectivo en Caja
                </span>
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                  <Banknote size={16} />
                </div>
              </div>
              <p className="text-2xl font-black text-emerald-800">{formatBs(totalEfectivo)}</p>
              <p className="text-[11px] text-slate-500">Monto físico a rendir en arqueo</p>
            </Card>

            <Card className="p-4 border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Pagos por QR / Bancario
                </span>
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">
                  <QrCode size={16} />
                </div>
              </div>
              <p className="text-2xl font-black text-indigo-800">{formatBs(totalQR)}</p>
              <p className="text-[11px] text-slate-500">Acreditados directamente en cuenta</p>
            </Card>
          </div>

          {/* Tabla de Cobros del Turno */}
          <Card className="p-5 border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-sm text-slate-900">
                Ventas del Turno Activo (Abierto: {formatClinicDateTime(turno.abierto_at)})
              </h3>
              <Badge tone="emerald">Turno Abierto</Badge>
            </div>

            {ventasPetshop.length === 0 ? (
              <p className="text-center py-8 text-xs text-slate-400">
                Aún no hay cobros en este turno
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    <tr>
                      <th className="px-4 py-2.5">Recibo</th>
                      <th className="px-4 py-2.5">Cliente</th>
                      <th className="px-4 py-2.5">Método</th>
                      <th className="px-4 py-2.5">Hora</th>
                      <th className="px-4 py-2.5 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {ventasPetshop.map((v) => (
                      <tr key={v.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-2.5 font-bold text-slate-900">#{v.numero_recibo}</td>
                        <td className="px-4 py-2.5 text-slate-700">
                          {v.cliente?.nombre || 'Cliente Ocasional'}
                        </td>
                        <td className="px-4 py-2.5 capitalize font-semibold text-slate-700">
                          <Badge tone="slate">{v.metodo_pago}</Badge>
                        </td>
                        <td className="px-4 py-2.5 text-slate-400">
                          {formatClinicDateTime(v.created_at)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-black text-teal-800">
                          {formatBs(v.total_bs)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  )
}
