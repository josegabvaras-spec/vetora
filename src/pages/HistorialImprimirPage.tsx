import { Fragment, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useTable } from '../mocks/useDb'
import { useEsEscritorio } from '../hooks/useMediaQuery'
import {
  AccionesFirmaInforme,
  FirmasInformeImpresas,
  useFirmaInforme,
} from '../features/pacientes/FirmaInforme'
import { getFichaPaciente } from '../services/clientesPacientes'
import { calcularEdad } from '../lib/paciente'
import { formatClinicDate, formatClinicDateTime } from '../lib/datetime'
import { formatBs } from '../lib/currency'
import { etiquetaClinica } from '../lib/anamnesis'
import { TIPO_LABEL } from '../lib/citas'
import type { FichaPaciente, HistorialConDetalle } from '../types/views'

const ESPECIE_LABEL: Record<string, string> = {
  canino: 'Canino',
  felino: 'Felino',
  ave: 'Ave',
  exotico: 'Exótico',
  otro: 'Otro',
}

const VACIO = '—'

/** Una fila de la ficha: siempre se imprime, aunque el dato no se haya registrado. */
type Fila = [etiqueta: string, valor: string | null | undefined]

// `w-40` solo desde `md`. Con dos pares por fila eran 320 px de etiqueta en un
// celular de 375: quedaban 23 px para los dos valores, así que el texto se
// superponía y la última columna se salía del papel.
const celdaEtiqueta = 'w-28 md:w-40 border border-slate-400 bg-slate-100 px-2 py-1 text-left align-top text-[10px] font-bold uppercase tracking-wide text-slate-600'
const celdaValor = 'border border-slate-400 px-2 py-1 align-top text-slate-800'

/** Tabla etiqueta/valor a dos columnas de pares por fila. */
export function TablaFicha({ titulo, filas, columnas = 2 }: { titulo: string; filas: Fila[]; columnas?: 1 | 2 }) {
  // En celular va SIEMPRE un par por fila. Dos pares son cuatro columnas, y en
  // 343 px de ancho no hay forma de repartirlas sin que se pisen: el documento
  // se alarga, pero se lee.
  const esEscritorio = useEsEscritorio()
  const paresPorFila = esEscritorio ? columnas : 1

  const grupos: Fila[][] = []
  for (let i = 0; i < filas.length; i += paresPorFila) {
    grupos.push(filas.slice(i, i + paresPorFila))
  }

  return (
    <section className="mb-4 break-inside-avoid">
      <h3 className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-700">{titulo}</h3>
      <table className="w-full table-fixed border-collapse text-[11px]">
        <tbody>
          {grupos.map((grupo, i) => (
            <tr key={i}>
              {grupo.map(([etiqueta, valor]) => (
                <Fragment key={etiqueta}>
                  <th scope="row" className={celdaEtiqueta}>
                    {etiqueta}
                  </th>
                  <td className={celdaValor}>{valor?.toString().trim() ? valor : VACIO}</td>
                </Fragment>
              ))}
              {/* Completa la última fila si quedó impar, para no romper la rejilla */}
              {grupo.length < paresPorFila && (
                <td className="border border-slate-400" colSpan={(paresPorFila - grupo.length) * 2} />
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

export function TablaListado({
  titulo,
  cabeceras,
  filas,
}: {
  titulo: string
  cabeceras: string[]
  filas: string[][]
}) {
  return (
    <section className="mb-4 break-inside-avoid">
      <h3 className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-700">{titulo}</h3>
      {/* El recetario llega a seis columnas (medicamento, dosis, vía, frecuencia,
          duración, indicaciones): en celular no caben, así que la tabla se
          desplaza sola en vez de salirse del documento. Al imprimir se anula el
          desplazamiento para que no recorte nada en el papel. */}
      <div className="overflow-x-auto print:overflow-visible">
      <table className="w-full min-w-[28rem] border-collapse text-[11px] print:min-w-0">
        <thead>
          <tr>
            {cabeceras.map((c) => (
              <th key={c} className="border border-slate-400 bg-slate-100 px-2 py-1 text-left text-[10px] font-bold uppercase tracking-wide text-slate-600">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.length === 0 ? (
            <tr>
              <td className={celdaValor} colSpan={cabeceras.length}>
                Ninguno registrado
              </td>
            </tr>
          ) : (
            filas.map((fila, i) => (
              <tr key={i}>
                {fila.map((celda, j) => (
                  <td key={j} className={celdaValor}>
                    {celda}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
      </div>
    </section>
  )
}

export function anamnesisFilas(h: HistorialConDetalle): Fila[] {
  return [
    ['Motivo', h.motivo],
    ['Tiempo de evolución', h.tiempo_evolucion],
    ['Apetito', etiquetaClinica('apetito', h.apetito)],
    ['Consumo de agua', etiquetaClinica('consumo_agua', h.consumo_agua)],
    ['Vómitos', etiquetaClinica('vomitos', h.vomitos)],
    ['Orina', etiquetaClinica('orina', h.orina)],
    ['Heces: consistencia', etiquetaClinica('heces_consistencia', h.heces_consistencia)],
    ['Heces: color', etiquetaClinica('heces_color', h.heces_color)],
    [
      'Desparasitación al día',
      h.desparasitacion_al_dia === null || h.desparasitacion_al_dia === undefined
        ? null
        : h.desparasitacion_al_dia
          ? 'Sí'
          : 'No',
    ],
  ]
}

export function examenFilas(h: HistorialConDetalle): Fila[] {
  return [
    ['Peso (kg)', h.peso_kg?.toString()],
    ['Temperatura (°C)', h.temperatura_c?.toString()],
    ['Frec. cardíaca (lpm)', h.frecuencia_cardiaca?.toString()],
    ['Frec. respiratoria (rpm)', h.frecuencia_respiratoria?.toString()],
    ['Deshidratación', etiquetaClinica('deshidratacion', h.deshidratacion)],
    ['Mucosas', etiquetaClinica('mucosas', h.mucosas)],
    ['Llenado capilar (TLLC)', etiquetaClinica('tllc', h.tllc)],
    ['Estado de conciencia', etiquetaClinica('estado_conciencia', h.estado_conciencia)],
    ['Condición corporal', h.condicion_corporal ? `${h.condicion_corporal}/9` : null],
  ]
}

export function HistorialImprimirPage() {
  const { id } = useParams<{ id: string }>()
  const [ficha, setFicha] = useState<FichaPaciente | null | undefined>(undefined)
  // «No se pudo cargar» y «no existe» son cosas distintas.
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const clinica = useTable('clinicas')[0]
  // El historial completo no habla de una consulta concreta: va sin `item_id`.
  const { firma, setFirma } = useFirmaInforme(id, 'historial', null)

  useEffect(() => {
    if (!id) return
    getFichaPaciente(id)
      .then(setFicha)
      .catch((err) => {
        setErrorCarga(err instanceof Error ? err.message : 'No se pudo cargar el historial')
        setFicha(null)
      })
  }, [id])

  if (ficha === undefined) {
    return <p className="p-6 text-sm text-slate-500">Cargando historial…</p>
  }

  if (!ficha) {
    return (
      <div className="mx-auto max-w-lg space-y-4 p-6 text-center">
        <p className={errorCarga ? 'text-sm font-semibold text-rose-700' : 'text-sm text-slate-500'}>
          {errorCarga ?? 'No se encontró el paciente solicitado.'}
        </p>
        <Link to="/pacientes" className="inline-flex items-center gap-1 text-sm text-teal-700 hover:underline">
          <ArrowLeft size={16} /> Volver a pacientes
        </Link>
      </div>
    )
  }

  const { paciente, historiales, internaciones } = ficha

  return (
    <div className="min-h-screen bg-slate-100 print:min-h-0 print:bg-white">
      <div className="mx-auto flex max-w-4xl flex-col items-stretch gap-3 px-4 py-4 print:hidden sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <Link
          to={`/pacientes/${paciente.id}`}
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft size={16} /> Volver a la ficha
        </Link>
        <AccionesFirmaInforme
          pacienteId={paciente.id}
          tipo="historial"
          itemId={null}
          tituloDocumento="Ficha clínica e historial veterinario"
          nombreTutor={paciente.cliente.nombre}
          firma={firma}
          onFirmado={setFirma}
        />
      </div>

      <div className="mx-auto max-w-4xl bg-white p-4 shadow-sm sm:p-10 print:p-0 print:shadow-none">
        <header className="mb-5 border-b-2 border-slate-700 pb-3 text-center">
          <h1 className="text-base font-bold uppercase tracking-wide text-slate-800">
            Ficha clínica e historial veterinario
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

        <TablaFicha
          titulo="Antecedentes clínicos"
          columnas={1}
          filas={[
            ['Alergias conocidas', paciente.alergias],
            ['Antecedentes médicos', paciente.antecedentes],
          ]}
        />

        {/* Las hospitalizaciones son parte del expediente, igual que las consultas. */}
        <TablaListado
          titulo={`Internaciones (${internaciones.length})`}
          cabeceras={['Ingreso', 'Alta', 'Días', 'Motivo', 'Veterinario/a']}
          filas={internaciones.map((i) => [
            formatClinicDateTime(i.fecha_ingreso),
            i.fecha_alta ? formatClinicDateTime(i.fecha_alta) : 'En curso',
            String(i.dias),
            i.motivo,
            i.veterinario_nombre,
          ])}
        />

        <h2 className="mb-3 mt-6 border-b border-slate-400 pb-1 text-xs font-bold uppercase tracking-wide text-slate-700">
          Consultas registradas ({historiales.length})
        </h2>

        {historiales.length === 0 && <p className="text-[11px] text-slate-500">Sin consultas registradas.</p>}

        {historiales.map((h, indice) => (
          <article key={h.id} className="mb-6 break-inside-avoid border-t-2 border-slate-300 pt-3">
            <p className="mb-2 text-[11px] font-bold text-slate-700">
              {TIPO_LABEL[h.tipo_cita]} {historiales.length - indice} · {formatClinicDateTime(h.created_at)} · Dr(a).{' '}
              {h.veterinario_nombre}
              {h.editable && ' · BORRADOR'}
            </p>

            {(h.origen || h.procedimiento) && (
              <TablaFicha
                titulo="Contexto de la atención"
                columnas={1}
                filas={[
                  [
                    'Controla la consulta del',
                    h.origen ? `${formatClinicDateTime(h.origen.fecha_hora)} — ${h.origen.motivo}` : null,
                  ],
                  ['Procedimiento', h.procedimiento],
                ]}
              />
            )}

            <TablaFicha titulo="Anamnesis" filas={anamnesisFilas(h)} />
            <TablaFicha titulo="Síntomas referidos" columnas={1} filas={[['Síntomas', h.sintomas]]} />
            <TablaFicha titulo="Examen físico" filas={examenFilas(h)} />
            <TablaFicha
              titulo="Observaciones del examen"
              columnas={1}
              filas={[['Observaciones', h.observaciones_examen]]}
            />
            <TablaFicha
              titulo="Conclusión"
              columnas={1}
              filas={[
                ['Diagnóstico', h.diagnostico],
                ['Tratamiento', h.tratamiento],
              ]}
            />

            <TablaListado
              titulo="Vacunas aplicadas"
              cabeceras={['Vacuna', 'Fecha de aplicación', 'Próximo refuerzo']}
              filas={h.vacunas.map((v) => [v.nombre_vacuna, v.fecha_aplicacion, v.fecha_refuerzo || VACIO])}
            />

            <TablaListado
              titulo="Desparasitaciones"
              cabeceras={['Antiparasitario', 'Vía', 'Fecha de aplicación', 'Próxima dosis']}
              filas={h.desparasitaciones.map((d) => [
                d.producto,
                d.via,
                d.fecha_aplicacion,
                d.fecha_proxima || VACIO,
              ])}
            />

            <TablaListado
              titulo="Recetario médico"
              cabeceras={['Medicamento', 'Dosis', 'Vía', 'Frecuencia', 'Duración', 'Indicaciones']}
              filas={(h.receta ?? []).map((r) => [
                r.medicamento,
                r.dosis,
                r.via,
                r.frecuencia,
                r.duracion,
                r.indicaciones || VACIO,
              ])}
            />

            <TablaListado
              titulo="Productos usados"
              cabeceras={['Producto', 'Cantidad', 'Precio unit.', 'Subtotal']}
              filas={h.productosUsados.map((p) => [
                p.nombre,
                String(p.cantidad),
                formatBs(p.precio_bs),
                formatBs(p.precio_bs * p.cantidad),
              ])}
            />
          </article>
        ))}

        <FirmasInformeImpresas firma={firma} />

        <footer className="mt-8 border-t border-slate-300 pt-3 text-center text-[9px] text-slate-500">
          Documento generado electrónicamente por Vetora el {formatClinicDate(new Date().toISOString())} · Los
          historiales cerrados son inmutables.
        </footer>
      </div>
    </div>
  )
}
