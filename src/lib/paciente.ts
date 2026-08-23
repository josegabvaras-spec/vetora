export function calcularEdad(fechaNacimiento?: string | null): string {
  if (!fechaNacimiento) return 'Edad desconocida'
  const nacimiento = new Date(fechaNacimiento)
  const años = (Date.now() - nacimiento.getTime()) / (1000 * 60 * 60 * 24 * 365.25)
  return años < 1 ? `${Math.round(años * 12)} meses` : `${Math.floor(años)} años`
}

/**
 * Columnas de `pacientes` **sin `foto`**.
 *
 * `foto` es la imagen en base64 dentro de una columna `text` (migración 0006):
 * cientos de KB por paciente. Con `select('*')`, la agenda, la lista de
 * pacientes y los selectores de los modales descargaban la foto de TODOS los
 * pacientes de la clínica cada vez —decenas de MB— para no pintar ninguna.
 *
 * La foto solo la muestra el portal del dueño, y esa consulta la pide aparte.
 *
 * Si añades una columna a `pacientes`, añádela aquí: quedarse corto no rompe el
 * build (el tipo dice que está), se nota en pantalla como un dato vacío.
 */
export const COLUMNAS_PACIENTE_SIN_FOTO =
  'id, clinica_id, cliente_id, nombre, especie, raza, sexo, fecha_nacimiento, alergias, antecedentes, codigo, created_at'
