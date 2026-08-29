import { useEffect, useState } from 'react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { FieldGroup, Input, Textarea } from '../../components/ui/Field'
import { Settings, Save, CheckCircle2 } from 'lucide-react'
import {
  getConfiguracionPetshop,
  guardarConfiguracionPetshop,
} from '../../services/petshop'

export function PetshopConfiguracionPage() {
  const [diasAlertaVencimiento, setDiasAlertaVencimiento] = useState(60)
  const [permitirVentaSinStock, setPermitirVentaSinStock] = useState(false)
  const [exigirAutorizacionDevolucion, setExigirAutorizacionDevolucion] = useState(true)
  const [impresionTicketAutomatica, setImpresionTicketAutomatica] = useState(false)
  const [mensajeTicketPie, setMensajeTicketPie] = useState('Gracias por su compra en Vetora Pet Shop')

  const [guardando, setGuardando] = useState(false)
  const [mensajeExito, setMensajeExito] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getConfiguracionPetshop().then((c) => {
      setDiasAlertaVencimiento(c.dias_alerta_vencimiento || 60)
      setPermitirVentaSinStock(c.permitir_venta_sin_stock || false)
      setExigirAutorizacionDevolucion(c.exigir_autorizacion_devolucion ?? true)
      setImpresionTicketAutomatica(c.impresion_ticket_automatica || false)
      setMensajeTicketPie(c.mensaje_ticket_pie || 'Gracias por su compra en Vetora Pet Shop')
    })
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setGuardando(true)
    setError(null)
    setMensajeExito(false)

    try {
      await guardarConfiguracionPetshop({
        dias_alerta_vencimiento: diasAlertaVencimiento,
        permitir_venta_sin_stock: permitirVentaSinStock,
        exigir_autorizacion_devolucion: exigirAutorizacionDevolucion,
        impresion_ticket_automatica: impresionTicketAutomatica,
        mensaje_ticket_pie: mensajeTicketPie,
      })
      setMensajeExito(true)
      setTimeout(() => setMensajeExito(false), 3000)
    } catch (err: any) {
      setError(err.message || 'Error al guardar configuración')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Cabecera Principal */}
      <div>
        <h1 className="text-2xl font-black tracking-tight text-slate-900 flex items-center gap-2">
          <Settings className="text-teal-700" size={24} />
          <span>Configuración del Módulo Pet Shop</span>
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Parámetros operativos de ventas, alertas de caducidad, políticas de tickets y devoluciones.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {mensajeExito && (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800">
            <CheckCircle2 size={16} />
            <span>Configuración guardada correctamente.</span>
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
            {error}
          </div>
        )}

        <Card className="p-5 border-slate-200 space-y-4">
          <h3 className="font-bold text-sm text-slate-900 border-b border-slate-100 pb-2">
            Alertas y Caducidad de Lotes
          </h3>

          <FieldGroup label="Días de Anticipación para Alerta de Vencimiento">
            <Input
              type="number"
              min="7"
              max="180"
              value={diasAlertaVencimiento}
              onChange={(e) => setDiasAlertaVencimiento(parseInt(e.target.value) || 60)}
              required
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Los productos que venzan dentro de este número de días aparecerán marcados en amarillo en el inventario.
            </p>
          </FieldGroup>
        </Card>

        <Card className="p-5 border-slate-200 space-y-4">
          <h3 className="font-bold text-sm text-slate-900 border-b border-slate-100 pb-2">
            Políticas de Venta y Devoluciones
          </h3>

          <div className="space-y-3">
            <label className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={permitirVentaSinStock}
                onChange={(e) => setPermitirVentaSinStock(e.target.checked)}
                className="rounded text-teal-600 focus:ring-teal-500 mt-0.5"
              />
              <div>
                <span className="font-bold block">Permitir venta sin stock disponible</span>
                <span className="text-slate-400 text-[11px]">
                  Si se activa, el POS permitirá facturar aunque el stock físico figure en 0 (quedará en saldo negativo).
                </span>
              </div>
            </label>

            <label className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={exigirAutorizacionDevolucion}
                onChange={(e) => setExigirAutorizacionDevolucion(e.target.checked)}
                className="rounded text-teal-600 focus:ring-teal-500 mt-0.5"
              />
              <div>
                <span className="font-bold block">Exigir motivo y registro de auditoría en devoluciones</span>
                <span className="text-slate-400 text-[11px]">
                  Registra qué usuario autorizó y el estado físico de la mercadería reincorporada.
                </span>
              </div>
            </label>
          </div>
        </Card>

        <Card className="p-5 border-slate-200 space-y-4">
          <h3 className="font-bold text-sm text-slate-900 border-b border-slate-100 pb-2">
            Ticket de Venta / Comprobante
          </h3>

          <FieldGroup label="Mensaje de Pie de Página en Ticket">
            <Textarea
              rows={2}
              value={mensajeTicketPie}
              onChange={(e) => setMensajeTicketPie(e.target.value)}
              placeholder="¡Gracias por su compra! Cambios válidos dentro de los 7 días con este ticket."
            />
          </FieldGroup>

          <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={impresionTicketAutomatica}
              onChange={(e) => setImpresionTicketAutomatica(e.target.checked)}
              className="rounded text-teal-600 focus:ring-teal-500"
            />
            <span className="font-semibold">Abrir ventana de impresión automáticamente tras cada venta</span>
          </label>
        </Card>

        <div className="flex justify-end pt-2">
          <Button type="submit" variant="primary" disabled={guardando}>
            <Save size={15} className="mr-1.5" />
            <span>{guardando ? 'Guardando...' : 'Guardar Configuración'}</span>
          </Button>
        </div>
      </form>
    </div>
  )
}
