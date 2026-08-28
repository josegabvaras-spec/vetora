import { Link } from 'react-router-dom'

export function StoreCard() {
  return (
    <div className="clay-card-container group relative bg-[#fad0d6] p-0 flex flex-col justify-between">
      {/* Imagen 3D completa de la tarjeta de tienda */}
      <div className="relative w-full aspect-4/3 sm:aspect-auto overflow-hidden">
        <img
          src="/tarjeta2.jpg"
          alt="Tienda de Accesorios para mascotas"
          className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
        />

        {/* Zona interactiva sobre el botón */}
        <div className="absolute inset-0 flex flex-col justify-end p-4 sm:p-5 z-10">
          <div className="mt-auto flex justify-center">
            <Link
              to="/portal-cliente/tienda"
              className="clay-btn w-full max-w-[200px] py-2.5 px-6 text-center text-sm font-bold tracking-wide shadow-md transition-all hover:scale-105"
            >
              Explorar Tienda
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
