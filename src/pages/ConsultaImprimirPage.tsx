import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Printer } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { useTable } from '../mocks/useDb'
import { cargarFichaDeDocumento, volverDeDocumento } from '../services/documentos'
import { useAuth } from '../context/AuthContext'
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
  const { usuario } = useAuth()
  const [ficha, setFicha] = useState<FichaPaciente | null | undefined>(undefined)
  // «No se pudo cargar» y «no existe» son cosas distintas.
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const clinica = useTable('clinicas')[0]

  useEffect(() => {
    if (!pacienteId) return
    cargarFichaDeDocumento(pacienteId, usuario?.rol)
      .then(setFicha)
      .catch((err) => {
        setErrorCarga(err instanceof Error ? err.message : 'No se pudo cargar la consulta')
        setFicha(null)
      })
  }, [pacienteId, usuario?.rol])

  if (ficha === undefined) {
    return <p className="p-6 text-sm text-slate-500">Cargando informe médico…</p>
  }

  if (!ficha) {
    return (
      <div className="mx-auto max-w-lg space-y-4 p-6 text-center">
        <p className={errorCarga ? 'text-sm font-semibold text-rose-700' : 'text-sm text-slate-500'}>
          {errorCarga ?? 'No se encontró el paciente solicitado.'}
        </p>
        <Link to={usuario?.rol === 'cliente' ? '/portal-cliente/mascotas' : '/pacientes'} className="inline-flex items-center gap-1 text-sm text-teal-700 hover:underline">
          <ArrowLeft size={16} /> {usuario?.rol === 'cliente' ? 'Volver a mis mascotas' : 'Volver a pacientes'}
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
        <Link to={volverDeDocumento(paciente.id, usuario?.rol)} className="inline-flex items-center gap-1 text-sm text-teal-700 hover:underline">
          <ArrowLeft size={16} /> {usuario?.rol === 'cliente' ? 'Volver a mi mascota' : 'Volver a la ficha'}
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-100 print:min-h-0 print:bg-white">
      <div className="mx-auto flex max-w-4xl flex-col items-stretch gap-3 px-4 py-4 print:hidden sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <Link
          to={volverDeDocumento(paciente.id, usuario?.rol)}
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft size={16} /> {usuario?.rol === 'cliente' ? 'Volver a mi mascota' : 'Volver a la ficha'}
        </Link>
        <Button onClick={() => window.print()}>
          <Printer size={16} /> Imprimir / Guardar PDF
        </Button>
      </div>

      <div className="mx-auto max-w-4xl doc-una-pagina bg-white p-4 shadow-sm sm:p-10 print:p-0 print:shadow-none">
        <header className="mb-5 border-b-2 border-slate-700 pb-3 text-center">
          <h1 className="text-base font-bold uppercase tracking-wide text-slate-800">
            Informe Médico
          </h1>
          <p className="mt-0.5 text-xs text-slate-600">{clinica?.nombre ?? ""}</p>
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

          <TablaListado
            titulo="Recetario médico"
            cabeceras={['Medicamento', 'Dosis', 'Vía', 'Frecuencia', 'Duración', 'Indicaciones']}
            filas={(consulta.receta ?? []).map((r) => [
              r.medicamento,
              r.dosis,
              r.via,
              r.frecuencia,
              r.duracion,
              r.indicaciones || VACIO,
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
