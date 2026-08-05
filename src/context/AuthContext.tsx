import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { db } from '../mocks/db'
import { motivoDeBloqueo } from '../services/sesion'
import { verificarCredenciales } from '../services/cuentas'
import type { Usuario } from '../types/database'

const SESSION_KEY = 'vetora-mock-session'

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

function buscarUsuario(id: string | null): Usuario | null {
  if (!id) return null
  // Lectura global a propósito: para saber a qué clínica pertenece quien entra
  // hay que mirar antes de tener clínica. No muta nada, así que puede llamarse
  // durante el render sin notificar a los suscriptores del store.
  return db.getGlobal('usuarios').find((u) => u.id === id) ?? null
}

/**
 * Fija en la "base de datos" el inquilino de la sesión. A partir de ahí, cada
 * consulta y cada inserción quedan acotadas a esa clínica, igual que haría RLS
 * en Supabase.
 */
function activarClinicaDe(usuario: Usuario | null) {
  db.setClinicaActiva(usuario?.clinica_id ?? null)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuarioId, setUsuarioId] = useState<string | null>(() => {
    const guardado = localStorage.getItem(SESSION_KEY)
    // Se resuelve antes del primer render: las páginas llaman a los servicios
    // nada más montarse y ya deben estar acotadas a su clínica.
    activarClinicaDe(buscarUsuario(guardado))
    return guardado
  })
  const [sucursalOverride, setSucursalOverride] = useState<string | null>(null)

  function abrirSesion(verificado: Usuario) {
    const bloqueo = motivoDeBloqueo(verificado)
    if (bloqueo) throw new Error(bloqueo)

    activarClinicaDe(verificado)
    localStorage.setItem(SESSION_KEY, verificado.id)
    setUsuarioId(verificado.id)
  }

  // Solo lectura: la clínica activa se fija al entrar y al restaurar la sesión,
  // nunca durante el render (cambiarla notifica al store y React lo prohíbe).
  const usuario = useMemo(() => buscarUsuario(usuarioId), [usuarioId])

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
    logout: () => {
      localStorage.removeItem(SESSION_KEY)
      db.setClinicaActiva(null)
      setUsuarioId(null)
    },
    setSucursalActivaId: (id: string) => setSucursalOverride(id),
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}
