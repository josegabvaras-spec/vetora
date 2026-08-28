import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ShoppingBag, Store, IdCard, MessageCircle, X } from 'lucide-react'
import { useBloqueoScroll } from '../../hooks/useBloqueoScroll'

export function StoreCard() {
  const [modalAbierto, setModalAbierto] = useState(false)
  useBloqueoScroll(modalAbierto)

  return (
    <>
      <div className="clay-card-container group relative bg-[#fad0d6] p-0 flex flex-col justify-between rounded-2xl sm:rounded-3xl lg:rounded-[2rem]">
        {/* Imagen 3D completa de la tarjeta de tienda */}
        <div className="relative w-full aspect-[3/4] sm:aspect-[4/3] md:aspect-auto overflow-hidden">
          <img
            src="/tarjeta2.jpg"
            alt="Tienda de Accesorios para mascotas"
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
                Explorar Tienda
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Modal: cómo funciona el acceso a la Tienda */}
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
              <div className="inline-flex p-3 rounded-2xl bg-rose-100 text-rose-700 mb-3">
                <ShoppingBag size={28} />
              </div>
              <h3 className="font-display text-2xl font-bold text-slate-900">Tienda Vetora</h3>
              <p className="text-slate-500 text-sm mt-1">
                El catálogo de productos de las clínicas y petshops de nuestra red.
              </p>
            </div>

            <div className="space-y-4 mb-6">
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-start gap-3">
                <Store className="text-teal-600 shrink-0 mt-0.5" size={20} />
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">Catálogo de toda la red</h4>
                  <p className="text-slate-500 text-xs mt-0.5">
                    No es solo de una clínica: ves los productos de cualquier clínica o petshop de la red que tenga
                    tienda habilitada.
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-start gap-3">
                <IdCard className="text-amber-600 shrink-0 mt-0.5" size={20} />
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">Necesitas una cuenta</h4>
                  <p className="text-slate-500 text-xs mt-0.5">
                    Es la misma cuenta del portal de clientes. Si tu mascota ya está registrada en alguna clínica de
                    la red, inicia sesión; si no, regístrate primero.
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-start gap-3">
                <MessageCircle className="text-rose-600 shrink-0 mt-0.5" size={20} />
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">Coordina la compra por WhatsApp</h4>
                  <p className="text-slate-500 text-xs mt-0.5">
                    Cada producto tiene un botón directo a WhatsApp para consultar y coordinar la compra con la
                    clínica o petshop que lo ofrece.
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
