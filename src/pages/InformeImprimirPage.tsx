import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useTable } from '../mocks/useDb'
import {
  AccionesFirmaInforme,
  FirmasInformeImpresas,
} from '../features/pacientes/FirmaInforme'
import { useFirmaInforme } from '../features/pacientes/useFirmaInforme'
import type { TipoInforme } from '../services/informes'
import { cargarFichaDeDocumento, volverDeDocumento } from '../services/documentos'
import { useAuth } from '../context/useAuth'
import { calcularEdad } from '../lib/paciente'
import { formatClinicDate, formatClinicDateTime } from '../lib/datetime'
import type { FichaPaciente } from '../types/views'
import { TablaFicha, TablaListado } from './HistorialImprimirPage'
import { anamnesisFilas, examenFilas } from './filasHistorial'

/**
 * Marca de campo sin dato en un informe impreso.
 *
 * Estas tres plantillas (laboratorio, imagenología, cirugía) traían valores
 * clínicos fijos escritos a mano en el código: hematocrito 42.5 %, creatinina
 * 1.1, "vesícula biliar anecoica sin litos", "inducción con propofol"… los
 * mismos para todo paciente, impresos bajo el membrete de la clínica y sobre
 * dos líneas de firma. No existe tabla de exámenes de laboratorio, así que no
 * había ningún dato real detrás: era un documento con aspecto de informe médico
 * firmado con resultados que nadie midió.
 *
 * Ahora solo se imprime lo que consta de verdad en la consulta; el resto sale
 * en blanco para que el veterinario lo rellene a mano sobre el papel.
 */
const PARA_COMPLETAR = '__________________'

const ESPECIE_LABEL: Record<string, string> = {
  canino: 'Canino',
  felino: 'Felino',
  ave: 'Ave',
  exotico: 'Exótico',
  otro: 'Otro',
}

/**
 * La ruta trae el tipo como texto libre. Se acota al conjunto que admite
 * `informes_firmados.tipo`, con 'consulta' de reserva — el mismo criterio que
 * ya usa `tituloInforme` más abajo.
 */
const TIPOS_INFORME: TipoInforme[] = ['consulta', 'laboratorio', 'imagenologia', 'cirugia']

export function InformeImprimirPage() {
  const { pacienteId, tipo, itemId } = useParams<{ pacienteId: string; tipo: string; itemId?: string }>()
  const { usuario } = useAuth()
  const [ficha, setFicha] = useState<FichaPaciente | null | undefined>(undefined)
  // «No se pudo cargar» y «no existe» son cosas distintas.
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const clinica = useTable('clinicas')[0]

  const tipoInforme: TipoInforme = TIPOS_INFORME.includes(tipo as TipoInforme)
    ? (tipo as TipoInforme)
    : 'consulta'
  // Antes de los `return` tempranos: un hook no puede quedar detrás de ellos.
  const { firma, setFirma } = useFirmaInforme(pacienteId, tipoInforme, itemId ?? null)

  useEffect(() => {
    if (!pacienteId) return
    cargarFichaDeDocumento(pacienteId, usuario?.rol)
      .then(setFicha)
      .catch((err) => {
        setErrorCarga(err instanceof Error ? err.message : 'No se pudo cargar el informe')
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
    <div className="min-h-screen bg-slate-100 print:min-h-0 print:bg-white">
      <div className="mx-auto flex max-w-4xl flex-col items-stretch gap-3 px-4 py-4 print:hidden sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <Link
          to={volverDeDocumento(paciente.id, usuario?.rol)}
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft size={16} /> {usuario?.rol === 'cliente' ? 'Volver a mi mascota' : 'Volver a la ficha del paciente'}
        </Link>
        <AccionesFirmaInforme
          pacienteId={paciente.id}
          tipo={tipoInforme}
          itemId={itemId ?? null}
          tituloDocumento={tituloInforme}
          nombreTutor={paciente.cliente.nombre}
          firma={firma}
          onFirmado={setFirma}
        />
      </div>

      <div className="mx-auto max-w-4xl doc-una-pagina bg-white p-4 shadow-sm sm:p-10 print:p-0 print:shadow-none">
        {/* Encabezado de la clínica */}
        <header className="mb-6 border-b-2 border-teal-700 pb-4 text-center">
          <h1 className="text-lg font-black uppercase tracking-wider text-slate-900">{tituloInforme}</h1>
          <p className="mt-1 text-xs font-bold text-teal-700">{clinica?.nombre ?? ""}</p>
          <p className="text-[11px] text-slate-500">Bolivia · Emisión: {formatClinicDate(new Date().toISOString())}</p>
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
                ['Tipo de Examen', cita?.servicio_nombre || PARA_COMPLETAR],
                ['Solicitante', consulta ? `Dr(a). ${consulta.veterinario_nombre}` : PARA_COMPLETAR],
                ['Fecha de Toma de Muestra', consulta ? formatClinicDateTime(consulta.created_at) : PARA_COMPLETAR],
                ['Estado de Muestra', PARA_COMPLETAR],
              ]}
            />

            <TablaListado
              titulo="Hemograma Completo & Serie Blanca"
              cabeceras={['Parámetro', 'Resultado', 'Unidades', 'Valores de Referencia']}
              filas={[
                ['Hematocrito (HTO)', PARA_COMPLETAR, '%', PARA_COMPLETAR],
                ['Hemoglobina (HB)', PARA_COMPLETAR, 'g/dL', PARA_COMPLETAR],
                ['Eritrocitos (RBC)', PARA_COMPLETAR, 'x10^6/uL', PARA_COMPLETAR],
                ['Leucocitos Totales (WBC)', PARA_COMPLETAR, 'x10^3/uL', PARA_COMPLETAR],
                ['Plaquetas', PARA_COMPLETAR, 'x10^3/uL', PARA_COMPLETAR],
              ]}
            />

            <TablaListado
              titulo="Perfil Bioquímico Renal y Hepático"
              cabeceras={['Parámetro', 'Resultado', 'Unidades', 'Valores de Referencia']}
              filas={[
                ['Urea', PARA_COMPLETAR, 'mg/dL', PARA_COMPLETAR],
                ['Creatinina', PARA_COMPLETAR, 'mg/dL', PARA_COMPLETAR],
                ['ALT (GPT)', PARA_COMPLETAR, 'U/L', PARA_COMPLETAR],
                ['Fosfatasa Alcalina (ALP)', PARA_COMPLETAR, 'U/L', PARA_COMPLETAR],
              ]}
            />

            <TablaFicha
              titulo="Interpretación y Conclusión de Laboratorio"
              columnas={1}
              filas={[
                ['Observaciones Microscópicas', PARA_COMPLETAR],
                ['Diagnóstico de laboratorio', consulta?.diagnostico || PARA_COMPLETAR],
              ]}
            />
          </article>
        )}

        {tipo === 'imagenologia' && (
          <article className="space-y-6">
            <TablaFicha
              titulo="Protocolo del Estudio de Imagen"
              filas={[
                ['Estudio Realizado', cita?.servicio_nombre || PARA_COMPLETAR],
                ['Médico Ecografista/Radiólogo', consulta ? `Dr(a). ${consulta.veterinario_nombre}` : PARA_COMPLETAR],
                ['Fecha del Estudio', consulta ? formatClinicDateTime(consulta.created_at) : PARA_COMPLETAR],
                ['Sedación / Anestesia', PARA_COMPLETAR],
              ]}
            />

            <TablaFicha
              titulo="Hallazgos Ecográficos y Radiológicos"
              columnas={1}
              filas={[
                ['Hígado y Vesícula Biliar', PARA_COMPLETAR],
                ['Bazo y Riñones', PARA_COMPLETAR],
                ['Tracto Gastrointestinal', PARA_COMPLETAR],
                ['Vejiga y Tracto Urogenital', PARA_COMPLETAR],
              ]}
            />

            <TablaFicha
              titulo="Conclusión Diagnóstica de Imagen"
              columnas={1}
              filas={[
                ['Impresión Diagnóstica', consulta?.diagnostico || PARA_COMPLETAR],
                ['Recomendaciones', PARA_COMPLETAR],
              ]}
            />
          </article>
        )}

        {tipo === 'cirugia' && (
          <article className="space-y-6">
            <TablaFicha
              titulo="Protocolo Quirúrgico y Pre-Operatorio"
              filas={[
                ['Procedimiento Quirúrgico', cita?.servicio_nombre || consulta?.procedimiento || PARA_COMPLETAR],
                ['Cirujano/a Principal', consulta ? `Dr(a). ${consulta.veterinario_nombre}` : PARA_COMPLETAR],
                ['Fecha de Intervención', consulta ? formatClinicDateTime(consulta.created_at) : PARA_COMPLETAR],
                ['Riesgo Anestésico ASA', PARA_COMPLETAR],
              ]}
            />

            <TablaFicha
              titulo="Resumen de la Técnica e Intervención"
              columnas={1}
              filas={[
                ['Pre-medicación & Anestesia', PARA_COMPLETAR],
                ['Hallazgos Intraoperatorios', PARA_COMPLETAR],
                ['Técnica de Sutura y Cierre', PARA_COMPLETAR],
              ]}
            />

            <TablaFicha
              titulo="Indicaciones Post-Quirúrgicas"
              columnas={1}
              filas={[
                ['Indicaciones y Cuidados', consulta?.tratamiento || PARA_COMPLETAR],
                ['Control y Retiro de Puntos', PARA_COMPLETAR],
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

        <FirmasInformeImpresas firma={firma} />

        <footer className="mt-10 border-t border-slate-300 pt-3 text-center text-[9px] text-slate-500">
          Documento emitido por Vetora para {clinica?.nombre ?? ""} · Válido para trámite y archivo médico.
        </footer>
      </div>
    </div>
  )
}
