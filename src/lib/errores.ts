import { supabase } from './supabase'

/**
 * Bitácora de errores de la plataforma.
 *
 * El panel del superadmin enseñaba «errores registrados (24 h): 0» sin que
 * nada los contara. Aquí se registran de verdad.
 *
 * Dos reglas que no se negocian:
 *
 * 1. **Registrar un error nunca puede provocar otro.** Todo va dentro de un
 *    `try/catch` que se traga cualquier fallo: si la propia bitácora revienta
 *    —sin sesión, sin red, con la tabla sin migrar— la aplicación sigue.
 * 2. **No se envían datos clínicos.** El contexto es la ruta o el componente,
 *    nunca el contenido de una ficha.
 */

const MAX_MENSAJE = 500
const MAX_CONTEXTO = 200

/**
 * Errores ya vistos en esta sesión, para no repetirlos.
 *
 * Un fallo dentro de un render se dispara en bucle: sin esto, una pantalla rota
 * escribiría miles de filas idénticas en segundos y el contador de 24 h no
 * diría nada útil.
 */
const yaRegistrados = new Set<string>()

export async function registrarError(mensaje: string, contexto = ''): Promise<void> {
  try {
    const texto = String(mensaje).slice(0, MAX_MENSAJE)
    const donde = String(contexto).slice(0, MAX_CONTEXTO)

    const clave = `${texto}|${donde}`
    if (yaRegistrados.has(clave)) return
    yaRegistrados.add(clave)

    // `getSession` lee del almacenamiento local, no hace petición.
    const { data } = await supabase.auth.getSession()
    const usuarioId = data.session?.user?.id
    // Sin sesión no hay a quién atribuirlo y la policy lo rechazaría igualmente.
    if (!usuarioId) return

    // `clinica_id` NO se envía: lo pone el default `auth_clinica_id()` y la
    // policy exige que coincida. Mandarlo desde el navegador sería dejar que
    // cada cliente eligiera en qué clínica escribe.
    await supabase.from('registro_errores').insert({
      usuario_id: usuarioId,
      mensaje: texto,
      contexto: donde,
    })
  } catch {
    // Silencio deliberado: ver la regla 1.
  }
}

/**
 * Engancha los dos sitios por donde se escapa un fallo no capturado.
 *
 * `error` recoge las excepciones sueltas y `unhandledrejection` las promesas
 * que nadie esperó — que en esta aplicación son la mayoría, porque casi todo
 * son llamadas asíncronas a servicios.
 */
export function instalarCapturaDeErrores(): void {
  window.addEventListener('error', (evento) => {
    registrarError(evento.message, evento.filename ? `${evento.filename}:${evento.lineno}` : 'window')
  })

  window.addEventListener('unhandledrejection', (evento) => {
    const motivo = evento.reason
    const mensaje = motivo instanceof Error ? motivo.message : String(motivo)
    registrarError(mensaje, window.location.pathname)
  })
}
