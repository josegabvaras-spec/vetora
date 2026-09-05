import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Scissors, Sparkles, IdCard, BellRing, X } from 'lucide-react'
import { useBloqueoScroll } from '../../hooks/useBloqueoScroll'

export function PeluqueriaCard() {
  const [modalAbierto, setModalAbierto] = useState(false)
  useBloqueoScroll(modalAbierto)

  return (
    <>
      <div className="clay-card-container group relative bg-[#fbe7a1] p-0 flex flex-col justify-between rounded-2xl sm:rounded-3xl lg:rounded-[2rem]">
        {/* Imagen 3D de la sección 3: Peluquería */}
        <div className="relative w-full aspect-[3/4] sm:aspect-[4/3] md:aspect-auto overflow-hidden">
          <img
            src="/seccion3.jpg"
            alt="Peluquería y Estética para mascotas"
            className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
          />

          {/* Zona interactiva sobre el botón */}
          <div className="absolute inset-0 flex flex-col justify-end p-2 sm:p-4 z-10">
            <div className="mt-auto flex justify-center">
              <button
                type="button"
                onClick={() => setModalAbierto(true)}
                className="clay-btn w-full max-w-[160px] sm:max-w-[200px] py-1.5 sm:py-2.5 px-2 sm:px-4 text-center text-[10px] sm:text-xs md:text-sm font-bold tracking-tight shadow-md transition-all active:scale-95 hover:scale-105"
              >
                Peluquería
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Modal informativo: cómo funciona la Peluquería */}
      {modalAbierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-slate-100 relative animate-scale-in">
            <button
              type="button"
              onClick={() => setModalAbierto(false)}
              className="absolute top-4 right-4 p-2 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              aria-label="Cerrar modal"
            >
              <X size={20} />
            </button>

            <div className="text-center mb-6">
              <div className="inline-flex p-3 rounded-2xl bg-amber-100 text-amber-700 mb-3">
                <Scissors size={28} />
              </div>
              <h3 className="font-display text-2xl font-bold text-slate-900">Peluquería Canina Vetora</h3>
              <p className="text-slate-500 text-sm mt-1">
                Baño, corte, estética y cuidado especializado para consentir a tu mascota.
              </p>
            </div>

            <div className="space-y-4 mb-6">
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-start gap-3">
                <Sparkles className="text-amber-600 shrink-0 mt-0.5" size={20} />
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">Servicios profesionales de estética</h4>
                  <p className="text-slate-500 text-xs mt-0.5">
                    Baños medicados e higiénicos, cortes de raza, desenredado y tratamientos de belleza realizados
                    por especialistas certificados de nuestra red.
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-start gap-3">
                <IdCard className="text-teal-600 shrink-0 mt-0.5" size={20} />
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">Necesitas una cuenta para agendar</h4>
                  <p className="text-slate-500 text-xs mt-0.5">
                    Para programar turnos y llevar el control del historial de peluquería de tu mascota, necesitas
                    registrarte en el portal de clientes con tu carnet y número de WhatsApp.
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-start gap-3">
                <BellRing className="text-rose-600 shrink-0 mt-0.5" size={20} />
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">Avisos automáticos cuando esté lista</h4>
                  <p className="text-slate-500 text-xs mt-0.5">
                    Recibe recordatorios de tu cita y un mensaje directo a tu WhatsApp tan pronto como tu peludito
                    haya terminado su sesión y esté listo para volver a casa.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <Link
                to="/registro-cliente"
                onClick={() => setModalAbierto(false)}
                className="clay-btn flex-1 py-3 text-center text-sm font-bold"
              >
                Crear mi cuenta
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
