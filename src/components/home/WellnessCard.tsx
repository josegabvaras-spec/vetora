import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Stethoscope, Utensils, ShieldCheck, X } from 'lucide-react'

export function WellnessCard() {
  const [modalAbierto, setModalAbierto] = useState(false)

  return (
    <>
      <div className="clay-card-container group relative bg-[#cbe5ee] p-0 flex flex-col justify-between">
        {/* Imagen 3D completa de la tarjeta de bienestar */}
        <div className="relative w-full aspect-4/3 sm:aspect-auto overflow-hidden">
          <img
            src="/tarjeta1.jpg"
            alt="Planes de Bienestar para mascotas"
            className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
          />

          {/* Zonas interactivas sobre los botones reales para accesibilidad y navegación */}
          <div className="absolute inset-0 flex flex-col justify-end p-4 sm:p-5 z-10">
            {/* Botón interactivo Ver Planes */}
            <div className="mt-auto flex justify-center">
              <button
                type="button"
                onClick={() => setModalAbierto(true)}
                className="clay-btn w-full max-w-[200px] py-2.5 px-6 text-sm font-bold tracking-wide shadow-md transition-all hover:scale-105"
              >
                Ver Planes
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Modal interactivo para Ver Planes */}
      {modalAbierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-slate-100 relative animate-scale-in">
            <button
              type="button"
              onClick={() => setModalAbierto(false)}
              className="absolute top-4 right-4 p-2 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <X size={20} />
            </button>

            <div className="text-center mb-6">
              <div className="inline-flex p-3 rounded-2xl bg-cyan-100 text-cyan-700 mb-3">
                <ShieldCheck size={28} />
              </div>
              <h3 className="font-display text-2xl font-bold text-slate-900">
                Planes de Bienestar Vetora
              </h3>
              <p className="text-slate-500 text-sm mt-1">
                Cobertura integral para la salud preventiva de tu mascota.
              </p>
            </div>

            <div className="space-y-4 mb-6">
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-start gap-3">
                <Stethoscope className="text-teal-600 shrink-0 mt-0.5" size={20} />
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">Consultas Médicas Preventivas</h4>
                  <p className="text-slate-500 text-xs mt-0.5">Revisiones clínicas periódicas, control de peso y diagnóstico temprano.</p>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-start gap-3">
                <Utensils className="text-amber-600 shrink-0 mt-0.5" size={20} />
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">Guía de Nutrición & Vitaminas</h4>
                  <p className="text-slate-500 text-xs mt-0.5">Planes alimenticios a medida y suplementos avalados por especialistas.</p>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-start gap-3">
                <ShieldCheck className="text-rose-600 shrink-0 mt-0.5" size={20} />
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">Prevención & Vacunación</h4>
                  <p className="text-slate-500 text-xs mt-0.5">Calendario de vacunas, desparasitación interna y antipulgas al día.</p>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <Link
                to="/registro-cliente"
                onClick={() => setModalAbierto(false)}
                className="clay-btn flex-1 py-3 text-center text-sm font-bold"
              >
                Inscribir Mi Mascota
              </Link>
              <button
                type="button"
                onClick={() => setModalAbierto(false)}
                className="px-5 py-3 rounded-full text-slate-600 hover:bg-slate-100 font-semibold text-sm transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
