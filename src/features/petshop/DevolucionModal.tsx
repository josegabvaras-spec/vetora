import { useEffect, useState } from 'react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { FieldGroup, Input, Select, Textarea } from '../../components/ui/Field'
import {
  ESTADO_DEVOLUCION_LABEL,
  getDisponibleParaDevolver,
  procesarDevolucion,
  type DisponibleParaDevolver,
} from '../../services/devoluciones'
import type { EstadoProductoDevolucion, Producto } from '../../types/database'
import { formatBs } from '../../lib/currency'
import { useAuth } from '../../context/useAuth'

/** Una línea de la venta que se está devolviendo. */
export interface LineaVendida {
  producto_id: string | null
  concepto: string
  cantidad: number
  precio_unitario_bs: number
}

interface DevolucionModalProps {
  sucursalId: string
  productos: Producto[]
  /** La venta contra la que se devuelve, con sus líneas ya cargadas. */
  venta: { id: string; lineas?: LineaVendida[] }
  productoPreseleccionado?: Producto
  onClose: () => void
  onProcessed: () => void
}

/**
 * Devolver un producto de una venta concreta.
 *
 * ⚠️ El desplegable lista **lo que esa venta cobró**, no el catálogo entero.
 * Antes ofrecía los ~cientos de productos de la sucursal y prellenaba el monto
 * con el precio de HOY: si el catálogo había subido desde la venta, el monto
 * propuesto era mayor que lo que el cliente pagó. Desde la migración 0056 la
 * base rechaza justamente eso (`trg_validar_devolucion`), así que el modal
 * tiene que trabajar con los números de la venta original.
 */
export function DevolucionModal({
  sucursalId,
  productos,
  venta,
  productoPreseleccionado,
  onClose,
  onProcessed,
}: DevolucionModalProps) {
  const { usuario } = useAuth()

  // Solo las líneas de producto: un servicio cobrado no se "devuelve" al stock.
  const lineasDeProducto = (venta.lineas ?? []).filter(
    (l): l is LineaVendida & { producto_id: string } => Boolean(l.producto_id),
  )

  const [productoId, setProductoId] = useState(
    productoPreseleccionado?.id || (lineasDeProducto.length === 1 ? lineasDeProducto[0].producto_id : ''),
  )
  const [cantidad, setCantidad] = useState<number>(1)
  const [motivo, setMotivo] = useState('')
  const [estadoProducto, setEstadoProducto] = useState<EstadoProductoDevolucion>('reintegrable')
  const [montoDevueltoBs, setMontoDevueltoBs] = useState<number>(0)

  const [limite, setLimite] = useState<DisponibleParaDevolver | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Un reenvío del mismo formulario no reintegra el stock dos veces (`0061`). */
  const [claveDevolucion] = useState<string>(() => crypto.randomUUID())

  // Lo que queda por devolver de ese producto en esa venta, contando
  // devoluciones anteriores. Se relee al cambiar de producto.
  useEffect(() => {
    if (!productoId) {
      setLimite(null)
      return
    }
    let vigente = true
    getDisponibleParaDevolver(venta.id, productoId)
      .then((d) => {
        if (!vigente) return
        setLimite(d)
        const cantidadInicial = d.disponible > 0 ? Math.min(1, d.disponible) : 0
        setCantidad(cantidadInicial)
        setMontoDevueltoBs(Number((d.precioUnitarioBs * cantidadInicial).toFixed(2)))
      })
      .catch((e) => vigente && setError(e.message))
    return () => {
      vigente = false
    }
  }, [venta.id, productoId])

  function handleCantidadChange(cant: number) {
    setCantidad(cant)
    if (limite) setMontoDevueltoBs(Number((limite.precioUnitarioBs * cant).toFixed(2)))
  }

  const nombreDe = (id: string) =>
    productos.find((p) => p.id === id)?.nombre ??
    lineasDeProducto.find((l) => l.producto_id === id)?.concepto ??
    'Producto'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!productoId) {
      setError('Selecciona el producto a devolver')
      return
    }
    if (!motivo.trim()) {
      setError('Ingresa el motivo de la devolución')
      return
    }

    setGuardando(true)
    setError(null)

    try {
      await procesarDevolucion({
        sucursalId,
        cobroId: venta.id,
        productoId,
        cantidad,
        motivo,
        estadoProducto,
        montoDevueltoBs,
        usuarioId: usuario?.id,
        idempotencyKey: claveDevolucion,
      })

      onProcessed()
      onClose()
    } catch (err: any) {
      setError(err.message || 'Error al procesar devolución')
      setGuardando(false)
    }
  }

  return (
    <Modal onClose={onClose} title="Procesar Devolución de Producto" widthClassName="max-w-lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
            {error}
          </div>
        )}

        {lineasDeProducto.length === 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">
            Esta venta no tiene productos que devolver (solo servicios).
          </div>
        )}

        <FieldGroup label="Producto vendido">
          <Select
            value={productoId}
            onChange={(e) => setProductoId(e.target.value)}
            disabled={Boolean(productoPreseleccionado) || lineasDeProducto.length === 0}
            required
          >
            <option value="">Selecciona un producto de esta venta...</option>
            {lineasDeProducto.map((l) => (
              <option key={l.producto_id} value={l.producto_id}>
                {nombreDe(l.producto_id)} — {l.cantidad} × {formatBs(l.precio_unitario_bs)}
              </option>
            ))}
          </Select>
        </FieldGroup>

        {limite && (
          <p className="text-[11px] font-semibold text-slate-500">
            Vendido: {limite.vendido} · Ya devuelto: {limite.yaDevuelto} ·{' '}
            <span className="text-teal-700">Disponible: {limite.disponible}</span> · Precio de esa venta:{' '}
            {formatBs(limite.precioUnitarioBs)}
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FieldGroup label="Cantidad a Devolver">
            <Input
              type="number"
              step="0.01"
              min="0.01"
              max={limite?.disponible ?? undefined}
              value={cantidad}
              onChange={(e) => handleCantidadChange(parseFloat(e.target.value) || 0)}
              required
            />
          </FieldGroup>

          <FieldGroup label="Monto a Reintegrar (Bs.)">
            <Input
              type="number"
              step="0.5"
              min="0"
              max={limite ? Number((limite.precioUnitarioBs * cantidad).toFixed(2)) : undefined}
              value={montoDevueltoBs}
              onChange={(e) => setMontoDevueltoBs(parseFloat(e.target.value) || 0)}
              required
            />
          </FieldGroup>
        </div>

        <FieldGroup label="Estado Físico del Producto">
          <Select
            value={estadoProducto}
            onChange={(e) => setEstadoProducto(e.target.value as EstadoProductoDevolucion)}
            required
          >
            {Object.entries(ESTADO_DEVOLUCION_LABEL).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
        </FieldGroup>

        <FieldGroup label="Motivo de la Devolución">
          <Textarea
            rows={2}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Producto vencido, cambio de talla, cliente insatisfecho..."
            required
          />
        </FieldGroup>

        <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
          <Button type="button" variant="outline" onClick={onClose} disabled={guardando}>
            Cancelar
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={guardando || !productoId || (limite?.disponible ?? 0) <= 0}
          >
            {guardando ? 'Procesando...' : 'Confirmar Devolución'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
