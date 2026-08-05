import { db, newId } from '../mocks/db'
import type { MovimientoInventario, Producto, TipoMovimientoInventario } from '../types/database'
import type { ProductoConMovimientos } from '../types/views'

function delay<T>(value: T): Promise<T> {
  return Promise.resolve(value)
}

export interface DatosProducto {
  sku: string
  nombre: string
  precio_bs: number
  stock_minimo: number
}

function validarProducto(datos: DatosProducto, sucursalId: string, ignorarId?: string) {
  if (!datos.sku.trim()) throw new Error('El SKU es obligatorio')
  if (!datos.nombre.trim()) throw new Error('El nombre del producto es obligatorio')
  if (!Number.isFinite(datos.precio_bs) || datos.precio_bs < 0) {
    throw new Error('El precio debe ser un número mayor o igual a 0')
  }
  if (!Number.isFinite(datos.stock_minimo) || datos.stock_minimo < 0) {
    throw new Error('El stock mínimo no puede ser negativo')
  }
  // La migración exige unique (sucursal_id, sku).
  const repetido = db
    .get('productos')
    .some(
      (p) =>
        p.id !== ignorarId &&
        p.sucursal_id === sucursalId &&
        p.sku.trim().toLowerCase() === datos.sku.trim().toLowerCase(),
    )
  if (repetido) throw new Error('Ya existe un producto con ese SKU en esta sucursal')
}

/**
 * Da de alta un producto. El stock inicial no se escribe a mano: se registra
 * como un movimiento de ingreso para que quede en la bitácora de movimientos.
 */
export async function crearProducto(
  sucursalId: string,
  datos: DatosProducto,
  stockInicial: number,
): Promise<Producto> {
  validarProducto(datos, sucursalId)
  if (!Number.isFinite(stockInicial) || stockInicial < 0) {
    throw new Error('El stock inicial no puede ser negativo')
  }

  const producto: Producto = {
    id: newId('producto'),
    clinica_id: db.clinicaActivaId(),
    sucursal_id: sucursalId,
    sku: datos.sku.trim(),
    nombre: datos.nombre.trim(),
    precio_bs: datos.precio_bs,
    stock_actual: 0,
    stock_minimo: datos.stock_minimo,
    created_at: new Date().toISOString(),
  }
  db.set('productos', [...db.get('productos'), producto])

  if (stockInicial > 0) {
    await registrarMovimiento(producto.id, 'ingreso', stockInicial, 'Stock inicial del producto')
  }
  return delay(db.get('productos').find((p) => p.id === producto.id)!)
}

export async function actualizarProducto(id: string, datos: DatosProducto): Promise<void> {
  const producto = db.get('productos').find((p) => p.id === id)
  if (!producto) throw new Error('Producto no encontrado')
  validarProducto(datos, producto.sucursal_id, id)

  db.set(
    'productos',
    db.get('productos').map((p) =>
      p.id === id
        ? {
            ...p,
            sku: datos.sku.trim(),
            nombre: datos.nombre.trim(),
            precio_bs: datos.precio_bs,
            stock_minimo: datos.stock_minimo,
          }
        : p,
    ),
  )
  return delay(undefined)
}

export async function listProductos(sucursalId?: string): Promise<ProductoConMovimientos[]> {
  const productos = db.get('productos')
  const movimientos = db.get('movimientos_inventario')
  const result = productos
    .filter((p) => !sucursalId || p.sucursal_id === sucursalId)
    .map((p) => ({
      ...p,
      movimientos: movimientos
        .filter((m) => m.producto_id === p.id)
        .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    }))
  return delay(result)
}

/**
 * Atención que consumió el producto. Un movimiento pertenece como mucho a una
 * de las dos: se factura con la cita o con la internación, nunca con ambas.
 */
export interface OrigenConsumo {
  citaId?: string | null
  internacionId?: string | null
}

/**
 * PRD HU-03: un egreso que deje el stock por debajo de 0 debe ser rechazado
 * con el mensaje "Stock insuficiente". En Supabase real esto lo hace el
 * CHECK (stock_actual >= 0); aquí se valida antes de aplicar el movimiento.
 */
export async function registrarMovimiento(
  productoId: string,
  tipo: TipoMovimientoInventario,
  cantidad: number,
  motivo: string,
  origen: OrigenConsumo = {},
): Promise<void> {
  if (cantidad <= 0) {
    throw new Error('La cantidad debe ser mayor a 0')
  }

  const producto = db.get('productos').find((p) => p.id === productoId)
  if (!producto) throw new Error('Producto no encontrado')

  if (tipo === 'egreso' && cantidad > producto.stock_actual) {
    throw new Error('Stock insuficiente')
  }

  const nuevoStock = tipo === 'ingreso' ? producto.stock_actual + cantidad : producto.stock_actual - cantidad

  db.set(
    'productos',
    db.get('productos').map((p) => (p.id === productoId ? { ...p, stock_actual: nuevoStock } : p)),
  )

  const movimiento: MovimientoInventario = {
    id: newId('mov'),
    clinica_id: db.clinicaActivaId(),
    producto_id: productoId,
    tipo,
    cantidad,
    motivo,
    cita_id: origen.citaId ?? null,
    internacion_id: origen.internacionId ?? null,
    created_at: new Date().toISOString(),
  }
  db.set('movimientos_inventario', [...db.get('movimientos_inventario'), movimiento])
  return delay(undefined)
}
