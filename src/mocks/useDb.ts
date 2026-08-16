import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { Database } from '../types/supabase'

type Tables = Database['public']['Tables']
type TableName = keyof Tables

export function useTable<T extends TableName>(table: T): Tables[T]['Row'][] {
  const [data, setData] = useState<Tables[T]['Row'][]>([])

  useEffect(() => {
    let montado = true

    async function fetchInitial() {
      // @ts-expect-error Supabase client struggles with generic table names
      const { data: result, error } = await supabase.from(table as string).select('*')
      if (montado && result && !error) {
        setData(result as Tables[T]['Row'][])
      }
    }

    fetchInitial()

    const channel = supabase.channel(`public:${table}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: table as string }, async () => {
         // @ts-expect-error Supabase client struggles with generic table names
         const { data: result } = await supabase.from(table as string).select('*')
         if (montado && result) setData(result as Tables[T]['Row'][])
      })
      .subscribe()

    return () => {
      montado = false
      supabase.removeChannel(channel)
    }
  }, [table])

  return data
}
