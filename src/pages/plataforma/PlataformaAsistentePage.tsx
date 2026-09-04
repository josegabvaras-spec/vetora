import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, KeyRound, MessageCircle, Receipt, Sparkles, UserCheck, UserX } from 'lucide-react'
import { AvisoError } from '../../components/ui/AvisoError'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { Seccion } from '../../components/ui/Seccion'
import { Textarea } from '../../components/ui/Field'
import { TablaResponsive, type Columna } from '../../components/ui/Tabla'
import { useTable } from '../../mocks/useDb'
import { alternarActivoUsuario, listPagosPendientes, type PagoConClinica } from '../../services/plataforma'
import {
  listTareasPlataforma,
  listUsuariosSinAcceso,
  type UsuarioSinAcceso,
} from '../../services/plataformaAvisos'
import { EnviarAccesoModal } from '../../features/plataforma/EnviarAccesoModal'
import { ComprobanteModal } from '../../features/plataforma/ComprobanteModal'
import { useAuth } from '../../context/useAuth'
import { enlaceWhatsapp } from '../../lib/whatsapp'
import { formatClinicDate } from '../../lib/datetime'
import {
  plantillaTarea,
  seAvisaPorWhatsapp,
  TAREA_LABEL,
  type TareaPlataforma,
  type TipoTareaPlataforma,
} from '../../lib/asistentePlataforma'
import type { Usuario } from '../../types/database'

const TONO: Record<TipoTareaPlataforma, 'rose' | 'amber' | 'teal'> = {
  cobro_vencido: 'rose',
  cobro_proximo: 'amber',
  comprobante_pendiente: 'teal',
  limite_plan: 'amber',
  errores_sistema: 'rose',
}

export function PlataformaAsistentePage() {
  const { usuario } = useAuth()
  const [tareas, setTareas] = useState<TareaPlataforma[]>([])
  // Los comprobantes se guardan enteros y no solo como tarea: el modal necesita
  // la ruta de la imagen y los importes, que en la tarea solo viajan como texto.
  const [pagos, setPagos] = useState<PagoConClinica[]>([])
  const [revisando, setRevisando] = useState<PagoConClinica | null>(null)
  const [usuarios, setUsuarios] = useState<UsuarioSinAcceso[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [redactando, setRedactando] = useState<TareaPlataforma | null>(null)
  // Se guarda la fila entera y no solo el usuario: `EnviarAccesoModal` nombra la
  // clínica en el mensaje que se manda.
  const [enviandoAcceso, setEnviandoAcceso] = useState<UsuarioSinAcceso | null>(null)

  // Cualquier cambio del panel (cobro, plan, alta de usuario) rehace la lista.
  const filasClinicas = useTable('clinicas')
  const filasUsuarios = useTable('usuarios')

  const recargar = useCallback(async () => {
    setError(null)
    try {
      const [t, u, p] = await Promise.all([
        listTareasPlataforma(),
        listUsuariosSinAcceso(),
        listPagosPendientes(),
      ])
      setTareas(t)
      setUsuarios(u)
      setPagos(p)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el asistente')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    recargar()
  }, [recargar, filasClinicas, filasUsuarios])

  async function alternar(usuario: Usuario) {
    setError(null)
    try {
      // Un solo argumento: el servicio lee el estado actual y lo invierte, y de
      // paso bloquea desactivar al último admin de la clínica.
      await alternarActivoUsuario(usuario.id)
      await recargar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cambiar el estado del usuario')
    }
  }

  /** La tarea lleva el id del pago detrás del guion; ver `listTareasPlataforma`. */
  function pagoDeTarea(t: TareaPlataforma): PagoConClinica | undefined {
    return pagos.find((p) => `comprobante_pendiente-${p.id}` === t.id)
  }

  const columnasTareas: Columna<TareaPlataforma>[] = [
    {
      clave: 'clinica',
      cabecera: 'Clínica',
      movil: 'titulo',
      celda: (t) => (
        <div>
          <p className="font-bold text-slate-800">{t.clinica_nombre}</p>
          <p className="text-xs text-slate-500">{t.detalle}</p>
        </div>
      ),
    },
    {
      clave: 'tipo',
      cabecera: 'Motivo',
      movil: 'destacado',
      celda: (t) => <Badge tone={TONO[t.tipo]}>{TAREA_LABEL[t.tipo]}</Badge>,
    },
    {
      clave: 'fecha',
      cabecera: 'Fecha',
      movil: 'detalle',
      celda: (t) =>
        t.fecha ? (
          <span className={t.vencido ? 'text-sm font-semibold text-rose-600' : 'text-sm text-slate-600'}>
            {formatClinicDate(`${t.fecha}T12:00:00Z`)}
          </span>
        ) : (
          <span className="text-sm text-slate-400">—</span>
        ),
    },
    {
      clave: 'acciones',
      cabecera: '',
      movil: 'acciones',
      celda: (t) =>
        t.tipo === 'comprobante_pendiente' ? (
          <Button
            className="px-3 py-1.5 text-xs"
            onClick={() => setRevisando(pagoDeTarea(t) ?? null)}
            disabled={!pagoDeTarea(t)}
          >
            <Receipt size={14} /> Revisar
          </Button>
        ) : seAvisaPorWhatsapp(t) ? (
          <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={() => setRedactando(t)}>
            <MessageCircle size={14} /> Avisar
          </Button>
        ) : t.tipo === 'errores_sistema' ? (
          <Link to="/plataforma" className="text-xs font-semibold text-teal-700 hover:underline">
            Ver salud del sistema
          </Link>
        ) : (
          <span className="text-xs text-slate-400">Sin WhatsApp</span>
        ),
    },
  ]

  const columnasUsuarios: Columna<UsuarioSinAcceso>[] = [
    {
      clave: 'usuario',
      cabecera: 'Usuario',
      movil: 'titulo',
      celda: (u) => (
        <div>
          <p className="font-bold text-slate-800">{u.usuario.nombre}</p>
          <p className="text-xs text-slate-500 break-words">
            {u.usuario.email} · {u.clinica_nombre}
          </p>
        </div>
      ),
    },
    {
      clave: 'estado',
      cabecera: 'Estado del acceso',
      movil: 'destacado',
      celda: (u) => (
        <span className="text-xs font-medium text-amber-700">
          {u.estado}
          {!u.usuario.activo && <span className="ml-2 text-slate-500">· desactivado</span>}
        </span>
      ),
    },
    {
      clave: 'acciones',
      cabecera: '',
      movil: 'acciones',
      celda: (u) => (
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            variant="secondary"
            className="px-3 py-1.5 text-xs"
            onClick={() => setEnviandoAcceso(u)}
          >
            <KeyRound size={14} /> Reenviar acceso
          </Button>
          <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={() => alternar(u.usuario)}>
            {u.usuario.activo ? <UserX size={14} /> : <UserCheck size={14} />}
            {u.usuario.activo ? 'Desactivar' : 'Activar'}
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-black text-slate-900">Asistente</h1>
        <p className="mt-1 text-sm font-semibold uppercase tracking-wider text-slate-500">
          Qué te toca atender hoy
        </p>
      </div>

      <AvisoError mensaje={error} />

      {cargando ? (
        <p className="py-10 text-center text-sm text-slate-400">Revisando la plataforma…</p>
      ) : (
        <>
          <Seccion
            titulo={`Tareas (${tareas.length})`}
            tono={tareas.some((t) => t.vencido) ? 'destacado' : 'neutro'}
          >
            {tareas.length === 0 ? (
              <p className="flex items-center gap-2 py-4 text-sm text-slate-500">
                <Sparkles size={16} className="text-emerald-500" />
                Nada pendiente: los cobros están al día y ninguna clínica roza su plan.
              </p>
            ) : (
              <TablaResponsive filas={tareas} columnas={columnasTareas} claveDe={(t) => t.id} />
            )}
          </Seccion>

          <Seccion titulo={`Usuarios sin acceso (${usuarios.length})`}>
            <p className="mb-3 text-xs text-slate-500">
              Cuentas creadas cuyo enlace todavía no se canjeó. Desde fuera parecen operativas, pero esas personas
              nunca han podido entrar.
            </p>
            {usuarios.length === 0 ? (
              <p className="flex items-center gap-2 py-4 text-sm text-slate-500">
                <UserCheck size={16} className="text-emerald-500" />
                Todo el personal dado de alta ya entró al sistema.
              </p>
            ) : (
              <TablaResponsive
                filas={usuarios}
                columnas={columnasUsuarios}
                claveDe={(u) => u.usuario.id}
              />
            )}
          </Seccion>
        </>
      )}

      {redactando && <RedactarAvisoModal tarea={redactando} onClose={() => setRedactando(null)} />}

      {revisando && usuario && (
        <ComprobanteModal
          pago={revisando}
          revisorId={usuario.id}
          onClose={() => setRevisando(null)}
          onRevisado={async () => {
            setRevisando(null)
            await recargar()
          }}
        />
      )}

      {enviandoAcceso && (
        <EnviarAccesoModal
          usuario={enviandoAcceso.usuario}
          clinicaNombre={enviandoAcceso.clinica_nombre}
          onClose={() => setEnviandoAcceso(null)}
        />
      )}
    </div>
  )
}

/**
 * El texto se revisa antes de salir, igual que en el asistente de la clínica:
 * nada se manda a ciegas.
 *
 * ⚠️ Se abre con `enlaceWhatsapp()` y **no** con `enviarMensajeWhatsapp()`. Esa
 * segunda consume `consumir_cuota_whatsapp()`, que descuenta del tope **de la
 * clínica**: un aviso de cobro que el dueño de la plataforma manda a su cliente
 * gastaría la cuota del propio cliente. Mismo criterio que `EnviarAccesoModal`.
 */
function RedactarAvisoModal({ tarea, onClose }: { tarea: TareaPlataforma; onClose: () => void }) {
  const [texto, setTexto] = useState(() => plantillaTarea(tarea))

  return (
    <Modal title={`Avisar a ${tarea.clinica_nombre}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Badge tone={TONO[tarea.tipo]}>{TAREA_LABEL[tarea.tipo]}</Badge>
          <span className="text-xs text-slate-500">Para {tarea.responsable || tarea.clinica_nombre}</span>
        </div>

        <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={9} />

        <p className="flex items-start gap-2 text-xs text-slate-500">
          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-slate-400" />
          Este mensaje no consume la cuota de WhatsApp de la clínica: lo mandas tú desde tu propio teléfono.
        </p>

        <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={!texto.trim()}
            onClick={() => {
              window.open(enlaceWhatsapp(tarea.whatsapp, texto), '_blank', 'noopener')
              onClose()
            }}
          >
            <MessageCircle size={16} /> Abrir WhatsApp
          </Button>
        </div>
      </div>
    </Modal>
  )
}
