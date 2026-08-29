import { useEffect, useState, useRef } from 'react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Input, Select } from '../../components/ui/Field'
import {
  Search,
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  CheckCircle2,
  QrCode,
  Banknote,
  Barcode,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { formatBs } from '../../lib/currency'
import {
  buscarProductoPOS,
  procesarVentaPOS,
} from '../../services/pos'
import {
  CATEGORIAS_RETAIL,
  listProductosPetshop,
} from '../../services/petshop'
import {
  listPromociones,
  calcularDescuentoPromocion,
} from '../../services/promociones'
import { listPacientes } from '../../services/clientesPacientes'
import type {
  Producto,
  MetodoPago,
  CategoriaRetail,
  PetshopPromocion,
} from '../../types/database'
import type { ItemCarritoPOS, PacienteConDueno } from '../../types/views'
import { TicketVentaModal } from '../../features/petshop/TicketVentaModal'

export function PetshopPosPage() {
  const { sucursalActivaId, usuario } = useAuth()
  const buscadorInputRef = useRef<HTMLInputElement>(null)

  const [busqueda, setBusqueda] = useState('')
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState<CategoriaRetail | 'todos'>('todos')
  const [productosCatalogo, setProductosCatalogo] = useState<Producto[]>([])
  const [cargandoCatalogo, setCargandoCatalogo] = useState(false)

  // Clientes y Mascotas
  const [pacientes, setPacientes] = useState<PacienteConDueno[]>([])
  const [clienteSeleccionadoId, setClienteSeleccionadoId] = useState<string>('')
  const [pacienteSeleccionadoId, setPacienteSeleccionadoId] = useState<string>('')

  // Carrito y Totales
  const [carrito, setCarrito] = useState<ItemCarritoPOS[]>([])
  const [metodoPago, setMetodoPago] = useState<MetodoPago>('efectivo')
  const [montoRecibido, setMontoRecibido] = useState<string>('')
  const [codigoCupon, setCodigoCupon] = useState<string>('')
  const [descuentoCuponBs, setDescuentoCuponBs] = useState<number>(0)
  const [promocionAplicada, setPromocionAplicada] = useState<PetshopPromocion | null>(null)
  const [promocionesDisponibles, setPromocionesDisponibles] = useState<PetshopPromocion[]>([])

  // Modal de Ticket y Estado
  const [procesandoVenta, setProcesandoVenta] = useState(false)
  const [errorVenta, setErrorVenta] = useState<string | null>(null)
  const [ventaExitosaCobroId, setVentaExitosaCobroId] = useState<string | null>(null)

  // Cargar catálogo inicial
  async function cargarCatalogo() {
    setCargandoCatalogo(true)
    try {
      const prods = await listProductosPetshop({
        sucursalId: sucursalActivaId || undefined,
        categoriaRetail: categoriaSeleccionada !== 'todos' ? categoriaSeleccionada : undefined,
        busqueda: busqueda || undefined,
        soloActivos: true,
      })
      setProductosCatalogo(prods)
    } finally {
      setCargandoCatalogo(false)
    }
  }

  useEffect(() => {
    cargarCatalogo()
  }, [sucursalActivaId, categoriaSeleccionada])

  useEffect(() => {
    listPacientes(sucursalActivaId || undefined).then((res) => setPacientes(res))
    listPromociones(true).then((proms) => setPromocionesDisponibles(proms))
  }, [sucursalActivaId])

  // Búsqueda en tiempo real o por escáner de código de barras
  async function handleBuscar(e: React.FormEvent) {
    e.preventDefault()
    if (!busqueda.trim()) {
      cargarCatalogo()
      return
    }

    const prods = await buscarProductoPOS(sucursalActivaId || '', busqueda)
    // Si solo hay un resultado exacto por código de barras, agregarlo directo al carrito
    if (prods.length === 1 && (prods[0].codigo_barras === busqueda.trim() || prods[0].sku === busqueda.trim())) {
      agregarAlCarrito(prods[0])
      setBusqueda('')
      return
    }

    setProductosCatalogo(prods)
  }

  function agregarAlCarrito(producto: Producto) {
    const idx = carrito.findIndex((i) => i.producto.id === producto.id)
    if (idx >= 0) {
      const copia = [...carrito]
      copia[idx].cantidad += 1
      copia[idx].subtotal_bs = Number((copia[idx].cantidad * copia[idx].precio_unitario_bs).toFixed(2))
      setCarrito(copia)
    } else {
      setCarrito([
        ...carrito,
        {
          producto,
          cantidad: 1,
          precio_unitario_bs: producto.precio_bs,
          subtotal_bs: producto.precio_bs,
        },
      ])
    }
  }

  function modificarCantidad(idx: number, delta: number) {
    const copia = [...carrito]
    const nuevaCant = copia[idx].cantidad + delta
    if (nuevaCant <= 0) {
      quitarDelCarrito(idx)
      return
    }
    copia[idx].cantidad = nuevaCant
    copia[idx].subtotal_bs = Number((nuevaCant * copia[idx].precio_unitario_bs).toFixed(2))
    setCarrito(copia)
  }

  function quitarDelCarrito(idx: number) {
    setCarrito(carrito.filter((_, i) => i !== idx))
  }

  function vaciarCarrito() {
    setCarrito([])
    setPromocionAplicada(null)
    setDescuentoCuponBs(0)
    setCodigoCupon('')
  }

  // Clientes únicos derivados de la lista de pacientes
  const clientesMap = new Map<string, { id: string; nombre: string; whatsapp?: string }>()
  for (const p of pacientes) {
    if (p.cliente && !clientesMap.has(p.cliente.id)) {
      clientesMap.set(p.cliente.id, {
        id: p.cliente.id,
        nombre: p.cliente.nombre,
        whatsapp: p.cliente.whatsapp,
      })
    }
  }
  const clientesLista = [...clientesMap.values()]

  // Mascotas del cliente seleccionado
  const mascotasDelCliente = pacientes.filter((p) => p.cliente_id === clienteSeleccionadoId)

  // Totales
  const subtotalBruto = carrito.reduce((acc, item) => acc + item.subtotal_bs, 0)
  const totalFinal = Math.max(0, Number((subtotalBruto - descuentoCuponBs).toFixed(2)))
  const montoRecibidoNum = parseFloat(montoRecibido) || totalFinal
  const cambioBs = Math.max(0, montoRecibidoNum - totalFinal)

  function aplicarPromocion(promo: PetshopPromocion) {
    const res = calcularDescuentoPromocion(carrito, promo)
    setPromocionAplicada(promo)
    setDescuentoCuponBs(res.descuentoBs)
  }

  function handleVerificarCupon() {
    if (!codigoCupon.trim()) return
    const promo = promocionesDisponibles.find(
      (p) => p.tipo === 'cupon' && p.codigo_cupon === codigoCupon.trim().toUpperCase(),
    )
    if (promo) {
      aplicarPromocion(promo)
      setErrorVenta(null)
    } else {
      setErrorVenta('Código de cupón no válido o expirado')
    }
  }

  async function handleConfirmarVenta() {
    if (carrito.length === 0) return
    setProcesandoVenta(true)
    setErrorVenta(null)

    try {
      const res = await procesarVentaPOS({
        sucursalId: sucursalActivaId || '',
        clienteId: clienteSeleccionadoId || null,
        pacienteId: pacienteSeleccionadoId || null,
        items: carrito,
        metodoPago,
        montoRecibidoBs: montoRecibidoNum,
        descuentoGlobalBs: descuentoCuponBs,
        codigoCupon: promocionAplicada?.codigo_cupon || undefined,
        usuarioId: usuario?.id,
      })

      setVentaExitosaCobroId(res.cobroId)
      vaciarCarrito()
      cargarCatalogo()
    } catch (err: any) {
      setErrorVenta(err.message || 'Error al procesar la venta en caja')
    } finally {
      setProcesandoVenta(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Cabecera POS */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900 flex items-center gap-2">
            <ShoppingCart className="text-teal-600" size={24} />
            <span>Punto de Venta · Pet Shop</span>
          </h1>
          <p className="text-xs text-slate-500">
            Escanea el código de barras o busca productos para facturar de forma instantánea.
          </p>
        </div>

        {/* Barra de Búsqueda Rápida / Lector de Código de Barras */}
        <form onSubmit={handleBuscar} className="flex items-center gap-2 max-w-md w-full">
          <div className="relative flex-1">
            <Barcode className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              ref={buscadorInputRef}
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Escanear código de barras o buscar..."
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-300 bg-white focus:border-teal-500 focus:ring-1 focus:ring-teal-500 shadow-xs"
              autoFocus
            />
          </div>
          <Button type="submit" variant="primary" size="sm">
            <Search size={14} />
          </Button>
        </form>
      </div>

      {/* Selector de Categorías Horizontal */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        <button
          type="button"
          onClick={() => setCategoriaSeleccionada('todos')}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
            categoriaSeleccionada === 'todos'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          Todos los Artículos
        </button>
        {CATEGORIAS_RETAIL.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setCategoriaSeleccionada(cat.id)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
              categoriaSeleccionada === cat.id
                ? 'bg-teal-700 text-white shadow-xs'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Grid Principal: Catálogo (Izquierda) + Carrito POS (Derecha) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Catálogo de Productos */}
        <div className="lg:col-span-7 space-y-3">
          {cargandoCatalogo ? (
            <p className="text-center py-16 text-xs text-slate-400">Cargando catálogo...</p>
          ) : productosCatalogo.length === 0 ? (
            <Card className="p-12 text-center border-slate-200">
              <ShoppingCart size={36} className="mx-auto text-slate-300 mb-2" />
              <p className="font-bold text-sm text-slate-700">No se encontraron productos</p>
              <p className="text-xs text-slate-400 mt-1">Prueba con otra búsqueda o cambia de categoría.</p>
            </Card>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[70vh] overflow-y-auto pr-1">
              {productosCatalogo.map((prod) => {
                const sinStock = Number(prod.stock_actual) <= 0
                return (
                  <div
                    key={prod.id}
                    onClick={() => !sinStock && agregarAlCarrito(prod)}
                    className={`rounded-2xl border bg-white p-3 flex flex-col justify-between transition-all cursor-pointer select-none shadow-xs ${
                      sinStock
                        ? 'opacity-60 border-slate-200 bg-slate-50 cursor-not-allowed'
                        : 'border-slate-200 hover:border-teal-400 hover:shadow-md'
                    }`}
                  >
                    <div>
                      <div className="flex justify-between items-start gap-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase truncate">
                          {prod.sku}
                        </span>
                        {sinStock ? (
                          <span className="text-[9px] font-black text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded">
                            Agotado
                          </span>
                        ) : Number(prod.stock_actual) <= Number(prod.stock_minimo) ? (
                          <span className="text-[9px] font-black text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                            {prod.stock_actual} unid.
                          </span>
                        ) : (
                          <span className="text-[9px] font-semibold text-slate-400">
                            {prod.stock_actual} unid.
                          </span>
                        )}
                      </div>

                      <h4 className="font-bold text-xs text-slate-900 line-clamp-2 mt-1">
                        {prod.nombre}
                      </h4>
                      {prod.marca && (
                        <p className="text-[10px] text-slate-400 mt-0.5 truncate">{prod.marca}</p>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-2 mt-2 border-t border-slate-50">
                      <span className="font-black text-teal-800 text-sm">{formatBs(prod.precio_bs)}</span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={sinStock}
                        onClick={(e) => {
                          e.stopPropagation()
                          agregarAlCarrito(prod)
                        }}
                      >
                        <Plus size={12} />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Panel Lateral: Carrito y Checkout */}
        <div className="lg:col-span-5 space-y-4">
          <Card className="p-4 border-slate-200 space-y-4 shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <ShoppingCart size={18} className="text-teal-700" />
                <h3 className="font-black text-sm text-slate-900">Carrito de Compra</h3>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone="teal">{carrito.length} ítems</Badge>
                {carrito.length > 0 && (
                  <button
                    type="button"
                    onClick={vaciarCarrito}
                    className="text-[11px] font-bold text-rose-600 hover:text-rose-800 cursor-pointer"
                  >
                    Vaciar
                  </button>
                )}
              </div>
            </div>

            {errorVenta && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-xs font-semibold text-rose-700">
                {errorVenta}
              </div>
            )}

            {/* Selector de Cliente y Mascota Opcional */}
            <div className="space-y-2 rounded-xl bg-slate-50 p-3 border border-slate-100 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-400">Cliente / Dueño</label>
                  <Select
                    value={clienteSeleccionadoId}
                    onChange={(e) => {
                      setClienteSeleccionadoId(e.target.value)
                      setPacienteSeleccionadoId('')
                    }}
                  >
                    <option value="">Cliente Ocasional</option>
                    {clientesLista.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre} {c.whatsapp ? `(${c.whatsapp})` : ''}
                      </option>
                    ))}
                  </Select>
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-400">Mascota (Opcional)</label>
                  <Select
                    value={pacienteSeleccionadoId}
                    onChange={(e) => setPacienteSeleccionadoId(e.target.value)}
                    disabled={!clienteSeleccionadoId || mascotasDelCliente.length === 0}
                  >
                    <option value="">Sin mascota asociada</option>
                    {mascotasDelCliente.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre} ({p.especie})
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
            </div>

            {/* Listado de Ítems en Carrito */}
            {carrito.length === 0 ? (
              <div className="py-12 text-center text-slate-300">
                <ShoppingCart size={32} className="mx-auto mb-1 opacity-50" />
                <p className="text-xs font-semibold">El carrito está vacío</p>
                <p className="text-[11px] text-slate-400">Selecciona o escanea artículos para comenzar.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 max-h-56 overflow-y-auto pr-1">
                {carrito.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between py-2 text-xs">
                    <div className="min-w-0 flex-1 pr-2">
                      <p className="font-bold text-slate-800 truncate">{item.producto.nombre}</p>
                      <p className="text-[10px] text-slate-400">
                        {formatBs(item.precio_unitario_bs)} c/u
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50">
                        <button
                          type="button"
                          onClick={() => modificarCantidad(idx, -1)}
                          className="px-2 py-0.5 text-slate-600 hover:text-slate-900"
                        >
                          <Minus size={11} />
                        </button>
                        <span className="px-2 font-bold text-slate-800">{item.cantidad}</span>
                        <button
                          type="button"
                          onClick={() => modificarCantidad(idx, 1)}
                          className="px-2 py-0.5 text-slate-600 hover:text-slate-900"
                        >
                          <Plus size={11} />
                        </button>
                      </div>

                      <span className="font-black text-teal-900 w-16 text-right">
                        {formatBs(item.subtotal_bs)}
                      </span>

                      <button
                        type="button"
                        onClick={() => quitarDelCarrito(idx)}
                        className="text-slate-400 hover:text-rose-600 p-1"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Cupón / Promoción */}
            {carrito.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <div className="flex items-center gap-2">
                  <Input
                    value={codigoCupon}
                    onChange={(e) => setCodigoCupon(e.target.value.toUpperCase())}
                    placeholder="Código de cupón..."
                    className="text-xs uppercase"
                  />
                  <Button type="button" variant="outline" size="sm" onClick={handleVerificarCupon}>
                    Aplicar
                  </Button>
                </div>

                {promocionAplicada && (
                  <div className="flex items-center justify-between text-xs text-teal-800 bg-teal-50 px-2.5 py-1.5 rounded-lg border border-teal-200">
                    <span className="font-bold">✓ {promocionAplicada.titulo}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setPromocionAplicada(null)
                        setDescuentoCuponBs(0)
                        setCodigoCupon('')
                      }}
                      className="text-slate-400 hover:text-rose-600 text-xs"
                    >
                      ×
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Métodos de Pago */}
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <label className="text-[10px] font-bold uppercase text-slate-400">Método de Pago</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setMetodoPago('efectivo')}
                  className={`flex items-center justify-center gap-2 p-2.5 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                    metodoPago === 'efectivo'
                      ? 'border-teal-500 bg-teal-50/70 text-teal-900 shadow-xs'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <Banknote size={14} />
                  <span>Efectivo</span>
                </button>

                <button
                  type="button"
                  onClick={() => setMetodoPago('qr')}
                  className={`flex items-center justify-center gap-2 p-2.5 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                    metodoPago === 'qr'
                      ? 'border-teal-500 bg-teal-50/70 text-teal-900 shadow-xs'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <QrCode size={14} />
                  <span>Pago QR</span>
                </button>
              </div>
            </div>

            {/* Totales y Checkout */}
            <div className="rounded-2xl bg-slate-900 text-white p-4 space-y-2">
              <div className="flex justify-between text-xs text-slate-400">
                <span>Subtotal:</span>
                <span>{formatBs(subtotalBruto)}</span>
              </div>

              {descuentoCuponBs > 0 && (
                <div className="flex justify-between text-xs text-amber-400 font-bold">
                  <span>Descuento:</span>
                  <span>-{formatBs(descuentoCuponBs)}</span>
                </div>
              )}

              <div className="flex justify-between items-center text-base font-black pt-1 border-t border-slate-800">
                <span className="text-slate-200">TOTAL:</span>
                <span className="text-2xl text-teal-400 font-black">{formatBs(totalFinal)}</span>
              </div>

              {metodoPago === 'efectivo' && carrito.length > 0 && (
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800 text-xs">
                  <div>
                    <label className="text-[10px] text-slate-400">Monto Recibido</label>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      value={montoRecibido}
                      onChange={(e) => setMontoRecibido(e.target.value)}
                      placeholder={totalFinal.toString()}
                      className="w-full rounded-lg bg-slate-800 border border-slate-700 px-2.5 py-1 text-white font-bold"
                    />
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400">Cambio / Vuelto</span>
                    <p className="text-base font-black text-emerald-400">{formatBs(cambioBs)}</p>
                  </div>
                </div>
              )}
            </div>

            <Button
              type="button"
              variant="primary"
              size="lg"
              className="w-full font-black text-base py-3 shadow-md"
              disabled={carrito.length === 0 || procesandoVenta}
              onClick={handleConfirmarVenta}
            >
              {procesandoVenta ? (
                'Facturando Venta...'
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <CheckCircle2 size={18} />
                  <span>Cobrar {formatBs(totalFinal)}</span>
                </span>
              )}
            </Button>
          </Card>
        </div>
      </div>

      {/* Modal de Ticket de Venta al Finalizar */}
      {ventaExitosaCobroId && (
        <TicketVentaModal
          cobroId={ventaExitosaCobroId}
          onClose={() => setVentaExitosaCobroId(null)}
        />
      )}
    </div>
  )
}
