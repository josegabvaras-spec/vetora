import { useCallback, useEffect, useState } from 'react'
import { Building2, Check, MessageCircle, Pencil, Plus, Users } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { FieldGroup, Input } from '../../components/ui/Field'
import {
  updatePlan,
  setPlanActivo,
  usoEnClinicas,
  createPlan,
  listPlanes,
  type DatosPlan,
} from '../../services/planes'
import {
  getConfiguracion,
  setTipoCambio,
  TIPO_CAMBIO_POR_DEFECTO,
  type ConfiguracionPlataforma,
} from '../../services/configuracion'
import { formatBs, formatUsd, usdABs } from '../../lib/currency'
import { formatClinicDate } from '../../lib/datetime'
import type { Database } from '../../types/supabase'

type Plan = Database['public']['Tables']['planes']['Row'] & { uso_clinicas?: number }

export function PlataformaPlanesPage() {
  const [planes, setPlanes] = useState<Plan[]>([])
  const [config, setConfig] = useState<ConfiguracionPlataforma>({
    tipo_cambio_usd: TIPO_CAMBIO_POR_DEFECTO,
    actualizado_at: '',
  })
  const [creando, setCreando] = useState(false)
  const [editando, setEditando] = useState<Plan | null>(null)
  const [error, setError] = useState<string | null>(null)

  const recargar = useCallback(async () => {
    const [list, cfg] = await Promise.all([listPlanes(), getConfiguracion()])
    const conUso = await Promise.all(
      list.map(async (p) => {
        const uso = await usoEnClinicas(p.id)
        return { ...p, uso_clinicas: uso }
      })
    )
    setPlanes(conUso)
    setConfig(cfg)
  }, [])

  useEffect(() => {
    recargar()
  }, [recargar])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold text-slate-900">Planes</h1>
          <p className="mt-0.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Precios y límites de lo que contratan las clínicas
          </p>
        </div>
        <Button onClick={() => setCreando(true)}>
          <Plus size={16} /> Nuevo plan
        </Button>
      </div>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      {/* El tipo de cambio vive aquí, junto a los precios que convierte: es el
          único sitio donde mirarlo tiene sentido. */}
      <TipoCambioCard config={config} onGuardado={setConfig} />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {planes.map((p) => {
          const contratado = p.uso_clinicas ?? 0
          return (
            <Card key={p.id} className={p.activo ? 'border border-slate-200/60' : 'border border-dashed border-slate-300'}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className={p.activo ? 'text-sm font-bold text-slate-900' : 'text-sm font-bold text-slate-400'}>
                    {p.nombre}
                  </p>
                  {/* El dólar es el precio; el boliviano es lo que se cobra hoy
                      y cambia solo con el tipo de cambio. */}
                  <p className="font-display text-2xl font-black text-slate-900">
                    {formatUsd(p.precio_mensual_usd)}
                    <span className="ml-1 text-xs font-semibold text-slate-400">/ mes</span>
                  </p>
                  <p className="text-xs font-medium text-slate-400">
                    ≈ {formatBs(usdABs(p.precio_mensual_usd, config.tipo_cambio_usd))}
                  </p>
                </div>
                <Badge tone={p.activo ? 'teal' : 'slate'} size="sm">
                  {p.activo ? 'En oferta' : 'Retirado'}
                </Badge>
              </div>

              <dl className="mt-4 space-y-1.5 border-t border-slate-100 pt-3 text-xs text-slate-600">
                <div className="flex items-center gap-2">
                  <Building2 size={13} className="text-slate-400" />
                  {p.max_sucursales} sucursal(es)
                </div>
                <div className="flex items-center gap-2">
                  <Users size={13} className="text-slate-400" />
                  {p.max_usuarios} usuarios
                </div>
                <div className="flex items-center gap-2">
                  <MessageCircle size={13} className="text-slate-400" />
                  {p.whatsapp_limite} mensajes de WhatsApp al mes
                </div>
              </dl>

              <p className="mt-3 text-[11px] font-semibold text-slate-400">
                {contratado === 0
                  ? 'Ninguna clínica contratada'
                  : `${contratado} clínica(s) contratada(s)`}
              </p>

              <div className="mt-3 flex gap-2 border-t border-slate-100 pt-3">
                <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={() => setEditando(p)}>
                  <Pencil size={13} /> Editar
                </Button>
                <Button
                  variant={p.activo ? 'secondary' : 'success'}
                  className="px-3 py-1.5 text-xs"
                  onClick={async () => {
                    setError(null)
                    try {
                      await setPlanActivo(p.id, !p.activo)
                      await recargar()
                    } catch (err) {
                      setError(err instanceof Error ? err.message : 'No se pudo cambiar el plan')
                    }
                  }}
                >
                  {p.activo ? 'Retirar de la oferta' : 'Volver a ofrecer'}
                </Button>
              </div>
            </Card>
          )
        })}
      </div>

      {planes.length === 0 && (
        <Card className="border border-dashed border-slate-300 py-10 text-center">
          <p className="text-sm text-slate-400">Todavía no hay planes. Crea el primero para poder dar de alta clínicas.</p>
        </Card>
      )}

      {(creando || editando) && (
        <PlanModal
          plan={editando}
          tipoCambio={config.tipo_cambio_usd}
          onClose={() => {
            setCreando(false)
            setEditando(null)
          }}
          onGuardado={async () => {
            setCreando(false)
            setEditando(null)
            await recargar()
          }}
        />
      )}
    </div>
  )
}

/**
 * Tipo de cambio del dólar.
 *
 * Se enseña con la fecha de la última actualización: una tasa sin fecha no dice
 * si sigue vigente, y de ella depende lo que se le cobra a cada clínica.
 */
function TipoCambioCard({
  config,
  onGuardado,
}: {
  config: ConfiguracionPlataforma
  onGuardado: (c: ConfiguracionPlataforma) => void
}) {
  const [editando, setEditando] = useState(false)
  const [valor, setValor] = useState(String(config.tipo_cambio_usd))
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function guardar() {
    setGuardando(true)
    setError(null)
    try {
      onGuardado(await setTipoCambio(Number(valor)))
      setEditando(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el tipo de cambio')
    }
    setGuardando(false)
  }

  return (
    <Card className="border border-slate-200/60">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Tipo de cambio</p>
          {editando ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-slate-500">USD 1 =</span>
              <Input
                type="number"
                min="0.0001"
                step="0.0001"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                className="w-32"
              />
              <span className="text-sm font-semibold text-slate-500">Bs.</span>
              <Button size="sm" onClick={guardar} disabled={guardando}>
                <Check size={14} /> {guardando ? 'Guardando…' : 'Guardar'}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setValor(String(config.tipo_cambio_usd))
                  setError(null)
                  setEditando(false)
                }}
              >
                Cancelar
              </Button>
            </div>
          ) : (
            <p className="font-display text-2xl font-black text-slate-900">
              USD 1 = {formatBs(config.tipo_cambio_usd)}
            </p>
          )}
          <p className="mt-1 text-[11px] font-medium text-slate-400">
            {config.actualizado_at
              ? `Actualizado el ${formatClinicDate(config.actualizado_at)}`
              : 'Sin registrar: se está usando el valor por defecto.'}
          </p>
          {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
        </div>

        {!editando && (
          <Button variant="secondary" size="sm" onClick={() => setEditando(true)}>
            <Pencil size={13} /> Cambiar
          </Button>
        )}
      </div>

      <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
        Los planes se fijan en dólares porque lo que sostiene la plataforma (dominio, servidores) se paga en
        dólares y sus tarifas cambian. Las clínicas pagan el equivalente en bolivianos a este cambio, así que
        al tocarlo cambia lo que se le cobra a todas a la vez.
      </p>
    </Card>
  )
}

function PlanModal({
  plan,
  tipoCambio,
  onClose,
  onGuardado,
}: {
  plan: Plan | null
  tipoCambio: number
  onClose: () => void
  onGuardado: () => void
}) {
  const [nombre, setNombre] = useState(plan?.nombre ?? '')
  const [precio, setPrecio] = useState(plan ? String(plan.precio_mensual_usd) : '')
  const [whatsapp, setWhatsapp] = useState(plan ? String(plan.whatsapp_limite) : '200')
  const [sucursales, setSucursales] = useState(plan ? String(plan.max_sucursales) : '1')
  const [usuarios, setUsuarios] = useState(plan ? String(plan.max_usuarios) : '5')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const precioNumero = Number(precio)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setGuardando(true)
    setError(null)
    const datos: DatosPlan = {
      nombre,
      precio_mensual_usd: Number(precio),
      whatsapp_limite: Number(whatsapp),
      max_sucursales: Number(sucursales),
      max_usuarios: Number(usuarios),
    }
    try {
      if (plan) await updatePlan(plan.id, datos)
      else await createPlan(datos)
      onGuardado()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el plan')
      setGuardando(false)
    }
  }

  return (
    <Modal title={plan ? 'Editar plan' : 'Nuevo plan'} onClose={onClose}>
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldGroup label="Nombre del plan">
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Clínica" required />
          </FieldGroup>
          <FieldGroup label="Precio mensual (USD)">
            <Input
              type="number"
              min="0"
              step="0.01"
              value={precio}
              onChange={(e) => setPrecio(e.target.value)}
              required
            />
            {/* La cifra que la clínica va a ver en su factura, al cambio de hoy:
                así el precio se decide sabiendo cuánto pide de verdad. */}
            {Number.isFinite(precioNumero) && precio !== '' && (
              <p className="mt-1 text-xs text-slate-500">
                La clínica pagará ≈ {formatBs(usdABs(precioNumero, tipoCambio))} al mes.
              </p>
            )}
          </FieldGroup>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <FieldGroup label="Máx. sucursales">
            <Input type="number" min="1" value={sucursales} onChange={(e) => setSucursales(e.target.value)} />
          </FieldGroup>
          <FieldGroup label="Máx. usuarios">
            <Input type="number" min="1" value={usuarios} onChange={(e) => setUsuarios(e.target.value)} />
          </FieldGroup>
          <FieldGroup label="WhatsApp / mes">
            <Input type="number" min="1" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} />
          </FieldGroup>
        </div>

        <p className="text-xs text-slate-500">
          Estos límites bloquean de verdad: una clínica no podrá crear más sucursales, usuarios ni enviar más
          recordatorios de los que permita su plan. Si subes un límite, sus clínicas lo notan al instante.
        </p>

        {error && <p className="text-sm text-rose-600">{error}</p>}

        <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
