/**
 * Captura de la invitación a instalar la aplicación.
 *
 * `beforeinstallprompt` se dispara **una sola vez y muy pronto**, justo después
 * de cargar la página. El aviso de instalar vivía dentro de `AppLayout` y
 * `PlataformaLayout`, que solo se montan **después de iniciar sesión**: para
 * entonces el evento ya había pasado y nadie lo estaba escuchando, así que el
 * aviso no aparecía jamás.
 *
 * Aquí se engancha al arrancar el módulo, antes de que React monte nada, y se
 * guarda. Quien quiera ofrecerlo lo pide cuando le venga bien.
 */

export interface EventoInstalacion extends Event {
  readonly platforms: string[]
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
  prompt(): Promise<void>
}

let guardado: EventoInstalacion | null = null
const suscriptores = new Set<() => void>()

function avisar() {
  suscriptores.forEach((fn) => fn())
}

export function instalarCapturaDePrompt(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    // Sin esto Chrome enseña su propia barra, y el aviso propio quedaría
    // duplicado encima.
    e.preventDefault()
    guardado = e as EventoInstalacion
    avisar()
  })

  // Si la instalan por el menú del navegador, el aviso propio sobra.
  window.addEventListener('appinstalled', () => {
    guardado = null
    avisar()
  })
}

export function promptDeInstalacion(): EventoInstalacion | null {
  return guardado
}

export function suscribirseAlPrompt(fn: () => void): () => void {
  suscriptores.add(fn)
  return () => suscriptores.delete(fn)
}

/** Se consume una sola vez: el navegador no permite reutilizar el evento. */
export async function pedirInstalacion(): Promise<boolean> {
  const evento = guardado
  if (!evento) return false

  await evento.prompt()
  const { outcome } = await evento.userChoice
  guardado = null
  avisar()
  return outcome === 'accepted'
}

/** Ya está instalada: en modo aplicación no tiene sentido ofrecer instalarla. */
export function yaEstaInstalada(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // Safari en iOS no soporta `display-mode`, usa su propia bandera.
    (window.navigator as { standalone?: boolean }).standalone === true
  )
}
