import { FieldGroup, Input, Select, Textarea } from '../../components/ui/Field'
import { Seccion } from '../../components/ui/Seccion'
import {
  CONDICION_CORPORAL_OPCIONES,
  OPCIONES_CLINICAS,
  type CampoClinico,
  type OpcionClinica,
} from '../../lib/anamnesis'
import type { DatosClinicos } from './datosClinicos'

interface Props {
  datos: DatosClinicos
  onChange: (datos: DatosClinicos) => void
  disabled?: boolean
}

function SelectClinico({
  campo,
  label,
  valor,
  onChange,
  disabled,
}: {
  campo: CampoClinico
  label: string
  valor: string
  onChange: (v: string) => void
  disabled?: boolean
}) {
  const opciones = OPCIONES_CLINICAS[campo] as readonly OpcionClinica[]
  return (
    <FieldGroup label={label}>
      <Select
        value={valor}
        onChange={(e) => onChange(e.target.value)}
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
  label,
  step,
  valor,
  onChange,
  disabled,
}: {
  label: string
  step?: string
  valor: string
  onChange: (v: string) => void
  disabled?: boolean
}) {
  return (
    <FieldGroup label={label}>
      <Input
        type="number"
        min="0"
        step={step}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder="—"
      />
    </FieldGroup>
  )
}

export function FormularioClinico({ datos, onChange, disabled }: Props) {
  const set = (campo: keyof DatosClinicos) => (valor: string) => onChange({ ...datos, [campo]: valor })

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
          <SelectClinico campo="apetito" label="Apetito" valor={datos.apetito} onChange={set('apetito')} disabled={disabled} />
          <SelectClinico campo="consumo_agua" label="Consumo de agua" valor={datos.consumo_agua} onChange={set('consumo_agua')} disabled={disabled} />
          <SelectClinico campo="vomitos" label="Vómitos" valor={datos.vomitos} onChange={set('vomitos')} disabled={disabled} />
          <SelectClinico campo="heces_consistencia" label="Heces: consistencia" valor={datos.heces_consistencia} onChange={set('heces_consistencia')} disabled={disabled} />
          <SelectClinico campo="heces_color" label="Heces: color" valor={datos.heces_color} onChange={set('heces_color')} disabled={disabled} />
          <SelectClinico campo="orina" label="Orina" valor={datos.orina} onChange={set('orina')} disabled={disabled} />
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
          <NumeroClinico label="Peso (kg)" step="0.01" valor={datos.peso_kg} onChange={set('peso_kg')} disabled={disabled} />
          <NumeroClinico label="Temp. (°C)" step="0.01" valor={datos.temperatura_c} onChange={set('temperatura_c')} disabled={disabled} />
          <NumeroClinico label="Frec. cardíaca (lpm)" step="0.01" valor={datos.frecuencia_cardiaca} onChange={set('frecuencia_cardiaca')} disabled={disabled} />
          <NumeroClinico label="Frec. respiratoria (rpm)" step="0.01" valor={datos.frecuencia_respiratoria} onChange={set('frecuencia_respiratoria')} disabled={disabled} />
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <SelectClinico campo="deshidratacion" label="Deshidratación" valor={datos.deshidratacion} onChange={set('deshidratacion')} disabled={disabled} />
          <SelectClinico campo="mucosas" label="Mucosas" valor={datos.mucosas} onChange={set('mucosas')} disabled={disabled} />
          <SelectClinico campo="tllc" label="Llenado capilar (TLLC)" valor={datos.tllc} onChange={set('tllc')} disabled={disabled} />
          <SelectClinico campo="estado_conciencia" label="Estado de conciencia" valor={datos.estado_conciencia} onChange={set('estado_conciencia')} disabled={disabled} />
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
              className="min-h-[120px]"
            />
          </FieldGroup>
          <FieldGroup label="Tratamiento">
            <Textarea
              value={datos.tratamiento}
              onChange={(e) => set('tratamiento')(e.target.value)}
              disabled={disabled}
              placeholder="Describe el tratamiento a seguir…"
              className="min-h-[120px]"
            />
          </FieldGroup>
        </div>
      </Seccion>

    </div>
  )
}
