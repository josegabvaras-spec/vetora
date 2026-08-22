/**
 * Redimensionado de imágenes antes de subirlas.
 *
 * Una radiografía sale de la cámara con 3-10 MB, y guardarla entera llena la
 * cuota de Storage en unas pocas decenas de estudios. Se reduce el lado mayor y
 * se recomprime a JPEG.
 */

const MAX_LADO = 1600
const CALIDAD = 0.82

export async function redimensionarImagen(
  archivo: File,
  maxLado = MAX_LADO,
  calidad = CALIDAD,
): Promise<Blob> {
  // `imageOrientation: 'from-image'` aplica la rotación que la cámara del móvil
  // deja en los metadatos EXIF. Sin esto, una foto hecha en vertical se sube
  // tumbada: el navegador la endereza al mostrarla, pero el canvas dibuja los
  // píxeles crudos y la rotación se pierde para siempre al recomprimir.
  const bitmap = await createImageBitmap(archivo, { imageOrientation: 'from-image' })

  const ladoMayor = Math.max(bitmap.width, bitmap.height)
  // Ya es pequeña: se devuelve tal cual en vez de recomprimir, que solo añade
  // pérdida sin ahorrar nada.
  if (ladoMayor <= maxLado) {
    bitmap.close()
    return archivo
  }

  const escala = maxLado / ladoMayor
  const ancho = Math.round(bitmap.width * escala)
  const alto = Math.round(bitmap.height * escala)

  const lienzo = document.createElement('canvas')
  lienzo.width = ancho
  lienzo.height = alto

  const ctx = lienzo.getContext('2d')
  if (!ctx) {
    bitmap.close()
    throw new Error('No se pudo procesar la imagen')
  }

  ctx.drawImage(bitmap, 0, 0, ancho, alto)
  bitmap.close()

  const blob = await new Promise<Blob | null>((resolve) =>
    lienzo.toBlob(resolve, 'image/jpeg', calidad),
  )
  if (!blob) throw new Error('No se pudo comprimir la imagen')
  return blob
}

/** Tamaño legible para avisar de un archivo demasiado grande. */
export function formatPeso(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
