import { useState } from 'react'
import { MessageSquare, BookOpen, Calendar, Users, X, ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useBloqueoScroll } from '../../hooks/useBloqueoScroll'

export function ComunidadModal({ onClose }: { onClose: () => void }) {
  const [tabActiva, setTabActiva] = useState<'debates' | 'historias' | 'eventos'>('debates')
  useBloqueoScroll(true)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-slate-100 relative animate-scale-in text-center">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          aria-label="Cerrar modal"
        >
          <X size={20} />
        </button>

        <div className="inline-flex p-3 rounded-2xl bg-emerald-100 text-emerald-700 mb-3">
          <Users size={28} />
        </div>

        <h3 className="font-display text-2xl font-bold text-slate-900">
          Comunidad Vetora
        </h3>
        <p className="text-slate-500 text-sm mt-1 max-w-sm mx-auto">
          El punto de encuentro para dueños de mascotas, veterinarios y profesionales de todo el país.
        </p>

        {/* Selector de pestañas */}
        <div className="flex rounded-xl bg-slate-100 p-1 mt-5 mb-5 text-xs font-bold text-slate-600">
          <button
            type="button"
            onClick={() => setTabActiva('debates')}
            className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
              tabActiva === 'debates' ? 'bg-white text-slate-900 shadow-xs' : 'hover:text-slate-900'
            }`}
          >
            <MessageSquare size={14} /> Debates
          </button>
          <button
            type="button"
            onClick={() => setTabActiva('historias')}
            className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
              tabActiva === 'historias' ? 'bg-white text-slate-900 shadow-xs' : 'hover:text-slate-900'
            }`}
          >
            <BookOpen size={14} /> Historias
          </button>
          <button
            type="button"
            onClick={() => setTabActiva('eventos')}
            className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
              tabActiva === 'eventos' ? 'bg-white text-slate-900 shadow-xs' : 'hover:text-slate-900'
            }`}
          >
            <Calendar size={14} /> Eventos
          </button>
        </div>

        {/* Contenido según pestaña */}
        <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 text-left min-h-[110px] flex flex-col justify-center">
          {tabActiva === 'debates' && (
            <div>
              <p className="text-xs font-bold text-slate-900">Foros y Consultas Abiertas</p>
              <p className="text-xs text-slate-500 mt-1">
                Comparte dudas sobre crianza, nutrición y comportamiento. Aprende de las experiencias de otros dueños y consejos de clínicas asociadas.
              </p>
            </div>
          )}

          {tabActiva === 'historias' && (
            <div>
              <p className="text-xs font-bold text-slate-900">Historias de Rescate y Superación</p>
              <p className="text-xs text-slate-500 mt-1">
                Conoce las historias reales de mascotas recuperadas, adopciones exitosas y testimonios de amor animal en nuestras clínicas.
              </p>
            </div>
          )}

          {tabActiva === 'eventos' && (
            <div>
              <p className="text-xs font-bold text-slate-900">Jornadas y Encuentros</p>
              <p className="text-xs text-slate-500 mt-1">
                Campañas de vacunación, desparasitación, jornadas de esterilización y ferias de mascotas organizadas por la red Vetora en tu ciudad.
              </p>
            </div>
          )}
        </div>

        <div className="mt-6 flex gap-3">
          <Link
            to="/registro-cliente"
            onClick={onClose}
            className="clay-btn flex-1 py-3 text-center text-sm font-bold flex items-center justify-center gap-1.5"
          >
            <span>Unirme a la comunidad</span>
            <ArrowRight size={15} />
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-3 rounded-full text-slate-600 hover:bg-slate-100 font-semibold text-sm transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}
