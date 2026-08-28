import { useState } from 'react'
import { MessageSquare, BookOpen, Calendar, X } from 'lucide-react'

export function CommunityCard() {
  const [modalContenido, setModalContenido] = useState<string | null>(null)

  return (
    <>
      <div className="clay-card-container group relative bg-[#c6ebd4] p-0 flex flex-col justify-between">
        {/* Imagen 3D completa de la tarjeta de comunidad */}
        <div className="relative w-full aspect-4/3 sm:aspect-auto overflow-hidden">
          <img
            src="/tarjeta3.jpg"
            alt="Foro y Comunidad de mascotas"
            className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
          />

          {/* Zona interactiva con los 3 botones */}
          <div className="absolute inset-0 flex flex-col justify-end p-3.5 sm:p-4 z-10">
            <div className="mt-auto grid grid-cols-3 gap-2 sm:gap-2.5">
              <button
                type="button"
                onClick={() => setModalContenido('Debates')}
                className="clay-btn py-2 px-2 text-center text-xs font-bold shadow-md transition-all hover:scale-105"
              >
                Debates
              </button>
              <button
                type="button"
                onClick={() => setModalContenido('Historias')}
                className="clay-btn py-2 px-2 text-center text-xs font-bold shadow-md transition-all hover:scale-105"
              >
                Historias
              </button>
              <button
                type="button"
                onClick={() => setModalContenido('Eventos')}
                className="clay-btn py-2 px-2 text-center text-xs font-bold shadow-md transition-all hover:scale-105"
              >
                Eventos
              </button>
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
              Esta sección estará disponible muy pronto para compartir experiencias, consejos de crianza y encuentros de mascotas en tu ciudad.
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
