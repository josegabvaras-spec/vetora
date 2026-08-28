import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { FieldGroup, Input, Select } from '../components/ui/Field'
import {
  listClinicasParaRegistro,
  registrarClientePortal,
  type ClinicaParaRegistro,
  type MotivoVinculo,
} from '../services/portalCliente'
import { PASSWORD_MINIMO } from '../services/cuentas'

/** Qué decirle a quien se registró pero cuya ficha no se encontró. */
const EXPLICACION: Record<MotivoVinculo, string> = {
  ci_y_whatsapp: '',
  whatsapp_unico: '',
  ambiguo:
    'Encontramos más de una ficha con tu número de WhatsApp, así que por seguridad no elegimos ninguna. Tu clínica puede unirlas en un momento.',
  sin_coincidencia:
    'No encontramos ninguna ficha con tu carnet ni con tu WhatsApp en esa clínica. Puede ser que los datos estén anotados de otra forma, o que hayas elegido una clínica distinta a la que atiende a tu mascota.',
}

export function RegistroClientePage() {
  const navigate = useNavigate()

  const [clinicas, setClinicas] = useState<ClinicaParaRegistro[]>([])
  const [form, setForm] = useState({
    clinicaId: '',
    nombre: '',
    email: '',
    password: '',
    ci: '',
    whatsapp: '',
  })
  
  const [error, setError] = useState<string | null>(null)
  const [registrando, setRegistrando] = useState(false)
  // Solo se rellena cuando la cuenta se creó pero NO se pudo vincular: ese caso
  // no navega, se explica.
  const [sinVincular, setSinVincular] = useState<MotivoVinculo | null>(null)

  useEffect(() => {
    let montado = true
    listClinicasParaRegistro()
      .then((lista) => {
        if (montado) setClinicas(lista)
      })
      .catch(() => {
        if (montado) setError('No se pudieron cargar las clínicas. Vuelve a intentarlo.')
      })
    return () => {
      montado = false
    }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    // Se valida aquí con el mismo mínimo que aplica el servidor: si no, el
    // requisito se descubría con un error tras el viaje, a veces en inglés.
    if (form.password.length < PASSWORD_MINIMO) {
      setError(`La contraseña debe tener al menos ${PASSWORD_MINIMO} caracteres`)
      return
    }
    setRegistrando(true)
    setError(null)

    try {
      // El alta entera ocurre en el servidor: el rol y la clínica no salen de
      // este formulario, y la vinculación por CI tampoco se decide aquí.
      const { vinculado, motivo } = await registrarClientePortal({
        clinica_id: form.clinicaId,
        nombre: form.nombre,
        email: form.email,
        password: form.password,
        ci: form.ci,
        whatsapp: form.whatsapp,
      })

      // Si no se vinculó, el portal saldría vacío y sin ninguna pista de por
      // qué. Se para aquí y se explica, con la sesión ya iniciada.
      if (!vinculado) {
        setSinVincular(motivo)
        setRegistrando(false)
        return
      }

      navigate('/portal-cliente/dashboard', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ocurrió un error al registrarse.')
      setRegistrando(false)
    }
  }

  if (sinVincular) {
    return (
      <div className="relative flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <Card className="relative z-10 w-full max-w-md p-8">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-slate-900">Tu cuenta ya está lista</h1>
            <p className="mt-2 text-sm text-slate-500">
              Pero todavía no encontramos la ficha de tu mascota.
            </p>
          </div>

          <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm text-amber-900">{EXPLICACION[sinVincular]}</p>
            <p className="mt-3 text-sm font-semibold text-amber-900">
              Escribe a tu clínica y pídeles que unan tu cuenta ({form.email}) con la ficha de tu mascota. Lo
              hacen en un clic desde su sección «Clientes».
            </p>
          </div>

          <Button className="mt-6 w-full" onClick={() => navigate('/portal-cliente/dashboard', { replace: true })}>
            Ir a mi portal
          </Button>
        </Card>
      </div>
    )
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <Card className="relative z-10 w-full max-w-md p-8">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-slate-900">Registro de Cliente</h1>
          <p className="mt-2 text-sm text-slate-500">
            Crea tu cuenta para acceder al historial clínico y de vacunas de tus mascotas.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <FieldGroup label="Clínica Veterinaria">
            <Select
              required
              value={form.clinicaId}
              onChange={(e) => setForm(f => ({ ...f, clinicaId: e.target.value }))}
            >
              <option value="">Selecciona tu clínica...</option>
              {clinicas.map(c => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </Select>
            {/* La lista es de TODA la plataforma (`clinicas_para_registro`), no
                solo de las del dueño: elegir mal acota la búsqueda al inquilino
                equivocado y no encuentra nada, en silencio. */}
            <p className="mt-1 text-xs text-slate-500">
              Elige exactamente la clínica donde atienden a tu mascota. Si eliges otra, no encontraremos su ficha.
            </p>
          </FieldGroup>

          <FieldGroup label="Carnet de Identidad (CI)">
            <Input
              required
              placeholder="Solo el número, sin el complemento"
              value={form.ci}
              onChange={(e) => setForm(f => ({ ...f, ci: e.target.value }))}
            />
            <p className="mt-1 text-xs text-slate-500">
              Usa el mismo carnet y WhatsApp que diste en la clínica: es lo que conecta tu cuenta con la ficha de
              tu mascota.
            </p>
          </FieldGroup>

          <FieldGroup label="Nombre Completo">
            <Input
              required
              value={form.nombre}
              onChange={(e) => setForm(f => ({ ...f, nombre: e.target.value }))}
            />
          </FieldGroup>

          <div className="grid grid-cols-2 gap-4">
            <FieldGroup label="WhatsApp">
              <Input
                required
                type="tel"
                value={form.whatsapp}
                onChange={(e) => setForm(f => ({ ...f, whatsapp: e.target.value }))}
              />
            </FieldGroup>
            
            <FieldGroup label="Correo Electrónico">
              <Input
                required
                type="email"
                value={form.email}
                onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))}
              />
            </FieldGroup>
          </div>

          <FieldGroup label="Contraseña">
            <Input
              required
              type="password"
              minLength={PASSWORD_MINIMO}
              placeholder={`Al menos ${PASSWORD_MINIMO} caracteres`}
              value={form.password}
              onChange={(e) => setForm(f => ({ ...f, password: e.target.value }))}
            />
          </FieldGroup>

          {error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{error}</p>}

          <Button type="submit" disabled={registrando} className="w-full mt-4">
            {registrando ? 'Registrando...' : 'Completar Registro'}
          </Button>

          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="text-sm text-indigo-600 hover:underline"
            >
              ¿Ya tienes cuenta? Inicia sesión
            </button>
          </div>
        </form>
      </Card>
    </div>
  )
}
