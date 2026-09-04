import { useEffect, useState, useCallback } from 'react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Select } from '../../components/ui/Field'
import {
  Boxes,
  Plus,
  Truck,
  RefreshCw,
} from 'lucide-react'
import { useAuth } from '../../context/useAuth'
import { useTable } from '../../mocks/useDb'
import { formatBs } from '../../lib/currency'
import { formatClinicDate } from '../../lib/datetime'
import {
  listLotes,
  getSugerenciasReposicion,
  listProductosPetshop,
  type SugerenciaReposicion,
} from '../../services/petshop'
import { listProveedores } from '../../services/compras'
import type { ProductoLoteConDetalle } from '../../types/views'
import type { Producto, Proveedor } from '../../types/database'
import { LoteModal } from '../../features/petshop/LoteModal'
import { Link } from 'react-router-dom'

/**
 * Lotes, vencimientos y sugerencias de reposición.
 *
 * **No es una pantalla del petshop, aunque naciera ahí.** Trabaja sobre
 * `producto_lotes` y `productos`, que son tablas de la clínica —sus policies
 * son `clinica_id = auth_clinica_id()`, sin relación con el módulo del plan— y
 * no toca una sola columna de retail. Estaba detrás de
 * `ModuloRoute modulo="petshop"` por accidente de dónde se construyó, y una
 * veterinaria no tenía **ninguna** forma de saber que un medicamento vence.
 *
 * La usan `/inventario` (sección «Lotes y vencimientos») y
 * `/petshop/inventario`. Una sola implementación, para que no diverjan.
 *
 * `conCabecera` es `false` cuando va dentro de una pestaña: ahí el título de
 * la página ya está puesto y un segundo `h1` sobraría.
 */
export function PanelLotes({ conCabecera = true }: { conCabecera?: boolean }) {
  const { sucursalActivaId } = useAuth()
  const sucursales = useTable('sucursales')
  const [tab, setTab] = useState<'lotes' | 'reposicion'>('lotes')
  const [estadoFiltroLote, setEstadoFiltroLote] = useState<'todos' | 'proximo' | 'vencido' | 'normal'>('todos')

  const [lotes, setLotes] = useState<ProductoLoteConDetalle[]>([])
  const [sugerencias, setSugerencias] = useState<SugerenciaReposicion[]>([])
  const [productos, setProductos] = useState<Producto[]>([])
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [cargando, setCargando] = useState(true)

  const [modalLote, setModalLote] = useState(false)

  const recargar = useCallback(async () => {
    setCargando(true)
    try {
      const [lts, sugs, prods, provs] = await Promise.all([
        listLotes({
          sucursalId: sucursalActivaId || undefined,
          estado: estadoFiltroLote,
        }),
        getSugerenciasReposicion(sucursalActivaId || undefined),
        listProductosPetshop({ sucursalId: sucursalActivaId || undefined, soloActivos: true }),
        listProveedores(),
      ])
      setLotes(lts)
      setSugerencias(sugs)
      setProductos(prods)
      setProveedores(provs)
    } finally {
      setCargando(false)
    }
  }, [sucursalActivaId, estadoFiltroLote])

  useEffect(() => {
    recargar()
  }, [recargar])

  const vencidosCount = lotes.filter((l) => l.estado_vencimiento === 'vencido').length
  const proximosCount = lotes.filter((l) => l.estado_vencimiento === 'proximo').length

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Solo el TÍTULO se oculta dentro de una pestaña; los botones se
            quedan siempre. El `<div />` vacío mantiene el `justify-between`
            empujándolos a la derecha. */}
        {conCabecera ? (
          <div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900 flex items-center gap-2">
              <Boxes className="text-teal-700" size={24} />
              <span>Control de Inventario y Lotes</span>
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Semáforo de vencimientos, control de lotes y sugerencias de reposición de stock.
            </p>
          </div>
        ) : (
          <div />
        )}

        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => recargar()}>
            <RefreshCw size={14} className={cargando ? 'animate-spin' : ''} />
          </Button>
          <Button type="button" variant="primary" size="sm" onClick={() => setModalLote(true)}>
            <Plus size={15} className="mr-1.5" />
            <span>Registrar Lote</span>
          </Button>
        </div>
      </div>

      {/* Tarjetas de Resumen */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4 border-slate-200 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Lotes Vencidos
            </p>
            <p className="text-2xl font-black text-rose-700">{vencidosCount}</p>
            <p className="text-[11px] text-slate-400">Bloqueados para venta directa</p>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-rose-50 text-rose-700 font-black">
            🔴
          </div>
        </Card>

        <Card className="p-4 border-slate-200 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Próximos a Vencer (60 días)
            </p>
            <p className="text-2xl font-black text-amber-700">{proximosCount}</p>
            <p className="text-[11px] text-slate-400">Priorizar rotación o promoción</p>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-50 text-amber-700 font-black">
            🟡
          </div>
        </Card>

        <Card className="p-4 border-slate-200 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Sugerencias de Reposición
            </p>
            <p className="text-2xl font-black text-teal-800">{sugerencias.length}</p>
            <p className="text-[11px] text-slate-400">Productos en stock mínimo o crítico</p>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-teal-50 text-teal-800 font-black">
            <Truck size={18} />
          </div>
        </Card>
      </div>

      {/* Pestañas de Vista: Lotes vs Reposición */}
      {/* `flex-wrap`: a 375 px los dos rótulos no caben en una línea y cada
          botón se partía en dos renglones (48 px de alto). Envueltos, cada uno
          ocupa su propia fila y se lee de un vistazo. */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => setTab('lotes')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            tab === 'lotes'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Control de Lotes y Vencimientos ({lotes.length})
        </button>

        <button
          type="button"
          onClick={() => setTab('reposicion')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            tab === 'reposicion'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Sugerencias de Reposición ({sugerencias.length})
        </button>
      </div>

      {/* Tab: Lotes */}
      {tab === 'lotes' && (
        <Card className="p-0 overflow-hidden border-slate-200">
          <div className="p-3 border-b border-slate-100 bg-slate-50/70 flex flex-wrap justify-between items-center gap-2">
            <span className="text-xs font-bold text-slate-700">Filtrar por estado de vencimiento:</span>
            <div className="w-48 max-w-full">
              <Select
                value={estadoFiltroLote}
                onChange={(e) => setEstadoFiltroLote(e.target.value as any)}
              >
                <option value="todos">Todos los lotes</option>
                <option value="vencido">🔴 Vencidos</option>
                <option value="proximo">🟡 Próximos a vencer</option>
                <option value="normal">🟢 Normales</option>
              </Select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-4 py-3">Lote N°</th>
                  <th className="px-4 py-3">Producto</th>
                  <th className="px-4 py-3">Fecha Vencimiento</th>
                  <th className="px-4 py-3 text-center">Estado</th>
                  <th className="px-4 py-3 text-right">Cant. Actual</th>
                  <th className="px-4 py-3 text-right">Costo Unit.</th>
                  <th className="px-4 py-3">Proveedor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lotes.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-mono font-bold text-slate-900">{l.numero_lote}</td>
                    <td className="px-4 py-3">
                      <p className="font-bold text-slate-900">{l.producto?.nombre}</p>
                      <p className="text-[11px] text-slate-400">SKU: {l.producto?.sku}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-semibold text-slate-800">
                        {formatClinicDate(l.fecha_vencimiento)}
                      </span>
                      <span className="block text-[10px] text-slate-400">
                        {l.dias_para_vencer < 0
                          ? `Venció hace ${Math.abs(l.dias_para_vencer)} días`
                          : `Quedan ${l.dias_para_vencer} días`}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge
                        tone={
                          l.estado_vencimiento === 'vencido'
                            ? 'rose'
                            : l.estado_vencimiento === 'proximo'
                            ? 'amber'
                            : 'emerald'
                        }
                      >
                        {l.estado_vencimiento === 'vencido'
                          ? 'Vencido'
                          : l.estado_vencimiento === 'proximo'
                          ? 'Por Vencer'
                          : 'Normal'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right font-black text-slate-800">
                      {l.cantidad_actual} unid.
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-slate-600">
                      {formatBs(l.costo_unitario_bs)}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {l.proveedor?.empresa || '—'}
                    </td>
                  </tr>
                ))}
                {lotes.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-slate-400 text-xs">
                      No hay lotes registrados con los filtros seleccionados
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Tab: Sugerencias de Reposición */}
      {tab === 'reposicion' && (
        <Card className="p-0 overflow-hidden border-slate-200">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-4 py-3">Urgencia</th>
                  <th className="px-4 py-3">Producto</th>
                  <th className="px-4 py-3 text-center">Stock Actual</th>
                  <th className="px-4 py-3 text-center">Stock Mínimo</th>
                  <th className="px-4 py-3 text-center">Cant. Sugerida</th>
                  <th className="px-4 py-3">Proveedor Asignado</th>
                  <th className="px-4 py-3 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sugerencias.map((s, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <Badge tone={s.urgencia === 'alta' ? 'rose' : 'amber'}>
                        {s.urgencia === 'alta' ? 'Crítico (Agotado)' : 'Reposición'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-bold text-slate-900">{s.producto.nombre}</p>
                      <p className="text-[11px] text-slate-400">SKU: {s.producto.sku}</p>
                    </td>
                    <td className="px-4 py-3 text-center font-black text-rose-700">
                      {s.stockActual} {s.producto.unidad_medida}
                    </td>
                    <td className="px-4 py-3 text-center text-slate-600">
                      {s.stockMinimo} {s.producto.unidad_medida}
                    </td>
                    <td className="px-4 py-3 text-center font-black text-teal-800 text-sm">
                      +{s.cantidadSugerida} {s.producto.unidad_medida}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {s.proveedor?.empresa || 'Sin proveedor'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link to="/petshop/compras">
                        <Button type="button" variant="outline" size="sm">
                          Pedir a Proveedor
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))}
                {sugerencias.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-emerald-700 text-xs font-semibold">
                      ✓ Todo el inventario se encuentra en niveles óptimos de stock
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Modal de Lote */}
      {modalLote && (
        <LoteModal
          // ⚠️ Un lote pertenece a UNA sucursal concreta (`producto_lotes.sucursal_id`
          // es `not null`, sin valor por defecto). El admin puede estar viendo
          // «todas las sucursales» (`sucursalActivaId` es `null` a propósito, ver
          // CLAUDE.md §Sesión y acceso) — sin este respaldo, el modal mandaba una
          // cadena vacía y Postgres la rechazaba con «invalid input syntax for type
          // uuid», que PostgREST devuelve como 400 sin más explicación. Mismo
          // criterio que ya usa `InventarioPage.tsx` para `NuevoProductoModal`.
          sucursalId={sucursalActivaId || sucursales[0]?.id || ''}
          productos={productos}
          proveedores={proveedores}
          onClose={() => setModalLote(false)}
          onSaved={() => recargar()}
        />
      )}
    </div>
  )
}
