import { useState } from 'react'
import { clsx } from 'clsx'
import { GraduationCap, MailCheck } from 'lucide-react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { Seccion } from '../../components/ui/Seccion'
import { useAuth } from '../../context/useAuth'
import { solicitarRecuperacion } from '../../services/cuentas'
import { Badge } from '../../components/ui/Badge'
import { useTable } from '../../mocks/useDb'
import { PanelFacturacion } from '../facturacion/PanelFacturacion'
import { useTourManual } from '../onboarding/useTourManual'

const ROL_LABEL: Record<string, string> = {
  admin: 'Administrador',
  veterinario: 'Veterinario',
  recepcion: 'Recepción',
  peluquero: 'Peluquero',
}

type Pestana = 'cuenta' | 'facturacion'

export function PerfilModal({ onClose }: { onClose: () => void }) {
  const { usuario } = useAuth()
  const sucursales = useTable('sucursales')

  const { abrirTour } = useTourManual()
  const [pestana, setPestana] = useState<Pestana>('cuenta')
  const [enviado, setEnviado] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!usuario) return null

  const sucursalNombre = usuario.sucursal_id
    ? sucursales.find((s) => s.id === usuario.sucursal_id)?.nombre
    : 'Todas las sucursales'

  /**
   * La suscripción la gestiona quien contrató el servicio.
   *
   * Es una gestión de LA CUENTA, no del trabajo del día, así que vive aquí y no
   * en el menú lateral: junto a los datos y la contraseña es donde se busca.
   */
  const conFacturacion = usuario.rol === 'admin'

  /**
   * El cambio pasa por correo, no por un formulario aquí.
   *
   * Antes bastaba con escribir la contraseña actual y la nueva. Ahora hace
   * falta acceso al buzón, así que una sesión que alguien se deje abierta no
   * sirve para apropiarse de la cuenta. Es el mismo circuito que «olvidé mi
   * contraseña», y tener uno solo evita mantener dos caminos en paralelo.
   */
  async function pedirCambio() {
    setEnviando(true)
    setError(null)
    try {
      await solicitarRecuperacion(usuario!.email)
      setEnviado(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar el correo')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Modal
      title="Mi cuenta"
      onClose={onClose}
      // Facturación lleva el QR, el formulario de pago y una tabla: en el ancho
      // de siempre no cabe. Quien no la ve conserva el modal estrecho de antes.
      widthClassName={conFacturacion ? 'max-w-2xl' : 'max-w-md'}
    >
      {/* Una sola pestaña no es una pestaña: dibujar la barra a quien no tiene
          nada que elegir es ruido. */}
      {conFacturacion && (
        <div className="mb-5 border-b border-slate-200">
          <nav className="-mb-px flex gap-6 overflow-x-auto" aria-label="Secciones de la cuenta">
            {([
              ['cuenta', 'Mi cuenta'],
              ['facturacion', 'Facturación'],
            ] as const).map(([clave, etiqueta]) => (
              <button
                key={clave}
                onClick={() => setPestana(clave)}
                className={clsx(
                  'cursor-pointer whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium transition-colors',
                  pestana === clave
                    ? 'border-teal-500 text-teal-600'
                    : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700',
                )}
              >
                {etiqueta}
              </button>
            ))}
          </nav>
        </div>
      )}

      {conFacturacion && pestana === 'facturacion' ? (
        <PanelFacturacion />
      ) : (
        <div className="space-y-6">
          <Seccion titulo="Mis Datos">
            <div className="flex flex-col gap-1 rounded-lg border border-slate-100 bg-slate-50 p-4">
              <p className="text-sm font-bold text-slate-900">{usuario.nombre}</p>
              <p className="text-sm text-slate-500 break-words">{usuario.email}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge tone="teal">{ROL_LABEL[usuario.rol]}</Badge>
                <Badge tone="slate">{sucursalNombre}</Badge>
              </div>
            </div>
          </Seccion>

          {/* Aquí, y no en un menú «Ayuda», porque no existe: repetir el
              tutorial es una gestión de la cuenta, como los datos y la clave. */}
          <Seccion titulo="Tutorial">
            <p className="text-sm text-slate-600">
              ¿Quieres repasar cómo funciona Vetora? Te lo enseñamos otra vez sobre la propia pantalla.
            </p>
            <div className="mt-3 flex justify-end">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  // Cerrar primero: el tour resalta lo que hay DETRÁS del modal.
                  onClose()
                  abrirTour()
                }}
              >
                <GraduationCap size={16} /> Ver el tutorial otra vez
              </Button>
            </div>
          </Seccion>

          <Seccion titulo="Cambiar Contraseña">
            {enviado ? (
              <p className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                <MailCheck size={18} className="mt-0.5 shrink-0" />
                Te enviamos un enlace a {usuario.email}. Ábrelo para poner tu contraseña nueva; caduca, así que úsalo
                pronto.
              </p>
            ) : (
              <>
                <p className="text-sm text-slate-600">
                  Por seguridad, el cambio se confirma por correo: te enviamos un enlace a{' '}
                  <span className="font-medium text-slate-800">{usuario.email}</span> y desde ahí pones la nueva.
                </p>
                {error && <p className="mt-2 text-sm font-bold text-rose-600">{error}</p>}
              </>
            )}

            <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-4">
              <Button type="button" variant="secondary" onClick={onClose}>
                Cerrar
              </Button>
              {!enviado && (
                <Button type="button" onClick={pedirCambio} disabled={enviando}>
                  {enviando ? 'Enviando…' : 'Enviarme el enlace'}
                </Button>
              )}
            </div>
          </Seccion>
        </div>
      )}
    </Modal>
  )
}
