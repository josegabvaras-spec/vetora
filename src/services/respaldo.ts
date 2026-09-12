import { supabase } from '../lib/supabase'
import { TABLAS_RESPALDO, construirZip, descargarZip } from '../lib/exportacion'
import { traerTodo } from '../lib/paginacion'
import { registrarEvento } from './seguridad'

/**
 * El respaldo que se descarga la propia clínica.
 *
 * ⚠️ **Esto vivía en `lib/exportacion.ts`, y estaba mal ubicado.** La regla
 * estructural del proyecto es que **solo `services/*.ts` habla con Supabase**, y
 * aquella función lo hacía desde `lib/` — además importada **directamente por
 * `RespaldoPage`**, saltándose la capa de servicios por completo. Era la única
 * de ese fichero que consultaba la base; el resto (`construirZip`,
 * `descargarZip`, `objectToCSV`) son helpers puros de ZIP y CSV y siguen ahí,
 * que es su sitio.
 *
 * La lectura y el armado del ZIP están separados a propósito, y no por
 * simetría: hay **dos** formas de obtener los datos. La clínica los consulta con
 * su propia sesión —la RLS la acota a su `clinica_id`— y la plataforma los pide
 * a la Edge Function `respaldo-clinica`, que usa `service_role` porque el
 * superadmin no puede leer datos clínicos por diseño. Las dos terminan llamando
 * al mismo `construirZip()`; lo que cambia es de dónde salen las filas. Ver
 * `services/respaldoPlataforma.ts` para el otro camino.
 */

/**
 * ⚠️ **Una tabla que falla ABORTA el respaldo, no se salta.**
 *
 * Antes hacía `continue` ante cualquier error: el ZIP salía sin ese CSV, el
 * navegador lo descargaba con normalidad y la clínica se quedaba con un archivo
 * al que le faltaba —por ejemplo— el historial clínico entero, sin un solo
 * aviso. **Un respaldo incompleto que se cree completo es peor que no tener
 * respaldo**, porque solo se descubre el día que hay que restaurarlo, que es
 * justo el día en que ya no hay margen.
 *
 * Una tabla vacía NO es un error y no aborta nada: la RLS devuelve cero filas
 * sin fallar, que es lo que le pasa a una veterinaria sin peluquería.
 */
export async function generarRespaldo() {
  const datosPorTabla: Record<string, unknown[]> = {}
  const fallidas: string[] = []

  for (const tabla of TABLAS_RESPALDO) {
    try {
      // `as any` acotado y con motivo: `tabla` recorre una lista de 37 nombres,
      // y los tipos generados de supabase-js resuelven la forma de la fila a
      // partir del literal concreto. Con una unión de 37 no puede, y el tipo
      // de retorno colapsa. Aquí no se pierde nada real: las filas viajan a un
      // CSV, donde todo es texto de todos modos.
      //
      // ⚠️ `traerTodo` (no `select('*')` suelto): PostgREST corta en 1000
      // filas sin avisar, y esta es justo la función que `CLAUDE.md` describe
      // como la que no puede quedarse corta en silencio — una clínica con más
      // de mil citas o mil filas de historial se descargaba un ZIP incompleto
      // que parecía completo.
      datosPorTabla[tabla] = await traerTodo((desde, hasta) =>
        supabase.from(tabla as any).select('*').range(desde, hasta),
      )
    } catch (e) {
      fallidas.push(`${tabla} (${e instanceof Error ? e.message : String(e)})`)
    }
  }

  if (fallidas.length > 0) {
    throw new Error(
      `El respaldo estaría incompleto y no se descargó. No se pudieron leer: ${fallidas.join('; ')}`,
    )
  }

  const contenido = await construirZip(datosPorTabla)
  descargarZip(contenido, `respaldo_${new Date().toISOString().split('T')[0]}.zip`)

  // Bitácora de seguridad (`0078`). El respaldo de la PLATAFORMA ya se
  // registraba en `registro_respaldos` (H-30), pero este —el que se descarga
  // la propia clínica— no dejaba rastro de ninguna clase: es el camino por el
  // que el expediente completo de una clínica sale del sistema en un archivo,
  // y hasta ahora nadie podía responder «¿quién se lo llevó y cuándo?».
  //
  // Son dos bitácoras distintas a propósito, no una duplicada: `registro_respaldos`
  // responde ante el TITULAR de los datos («el operador entró a mi clínica»),
  // y esta responde ante la CLÍNICA («alguien de mi equipo exportó todo»), que
  // es quien tiene que dar esa explicación como responsable del tratamiento.
  void registrarEvento('respaldo_exportado', {
    severidad: 'media',
    detalle: {
      tablas: Object.keys(datosPorTabla).length,
      filas: Object.values(datosPorTabla).reduce((n, filas) => n + filas.length, 0),
    },
  })
}
