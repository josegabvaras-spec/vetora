import { useState } from 'react'
import { clsx } from 'clsx'
import { useAuth } from '../../context/useAuth'
import { ClientesPage } from '../ClientesPage'
import { PeluqueriaFidelizacionPage } from './PeluqueriaFidelizacionPage'

/**
 * Los dueños de la clínica, fusionados con la fidelización en un solo enlace
 * del menú de peluquería.
 *
 * "Todos" y "Frecuentes" muestran datos de forma distinta a propósito —
 * dueños vs. mascotas por frecuencia de visita— así que no se combinan en
 * una sola tabla: son dos pestañas que anidan las páginas ya existentes sin
 * duplicar su lógica. `ClientesPage` es la lista general de dueños,
 * **compartida con el resto de la aplicación** (veterinaria, petshop); no se
 * toca ese componente para no filtrarle nada específico de peluquería.
 *
 * ⚠️ **"Frecuentes" era de `admin`/`recepcion`, no de `peluquero`, antes de
 * fusionarla.** El peluquero sí entraba a `/clientes` (da de alta dueños,
 * igual que mascotas), pero nunca tuvo la pestaña de fidelización en su
 * menú. Se conserva esa frontera exacta en vez de ampliarla de paso por
 * fusionar las dos pantallas.
 */
export function PeluqueriaClientesPage() {
  const { usuario } = useAuth()
  const veFrecuentes = usuario?.rol !== 'peluquero'

  const [tab, setTab] = useState<'todos' | 'frecuentes'>('todos')

  return (
    <div className="space-y-6">
      {/* Pestañas */}
      {veFrecuentes && (
        <div className="border-b border-slate-200">
          <nav className="-mb-px flex space-x-6 overflow-x-auto" aria-label="Tabs">
            <button
              type="button"
              onClick={() => setTab('todos')}
              className={clsx(
                tab === 'todos'
                  ? 'border-teal-500 text-teal-600'
                  : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700',
                'whitespace-nowrap border-b-2 py-3 px-1 text-sm font-medium transition-colors cursor-pointer',
              )}
            >
              Todos
            </button>
            <button
              type="button"
              onClick={() => setTab('frecuentes')}
              className={clsx(
                tab === 'frecuentes'
                  ? 'border-teal-500 text-teal-600'
                  : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700',
                'whitespace-nowrap border-b-2 py-3 px-1 text-sm font-medium transition-colors cursor-pointer',
              )}
            >
              Frecuentes
            </button>
          </nav>
        </div>
      )}

      {tab === 'todos' && <ClientesPage />}
      {tab === 'frecuentes' && veFrecuentes && <PeluqueriaFidelizacionPage />}
    </div>
  )
}
