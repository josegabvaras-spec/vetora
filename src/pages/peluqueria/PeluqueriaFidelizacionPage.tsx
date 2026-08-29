import { useEffect, useState } from 'react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Field'
import {
  MessageCircle,
  Clock,
  Search,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { formatBs } from '../../lib/currency'
import { formatClinicDate } from '../../lib/datetime'
import {
  listClientesFidelizacion,
  generarEnlaceRecordatorioWhatsApp,
} from '../../services/fidelizacion'
import type { ClienteFidelizacionGrooming } from '../../types/views'

export function PeluqueriaFidelizacionPage() {
  const { sucursalActivaId } = useAuth()
  const [clientes, setClientes] = useState<ClienteFidelizacionGrooming[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [filtroPendientes, setFiltroPendientes] = useState(false)
  const [cargando, setCargando] = useState(true)

  async function recargar() {
    setCargando(true)
    try {
      const res = await listClientesFidelizacion(sucursalActivaId || undefined)
      setClientes(res)
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    recargar()
  }, [sucursalActivaId])

  const filtrados = clientes
    .filter((c) => !filtroPendientes || c.recordatorio_pendiente)
    .filter(
      (c) =>
        c.cliente_nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
        c.paciente_nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
        (c.whatsapp && c.whatsapp.includes(busqueda)),
    )

  function handleEnviarWhatsApp(item: ClienteFidelizacionGrooming) {
    if (!item.whatsapp) {
      alert('Este cliente no tiene registrado número de WhatsApp')
      return
    }
    const link = generarEnlaceRecordatorioWhatsApp(item, 'la clínica')
    window.open(link, '_blank', 'noopener,noreferrer')
  }

  const totalPendientesAviso = clientes.filter((c) => c.recordatorio_pendiente).length

  return (
    <div className="space-y-6">
      {/* Cabecera Principal */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">
            Fidelización y Recordatorios de Visitas
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Detección de clientes inactivos, servicios habituales y recordatorios automáticos de baño y corte por WhatsApp.
          </p>
        </div>

        {totalPendientesAviso > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2 text-xs font-semibold text-amber-900 flex items-center gap-2">
            <Clock size={16} className="text-amber-600 shrink-0" />
            <span>{totalPendientesAviso} mascotas listas para su siguiente servicio</span>
          </div>
        )}
      </div>

      {/* Barra de Filtros */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant={!filtroPendientes ? 'primary' : 'outline'}
            size="sm"
            onClick={() => setFiltroPendientes(false)}
            className="text-xs"
          >
            Todos ({clientes.length})
          </Button>
          <Button
            type="button"
            variant={filtroPendientes ? 'primary' : 'outline'}
            size="sm"
            onClick={() => setFiltroPendientes(true)}
            className="text-xs"
          >
            Pendientes de aviso ({totalPendientesAviso})
          </Button>
        </div>

        <div className="relative w-full sm:w-72">
          <Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
          <Input
            placeholder="Buscar por cliente, mascota o WhatsApp..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="pl-9 text-xs"
          />
        </div>
      </div>

      {/* Tabla de Clientes y Frecuencias */}
      <Card className="overflow-hidden border-slate-200">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">Mascota</th>
                <th className="px-4 py-3">Tutor</th>
                <th className="px-4 py-3">Último Servicio</th>
                <th className="px-4 py-3">Servicio Frecuente</th>
                <th className="px-4 py-3 text-center">Días sin Visita</th>
                <th className="px-4 py-3 text-right">Gasto Total</th>
                <th className="px-4 py-3 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {cargando ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-500">
                    Analizando fidelización y visitas...
                  </td>
                </tr>
              ) : filtrados.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-400 font-medium">
                    No hay registros de clientes frecuentes en esta sucursal
                  </td>
                </tr>
              ) : (
                filtrados.map((item) => (
                  <tr key={item.paciente_id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-bold text-slate-900 text-sm">{item.paciente_nombre}</p>
                      <p className="text-[11px] text-slate-500">
                        {item.especie} · {item.raza || 'Mestizo'}
                      </p>
                    </td>

                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-800">{item.cliente_nombre}</p>
                      <p className="text-[11px] text-slate-500">{item.whatsapp || 'Sin teléfono'}</p>
                    </td>

                    <td className="px-4 py-3 text-slate-600">
                      <p className="font-medium text-slate-800">{item.ultimo_servicio_nombre}</p>
                      <p className="text-[11px] text-slate-400">{formatClinicDate(item.ultimo_servicio_fecha)}</p>
                    </td>

                    <td className="px-4 py-3 font-semibold text-slate-700">
                      {item.servicio_habitual_nombre}
                    </td>

                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-block rounded-lg px-2 py-1 font-bold text-xs ${
                          item.recordatorio_pendiente
                            ? 'bg-amber-100 text-amber-900 border border-amber-300'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {item.dias_desde_ultimo_servicio} días
                      </span>
                    </td>

                    <td className="px-4 py-3 text-right">
                      <p className="font-black text-teal-800">{formatBs(item.gasto_acumulado_bs)}</p>
                      <p className="text-[10px] text-slate-400">{item.total_visitas} visitas</p>
                    </td>

                    <td className="px-4 py-3 text-right">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleEnviarWhatsApp(item)}
                        className={`text-xs ${
                          item.recordatorio_pendiente
                            ? 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                            : 'text-slate-600'
                        }`}
                      >
                        <MessageCircle size={14} className="mr-1 text-emerald-600" />
                        <span>Recordar</span>
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
