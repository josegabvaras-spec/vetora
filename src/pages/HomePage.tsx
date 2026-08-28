import { PawPrint } from 'lucide-react'
import { HomeHeader } from '../components/home/HomeHeader'
import { HeroSection } from '../components/home/HeroSection'
import { CardsSection } from '../components/home/CardsSection'
import { Link } from 'react-router-dom'

export function HomePage() {
  return (
    <div className="vetora-home-bg min-h-screen relative overflow-x-hidden text-slate-900 selection:bg-teal-200 selection:text-teal-900 font-sans flex flex-col justify-between">
      {/* ── Huellas decorativas de fondo ── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="paw-print absolute top-12 left-8 -rotate-12">
          <PawPrint size={42} strokeWidth={2} />
        </div>
        <div className="paw-print absolute top-24 right-16 rotate-12">
          <PawPrint size={36} strokeWidth={2} />
        </div>
        <div className="paw-print absolute top-1/3 left-1/4 rotate-45">
          <PawPrint size={28} strokeWidth={2} />
        </div>
        <div className="paw-print absolute top-1/2 right-12 -rotate-12">
          <PawPrint size={40} strokeWidth={2} />
        </div>
        <div className="paw-print absolute bottom-32 left-16 rotate-12">
          <PawPrint size={34} strokeWidth={2} />
        </div>
        <div className="paw-print absolute bottom-16 right-1/4 -rotate-45">
          <PawPrint size={30} strokeWidth={2} />
        </div>
      </div>

      {/* ── Contenedor principal de la Landing Page ── */}
      <div className="relative z-10 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 flex-1 flex flex-col justify-between">
        {/* 1. Header Horizontal */}
        <HomeHeader />

        {/* 2. Hero Section con 2 columnas (Texto + Ilustración Consultorio) */}
        <main className="flex-1 flex flex-col justify-center">
          <HeroSection />

          {/* 3. Tres Tarjetas Inferiores (Planes de Bienestar, Tienda de Accesorios, Foro y Comunidad) */}
          <CardsSection />
        </main>
      </div>

      {/* ── Footer sutil ── */}
      <footer className="relative z-10 border-t border-slate-900/5 py-6 px-4 text-center text-xs text-slate-500 font-medium">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <p>© {new Date().getFullYear()} Vetora. Todos los derechos reservados.</p>
          <div className="flex items-center gap-6">
            <Link to="/privacidad" className="hover:text-slate-800 transition-colors">
              Política de Privacidad
            </Link>
            <Link to="/login" className="hover:text-slate-800 transition-colors">
              Acceso Clínicas
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
