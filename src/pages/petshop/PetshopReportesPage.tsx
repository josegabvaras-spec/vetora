import { ReporteRentabilidad } from '../../features/petshop/ReporteRentabilidad'

/**
 * «Reportes» dentro del panel del Pet Shop.
 *
 * El informe en sí vive en `features/petshop/ReporteRentabilidad`, porque
 * `/metricas` pinta exactamente el mismo cuando el negocio es de retail. Aquí
 * solo se le pone el nombre que tiene en esta sección.
 */
export function PetshopReportesPage() {
  return (
    <ReporteRentabilidad
      titulo="Reportes Financieros y Rentabilidad"
      subtitulo="Análisis de ingresos brutos, costos de mercadería vendida (COGS) y margen de utilidad."
    />
  )
}
