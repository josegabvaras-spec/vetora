import { Outlet } from 'react-router-dom'
import { PeluqueriaNav } from '../../features/peluqueria/PeluqueriaNav'

export function PeluqueriaLayout() {
  return (
    <div className="flex flex-col min-h-full">
      <PeluqueriaNav />
      <div className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
        <Outlet />
      </div>
    </div>
  )
}
