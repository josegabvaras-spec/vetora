import { useEffect, useState } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { motivoDeBloqueo } from '../../services/sesion'
import { supabase } from '../../lib/supabase'

export function ProtectedRoute() {
  const { usuario, logout } = useAuth()
  const [bloqueo, setBloqueo] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    if (!usuario) {
      setCargando(false)
      return
    }

    let montado = true
    async function verificar() {
      const motivo = await motivoDeBloqueo(usuario)
      if (montado) {
        setBloqueo(motivo)
        setCargando(false)
      }
    }
    verificar()

    return () => { montado = false }
  }, [usuario])

  useEffect(() => {
    if (!usuario?.clinica_id) return
    const channel = supabase.channel('clinicas-auth')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'clinicas', filter: `id=eq.${usuario.clinica_id}` }, async () => {
         const motivo = await motivoDeBloqueo(usuario)
         setBloqueo(motivo)
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [usuario])

  if (!usuario) return <Navigate to="/login" replace />

  if (cargando) return null

  if (bloqueo) {
    logout()
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}
