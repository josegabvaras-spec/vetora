import { useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { FieldGroup, Input } from '../components/ui/Field'
import { PWAInstallPrompt } from '../components/ui/PWAInstallPrompt'

export function LoginPage() {
  const { usuario, esPlataforma, entrarConCredenciales } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mostrarPassword, setMostrarPassword] = useState(false)
  const [entrando, setEntrando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Quien acaba de cambiar su contraseña llega aquí con la sesión cerrada a
  // propósito. Sin este aviso parecería que algo salió mal.
  const location = useLocation()
  const passwordActualizada = (location.state as { passwordActualizada?: boolean } | null)?.passwordActualizada

  if (usuario) {
    if (esPlataforma) return <Navigate to="/plataforma" replace />
    if (usuario.rol === 'cliente') return <Navigate to="/portal-cliente/dashboard" replace />
    return <Navigate to="/agenda" replace />
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setEntrando(true)
    setError(null)
    try {
      await entrarConCredenciales(email, password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión')
      setEntrando(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-x-hidden overflow-y-auto bg-slate-50 p-6">
      {/* Elementos de fondo decorativos (Premium SaaS Look) */}
      <div className="absolute top-[-10%] right-[-5%] h-[500px] w-[500px] rounded-full bg-gradient-to-br from-teal-200/40 to-teal-100/10 blur-[80px]" />
      <div className="absolute bottom-[-10%] left-[-5%] h-[600px] w-[600px] rounded-full bg-gradient-to-tr from-emerald-200/30 to-teal-50/10 blur-[100px]" />

      <Card className="relative z-10 w-full max-w-md border-0 bg-white/80 p-8 shadow-[0_8px_40px_rgba(0,0,0,0.04)] backdrop-blur-2xl ring-1 ring-slate-200/50">
        <div className="mb-8 flex flex-col items-center text-center">
          <img src="/vetoralogo.png" alt="Vetora" className="mb-4 w-56 sm:w-72 h-auto drop-shadow-sm hover:scale-105 transition-transform duration-500" />
          <p className="mt-1 max-w-[280px] text-sm text-slate-500">
            Entra con la cuenta que te dieron al registrarte.
          </p>
        </div>

        {passwordActualizada && (
          <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-800">
            Tu contraseña quedó actualizada. Entra con la nueva.
          </p>
        )}

        <form className="space-y-4" onSubmit={handleSubmit}>
          <FieldGroup label="Correo electrónico">
            <Input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                setError(null)
              }}
              placeholder="tu@clinica.bo"
              required
            />
          </FieldGroup>

          <FieldGroup label="Contraseña">
            <div className="relative flex items-center">
              <Input
                type={mostrarPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  setError(null)
                }}
                placeholder="••••••••"
                required
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setMostrarPassword(!mostrarPassword)}
                className="absolute right-3 text-slate-400 hover:text-slate-600 focus:outline-none"
                title={mostrarPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {mostrarPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </FieldGroup>

          {error && <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}

          <Button type="submit" disabled={entrando} className="w-full py-3 text-base shadow-lg shadow-teal-500/10">
            {entrando ? 'Entrando…' : 'Ingresar al Sistema'}
          </Button>
        </form>

        {/* Antes esto mandaba a pedirle al superadmin que reenviara el enlace
            de alta por WhatsApp: una gestión manual por cada olvido, y encima
            reutilizando el enlace de invitación para algo que no es un alta. */}
        <p className="mt-4 text-center text-xs text-slate-500">
          <Link to="/recuperar-password" className="font-medium text-teal-700 hover:underline">
            ¿Olvidaste tu contraseña?
          </Link>
        </p>

        <div className="mt-6 border-t border-slate-200 pt-6 text-center">
          <p className="text-sm text-slate-600 mb-3">¿Eres cliente de nuestras clínicas?</p>
          <Button variant="outline" className="w-full" onClick={() => window.location.href = '/registro-cliente'}>
            Registrarme como Cliente
          </Button>
        </div>

        {/* También aquí, no solo dentro de la aplicación: instalarla antes de
            entrar es justo lo que hace alguien que la va a usar a diario. */}
        <PWAInstallPrompt />

        <div className="mt-8 flex flex-col items-center justify-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
          <span>Bolivia · v1.0.1</span>
          <a href="/privacidad" target="_blank" rel="noopener noreferrer" className="text-teal-600 underline hover:text-teal-700">
            Política de Privacidad
          </a>
        </div>
      </Card>
    </div>
  )
}
