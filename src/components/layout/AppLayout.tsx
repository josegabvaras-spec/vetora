import { useCallback, useEffect, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { ControlesMovil, Topbar } from './Topbar'
import { MobileNav } from './MobileNav'
import { PWAInstallPrompt } from '../ui/PWAInstallPrompt'
import { useAuth } from '../../context/useAuth'
import { useEsEscritorio } from '../../hooks/useMediaQuery'
import { OnboardingProvider } from '../../features/onboarding/OnboardingProvider'
import { PASOS_CLINICA } from '../../lib/onboarding'

export function AppLayout() {
  const { esPlataforma } = useAuth()
  const [menuAbierto, setMenuAbierto] = useState(false)
  const cerrarMenu = useCallback(() => setMenuAbierto(false), [])
  // El tour necesita abrir el cajón del menú para enseñarlo en celular, y ese
  // estado vive aquí. Se lo prestamos en vez de duplicarlo.
  const abrirMenu = useCallback(() => setMenuAbierto(true), [])
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
    <OnboardingProvider pasos={PASOS_CLINICA} abrirMenu={abrirMenu} cerrarMenu={cerrarMenu}>
    <div className="flex h-dvh bg-slate-50/50 bg-[radial-gradient(ellipse_at_top_right,_var(--color-teal-50)_0%,_transparent_60%)]">
      <Sidebar abierto={menuAbierto} onCerrar={cerrarMenu} pie={<ControlesMovil />} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onAbrirMenu={abrirMenu} />
        {/* ⚠️ `overflow-x-hidden` explícito, no implícito. Por CSS, fijar solo
            `overflow-y` ya obliga al navegador a resolver `overflow-x` como
            `auto` (no puede quedar "visible" en un eje si el otro no lo es) —
            así que cualquier elemento un poco más ancho que la pantalla
            convertía TODA la página en algo que hay que desplazar de lado,
            en vez de recortarse. Aquí se decide a propósito: se recorta, no
            se desplaza. Las tablas y los modales ya llevan su propio
            `overflow-x-auto` interno cuando SÍ hace falta desplazar contenido
            ancho (ver Tabla.tsx y Modal.tsx) — este es el límite exterior. */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 pb-24 sm:p-6 md:pb-[max(1rem,env(safe-area-inset-bottom))] lg:p-8">
          <Outlet />
        </main>
      </div>
      <MobileNav onAbrirMenu={abrirMenu} />
      <PWAInstallPrompt />
    </div>
    </OnboardingProvider>
  )
}
