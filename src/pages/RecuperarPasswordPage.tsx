import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, MailCheck, KeyRound } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { FieldGroup, Input } from '../components/ui/Field'
import { solicitarRecuperacion } from '../services/cuentas'

/**
 * Pedir el enlace para poner una contraseña nueva.
 *
 * Antes esto no existía: el login mandaba a pedirle al superadmin que
 * reenviara el enlace de alta por WhatsApp, o sea una gestión manual por cada
 * olvido. El alta de personal nuevo sigue siendo por WhatsApp; lo que pasa a
 * correo es recuperar la contraseña.
 */
export function RecuperarPasswordPage() {
  const [email, setEmail] = useState('')
  const [enviado, setEnviado] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setEnviando(true)
    setError(null)
    try {
      await solicitarRecuperacion(email)
      setEnviado(true)
    } catch (err) {
      // Solo llega aquí un correo mal escrito: el servicio no propaga si la
      // cuenta existe o no.
      setError(err instanceof Error ? err.message : 'No se pudo enviar el correo')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <Card className="w-full max-w-md">
        <div className="mb-5 flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-teal-600 to-teal-400 text-white shadow-lg shadow-teal-500/20">
            {enviado ? <MailCheck size={26} /> : <KeyRound size={26} />}
          </div>
          <h1 className="font-display text-lg font-bold text-slate-900">
            {enviado ? 'Revisa tu correo' : '¿Olvidaste tu contraseña?'}
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            {enviado
              ? 'Si ese correo tiene una cuenta, te llegará un enlace para poner una contraseña nueva. El enlace caduca, así que úsalo pronto.'
              : 'Escribe tu correo y te enviamos un enlace para crear una contraseña nueva.'}
          </p>
        </div>

        {/*
          El mensaje de éxito es el MISMO exista o no la cuenta. Decir «ese
          correo no está registrado» convertiría esta pantalla en un
          comprobador de qué correos tienen cuenta en el sistema.
        */}
        {enviado ? (
          <div className="space-y-3 text-center">
            <p className="text-xs text-slate-500">
              ¿No llega? Mira en la carpeta de correo no deseado antes de volver a pedirlo.
            </p>
            <Link
              to="/login"
              className="inline-flex items-center gap-1 text-sm font-medium text-teal-700 hover:underline"
            >
              <ArrowLeft size={16} /> Volver al inicio de sesión
            </Link>
          </div>
        ) : (
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

            {error && <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}

            <Button type="submit" disabled={enviando || !email.trim()} className="w-full py-3">
              {enviando ? 'Enviando…' : 'Enviarme el enlace'}
            </Button>

            <div className="text-center">
              <Link
                to="/login"
                className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
              >
                <ArrowLeft size={16} /> Volver al inicio de sesión
              </Link>
            </div>
          </form>
        )}
      </Card>
    </div>
  )
}
