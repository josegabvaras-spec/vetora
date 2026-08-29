import { useEffect, useState } from 'react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { Printer } from 'lucide-react'
import { getDetalleVenta } from '../../services/pos'
import { formatBs } from '../../lib/currency'
import { formatClinicDateTime } from '../../lib/datetime'

interface TicketVentaModalProps {
  cobroId: string
  onClose: () => void
}

export function TicketVentaModal({ cobroId, onClose }: TicketVentaModalProps) {
  const [venta, setVenta] = useState<any>(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    getDetalleVenta(cobroId)
      .then((data) => setVenta(data))
      .finally(() => setCargando(false))
  }, [cobroId])

  function handleImprimir() {
    window.print()
  }

  return (
    <Modal onClose={onClose} title="Comprobante de Venta · Pet Shop" widthClassName="max-w-md">
      {cargando ? (
        <p className="text-center py-8 text-xs text-slate-500">Cargando comprobante...</p>
      ) : !venta ? (
        <p className="text-center py-8 text-xs text-red-500">No se encontró el comprobante.</p>
      ) : (
        <div className="space-y-4">
          {/* Ticket térmico simulado */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 font-mono text-xs text-slate-800 space-y-3 shadow-inner">
            <div className="text-center space-y-0.5 border-b border-dashed border-slate-300 pb-2">
              <h3 className="font-black text-sm uppercase tracking-wider text-slate-900">VETORA PET SHOP</h3>
              <p className="text-[10px] text-slate-500">Comprobante de Venta Directa</p>
              <p className="text-[10px] font-bold text-slate-700">Recibo N° #{venta.numero_recibo}</p>
              <p className="text-[10px] text-slate-400">{formatClinicDateTime(venta.created_at)}</p>
            </div>

            <div className="text-[11px] space-y-0.5 border-b border-dashed border-slate-300 pb-2">
              <p>
                <span className="text-slate-400">Cliente:</span>{' '}
                <strong>{venta.cliente?.nombre || 'Cliente Ocasional'}</strong>
              </p>
              {venta.cliente?.ci && (
                <p>
                  <span className="text-slate-400">CI/NIT:</span> {venta.cliente.ci}
                </p>
              )}
              <p>
                <span className="text-slate-400">Método de Pago:</span>{' '}
                <span className="capitalize">{venta.metodo_pago}</span>
              </p>
            </div>

            {/* Listado de ítems */}
            <div className="space-y-1.5 border-b border-dashed border-slate-300 pb-2">
              {(venta.lineas || []).map((l: any, i: number) => (
                <div key={i} className="flex justify-between items-start text-[11px]">
                  <div className="min-w-0 flex-1 pr-2">
                    <p className="truncate font-semibold text-slate-800">{l.concepto}</p>
                    <p className="text-[10px] text-slate-400">
                      {l.cantidad} × {formatBs(l.precio_unitario_bs)}
                    </p>
                  </div>
                  <span className="font-bold text-slate-900 shrink-0">{formatBs(l.subtotal_bs)}</span>
                </div>
              ))}
            </div>

            {/* Totales */}
            <div className="space-y-1 text-right text-xs pt-1">
              {Number(venta.descuento_bs) > 0 && (
                <p className="text-slate-500">
                  Descuento: <span className="text-amber-700 font-bold">-{formatBs(venta.descuento_bs)}</span>
                </p>
              )}
              <div className="flex justify-between items-center text-sm font-black text-slate-900 pt-1 border-t border-slate-300">
                <span>TOTAL A PAGAR:</span>
                <span className="text-teal-800">{formatBs(venta.total_bs)}</span>
              </div>
            </div>

            <div className="text-center pt-2 text-[10px] text-slate-400 border-t border-dashed border-slate-300">
              <p>¡Gracias por su preferencia!</p>
            </div>
          </div>

          <div className="flex justify-between items-center pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cerrar
            </Button>
            <Button type="button" variant="primary" onClick={handleImprimir}>
              <Printer size={14} className="mr-1.5" />
              <span>Imprimir Ticket</span>
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
