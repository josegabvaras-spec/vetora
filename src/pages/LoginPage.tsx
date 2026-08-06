import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Eye, EyeOff, PawPrint, RotateCcw, Sparkles } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useTable } from '../mocks/useDb'
import { db } from '../mocks/db'
import { PASSWORD_DEMO } from '../mocks/seed'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { FieldGroup, Input } from '../components/ui/Field'
import { isMockMode } from '../lib/supabase'

const ROL_LABEL: Record<string, string> = {
  superadmin: 'Plataforma',
  admin: 'Administrador',
  veterinario: 'Veterinario',
  recepcion: 'Recepción',
}

export function LoginPage() {
  const { usuario, esPlataforma, entrarConCredenciales } = useAuth()
  const usuarios = useTable('usuarios')
  const clinicas = useTable('clinicas')
  const credenciales = useTable('credenciales')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mostrarPassword, setMostrarPassword] = useState(false)
  const [entrando, setEntrando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (usuario) return <Navigate to={esPlataforma ? '/plataforma' : '/agenda'} replace />

  // Atajo de demostración: solo las cuentas sembradas, que comparten contraseña.
  const cuentasDemo = usuarios
    .filter((u) => u.activo && credenciales.some((c) => c.usuario_id === u.id && c.id.startsWith('credencial-user-')))
    .map((u) => ({
      ...u,
      clinica: u.clinica_id ? clinicas.find((c) => c.id === u.clinica_id)?.nombre ?? '—' : 'Plataforma',
    }))

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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-50 p-6">
      {/* Elementos de fondo decorativos (Premium SaaS Look) */}
      <div className="absolute top-[-10%] right-[-5%] h-[500px] w-[500px] rounded-full bg-gradient-to-br from-teal-200/40 to-teal-100/10 blur-[80px]" />
      <div className="absolute bottom-[-10%] left-[-5%] h-[600px] w-[600px] rounded-full bg-gradient-to-tr from-emerald-200/30 to-teal-50/10 blur-[100px]" />

      <Card className="relative z-10 w-full max-w-md border-0 bg-white/80 p-8 shadow-[0_8px_40px_rgba(0,0,0,0.04)] backdrop-blur-2xl ring-1 ring-slate-200/50">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-teal-600 to-teal-400 text-white shadow-xl shadow-teal-500/30 ring-4 ring-white/50 transition-transform duration-500 hover:scale-105 hover:rotate-3">
            <PawPrint size={32} strokeWidth={2.5} />
          </div>
          <h1 className="font-display text-4xl font-extrabold tracking-tight text-slate-900 drop-shadow-sm">Vetora</h1>
          <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-teal-600/80">
            Gestión Veterinaria
          </p>
          <p className="mt-2 max-w-[280px] text-sm text-slate-500">
            Entra con la cuenta que te dieron al registrarte.
          </p>
        </div>

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

        <p className="mt-4 text-center text-xs text-slate-500">
          ¿Olvidaste tu contraseña? Pide a quien te dio de alta que te reenvíe tu enlace de acceso por WhatsApp.
        </p>

        {isMockMode && (
          <div className="mt-6 rounded-xl border border-amber-200/60 bg-amber-50/70 p-4 text-xs leading-relaxed text-amber-800">
            <div className="flex gap-2">
              <Sparkles size={16} className="mt-0.5 shrink-0 text-amber-600" />
              <div>
                <p className="font-bold">Modo demostración</p>
                <p className="mt-0.5 opacity-90">
                  Cuentas de prueba, todas con la contraseña <code className="font-bold">{PASSWORD_DEMO}</code>.
                </p>
              </div>
            </div>

            <ul className="mt-3 space-y-1">
              {cuentasDemo.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setEmail(u.email)
                      setPassword(PASSWORD_DEMO)
                      setError(null)
                    }}
                    className="w-full cursor-pointer rounded-lg border border-amber-200/60 bg-white/70 px-3 py-1.5 text-left transition-colors hover:border-teal-300 hover:bg-white"
                  >
                    <span className="font-bold text-slate-700">{u.nombre}</span>{' '}
                    <span className="text-slate-500">
                      — {ROL_LABEL[u.rol]} · {u.clinica}
                    </span>
                    <span className="block font-mono text-[10px] text-slate-400">{u.email}</span>
                  </button>
                </li>
              ))}
            </ul>

            <button
              type="button"
              onClick={() => {
                db.reset()
                window.location.reload()
              }}
              className="mt-3 flex cursor-pointer items-center gap-1 font-bold text-teal-700 hover:text-teal-800 hover:underline"
            >
              <RotateCcw size={12} /> Restablecer datos semilla de prueba
            </button>
          </div>
        )}

        <div className="mt-8 text-center text-[10px] font-semibold uppercase tracking-widest text-slate-400">
          Tarija · Bolivia · MVP v0.1
        </div>
      </Card>
    </div>
  )
}
