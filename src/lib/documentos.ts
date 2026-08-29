import type { ConsentimientoCirugia } from '../types/database'
import type { EstudioImagen } from '../services/estudios'
import type { InformeFirmado } from '../services/informes'

// Los tipos de arriba son `import type`: se borran al compilar, así que este
// módulo sigue sin arrastrar el cliente de Supabase. Traer aquí el VALOR
// `TIPO_ESTUDIO_LABEL` de `services/estudios` sí lo habría hecho —`lib/` son
// helpers puros (ver CLAUDE.md)— y habría dejado esta función imposible de
// probar sin credenciales. Por eso el rótulo se define aquí: es el título del
// documento en la lista, no la etiqueta de la sección de estudios.
const ETIQUETA_ESTUDIO: Record<string, string> = {
  ecografia: 'Ecografía',
  radiografia: 'Radiografía',
  otro: 'Estudio de imagen',
}

/**
 * El inventario de documentos de una mascota, en un solo sitio.
 *
 * Antes no existía ninguna pantalla que enseñara junto lo que una mascota
 * tiene: los enlaces de impresión vivían sueltos en la cabecera de la ficha y
 * dentro de cada consulta, y los estudios de imagen solo se veían DENTRO de la
 * consulta que los adjuntó, nunca a nivel de paciente.
 *
 * Es una función **pura, sin Supabase**, y eso es lo que la hace servir a los
 * dos lados: la ficha clínica y el portal del dueño le pasan cada uno lo que su
 * rol puede leer, y a cambio el orden, los rótulos y los enlaces no divergen
 * entre las dos pantallas. Mismo criterio que `sugerenciasDeVinculo`.
 *
 * No inventa nada: cada documento sale de una fila que ya existe. Lo que no se
 * le pasa, no aparece — un dueño no recibe informes de internación porque su
 * pantalla no se los consulta, no porque aquí haya un filtro por rol.
 */

export type TipoDocumento =
  | 'historial'
  | 'consulta'
  | 'receta'
  | 'informe'
  | 'consentimiento'
  | 'estudio'

export interface DocumentoPaciente {
  /** Único dentro de la lista; lleva prefijo de tipo porque un mismo id (el de
   *  una consulta) genera hasta tres documentos distintos. */
  id: string
  tipo: TipoDocumento
  titulo: string
  /** ISO. Ordena la lista y es lo que se enseña. */
  fecha: string
  /** Ruta de la aplicación que pinta el documento imprimible. */
  href?: string
  /** Objeto de Storage, para los estudios: se descarga, no se imprime. */
  ruta?: string
  /** Nombre sugerido del archivo al descargar. Solo para `ruta`. */
  nombreArchivo?: string
}

/** Consulta cerrada, con lo que cuelga de ella. Es el subconjunto que necesita
 *  esta función; tanto `FichaPaciente['historiales']` como lo que carga el
 *  portal encajan sin adaptador. */
export interface ConsultaParaDocumentos {
  id: string
  paciente_id: string
  created_at: string
  motivo?: string | null
  editable: boolean
}

export interface EntradaDocumentos {
  pacienteId: string
  pacienteNombre: string
  /** Solo se listan las cerradas: un borrador es trabajo en curso y no es un
   *  documento. Filtrar aquí evita que cada pantalla se acuerde de hacerlo. */
  consultas: ConsultaParaDocumentos[]
  /** `historial_id` de las consultas que tienen al menos un medicamento. */
  historialesConReceta: string[]
  consentimientos: ConsentimientoCirugia[]
  informes: InformeFirmado[]
  estudios: EstudioImagen[]
}

const TIPO_INFORME_LABEL: Record<string, string> = {
  historial: 'Informe de historial clínico',
  consulta: 'Informe de consulta',
  laboratorio: 'Informe de laboratorio',
  imagenologia: 'Informe de imagenología',
  cirugia: 'Informe quirúrgico',
  recibo: 'Recibo',
}

export function documentosDePaciente(entrada: EntradaDocumentos): DocumentoPaciente[] {
  const { pacienteId, pacienteNombre, consentimientos, informes, estudios } = entrada
  const cerradas = entrada.consultas.filter((c) => !c.editable)
  const conReceta = new Set(entrada.historialesConReceta)

  const docs: DocumentoPaciente[] = []

  // El historial completo no es una fila: se compone de todas las consultas, y
  // solo tiene sentido si hay alguna. Su fecha es la de la más reciente, para
  // que encabece la lista en vez de hundirse al final.
  if (cerradas.length > 0) {
    docs.push({
      id: 'historial',
      tipo: 'historial',
      titulo: `Historial clínico completo de ${pacienteNombre}`,
      fecha: cerradas.reduce((max, c) => (c.created_at > max ? c.created_at : max), cerradas[0].created_at),
      href: `/pacientes/${pacienteId}/historial/imprimir`,
    })
  }

  for (const consulta of cerradas) {
    docs.push({
      id: `consulta-${consulta.id}`,
      tipo: 'consulta',
      titulo: consulta.motivo?.trim() ? `Consulta: ${consulta.motivo.trim()}` : 'Consulta médica',
      fecha: consulta.created_at,
      href: `/pacientes/${pacienteId}/consulta/${consulta.id}/imprimir`,
    })

    // La receta solo existe si se prescribió algo: un enlace a un recetario
    // vacío es una promesa rota.
    if (conReceta.has(consulta.id)) {
      docs.push({
        id: `receta-${consulta.id}`,
        tipo: 'receta',
        titulo: 'Receta médica',
        fecha: consulta.created_at,
        href: `/pacientes/${pacienteId}/consulta/${consulta.id}/receta/imprimir`,
      })
    }
  }

  for (const informe of informes) {
    // El recibo se firma contra un cobro, no contra el expediente de la
    // mascota, y su pantalla no está en este alcance.
    if (informe.tipo === 'recibo') continue
    docs.push({
      id: `informe-${informe.id}`,
      tipo: 'informe',
      titulo: TIPO_INFORME_LABEL[informe.tipo] ?? 'Informe',
      fecha: informe.created_at,
      href: informe.item_id
        ? `/pacientes/${pacienteId}/reporte/${informe.tipo}/${informe.item_id}`
        : `/pacientes/${pacienteId}/reporte/${informe.tipo}`,
    })
  }

  for (const consentimiento of consentimientos) {
    docs.push({
      id: `consentimiento-${consentimiento.id}`,
      tipo: 'consentimiento',
      titulo: 'Consentimiento de cirugía',
      fecha: consentimiento.created_at,
      href: `/consentimientos/${consentimiento.cita_id}`,
    })
  }

  for (const estudio of estudios) {
    const etiqueta = ETIQUETA_ESTUDIO[estudio.tipo] ?? 'Estudio de imagen'
    docs.push({
      id: `estudio-${estudio.id}`,
      tipo: 'estudio',
      titulo: estudio.descripcion.trim() ? `${etiqueta}: ${estudio.descripcion.trim()}` : etiqueta,
      fecha: estudio.created_at,
      ruta: estudio.ruta,
      nombreArchivo: nombreDeArchivo(pacienteNombre, etiqueta, estudio.created_at),
    })
  }

  return docs.sort((a, b) => b.fecha.localeCompare(a.fecha))
}

/** `Firulais-Radiografia-2026-08-28.jpg`, sin acentos ni espacios: viaja en una
 *  cabecera HTTP y aterriza en la carpeta de descargas de un desconocido. */
function nombreDeArchivo(paciente: string, etiqueta: string, fechaIso: string): string {
  const limpio = (texto: string) =>
    texto
      .normalize('NFD')
      // Marcas diacríticas combinantes, que `NFD` acaba de separar de su letra.
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')

  return `${limpio(paciente)}-${limpio(etiqueta)}-${fechaIso.slice(0, 10)}.jpg`
}

export const TIPO_DOCUMENTO_LABEL: Record<TipoDocumento, string> = {
  historial: 'Historial',
  consulta: 'Consulta',
  receta: 'Receta',
  informe: 'Informe',
  consentimiento: 'Consentimiento',
  estudio: 'Imagen',
}
