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
      try {
        const motivo = await motivoDeBloqueo(usuario)
        if (montado) setBloqueo(motivo)
      } catch (err) {
        // Sin este catch, un fallo de red dejaba `cargando` en true para
        // siempre y `return null` (abajo) pintaba en blanco TODAS las rutas
        // protegidas: la aplicación entera desaparecía sin mensaje.
        //
        // Ante un fallo de verificación se deja pasar a propósito: esta
        // comprobación es de fachada (la barrera real es el signOut al iniciar
        // sesión y la RLS), así que un corte de red no debe echar a la clínica
        // entera. El canal de abajo vuelve a comprobarlo en cuanto llegue un
        // cambio, y el siguiente inicio de sesión también.
        console.error('No se pudo verificar el estado de la cuenta:', err)
      } finally {
        if (montado) setCargando(false)
      }
    }
    verificar()

    return () => { montado = false }
  }, [usuario])

  useEffect(() => {
    if (!usuario?.clinica_id) return
    // El tópico lleva la clínica: `supabase.channel()` reutiliza el canal que ya
    // exista con ese nombre, así que un nombre fijo hacía que el
    // `removeChannel` de una sesión se solapara con la suscripción de la
    // siguiente al cambiar de cuenta en la misma pestaña.
    const channel = supabase.channel(`clinicas-auth-${usuario.clinica_id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'clinicas', filter: `id=eq.${usuario.clinica_id}` }, async () => {
        try {
          setBloqueo(await motivoDeBloqueo(usuario))
        } catch (err) {
          console.error('No se pudo revisar el estado de la clínica:', err)
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [usuario])

  // Cerrar sesión es un efecto, no algo que se dispare pintando: llamarlo en el
  // cuerpo del render lo ejecutaba en cada pasada y dejaba la promesa suelta.
  useEffect(() => {
    if (bloqueo) {
      logout().catch((err) => console.error('No se pudo cerrar la sesión:', err))
    }
  }, [bloqueo, logout])

  if (!usuario) return <Navigate to="/login" replace />

  if (cargando) return null

  if (bloqueo) return <Navigate to="/login" replace />

  return <Outlet />
}
