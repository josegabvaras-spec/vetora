import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { db } from '../mocks/db'
import { motivoDeBloqueo } from '../services/sesion'
import { verificarCredenciales } from '../services/cuentas'
import { supabase } from '../lib/supabase'
import type { Usuario } from '../types/database'

interface AuthContextValue {
  usuario: Usuario | null
  /** Usuario de plataforma: administra clínicas y planes, no datos clínicos. */
  esPlataforma: boolean
  sucursalActivaId: string | null
  /** Inicio de sesión normal. Asíncrono porque verificar el hash lo es. */
  entrarConCredenciales: (email: string, password: string) => Promise<void>
  /**
   * Abre sesión con un usuario ya verificado. Lo usa la pantalla del enlace de
   * acceso, justo después de que la persona cree su contraseña.
   */
  entrarComo: (usuario: Usuario) => void
  logout: () => void
  setSucursalActivaId: (id: string) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)



/**
 * Fija en la "base de datos" el inquilino de la sesión. A partir de ahí, cada
 * consulta y cada inserción quedan acotadas a esa clínica, igual que haría RLS
 * en Supabase.
 */
function activarClinicaDe(usuario: Usuario | null) {
  db.setClinicaActiva(usuario?.clinica_id ?? null)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [cargando, setCargando] = useState(true)
  const [sucursalOverride, setSucursalOverride] = useState<string | null>(null)

  useEffect(() => {
    let montado = true
    async function inicializar() {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        const { data } = await supabase
          .from('usuarios')
          .select('*')
          .eq('id', session.user.id)
          .single()
        
        if (data && montado) {
          activarClinicaDe(data as Usuario)
          setUsuario(data as Usuario)
        }
      }
      if (montado) setCargando(false)
    }

    inicializar()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        activarClinicaDe(null)
        setUsuario(null)
      }
    })

    return () => {
      montado = false
      subscription.unsubscribe()
    }
  }, [])

  function abrirSesion(verificado: Usuario) {
    const bloqueo = motivoDeBloqueo(verificado)
    if (bloqueo) throw new Error(bloqueo)

    activarClinicaDe(verificado)
    setUsuario(verificado)
  }

  const value: AuthContextValue = {
    usuario,
    esPlataforma: usuario?.rol === 'superadmin',
    // Admin no tiene sucursal fija (ve todas) y puede elegir una para filtrar la vista.
    sucursalActivaId: usuario?.sucursal_id ?? sucursalOverride,
    entrarConCredenciales: async (email: string, password: string) => {
      // Primero la contraseña; los motivos de bloqueo se cuentan solo a quien
      // ya demostró ser el dueño de la cuenta.
      const verificado = await verificarCredenciales(email, password)
      abrirSesion(verificado)
    },
    entrarComo: (usuarioVerificado: Usuario) => abrirSesion(usuarioVerificado),
    logout: async () => {
      await supabase.auth.signOut()
      db.setClinicaActiva(null)
      setUsuario(null)
    },
    setSucursalActivaId: (id: string) => setSucursalOverride(id),
  }

  if (cargando) return null // O un spinner si prefieres

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}
