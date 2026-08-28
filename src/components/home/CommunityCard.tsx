import { useState } from 'react'
import { MessageSquare, BookOpen, Calendar, X } from 'lucide-react'

export function CommunityCard() {
  const [modalContenido, setModalContenido] = useState<string | null>(null)

  return (
    <>
      <div className="clay-card-container group relative bg-[#c6ebd4] p-0 flex flex-col justify-between rounded-2xl sm:rounded-3xl lg:rounded-[2rem]">
        {/* Imagen 3D completa de la tarjeta de comunidad */}
        <div className="relative w-full aspect-[3/4] sm:aspect-[4/3] md:aspect-auto overflow-hidden">
          <img
            src="/tarjeta3.jpg"
            alt="Foro y Comunidad de mascotas"
            className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
          />

          {/* Zona interactiva con los botones */}
          <div className="absolute inset-0 flex flex-col justify-end p-2 sm:p-4 z-10">
            {/* En mobile: Debates e Historias arriba, Eventos abajo (como en sitiomobil.jpg); en desktop: 3 columnas */}
            <div className="mt-auto flex flex-col gap-1 sm:gap-2">
              <div className="grid grid-cols-2 gap-1 sm:gap-1.5 md:hidden">
                <button
                  type="button"
                  onClick={() => setModalContenido('Debates')}
                  className="clay-btn py-1 px-1 text-center text-[9px] font-bold shadow-xs active:scale-95"
                >
                  Debates
                </button>
                <button
                  type="button"
                  onClick={() => setModalContenido('Historias')}
                  className="clay-btn py-1 px-1 text-center text-[9px] font-bold shadow-xs active:scale-95"
                >
                  Historias
                </button>
                <button
                  type="button"
                  onClick={() => setModalContenido('Eventos')}
                  className="clay-btn col-span-2 py-1 px-1 text-center text-[9px] font-bold shadow-xs active:scale-95"
                >
                  Eventos
                </button>
              </div>

              {/* En pantallas más amplias (desktop / tablet): 3 botones horizontales */}
              <div className="hidden md:grid md:grid-cols-3 gap-1.5 lg:gap-2">
                <button
                  type="button"
                  onClick={() => setModalContenido('Debates')}
                  className="clay-btn py-1.5 px-1.5 text-center text-xs font-bold shadow-md hover:scale-105"
                >
                  Debates
                </button>
                <button
                  type="button"
                  onClick={() => setModalContenido('Historias')}
                  className="clay-btn py-1.5 px-1.5 text-center text-xs font-bold shadow-md hover:scale-105"
                >
                  Historias
                </button>
                <button
                  type="button"
                  onClick={() => setModalContenido('Eventos')}
                  className="clay-btn py-1.5 px-1.5 text-center text-xs font-bold shadow-md hover:scale-105"
                >
                  Eventos
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal interactivo de Comunidad */}
      {modalContenido && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl border border-slate-100 relative animate-scale-in text-center">
            <button
              type="button"
              onClick={() => setModalContenido(null)}
              className="absolute top-4 right-4 p-2 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              aria-label="Cerrar modal"
            >
              <X size={20} />
            </button>

            <div className="inline-flex p-3 rounded-2xl bg-emerald-100 text-emerald-700 mb-3">
              {modalContenido === 'Debates' && <MessageSquare size={28} />}
              {modalContenido === 'Historias' && <BookOpen size={28} />}
              {modalContenido === 'Eventos' && <Calendar size={28} />}
            </div>

            <h3 className="font-display text-2xl font-bold text-slate-900">
              {modalContenido} de la Comunidad
            </h3>
            <p className="text-slate-500 text-sm mt-2">
              Esta sección estará disponible muy pronto para conectar con otros amantes de las mascotas, compartir historias y coordinar eventos en tu ciudad.
            </p>

            <div className="mt-6">
              <button
                type="button"
                onClick={() => setModalContenido(null)}
                className="clay-btn w-full py-3 text-sm font-bold"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
