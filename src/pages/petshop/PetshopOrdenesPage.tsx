import { useEffect, useState } from 'react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Input } from '../../components/ui/Field'
import {
  Receipt,
  Search,
  Printer,
  RotateCcw,
  RefreshCw,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { formatBs } from '../../lib/currency'
import { formatClinicDateTime } from '../../lib/datetime'
import { listProductosPetshop } from '../../services/petshop'
import type { Producto } from '../../types/database'
import { TicketVentaModal } from '../../features/petshop/TicketVentaModal'
import { DevolucionModal } from '../../features/petshop/DevolucionModal'

export function PetshopOrdenesPage() {
  const { sucursalActivaId } = useAuth()
  const [busqueda, setBusqueda] = useState('')
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10))

  const [ventas, setVentas] = useState<any[]>([])
  const [productos, setProductos] = useState<Producto[]>([])
  const [cargando, setCargando] = useState(true)

  const [ticketCobroId, setTicketCobroId] = useState<string | null>(null)
  const [modalDevolucionCobroId, setModalDevolucionCobroId] = useState<string | null>(null)

  async function recargar() {
    setCargando(true)
    try {
      let query = supabase
        .from('cobros')
        .select(`
          *,
          cliente:clientes(*),
          lineas:cobro_lineas(*)
        `)
        .order('created_at', { ascending: false })

      if (sucursalActivaId) query = query.eq('sucursal_id', sucursalActivaId)
      if (fecha) {
        query = query
          .gte('created_at', `${fecha}T00:00:00`)
          .lte('created_at', `${fecha}T23:59:59`)
      }

      const [{ data }, prods] = await Promise.all([
        query,
        listProductosPetshop({ sucursalId: sucursalActivaId || undefined, soloActivos: false }),
      ])

      setVentas(data || [])
      setProductos(prods)
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    recargar()
  }, [sucursalActivaId, fecha])

  const ventasFiltradas = ventas.filter((v) => {
    if (!busqueda.trim()) return true
    const term = busqueda.toLowerCase()
    return (
      v.numero_recibo?.toString().includes(term) ||
      v.cliente?.nombre?.toLowerCase().includes(term) ||
      (v.lineas || []).some((l: any) => l.concepto?.toLowerCase().includes(term))
    )
  })

  return (
    <div className="space-y-6">
      {/* Cabecera Principal */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900 flex items-center gap-2">
            <Receipt className="text-teal-700" size={24} />
            <span>Historial de Ventas y Órdenes</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Registro comercial de tickets emitidos, reimpresión y trámite de devoluciones.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="w-40"
          />
          <Button type="button" variant="outline" size="sm" onClick={() => recargar()}>
            <RefreshCw size={14} className={cargando ? 'animate-spin' : ''} />
          </Button>
        </div>
      </div>

      {/* Buscador */}
      <Card className="p-4 border-slate-200">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por número de recibo, cliente o producto..."
            className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-300 bg-white focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
          />
        </div>
      </Card>

      {/* Tabla de Ventas */}
      {cargando ? (
        <p className="text-center py-16 text-xs text-slate-500">Cargando ventas...</p>
      ) : ventasFiltradas.length === 0 ? (
        <Card className="p-12 text-center border-slate-200">
          <Receipt size={36} className="mx-auto text-slate-300 mb-2" />
          <p className="font-bold text-sm text-slate-700">No hay ventas registradas en esta fecha</p>
          <p className="text-xs text-slate-400 mt-1">Usa el Punto de Venta para emitir nuevos tickets.</p>
        </Card>
      ) : (
        <Card className="p-0 overflow-hidden border-slate-200">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-4 py-3">Recibo</th>
                  <th className="px-4 py-3">Cliente / Dueño</th>
                  <th className="px-4 py-3">Productos Vendidos</th>
                  <th className="px-4 py-3">Método</th>
                  <th className="px-4 py-3">Fecha y Hora</th>
                  <th className="px-4 py-3 text-right">Total (Bs.)</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ventasFiltradas.map((v) => (
                  <tr key={v.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-mono font-bold text-slate-900">
                      #{v.numero_recibo}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-bold text-slate-900">
                        {v.cliente?.nombre || 'Cliente Ocasional'}
                      </p>
                      {v.cliente?.ci && (
                        <p className="text-[11px] text-slate-400">CI: {v.cliente.ci}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      <div className="space-y-0.5 max-w-xs">
                        {(v.lineas || []).map((l: any, i: number) => (
                          <p key={i} className="truncate text-[11px]">
                            • {l.concepto} ({l.cantidad} unid.)
                          </p>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 capitalize font-semibold text-slate-700">
                      <Badge tone="slate">{v.metodo_pago}</Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {formatClinicDateTime(v.created_at)}
                    </td>
                    <td className="px-4 py-3 text-right font-black text-teal-800 text-sm">
                      {formatBs(v.total_bs)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setTicketCobroId(v.id)}
                        >
                          <Printer size={12} className="mr-1" />
                          <span>Ticket</span>
                        </Button>

                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setModalDevolucionCobroId(v.id)}
                          className="text-amber-700 hover:text-amber-900"
                        >
                          <RotateCcw size={12} className="mr-1" />
                          <span>Devolución</span>
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Modales */}
      {ticketCobroId && (
        <TicketVentaModal
          cobroId={ticketCobroId}
          onClose={() => setTicketCobroId(null)}
        />
      )}

      {modalDevolucionCobroId && (
        <DevolucionModal
          sucursalId={sucursalActivaId || ''}
          productos={productos}
          cobroId={modalDevolucionCobroId}
          onClose={() => setModalDevolucionCobroId(null)}
          onProcessed={() => recargar()}
        />
      )}
    </div>
  )
}
