import { useCallback, useEffect, useState } from 'react'
import { Building2, Check, MessageCircle, Pencil, Plus, Sparkles, Users } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { FieldGroup, Input, Textarea } from '../../components/ui/Field'
import type { ModuloVetora } from '../../types/database'
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
  leerComoDataUri,
  setDatosDePago,
  setTipoCambio,
  TIPO_CAMBIO_POR_DEFECTO,
  type ConfiguracionPlataforma,
} from '../../services/configuracion'
import { getDatosDePago } from '../../services/facturacion'
import { formatBs, formatUsd, usdABs } from '../../lib/currency'
import { formatClinicDate } from '../../lib/datetime'
import type { Database } from '../../types/supabase'

type Plan = Database['public']['Tables']['planes']['Row'] & { uso_clinicas?: number }

/**
 * Todos los módulos que se pueden contratar, con su rótulo.
 *
 * ⚠️ Tiene que cubrir **todos** los valores de `ModuloVetora`. Un módulo que
 * exista en el tipo pero no esté aquí no se puede marcar en ningún plan, y sus
 * pantallas quedan inalcanzables por muy construidas que estén: `ModuloRoute`
 * rebota a `/agenda` sin él. Le pasó a `peluqueria` y `petshop` —26 páginas sin
 * ninguna puerta— y antes a `catalogo`.
 *
 * Vive a nivel de módulo, no dentro del formulario, porque lo usan las dos
 * cosas: las casillas del editor y las insignias de la tarjeta de cada plan.
 */
const MODULOS: { key: ModuloVetora; label: string }[] = [
  { key: 'agenda', label: 'Agenda' },
  { key: 'caja', label: 'Caja' },
  { key: 'inventario', label: 'Inventario' },
  { key: 'historial_clinico', label: 'Historial Clínico (SOAP)' },
  { key: 'internacion', label: 'Internación' },
  { key: 'asistente_ia', label: 'Asistente IA' },
  { key: 'portal_cliente', label: 'Portal del Cliente' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'metricas', label: 'Métricas' },
  { key: 'catalogo', label: 'Catálogo' },
  { key: 'peluqueria', label: 'Peluquería (panel propio)' },
  { key: 'petshop', label: 'Pet Shop (panel propio)' },
  { key: 'fichas', label: 'Clientes y Pacientes' },
  { key: 'servicios', label: 'Catálogo de tarifas' },
]

const MODULO_LABEL: Record<string, string> = Object.fromEntries(
  MODULOS.map((m) => [m.key, m.label]),
)

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

      {/* El QR vive junto al tipo de cambio: los dos son la configuración de
          cobro, y los dos los mira el admin de la clínica en su Facturación. */}
      <CobroCard />

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
                {/* Solo si el módulo está marcado: un cupo sin el módulo no
                    sirve de nada, y mostrarlo igual sugeriría que sí. */}
                {p.modulos_habilitados.includes('asistente_ia') && (
                  <div className="flex items-center gap-2">
                    <Sparkles size={13} className="text-slate-400" />
                    {p.ia_limite_redaccion} avisos + {p.ia_limite_copiloto} consultas a Vetora AI al mes
                  </div>
                )}
              </dl>

              {/* Los módulos no se veían en ninguna parte, y por eso este fallo
                  fue indiagnosticable: se crearon los planes de peluquería y
                  petshop, no cambió nada, y no había dónde mirar para descubrir
                  que les faltaba su propio módulo. */}
              <div className="mt-3 border-t border-slate-100 pt-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Módulos</p>
                {p.modulos_habilitados.length === 0 ? (
                  <p className="mt-1.5 text-xs font-semibold text-rose-600">
                    Ninguno: quien lo contrate se queda sin las secciones del menú.
                  </p>
                ) : (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {p.modulos_habilitados.map((m) => (
                      <Badge key={m} tone="slate" size="sm">
                        {MODULO_LABEL[m] ?? m}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

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

/**
 * El QR de cobro y los datos de la cuenta, que la clínica ve en Facturación.
 *
 * No hay pasarela de pago: esto ES el método de cobro. Si aquí no hay nada, la
 * pantalla de la clínica se lo dice y no puede pagar.
 */
function CobroCard() {
  const [qr, setQr] = useState<string | null>(null)
  const [datos, setDatos] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  useEffect(() => {
    getDatosDePago()
      .then((d) => {
        setQr(d.qr_pago)
        setDatos(d.datos_pago)
      })
      .catch(() => {
        /* Sin configurar todavía: los campos se quedan vacíos, que es correcto. */
      })
  }, [])

  async function elegirQr(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0]
    e.target.value = ''
    if (!archivo) return
    setError(null)
    try {
      setQr(await leerComoDataUri(archivo))
      setAviso(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo leer la imagen')
    }
  }

  async function guardar() {
    setGuardando(true)
    setError(null)
    setAviso(null)
    try {
      await setDatosDePago(qr, datos)
      setAviso('Datos de cobro guardados')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron guardar')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Card className="border border-slate-200/60">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Cómo te pagan</p>

      <div className="mt-3 grid gap-5 md:grid-cols-2">
        <div className="space-y-3">
          {qr ? (
            <img
              src={qr}
              alt="QR de cobro"
              className="mx-auto w-full max-w-[220px] rounded-xl border border-slate-200 bg-white p-3"
            />
          ) : (
            <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">
              Todavía no has subido el QR. Sin él, las clínicas no tienen cómo pagarte.
            </p>
          )}
          <FieldGroup label="Imagen del QR">
            <Input type="file" accept="image/*" onChange={elegirQr} />
            {/* Sin recomprimir: un JPEG con pérdida sobre un código de barras es
                pedir que un día no escanee. */}
            <p className="mt-1 text-xs text-slate-500">
              Se guarda tal cual, sin recomprimir, para que siga escaneándose. Recórtala al código.
            </p>
          </FieldGroup>
          {qr && (
            <Button variant="secondary" size="sm" onClick={() => setQr(null)}>
              Quitar el QR
            </Button>
          )}
        </div>

        <div className="space-y-3">
          <FieldGroup label="Datos de la cuenta">
            <Textarea
              value={datos}
              onChange={(e) => setDatos(e.target.value)}
              rows={6}
              placeholder={'Banco Unión\nCuenta 10000123456\nTitular: …\nNIT: …'}
            />
          </FieldGroup>
          <p className="text-xs text-slate-500">
            Esto es lo que ve el administrador de cada clínica en su pantalla de Facturación, junto al QR.
          </p>
          {error && <p className="text-sm text-rose-600">{error}</p>}
          {aviso && <p className="text-sm text-emerald-700">{aviso}</p>}
          <Button onClick={guardar} disabled={guardando}>
            <Check size={14} /> {guardando ? 'Guardando…' : 'Guardar datos de cobro'}
          </Button>
        </div>
      </div>
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
  // 0 por defecto en un plan nuevo, a propósito: sin el módulo `asistente_ia`
  // marcado abajo tampoco importa, y así nadie regala cupo sin haberlo
  // decidido — mismo criterio que `ia_limite` nació en 0038.
  const [iaRedaccion, setIaRedaccion] = useState(plan ? String(plan.ia_limite_redaccion) : '0')
  const [iaCopiloto, setIaCopiloto] = useState(plan ? String(plan.ia_limite_copiloto) : '0')
  const [modulos, setModulos] = useState<ModuloVetora[]>(
    (plan?.modulos_habilitados as ModuloVetora[] | undefined) ?? ['agenda', 'caja', 'inventario', 'portal_cliente', 'whatsapp']
  )
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const TODOS_MODULOS = MODULOS

  function toggleModulo(modulo: ModuloVetora) {
    setModulos((prev) =>
      prev.includes(modulo) ? prev.filter((m) => m !== modulo) : [...prev, modulo]
    )
  }

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
      modulos_habilitados: modulos,
      ia_limite_redaccion: Number(iaRedaccion),
      ia_limite_copiloto: Number(iaCopiloto),
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

        <FieldGroup label="Módulos habilitados">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {TODOS_MODULOS.map(({ key, label }) => (
              <label key={key} className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs hover:border-teal-400 hover:bg-teal-50/30">
                <input
                  type="checkbox"
                  checked={modulos.includes(key)}
                  onChange={() => toggleModulo(key)}
                  className="accent-teal-600"
                />
                {label}
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Solo los módulos marcados estarán disponibles para las clínicas con este plan.
          </p>
        </FieldGroup>

        {/* Solo tiene sentido si el módulo está marcado arriba: configurar un
            cupo que nadie puede usar todavía confundiría más que ayudar. */}
        {modulos.includes('asistente_ia') && (
          <FieldGroup label="Cupo mensual de IA">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Input type="number" min="0" value={iaRedaccion} onChange={(e) => setIaRedaccion(e.target.value)} />
                <p className="mt-1 text-[11px] text-slate-500">Avisos e informes redactados (Haiku)</p>
              </div>
              <div>
                <Input type="number" min="0" value={iaCopiloto} onChange={(e) => setIaCopiloto(e.target.value)} />
                <p className="mt-1 text-[11px] text-slate-500">Preguntas a Vetora AI (Sonnet)</p>
              </div>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Dos cupos separados: cuestan distinto, y así uno no se come el del otro. En 0, esa función no
              corre aunque el módulo esté marcado.
            </p>
          </FieldGroup>
        )}

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
