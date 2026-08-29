import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  IdCard,
  Link2,
  MessageCircle,
  PawPrint,
  Search,
  Smartphone,
  Unlink,
} from 'lucide-react'
import { AvisoError } from '../components/ui/AvisoError'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Field'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { useAuth } from '../context/useAuth'
import { useSuscripcionTabla } from '../mocks/useDb'
import {
  desvincularCuentaPortal,
  listClientesDeClinica,
  sugerenciasDeVinculo,
  vincularPorIds,
  type ClienteConEstado,
  type SugerenciaVinculo,
} from '../services/clientesPacientes'

/**
 * Los dueños de la clínica.
 *
 * Existe por un hueco real: `/pacientes` lista mascotas, así que un dueño sin
 * mascotas —justo lo que queda cuando el registro del portal no logra
 * vincularse con su ficha— no aparecía en ninguna pantalla del sistema. Sin
 * verlo, nadie podía arreglarlo.
 */
export function ClientesPage() {
  const { usuario } = useAuth()
  const [clientes, setClientes] = useState<ClienteConEstado[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [vinculando, setVinculando] = useState<SugerenciaVinculo | null>(null)
  const [desvinculando, setDesvinculando] = useState<ClienteConEstado | null>(null)
  const [enCurso, setEnCurso] = useState(false)

  const revisionClientes = useSuscripcionTabla('clientes')
  const clinicaId = usuario?.clinica_id

  const recargar = useCallback(async () => {
    if (!clinicaId) return
    setClientes(await listClientesDeClinica(clinicaId))
  }, [clinicaId])

  useEffect(() => {
    setErrorCarga(null)
    recargar().catch((err) =>
      setErrorCarga(err instanceof Error ? err.message : 'No se pudieron cargar los clientes'),
    )
  }, [recargar, revisionClientes])

  if (!clinicaId) return null

  const sugerencias = sugerenciasDeVinculo(clientes)
  const sueltasSinSugerencia = clientes.filter(
    (c) => c.usuario_id && c.total_pacientes === 0 && !sugerencias.some((s) => s.cuenta.id === c.id),
  )

  const termino = busqueda.trim().toLowerCase()
  const filtrados = termino
    ? clientes.filter(
        (c) =>
          c.nombre.toLowerCase().includes(termino) ||
          c.whatsapp.toLowerCase().includes(termino) ||
          (c.ci ?? '').toLowerCase().includes(termino) ||
          (c.email ?? '').toLowerCase().includes(termino),
      )
    : clientes

  return (
    <div className="space-y-5">
      <AvisoError mensaje={errorCarga} />

      <div>
        <h1 className="font-display text-xl font-bold text-slate-900">Clientes</h1>
        <p className="mt-0.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Los dueños registrados en la clínica
        </p>
      </div>

      {/* Lo que hay que resolver va arriba: son las cuentas que el dueño creó
          en el portal y que no encontraron su ficha. */}
      {sugerencias.length > 0 && (
        <Card className="border border-amber-200 bg-amber-50/60">
          <p className="flex items-center gap-2 text-sm font-bold text-amber-900">
            <AlertTriangle size={16} />
            {sugerencias.length === 1
              ? 'Una cuenta del portal parece ser de un cliente que ya tienes'
              : `${sugerencias.length} cuentas del portal parecen ser de clientes que ya tienes`}
          </p>
          <p className="mt-1 text-xs text-amber-800">
            El registro no pudo unirlas solo. Revisa que sea la misma persona antes de hacerlo: al unirlas, verá el
            historial y las vacunas de esas mascotas desde su celular.
          </p>

          <ul className="mt-3 space-y-2">
            {sugerencias.map((s) => (
              <li
                key={s.cuenta.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-white px-3 py-2.5"
              >
                <div className="min-w-0 text-sm">
                  <p className="font-semibold text-slate-900">
                    {s.cuenta.nombre} <span className="font-normal text-slate-400">se registró en el portal</span>
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {s.cuenta.email} · {s.cuenta.whatsapp}
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-teal-700">
                    <Link2 size={13} /> Sería «{s.posible.nombre}», con {s.posible.total_pacientes} mascota(s)
                  </p>
                  {/* Qué casó exactamente: no es lo mismo aprobar una
                      coincidencia de carnet que una de teléfono. */}
                  {/* Qué casó exactamente, y con cuánta fuerza: aprobar una
                      coincidencia de carnet Y teléfono no es lo mismo que
                      aprobar una de un solo dato. */}
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    {s.coincide === 'ci_y_whatsapp'
                      ? 'Coinciden el carnet y el WhatsApp'
                      : s.coincide === 'ci'
                        ? 'Coincide solo el carnet de identidad'
                        : 'Coincide solo el WhatsApp'}
                  </p>
                </div>
                <Button className="px-3 py-1.5 text-xs" onClick={() => setVinculando(s)}>
                  Vincular
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {sueltasSinSugerencia.length > 0 && (
        <Card className="border border-slate-200">
          <p className="text-sm font-semibold text-slate-800">
            {sueltasSinSugerencia.length} cuenta(s) del portal sin mascotas
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Ni su carnet ni su WhatsApp coinciden con ninguna ficha sin dueño. Puede que se registraran eligiendo
            otra clínica, o con los datos escritos de otra forma. Si son clientes tuyos, abre la ficha de su mascota
            y usa «Vincular cuenta del portal» con su correo.
          </p>
          <ul className="mt-2 space-y-1 text-xs text-slate-500">
            {sueltasSinSugerencia.map((c) => (
              <li key={c.id} className="font-mono">
                {c.nombre} · {c.email} · {c.whatsapp}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="relative max-w-sm">
        <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <Input
          className="pl-8"
          placeholder="Buscar por nombre, CI, WhatsApp o correo…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
      </div>

      <ul className="space-y-2">
        {filtrados.map((c) => (
          <li
            key={c.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-bold text-slate-900">{c.nombre}</p>
                {c.usuario_id ? (
                  <Badge tone="emerald" size="sm">
                    <Smartphone size={11} /> Portal
                  </Badge>
                ) : (
                  <Badge tone="slate" size="sm">
                    Sin cuenta
                  </Badge>
                )}
                {c.total_pacientes === 0 && (
                  <Badge tone="amber" size="sm">
                    Sin mascotas
                  </Badge>
                )}
              </div>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
                <span className="flex items-center gap-1">
                  <MessageCircle size={12} /> {c.whatsapp}
                </span>
                {c.ci && (
                  <span className="flex items-center gap-1">
                    <IdCard size={12} /> CI {c.ci}
                  </span>
                )}
                {c.email && <span className="font-mono">{c.email}</span>}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                <PawPrint size={13} className="text-slate-400" />
                {c.total_pacientes} mascota(s)
              </span>
              {/* La reparación de un vínculo mal hecho. Antes no existía: la
                  única forma de soltarlo era borrar la cuenta entera. */}
              {c.usuario_id && (
                <Button
                  variant="secondary"
                  className="px-3 py-1.5 text-xs"
                  onClick={() => setDesvinculando(c)}
                >
                  <Unlink size={13} /> Desvincular
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>

      {filtrados.length === 0 && (
        <Card className="border border-dashed border-slate-300 py-10 text-center">
          <p className="text-sm text-slate-400">
            {busqueda ? 'Ningún cliente coincide con la búsqueda.' : 'Todavía no hay clientes registrados.'}
          </p>
          {!busqueda && (
            <Link to="/pacientes" className="mt-2 inline-block text-sm font-semibold text-teal-600 hover:underline">
              Registrar el primero desde Pacientes
            </Link>
          )}
        </Card>
      )}

      {vinculando && (
        <ConfirmDialog
          title="Unir la cuenta del portal"
          description={`«${vinculando.cuenta.nombre}» (${vinculando.cuenta.email}) pasará a ver el historial, las vacunas y las recetas de las ${vinculando.posible.total_pacientes} mascota(s) de «${vinculando.posible.nombre}». Confirma que es la misma persona. Si te equivocas, puedes deshacerlo con «Desvincular».`}
          confirmLabel="Sí, es la misma persona"
          loading={enCurso}
          onCancel={() => setVinculando(null)}
          onConfirm={async () => {
            setEnCurso(true)
            setErrorCarga(null)
            try {
              await vincularPorIds(vinculando.posible.id, vinculando.cuenta.id)
              setVinculando(null)
              await recargar()
            } catch (err) {
              setErrorCarga(err instanceof Error ? err.message : 'No se pudo vincular la cuenta')
            } finally {
              setEnCurso(false)
            }
          }}
        />
      )}

      {desvinculando && (
        <ConfirmDialog
          title="Desvincular la cuenta del portal"
          description={`«${desvinculando.email ?? desvinculando.nombre}» dejará de ver el historial, las vacunas y las recetas de las ${desvinculando.total_pacientes} mascota(s) de esta ficha. La mascota y su expediente NO se borran: siguen aquí, y la cuenta vuelve a quedar libre para vincularla con la ficha correcta.`}
          confirmLabel="Sí, desvincular"
          loading={enCurso}
          onCancel={() => setDesvinculando(null)}
          onConfirm={async () => {
            setEnCurso(true)
            setErrorCarga(null)
            try {
              await desvincularCuentaPortal(desvinculando.id)
              setDesvinculando(null)
              await recargar()
            } catch (err) {
              setErrorCarga(err instanceof Error ? err.message : 'No se pudo desvincular la cuenta')
            } finally {
              setEnCurso(false)
            }
          }}
        />
      )}
    </div>
  )
}
