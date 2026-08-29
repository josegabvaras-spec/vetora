import type { Especie, Sexo } from '../../types/database'

/**
 * La forma de los datos del alta de paciente, y su valor inicial.
 *
 * Viven aquí y no en `FormularioPaciente.tsx` porque ese fichero exporta un
 * componente, y un módulo que exporta componentes y no componentes a la vez
 * rompe el Fast Refresh de Vite: al tocar cualquiera de las dos cosas se
 * recarga entero y se pierde lo que hubiera escrito en el formulario.
 */

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
