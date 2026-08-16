import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { db } from '../mocks/db'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { FieldGroup, Input, Select } from '../components/ui/Field'
import type { Clinica, Usuario, Credencial, Cliente } from '../types/database'

export function RegistroClientePage() {
  const navigate = useNavigate()
  const { entrarConCredenciales } = useAuth()
  
  const [clinicas, setClinicas] = useState<Clinica[]>([])
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
    // Cargar clínicas activas
    const todas = db.get('clinicas')
    setClinicas(todas.filter(c => c.estado === 'activa'))
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setRegistrando(true)
    setError(null)

    try {
      // 1. Verificar si el email ya existe en credenciales (no se puede usar el mismo email globalmente)
      const existeCorreo = db.get('credenciales').some(c => c.email === form.email)
      if (existeCorreo) throw new Error('Este correo ya está registrado.')

      // 2. Crear el Usuario y Credencial mock
      const userId = `cliente-user-${Date.now()}`
      const nuevoUsuario: Usuario = {
        id: userId,
        clinica_id: form.clinicaId,
        sucursal_id: null,
        nombre: form.nombre,
        email: form.email,
        whatsapp: form.whatsapp,
        rol: 'cliente',
        activo: true,
        created_at: new Date().toISOString()
      }
      
      const nuevaCredencial: Credencial = {
        id: `cred-${Date.now()}`,
        usuario_id: userId,
        email: form.email,
        hash: form.password, // Solo mock
        salt: 'salt',
        actualizada_at: new Date().toISOString()
      }

      // Guardar en la "base de datos"
      db.set('usuarios', [...db.get('usuarios'), nuevoUsuario])
      db.set('credenciales', [...db.get('credenciales'), nuevaCredencial])

      // 3. Vincular o crear el Cliente
      const clientes = db.get('clientes')
      const clienteExistenteIndex = clientes.findIndex(c => c.clinica_id === form.clinicaId && c.ci === form.ci)
      
      if (clienteExistenteIndex !== -1) {
        // Vincular el perfil existente al nuevo usuario
        const clienteActualizado = { ...clientes[clienteExistenteIndex], usuario_id: userId }
        const nuevosClientes = [...clientes]
        nuevosClientes[clienteExistenteIndex] = clienteActualizado
        db.set('clientes', nuevosClientes)
      } else {
        // Crear un nuevo perfil de cliente vacío
        const nuevoCliente: Cliente = {
          id: `cliente-${Date.now()}`,
          clinica_id: form.clinicaId,
          usuario_id: userId,
          nombre: form.nombre,
          whatsapp: form.whatsapp,
          ci: form.ci,
          created_at: new Date().toISOString()
        }
        db.set('clientes', [...clientes, nuevoCliente])
      }

      // 4. Iniciar sesión automáticamente
      await entrarConCredenciales(form.email, form.password)
      navigate('/portal-cliente/dashboard', { replace: true })

    } catch (err: any) {
      setError(err.message || 'Ocurrió un error al registrarse.')
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
                <option key={c.id} value={c.id}>{c.nombre} - {c.ciudad}</option>
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
