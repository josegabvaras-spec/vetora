import { PanelLotes } from '../../features/inventario/PanelLotes'

/**
 * «Inventario» dentro del panel del Pet Shop.
 *
 * El contenido vive en `features/inventario/PanelLotes`, porque `/inventario`
 * pinta exactamente el mismo en su sección «Lotes y vencimientos»: lotes y
 * proveedores son tablas de la CLÍNICA, no del módulo, y una veterinaria
 * necesita el control de vencimientos tanto o más que un petshop.
 */
export function PetshopInventarioPage() {
  return <PanelLotes />
}
