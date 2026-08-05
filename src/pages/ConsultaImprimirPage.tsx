import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Printer } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { useTable } from '../mocks/useDb'
import { getFichaPaciente } from '../services/clientesPacientes'
import { calcularEdad } from '../lib/paciente'
import { formatClinicDate, formatClinicDateTime } from '../lib/datetime'
import { formatBs } from '../lib/currency'
import { TIPO_LABEL } from '../lib/citas'
import type { FichaPaciente } from '../types/views'
import { TablaFicha, TablaListado, anamnesisFilas, examenFilas } from './HistorialImprimirPage'

const ESPECIE_LABEL: Record<string, string> = {
  canino: 'Canino',
  felino: 'Felino',
  ave: 'Ave',
  exotico: 'Exótico',
  otro: 'Otro',
}

const VACIO = '—'

export function ConsultaImprimirPage() {
  const { pacienteId, consultaId } = useParams<{ pacienteId: string; consultaId: string }>()
  const [ficha, setFicha] = useState<FichaPaciente | null | undefined>(undefined)
  const clinica = useTable('clinicas')[0]

  useEffect(() => {
    if (!pacienteId) return
    getFichaPaciente(pacienteId).then(setFicha)
  }, [pacienteId])

  if (ficha === undefined) {
    return <p className="p-6 text-sm text-slate-500">Cargando informe médico…</p>
  }

  if (!ficha) {
    return (
      <div className="mx-auto max-w-lg space-y-4 p-6 text-center">
        <p className="text-sm text-slate-500">No se encontró el paciente solicitado.</p>
        <Link to="/pacientes" className="inline-flex items-center gap-1 text-sm text-teal-700 hover:underline">
          <ArrowLeft size={16} /> Volver a pacientes
        </Link>
      </div>
    )
  }

  const { paciente, historiales } = ficha
  const consulta = historiales.find(h => h.id === consultaId)

  if (!consulta) {
    return (
      <div className="mx-auto max-w-lg space-y-4 p-6 text-center">
        <p className="text-sm text-slate-500">No se encontró la consulta solicitada.</p>
        <Link to={`/pacientes/${paciente.id}`} className="inline-flex items-center gap-1 text-sm text-teal-700 hover:underline">
          <ArrowLeft size={16} /> Volver a la ficha
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4 print:hidden">
        <Link
          to={`/pacientes/${paciente.id}`}
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft size={16} /> Volver a la ficha
        </Link>
        <Button onClick={() => window.print()}>
          <Printer size={16} /> Imprimir / Guardar PDF
        </Button>
      </div>

      <div className="mx-auto max-w-4xl bg-white p-10 shadow-sm print:p-0 print:shadow-none">
        <header className="mb-5 border-b-2 border-slate-700 pb-3 text-center">
          <h1 className="text-base font-bold uppercase tracking-wide text-slate-800">
            Informe Médico
          </h1>
          <p className="mt-0.5 text-xs text-slate-600">{clinica.nombre}</p>
        </header>

        <TablaFicha
          titulo="Datos del paciente"
          filas={[
            ['Paciente', paciente.nombre],
            ['Especie', ESPECIE_LABEL[paciente.especie]],
            ['Raza', paciente.raza],
            ['Sexo', paciente.sexo],
            ['Edad', calcularEdad(paciente.fecha_nacimiento)],
            [
              'Fecha de nacimiento',
              paciente.fecha_nacimiento ? formatClinicDate(`${paciente.fecha_nacimiento}T12:00:00Z`) : null,
            ],
            ['Propietario/a', paciente.cliente.nombre],
            ['WhatsApp', paciente.cliente.whatsapp],
            ['Carnet de identidad', paciente.cliente.ci],
          ]}
        />

        <article className="mb-6 break-inside-avoid border-t-2 border-slate-300 pt-3">
          <p className="mb-2 text-[11px] font-bold text-slate-700">
            Detalle de la Atención · {TIPO_LABEL[consulta.tipo_cita]} · {formatClinicDateTime(consulta.created_at)} · Dr(a).{' '}
            {consulta.veterinario_nombre}
            {consulta.editable && ' · BORRADOR'}
          </p>

          {(consulta.origen || consulta.procedimiento) && (
            <TablaFicha
              titulo="Contexto de la atención"
              columnas={1}
              filas={[
                [
                  'Controla la consulta del',
                  consulta.origen ? `${formatClinicDateTime(consulta.origen.fecha_hora)} — ${consulta.origen.motivo}` : null,
                ],
                ['Procedimiento', consulta.procedimiento],
              ]}
            />
          )}

          <TablaFicha titulo="Anamnesis" filas={anamnesisFilas(consulta)} />
          <TablaFicha titulo="Síntomas referidos" columnas={1} filas={[['Síntomas', consulta.sintomas]]} />
          <TablaFicha titulo="Examen físico" filas={examenFilas(consulta)} />
          <TablaFicha
            titulo="Observaciones del examen"
            columnas={1}
            filas={[['Observaciones', consulta.observaciones_examen]]}
          />
          <TablaFicha
            titulo="Conclusión"
            columnas={1}
            filas={[
              ['Diagnóstico', consulta.diagnostico],
              ['Tratamiento', consulta.tratamiento],
            ]}
          />

          <TablaListado
            titulo="Vacunas aplicadas"
            cabeceras={['Vacuna', 'Fecha de aplicación', 'Próximo refuerzo']}
            filas={consulta.vacunas.map((v) => [v.nombre_vacuna, v.fecha_aplicacion, v.fecha_refuerzo || VACIO])}
          />

          <TablaListado
            titulo="Productos usados"
            cabeceras={['Producto', 'Cantidad', 'Precio unit.', 'Subtotal']}
            filas={consulta.productosUsados.map((p) => [
              p.nombre,
              String(p.cantidad),
              formatBs(p.precio_bs),
              formatBs(p.precio_bs * p.cantidad),
            ])}
          />
        </article>

        <footer className="mt-8 border-t border-slate-300 pt-3 text-center text-[9px] text-slate-500">
          Documento generado electrónicamente por Vetora el {formatClinicDate(new Date().toISOString())} · Los
          historiales cerrados son inmutables.
        </footer>
      </div>
    </div>
  )
}
