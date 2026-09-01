import { PanelCompras } from '../../features/inventario/PanelCompras'

/**
 * «Compras» dentro del panel del Pet Shop.
 *
 * Envoltorio: las órdenes de compra las comparte con `/inventario`. Ver
 * [PetshopInventarioPage](./PetshopInventarioPage.tsx).
 */
export function PetshopComprasPage() {
  return <PanelCompras />
}
