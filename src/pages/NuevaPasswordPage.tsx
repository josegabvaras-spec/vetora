import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertTriangle, KeyRound } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { FieldGroup, Input } from '../components/ui/Field'
import { supabase } from '../lib/supabase'
import { establecerPassword, PASSWORD_MINIMO } from '../services/cuentas'

/**
 * Destino del enlace del correo de recuperación.
 *
 * **Ruta pública y sin redirecciones, a propósito.** Al abrir el enlace,
 * supabase-js canjea los tokens de la URL y crea una sesión válida antes de que
 * nada más ocurra (`detectSessionInUrl` está activo por defecto). Si esta
 * pantalla estuviera dentro de `ProtectedRoute`, o si redirigiera a quien ya
 * tiene sesión, la persona acabaría en `/agenda` **sin haber puesto su
 * contraseña nueva** — que es exactamente lo que vino a hacer.
 */
export function NuevaPasswordPage() {
  const navigate = useNavigate()
  const [correo, setCorreo] = useState<string | null | undefined>(undefined)
  const [password, setPassword] = useState('')
  const [confirmacion, setConfirmacion] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // La sesión de recuperación es lo único que autoriza a cambiar la contraseña.
  // Sin ella —enlace caducado, ya usado, o alguien que escribió la dirección a
  // mano— no hay nada que hacer aquí.
  useEffect(() => {
    let montado = true
    supabase.auth
      .getUser()
      .then(({ data }) => montado && setCorreo(data.user?.email ?? null))
      .catch(() => montado && setCorreo(null))
    return () => { montado = false }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password.length < PASSWORD_MINIMO) {
      setError(`La contraseña debe tener al menos ${PASSWORD_MINIMO} caracteres`)
      return
    }
    if (password !== confirmacion) {
      setError('Las dos contraseñas no coinciden')
      return
    }

    setGuardando(true)
    try {
      await establecerPassword('', password)
      // Se cierra la sesión de recuperación y se manda al login: obliga a
      // estrenar la contraseña nueva, que es la única forma de comprobar que
      // quedó bien puesta. Quedarse dentro dejaría a la persona con la duda.
      await supabase.auth.signOut()
      navigate('/login', { replace: true, state: { passwordActualizada: true } })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la contraseña')
      setGuardando(false)
    }
  }

  const enlaceInvalido = correo === null

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <Card className="w-full max-w-md">
        <div className="mb-5 flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-teal-600 to-teal-400 text-white shadow-lg shadow-teal-500/20">
            {enlaceInvalido ? <AlertTriangle size={26} /> : <KeyRound size={26} />}
          </div>

          {enlaceInvalido ? (
            <>
              <h1 className="font-display text-lg font-bold text-slate-900">Este enlace ya no sirve</h1>
              <p className="mt-2 text-sm text-slate-600">
                Puede que haya caducado, que ya se haya usado, o que hayas llegado aquí sin abrirlo desde el correo.
              </p>
            </>
          ) : (
            <>
              <h1 className="font-display text-lg font-bold text-slate-900">Crea tu contraseña nueva</h1>
              <p className="mt-2 text-sm text-slate-500">
                {correo === undefined ? 'Comprobando tu enlace…' : 'A partir de ahora entrarás con ella.'}
              </p>
            </>
          )}
        </div>

        {enlaceInvalido && (
          <div className="flex flex-col items-center gap-2">
            <Link
              to="/recuperar-password"
              className="inline-block rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700"
            >
              Pedir un enlace nuevo
            </Link>
            <Link to="/login" className="text-sm text-slate-500 hover:text-slate-700">
              Volver al inicio de sesión
            </Link>
          </div>
        )}

        {correo && (
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Tu cuenta</p>
              {/* Mismo caso que `AccesoPage`: en monoespaciada a `text-sm` un
                  correo largo pide más ancho del que tiene la tarjeta. */}
              <p className="font-mono text-sm font-semibold text-slate-800 break-words">{correo}</p>
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

            {error && <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}

            <Button type="submit" disabled={guardando || !password} className="w-full py-3">
              {guardando ? 'Guardando…' : 'Guardar y entrar'}
            </Button>
          </form>
        )}
      </Card>
    </div>
  )
}
