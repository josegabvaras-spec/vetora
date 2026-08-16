import { Outlet, Navigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { LogOut, PawPrint } from 'lucide-react'
import { useEffect, useState } from 'react'
import { db } from '../../mocks/db'
import type { Clinica } from '../../types/database'

export function PortalClienteLayout() {
  const { usuario, logout } = useAuth()
  const [clinica, setClinica] = useState<Clinica | null>(null)

  useEffect(() => {
    if (usuario?.clinica_id) {
      const clinicaEncontrada = db.get('clinicas').find(c => c.id === usuario.clinica_id)
      if (clinicaEncontrada) setClinica(clinicaEncontrada)
    }
  }, [usuario])

  // Solo clientes permitidos
  if (usuario?.rol !== 'cliente') {
    return <Navigate to="/" replace />
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              {clinica?.logo_url ? (
                <img src={clinica.logo_url} alt={clinica.nombre} className="h-8 w-8 rounded-md object-cover" />
              ) : (
                <div className="h-8 w-8 rounded-md bg-indigo-100 flex items-center justify-center">
                  <PawPrint className="h-5 w-5 text-indigo-600" />
                </div>
              )}
              <span className="font-semibold text-slate-900">{clinica?.nombre || 'Portal de Clientes'}</span>
            </div>

            <div className="flex items-center gap-4">
              <span className="text-sm text-slate-600 hidden sm:inline-block">
                Hola, {usuario.nombre}
              </span>
              <button
                onClick={logout}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                title="Cerrar sesión"
              >
                <LogOut className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>
    </div>
  )
}
