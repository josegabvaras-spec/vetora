import { Link } from 'react-router-dom'

export function StoreCard() {
  return (
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
            <Link
              to="/portal-cliente/tienda"
              className="clay-btn w-full max-w-[160px] sm:max-w-[200px] py-1.5 sm:py-2.5 px-2 sm:px-4 text-center text-[10px] sm:text-xs md:text-sm font-bold tracking-tight shadow-md transition-all active:scale-95 hover:scale-105"
            >
              Explorar Tienda
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
