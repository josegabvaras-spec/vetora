import { FieldGroup, Input, Select, Textarea } from '../../components/ui/Field'
import { Seccion } from '../../components/ui/Seccion'
import { aNumeroOpcional } from '../../lib/numeros'
import {
  CONDICION_CORPORAL_OPCIONES,
  OPCIONES_CLINICAS,
  type CampoClinico,
  type OpcionClinica,
} from '../../lib/anamnesis'
import type { HistorialClinico } from '../../types/database'

/**
 * Estado del formulario clínico. Todo se mantiene como string (lo que
 * devuelven los inputs) y se convierte al guardar con `aCamposHistorial`,
 * para que los campos vacíos lleguen como null y no como 0 o ''.
 */
export interface DatosClinicos {
  // Anamnesis
  motivo: string
  sintomas: string
  tiempo_evolucion: string
  apetito: string
  consumo_agua: string
  vomitos: string
  heces_consistencia: string
  heces_color: string
  orina: string
  desparasitacion_al_dia: string // '' | 'si' | 'no'
  // Examen físico
  peso_kg: string
  temperatura_c: string
  frecuencia_cardiaca: string
  frecuencia_respiratoria: string
  deshidratacion: string
  mucosas: string
  tllc: string
  condicion_corporal: string
  estado_conciencia: string
  observaciones_examen: string
  // Conclusión
  diagnostico: string
  tratamiento: string
}

export function datosClinicosVacios(): DatosClinicos {
  return {
    motivo: '',
    sintomas: '',
    tiempo_evolucion: '',
    apetito: '',
    consumo_agua: '',
    vomitos: '',
    heces_consistencia: '',
    heces_color: '',
    orina: '',
    desparasitacion_al_dia: '',
    peso_kg: '',
    temperatura_c: '',
    frecuencia_cardiaca: '',
    frecuencia_respiratoria: '',
    deshidratacion: '',
    mucosas: '',
    tllc: '',
    condicion_corporal: '',
    estado_conciencia: '',
    observaciones_examen: '',
    diagnostico: '',
    tratamiento: '',
  }
}

const texto = (v: string | null | undefined) => v ?? ''
const numero = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v))

/** Rellena el formulario a partir de un historial ya guardado. */
export function datosClinicosDesde(h: HistorialClinico): DatosClinicos {
  return {
    motivo: h.motivo,
    sintomas: texto(h.sintomas),
    tiempo_evolucion: texto(h.tiempo_evolucion),
    apetito: texto(h.apetito),
    consumo_agua: texto(h.consumo_agua),
    vomitos: texto(h.vomitos),
    heces_consistencia: texto(h.heces_consistencia),
    heces_color: texto(h.heces_color),
    orina: texto(h.orina),
    desparasitacion_al_dia:
      h.desparasitacion_al_dia === null || h.desparasitacion_al_dia === undefined
        ? ''
        : h.desparasitacion_al_dia
          ? 'si'
          : 'no',
    peso_kg: numero(h.peso_kg),
    temperatura_c: numero(h.temperatura_c),
    frecuencia_cardiaca: numero(h.frecuencia_cardiaca),
    frecuencia_respiratoria: numero(h.frecuencia_respiratoria),
    deshidratacion: texto(h.deshidratacion),
    mucosas: texto(h.mucosas),
    tllc: texto(h.tllc),
    condicion_corporal: numero(h.condicion_corporal),
    estado_conciencia: texto(h.estado_conciencia),
    observaciones_examen: texto(h.observaciones_examen),
    diagnostico: h.diagnostico,
    tratamiento: h.tratamiento,
  }
}

const nuloSiVacio = (v: string) => (v.trim() ? v.trim() : null)

/** Convierte el estado del formulario a los campos que espera el historial. */
export function aCamposHistorial(d: DatosClinicos): Partial<HistorialClinico> & { motivo: string } {
  return {
    motivo: d.motivo.trim(),
    sintomas: d.sintomas,
    tiempo_evolucion: nuloSiVacio(d.tiempo_evolucion),
    apetito: nuloSiVacio(d.apetito),
    consumo_agua: nuloSiVacio(d.consumo_agua),
    vomitos: nuloSiVacio(d.vomitos),
    heces_consistencia: nuloSiVacio(d.heces_consistencia),
    heces_color: nuloSiVacio(d.heces_color),
    orina: nuloSiVacio(d.orina),
    desparasitacion_al_dia: d.desparasitacion_al_dia === '' ? null : d.desparasitacion_al_dia === 'si',
    peso_kg: aNumeroOpcional(d.peso_kg),
    temperatura_c: aNumeroOpcional(d.temperatura_c),
    frecuencia_cardiaca: aNumeroOpcional(d.frecuencia_cardiaca),
    frecuencia_respiratoria: aNumeroOpcional(d.frecuencia_respiratoria),
    deshidratacion: nuloSiVacio(d.deshidratacion),
    mucosas: nuloSiVacio(d.mucosas),
    tllc: nuloSiVacio(d.tllc),
    condicion_corporal: aNumeroOpcional(d.condicion_corporal),
    estado_conciencia: nuloSiVacio(d.estado_conciencia),
    observaciones_examen: nuloSiVacio(d.observaciones_examen),
    diagnostico: d.diagnostico,
    tratamiento: d.tratamiento,
  } as Partial<HistorialClinico> & { motivo: string }
}

interface Props {
  datos: DatosClinicos
  onChange: (datos: DatosClinicos) => void
  disabled?: boolean
}

export function FormularioClinico({ datos, onChange, disabled }: Props) {
  const set = (campo: keyof DatosClinicos) => (valor: string) => onChange({ ...datos, [campo]: valor })

  function SelectClinico({ campo, label }: { campo: CampoClinico; label: string }) {
    const opciones = OPCIONES_CLINICAS[campo] as readonly OpcionClinica[]
    return (
      <FieldGroup label={label}>
        <Select
          value={datos[campo]}
          onChange={(e) => set(campo)(e.target.value)}
          disabled={disabled}
        >
          <option value="">Sin registrar</option>
          {opciones.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.label}
            </option>
          ))}
        </Select>
      </FieldGroup>
    )
  }

  function NumeroClinico({
    campo,
    label,
    step,
  }: {
    campo: keyof DatosClinicos
    label: string
    step?: string
  }) {
    return (
      <FieldGroup label={label}>
        <Input
          type="number"
          min="0"
          step={step}
          value={datos[campo]}
          onChange={(e) => set(campo)(e.target.value)}
          disabled={disabled}
          placeholder="—"
        />
      </FieldGroup>
    )
  }

  return (
    <div className="space-y-5">
      {/* ---------- Anamnesis ---------- */}
      <Seccion titulo="Anamnesis">
        <FieldGroup label="Motivo de la consulta">
          <Input
            value={datos.motivo}
            onChange={(e) => set('motivo')(e.target.value)}
            disabled={disabled}
            placeholder="Ej. control de rutina, vacunación, herida, vómitos…"
          />
        </FieldGroup>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <FieldGroup label="Síntomas referidos por el propietario/a">
              <Textarea
                value={datos.sintomas}
                onChange={(e) => set('sintomas')(e.target.value)}
                disabled={disabled}
                placeholder="Describe lo que refiere el dueño/a y lo observado…"
              />
            </FieldGroup>
          </div>
          <FieldGroup label="Tiempo de evolución">
            <Input
              value={datos.tiempo_evolucion}
              onChange={(e) => set('tiempo_evolucion')(e.target.value)}
              disabled={disabled}
              placeholder="Ej. 3 días, 2 semanas…"
            />
          </FieldGroup>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <SelectClinico campo="apetito" label="Apetito" />
          <SelectClinico campo="consumo_agua" label="Consumo de agua" />
          <SelectClinico campo="vomitos" label="Vómitos" />
          <SelectClinico campo="heces_consistencia" label="Heces: consistencia" />
          <SelectClinico campo="heces_color" label="Heces: color" />
          <SelectClinico campo="orina" label="Orina" />
          <FieldGroup label="Desparasitación al día">
            <Select
              value={datos.desparasitacion_al_dia}
              onChange={(e) => set('desparasitacion_al_dia')(e.target.value)}
              disabled={disabled}
            >
              <option value="">Sin registrar</option>
              <option value="si">Sí</option>
              <option value="no">No</option>
            </Select>
          </FieldGroup>
        </div>
      </Seccion>

      {/* ---------- Examen físico ---------- */}
      <Seccion titulo="Examen físico">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <NumeroClinico campo="peso_kg" label="Peso (kg)" step="0.1" />
          <NumeroClinico campo="temperatura_c" label="Temp. (°C)" step="0.1" />
          <NumeroClinico campo="frecuencia_cardiaca" label="Frec. cardíaca (lpm)" />
          <NumeroClinico campo="frecuencia_respiratoria" label="Frec. respiratoria (rpm)" />
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <SelectClinico campo="deshidratacion" label="Deshidratación" />
          <SelectClinico campo="mucosas" label="Mucosas" />
          <SelectClinico campo="tllc" label="Llenado capilar (TLLC)" />
          <SelectClinico campo="estado_conciencia" label="Estado de conciencia" />
          <FieldGroup label="Condición corporal">
            <Select
              value={datos.condicion_corporal}
              onChange={(e) => set('condicion_corporal')(e.target.value)}
              disabled={disabled}
            >
              <option value="">Sin registrar</option>
              {CONDICION_CORPORAL_OPCIONES.map((o) => (
                <option key={o.valor} value={o.valor}>
                  {o.label}
                </option>
              ))}
            </Select>
          </FieldGroup>
        </div>

        <FieldGroup label="Observaciones del examen">
          <Textarea
            value={datos.observaciones_examen}
            onChange={(e) => set('observaciones_examen')(e.target.value)}
            disabled={disabled}
            placeholder="Hallazgos adicionales: palpación, auscultación, piel, ganglios…"
          />
        </FieldGroup>
      </Seccion>

      {/* ---------- Conclusión ---------- */}
      <Seccion titulo="Conclusión" tono="destacado">
        <div className="grid gap-4 lg:grid-cols-2">
          <FieldGroup label="Diagnóstico médico">
            <Textarea
              value={datos.diagnostico}
              onChange={(e) => set('diagnostico')(e.target.value)}
              disabled={disabled}
              placeholder="Escribe el diagnóstico oficial…"
            />
          </FieldGroup>
          <FieldGroup label="Tratamiento o recetario">
            <Textarea
              value={datos.tratamiento}
              onChange={(e) => set('tratamiento')(e.target.value)}
              disabled={disabled}
              placeholder="Detalla la dosis y el medicamento recomendado…"
            />
          </FieldGroup>
        </div>
      </Seccion>
    </div>
  )
}
