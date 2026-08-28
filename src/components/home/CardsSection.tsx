import { WellnessCard } from './WellnessCard'
import { StoreCard } from './StoreCard'
import { CommunityCard } from './CommunityCard'

export function CardsSection() {
  return (
    <section className="relative pt-4 pb-12 sm:pb-16" aria-label="Secciones principales de Vetora">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 items-stretch">
        {/* Tarjeta 1: Planes de Bienestar */}
        <WellnessCard />

        {/* Tarjeta 2: Tienda de Accesorios */}
        <StoreCard />

        {/* Tarjeta 3: Foro y Comunidad */}
        <CommunityCard />
      </div>
    </section>
  )
}
