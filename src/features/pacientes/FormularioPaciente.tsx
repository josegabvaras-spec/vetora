import { FieldGroup, Input, Select, Textarea } from '../../components/ui/Field'
import { Seccion } from '../../components/ui/Seccion'
import type { Especie, Sexo } from '../../types/database'

/** Datos de identificación del paciente y su dueño/a, usados en el alta. */
export interface DatosPaciente {
  clienteNombre: string
  clienteWhatsapp: string
  clienteCi: string
  pacienteNombre: string
  foto: string // base64
  fechaNacimiento: string
  especie: Especie
  raza: string
  sexo: Sexo
  alergias: string
  antecedentes: string
}

export function datosPacienteVacios(): DatosPaciente {
  return {
    clienteNombre: '',
    clienteWhatsapp: '',
    clienteCi: '',
    pacienteNombre: '',
    foto: '',
    fechaNacimiento: '',
    especie: 'canino',
    raza: '',
    sexo: 'macho',
    alergias: '',
    antecedentes: '',
  }
}

export function FormularioPaciente({
  datos,
  onChange,
}: {
  datos: DatosPaciente
  onChange: (datos: DatosPaciente) => void
}) {
  const set = <K extends keyof DatosPaciente>(campo: K) => (valor: DatosPaciente[K]) =>
    onChange({ ...datos, [campo]: valor })

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => {
        set('foto')(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  return (
    <>
      <Seccion titulo="Dueño/a">
        <div className="grid gap-4 sm:grid-cols-3">
          <FieldGroup label="Nombre completo">
            <Input value={datos.clienteNombre} onChange={(e) => set('clienteNombre')(e.target.value)} required />
          </FieldGroup>
          <FieldGroup label="WhatsApp">
            <Input
              value={datos.clienteWhatsapp}
              onChange={(e) => set('clienteWhatsapp')(e.target.value)}
              placeholder="+591 7xxxxxxx"
              required
            />
          </FieldGroup>
          {/* Obligatorio: era opcional, y una ficha sin CI no podía casar nunca
              con la cuenta que el dueño crea en el portal —`cedula('')` no
              coincide con nada—, que resultó ser la causa dominante de los
              registros que no vinculaban solos. Con el CI anotado, el vínculo
              ocurre solo al registrarse; sin él dependía del WhatsApp o de
              unirlo a mano desde «Clientes». */}
          <FieldGroup label="Carnet de identidad">
            <Input
              required
              value={datos.clienteCi}
              onChange={(e) => set('clienteCi')(e.target.value)}
              placeholder="Solo el número"
            />
            <p className="mt-1 text-xs text-slate-500">
              Es lo que permite al dueño vincular su cuenta del portal y ver el historial de su mascota.
            </p>
          </FieldGroup>
        </div>
      </Seccion>

      <Seccion titulo="Mascota">
        <div className="grid gap-4 sm:grid-cols-3">
          <FieldGroup label="Nombre">
            <Input value={datos.pacienteNombre} onChange={(e) => set('pacienteNombre')(e.target.value)} required />
          </FieldGroup>
          <FieldGroup label="Fecha de nacimiento">
            <Input
              type="date"
              value={datos.fechaNacimiento}
              onChange={(e) => set('fechaNacimiento')(e.target.value)}
            />
          </FieldGroup>
          <FieldGroup label="Fotografía">
            <Input type="file" accept="image/*" onChange={handleFileChange} />
          </FieldGroup>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <FieldGroup label="Especie">
            <Select value={datos.especie} onChange={(e) => set('especie')(e.target.value as Especie)}>
              <option value="canino">Canino</option>
              <option value="felino">Felino</option>
              <option value="ave">Ave</option>
              <option value="exotico">Exótico</option>
              <option value="otro">Otro</option>
            </Select>
          </FieldGroup>
          <FieldGroup label="Raza">
            <Input value={datos.raza} onChange={(e) => set('raza')(e.target.value)} />
          </FieldGroup>
          <FieldGroup label="Sexo">
            <Select value={datos.sexo} onChange={(e) => set('sexo')(e.target.value as Sexo)}>
              <option value="macho">Macho</option>
              <option value="hembra">Hembra</option>
              <option value="desconocido">Desconocido</option>
            </Select>
          </FieldGroup>
        </div>
      </Seccion>

      <Seccion titulo="Antecedentes clínicos">
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldGroup label="Alergias conocidas">
            <Textarea
              value={datos.alergias}
              onChange={(e) => set('alergias')(e.target.value)}
              placeholder="Ej. Penicilina. Déjalo vacío si no se conocen alergias."
            />
          </FieldGroup>
          <FieldGroup label="Antecedentes médicos">
            <Textarea
              value={datos.antecedentes}
              onChange={(e) => set('antecedentes')(e.target.value)}
              placeholder="Enfermedades crónicas, cirugías previas, tratamientos en curso…"
            />
          </FieldGroup>
        </div>
      </Seccion>
    </>
  )
}
