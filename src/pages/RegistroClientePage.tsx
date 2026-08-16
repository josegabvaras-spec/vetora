import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { FieldGroup, Input, Select } from '../components/ui/Field'
import type { Clinica } from '../types/database'

export function RegistroClientePage() {
  const navigate = useNavigate()
  
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
    async function cargarClinicas() {
      const { data } = await supabase.rpc('clinicas_para_registro')
      if (data) setClinicas(data as any)
    }
    cargarClinicas()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setRegistrando(true)
    setError(null)

    try {
      // 1. Crear el usuario en auth (esto iniciará sesión automáticamente)
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
      })

      if (authError) throw new Error(authError.message)
      if (!authData.user) throw new Error('No se pudo crear la cuenta.')

      const userId = authData.user.id

      // 2. Crear registro en la tabla pública de usuarios
      const { error: userError } = await supabase.from('usuarios').insert({
        id: userId,
        clinica_id: form.clinicaId,
        nombre: form.nombre,
        email: form.email,
        whatsapp: form.whatsapp,
        rol: 'cliente',
        activo: true,
      })

      if (userError) throw new Error(`Error al registrar usuario: ${userError.message}`)

      // 3. Vincular o crear el Cliente
      // Primero buscamos si ya existe en esta clínica con el mismo CI
      const { data: clientesExistentes } = await supabase
        .from('clientes')
        .select('*')
        .eq('clinica_id', form.clinicaId)
        .eq('ci', form.ci)

      if (clientesExistentes && clientesExistentes.length > 0) {
        // Actualizar cliente existente vinculando su usuario_id
        const clienteExistente = clientesExistentes[0]
        const { error: updateError } = await supabase
          .from('clientes')
          .update({ usuario_id: userId } as any)
          .eq('id', clienteExistente.id)
          
        if (updateError) throw new Error(`Error al vincular perfil: ${updateError.message}`)
      } else {
        // Crear nuevo cliente
        const { error: insertError } = await supabase
          .from('clientes')
          .insert({
            clinica_id: form.clinicaId,
            usuario_id: userId,
            nombre: form.nombre,
            whatsapp: form.whatsapp,
            ci: form.ci,
          } as any)

        if (insertError) throw new Error(`Error al crear perfil de cliente: ${insertError.message}`)
      }

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
