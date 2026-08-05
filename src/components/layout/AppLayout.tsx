import { useCallback, useEffect, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { ControlesMovil, Topbar } from './Topbar'
import { MobileNav } from './MobileNav'
import { useAuth } from '../../context/AuthContext'
import { useEsEscritorio } from '../../hooks/useMediaQuery'

export function AppLayout() {
  const { esPlataforma } = useAuth()
  const [menuAbierto, setMenuAbierto] = useState(false)
  const cerrarMenu = useCallback(() => setMenuAbierto(false), [])
  const { pathname } = useLocation()
  const esEscritorio = useEsEscritorio()

  // Navegar cierra el cajón; en escritorio el menú es una columna fija y el
  // estado tiene que volver a false para no dejar el scroll del cuerpo bloqueado
  // si se gira la tablet o se ensancha la ventana con el menú abierto.
  useEffect(() => setMenuAbierto(false), [pathname])
  useEffect(() => {
    if (esEscritorio) setMenuAbierto(false)
  }, [esEscritorio])

  // El usuario de plataforma no pertenece a ninguna clínica: no tiene agenda,
  // pacientes ni caja que mostrar.
  if (esPlataforma) return <Navigate to="/plataforma" replace />

  return (
    <div className="flex h-dvh bg-slate-50/50 bg-[radial-gradient(ellipse_at_top_right,_var(--color-teal-50)_0%,_transparent_60%)]">
      <Sidebar abierto={menuAbierto} onCerrar={cerrarMenu} pie={<ControlesMovil />} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onAbrirMenu={() => setMenuAbierto(true)} />
        <main className="flex-1 overflow-y-auto p-4 pb-24 sm:p-6 md:pb-[max(1rem,env(safe-area-inset-bottom))] lg:p-8">
          <Outlet />
        </main>
      </div>
      <MobileNav onAbrirMenu={() => setMenuAbierto(true)} />
    </div>
  )
}
