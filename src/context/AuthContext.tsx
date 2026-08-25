import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { motivoDeBloqueo } from '../services/sesion'
import { verificarCredenciales } from '../services/cuentas'
import { supabase } from '../lib/supabase'
import { limpiarTablasCacheadas } from '../mocks/useDb'
import type { ModuloVetora, TipoNegocio, Usuario } from '../types/database'

/** Módulos completos que corresponden a una veterinaria sin restricciones. */
const MODULOS_VETERINARIA_COMPLETA: ModuloVetora[] = [
  'agenda', 'caja', 'inventario', 'historial_clinico',
  'internacion', 'asistente_ia', 'portal_cliente', 'whatsapp', 'metricas',
]

interface AuthContextValue {
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

const AuthContext = createContext<AuthContextValue | null>(null)

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function esUUIDValido(id: string | null): boolean {
  if (!id) return false
  return UUID_REGEX.test(id)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [cargando, setCargando] = useState(true)
  const [tipoNegocio, setTipoNegocio] = useState<TipoNegocio>('veterinaria')
  const [modulosHabilitados, setModulosHabilitados] = useState<ModuloVetora[]>(MODULOS_VETERINARIA_COMPLETA)
  const [sucursalOverride, setSucursalOverride] = useState<string | null>(() => {
    const guardada = localStorage.getItem('vetora_sucursal')
    return esUUIDValido(guardada) ? guardada : null
  })

  useEffect(() => {
    if (sucursalOverride && esUUIDValido(sucursalOverride)) {
      localStorage.setItem('vetora_sucursal', sucursalOverride)
    } else {
      localStorage.removeItem('vetora_sucursal')
    }
  }, [sucursalOverride])

  /**
   * Carga el tipo_negocio de la clínica y los modulos_habilitados de su plan.
   * Se llama al iniciar sesión y al reconectar una sesión existente.
   * Si falla (offline, RLS), mantiene los valores completos de veterinaria
   * para no romper el acceso de clínicas existentes.
   *
   * Va declarada ANTES del efecto que la usa, y no después, porque su array
   * de dependencias se evalúa durante el render: con la declaración debajo,
   * ese array leería la constante todavía en zona muerta temporal y la
   * aplicación reventaría al arrancar con «Cannot access before
   * initialization».
   */
  const cargarContextoClinica = useCallback(async (clinicaId: string) => {
    try {
      const { data: clinica } = await supabase
        .from('clinicas')
        .select('tipo_negocio, plan_id')
        .eq('id', clinicaId)
        .single()

      if (clinica) {
        setTipoNegocio((clinica.tipo_negocio as TipoNegocio) ?? 'veterinaria')

        const { data: plan } = await supabase
          .from('planes')
          .select('modulos_habilitados')
          .eq('id', clinica.plan_id)
          .single()

        if (plan?.modulos_habilitados && plan.modulos_habilitados.length > 0) {
          setModulosHabilitados(plan.modulos_habilitados as ModuloVetora[])
        }
      }
    } catch {
      // Mantener valores por defecto; no interrumpir el login
    }
  }, [])

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
          setUsuario(data as Usuario)
          // Cargar tipo de negocio y módulos del plan al reconectar sesión
          if (data.clinica_id) {
            cargarContextoClinica(data.clinica_id)
          }
        }
      }
      if (montado) setCargando(false)
    }

    inicializar()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setUsuario(null)
        // El caché de `useTable` vive a nivel de módulo y sobrevive al cierre de
        // sesión: sin esto, entrar con otra cuenta en la misma pestaña enseñaba
        // por un frame las filas de la clínica anterior.
        limpiarTablasCacheadas()
      }
    })

    return () => {
      montado = false
      subscription.unsubscribe()
    }
  }, [cargarContextoClinica])


  async function abrirSesion(verificado: Usuario) {
    const bloqueo = await motivoDeBloqueo(verificado)
    if (bloqueo) {
      // `verificarCredenciales` ya abrió sesión en Supabase, así que sin este
      // signOut el JWT seguiría siendo válido contra PostgREST aunque la
      // interfaz dijera que la cuenta está bloqueada: la suspensión sería un
      // control solo de fachada.
      await supabase.auth.signOut()
      throw new Error(bloqueo)
    }

    setUsuario(verificado)
    // Cargar tipo de negocio y módulos al iniciar sesión
    if (verificado.clinica_id) {
      await cargarContextoClinica(verificado.clinica_id)
    }
  }

  const value: AuthContextValue = {
    usuario,
    esPlataforma: usuario?.rol === 'superadmin',
    // Admin no tiene sucursal fija (ve todas) y puede elegir una para filtrar la vista.
    sucursalActivaId: usuario?.sucursal_id ?? sucursalOverride,
    tipoNegocio,
    modulosHabilitados,
    tieneModulo: (modulo: ModuloVetora) => modulosHabilitados.includes(modulo),
    entrarConCredenciales: async (email: string, password: string) => {
      // Primero la contraseña; los motivos de bloqueo se cuentan solo a quien
      // ya demostró ser el dueño de la cuenta.
      const verificado = await verificarCredenciales(email, password)
      await abrirSesion(verificado)
    },
    entrarComo: async (usuarioVerificado: Usuario) => await abrirSesion(usuarioVerificado),
    logout: async () => {
      await supabase.auth.signOut()
      setUsuario(null)
      setTipoNegocio('veterinaria')
      setModulosHabilitados(MODULOS_VETERINARIA_COMPLETA)
    },
    setSucursalActivaId: (id: string | null) => setSucursalOverride(id),
  }

  if (cargando) return null // O un spinner si prefieres

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}
