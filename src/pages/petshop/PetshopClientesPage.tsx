import { useEffect, useState, useCallback } from 'react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import {
  Users,
  Search,
  MessageCircle,
  PawPrint,
  RefreshCw,
} from 'lucide-react'
import { useAuth } from '../../context/useAuth'
import { supabase } from '../../lib/supabase'
import { formatBs } from '../../lib/currency'
import { formatClinicDate } from '../../lib/datetime'
import { listPacientes } from '../../services/clientesPacientes'

interface ClienteComercial {
  id: string
  nombre: string
  whatsapp?: string
  ci?: string | null
  totalCompras: number
  gastoAcumuladoBs: number
  ultimaCompraFecha?: string
  mascotas: { id: string; nombre: string; especie: string }[]
}

export function PetshopClientesPage() {
  const { sucursalActivaId } = useAuth()
  const [busqueda, setBusqueda] = useState('')
  const [clientes, setClientes] = useState<ClienteComercial[]>([])
  const [cargando, setCargando] = useState(true)

  const recargar = useCallback(async () => {
    setCargando(true)
    try {
      const [pacientesRes, cobrosRes] = await Promise.all([
        listPacientes(sucursalActivaId || undefined),
        supabase.from('cobros').select('*').order('created_at', { ascending: false }),
      ])

      const cobros = cobrosRes.data || []
      const clientesMap = new Map<string, ClienteComercial>()

      for (const p of pacientesRes) {
        if (p.cliente) {
          const cId = p.cliente.id
          if (!clientesMap.has(cId)) {
            clientesMap.set(cId, {
              id: cId,
              nombre: p.cliente.nombre,
              whatsapp: p.cliente.whatsapp,
              ci: p.cliente.ci,
              totalCompras: 0,
              gastoAcumuladoBs: 0,
              mascotas: [],
            })
          }
          const item = clientesMap.get(cId)!
          if (!item.mascotas.some((m) => m.id === p.id)) {
            item.mascotas.push({ id: p.id, nombre: p.nombre, especie: p.especie })
          }
        }
      }

      // Sumar compras de cada cliente
      for (const cobro of cobros) {
        const matchingClient = [...clientesMap.values()].find(
          (c) => cobro.cliente_nombre && c.nombre.toLowerCase().trim() === cobro.cliente_nombre.toLowerCase().trim(),
        )
        if (matchingClient) {
          matchingClient.totalCompras += 1
          matchingClient.gastoAcumuladoBs += Number(cobro.monto_bs) || 0
          if (!matchingClient.ultimaCompraFecha) {
            matchingClient.ultimaCompraFecha = cobro.created_at
          }
        }
      }

      setClientes([...clientesMap.values()])
    } finally {
      setCargando(false)
    }
  }, [sucursalActivaId])

  useEffect(() => {
    recargar()
  }, [recargar])

  const filtrados = clientes.filter((c) => {
    if (!busqueda.trim()) return true
    const term = busqueda.toLowerCase()
    return (
      c.nombre.toLowerCase().includes(term) ||
      (c.whatsapp && c.whatsapp.includes(term)) ||
      (c.ci && c.ci.includes(term)) ||
      c.mascotas.some((m) => m.nombre.toLowerCase().includes(term))
    )
  })

  function abrirWhatsApp(numero: string, nombre: string) {
    const limpio = numero.replace(/\D/g, '')
    const msg = encodeURIComponent(`Hola ${nombre}, te saludamos de Vetora Pet Shop.`)
    window.open(`https://wa.me/${limpio}?text=${msg}`, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="space-y-6">
      {/* Cabecera Principal */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900 flex items-center gap-2">
            <Users className="text-teal-700" size={24} />
            <span>Clientes y Mascotas en Pet Shop</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Perfil comercial de clientes existentes, historial de consumo, gasto acumulado y mascotas.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => recargar()}>
            <RefreshCw size={14} className={cargando ? 'animate-spin' : ''} />
          </Button>
        </div>
      </div>

      {/* Buscador */}
      <Card className="p-4 border-slate-200">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre de cliente, CI, teléfono o mascota..."
            className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-300 bg-white focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
          />
        </div>
      </Card>

      {/* Grid de Clientes */}
      {cargando ? (
        <p className="text-center py-16 text-xs text-slate-500">Cargando clientes comerciales...</p>
      ) : filtrados.length === 0 ? (
        <Card className="p-12 text-center border-slate-200">
          <Users size={36} className="mx-auto text-slate-300 mb-2" />
          <p className="font-bold text-sm text-slate-700">No se encontraron clientes</p>
          <p className="text-xs text-slate-400 mt-1">
            Los clientes de Vetora se sincronizan automáticamente aquí.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtrados.map((c) => (
            <Card key={c.id} className="p-4 border-slate-200 space-y-3 flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-bold text-base text-slate-900">{c.nombre}</h3>
                    {c.ci && (
                      <span className="text-[10px] font-semibold text-slate-400">CI: {c.ci}</span>
                    )}
                  </div>
                  <Badge tone={c.totalCompras > 0 ? 'emerald' : 'slate'}>
                    {c.totalCompras > 0 ? `${c.totalCompras} compras` : 'Sin compras'}
                  </Badge>
                </div>

                {/* Mascotas */}
                <div className="flex flex-wrap gap-1.5 pt-2">
                  {c.mascotas.map((m) => (
                    <span
                      key={m.id}
                      className="inline-flex items-center gap-1 rounded-md bg-teal-50 px-2 py-0.5 text-[11px] font-semibold text-teal-800 border border-teal-100"
                    >
                      <PawPrint size={10} />
                      <span>{m.nombre}</span>
                    </span>
                  ))}
                  {c.mascotas.length === 0 && (
                    <span className="text-[11px] text-slate-400 italic">Sin mascotas registradas</span>
                  )}
                </div>

                {/* Resumen Comercial */}
                <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-100 mt-3 text-xs">
                  <div className="rounded-lg bg-slate-50 p-2 border border-slate-100">
                    <span className="text-[10px] uppercase font-bold text-slate-400">Gasto Total</span>
                    <p className="text-sm font-black text-teal-800">{formatBs(c.gastoAcumuladoBs)}</p>
                  </div>

                  <div className="rounded-lg bg-slate-50 p-2 border border-slate-100">
                    <span className="text-[10px] uppercase font-bold text-slate-400">Última Compra</span>
                    <p className="text-[11px] font-semibold text-slate-700">
                      {c.ultimaCompraFecha ? formatClinicDate(c.ultimaCompraFecha) : '—'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                {c.whatsapp ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => abrirWhatsApp(c.whatsapp!, c.nombre)}
                    className="text-emerald-700 hover:text-emerald-900"
                  >
                    <MessageCircle size={13} className="mr-1" />
                    <span>WhatsApp</span>
                  </Button>
                ) : (
                  <span />
                )}

                <span className="text-[11px] font-medium text-slate-500">
                  {c.whatsapp || 'Sin WhatsApp'}
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
