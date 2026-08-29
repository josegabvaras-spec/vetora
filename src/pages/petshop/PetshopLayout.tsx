import { Outlet } from 'react-router-dom'
import { PetshopNav } from '../../features/petshop/PetshopNav'

export function PetshopLayout() {
  return (
    <div className="flex flex-col min-h-screen bg-slate-50/50">
      <PetshopNav />
      <div className="flex-1 p-4 sm:p-6 max-w-7xl w-full mx-auto">
        <Outlet />
      </div>
    </div>
  )
}
