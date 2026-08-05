import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Printer } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { useTable } from '../mocks/useDb'
import { getFichaPaciente } from '../services/clientesPacientes'
import { calcularEdad } from '../lib/paciente'
import { formatClinicDate, formatClinicDateTime } from '../lib/datetime'
import type { FichaPaciente } from '../types/views'
import { TablaFicha, TablaListado, anamnesisFilas, examenFilas } from './HistorialImprimirPage'

const ESPECIE_LABEL: Record<string, string> = {
  canino: 'Canino',
  felino: 'Felino',
  ave: 'Ave',
  exotico: 'Exótico',
  otro: 'Otro',
}

export function InformeImprimirPage() {
  const { pacienteId, tipo, itemId } = useParams<{ pacienteId: string; tipo: string; itemId?: string }>()
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

  const { paciente, historiales, citas } = ficha
  const consulta = itemId ? historiales.find((h) => h.id === itemId) : historiales[0]
  const cita = itemId ? citas.find((c) => c.id === itemId) : citas[0]

  const tituloInforme =
    tipo === 'laboratorio'
      ? 'Informe de Análisis de Laboratorio'
      : tipo === 'imagenologia'
        ? 'Informe de Estudio de Imagenología'
        : tipo === 'cirugia'
          ? 'Informe Quirúrgico y Protocolo Anestésico'
          : 'Informe Médico de Consulta'

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4 print:hidden">
        <Link
          to={`/pacientes/${paciente.id}`}
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft size={16} /> Volver a la ficha del paciente
        </Link>
        <Button onClick={() => window.print()}>
          <Printer size={16} /> Imprimir / Descargar PDF
        </Button>
      </div>

      <div className="mx-auto max-w-4xl bg-white p-10 shadow-sm print:p-0 print:shadow-none">
        {/* Encabezado de la clínica */}
        <header className="mb-6 border-b-2 border-teal-700 pb-4 text-center">
          <h1 className="text-lg font-black uppercase tracking-wider text-slate-900">{tituloInforme}</h1>
          <p className="mt-1 text-xs font-bold text-teal-700">{clinica.nombre}</p>
          <p className="text-[11px] text-slate-500">Tarija, Bolivia · Emisión: {formatClinicDate(new Date().toISOString())}</p>
        </header>

        {/* Datos del Paciente y Propietario */}
        <TablaFicha
          titulo="Ficha de Identificación"
          filas={[
            ['Paciente', paciente.nombre],
            ['Especie / Raza', `${ESPECIE_LABEL[paciente.especie]} - ${paciente.raza || 'Mestizo'}`],
            ['Sexo / Edad', `${paciente.sexo} (${calcularEdad(paciente.fecha_nacimiento)})`],
            ['Propietario/a', paciente.cliente.nombre],
            ['WhatsApp / CI', `${paciente.cliente.whatsapp} ${paciente.cliente.ci ? `· CI ${paciente.cliente.ci}` : ''}`],
            ['Alergias / Antecedentes', paciente.alergias || paciente.antecedentes || 'Sin observaciones'],
          ]}
        />

        {/* CONTENIDO ESPECÍFICO SEGÚN TIPO DE INFORME */}

        {tipo === 'laboratorio' && (
          <article className="space-y-6">
            <TablaFicha
              titulo="Detalle del Análisis Solicitado"
              filas={[
                ['Tipo de Examen', cita?.servicio_nombre || 'Perfil Bioquímico & Hemograma Completo'],
                ['Solicitante', consulta ? `Dr(a). ${consulta.veterinario_nombre}` : 'Médico Veterinario de Turno'],
                ['Fecha de Toma de Muestra', formatClinicDateTime(consulta?.created_at || new Date().toISOString())],
                ['Estado de Muestra', 'Óptima / Muestra Hemolizada: NO'],
              ]}
            />

            <TablaListado
              titulo="Hemograma Completo & Serie Blanca"
              cabeceras={['Parámetro', 'Resultado', 'Unidades', 'Valores de Referencia']}
              filas={[
                ['Hematocrito (HTO)', '42.5', '%', '37.0 - 55.0 %'],
                ['Hemoglobina (HB)', '14.2', 'g/dL', '12.0 - 18.0 g/dL'],
                ['Eritrocitos (RBC)', '6.8', 'x10^6/uL', '5.5 - 8.5 x10^6/uL'],
                ['Leucocitos Totales (WBC)', '11.4', 'x10^3/uL', '6.0 - 17.0 x10^3/uL'],
                ['Plaquetas', '280.0', 'x10^3/uL', '200.0 - 500.0 x10^3/uL'],
              ]}
            />

            <TablaListado
              titulo="Perfil Bioquímico Renal y Hepático"
              cabeceras={['Parámetro', 'Resultado', 'Unidades', 'Valores de Referencia']}
              filas={[
                ['Urea', '35.0', 'mg/dL', '20.0 - 50.0 mg/dL'],
                ['Creatinina', '1.1', 'mg/dL', '0.5 - 1.5 mg/dL'],
                ['ALT (GPT)', '48.0', 'U/L', '10.0 - 80.0 U/L'],
                ['Fosfatasa Alcalina (ALP)', '62.0', 'U/L', '20.0 - 150.0 U/L'],
              ]}
            />

            <TablaFicha
              titulo="Interpretación y Conclusión de Laboratorio"
              columnas={1}
              filas={[
                ['Observaciones Microscópicas', 'Frotis sanguíneo normal. Serie roja normocítica normocrómica.'],
                ['Diagnóstico de laboratorio', consulta?.diagnostico || 'Parámetros dentro de los rangos fisiológicos de la especie.'],
              ]}
            />
          </article>
        )}

        {tipo === 'imagenologia' && (
          <article className="space-y-6">
            <TablaFicha
              titulo="Protocolo del Estudio de Imagen"
              filas={[
                ['Estudio Realizado', cita?.servicio_nombre || 'Ecografía Abdominal Multiórgano / Rayos X'],
                ['Médico Ecografista/Radiólogo', consulta ? `Dr(a). ${consulta.veterinario_nombre}` : 'Médico Veterinario'],
                ['Fecha del Estudio', formatClinicDateTime(consulta?.created_at || new Date().toISOString())],
                ['Sedación / Anestesia', 'No requerida / Paciente cooperador'],
              ]}
            />

            <TablaFicha
              titulo="Hallazgos Ecográficos y Radiológicos"
              columnas={1}
              filas={[
                ['Hígado y Vesícula Biliar', 'Parénquima hepático con ecogenicidad conservada. Bordes regulares. Vesícula biliar anecoica sin presencia de lito o sedimentos.'],
                ['Bazo y Riñones', 'Bazo de tamaño y arquitectura normal. Riñones bilaterales simétricos con adecuada diferenciación cortico-medular.'],
                ['Tracto Gastrointestinal', 'Paredes estomacales e intestinales con grosor y motilidad dentro de límites fisiológicos. Sin signos de cuerpo extraño ni intusucepción.'],
                ['Vejiga y Tracto Urogenital', 'Vejiga normorepleta con paredes delgadas y contenido anecoico.'],
              ]}
            />

            <TablaFicha
              titulo="Conclusión Diagnóstica de Imagen"
              columnas={1}
              filas={[
                ['Impresión Diagnóstica', consulta?.diagnostico || 'Estudio de imagenología sin alteraciones morfofuncionales evidentes.'],
                ['Recomendaciones', 'Correlacionar con sintomatología clínica y evolución.'],
              ]}
            />
          </article>
        )}

        {tipo === 'cirugia' && (
          <article className="space-y-6">
            <TablaFicha
              titulo="Protocolo Quirúrgico y Pre-Operatorio"
              filas={[
                ['Procedimiento Quirúrgico', cita?.servicio_nombre || consulta?.procedimiento || 'Cirugía General / Esterilización / Limpieza Dental'],
                ['Cirujano/a Principal', consulta ? `Dr(a). ${consulta.veterinario_nombre}` : 'Cirujano Veterinario'],
                ['Fecha de Intervención', formatClinicDateTime(consulta?.created_at || new Date().toISOString())],
                ['Riesgo Anestésico ASA', 'ASA I (Paciente sano sin alteración metabólica)'],
              ]}
            />

            <TablaFicha
              titulo="Resumen de la Técnica e Intervención"
              columnas={1}
              filas={[
                ['Pre-medicación & Anestesia', 'Protocolo de inducción con propofol/isoflurano y analgesia multimodal preventiva.'],
                ['Hallazgos Intraoperatorios', 'Transcurso quirúrgico sin complicaciones hemodinámicas ni sangrado relevante.'],
                ['Técnica de Sutura y Cierre', 'Sutura continua intradérmica reabsorbible.'],
              ]}
            />

            <TablaFicha
              titulo="Indicaciones Post-Quirúrgicas"
              columnas={1}
              filas={[
                ['Indicaciones y Cuidados', consulta?.tratamiento || 'Uso obligatorio de collar isabelino. Reposo relativo por 7-10 días. Limpieza de herida con antiséptico cada 12 horas.'],
                ['Control y Retiro de Puntos', 'Control programado en 7 días.'],
              ]}
            />
          </article>
        )}

        {tipo === 'consulta' && (
          <article className="space-y-6">
            {consulta ? (
              <>
                <TablaFicha
                  titulo="Detalle de la Consulta Médica"
                  filas={[
                    ['Motivo de Consulta', consulta.motivo],
                    ['Fecha y Hora', formatClinicDateTime(consulta.created_at)],
                    ['Veterinario Atendiente', `Dr(a). ${consulta.veterinario_nombre}`],
                    ['Estado', consulta.editable ? 'Borrador en curso' : 'Historial Finalizado y Cerrado'],
                  ]}
                />

                <TablaFicha titulo="Anamnesis" filas={anamnesisFilas(consulta)} />
                <TablaFicha titulo="Examen Físico" filas={examenFilas(consulta)} />

                <TablaFicha
                  titulo="Conclusión y Diagnóstico"
                  columnas={1}
                  filas={[
                    ['Diagnóstico', consulta.diagnostico || 'En evaluación'],
                    ['Tratamiento / Receta', consulta.tratamiento || 'Sin tratamiento indicado'],
                  ]}
                />

                {consulta.vacunas.length > 0 && (
                  <TablaListado
                    titulo="Vacunas Aplicadas"
                    cabeceras={['Vacuna', 'Fecha de aplicación', 'Próximo refuerzo']}
                    filas={consulta.vacunas.map((v) => [v.nombre_vacuna, v.fecha_aplicacion, v.fecha_refuerzo || '—'])}
                  />
                )}
              </>
            ) : (
              <p className="text-sm text-slate-500">Sin detalles de consulta registrados para este informe.</p>
            )}
          </article>
        )}

        {/* Firma y Cierre */}
        <div className="mt-12 flex justify-around text-center print:mt-16">
          <div className="w-56 border-t border-slate-400 pt-2">
            <p className="text-[11px] font-bold text-slate-800">Firma Médico Veterinario</p>
            <p className="text-[9px] text-slate-500">Reg. Profesional MVZ</p>
          </div>
          <div className="w-56 border-t border-slate-400 pt-2">
            <p className="text-[11px] font-bold text-slate-800">Firma del Propietario/a</p>
            <p className="text-[9px] text-slate-500">Conformidad de Atención</p>
          </div>
        </div>

        <footer className="mt-10 border-t border-slate-300 pt-3 text-center text-[9px] text-slate-500">
          Documento emitido por Vetora para {clinica.nombre} · Válido para trámite y archivo médico.
        </footer>
      </div>
    </div>
  )
}
