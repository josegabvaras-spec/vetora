import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Input } from '../components/ui/Field'
import { TablaResponsive, type Columna } from '../components/ui/Tabla'
import { listPacientes } from '../services/clientesPacientes'
import { NuevoPacienteModal } from '../features/pacientes/NuevoPacienteModal'
import { useTable } from '../mocks/useDb'
import { etiquetaDias } from '../lib/internacion'
import type { PacienteConDueno } from '../types/views'
import { formatClinicTime } from '../lib/datetime'
import { TIPO_LABEL, TIPO_TONE } from '../lib/citas'

const ESPECIE_LABEL: Record<string, string> = {
  canino: 'Canino',
  felino: 'Felino',
  ave: 'Ave',
  exotico: 'Exótico',
  otro: 'Otro',
}

export function PacientesListPage() {
  const [pacientes, setPacientes] = useState<PacienteConDueno[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [modalNuevo, setModalNuevo] = useState(false)
  const navigate = useNavigate()
  // Internar o dar de alta debe reflejarse aquí sin recargar la página.
  const internaciones = useTable('internaciones')

  async function recargar() {
    setPacientes(await listPacientes())
  }

  useEffect(() => {
    recargar()
  }, [internaciones])

  const filtrados = pacientes.filter((p) =>
    `${p.nombre} ${p.cliente.nombre} ${p.raza}`.toLowerCase().includes(busqueda.toLowerCase()),
  )

  // En celular la fila se convierte en tarjeta: el nombre y la agenda del día
  // encabezan, y el resto baja como pares etiqueta/valor.
  const columnas = useMemo<Columna<PacienteConDueno>[]>(
    () => [
      {
        clave: 'mascota',
        cabecera: 'Mascota',
        movil: 'titulo',
        celda: (p) => (
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-teal-700">{p.nombre}</span>
            {p.internacion_activa && (
              <Badge tone="teal" size="sm">
                Internado · {etiquetaDias(p.internacion_activa.dias)}
              </Badge>
            )}
          </div>
        ),
      },
      {
        clave: 'orden',
        cabecera: 'Orden del Día',
        movil: 'titulo',
        celda: (p) => (
          <div className="flex flex-col gap-1">
            {p.citas_hoy && p.citas_hoy.length > 0 ? (
              p.citas_hoy.map((c) => (
                <div key={c.id} className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="font-semibold text-slate-500">{formatClinicTime(c.fecha_hora)}</span>
                  <Badge tone={TIPO_TONE[c.tipo_cita]} size="sm">
                    {c.servicio_nombre || TIPO_LABEL[c.tipo_cita]}
                  </Badge>
                  <span className="text-[10px] text-slate-400">({c.estado})</span>
                </div>
              ))
            ) : p.internacion_activa ? (
              <span className="text-xs text-slate-500">
                Hospitalizado {p.internacion_activa.jaula ? `(${p.internacion_activa.jaula})` : ''}
              </span>
            ) : (
              <span className="text-xs text-slate-400">—</span>
            )}
          </div>
        ),
      },
      {
        clave: 'especie',
        cabecera: 'Especie / Raza',
        celda: (p) => (
          <span className="flex flex-wrap items-center gap-1.5 text-slate-600">
            <Badge tone="slate" size="sm">
              {ESPECIE_LABEL[p.especie]}
            </Badge>
            {p.raza}
          </span>
        ),
      },
      { clave: 'dueno', cabecera: 'Dueño/a', celda: (p) => <span className="text-slate-600">{p.cliente.nombre}</span> },
      {
        clave: 'whatsapp',
        cabecera: 'WhatsApp',
        celda: (p) => <span className="whitespace-nowrap text-slate-600">{p.cliente.whatsapp}</span>,
      },
    ],
    [],
  )

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">Pacientes</h1>
          <p className="text-sm text-slate-500">Clientes y mascotas registradas</p>
        </div>
        <Button onClick={() => setModalNuevo(true)} className="w-full sm:w-auto">
          <Plus size={16} /> Nuevo Paciente
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <Input className="pl-9" placeholder="Buscar por mascota, dueño o raza…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
      </div>

      <Card padding="none" className="overflow-hidden">
        <TablaResponsive
          columnas={columnas}
          filas={filtrados}
          claveDe={(p) => p.id}
          onFilaClick={(p) => navigate(`/pacientes/${p.id}`)}
          vacio="No se encontraron pacientes."
        />
      </Card>

      {modalNuevo && (
        <NuevoPacienteModal
          onClose={() => setModalNuevo(false)}
          onCreated={({ paciente, historialId }) => {
            setModalNuevo(false)
            recargar()
            // Si el alta abrió una primera consulta, se aterriza con ese acordeón desplegado.
            navigate(`/pacientes/${paciente.id}${historialId ? `?historial=${historialId}` : ''}`)
          }}
        />
      )}
    </div>
  )
}
