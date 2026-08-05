import { useCallback, useEffect, useState } from 'react'
import { Building2, MessageCircle, Pencil, Plus, Users } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { FieldGroup, Input } from '../../components/ui/Field'
import {
  actualizarPlan,
  alternarActivoPlan,
  clinicasEnPlan,
  crearPlan,
  listPlanes,
  type DatosPlan,
} from '../../services/planes'
import { formatBs } from '../../lib/currency'
import type { Plan } from '../../types/database'

export function PlataformaPlanesPage() {
  const [planes, setPlanes] = useState<Plan[]>([])
  const [creando, setCreando] = useState(false)
  const [editando, setEditando] = useState<Plan | null>(null)
  const [error, setError] = useState<string | null>(null)

  const recargar = useCallback(async () => {
    setPlanes(await listPlanes())
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

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {planes.map((p) => {
          const contratado = clinicasEnPlan(p.id).length
          return (
            <Card key={p.id} className={p.activo ? 'border border-slate-200/60' : 'border border-dashed border-slate-300'}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className={p.activo ? 'text-sm font-bold text-slate-900' : 'text-sm font-bold text-slate-400'}>
                    {p.nombre}
                  </p>
                  <p className="font-display text-2xl font-black text-slate-900">
                    {formatBs(p.precio_mensual_bs)}
                    <span className="ml-1 text-xs font-semibold text-slate-400">/ mes</span>
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
                      await alternarActivoPlan(p.id)
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

function PlanModal({
  plan,
  onClose,
  onGuardado,
}: {
  plan: Plan | null
  onClose: () => void
  onGuardado: () => void
}) {
  const [nombre, setNombre] = useState(plan?.nombre ?? '')
  const [precio, setPrecio] = useState(plan ? String(plan.precio_mensual_bs) : '')
  const [whatsapp, setWhatsapp] = useState(plan ? String(plan.whatsapp_limite) : '200')
  const [sucursales, setSucursales] = useState(plan ? String(plan.max_sucursales) : '1')
  const [usuarios, setUsuarios] = useState(plan ? String(plan.max_usuarios) : '5')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setGuardando(true)
    setError(null)
    const datos: DatosPlan = {
      nombre,
      precio_mensual_bs: Number(precio),
      whatsapp_limite: Number(whatsapp),
      max_sucursales: Number(sucursales),
      max_usuarios: Number(usuarios),
    }
    try {
      if (plan) await actualizarPlan(plan.id, datos)
      else await crearPlan(datos)
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
          <FieldGroup label="Precio mensual (Bs.)">
            <Input
              type="number"
              min="0"
              step="0.01"
              value={precio}
              onChange={(e) => setPrecio(e.target.value)}
              required
            />
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
