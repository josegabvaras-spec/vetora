import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { PlanesModal } from './PlanesModal'

export function HeroSection() {
  const [planesAbierto, setPlanesAbierto] = useState(false)

  return (
    <>
    <section className="relative pt-3 pb-4 sm:pt-6 sm:pb-8 md:pt-10 md:pb-12">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-8 lg:gap-12 items-center">
        {/* Columna Izquierda (En Mobile se muestra arriba): Textos y Botón CTA */}
        <div className="lg:col-span-5 flex flex-col justify-center space-y-4 sm:space-y-6 text-left">
          <div className="space-y-2 sm:space-y-3">
            <h1 className="font-display font-extrabold text-2xl sm:text-3xl md:text-4xl lg:text-[3.25rem] text-[#243746] tracking-tight leading-[1.16]">
              Bienvenido a Vetora: Su Socio
              <span className="block mt-0.5 sm:mt-1">en Salud y Felicidad Animal.</span>
            </h1>

            <p className="text-sm sm:text-base md:text-lg text-[#3d5366] font-medium leading-relaxed max-w-lg pt-0.5">
              Atención experta, comunidad y servicios para cada etapa.
            </p>
          </div>

          {/* Botón CTA "Comenzar Ahora" (Optimizado táctil para mobile) */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setPlanesAbierto(true)}
              className="clay-btn inline-flex items-center justify-center gap-2.5 w-full sm:w-auto max-w-[280px] sm:max-w-none px-7 py-3.5 sm:px-9 sm:py-4 text-base sm:text-lg font-bold tracking-wide shadow-md active:scale-95 transition-all text-center"
            >
              <span>Comenzar Ahora</span>
              <ArrowRight
                size={18}
                className="transition-transform duration-300 group-hover:translate-x-1"
              />
            </button>
          </div>
        </div>

        {/* Columna Derecha (En Mobile se muestra justo debajo del botón): Ilustración Consultorio */}
        <div className="lg:col-span-7 flex justify-center lg:justify-end relative mt-2 sm:mt-0">
          {/* Resplandor suave ambiental para fusionar la iluminación con el fondo */}
          <div
            className="absolute inset-0 max-w-xl lg:max-w-2xl bg-gradient-to-tr from-sky-300/40 via-teal-200/40 to-emerald-100/20 rounded-full blur-3xl pointer-events-none -z-10 transform scale-90"
            aria-hidden="true"
          />
          <div
            className="relative w-full max-w-xl lg:max-w-2xl consultorio-mask"
            style={{
              WebkitMaskImage: 'radial-gradient(ellipse closest-side at 50% 50%, #000 35%, rgba(0, 0, 0, 0.85) 55%, rgba(0, 0, 0, 0.45) 75%, rgba(0, 0, 0, 0.1) 88%, transparent 96%)',
              maskImage: 'radial-gradient(ellipse closest-side at 50% 50%, #000 35%, rgba(0, 0, 0, 0.85) 55%, rgba(0, 0, 0, 0.45) 75%, rgba(0, 0, 0, 0.1) 88%, transparent 96%)',
              WebkitMaskRepeat: 'no-repeat',
              maskRepeat: 'no-repeat',
              WebkitMaskSize: '100% 100%',
              maskSize: '100% 100%'
            }}
          >
            <img
              src="/consultorio.jpg"
              alt="Consulta veterinaria familiar con perro, gato, veterinario y familia"
              className="consultorio-mask w-full h-auto object-contain block mx-auto select-none pointer-events-none"
              loading="eager"
              style={{
                WebkitMaskImage: 'radial-gradient(ellipse closest-side at 50% 50%, #000 35%, rgba(0, 0, 0, 0.85) 55%, rgba(0, 0, 0, 0.45) 75%, rgba(0, 0, 0, 0.1) 88%, transparent 96%)',
                maskImage: 'radial-gradient(ellipse closest-side at 50% 50%, #000 35%, rgba(0, 0, 0, 0.85) 55%, rgba(0, 0, 0, 0.45) 75%, rgba(0, 0, 0, 0.1) 88%, transparent 96%)',
                WebkitMaskRepeat: 'no-repeat',
                maskRepeat: 'no-repeat',
                WebkitMaskSize: '100% 100%',
                maskSize: '100% 100%'
              }}
            />
          </div>
        </div>
      </div>
    </section>

    {planesAbierto && <PlanesModal onClose={() => setPlanesAbierto(false)} />}
    </>
  )
}
