import { useCallback, useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { Seccion } from '../../components/ui/Seccion'
import { FieldGroup, Input, Select } from '../../components/ui/Field'
import { ClinicaDetalleModal } from '../../features/plataforma/ClinicaDetalleModal'
import { EnviarAccesoModal } from '../../features/plataforma/EnviarAccesoModal'
import { useTable } from '../../mocks/useDb'
import { crearClinica, listClinicas, type AltaClinicaInput } from '../../services/plataforma'
import { listPlanes } from '../../services/planes'
import { formatBs } from '../../lib/currency'
import { formatClinicDate } from '../../lib/datetime'
import type { Plan, Usuario } from '../../types/database'
import type { ClinicaConDetalle, UsoLimite } from '../../types/views'

const ESTADO_TONE = { activa: 'emerald', suspendida: 'rose', demo: 'slate' } as const
const ESTADO_LABEL = { activa: 'Activa', suspendida: 'Suspendida', demo: 'Demo' } as const

/** Consumo frente al tope, con el color que corresponde a lo apretado que va. */
function Uso({ etiqueta, uso }: { etiqueta: string; uso: UsoLimite }) {
  const pct = uso.maximo > 0 ? (uso.usados / uso.maximo) * 100 : 0
  const tono = pct >= 100 ? 'rose' : pct >= 80 ? 'amber' : 'slate'
  return (
    <Badge tone={tono} size="sm">
      {etiqueta} {uso.usados}/{uso.maximo}
    </Badge>
  )
}

export function PlataformaClinicasPage() {
  const [clinicas, setClinicas] = useState<ClinicaConDetalle[]>([])
  const [creando, setCreando] = useState(false)
  const [seleccionada, setSeleccionada] = useState<ClinicaConDetalle | null>(null)
  const [enviandoAcceso, setEnviandoAcceso] = useState<{ usuario: Usuario; clinicaNombre: string } | null>(null)
  const filas = useTable('clinicas')
  const usuarios = useTable('usuarios')
  const sucursales = useTable('sucursales')

  const recargar = useCallback(async () => {
    const datos = await listClinicas()
    setClinicas(datos)
    setSeleccionada((actual) => (actual ? datos.find((c) => c.id === actual.id) ?? null : null))
  }, [])

  useEffect(() => {
    recargar()
  }, [recargar, filas, usuarios, sucursales])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold text-slate-900">Clínicas</h1>
          <p className="mt-0.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Quiénes contrataron el servicio y en qué plan
          </p>
        </div>
        <Button onClick={() => setCreando(true)}>
          <Plus size={16} /> Nueva clínica
        </Button>
      </div>

      <div className="space-y-2">
        {clinicas.map((c) => (
          <button
            key={c.id}
            onClick={() => setSeleccionada(c)}
            className="w-full cursor-pointer rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-colors hover:border-teal-400 hover:bg-teal-50/30"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold text-slate-900">{c.nombre}</span>
                  <Badge tone={ESTADO_TONE[c.estado]} size="sm">
                    {ESTADO_LABEL[c.estado]}
                  </Badge>
                  <Badge tone="teal" size="sm">
                    {c.plan_nombre}
                  </Badge>
                  {c.estado_pago === 'en_mora' && (
                    <Badge tone="rose" size="sm">
                      En mora
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {c.responsable} · {c.whatsapp} · {c.ciudad}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Uso etiqueta="Sucursales" uso={c.limites.sucursales} />
                  <Uso etiqueta="Usuarios" uso={c.limites.usuarios} />
                  <Uso etiqueta="WhatsApp" uso={c.limites.whatsapp} />
                </div>
              </div>

              <div className="text-right">
                <p className="font-display text-lg font-black text-slate-900">{formatBs(c.precio_acordado_bs)}</p>
                <p className="text-[11px] font-semibold text-slate-400">al mes</p>
                <p className="mt-1 text-[11px] text-slate-500">
                  Próximo cobro: {formatClinicDate(`${c.proximo_cobro}T12:00:00Z`)}
                </p>
                <p className="mt-1 text-[11px] text-slate-400">
                  {c.total_pacientes} pacientes · {c.total_citas} citas
                </p>
              </div>
            </div>
          </button>
        ))}

        {clinicas.length === 0 && (
          <Card className="border border-dashed border-slate-300 py-10 text-center">
            <p className="text-sm text-slate-400">Todavía no hay clínicas contratadas.</p>
          </Card>
        )}
      </div>

      {creando && (
        <NuevaClinicaModal
          onClose={() => setCreando(false)}
          onCreada={async (admin, clinicaNombre) => {
            setCreando(false)
            await recargar()
            // El alta encadena con el envío del acceso: dar de alta a alguien y
            // no poder avisarle dejaría la cuenta creada pero inservible.
            setEnviandoAcceso({ usuario: admin, clinicaNombre })
          }}
        />
      )}

      {seleccionada && (
        <ClinicaDetalleModal
          clinica={seleccionada}
          onClose={() => setSeleccionada(null)}
          onChanged={recargar}
        />
      )}

      {enviandoAcceso && (
        <EnviarAccesoModal
          usuario={enviandoAcceso.usuario}
          clinicaNombre={enviandoAcceso.clinicaNombre}
          onClose={() => setEnviandoAcceso(null)}
        />
      )}
    </div>
  )
}

function NuevaClinicaModal({
  onClose,
  onCreada,
}: {
  onClose: () => void
  onCreada: (admin: Usuario, clinicaNombre: string) => void
}) {
  const [planes, setPlanes] = useState<Plan[]>([])
  const [nombre, setNombre] = useState('')
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [responsable, setResponsable] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [ciudad, setCiudad] = useState('Tarija')
  const [planId, setPlanId] = useState('')
  const [precio, setPrecio] = useState('')
  const [proximoCobro, setProximoCobro] = useState(() => {
    const d = new Date()
    d.setMonth(d.getMonth() + 1)
    return d.toISOString().slice(0, 10)
  })
  const [sucursalNombre, setSucursalNombre] = useState('')
  const [sucursalDireccion, setSucursalDireccion] = useState('')
  const [adminNombre, setAdminNombre] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [adminWhatsapp, setAdminWhatsapp] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listPlanes(true).then((activos) => {
      setPlanes(activos)
      if (activos[0]) {
        setPlanId(activos[0].id)
        setPrecio(String(activos[0].precio_mensual_bs))
      }
    })
  }, [])

  // El precio de lista es solo la propuesta: lo acordado puede ser otro.
  function elegirPlan(id: string) {
    setPlanId(id)
    const plan = planes.find((p) => p.id === id)
    if (plan) setPrecio(String(plan.precio_mensual_bs))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setGuardando(true)
    setError(null)
    const input: AltaClinicaInput = {
      nombre,
      logo_url: logoUrl,
      responsable,
      whatsapp,
      ciudad,
      plan_id: planId,
      precio_acordado_bs: Number(precio),
      proximo_cobro: proximoCobro,
      sucursalNombre,
      sucursalDireccion,
      adminNombre,
      adminEmail,
      // Si no se indicó otro, el administrador es el mismo responsable que contrató.
      adminWhatsapp: adminWhatsapp.trim() || whatsapp,
    }
    try {
      const { admin } = await crearClinica(input)
      onCreada(admin, nombre.trim())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo dar de alta la clínica')
      setGuardando(false)
    }
  }

  return (
    <Modal title="Nueva clínica" onClose={onClose} widthClassName="max-w-2xl">
      <form className="space-y-4" onSubmit={handleSubmit}>
        <Seccion titulo="Cuenta">
          <div className="grid gap-4 sm:grid-cols-2">
            <FieldGroup label="Nombre de la clínica">
              <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Veterinaria Sur" required />
            </FieldGroup>
            <FieldGroup label="Logo de la clínica">
              <div className="flex items-center gap-3">
                {logoUrl && (
                  <img src={logoUrl} alt="Logo" className="h-10 w-10 shrink-0 rounded-lg object-contain bg-slate-50 border border-slate-200" />
                )}
                <Input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) {
                      const reader = new FileReader()
                      reader.onloadend = () => setLogoUrl(reader.result as string)
                      reader.readAsDataURL(file)
                    }
                  }}
                  className="flex-1"
                />
              </div>
            </FieldGroup>
            <FieldGroup label="Ciudad">
              <Input value={ciudad} onChange={(e) => setCiudad(e.target.value)} />
            </FieldGroup>
            <FieldGroup label="Responsable">
              <Input
                value={responsable}
                onChange={(e) => setResponsable(e.target.value)}
                placeholder="Quién contrata"
                required
              />
            </FieldGroup>
            <FieldGroup label="WhatsApp de contacto">
              <Input
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                placeholder="+591 7…"
                required
              />
            </FieldGroup>
          </div>
        </Seccion>

        <Seccion titulo="Suscripción">
          <div className="grid gap-4 sm:grid-cols-3">
            <FieldGroup label="Plan">
              <Select value={planId} onChange={(e) => elegirPlan(e.target.value)}>
                {planes.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre} — {formatBs(p.precio_mensual_bs)}
                  </option>
                ))}
              </Select>
            </FieldGroup>
            <FieldGroup label="Precio acordado (Bs.)">
              <Input type="number" min="0" step="0.01" value={precio} onChange={(e) => setPrecio(e.target.value)} />
            </FieldGroup>
            <FieldGroup label="Próximo cobro">
              <Input type="date" value={proximoCobro} onChange={(e) => setProximoCobro(e.target.value)} />
            </FieldGroup>
          </div>
          {planes.length === 0 && (
            <p className="text-sm text-rose-600">
              No hay planes en oferta. Crea uno en la pantalla de Planes antes de dar de alta una clínica.
            </p>
          )}
        </Seccion>

        <Seccion titulo="Con qué arranca">
          <div className="grid gap-4 sm:grid-cols-2">
            <FieldGroup label="Primera sucursal">
              <Input
                value={sucursalNombre}
                onChange={(e) => setSucursalNombre(e.target.value)}
                placeholder="Ej. Sucursal Central"
                required
              />
            </FieldGroup>
            <FieldGroup label="Dirección">
              <Input value={sucursalDireccion} onChange={(e) => setSucursalDireccion(e.target.value)} />
            </FieldGroup>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FieldGroup label="Administrador de la clínica">
              <Input
                value={adminNombre}
                onChange={(e) => setAdminNombre(e.target.value)}
                placeholder="Quien gestionará el sistema"
                required
              />
            </FieldGroup>
            <FieldGroup label="Su correo (usuario de acceso)">
              <Input
                type="email"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                placeholder="admin@clinica.bo"
                required
              />
            </FieldGroup>
          </div>
          <FieldGroup label="Su WhatsApp">
            <Input
              value={adminWhatsapp}
              onChange={(e) => setAdminWhatsapp(e.target.value)}
              placeholder={whatsapp || '+591 7…'}
            />
          </FieldGroup>
          <p className="text-xs text-slate-500">
            La clínica nace con una sucursal y un administrador: sin ellos no puede agendar ni cobrar. Entrará con su
            correo, y la contraseña la crea él mismo con el enlace que le mandes por WhatsApp; si dejas su número en
            blanco se usa el de contacto.
          </p>
        </Seccion>

        {error && <p className="text-sm text-rose-600">{error}</p>}

        <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={guardando || planes.length === 0}>
            {guardando ? 'Creando…' : 'Dar de alta'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
