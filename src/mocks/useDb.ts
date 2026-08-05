import { useSyncExternalStore } from 'react'
import { db, type Tables } from './db'

/** Suscribe un componente a una tabla del mock DB; re-renderiza en cada cambio. */
export function useTable<K extends keyof Tables>(table: K): Tables[K] {
  return useSyncExternalStore(db.subscribe, () => db.get(table))
}
