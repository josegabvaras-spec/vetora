import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Printer } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { useTable } from '../mocks/useDb'
import { cargarFichaDeDocumento, volverDeDocumento } from '../services/documentos'
import { useAuth } from '../context/useAuth'
import { calcularEdad } from '../lib/paciente'
import { formatClinicDate, formatClinicDateTime } from '../lib/datetime'
import type { FichaPaciente } from '../types/views'
import type { ViaAdministracion } from '../types/database'

const VIA_LABEL: Record<ViaAdministracion, string> = {
  oral: 'Oral',
  intramuscular: 'Intramuscular (IM)',
  subcutanea: 'Subcutánea (SC)',
  intravenosa: 'Intravenosa (IV)',
  topica: 'Tópica',
  oftalmica: 'Oftálmica',
  otica: 'Ótica',
}

const ESPECIE_LABEL: Record<string, string> = {
  canino: 'Canino',
  felino: 'Felino',
  ave: 'Ave',
  exotico: 'Exótico',
  otro: 'Otro',
}

export function RecetarioImprimirPage() {
  const { pacienteId, consultaId } = useParams<{ pacienteId: string; consultaId: string }>()
  const { usuario } = useAuth()
  const [ficha, setFicha] = useState<FichaPaciente | null | undefined>(undefined)
  // «No se pudo cargar» y «no existe» son cosas distintas.
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const clinica = useTable('clinicas')[0]
  const usuarios = useTable('usuarios')

  useEffect(() => {
    if (!pacienteId) return
    cargarFichaDeDocumento(pacienteId, usuario?.rol)
      .then(setFicha)
      .catch((err) => {
        setErrorCarga(err instanceof Error ? err.message : 'No se pudo cargar el recetario')
        setFicha(null)
      })
  }, [pacienteId, usuario?.rol])

  if (ficha === undefined) {
    return <p className="p-6 text-sm text-slate-500">Cargando recetario…</p>
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
  const consulta = historiales.find((h) => h.id === consultaId)

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

  const receta = consulta.receta ?? []
  const vet = usuarios.find((u) => u.id === consulta.veterinario_id)
  const fechaReceta = formatClinicDate(consulta.created_at)

  return (
    <div className="min-h-screen bg-slate-100 print:min-h-0 print:bg-white">
      {/* Barra de acciones — oculta al imprimir */}
      <div className="mx-auto flex max-w-2xl items-center justify-between px-6 py-4 print:hidden">
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

      {/* Hoja de receta — formato A5 / media carta */}
      <div className="doc-una-pagina mx-auto max-w-2xl bg-white shadow-sm print:shadow-none">
        {/* ── MEMBRETE ── */}
        <header className="border-b-4 border-teal-600 px-10 pb-4 pt-8 print:px-8 print:pt-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-extrabold uppercase tracking-wide text-teal-700">
                {clinica?.nombre ?? 'Clínica Veterinaria'}
              </h1>
              <p className="mt-0.5 text-xs text-slate-500">Medicina Veterinaria · Receta Médica</p>
            </div>
            <div className="text-right text-xs text-slate-500">
              <p className="font-semibold text-slate-700">Dr(a). {consulta.veterinario_nombre}</p>
              {vet?.whatsapp && <p>WhatsApp: {vet.whatsapp}</p>}
              <p className="mt-1">Fecha: <span className="font-semibold text-slate-800">{fechaReceta}</span></p>
            </div>
          </div>
        </header>

        {/* ── DATOS DEL PACIENTE ── */}
        <section className="border-b border-dashed border-slate-300 px-10 py-4 print:px-8">
          <h2 className="mb-2 text-[10px] font-bold uppercase tracking-widest text-teal-600">
            Datos del paciente
          </h2>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-slate-700">
            <div>
              <span className="font-semibold">Paciente: </span>
              {paciente.nombre}
            </div>
            <div>
              <span className="font-semibold">Especie: </span>
              {ESPECIE_LABEL[paciente.especie] ?? paciente.especie}
            </div>
            <div>
              <span className="font-semibold">Raza: </span>
              {paciente.raza || '—'}
            </div>
            <div>
              <span className="font-semibold">Edad: </span>
              {calcularEdad(paciente.fecha_nacimiento)}
            </div>
            <div>
              <span className="font-semibold">Propietario/a: </span>
              {paciente.cliente.nombre}
            </div>
            <div>
              <span className="font-semibold">C.I.: </span>
              {paciente.cliente.ci}
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            <span className="font-semibold text-slate-600">Diagnóstico: </span>
            {consulta.diagnostico || '—'}
          </p>
        </section>

        {/* ── MEDICAMENTOS ── */}
        <section className="px-10 py-5 print:px-8">
          <h2 className="mb-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-teal-600">
            <span className="inline-block rounded-sm bg-teal-600 px-1.5 py-0.5 text-white">℞</span>
            Medicamentos prescritos
          </h2>

          {receta.length === 0 ? (
            <p className="text-sm italic text-slate-400">Sin medicamentos recetados en esta consulta.</p>
          ) : (
            <ol className="space-y-5">
              {receta.map((item, idx) => (
                <li key={item.id} className="flex gap-3">
                  {/* Número */}
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-600 text-[10px] font-bold text-white">
                    {idx + 1}
                  </span>
                  <div className="flex-1 border-b border-slate-100 pb-4 last:border-0 last:pb-0">
                    {/* Nombre del medicamento */}
                    <p className="text-sm font-bold text-slate-900">{item.medicamento}</p>
                    {/* Detalles en grid compacto */}
                    <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px] text-slate-600">
                      <p>
                        <span className="font-semibold text-slate-700">Dosis: </span>
                        {item.dosis}
                      </p>
                      <p>
                        <span className="font-semibold text-slate-700">Vía: </span>
                        {VIA_LABEL[item.via]}
                      </p>
                      <p>
                        <span className="font-semibold text-slate-700">Frecuencia: </span>
                        {item.frecuencia}
                      </p>
                      <p>
                        <span className="font-semibold text-slate-700">Duración: </span>
                        {item.duracion}
                      </p>
                    </div>
                    {item.indicaciones && (
                      <p className="mt-1 text-[11px] italic text-slate-500">
                        <span className="not-italic font-semibold text-slate-600">Indicaciones: </span>
                        {item.indicaciones}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>

        {/* ── FIRMA ── */}
        <footer className="border-t border-slate-200 px-10 pb-8 pt-6 print:px-8">
          <div className="flex items-end justify-between">
            <div className="text-[10px] text-slate-400">
              <p>Consulta del {formatClinicDateTime(consulta.created_at)}</p>
              <p className="mt-0.5">
                Documento generado por Vetora · {formatClinicDate(new Date().toISOString())}
              </p>
              {consulta.editable && (
                <p className="mt-1 font-bold text-amber-600">⚠ Consulta en borrador</p>
              )}
            </div>
            <div className="text-center">
              <div className="mb-1 h-10 w-40 border-b border-slate-400" />
              <p className="text-[10px] font-semibold text-slate-600">
                Dr(a). {consulta.veterinario_nombre}
              </p>
              <p className="text-[10px] text-slate-400">Firma y sello</p>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}
