import { createContext, useContext } from 'react'
import type { ModuloVetora, TipoNegocio, Usuario } from '../types/database'

/**
 * El contexto de sesión y su hook, aparte del proveedor.
 *
 * Están aquí y no en `AuthContext.tsx` porque ese fichero exporta un
 * COMPONENTE (`AuthProvider`), y un módulo que exporta componentes y no
 * componentes a la vez rompe el Fast Refresh de Vite: al tocar cualquiera de
 * las dos cosas se recarga entero y se pierde el estado de la pantalla. Con 73
 * ficheros importando `useAuth`, eso era medio proyecto recargándose.
 */

export interface AuthContextValue {
  usuario: Usuario | null
  /** Usuario de plataforma: administra clínicas y planes, no datos clínicos. */
  esPlataforma: boolean
  sucursalActivaId: string | null
  /**
   * Segmento de negocio del establecimiento. Es 'veterinaria' para el superadmin
   * y para clínicas que no tienen el campo todavía (compatibilidad hacia atrás).
   */
  tipoNegocio: TipoNegocio
  /**
   * Módulos habilitados según el plan contratado. Permite mostrar/ocultar
   * secciones de la UI sin consultar el servidor en cada render.
   */
  modulosHabilitados: ModuloVetora[]
  /**
   * Comprueba si un módulo concreto está disponible en el plan activo.
   * Uso: `const { tieneModulo } = useAuth(); if (tieneModulo('asistente_ia')) ...`
   */
  tieneModulo: (modulo: ModuloVetora) => boolean
  /** Inicio de sesión normal. Asíncrono porque verificar el hash lo es. */
  entrarConCredenciales: (email: string, password: string) => Promise<void>
  /**
   * Abre sesión con un usuario ya verificado. Lo usa la pantalla del enlace de
   * acceso, justo después de que la persona cree su contraseña.
   */
  entrarComo: (usuario: Usuario) => Promise<void>
  logout: () => Promise<void>
  setSucursalActivaId: (id: string | null) => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}
