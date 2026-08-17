import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { FieldGroup, Input, Select } from '../components/ui/Field'
import {
  listClinicasParaRegistro,
  registrarClientePortal,
  type ClinicaParaRegistro,
} from '../services/portalCliente'

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
    setRegistrando(true)
    setError(null)

    try {
      // El alta entera ocurre en el servidor: el rol y la clínica no salen de
      // este formulario, y la vinculación por CI tampoco se decide aquí.
      await registrarClientePortal({
        clinica_id: form.clinicaId,
        nombre: form.nombre,
        email: form.email,
        password: form.password,
        ci: form.ci,
        whatsapp: form.whatsapp,
      })

      navigate('/portal-cliente/dashboard', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ocurrió un error al registrarse.')
      setRegistrando(false)
    }
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
          </FieldGroup>

          <FieldGroup label="Carnet de Identidad (CI)">
            <Input
              required
              placeholder="Para vincular con el registro de la clínica"
              value={form.ci}
              onChange={(e) => setForm(f => ({ ...f, ci: e.target.value }))}
            />
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
