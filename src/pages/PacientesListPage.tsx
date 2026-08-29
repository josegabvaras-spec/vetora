import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, Edit2, Trash2 } from 'lucide-react'
import { AvisoError } from '../components/ui/AvisoError'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Input } from '../components/ui/Field'
import { TablaResponsive, type Columna } from '../components/ui/Tabla'
import { listPacientes, eliminarPaciente } from '../services/clientesPacientes'
import { NuevoPacienteModal } from '../features/pacientes/NuevoPacienteModal'
import { EditarPacienteModal } from '../features/pacientes/EditarPacienteModal'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { useSuscripcionTabla } from '../mocks/useDb'
import { useAuth } from '../context/useAuth'
import { puedeVerHistorialClinico } from '../lib/personal'
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
  const { usuario } = useAuth()
  // Borrar un paciente se lleva por cascada todo su historial clínico. El
  // peluquero da de alta y edita la ficha, pero no destruye el expediente que
  // llevan otros.
  const puedeBorrar = puedeVerHistorialClinico(usuario)
  const [pacientes, setPacientes] = useState<PacienteConDueno[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [modalNuevo, setModalNuevo] = useState(false)
  const navigate = useNavigate()
  const [pacienteEditar, setPacienteEditar] = useState<PacienteConDueno | null>(null)
  const [pacienteBorrar, setPacienteBorrar] = useState<PacienteConDueno | null>(null)
  const [borrando, setBorrando] = useState(false)

  // Internar o dar de alta debe reflejarse aquí sin recargar la página.
  // Solo dependencia del efecto: no se leen las filas, y `internaciones` crece
  // sin techo. Con `useTable` se descargaba entera en cada cambio.
  const revisionInternaciones = useSuscripcionTabla('internaciones')

  async function handleBorrar() {
    if (!pacienteBorrar) return
    setBorrando(true)
    try {
      await eliminarPaciente(pacienteBorrar.id)
      setPacienteBorrar(null)
      recargar()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al borrar el paciente')
    } finally {
      setBorrando(false)
    }
  }

  const [errorCarga, setErrorCarga] = useState<string | null>(null)

  /**
   * Texto de búsqueda ya reposado.
   *
   * La búsqueda se resuelve en el servidor (antes se traía la cartera entera y
   * se filtraba en memoria, lo que dejaba invisibles a los pacientes por encima
   * de la fila 1000). Sin este retardo se lanzaría una consulta por tecla.
   */
  const [busquedaAplicada, setBusquedaAplicada] = useState('')
  useEffect(() => {
    const id = setTimeout(() => setBusquedaAplicada(busqueda), 300)
    return () => clearTimeout(id)
  }, [busqueda])

  const recargar = useCallback(async () => {
    setPacientes(await listPacientes(busquedaAplicada))
  }, [busquedaAplicada])

  useEffect(() => {
    setErrorCarga(null)
    recargar().catch((err) =>
      setErrorCarga(err instanceof Error ? err.message : 'No se pudo cargar la lista de pacientes'),
    )
  }, [recargar, revisionInternaciones])

  // El filtrado ya lo hizo la base; aquí solo se pinta lo que llegó.
  const filtrados = pacientes

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
      {
        clave: 'acciones',
        cabecera: '',
        celda: (p) => (
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              className="bg-white px-2 py-1"
              onClick={(e) => {
                e.stopPropagation()
                setPacienteEditar(p)
              }}
            >
              <Edit2 size={16} className="text-slate-500 hover:text-teal-600 transition-colors" />
            </Button>
            {puedeBorrar && (
              <Button
                variant="outline"
                size="sm"
                className="bg-white px-2 py-1 hover:bg-rose-50"
                onClick={(e) => {
                  e.stopPropagation()
                  setPacienteBorrar(p)
                }}
              >
                <Trash2 size={16} className="text-rose-500 hover:text-rose-700 transition-colors" />
              </Button>
            )}
          </div>
        ),
      },
    ],
    [puedeBorrar],
  )

  return (
    <div className="space-y-5">
      <AvisoError mensaje={errorCarga} />

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

      {pacienteEditar && (
        <EditarPacienteModal
          paciente={pacienteEditar}
          onClose={() => setPacienteEditar(null)}
          onUpdated={() => {
            setPacienteEditar(null)
            recargar()
          }}
        />
      )}

      {pacienteBorrar && (
        <ConfirmDialog
          title={`Borrar a ${pacienteBorrar.nombre}`}
          description="¿Estás seguro de que deseas borrar a este paciente y todo su historial? Esta acción no se puede deshacer."
          confirmLabel="Borrar permanentemente"
          loading={borrando}
          onConfirm={handleBorrar}
          onCancel={() => setPacienteBorrar(null)}
        />
      )}
    </div>
  )
}
