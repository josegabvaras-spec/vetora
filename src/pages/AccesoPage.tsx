import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, KeyRound } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { FieldGroup, Input } from '../components/ui/Field'
import { useAuth } from '../context/AuthContext'
import { rutaDeInicio } from '../lib/personal'
import { establecerPasswordConInvitacion, validarInvitacion } from '../services/invitaciones'
import type { AccesoResuelto } from '../services/invitaciones'
import { PASSWORD_MINIMO } from '../services/cuentas'

/**
 * Entrada por enlace de acceso (`/acceso/:token`): lo que recibe por WhatsApp
 * quien acaba de ser dado de alta. Aquí crea **su** contraseña —nadie más llega
 * a conocerla— y con eso queda dentro de su clínica.
 *
 * Abrir la pantalla no gasta el enlace; lo gasta crear la contraseña.
 */
export function AccesoPage() {
  const { token } = useParams<{ token: string }>()
  const { entrarComo } = useAuth()
  const navigate = useNavigate()

  const [acceso, setAcceso] = useState<AccesoResuelto | null>(null)
  const [password, setPassword] = useState('')
  const [confirmacion, setConfirmacion] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errorEnlace, setErrorEnlace] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    validarInvitacion(token)
      .then(setAcceso)
      .catch((err) => setErrorEnlace(err instanceof Error ? err.message : 'No se pudo abrir el acceso'))
  }, [token])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!token) return
    if (password.length < PASSWORD_MINIMO) {
      setError(`La contraseña debe tener al menos ${PASSWORD_MINIMO} caracteres`)
      return
    }
    if (password !== confirmacion) {
      setError('Las dos contraseñas no coinciden')
      return
    }

    setGuardando(true)
    setError(null)
    try {
      const { usuario } = await establecerPasswordConInvitacion(token, password)
      await entrarComo(usuario)
      // A su pantalla, no a `/`: esa ruta la sirve la landing pública
      // (`HomePage` gana el emparejamiento), así que quien acababa de crear su
      // contraseña quedaba con la sesión abierta mirando la página de
      // marketing, como si no hubiera entrado.
      navigate(rutaDeInicio(usuario), { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la contraseña')
      setGuardando(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <Card className="w-full max-w-md">
        <div className="mb-5 flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-teal-600 to-teal-400 text-white shadow-lg shadow-teal-500/20">
            {errorEnlace ? <AlertTriangle size={26} /> : <KeyRound size={26} />}
          </div>

          {errorEnlace ? (
            <>
              <h1 className="font-display text-lg font-bold text-slate-900">No pudimos abrir tu acceso</h1>
              <p className="mt-2 text-sm text-slate-600">{errorEnlace}</p>
            </>
          ) : (
            <>
              <h1 className="font-display text-lg font-bold text-slate-900">Crea tu contraseña</h1>
              <p className="mt-2 text-sm text-slate-500">
                {acceso
                  ? `Vas a entrar a ${acceso.clinica_nombre} como ${acceso.usuario.nombre}.`
                  : 'Validando tu enlace de acceso…'}
              </p>
            </>
          )}
        </div>

        {errorEnlace && (
          <div className="text-center">
            <Link
              to="/login"
              className="inline-block rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Ir al inicio de sesión
            </Link>
          </div>
        )}

        {acceso && !errorEnlace && (
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Tu cuenta</p>
              <p className="font-mono text-sm font-semibold text-slate-800">{acceso.usuario.email}</p>
            </div>

            <FieldGroup label="Contraseña nueva">
              <Input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  setError(null)
                }}
                placeholder={`Al menos ${PASSWORD_MINIMO} caracteres`}
                minLength={PASSWORD_MINIMO}
                required
              />
            </FieldGroup>

            <FieldGroup label="Repite la contraseña">
              <Input
                type="password"
                autoComplete="new-password"
                value={confirmacion}
                onChange={(e) => {
                  setConfirmacion(e.target.value)
                  setError(null)
                }}
                required
              />
            </FieldGroup>

            <p className="text-xs text-slate-500">
              Nadie más la conoce, ni siquiera quien te dio de alta. Si la olvidas, pídele que te reenvíe el enlace.
            </p>

            {error && <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}

            <Button type="submit" disabled={guardando || !password} className="w-full py-3">
              {guardando ? 'Creando…' : 'Crear contraseña y entrar'}
            </Button>
          </form>
        )}
      </Card>
    </div>
  )
}
