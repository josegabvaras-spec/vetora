import { useCallback, useSyncExternalStore } from 'react'
import { supabase } from '../lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { Database } from '../types/supabase'

type Tables = Database['public']['Tables']
type TableName = keyof Tables

/**
 * Una suscripción por tabla, compartida por toda la aplicación.
 *
 * `supabase.channel(topico)` **reutiliza** el canal que ya exista con ese
 * nombre, y un canal ya suscrito no admite más `.on(...)`. Como `sucursales` y
 * `clinicas` las piden ocho componentes cada una, montar el segundo reventaba
 * con «cannot add postgres_changes callbacks after subscribe()». De paso se
 * evitan ocho `select('*')` idénticos y ocho recargas por cada cambio.
 *
 * El registro vive a nivel de módulo, no dentro del hook: los componentes se
 * montan y desmontan, la suscripción no.
 */
interface Entrada {
  /** Referencia estable: `useSyncExternalStore` compara por identidad y
   *  devolver un array nuevo en cada lectura sería un bucle infinito. */
  filas: unknown[]
  /** Quien necesita las filas. Solo si hay alguno se descarga la tabla. */
  oyentesDatos: Set<() => void>
  /** Quien solo quiere enterarse de que la tabla cambió (ver `useSuscripcionTabla`). */
  oyentesRevision: Set<() => void>
  /** Sube en cada cambio. Es un número, así que sirve de dependencia de efecto. */
  revision: number
  canal: RealtimeChannel | null
}

const SIN_FILAS: never[] = []
const registro = new Map<string, Entrada>()

function entradaDe(tabla: string): Entrada {
  let entrada = registro.get(tabla)
  if (!entrada) {
    entrada = {
      filas: SIN_FILAS,
      oyentesDatos: new Set(),
      oyentesRevision: new Set(),
      revision: 0,
      canal: null,
    }
    registro.set(tabla, entrada)
  }
  return entrada
}

function avisarATodos(entrada: Entrada): void {
  entrada.revision++
  for (const avisar of entrada.oyentesDatos) avisar()
  for (const avisar of entrada.oyentesRevision) avisar()
}

async function recargar(tabla: string): Promise<void> {
  // El filtrado por clínica lo hacen las RLS, no esta consulta.
  const { data, error } = await supabase.from(tabla as TableName).select('*')
  if (error) {
    console.error(`useTable(${tabla}):`, error.message)
    return
  }

  const entrada = entradaDe(tabla)
  entrada.filas = (data ?? []) as unknown[]
  avisarATodos(entrada)
}

/**
 * Reacción a un cambio en la tabla.
 *
 * Solo se descarga la tabla si alguien está consumiendo sus filas. Si los
 * únicos interesados son suscriptores de revisión, basta con avisarles: ellos
 * recargan lo suyo con una consulta acotada desde su servicio.
 */
function alCambiarLaTabla(tabla: string): void {
  const entrada = entradaDe(tabla)
  if (entrada.oyentesDatos.size > 0) {
    recargar(tabla)
  } else {
    avisarATodos(entrada)
  }
}

/**
 * El canal se crea una vez y no se cierra al quedarse sin oyentes: `removeChannel`
 * es asíncrono y volver a abrir el mismo tópico antes de que termine reproduce
 * el error de arriba. Las tablas son pocas y fijas, así que mantenerlos abiertos
 * sale más barato que arriesgar esa carrera.
 */
function abrirCanal(entrada: Entrada, tabla: string): void {
  if (entrada.canal) return
  entrada.canal = supabase
    .channel(`tabla:${tabla}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: tabla }, () => {
      alCambiarLaTabla(tabla)
    })
    .subscribe()
}

function suscribir(tabla: string, alCambiar: () => void): () => void {
  const entrada = entradaDe(tabla)
  entrada.oyentesDatos.add(alCambiar)

  // De cero a un consumidor de datos: la pantalla acaba de aparecer y puede
  // traer filas viejas de la vez anterior.
  if (entrada.oyentesDatos.size === 1) recargar(tabla)

  abrirCanal(entrada, tabla)

  return () => {
    entrada.oyentesDatos.delete(alCambiar)
  }
}

/** Suscripción sin descarga: solo interesa saber que la tabla cambió. */
function suscribirRevision(tabla: string, alCambiar: () => void): () => void {
  const entrada = entradaDe(tabla)
  entrada.oyentesRevision.add(alCambiar)
  abrirCanal(entrada, tabla)

  return () => {
    entrada.oyentesRevision.delete(alCambiar)
  }
}

/**
 * Vacía lo cacheado de todas las tablas.
 *
 * El registro vive a nivel de módulo y sobrevive al cierre de sesión, así que
 * si en la misma pestaña entra otra cuenta, el primer render de cada pantalla
 * pintaba las filas del inquilino anterior hasta que llegara el `select` nuevo.
 * Es una ventana de un frame, pero es cruce de datos entre clínicas: el
 * aislamiento lo garantiza la RLS en el servidor, y esto es memoria del cliente
 * que la RLS ya no puede tocar.
 *
 * Los canales no se cierran a propósito (ver la nota de `suscribir`): solo se
 * descartan los datos, y la recarga siguiente los repuebla con la sesión nueva.
 */
export function limpiarTablasCacheadas(): void {
  for (const entrada of registro.values()) {
    entrada.filas = SIN_FILAS
    avisarATodos(entrada)
  }
}

/**
 * Filas de una tabla, al día: se re-renderiza cuando Postgres avisa.
 *
 * ⚠️ Descarga la tabla **entera** del inquilino con un `select('*')` sin
 * acotar, y PostgREST corta en 1000 filas. Sirve para catálogos con techo
 * (`sucursales`, `usuarios`, `servicios`, `productos`, `clinicas`); para tablas
 * que crecen sin límite (`citas`, `historial_clinico`, `movimientos_inventario`,
 * `cobros`, `pacientes`) los datos se truncan **en silencio**.
 *
 * Si lo único que necesitas es enterarte de que la tabla cambió para recargar
 * lo tuyo, usa `useSuscripcionTabla`, que no descarga nada.
 */
export function useTable<T extends TableName>(table: T): Tables[T]['Row'][] {
  const suscribirse = useCallback((alCambiar: () => void) => suscribir(table, alCambiar), [table])
  const leer = useCallback(() => entradaDe(table).filas, [table])

  return useSyncExternalStore(suscribirse, leer) as Tables[T]['Row'][]
}

/**
 * Avisa de que una tabla cambió, sin descargarla.
 *
 * Devuelve un número que sube en cada cambio, pensado para usarse como
 * dependencia de un `useEffect` que recarga con una consulta acotada:
 *
 * ```tsx
 * const revisionCitas = useSuscripcionTabla('citas')
 * useEffect(() => { recargar() }, [recargar, revisionCitas])
 * ```
 *
 * Media docena de pantallas usaba `useTable` solo por su efecto de
 * re-render —lo decían sus propios comentarios— y a cambio se traían la tabla
 * completa en cada carga y en cada cambio. Sobre `cobros` o `citas` eso son
 * megabytes que nadie lee, y encima truncados a 1000 filas.
 */
export function useSuscripcionTabla(table: TableName): number {
  const suscribirse = useCallback(
    (alCambiar: () => void) => suscribirRevision(table, alCambiar),
    [table],
  )
  const leer = useCallback(() => entradaDe(table).revision, [table])

  return useSyncExternalStore(suscribirse, leer)
}
