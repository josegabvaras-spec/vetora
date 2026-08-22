import { useEffect, useState } from 'react'
import {
  Ban,
  Building2,
  CheckCircle2,
  Database,
  Download,
  MessageCircle,
  Plus,
  RotateCcw,
  Upload,
  Users,
} from 'lucide-react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Seccion } from '../../components/ui/Seccion'
import { FieldGroup, Input, Select } from '../../components/ui/Field'
import { useTable } from '../../mocks/useDb'
import {
  actualizarClinica,
  alternarActivoUsuario,
  cambiarEstadoClinica,
  crearSucursal,
  crearUsuario,
  marcarCobroAlDia,
  marcarEnMora,
  reiniciarCuotaWhatsapp,
  type DatosClinica,
} from '../../services/plataforma'
import { listPlanes } from '../../services/planes'
import { exportarClinica, importarEnClinica } from '../../services/respaldoPlataforma'
import { estadoDeLaCuenta } from '../../lib/acceso'
import { ultimasInvitacionesDe } from '../../services/invitaciones'
import { EnviarAccesoModal } from './EnviarAccesoModal'
import { getConfiguracion, TIPO_CAMBIO_POR_DEFECTO } from '../../services/configuracion'
import { formatBs, formatUsd, usdABs } from '../../lib/currency'
import { formatClinicDate } from '../../lib/datetime'
import type { Invitacion, Plan, Rol, Usuario } from '../../types/database'
import type { ClinicaConDetalle } from '../../types/views'

const ROL_LABEL: Record<string, string> = {
  admin: 'Administrador',
  veterinario: 'Veterinario',
  recepcion: 'Recepción',
}


/** Un mes después de la fecha dada, en formato yyyy-MM-dd. */
function unMesDespues(fecha: string): string {
  const d = new Date(`${fecha}T12:00:00Z`)
  d.setMonth(d.getMonth() + 1)
  return d.toISOString().slice(0, 10)
}

export function ClinicaDetalleModal({
  clinica,
  onClose,
  onChanged,
}: {
  clinica: ClinicaConDetalle
  onClose: () => void
  onChanged: () => void
}) {
  const sucursales = useTable('sucursales').filter((s) => s.clinica_id === clinica.id)
  // Suscripción para que el estado del acceso se refresque al generarlo o enviarlo.
  const invitacionesTabla = useTable('invitaciones')
  const [planes, setPlanes] = useState<Plan[]>([])
  const [error, setError] = useState<string | null>(null)
  /** Hay una acción en vuelo: evita dobles altas por doble clic. */
  const [ocupado, setOcupado] = useState(false)
  /** Última invitación por usuario, resuelta de una vez para todo el listado. */
  const [invitaciones, setInvitaciones] = useState<Map<string, Invitacion>>(new Map())

  // Datos de la cuenta
  const [nombre, setNombre] = useState(clinica.nombre)
  const [logoUrl, setLogoUrl] = useState<string | null | undefined>(clinica.logo_url)
  const [responsable, setResponsable] = useState(clinica.responsable)
  const [whatsapp, setWhatsapp] = useState(clinica.whatsapp)
  const [ciudad, setCiudad] = useState(clinica.ciudad)
  const [planId, setPlanId] = useState(clinica.plan_id)
  const [precio, setPrecio] = useState(String(clinica.precio_acordado_usd))
  const [proximoCobro, setProximoCobro] = useState(clinica.proximo_cobro)
  const [guardando, setGuardando] = useState(false)

  // Altas dentro de la clínica
  const [sucursalNombre, setSucursalNombre] = useState('')
  const [sucursalDireccion, setSucursalDireccion] = useState('')
  const [usuarioNombre, setUsuarioNombre] = useState('')
  const [usuarioEmail, setUsuarioEmail] = useState('')
  const [usuarioWhatsapp, setUsuarioWhatsapp] = useState('')
  const [usuarioRol, setUsuarioRol] = useState<Rol>('veterinario')
  const [usuarioSucursal, setUsuarioSucursal] = useState('')
  const [enviandoAcceso, setEnviandoAcceso] = useState<Usuario | null>(null)

  // El precio acordado está en dólares; esto es lo que hace falta para decir
  // cuánto se le pide de verdad a la clínica, que paga en bolivianos.
  const [tipoCambio, setTipoCambio] = useState(TIPO_CAMBIO_POR_DEFECTO)

  useEffect(() => {
    // Sin el `catch`, un fallo dejaba el selector de plan vacío y parecía que
    // la plataforma no tenía ninguno dado de alta.
    listPlanes()
      .then(setPlanes)
      .catch((err) => setError(err instanceof Error ? err.message : 'No se pudieron cargar los planes'))
    getConfiguracion()
      .then((cfg) => setTipoCambio(cfg.tipo_cambio_usd))
      .catch(() => setTipoCambio(TIPO_CAMBIO_POR_DEFECTO))
  }, [])

  const [respaldando, setRespaldando] = useState(false)
  const [errorRespaldo, setErrorRespaldo] = useState<string | null>(null)
  const [avisoRespaldo, setAvisoRespaldo] = useState<string | null>(null)

  async function exportar() {
    setRespaldando(true)
    setErrorRespaldo(null)
    setAvisoRespaldo(null)
    try {
      await exportarClinica(clinica.id)
      setAvisoRespaldo('Respaldo descargado')
    } catch (err) {
      setErrorRespaldo(err instanceof Error ? err.message : 'No se pudo exportar')
    } finally {
      setRespaldando(false)
    }
  }

  async function importar(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0]
    // Se limpia siempre: sin esto, reintentar con el mismo archivo no dispara
    // `change` y parece que el botón dejó de responder.
    e.target.value = ''
    if (!archivo) return

    setRespaldando(true)
    setErrorRespaldo(null)
    setAvisoRespaldo(null)
    try {
      await importarEnClinica(clinica.id, archivo)
      setAvisoRespaldo('Datos importados en esta clínica')
      onChanged()
    } catch (err) {
      setErrorRespaldo(err instanceof Error ? err.message : 'No se pudo importar')
    } finally {
      setRespaldando(false)
    }
  }

  // Una sola consulta para todo el listado, y se rehace cuando la tabla de
  // invitaciones cambia (al generar o enviar un acceso).
  useEffect(() => {
    let montado = true
    ultimasInvitacionesDe(clinica.usuarios.map((u) => u.id))
      .then((mapa) => { if (montado) setInvitaciones(mapa) })
      .catch((err) => { if (montado) setError(err instanceof Error ? err.message : 'No se pudieron leer los accesos') })
    return () => { montado = false }
  }, [clinica.usuarios, invitacionesTabla])

  /**
   * Puerta única de todas las acciones del modal.
   *
   * El guard de `ocupado` no es cosmético: ninguno de los botones que pasan por
   * aquí se deshabilitaba mientras la llamada estaba en vuelo, así que un doble
   * clic en "Agregar sucursal" o "Agregar usuario" creaba dos, y en el caso del
   * usuario la segunda alta moría con "User already registered" dejando una
   * cuenta de Auth suelta.
   */
  async function ejecutar(accion: () => Promise<unknown>) {
    if (ocupado) return
    setOcupado(true)
    setError(null)
    try {
      await accion()
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo completar la acción')
    } finally {
      setOcupado(false)
    }
  }

  async function guardarCuenta() {
    setGuardando(true)
    const datos: DatosClinica = {
      nombre,
      logo_url: logoUrl,
      responsable,
      whatsapp,
      ciudad,
      plan_id: planId,
      precio_acordado_usd: Number(precio),
      proximo_cobro: proximoCobro,
    }
    await ejecutar(() => actualizarClinica(clinica.id, datos))
    setGuardando(false)
  }

  const suspendida = clinica.estado === 'suspendida'

  return (
    <Modal title={clinica.nombre} onClose={onClose} widthClassName="max-w-3xl">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={suspendida ? 'rose' : 'emerald'}>{suspendida ? 'Suspendida' : 'Activa'}</Badge>
            <Badge tone={clinica.estado_pago === 'al_dia' ? 'emerald' : 'rose'}>
              {clinica.estado_pago === 'al_dia' ? 'Al día' : 'En mora'}
            </Badge>
            <span className="text-xs text-slate-500">
              Alta el {formatClinicDate(`${clinica.fecha_alta}T12:00:00Z`)} · {clinica.total_pacientes} pacientes ·{' '}
              {clinica.total_citas} citas
            </span>
          </div>
          <Button
            variant={suspendida ? 'success' : 'danger'}
            className="px-3 py-1.5 text-xs"
            onClick={() => ejecutar(() => cambiarEstadoClinica(clinica.id, suspendida ? 'activa' : 'suspendida'))}
          >
            {suspendida ? <CheckCircle2 size={14} /> : <Ban size={14} />}
            {suspendida ? 'Reactivar cuenta' : 'Suspender cuenta'}
          </Button>
        </div>

        {suspendida && (
          <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
            Mientras esté suspendida, sus usuarios no pueden entrar al sistema. Los datos se conservan intactos.
          </p>
        )}

        <Seccion titulo="Cuenta y suscripción">
          <div className="grid gap-4 sm:grid-cols-2">
            <FieldGroup label="Nombre">
              <Input value={nombre} onChange={(e) => setNombre(e.target.value)} />
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
              <Input value={responsable} onChange={(e) => setResponsable(e.target.value)} />
            </FieldGroup>
            <FieldGroup label="WhatsApp">
              <Input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} />
            </FieldGroup>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <FieldGroup label="Plan">
              <Select value={planId} onChange={(e) => setPlanId(e.target.value)}>
                {planes.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre} — {formatUsd(p.precio_mensual_usd)}
                    {p.activo ? '' : ' (retirado)'}
                  </option>
                ))}
              </Select>
            </FieldGroup>
            <FieldGroup label="Precio acordado (USD)">
              <Input type="number" min="0" step="0.01" value={precio} onChange={(e) => setPrecio(e.target.value)} />
              {precio !== '' && Number.isFinite(Number(precio)) && (
                <p className="mt-1 text-xs text-slate-500">
                  Cobras ≈ {formatBs(usdABs(Number(precio), tipoCambio))} al mes.
                </p>
              )}
            </FieldGroup>
            <FieldGroup label="Próximo cobro">
              <Input type="date" value={proximoCobro} onChange={(e) => setProximoCobro(e.target.value)} />
            </FieldGroup>
          </div>

          <p className="text-xs text-slate-500">
            Precio de lista del plan: {formatUsd(clinica.precio_lista_usd)}. La suscripción se fija en dólares y se
            cobra al cambio vigente (USD 1 = {formatBs(tipoCambio)}), que se ajusta en Planes. Bajar de plan se
            rechaza si la clínica ya supera los topes del nuevo.
          </p>

          <div className="flex flex-wrap justify-end gap-2">
            {clinica.estado_pago === 'en_mora' ? (
              <Button
                variant="success"
                className="px-3 py-1.5 text-xs"
                onClick={() => ejecutar(() => marcarCobroAlDia(clinica.id, unMesDespues(clinica.proximo_cobro)))}
              >
                <CheckCircle2 size={14} /> Registrar cobro del mes
              </Button>
            ) : (
              <Button
                variant="secondary"
                className="px-3 py-1.5 text-xs"
                onClick={() => ejecutar(() => marcarEnMora(clinica.id))}
              >
                Marcar en mora
              </Button>
            )}
            <Button onClick={guardarCuenta} disabled={guardando} className="px-3 py-1.5 text-xs">
              {guardando ? 'Guardando…' : 'Guardar cambios'}
            </Button>
          </div>
        </Seccion>

        <Seccion titulo="Respaldo de datos" icono={<Database size={13} className="text-teal-600" />}>
          <p className="text-xs text-slate-500">
            Un ZIP con un CSV por tabla (separados por punto y coma, para que Excel los abra en columnas) y las
            fotos de los pacientes. Al importar, las filas se fusionan por id: se actualiza lo que coincide y se
            agrega lo nuevo, no se borra nada.
          </p>
          <p className="mt-1 text-[11px] text-amber-700">
            Los estudios de imagen no entran en el respaldo: viven en el almacenamiento, aparte.
          </p>

          {errorRespaldo && <p className="mt-2 text-xs font-bold text-rose-600">{errorRespaldo}</p>}
          {avisoRespaldo && <p className="mt-2 text-xs font-semibold text-emerald-700">{avisoRespaldo}</p>}

          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <Button
              variant="secondary"
              className="px-3 py-1.5 text-xs"
              disabled={respaldando}
              onClick={exportar}
            >
              <Download size={14} /> {respaldando ? 'Preparando…' : 'Exportar datos'}
            </Button>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50">
              <Upload size={14} />
              {respaldando ? 'Importando…' : 'Importar ZIP'}
              <input type="file" accept=".zip" className="hidden" onChange={importar} disabled={respaldando} />
            </label>
          </div>
        </Seccion>

        <Seccion
          titulo={`Recordatorios de WhatsApp (${clinica.limites.whatsapp.usados}/${clinica.limites.whatsapp.maximo})`}
          icono={<MessageCircle size={13} className="text-teal-600" />}
        >
          <p className="text-xs text-slate-500">
            El tope es mensual y lo fija el plan. El contador no se reinicia a medianoche del día 1: lo reinicia el
            primer envío del mes nuevo.
          </p>
          <div className="mt-3 flex justify-end">
            <Button
              variant="secondary"
              className="px-3 py-1.5 text-xs"
              onClick={() => ejecutar(() => reiniciarCuotaWhatsapp(clinica.id))}
            >
              <RotateCcw size={14} /> Reiniciar contador del mes
            </Button>
          </div>
        </Seccion>

        <Seccion
          titulo={`Sucursales (${clinica.limites.sucursales.usados}/${clinica.limites.sucursales.maximo})`}
          icono={<Building2 size={13} className="text-teal-600" />}
        >
          <ul className="space-y-1.5">
            {sucursales.map((s) => (
              <li key={s.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                <p className="text-sm font-semibold text-slate-800">{s.nombre}</p>
                <p className="text-xs text-slate-500">{s.direccion || 'Sin dirección'}</p>
              </li>
            ))}
          </ul>

          <div className="flex flex-col gap-3 border-t border-slate-200 pt-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <FieldGroup label="Nueva sucursal">
                <Input
                  value={sucursalNombre}
                  onChange={(e) => setSucursalNombre(e.target.value)}
                  placeholder="Nombre"
                />
              </FieldGroup>
            </div>
            <div className="flex-1">
              <FieldGroup label="Dirección">
                <Input
                  value={sucursalDireccion}
                  onChange={(e) => setSucursalDireccion(e.target.value)}
                  placeholder="Calle y número"
                />
              </FieldGroup>
            </div>
            <Button
              variant="secondary"
              disabled={ocupado || !sucursalNombre.trim()}
              onClick={async () => {
                await ejecutar(() => crearSucursal(clinica.id, sucursalNombre, sucursalDireccion))
                setSucursalNombre('')
                setSucursalDireccion('')
              }}
            >
              <Plus size={14} /> Agregar
            </Button>
          </div>
        </Seccion>

        <Seccion
          titulo={`Usuarios (${clinica.limites.usuarios.usados}/${clinica.limites.usuarios.maximo})`}
          icono={<Users size={13} className="text-teal-600" />}
        >
          <ul className="space-y-1.5">
            {clinica.usuarios.map((u) => (
              <li
                key={u.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2"
              >
                <div className="min-w-0">
                  <p className={u.activo ? 'text-sm font-semibold text-slate-800' : 'text-sm font-semibold text-slate-400'}>
                    {u.nombre}
                  </p>
                  <p className="text-xs text-slate-500">
                    {ROL_LABEL[u.rol]} ·{' '}
                    {u.sucursal_id ? sucursales.find((s) => s.id === u.sucursal_id)?.nombre : 'Todas las sucursales'}
                  </p>
                  <p className="font-mono text-[11px] text-slate-400">
                    {u.email} · {u.whatsapp}
                  </p>
                  <p
                    className={
                      estadoDeLaCuenta(invitaciones.get(u.id)).activa
                        ? 'mt-0.5 text-[11px] font-semibold text-emerald-600'
                        : 'mt-0.5 text-[11px] font-semibold text-amber-600'
                    }
                  >
                    {estadoDeLaCuenta(invitaciones.get(u.id)).texto}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {!u.activo && (
                    <Badge tone="slate" size="sm">
                      Desactivado
                    </Badge>
                  )}
                  {u.activo && (
                    <Button
                      variant="secondary"
                      className="px-3 py-1.5 text-xs"
                      onClick={() => setEnviandoAcceso(u)}
                    >
                      <MessageCircle size={13} /> Enviar acceso
                    </Button>
                  )}
                  <Button
                    variant={u.activo ? 'secondary' : 'success'}
                    className="px-3 py-1.5 text-xs"
                    onClick={() => ejecutar(() => alternarActivoUsuario(u.id))}
                  >
                    {u.activo ? 'Desactivar' : 'Activar'}
                  </Button>
                </div>
              </li>
            ))}
          </ul>

          <div className="flex flex-col gap-3 border-t border-slate-200 pt-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <FieldGroup label="Nuevo usuario">
                <Input
                  value={usuarioNombre}
                  onChange={(e) => setUsuarioNombre(e.target.value)}
                  placeholder="Nombre y apellido"
                />
              </FieldGroup>
            </div>
            <div className="flex-1">
              <FieldGroup label="Correo">
                <Input
                  type="email"
                  value={usuarioEmail}
                  onChange={(e) => setUsuarioEmail(e.target.value)}
                  placeholder="persona@clinica.bo"
                />
              </FieldGroup>
            </div>
            <div className="sm:w-40">
              <FieldGroup label="WhatsApp">
                <Input
                  value={usuarioWhatsapp}
                  onChange={(e) => setUsuarioWhatsapp(e.target.value)}
                  placeholder="+591 7…"
                />
              </FieldGroup>
            </div>
            <div className="sm:w-40">
              <FieldGroup label="Rol">
                <Select value={usuarioRol} onChange={(e) => setUsuarioRol(e.target.value as Rol)}>
                  <option value="admin">Administrador</option>
                  <option value="veterinario">Veterinario</option>
                  <option value="recepcion">Recepción</option>
                </Select>
              </FieldGroup>
            </div>
            <div className="sm:w-44">
              <FieldGroup label="Sucursal">
                <Select value={usuarioSucursal} onChange={(e) => setUsuarioSucursal(e.target.value)}>
                  <option value="">Todas</option>
                  {sucursales.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nombre}
                    </option>
                  ))}
                </Select>
              </FieldGroup>
            </div>
            <Button
              variant="secondary"
              // `ocupado`: este botón no pasa por `ejecutar` (necesita el usuario
              // devuelto para abrir el envío de acceso), así que el guard va aquí.
              disabled={ocupado || !usuarioNombre.trim() || !usuarioWhatsapp.trim() || !usuarioEmail.trim()}
              onClick={async () => {
                if (ocupado) return
                setOcupado(true)
                setError(null)
                try {
                  // Se crea y se ofrece el envío del acceso en el mismo gesto.
                  const nuevo = await crearUsuario(clinica.id, {
                    nombre: usuarioNombre,
                    email: usuarioEmail,
                    whatsapp: usuarioWhatsapp,
                    rol: usuarioRol,
                    sucursal_id: usuarioSucursal || null,
                  })
                  setUsuarioNombre('')
                  setUsuarioEmail('')
                  setUsuarioWhatsapp('')
                  onChanged()
                  setEnviandoAcceso(nuevo)
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'No se pudo crear el usuario')
                } finally {
                  setOcupado(false)
                }
              }}
            >
              <Plus size={14} /> Agregar
            </Button>
          </div>
          <p className="text-xs text-slate-500">
            El correo es su usuario para entrar; el WhatsApp, por donde recibe el enlace con el que crea su
            contraseña. Ambos son obligatorios.
          </p>
        </Seccion>

        {error && <p className="text-sm font-bold text-rose-600">{error}</p>}

        <div className="flex justify-end border-t border-slate-200 pt-4">
          <Button variant="secondary" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </div>

      {enviandoAcceso && (
        <EnviarAccesoModal
          usuario={enviandoAcceso}
          clinicaNombre={clinica.nombre}
          onClose={() => {
            setEnviandoAcceso(null)
            onChanged()
          }}
        />
      )}
    </Modal>
  )
}
