import { useState } from 'react'
import { clsx } from 'clsx'
import { PanelLotes } from '../../features/inventario/PanelLotes'
import { PanelProveedores } from '../../features/inventario/PanelProveedores'
import { PanelCompras } from '../../features/inventario/PanelCompras'
import { PetshopProductosPage } from './PetshopProductosPage'

/**
 * «Inventario» del Pet Shop, fusionando lo que antes eran cuatro enlaces
 * separados en el menú (Productos, Inventario, Compras, Proveedores) en uno
 * solo con pestañas — mismo patrón que ya usa `/inventario` en la clínica
 * (`InventarioPage.tsx`), del que estas tres secciones son exactamente las
 * mismas tablas: `producto_lotes`, `proveedores` y `ordenes_compra` son de
 * la CLÍNICA, no del módulo petshop, así que ya se compartían por debajo —
 * lo único que faltaba era dejar de mostrarlas como pantallas sueltas.
 *
 * «Productos» sigue siendo la del petshop (`PetshopProductosPage`, categorías
 * de retail, código de barras, margen) y no la genérica de `InventarioPage`:
 * un petshop vende por unidad de venta, no por dosis fraccionada, y sus
 * campos (marca, presentación, ubicación) no existen en el kardex clínico.
 * Se anida tal cual, sin duplicar su lógica.
 */
export function PetshopInventarioPage() {
  const [seccion, setSeccion] = useState<'productos' | 'lotes' | 'proveedores' | 'compras'>(
    'productos',
  )

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200">
        <nav className="-mb-px flex space-x-6 overflow-x-auto" aria-label="Secciones de inventario">
          {(
            [
              ['productos', 'Productos'],
              ['lotes', 'Lotes y vencimientos'],
              ['proveedores', 'Proveedores'],
              ['compras', 'Compras'],
            ] as const
          ).map(([clave, etiqueta]) => (
            <button
              key={clave}
              type="button"
              onClick={() => setSeccion(clave)}
              className={clsx(
                seccion === clave
                  ? 'border-teal-500 text-teal-600'
                  : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700',
                'whitespace-nowrap border-b-2 py-3 px-1 text-sm font-semibold transition-colors',
              )}
            >
              {etiqueta}
            </button>
          ))}
        </nav>
      </div>

      {seccion === 'productos' && <PetshopProductosPage />}
      {seccion === 'lotes' && <PanelLotes conCabecera={false} />}
      {seccion === 'proveedores' && <PanelProveedores conCabecera={false} />}
      {seccion === 'compras' && <PanelCompras conCabecera={false} />}
    </div>
  )
}
