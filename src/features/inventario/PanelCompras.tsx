import { useEffect, useState, useCallback } from 'react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Select } from '../../components/ui/Field'
import {
  Truck,
  Plus,
  PackageCheck,
  RefreshCw,
} from 'lucide-react'
import { useAuth } from '../../context/useAuth'
import { formatBs } from '../../lib/currency'
import { formatClinicDate } from '../../lib/datetime'
import { listOrdenesCompra, listProveedores } from '../../services/compras'
import { listProductosPetshop } from '../../services/petshop'
import type { OrdenCompraConDetalle } from '../../types/views'
import type { Producto, Proveedor, EstadoOrdenCompra } from '../../types/database'
import { NuevaCompraModal } from '../../features/petshop/NuevaCompraModal'
import { RecepcionCompraModal } from '../../features/petshop/RecepcionCompraModal'

const ESTADO_COMPRA_LABEL: Record<EstadoOrdenCompra, string> = {
  borrador: 'Borrador',
  solicitada: 'Solicitada / En Camino',
  recibida: 'Recibida e Ingresada',
  cancelada: 'Cancelada',
}

/**
 * Órdenes de compra y recepción de mercadería, compartidas con la clínica.
 *
 * Recibir una orden es lo que **carga los lotes con su vencimiento**
 * (`RecepcionCompraModal`), así que sin esta pantalla el control de
 * vencimientos de [PanelLotes](./PanelLotes.tsx) habría que llenarlo a mano.
 *
 * Ver [PanelLotes](./PanelLotes.tsx) para el porqué de `conCabecera`.
 */
export function PanelCompras({ conCabecera = true }: { conCabecera?: boolean }) {
  const { sucursalActivaId } = useAuth()
  const [estadoFiltro, setEstadoFiltro] = useState<EstadoOrdenCompra | ''>('')
  const [proveedorFiltro, setProveedorFiltro] = useState<string>('')

  const [ordenes, setOrdenes] = useState<OrdenCompraConDetalle[]>([])
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [productos, setProductos] = useState<Producto[]>([])
  const [cargando, setCargando] = useState(true)

  const [modalNueva, setModalNueva] = useState(false)
  const [ordenARecibir, setOrdenARecibir] = useState<OrdenCompraConDetalle | null>(null)

  const recargar = useCallback(async () => {
    setCargando(true)
    try {
      const [ords, provs, prods] = await Promise.all([
        listOrdenesCompra({
          sucursalId: sucursalActivaId || undefined,
          proveedorId: proveedorFiltro || undefined,
          estado: estadoFiltro || undefined,
        }),
        listProveedores(),
        listProductosPetshop({ sucursalId: sucursalActivaId || undefined, soloActivos: true }),
      ])
      setOrdenes(ords)
      setProveedores(provs)
      setProductos(prods)
    } finally {
      setCargando(false)
    }
  }, [sucursalActivaId, estadoFiltro, proveedorFiltro])

  useEffect(() => {
    recargar()
  }, [recargar])

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Solo el título; los botones se quedan siempre. Ver PanelLotes. */}
        {conCabecera ? (
          <div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900 flex items-center gap-2">
              <Truck className="text-teal-700" size={24} />
              <span>Órdenes de Compra y Recepción</span>
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Abastecimiento de mercadería con proveedores, recepción de pedidos y carga de lotes.
            </p>
          </div>
        ) : (
          <div />
        )}

        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => recargar()}>
            <RefreshCw size={14} className={cargando ? 'animate-spin' : ''} />
          </Button>
          <Button type="button" variant="primary" size="sm" onClick={() => setModalNueva(true)}>
            <Plus size={15} className="mr-1.5" />
            <span>Nueva Compra</span>
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <Card className="p-4 border-slate-200">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-bold uppercase text-slate-400">Filtrar por Proveedor</label>
            <Select value={proveedorFiltro} onChange={(e) => setProveedorFiltro(e.target.value)}>
              <option value="">Todos los proveedores</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.empresa}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase text-slate-400">Filtrar por Estado</label>
            <Select value={estadoFiltro} onChange={(e) => setEstadoFiltro(e.target.value as any)}>
              <option value="">Todos los estados</option>
              {Object.entries(ESTADO_COMPRA_LABEL).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </Card>

      {/* Listado de Órdenes */}
      {cargando ? (
        <p className="text-center py-16 text-xs text-slate-500">Cargando órdenes de compra...</p>
      ) : ordenes.length === 0 ? (
        <Card className="p-12 text-center border-slate-200">
          <Truck size={36} className="mx-auto text-slate-300 mb-2" />
          <p className="font-bold text-sm text-slate-700">No hay órdenes de compra registradas</p>
          <p className="text-xs text-slate-400 mt-1">Crea una orden para reabastecer productos de Pet Shop.</p>
        </Card>
      ) : (
        <Card className="p-0 overflow-hidden border-slate-200">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-4 py-3">N° Orden</th>
                  <th className="px-4 py-3">Proveedor</th>
                  <th className="px-4 py-3">Fecha Solicitud</th>
                  <th className="px-4 py-3">Artículos</th>
                  <th className="px-4 py-3 text-right">Total (Bs.)</th>
                  <th className="px-4 py-3 text-center">Estado</th>
                  <th className="px-4 py-3 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ordenes.map((ord) => (
                  <tr key={ord.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-mono font-bold text-slate-900">
                      #{ord.numero_orden}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-bold text-slate-900">{ord.proveedor?.empresa}</p>
                      <p className="text-[11px] text-slate-400">Contacto: {ord.proveedor?.contacto || '—'}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {formatClinicDate(ord.fecha_solicitud || ord.created_at)}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {(ord.detalles || []).length} productos
                    </td>
                    <td className="px-4 py-3 text-right font-black text-teal-800 text-sm">
                      {formatBs(ord.total_bs)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge
                        tone={
                          ord.estado === 'recibida'
                            ? 'emerald'
                            : ord.estado === 'solicitada'
                            ? 'indigo'
                            : ord.estado === 'cancelada'
                            ? 'rose'
                            : 'amber'
                        }
                      >
                        {ESTADO_COMPRA_LABEL[ord.estado]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {ord.estado !== 'recibida' && ord.estado !== 'cancelada' ? (
                        <Button
                          type="button"
                          variant="primary"
                          size="sm"
                          onClick={() => setOrdenARecibir(ord)}
                        >
                          <PackageCheck size={13} className="mr-1" />
                          <span>Recibir Mercadería</span>
                        </Button>
                      ) : (
                        <span className="text-[11px] text-slate-400 italic">Completada</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Modales */}
      {modalNueva && (
        <NuevaCompraModal
          sucursalId={sucursalActivaId || ''}
          proveedores={proveedores}
          productos={productos}
          onClose={() => setModalNueva(false)}
          onCreated={() => recargar()}
        />
      )}

      {ordenARecibir && (
        <RecepcionCompraModal
          orden={ordenARecibir}
          sucursalId={sucursalActivaId || ''}
          onClose={() => setOrdenARecibir(null)}
          onReceived={() => recargar()}
        />
      )}
    </div>
  )
}
