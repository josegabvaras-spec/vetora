import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Printer } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { useTable } from '../mocks/useDb'
import { getInternacion } from '../services/internacion'
import { TablaFicha, TablaListado } from './HistorialImprimirPage'
import { calcularEdad } from '../lib/paciente'
import { formatBs } from '../lib/currency'
import { formatClinicDate, formatClinicDateTime } from '../lib/datetime'
import { etiquetaDias } from '../lib/internacion'
import type { InternacionConDetalle } from '../types/views'

const ESPECIE_LABEL: Record<string, string> = {
  canino: 'Canino',
  felino: 'Felino',
  ave: 'Ave',
  exotico: 'Exótico',
  otro: 'Otro',
}

/**
 * Hoja de internación (epicrisis): ingreso, evolución diaria, consumos y alta.
 * Mismo formato de tablas que la ficha clínica impresa.
 */
export function InternacionImprimirPage() {
  const { id } = useParams<{ id: string }>()
  const [internacion, setInternacion] = useState<InternacionConDetalle | null | undefined>(undefined)
  // «No se pudo cargar» y «no existe» son cosas distintas.
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const clinica = useTable('clinicas')[0]
  const sucursales = useTable('sucursales')

  useEffect(() => {
    if (!id) return
    getInternacion(id)
      .then(setInternacion)
      .catch((err) => {
        setErrorCarga(err instanceof Error ? err.message : 'No se pudo cargar la hoja de internación')
        setInternacion(null)
      })
  }, [id])

  if (internacion === undefined) {
    return <p className="p-6 text-sm text-slate-500">Cargando hoja de internación…</p>
  }

  if (!internacion) {
    return (
      <div className="mx-auto max-w-lg space-y-4 p-6 text-center">
        <p className={errorCarga ? 'text-sm font-semibold text-rose-700' : 'text-sm text-slate-500'}>
          {errorCarga ?? 'No se encontró la internación solicitada.'}
        </p>
        <Link to="/internacion" className="inline-flex items-center gap-1 text-sm text-teal-700 hover:underline">
          <ArrowLeft size={16} /> Volver a internación
        </Link>
      </div>
    )
  }

  const { paciente } = internacion
  const sucursal = sucursales.find((s) => s.id === internacion.sucursal_id)
  const total = Number((internacion.costo_estadia_bs + internacion.costo_productos_bs).toFixed(2))
  // Las evoluciones se imprimen del ingreso hacia el alta, que es como se lee
  // una hoja de hospitalización (en pantalla van al revés, lo último primero).
  const evoluciones = [...internacion.notas].sort((a, b) => a.created_at.localeCompare(b.created_at))

  return (
    <div className="min-h-screen bg-slate-100 print:min-h-0 print:bg-white">
      <div className="mx-auto flex max-w-4xl flex-col items-stretch gap-3 px-4 py-4 print:hidden sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <Link to="/internacion" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft size={16} /> Volver a internación
        </Link>
        <Button onClick={() => window.print()}>
          <Printer size={16} /> Imprimir / Guardar PDF
        </Button>
      </div>

      <div className="mx-auto max-w-4xl bg-white p-4 shadow-sm sm:p-10 print:p-0 print:shadow-none">
        <header className="mb-5 border-b-2 border-slate-700 pb-3 text-center">
          <h1 className="text-base font-bold uppercase tracking-wide text-slate-800">Hoja de internación</h1>
          <p className="mt-0.5 text-xs text-slate-600">
            {clinica?.nombre ?? ""} {sucursal ? `— ${sucursal.nombre}` : ''}
          </p>
        </header>

        <TablaFicha
          titulo="Datos del paciente"
          filas={[
            ['Paciente', paciente.nombre],
            ['Especie', ESPECIE_LABEL[paciente.especie]],
            ['Raza', paciente.raza],
            ['Sexo', paciente.sexo],
            ['Edad', calcularEdad(paciente.fecha_nacimiento)],
            ['Propietario/a', paciente.cliente.nombre],
            ['WhatsApp', paciente.cliente.whatsapp],
            ['Carnet de identidad', paciente.cliente.ci],
          ]}
        />

        <TablaFicha
          titulo="Datos de la internación"
          filas={[
            ['Fecha de ingreso', formatClinicDateTime(internacion.fecha_ingreso)],
            ['Fecha de alta', internacion.fecha_alta ? formatClinicDateTime(internacion.fecha_alta) : 'En curso'],
            ['Días de estadía', etiquetaDias(internacion.dias)],
            ['Jaula o box', internacion.jaula],
            ['Veterinario/a responsable', internacion.veterinario_nombre],
            ['Tarifa por día', `${internacion.servicio_nombre} · ${formatBs(internacion.precio_dia_bs)}`],
          ]}
        />

        <TablaFicha titulo="Motivo de internación" columnas={1} filas={[['Motivo', internacion.motivo]]} />

        <TablaFicha
          titulo="Alergias y antecedentes"
          columnas={1}
          filas={[
            ['Alergias conocidas', paciente.alergias],
            ['Antecedentes médicos', paciente.antecedentes],
          ]}
        />

        <TablaListado
          titulo={`Evolución diaria (${evoluciones.length})`}
          cabeceras={['Fecha y hora', 'T° (°C)', 'FC (lpm)', 'FR (rpm)', 'Peso (kg)', 'Evolución', 'Veterinario/a']}
          filas={evoluciones.map((n) => [
            formatClinicDateTime(n.created_at),
            n.temperatura_c?.toString() ?? '—',
            n.frecuencia_cardiaca?.toString() ?? '—',
            n.frecuencia_respiratoria?.toString() ?? '—',
            n.peso_kg?.toString() ?? '—',
            n.nota,
            n.veterinario_nombre,
          ])}
        />

        <TablaListado
          titulo="Productos usados"
          cabeceras={['Producto', 'Cantidad', 'Precio unit.', 'Subtotal']}
          filas={internacion.productosUsados.map((p) => [
            p.nombre,
            String(p.cantidad),
            formatBs(p.precio_bs),
            formatBs(p.precio_bs * p.cantidad),
          ])}
        />

        <TablaFicha
          titulo="Resumen económico"
          filas={[
            ['Estadía', `${etiquetaDias(internacion.dias)} × ${formatBs(internacion.precio_dia_bs)}`],
            ['Subtotal estadía', formatBs(internacion.costo_estadia_bs)],
            ['Subtotal productos', formatBs(internacion.costo_productos_bs)],
            ['Total de la internación', formatBs(total)],
          ]}
        />

        <TablaFicha
          titulo="Indicaciones al alta"
          columnas={1}
          filas={[['Indicaciones', internacion.indicaciones_alta]]}
        />

        <section className="mt-10 grid grid-cols-2 gap-8 text-[11px]">
          <div className="text-center">
            <div className="border-t border-slate-400 pt-2">Firma del veterinario/a responsable</div>
          </div>
          <div className="text-center">
            <div className="border-t border-slate-400 pt-2">Firma del propietario/a al retirar</div>
          </div>
        </section>

        <footer className="mt-8 border-t border-slate-300 pt-3 text-center text-[9px] text-slate-500">
          Documento generado electrónicamente por Vetora el {formatClinicDate(new Date().toISOString())} · Las
          evoluciones registradas son inmutables.
        </footer>
      </div>
    </div>
  )
}
