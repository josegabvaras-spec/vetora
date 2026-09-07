import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import { supabase } from './supabase'

/**
 * Punto y coma, no coma.
 *
 * Excel decide cómo partir un CSV según la configuración regional del sistema:
 * en español el separador de lista es `;`, así que un archivo con comas se abre
 * entero en la primera columna. Es el formato que de verdad se usa aquí, no una
 * preferencia.
 *
 * `importacion.ts` detecta el separador al leer, así que los respaldos que ya
 * se hayan descargado con coma siguen importándose.
 */
export const SEPARADOR_CSV = ';'

/**
 * Tablas que entran en el respaldo, **en orden de restauración**: cada una va
 * después de aquellas a las que apunta, o la importación falla por clave
 * foránea. El orden no se dedujo leyendo el código: sale del grafo real de
 * claves foráneas consultado contra la base (`pg_constraint`), y cada arista
 * está satisfecha.
 *
 * ⚠️ Fueron once, luego dieciocho, y seguían faltando **veintidós**. Con once
 * no viajaba nada del expediente clínico —vacunas, recetas, desparasitaciones,
 * consentimientos firmados, informes—; con dieciocho faltaba **todo lo que no
 * es la veterinaria clásica**: la peluquería entera (siete tablas), los lotes,
 * los proveedores, las órdenes de compra, el catálogo de la Tienda, el
 * vademécum, las devoluciones y promociones del petshop, y hasta `sucursales`,
 * que es la estructura de la clínica. Es el hallazgo VUL-36, y arrastraba desde
 * antes de la auditoría.
 *
 * De las 40 tablas con `clinica_id` entran 37. Las tres que faltan no se
 * olvidaron, **se descartaron por un motivo**:
 *
 * - `invitaciones` — guarda tokens de acceso de un solo uso. Meterlos en un ZIP
 *   que la clínica descarga y reenvía es repartir credenciales; y no son un
 *   dato del negocio, son el estado de un alta a medias.
 * - `ia_uso` y `registro_errores` — telemetría de la plataforma (coste de
 *   tokens, trazas de error). Solo el superadmin las lee, así que la clínica se
 *   descargaría un CSV vacío, y aun con `service_role` no son suyas.
 * (`onboarding_usuario` no cuenta en esas 40: no tiene `clinica_id`. Es el
 * estado del tour, por persona, y se regenera solo.)
 *
 * ⚠️ **`usuarios` se EXPORTA pero no se importa** (ver `ORDEN_IMPORTACION` en
 * `lib/importacion.ts`). Es el directorio del personal de la clínica y le
 * pertenece, pero `usuarios.id` es clave foránea a `auth.users`: restaurar la
 * fila no recrea la cuenta con la que esa persona inicia sesión, así que en una
 * clínica nueva reventaría con un 23503 y en la misma clínica es un `update`
 * que no aporta nada.
 *
 * ⚠️ **Lo que el ZIP sigue sin llevar, y hay que decirlo:** `estudios_imagen`
 * guarda la *ficha* del estudio, pero **los archivos viven en el bucket
 * `estudios` de Storage** y no se descargan aquí. Lo mismo con las fotos de
 * peluquería (`peluqueria_fotos`) y los comprobantes de pago. Restaurar deja la
 * ficha apuntando a un archivo que puede no estar. Las fotos de paciente sí
 * van, en la carpeta `fotos/`, porque viajan dentro de su propia fila.
 */
export const TABLAS_RESPALDO = [
  // 1. La estructura: sin sucursal no hay producto, ni turno, ni cita.
  'sucursales',
  'usuarios',
  'proveedores',
  'servicios',
  'vademecum',
  'peluqueria_configuracion',
  'peluqueria_servicios_config',
  'petshop_configuracion',
  'petshop_promociones',
  // 2. Las fichas: casi todo el expediente apunta aquí.
  'clientes',
  'pacientes',
  // 3. El inventario, de lo general a lo concreto.
  'productos',
  'producto_lotes',
  'catalogo_productos',
  'peluqueria_servicio_insumos',
  'ordenes_compra',
  'orden_compra_detalles',
  // 4. La caja abierta, antes que cualquier cobro que cuelgue de ella.
  'turnos_caja',
  // 5. La atención y su expediente.
  'citas',
  'historial_clinico',
  'recetas',
  'vacunas_aplicadas',
  'desparasitaciones_aplicadas',
  'consentimientos_cirugia',
  'informes_firmados',
  'estudios_imagen',
  'internaciones',
  'notas_internacion',
  'peluqueria_fichas',
  // 6. El dinero: `cobros` apunta a citas, internaciones, turnos y promociones.
  'cobros',
  'cobro_lineas',
  'movimientos_inventario',
  'petshop_devoluciones',
  'pagos_suscripcion',
  // 7. Peluquería operativa, al final: `peluqueria_ordenes` apunta a `cobros`.
  'peluqueria_ordenes',
  'peluqueria_comisiones',
  'peluqueria_fotos',
] as const

function objectToCSV(data: any[]): string {
  if (data.length === 0) return ''
  const headers = Object.keys(data[0])
  const csvRows = []

  csvRows.push(headers.join(SEPARADOR_CSV))

  for (const row of data) {
    const values = headers.map((header) => {
      const escaped = ('' + (row[header] ?? '')).replace(/"/g, '""')
      return `"${escaped}"`
    })
    csvRows.push(values.join(SEPARADOR_CSV))
  }

  return csvRows.join('\n')
}

/**
 * Arma el ZIP a partir de datos ya leídos.
 *
 * Separado de la lectura porque hay dos formas de obtenerlos: la clínica los
 * consulta con su propia sesión (la RLS la acota), y la plataforma los pide a
 * la Edge Function `respaldo-clinica`, que usa `service_role` porque el
 * superadmin no puede leer datos clínicos por diseño.
 */
export async function construirZip(datosPorTabla: Record<string, any[]>): Promise<Blob> {
  const zip = new JSZip()
  const pacientesData = datosPorTabla['pacientes'] ?? []

  for (const tabla of TABLAS_RESPALDO) {
    const data = datosPorTabla[tabla]
    if (!data) continue

    // La foto sale del CSV: es una cadena base64 de cientos de KB que dejaría
    // la hoja ilegible. Va aparte, en `fotos/`, y el CSV solo dice si la hay.
    const exportData =
      tabla === 'pacientes'
        ? data.map((p: any) => {
            const { foto, ...rest } = p
            return { ...rest, tiene_foto: !!foto }
          })
        : data

    zip.file(`${tabla}.csv`, objectToCSV(exportData))
  }

  // Solo las fotos de los pacientes, que ya vienen en memoria dentro de su
  // propia fila. Los estudios de imagen (0016) NO entran: viven en Supabase
  // Storage y habría que descargarlos uno a uno, cientos de MB en una sola
  // operación del navegador.
  const fotosFolder = zip.folder('fotos')

  if (fotosFolder) {
    for (const paciente of pacientesData) {
      if (paciente.foto && paciente.codigo) {
        // Se espera un data URL: data:image/jpeg;base64,...
        const partes = String(paciente.foto).split(',')
        const base64Data = partes.length > 1 ? partes[1] : partes[0]
        if (base64Data) {
          fotosFolder.file(`${paciente.codigo}.jpg`, base64Data, { base64: true })
        }
      }
    }
  }

  return zip.generateAsync({ type: 'blob' })
}

export function descargarZip(contenido: Blob, nombre: string): void {
  saveAs(contenido, nombre)
}

/**
 * Respaldo que se descarga la propia clínica; la RLS acota lo que ve.
 *
 * ⚠️ **Una tabla que falla ABORTA el respaldo, no se salta.** Antes hacía
 * `continue` ante cualquier error: el ZIP salía sin ese CSV, el navegador lo
 * descargaba con normalidad y la clínica se quedaba con un archivo al que le
 * faltaba —por ejemplo— el historial clínico entero, sin un solo aviso. Un
 * respaldo incompleto que se cree completo es peor que no tener respaldo,
 * porque solo se descubre el día que hay que restaurarlo.
 *
 * Una tabla vacía no es un error y no aborta nada: la RLS devuelve cero filas
 * sin fallar, que es lo que le pasa a una veterinaria sin peluquería.
 */
export async function generarRespaldo() {
  const datosPorTabla: Record<string, any[]> = {}
  const fallidas: string[] = []

  for (const tabla of TABLAS_RESPALDO) {
    const { data, error } = await supabase.from(tabla as any).select('*')
    if (error) {
      fallidas.push(`${tabla} (${error.message})`)
      continue
    }
    datosPorTabla[tabla] = data ?? []
  }

  if (fallidas.length > 0) {
    throw new Error(
      `El respaldo estaría incompleto y no se descargó. No se pudieron leer: ${fallidas.join('; ')}`,
    )
  }

  const contenido = await construirZip(datosPorTabla)
  descargarZip(contenido, `respaldo_${new Date().toISOString().split('T')[0]}.zip`)
}
