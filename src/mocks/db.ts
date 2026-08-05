import type {
  Cita,
  Cliente,
  Clinica,
  ConsentimientoCirugia,
  Credencial,
  DesparasitacionAplicada,
  HistorialClinico,
  Internacion,
  Invitacion,
  MovimientoInventario,
  NotaInternacion,
  Paciente,
  Plan,
  Cobro,
  CobroLinea,
  Producto,
  Servicio,
  Sucursal,
  TurnoCaja,
  Usuario,
  VacunaAplicada,
} from '../types/database'
import {
  seedCitas,
  seedClientes,
  seedClinicas,
  seedCobroLineas,
  seedCobros,
  seedConsentimientos,
  seedCredenciales,
  seedHistorial,
  seedInternaciones,
  seedMovimientos,
  seedNotasInternacion,
  seedPacientes,
  seedPlanes,
  seedProductos,
  seedServicios,
  seedSucursales,
  seedTurnosCaja,
  seedInvitaciones,
  seedUsuarios,
  seedVacunas,
  seedDesparasitaciones,
} from './seed'

// "Base de datos" en memoria (persistida en localStorage) que simula Supabase
// mientras no hay credenciales reales configuradas (ver isMockMode). Los
// servicios en src/services/*.ts son el único punto que debería importar esto,
// para que migrar a llamadas reales de Supabase sea un cambio localizado.

export interface Tables {
  planes: Plan[]
  clinicas: Clinica[]
  sucursales: Sucursal[]
  usuarios: Usuario[]
  credenciales: Credencial[]
  invitaciones: Invitacion[]
  clientes: Cliente[]
  pacientes: Paciente[]
  citas: Cita[]
  historial_clinico: HistorialClinico[]
  consentimientos_cirugia: ConsentimientoCirugia[]
  vacunas_aplicadas: VacunaAplicada[]
  desparasitaciones_aplicadas: DesparasitacionAplicada[]
  productos: Producto[]
  movimientos_inventario: MovimientoInventario[]
  internaciones: Internacion[]
  notas_internacion: NotaInternacion[]
  turnos_caja: TurnoCaja[]
  cobros: Cobro[]
  cobro_lineas: CobroLinea[]
  servicios: Servicio[]
}

// La versión sube cuando el modelo cambia de forma que una base guardada con la
// anterior quedaría inconsistente (columnas obligatorias nuevas, referencias
// que cambian de nombre). Al subirla, la demostración parte de datos frescos.
// v5: cada usuario tiene correo y su cuenta con contraseña.
const STORAGE_KEY = 'vetora-mock-db-v5'

function loadInitialState(): Tables {
  const seed: Tables = {
    planes: seedPlanes,
    clinicas: seedClinicas,
    sucursales: seedSucursales,
    usuarios: seedUsuarios,
    credenciales: seedCredenciales,
    invitaciones: seedInvitaciones,
    clientes: seedClientes,
    pacientes: seedPacientes,
    citas: seedCitas,
    historial_clinico: seedHistorial,
    consentimientos_cirugia: seedConsentimientos,
    vacunas_aplicadas: seedVacunas,
    desparasitaciones_aplicadas: seedDesparasitaciones,
    productos: seedProductos,
    movimientos_inventario: seedMovimientos,
    internaciones: seedInternaciones,
    notas_internacion: seedNotasInternacion,
    turnos_caja: seedTurnosCaja,
    cobros: seedCobros,
    cobro_lineas: seedCobroLineas,
    servicios: seedServicios,
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return seed
    const parsed = JSON.parse(raw) as Partial<Tables>

    // El merge de tablas sólo cubre TABLAS nuevas. Si al modelo se le añade una
    // COLUMNA, las filas ya guardadas llegarían sin ella y romperían al usarla
    // (p. ej. una tarifa `undefined` en un cálculo). Por eso cada fila
    // persistida se completa con los campos de su fila equivalente del seed.
    const fusionado: Record<string, unknown> = { ...seed, ...parsed }
    const porTabla = seed as unknown as Record<string, { id: string }[]>
    for (const clave of Object.keys(seed)) {
      const persistidas = (parsed as unknown as Record<string, unknown>)[clave]
      if (!Array.isArray(persistidas)) continue
      const semilla = porTabla[clave]
      fusionado[clave] = (persistidas as { id: string }[]).map((fila) => {
        const base = semilla.find((s) => s.id === fila.id)
        return base ? { ...base, ...fila } : fila
      })
    }
    return fusionado as unknown as Tables
  } catch {
    return seed
  }
}

let state: Tables = loadInitialState()
const listeners = new Set<() => void>()

/**
 * Clínica del usuario en sesión. Mientras está fijada, la "base de datos" solo
 * deja ver y escribir las filas de esa clínica: es el equivalente en el mock a
 * las políticas RLS de Supabase (`clinica_id = auth_clinica_id()`), y evita que
 * cada servicio tenga que acordarse de filtrar. `null` = usuario de plataforma,
 * que ve todas las clínicas pero no entra a sus datos clínicos.
 */
let clinicaActiva: string | null = null

/**
 * Vista filtrada por tabla. Se cachea porque `useTable` usa
 * `useSyncExternalStore`: si `get` devolviera un array nuevo en cada llamada,
 * React entraría en un bucle infinito de re-render.
 */
let vistas = new Map<keyof Tables, unknown[]>()

/**
 * Tablas que no pertenecen a ninguna clínica. El catálogo de planes lo define la
 * plataforma y lo leen todos los inquilinos (necesitan saber sus propios
 * límites); las credenciales son el equivalente a `auth.users` de Supabase, que
 * también es global y se consulta antes de saber a qué clínica entra nadie.
 */
const TABLAS_GLOBALES = new Set<keyof Tables>(['planes', 'credenciales'])

/** En `clinicas` el inquilino es la propia fila; en el resto, su `clinica_id`. */
function esDeLaClinica(table: keyof Tables, fila: unknown, clinicaId: string): boolean {
  const registro = fila as { id?: string; clinica_id?: string | null }
  return table === 'clinicas' ? registro.id === clinicaId : registro.clinica_id === clinicaId
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Almacenamiento no disponible (modo privado, cuota excedida, etc.): se ignora,
    // la app sigue funcionando solo con el estado en memoria de esta pestaña.
  }
}

function notificar() {
  vistas = new Map()
  listeners.forEach((l) => l())
}

export const db = {
  get<K extends keyof Tables>(table: K): Tables[K] {
    if (!clinicaActiva || TABLAS_GLOBALES.has(table)) return state[table]

    const cacheada = vistas.get(table)
    if (cacheada) return cacheada as Tables[K]

    const vista = (state[table] as unknown[]).filter((f) => esDeLaClinica(table, f, clinicaActiva!))
    vistas.set(table, vista)
    return vista as Tables[K]
  },

  set<K extends keyof Tables>(table: K, rows: Tables[K]) {
    if (clinicaActiva && !TABLAS_GLOBALES.has(table)) {
      // Los servicios guardan con `db.set(tabla, [...db.get(tabla), nueva])`, y
      // `get` solo devolvió las filas de esta clínica: sin conservar aquí las
      // ajenas, guardar una cita borraría las de las demás clínicas.
      const ajenas = (state[table] as unknown[]).filter((f) => !esDeLaClinica(table, f, clinicaActiva!))
      state = { ...state, [table]: [...ajenas, ...rows] as Tables[K] }
    } else {
      state = { ...state, [table]: rows }
    }
    persist()
    notificar()
  },

  /**
   * Lee una tabla sin el filtro por clínica. Escape explícito y acotado al
   * login: para saber a qué clínica pertenece quien entra hay que mirar antes
   * de tener clínica. No debe usarse desde los servicios de negocio.
   */
  getGlobal<K extends keyof Tables>(table: K): Tables[K] {
    return state[table]
  },

  /**
   * Escribe una tabla entera sin filtro. Usado por la importación del superadmin.
   */
  setGlobal<K extends keyof Tables>(table: K, rows: Tables[K]) {
    state = { ...state, [table]: rows }
    persist()
    notificar()
  },

  /** Fija el inquilino de la sesión (o `null` para el usuario de plataforma). */
  setClinicaActiva(clinicaId: string | null) {
    if (clinicaActiva === clinicaId) return
    clinicaActiva = clinicaId
    notificar()
  },

  /** Clínica con la que se sella lo que se crea. Lanza si no hay sesión de clínica. */
  clinicaActivaId(): string {
    if (!clinicaActiva) {
      throw new Error('No hay una clínica activa en la sesión')
    }
    return clinicaActiva
  },

  reset() {
    localStorage.removeItem(STORAGE_KEY)
    state = loadInitialState()
    notificar()
  },

  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
}

export function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`
}
