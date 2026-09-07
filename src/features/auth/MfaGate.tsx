import { useEffect, useState } from 'react'
import { ShieldCheck, KeyRound, LogOut } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { FieldGroup, Input } from '../../components/ui/Field'
import {
  confirmarCodigo,
  estadoMfa,
  inscribirTotp,
  type EstadoMfa,
  type InscripcionTotp,
} from '../../services/mfa'

/**
 * La puerta del segundo factor del superadmin.
 *
 * ⚠️ **Esto NO es la seguridad, es la usabilidad de la seguridad.** Quien impide
 * de verdad el paso es la RLS: desde `0072`, `auth_es_plataforma()` exige `aal2`
 * a quien ya tiene un factor verificado, así que saltarse esta pantalla —con las
 * herramientas del navegador, por ejemplo— no da acceso a nada: PostgREST
 * devuelve cero filas de `clinicas` igualmente, y las cinco Edge Functions con
 * guarda de superadmin rechazan con 403.
 *
 * Lo que aporta esta pantalla es que la exigencia se pueda cumplir: dónde
 * configurar el factor, y dónde escribir el código al entrar.
 *
 * Dos estados, y el orden no es negociable:
 *
 * 1. **No tiene factor** → se le obliga a configurarlo. Sin salida más que
 *    cerrar sesión: si se pudiera posponer, no sería obligatorio y la cuenta que
 *    puede borrar clínicas enteras seguiría colgando de una contraseña.
 * 2. **Tiene factor pero la sesión está en `aal1`** → el desafío de cada
 *    entrada.
 */
export function MfaGate({
  estadoInicial,
  onListo,
  onCerrarSesion,
}: {
  estadoInicial: EstadoMfa
  onListo: () => void
  onCerrarSesion: () => void
}) {
  const [estado, setEstado] = useState<EstadoMfa>(estadoInicial)
  const [inscripcion, setInscripcion] = useState<InscripcionTotp | null>(null)
  const [codigo, setCodigo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  // Si no tiene factor, el QR se pide solo: no hay ninguna decisión que tomar
  // antes, y un botón «empezar» solo añadiría un clic a algo obligatorio.
  useEffect(() => {
    let montado = true
    if (estado.tieneFactor || inscripcion) return

    setOcupado(true)
    inscribirTotp()
      .then((datos) => {
        if (montado) setInscripcion(datos)
      })
      .catch((err) => {
        if (montado) setError(err instanceof Error ? err.message : 'No se pudo generar el código')
      })
      .finally(() => {
        if (montado) setOcupado(false)
      })

    return () => {
      montado = false
    }
  }, [estado.tieneFactor, inscripcion])

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    const factorId = estado.factorId ?? inscripcion?.factorId
    if (!factorId) return

    setOcupado(true)
    setError(null)
    try {
      await confirmarCodigo(factorId, codigo)
      // Se vuelve a preguntar a Supabase en vez de darlo por hecho: lo que
      // decide si se pasa es el nivel real de la sesión, no que esta pantalla
      // crea haber terminado.
      const nuevo = await estadoMfa()
      if (nuevo.nivelActual === 'aal2') {
        onListo()
        return
      }
      setEstado(nuevo)
      setCodigo('')
      setError('El código se aceptó pero la sesión no subió de nivel. Vuelve a intentarlo.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo verificar el código')
      setCodigo('')
    } finally {
      setOcupado(false)
    }
  }

  const configurando = !estado.tieneFactor

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <Card className="w-full max-w-md p-8">
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-50 text-teal-600">
            {configurando ? <ShieldCheck size={28} /> : <KeyRound size={28} />}
          </div>
          <h1 className="text-2xl font-bold text-slate-900">
            {configurando ? 'Protege tu cuenta' : 'Verificación en dos pasos'}
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            {configurando
              ? 'Tu cuenta administra toda la plataforma. Antes de continuar, configura la verificación en dos pasos.'
              : 'Escribe el código de 6 dígitos de tu aplicación de autenticación.'}
          </p>
        </div>

        {configurando && (
          <div className="mt-6 space-y-4">
            <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-600">
              <li>
                Instala una aplicación de autenticación en tu teléfono (Google Authenticator,
                Microsoft Authenticator o similar).
              </li>
              <li>Escanea este código con ella.</li>
              <li>Escribe abajo los 6 dígitos que te muestre.</li>
            </ol>

            {inscripcion && (
              <div className="flex flex-col items-center gap-3">
                <img
                  src={inscripcion.qr}
                  alt="Código QR para la aplicación de autenticación"
                  className="h-44 w-44 rounded-xl border border-slate-200 bg-white p-2"
                />
                {/* El QR falla más de lo que parece: cámara mala, pantalla con
                    brillo, o alguien configurándolo desde el mismo teléfono en
                    el que está la web. El secreto en texto no es un extra. */}
                <details className="w-full text-center">
                  <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-700">
                    ¿No puedes escanearlo?
                  </summary>
                  <p className="mt-2 break-all rounded-lg bg-slate-100 p-2 font-mono text-xs text-slate-700">
                    {inscripcion.secreto}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Escribe esta clave en tu aplicación, eligiendo «introducir clave manualmente».
                  </p>
                </details>
              </div>
            )}
          </div>
        )}

        <form onSubmit={enviar} className="mt-6 space-y-4">
          <FieldGroup label="Código de 6 dígitos">
            <Input
              required
              autoFocus
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              maxLength={6}
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))}
              className="text-center text-2xl tracking-[0.4em]"
            />
          </FieldGroup>

          {error && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-600">{error}</p>}

          <Button
            type="submit"
            className="w-full"
            disabled={ocupado || codigo.length !== 6 || (configurando && !inscripcion)}
          >
            {ocupado ? 'Verificando...' : configurando ? 'Activar y continuar' : 'Verificar'}
          </Button>
        </form>

        {/* La única salida, y a propósito: no hay «ahora no». Si se pudiera
            posponer, la cuenta que borra clínicas enteras seguiría protegida
            solo por la contraseña, que es exactamente el hallazgo. */}
        <button
          type="button"
          onClick={onCerrarSesion}
          className="mt-6 flex w-full items-center justify-center gap-2 text-sm text-slate-500 hover:text-slate-800"
        >
          <LogOut size={14} />
          Cerrar sesión
        </button>

        {configurando && (
          <p className="mt-4 text-center text-xs text-slate-400">
            Guarda la clave en un lugar seguro. Si pierdes el teléfono y la clave, tendrás que
            recuperar el acceso desde el panel de Supabase.
          </p>
        )}
      </Card>
    </div>
  )
}
