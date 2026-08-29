import { useState } from 'react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import {
  AlertTriangle,
  Camera,
  MessageCircle,
  CheckCircle2,
  Wallet,
} from 'lucide-react'
import { formatBs } from '../../lib/currency'
import { formatClinicDateTime } from '../../lib/datetime'
import {
  ESTADO_ORDEN_LABEL,
  ESTADO_ORDEN_TONE,
  NIVEL_NUDOS_LABEL,
  NIVEL_SUCIEDAD_LABEL,
  avanzarEstadoOrden,
  guardarFotoOrden,
} from '../../services/peluqueria'
import { generarEnlaceMascotaListaWhatsApp } from '../../services/fidelizacion'
import { useAuth } from '../../context/useAuth'
import type { PeluqueriaOrdenConDetalle } from '../../types/views'
import type { EstadoOrdenPeluqueria, TipoFotoGrooming } from '../../types/database'
import { redimensionarImagen } from '../../lib/imagen'

interface OrdenDetalleModalProps {
  orden: PeluqueriaOrdenConDetalle
  onClose: () => void
  onUpdated: () => void
  onAbrirEvaluacion?: () => void
}

const PIPELINE_ESTADOS: EstadoOrdenPeluqueria[] = [
  'recepcion',
  'evaluacion',
  'en_espera',
  'en_proceso',
  'terminada',
  'lista_recoger',
  'entregada',
]

export function OrdenDetalleModal({ orden, onClose, onUpdated, onAbrirEvaluacion }: OrdenDetalleModalProps) {
  const { usuario } = useAuth()
  const [observacionesPeluquero] = useState(orden.observaciones_peluquero || '')
  const [guardando, setGuardando] = useState(false)
  const [subiendoFoto, setSubiendoFoto] = useState(false)
  const [tipoFotoSeleccionado, setTipoFotoSeleccionado] = useState<TipoFotoGrooming>('despues')
  const [error, setError] = useState<string | null>(null)

  const fotosAntes = (orden.fotos || []).filter((f) => f.tipo === 'antes')
  const fotosDurante = (orden.fotos || []).filter((f) => f.tipo === 'durante')
  const fotosDespues = (orden.fotos || []).filter((f) => f.tipo === 'despues')

  async function handleCambiarEstado(nuevoEstado: EstadoOrdenPeluqueria) {
    setGuardando(true)
    setError(null)
    try {
      await avanzarEstadoOrden(orden.id, nuevoEstado, {
        observacionesPeluquero,
        usuarioId: usuario?.id,
      })
      onUpdated()
    } catch (err: any) {
      setError(err.message || 'Error al cambiar estado')
    } finally {
      setGuardando(false)
    }
  }

  async function handleSubirFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setSubiendoFoto(true)
    setError(null)

    try {
      const comprimido = await redimensionarImagen(file, 1200, 0.8)
      // Convertir a base64 DataURL
      const reader = new FileReader()
      reader.onloadend = async () => {
        const base64data = reader.result as string
        try {
          await guardarFotoOrden(orden.id, orden.paciente_id, tipoFotoSeleccionado, base64data)
          onUpdated()
        } catch (err: any) {
          setError(err.message || 'No se pudo guardar la foto')
        } finally {
          setSubiendoFoto(false)
        }
      }
      reader.readAsDataURL(comprimido)
    } catch (err: any) {
      setError(err.message || 'Error al procesar la imagen')
      setSubiendoFoto(false)
    }
  }

  function handleEnviarAvisoLista() {
    if (!orden.cliente?.whatsapp) {
      setError('El cliente no tiene registrado un número de WhatsApp')
      return
    }
    const link = generarEnlaceMascotaListaWhatsApp(
      orden.cliente.nombre,
      orden.cliente.whatsapp,
      orden.paciente.nombre,
      'Vetora',
    )
    window.open(link, '_blank', 'noopener,noreferrer')
  }

  return (
    <Modal onClose={onClose} title={`Orden de Servicio #${orden.numero_orden}`} widthClassName="max-w-4xl">
      <div className="space-y-5">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
            {error}
          </div>
        )}

        {/* Cabecera de la Orden */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-black text-slate-800">
                {orden.paciente?.nombre}
              </h3>
              <Badge tone={ESTADO_ORDEN_TONE[orden.estado]}>
                {ESTADO_ORDEN_LABEL[orden.estado]}
              </Badge>
              {orden.cobro_id ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                  <CheckCircle2 size={12} /> Cobrado
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                  <Wallet size={12} /> Por cobrar
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {orden.paciente?.especie} · {orden.paciente?.raza || 'Mestizo'} · Dueño: <span className="font-semibold text-slate-700">{orden.cliente?.nombre}</span> ({orden.cliente?.whatsapp || 'Sin WhatsApp'})
            </p>
          </div>

          <div className="text-right">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total a Cobrar</p>
            <p className="text-2xl font-black text-teal-800">{formatBs(orden.precio_final_bs)}</p>
          </div>
        </div>

        {/* Pipeline de Estados */}
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Flujo del Servicio</p>
          <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto pb-1">
            {PIPELINE_ESTADOS.map((est, i) => {
              const esActual = orden.estado === est
              const pasoIndex = PIPELINE_ESTADOS.indexOf(orden.estado)
              const yaPaso = pasoIndex > i

              return (
                <button
                  key={est}
                  type="button"
                  onClick={() => handleCambiarEstado(est)}
                  disabled={guardando}
                  className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all min-h-10 cursor-pointer ${
                    esActual
                      ? 'bg-teal-600 text-white shadow-sm shadow-teal-600/30 ring-2 ring-teal-600 ring-offset-1'
                      : yaPaso
                      ? 'bg-teal-50 text-teal-800 border border-teal-200'
                      : 'bg-slate-50 text-slate-500 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <span>{ESTADO_ORDEN_LABEL[est]}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Alerta Veterinaria si hay lesión */}
        {orden.alerta_veterinaria && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3.5 text-xs text-amber-900">
            <AlertTriangle size={20} className="text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Se recomienda evaluación médica veterinaria.</p>
              <p className="text-amber-800 mt-0.5">
                {orden.lesiones_visibles || 'Se detectaron hallazgos dermatológicos o lesiones durante la recepción.'}
              </p>
            </div>
          </div>
        )}

        {/* Detalles del servicio y tiempos */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3 text-xs space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Peluquero / Atiende</p>
            <p className="font-bold text-slate-800">{orden.peluquero?.nombre}</p>
            <p className="text-slate-500">{orden.servicio?.nombre || 'Servicio personalizado'}</p>
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3 text-xs space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Evaluación Pelaje</p>
            <p className="font-semibold text-slate-700">
              Nudos: <span className="text-slate-900 font-bold">{NIVEL_NUDOS_LABEL[orden.nivel_nudos] || 'Normal'}</span>
            </p>
            <p className="font-semibold text-slate-700">
              Suciedad: <span className="text-slate-900 font-bold">{NIVEL_SUCIEDAD_LABEL[orden.nivel_suciedad] || 'Normal'}</span>
            </p>
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3 text-xs space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Tiempos Registrados</p>
            <p className="text-slate-600">Ingreso: {formatClinicDateTime(orden.hora_ingreso)}</p>
            {orden.hora_fin && <p className="text-slate-600">Fin: {formatClinicDateTime(orden.hora_fin)}</p>}
          </div>
        </div>

        {/* Suplementos y Desglose de Precios */}
        {orden.suplementos && orden.suplementos.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Suplementos Aplicados</p>
            <div className="divide-y divide-slate-100">
              {orden.suplementos.map((s, idx) => (
                <div key={idx} className="flex justify-between py-1.5 text-xs">
                  <span className="font-medium text-slate-700">{s.concepto}</span>
                  <span className="font-bold text-teal-700">+{formatBs(s.monto_bs)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Galería de Fotos Antes / Durante / Después */}
        <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Fotografías del Servicio
              </h4>
              <p className="text-[11px] text-slate-500">
                Registro visual de antes, durante y después del corte y baño.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={tipoFotoSeleccionado}
                onChange={(e) => setTipoFotoSeleccionado(e.target.value as TipoFotoGrooming)}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700"
              >
                <option value="antes">Foto Antes</option>
                <option value="durante">Foto Durante</option>
                <option value="despues">Foto Después</option>
              </select>

              <label className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1 text-xs font-semibold text-white hover:bg-teal-700 transition-colors cursor-pointer min-h-10">
                <Camera size={15} />
                <span>{subiendoFoto ? 'Subiendo...' : 'Subir Foto'}</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleSubirFoto}
                  disabled={subiendoFoto}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
            {/* Antes */}
            <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-700">Antes</span>
                <Badge tone="slate">{fotosAntes.length}</Badge>
              </div>
              {fotosAntes.length > 0 ? (
                <div className="grid grid-cols-2 gap-1.5">
                  {fotosAntes.map((f) => (
                    <img
                      key={f.id}
                      src={f.foto_url}
                      alt="Antes"
                      className="h-24 w-full rounded-lg object-cover border border-slate-100 shadow-sm"
                    />
                  ))}
                </div>
              ) : (
                <p className="text-center py-6 text-[11px] text-slate-400 italic">Sin fotos</p>
              )}
            </div>

            {/* Durante */}
            <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-700">Durante</span>
                <Badge tone="slate">{fotosDurante.length}</Badge>
              </div>
              {fotosDurante.length > 0 ? (
                <div className="grid grid-cols-2 gap-1.5">
                  {fotosDurante.map((f) => (
                    <img
                      key={f.id}
                      src={f.foto_url}
                      alt="Durante"
                      className="h-24 w-full rounded-lg object-cover border border-slate-100 shadow-sm"
                    />
                  ))}
                </div>
              ) : (
                <p className="text-center py-6 text-[11px] text-slate-400 italic">Sin fotos</p>
              )}
            </div>

            {/* Después */}
            <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-700">Resultado Final</span>
                <Badge tone="emerald">{fotosDespues.length}</Badge>
              </div>
              {fotosDespues.length > 0 ? (
                <div className="grid grid-cols-2 gap-1.5">
                  {fotosDespues.map((f) => (
                    <img
                      key={f.id}
                      src={f.foto_url}
                      alt="Después"
                      className="h-24 w-full rounded-lg object-cover border border-slate-100 shadow-sm"
                    />
                  ))}
                </div>
              ) : (
                <p className="text-center py-6 text-[11px] text-slate-400 italic">Sin fotos</p>
              )}
            </div>
          </div>
        </div>

        {/* Acciones Rápidas */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleEnviarAvisoLista}
              className="border-emerald-300 text-emerald-800 hover:bg-emerald-50"
            >
              <MessageCircle size={15} className="mr-1 text-emerald-600" />
              <span>Avisar por WhatsApp que está lista</span>
            </Button>
            {onAbrirEvaluacion && (
              <Button type="button" variant="outline" size="sm" onClick={onAbrirEvaluacion}>
                Revisar Evaluación Inicial
              </Button>
            )}
          </div>

          <Button type="button" variant="primary" onClick={onClose}>
            Cerrar Detalle
          </Button>
        </div>
      </div>
    </Modal>
  )
}
