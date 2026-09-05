import { WellnessCard } from './WellnessCard'
import { StoreCard } from './StoreCard'
import { PeluqueriaCard } from './PeluqueriaCard'

export function CardsSection() {
  return (
    <section className="relative pt-2 pb-6 sm:pt-4 sm:pb-12 md:pb-16" aria-label="Secciones principales de Vetora">
      {/* Disposición de 3 tarjetas compactas en fila horizontal tanto en mobile como en desktop según la referencia */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4 md:gap-6 lg:gap-8 items-stretch">
        {/* Tarjeta 1: Mi Mascota */}
        <WellnessCard />

        {/* Tarjeta 2: Tienda de Accesorios */}
        <StoreCard />

        {/* Tarjeta 3: Peluquería */}
        <PeluqueriaCard />
      </div>
    </section>
  )
}
