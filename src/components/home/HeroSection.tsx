import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'

export function HeroSection() {
  return (
    <section className="relative pt-6 pb-8 md:pt-10 md:pb-14">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
        {/* Columna Izquierda: Textos y Llamada a la Acción */}
        <div className="lg:col-span-5 flex flex-col justify-center space-y-6 text-left">
          <div className="space-y-3">
            <h1 className="font-display font-extrabold text-3xl sm:text-4xl md:text-5xl lg:text-[3.25rem] text-[#243746] tracking-tight leading-[1.12]">
              Bienvenido a Vetora:
              <span className="block mt-1">Su Socio en Salud y</span>
              <span className="block mt-1">Felicidad Animal.</span>
            </h1>

            <p className="text-base sm:text-lg md:text-xl text-[#3d5366] font-medium leading-relaxed max-w-lg pt-1">
              Atención experta, comunidad y servicios para cada etapa.
            </p>
          </div>

          <div className="pt-2">
            <Link
              to="/registro-cliente"
              className="clay-btn inline-flex items-center gap-2.5 px-8 py-3.5 sm:px-9 sm:py-4 text-base sm:text-lg font-bold tracking-wide shadow-lg group hover:scale-[1.03] transition-all"
            >
              <span>Comenzar Ahora</span>
              <ArrowRight
                size={18}
                className="transition-transform duration-300 group-hover:translate-x-1"
              />
            </Link>
          </div>
        </div>

        {/* Columna Derecha: Ilustración del Consultorio Familiar */}
        <div className="lg:col-span-7 flex justify-center lg:justify-end">
          <div className="relative w-full max-w-2xl rounded-3xl sm:rounded-[2.5rem] overflow-hidden shadow-2xl shadow-sky-900/10 border border-white/60 bg-white/40 backdrop-blur-xs transition-transform duration-500 hover:scale-[1.01]">
            <img
              src="/consultorio.jpg"
              alt="Consulta veterinaria familiar con perro, gato, veterinario y familia"
              className="w-full h-auto object-cover object-center transform scale-[1.01]"
              loading="eager"
            />
          </div>
        </div>
      </div>
    </section>
  )
}
