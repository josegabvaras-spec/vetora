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
  oyentes: Set<() => void>
  canal: RealtimeChannel | null
}

const SIN_FILAS: never[] = []
const registro = new Map<string, Entrada>()

function entradaDe(tabla: string): Entrada {
  let entrada = registro.get(tabla)
  if (!entrada) {
    entrada = { filas: SIN_FILAS, oyentes: new Set(), canal: null }
    registro.set(tabla, entrada)
  }
  return entrada
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
  for (const avisar of entrada.oyentes) avisar()
}

/**
 * El canal se crea una vez y no se cierra al quedarse sin oyentes: `removeChannel`
 * es asíncrono y volver a abrir el mismo tópico antes de que termine reproduce
 * el error de arriba. Las tablas son pocas y fijas, así que mantenerlos abiertos
 * sale más barato que arriesgar esa carrera.
 */
function suscribir(tabla: string, alCambiar: () => void): () => void {
  const entrada = entradaDe(tabla)
  entrada.oyentes.add(alCambiar)

  // De cero a un oyente: la pantalla acaba de aparecer y puede traer datos
  // viejos de la vez anterior.
  if (entrada.oyentes.size === 1) recargar(tabla)

  if (!entrada.canal) {
    entrada.canal = supabase
      .channel(`tabla:${tabla}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: tabla }, () => {
        recargar(tabla)
      })
      .subscribe()
  }

  return () => {
    entrada.oyentes.delete(alCambiar)
  }
}

/** Filas de una tabla, al día: se re-renderiza cuando Postgres avisa. */
export function useTable<T extends TableName>(table: T): Tables[T]['Row'][] {
  const suscribirse = useCallback((alCambiar: () => void) => suscribir(table, alCambiar), [table])
  const leer = useCallback(() => entradaDe(table).filas, [table])

  return useSyncExternalStore(suscribirse, leer) as Tables[T]['Row'][]
}
