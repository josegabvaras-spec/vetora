import { useTable } from '../mocks/useDb'
import type { Plan } from '../types/database'

/** Plan contratado por la clínica de la sesión. */
export function usePlanActivo(): Plan | undefined {
  const clinica = useTable('clinicas')[0]
  const planes = useTable('planes')
  return planes.find((p) => p.id === clinica?.plan_id) as Plan | undefined
}

/**
 * Si el plan solo permite una sucursal no hay nada que elegir ni que comparar.
 * Las puertas de la interfaz miran los **límites** del plan y no su nombre: así
 * un plan nuevo creado desde el panel cambia lo que se ve, sin tocar código.
 */
export function useMultiSucursal(): boolean {
  const plan = usePlanActivo()
  return (plan?.max_sucursales ?? 1) > 1
}
