import { useEffect, useState } from 'react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Input } from '../../components/ui/Field'
import {
  PawPrint,
  Search,
  Scissors,
  Sparkles,
  User,
  Phone,
} from 'lucide-react'
import { listPacientes } from '../../services/clientesPacientes'
import type { PacienteConDueno } from '../../types/views'
import { FichaGroomingModal } from '../../features/peluqueria/FichaGroomingModal'
import { NuevaOrdenModal } from '../../features/peluqueria/NuevaOrdenModal'
import { useAuth } from '../../context/AuthContext'

export function PeluqueriaMascotasPage() {
  const { sucursalActivaId } = useAuth()
  const [pacientes, setPacientes] = useState<PacienteConDueno[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [cargando, setCargando] = useState(true)

  const [pacienteFicha, setPacienteFicha] = useState<any | null>(null)
  const [pacienteNuevaOrden, setPacienteNuevaOrden] = useState<string | null>(null)

  async function recargar() {
    setCargando(true)
    try {
      const res = await listPacientes(sucursalActivaId || undefined)
      setPacientes(res)
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    recargar()
  }, [sucursalActivaId])

  const filtrados = pacientes.filter(
    (p) =>
      p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      p.cliente?.nombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
      (p.cliente?.whatsapp && p.cliente.whatsapp.includes(busqueda)) ||
      (p.raza && p.raza.toLowerCase().includes(busqueda.toLowerCase())),
  )

  return (
    <div className="space-y-6">
      {/* Cabecera Principal */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">
            Fichas de Peluquería por Mascota
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Preferencias de corte, longitud, productos, temperamento y manejo estético de cada mascota.
          </p>
        </div>

        <div className="relative w-full sm:w-72">
          <Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
          <Input
            placeholder="Buscar por mascota, dueño, CI o WhatsApp..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="pl-9 text-xs"
          />
        </div>
      </div>

      {/* Lista de Mascotas */}
      {cargando ? (
        <p className="text-center py-12 text-xs text-slate-500">Cargando mascotas...</p>
      ) : filtrados.length === 0 ? (
        <Card className="p-12 text-center border-slate-200">
          <PawPrint size={32} className="mx-auto text-slate-300 mb-2" />
          <p className="text-sm font-semibold text-slate-700">No se encontraron mascotas</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtrados.map((p) => (
            <Card key={p.id} className="p-4 border-slate-200 space-y-3 flex flex-col justify-between">
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-base text-slate-900">{p.nombre}</h3>
                    <p className="text-xs text-slate-500">
                      {p.especie} · {p.raza || 'Mestizo'}
                    </p>
                  </div>
                  <Badge tone="slate">{p.especie}</Badge>
                </div>

                <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 text-xs text-slate-600 space-y-1">
                  <p className="flex items-center gap-1.5 truncate">
                    <User size={13} className="text-slate-400 shrink-0" />
                    <span>Tutor: <strong>{p.cliente?.nombre || '—'}</strong></span>
                  </p>
                  <p className="flex items-center gap-1.5 truncate">
                    <Phone size={13} className="text-slate-400 shrink-0" />
                    <span>WhatsApp: {p.cliente?.whatsapp || '—'}</span>
                  </p>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setPacienteFicha({
                      id: p.id,
                      nombre: p.nombre,
                      especie: p.especie,
                      raza: p.raza,
                      cliente: {
                        nombre: p.cliente?.nombre || '',
                        whatsapp: p.cliente?.whatsapp || null,
                      },
                    })
                  }
                  className="text-xs flex-1"
                >
                  <Sparkles size={13} className="mr-1 text-teal-600" />
                  <span>Ficha Grooming</span>
                </Button>

                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => setPacienteNuevaOrden(p.id)}
                  className="text-xs"
                >
                  <Scissors size={13} className="mr-1" />
                  <span>Atender</span>
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Modal Ficha Grooming */}
      {pacienteFicha && (
        <FichaGroomingModal
          paciente={pacienteFicha}
          onClose={() => setPacienteFicha(null)}
          onSaved={() => {
            setPacienteFicha(null)
            recargar()
          }}
        />
      )}

      {/* Modal Nueva Orden para esta mascota */}
      {pacienteNuevaOrden && (
        <NuevaOrdenModal
          sucursalId={sucursalActivaId || ''}
          pacientePreseleccionadoId={pacienteNuevaOrden}
          onClose={() => setPacienteNuevaOrden(null)}
          onCreated={() => {
            setPacienteNuevaOrden(null)
            recargar()
          }}
        />
      )}
    </div>
  )
}
