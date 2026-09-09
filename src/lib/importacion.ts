import JSZip from 'jszip'

/**
 * Orden de restauración: las tablas que otras referencian van primero.
 *
 * Insertar una cita antes que su paciente revienta con un 23503 de clave
 * foránea, así que este orden no es cosmético.
 *
 * Mismo conjunto y mismo orden que `TABLAS_RESPALDO` (`lib/exportacion.ts`),
 * y **tienen que seguir coincidiendo**: si el ZIP trae un CSV que esta lista no
 * recorre, ese archivo se ignora en silencio y la clínica cree haber
 * restaurado algo que no restauró.
 *
 * ⚠️ **Con una excepción deliberada: `usuarios` se exporta y NO se importa.**
 * `usuarios.id` es clave foránea a `auth.users`, y restaurar la fila no recrea
 * la cuenta con la que esa persona inicia sesión. En una clínica nueva el
 * `upsert` fallaría con un 23503 y arrastraría al resto del import; en la misma
 * clínica sería un `update` que no cambia nada. Se exporta porque el directorio
 * del personal es un dato de la clínica; no se restaura porque no hay nada que
 * restaurar sin la cuenta de Auth detrás.
 */
export const ORDEN_IMPORTACION = [
  // 1. La estructura.
  'sucursales',
  'proveedores',
  'servicios',
  'vademecum',
  'peluqueria_configuracion',
  'peluqueria_servicios_config',
  'petshop_configuracion',
  'petshop_promociones',
  // 2. Las fichas.
  'clientes',
  'pacientes',
  // 3. El inventario.
  'productos',
  'producto_lotes',
  'catalogo_productos',
  'peluqueria_servicio_insumos',
  'ordenes_compra',
  'orden_compra_detalles',
  // 4. La caja.
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
  // 6. El dinero.
  'cobros',
  'cobro_lineas',
  'movimientos_inventario',
  'petshop_devoluciones',
  'pagos_suscripcion',
  // 7. Peluquería operativa: `peluqueria_ordenes` apunta a `cobros`.
  'peluqueria_ordenes',
  'peluqueria_comisiones',
  'peluqueria_fotos',
] as const

/**
 * Deduce el separador leyendo la cabecera.
 *
 * Los respaldos nuevos salen con `;` (Excel en español), pero los que ya se
 * descargaron llevan coma. Detectarlo evita que un archivo antiguo se importe
 * como una sola columna gigante y sin dar error.
 *
 * Se cuentan solo los caracteres fuera de comillas: un nombre como
 * «Pérez, Juan» dentro de un campo entrecomillado no es un separador.
 */
function detectarSeparador(cabecera: string): string {
  let puntoYComa = 0
  let comas = 0
  let enComillas = false

  for (const char of cabecera) {
    if (char === '"') enComillas = !enComillas
    else if (!enComillas && char === ';') puntoYComa++
    else if (!enComillas && char === ',') comas++
  }

  return puntoYComa >= comas ? ';' : ','
}

function parseCSV(csvText: string): any[] {
  if (!csvText.trim()) return []
  const lines = csvText.split('\n').map((l) => l.trim()).filter((l) => l)
  if (lines.length < 2) return []

  const separador = detectarSeparador(lines[0])

  const parseLine = (line: string) => {
    const result = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      if (char === '"' && line[i + 1] === '"') {
        current += '"'
        i++
      } else if (char === '"') {
        inQuotes = !inQuotes
      } else if (char === separador && !inQuotes) {
        result.push(current)
        current = ''
      } else {
        current += char
      }
    }
    result.push(current)
    return result
  }

  const headers = parseLine(lines[0])
  const result = []

  for (let i = 1; i < lines.length; i++) {
    const values = parseLine(lines[i])
    const obj: any = {}
    headers.forEach((header, index) => {
      const val = values[index]
      if (val === 'null' || val === '' || val === undefined) obj[header] = null
      else if (val === 'true') obj[header] = true
      else if (val === 'false') obj[header] = false
      // Ojo: solo se convierte a número lo que NO parece un identificador. Un
      // código como "0012" perdería sus ceros al pasar por Number().
      else if (!isNaN(Number(val)) && !/^0\d/.test(val)) obj[header] = Number(val)
      else obj[header] = val
    })
    result.push(obj)
  }

  return result
}

/** Lee el ZIP y devuelve las filas por tabla, con las fotos y firmas ya reincorporadas. */
export async function leerZip(file: File): Promise<Record<string, any[]>> {
  const zip = new JSZip()
  await zip.loadAsync(file)

  const datosRestaurados: Record<string, any[]> = {}

  for (const tabla of ORDEN_IMPORTACION) {
    const archivo = zip.file(`${tabla}.csv`)
    if (archivo) {
      datosRestaurados[tabla] = parseCSV(await archivo.async('text'))
    }
  }

  // Las fotos vuelven a su fila: en el CSV solo viajaba `tiene_foto`.
  const pacientesRestaurados = datosRestaurados['pacientes']
  if (pacientesRestaurados) {
    const folder = zip.folder('fotos')
    if (folder) {
      for (const paciente of pacientesRestaurados) {
        if (paciente.codigo) {
          const fotoFile = folder.file(`${paciente.codigo}.jpg`)
          if (fotoFile) {
            paciente.foto = `data:image/jpeg;base64,${await fotoFile.async('base64')}`
          }
        }
      }
    }
    // Columna del CSV, no de la base: si viaja al upsert, Postgres la rechaza.
    pacientesRestaurados.forEach((p: any) => delete p.tiene_foto)
  }

  // Las firmas manuscritas vuelven a su fila igual que la foto: en el CSV
  // solo viajaba `tiene_firma`.
  const firmasFolder = zip.folder('firmas')
  if (firmasFolder) {
    for (const tabla of ['consentimientos_cirugia', 'informes_firmados'] as const) {
      const filas = datosRestaurados[tabla]
      if (!filas) continue
      for (const fila of filas as any[]) {
        for (const campo of ['firma_tutor', 'firma_veterinario'] as const) {
          const archivo = firmasFolder.file(`${tabla}_${fila.id}_${campo}.png`)
          if (archivo) {
            fila[campo] = `data:image/png;base64,${await archivo.async('base64')}`
          }
        }
        delete fila.tiene_firma
      }
    }
  }

  return datosRestaurados
}

/*
 * ⚠️ **Aquí había un `importarRespaldo()` que restauraba desde el navegador, y
 * se ha retirado: hoy sería imposible que funcionara.**
 *
 * No lo llamaba nadie —`/respaldo` solo descarga— pero seguía exportado, y un
 * código muerto que promete restaurar es peor que no tenerlo: el día que
 * alguien lo cablee a un botón descubre, con el ZIP ya cargado, que la mitad de
 * las tablas rebotan.
 *
 * El endurecimiento del Bloque 1 cerró ese camino a propósito, y cada cierre
 * tiene su motivo:
 *
 * - `0066` eliminó `cobros_insert` y `cobro_lineas_insert`: un cobro solo puede
 *   nacer dentro de `registrar_cobro()`. Un `upsert` desde el navegador no
 *   tiene por dónde entrar.
 * - `trg_stock_solo_por_kardex` (`0064`) impide fijar `productos.stock_actual`
 *   fuera de un movimiento de inventario.
 * - `trg_kardex_inmutable` (`0058`) y `trg_turno_cerrado_inmutable` (`0056`)
 *   rechazan el `update` que hace un `upsert` sobre filas que ya existen.
 *
 * **La restauración vive en la Edge Function `respaldo-clinica`**, que corre con
 * `service_role` —por eso cada uno de esos triggers lleva su salida
 * `auth.uid() is null`— y además comprueba, antes de escribir una sola fila,
 * que ningún `id` del respaldo pertenezca ya a otra clínica. Esa comprobación
 * no se puede hacer desde el cliente, porque la RLS le oculta precisamente las
 * filas ajenas que hay que detectar.
 *
 * `leerZip()` se conserva y se usa: es lo que `services/respaldoPlataforma.ts`
 * emplea para leer el archivo antes de mandárselo a la función.
 */
