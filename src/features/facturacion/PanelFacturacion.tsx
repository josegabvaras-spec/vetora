import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Clock, Receipt, Upload, XCircle } from 'lucide-react'
import { AvisoError } from '../../components/ui/AvisoError'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { FieldGroup, Input, Select } from '../../components/ui/Field'
import { Seccion } from '../../components/ui/Seccion'
import { TablaResponsive, type Columna } from '../../components/ui/Tabla'
import { useAuth } from '../../context/AuthContext'
import {
  enviarComprobante,
  getDatosDePago,
  getResumenSuscripcion,
  hayComprobantePendiente,
  listPagosDeClinica,
  MESES_RENOVACION,
  type DatosDePago,
  type ResumenSuscripcion,
} from '../../services/facturacion'
import { formatBs, formatUsd, usdABs } from '../../lib/currency'
import { clinicDayIso, desdeFechaSola, formatClinicDate } from '../../lib/datetime'
import type { EstadoComprobante, PagoSuscripcion } from '../../types/database'

const ESTADO_LABEL: Record<EstadoComprobante, string> = {
  pendiente: 'En revisión',
  aprobado: 'Aprobado',
  rechazado: 'Rechazado',
}

const ESTADO_TONE: Record<EstadoComprobante, 'amber' | 'emerald' | 'rose'> = {
  pendiente: 'amber',
  aprobado: 'emerald',
  rechazado: 'rose',
}

/**
 * Facturación de la clínica: su plan, y cómo pagarlo.
 *
 * Vive dentro del panel de cuenta (PerfilModal), junto a los datos y el cambio
 * de contraseña: pagar la suscripción es una gestión de LA CUENTA, no del
 * trabajo del día, y en el menú lateral quedaba mezclada con la agenda y el
 * inventario.
 *
 * No hay pasarela. Se paga escaneando el QR del dueño de la plataforma y se
 * sube la foto del comprobante; él la revisa desde su asistente y al aprobarla
 * avanza la fecha del próximo cobro.
 *
 * **Esta pantalla no cambia nada del estado de pago**, ni puede: la clínica
 * solo inserta comprobantes (policy `pagos_clinica_insert`, que además exige
 * que nazcan pendientes) y la única policy de UPDATE sobre `clinicas` es del
 * superadministrador.
 *
 * Es del `admin` a secas: recepción y el veterinario no gestionan la
 * suscripción, y `PerfilModal` solo le enseña la pestaña a él.
 */
export function PanelFacturacion() {
  const { usuario } = useAuth()

  const [resumen, setResumen] = useState<ResumenSuscripcion | null>(null)
  const [datosPago, setDatosPago] = useState<DatosDePago | null>(null)
  const [pagos, setPagos] = useState<PagoSuscripcion[]>([])
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)

  const [meses, setMeses] = useState(1)
  const [archivo, setArchivo] = useState<File | null>(null)
  const [referencia, setReferencia] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const recargar = useCallback(async () => {
    const [s, d, p] = await Promise.all([
      getResumenSuscripcion(),
      // Sin QR configurado todavía, la pantalla sigue sirviendo para ver el
      // plan y lo que se debe: el fallo no puede vaciarla entera.
      getDatosDePago().catch(() => null),
      listPagosDeClinica(),
    ])
    setResumen(s)
    setDatosPago(d)
    setPagos(p)
  }, [])

  useEffect(() => {
    setErrorCarga(null)
    recargar()
      .catch((err) => setErrorCarga(err instanceof Error ? err.message : 'No se pudo cargar la facturación'))
      .finally(() => setCargando(false))
  }, [recargar])

  async function handleEnviar(e: React.FormEvent) {
    e.preventDefault()
    if (!resumen || !archivo) return
    setEnviando(true)
    setErrorEnvio(null)
    setAviso(null)
    try {
      await enviarComprobante({
        clinicaId: resumen.clinica_id,
        meses,
        precioMensualUsd: resumen.precio_acordado_usd,
        tipoCambio: resumen.tipo_cambio_usd,
        archivo,
        referencia,
      })
      setArchivo(null)
      setReferencia('')
      setAviso('Comprobante enviado. Te avisaremos en cuanto quede aprobado.')
      await recargar()
    } catch (err) {
      setErrorEnvio(err instanceof Error ? err.message : 'No se pudo enviar el comprobante')
    } finally {
      setEnviando(false)
    }
  }

  const columnas: Columna<PagoSuscripcion>[] = [
    {
      clave: 'fecha',
      cabecera: 'Enviado',
      movil: 'titulo',
      celda: (p) => (
        <div className="min-w-0">
          <p className="font-bold text-slate-900">{formatClinicDate(p.created_at)}</p>
          {p.referencia && <p className="truncate text-xs text-slate-500">Ref. {p.referencia}</p>}
        </div>
      ),
    },
    {
      clave: 'estado',
      cabecera: 'Estado',
      movil: 'destacado',
      celda: (p) => (
        <Badge tone={ESTADO_TONE[p.estado]} size="sm">
          {ESTADO_LABEL[p.estado]}
        </Badge>
      ),
    },
    {
      clave: 'meses',
      cabecera: 'Cubre',
      celda: (p) => (
        <span className="text-slate-600">
          {p.meses} {p.meses === 1 ? 'mes' : 'meses'}
        </span>
      ),
    },
    {
      clave: 'importe',
      cabecera: 'Importe',
      alineadaDerecha: true,
      celda: (p) => (
        <div className="sm:text-right">
          <p className="font-semibold text-slate-900">{formatUsd(p.monto_usd)}</p>
          <p className="text-xs text-slate-400">{formatBs(p.monto_bs)}</p>
        </div>
      ),
    },
    {
      clave: 'motivo',
      cabecera: 'Observaciones',
      celda: (p) =>
        p.motivo_rechazo ? (
          <span className="text-rose-700">{p.motivo_rechazo}</span>
        ) : (
          <span className="text-slate-400">—</span>
        ),
    },
  ]

  if (cargando) return <p className="text-sm text-slate-500">Cargando facturación…</p>
  if (errorCarga) return <AvisoError mensaje={errorCarga} />
  if (!resumen) return null

  const enMora = resumen.estado_pago === 'en_mora'
  const vencido = resumen.proximo_cobro.slice(0, 10) < clinicDayIso()
  const totalUsd = Number((resumen.precio_acordado_usd * meses).toFixed(2))
  const pendiente = hayComprobantePendiente(pagos)

  return (
    <div className="space-y-6">
      {/* Tu plan */}
      <Card padding="md" className="border border-slate-200/60">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Tu plan</p>
            <p className="font-display text-xl font-black text-slate-900">{resumen.plan.nombre}</p>
            {/* El dólar es el precio; el boliviano es lo que se transfiere. */}
            <p className="mt-1 font-display text-2xl font-black text-slate-900">
              {formatUsd(resumen.precio_acordado_usd)}
              <span className="ml-1 text-xs font-semibold text-slate-400">/ mes</span>
            </p>
            <p className="text-xs font-medium text-slate-400">
              ≈ {formatBs(usdABs(resumen.precio_acordado_usd, resumen.tipo_cambio_usd))}
            </p>
          </div>

          <div className="sm:text-right">
            <Badge tone={enMora ? 'rose' : 'emerald'}>{enMora ? 'En mora' : 'Al día'}</Badge>
            <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Próximo cobro
            </p>
            <p className={vencido ? 'font-semibold text-rose-600' : 'font-semibold text-slate-800'}>
              {formatClinicDate(desdeFechaSola(resumen.proximo_cobro))}
            </p>
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-3 gap-4 border-t border-slate-100 pt-4 text-xs text-slate-600">
          <div>
            <dt className="text-slate-400">Sucursales</dt>
            <dd className="font-semibold text-slate-800">{resumen.plan.max_sucursales}</dd>
          </div>
          <div>
            <dt className="text-slate-400">Usuarios</dt>
            <dd className="font-semibold text-slate-800">{resumen.plan.max_usuarios}</dd>
          </div>
          <div>
            <dt className="text-slate-400">WhatsApp / mes</dt>
            <dd className="font-semibold text-slate-800">{resumen.plan.whatsapp_limite}</dd>
          </div>
        </dl>

        <p className="mt-3 text-xs text-slate-500">
          ¿Necesitas más sucursales, usuarios o mensajes? Escríbenos y te cambiamos de plan.
        </p>
      </Card>

      {/* Renovar */}
      <Seccion titulo="Renovar la suscripción" icono={<Receipt size={14} />} tono={enMora ? 'destacado' : 'neutro'}>
        {pendiente && (
          <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <Clock size={18} className="mt-0.5 shrink-0" />
            Ya tienes un comprobante en revisión. Te avisamos en cuanto quede aprobado; no hace falta que
            mandes otro.
          </p>
        )}

        <div className="grid gap-5 md:grid-cols-2">
          {/* Cómo pagar */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">1. Paga</p>
            {datosPago?.qr_pago ? (
              <img
                src={datosPago.qr_pago}
                alt="Código QR para pagar la suscripción"
                className="mx-auto w-full max-w-[260px] rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
              />
            ) : (
              <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-400">
                Todavía no hay un QR configurado. Escríbenos y te pasamos los datos para el pago.
              </p>
            )}
            {datosPago?.datos_pago && (
              <p className="whitespace-pre-line rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
                {datosPago.datos_pago}
              </p>
            )}
          </div>

          {/* Mandar el comprobante */}
          <form className="space-y-4" onSubmit={handleEnviar}>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              2. Manda el comprobante
            </p>

            <FieldGroup label="¿Cuántos meses pagas?">
              <Select value={String(meses)} onChange={(e) => setMeses(Number(e.target.value))}>
                {MESES_RENOVACION.map((m) => (
                  <option key={m} value={m}>
                    {m} {m === 1 ? 'mes' : 'meses'}
                  </option>
                ))}
              </Select>
            </FieldGroup>

            <div className="rounded-xl border border-teal-100 bg-teal-50/60 p-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-teal-700">Total a pagar</p>
              <p className="font-display text-2xl font-black text-slate-900">{formatUsd(totalUsd)}</p>
              <p className="text-sm font-semibold text-slate-600">
                {formatBs(usdABs(totalUsd, resumen.tipo_cambio_usd))}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                Al cambio de USD 1 = {formatBs(resumen.tipo_cambio_usd)}. Es la cifra que transfieres.
              </p>
            </div>

            <FieldGroup label="Número de operación (opcional)">
              <Input
                value={referencia}
                onChange={(e) => setReferencia(e.target.value)}
                placeholder="Ej. 00123456"
              />
            </FieldGroup>

            <FieldGroup label="Foto del comprobante">
              <Input
                type="file"
                accept="image/*"
                onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
                required
              />
            </FieldGroup>

            {errorEnvio && <p className="text-sm text-rose-600">{errorEnvio}</p>}
            {aviso && (
              <p className="flex items-start gap-2 text-sm text-emerald-700">
                <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
                {aviso}
              </p>
            )}

            <Button type="submit" disabled={enviando || !archivo} className="w-full">
              <Upload size={16} /> {enviando ? 'Enviando…' : 'Enviar comprobante'}
            </Button>
          </form>
        </div>
      </Seccion>

      {/* Historial */}
      <Seccion titulo="Comprobantes enviados">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <TablaResponsive
            columnas={columnas}
            filas={pagos}
            claveDe={(p) => p.id}
            vacio={
              <span className="flex flex-col items-center gap-2 text-slate-400">
                <XCircle size={32} className="opacity-20" />
                Todavía no has enviado ningún comprobante.
              </span>
            }
          />
        </div>
      </Seccion>

      <p className="text-center text-xs text-slate-400">
        Cuenta de {resumen.clinica_nombre} · administrada por {usuario?.nombre}
      </p>
    </div>
  )
}
