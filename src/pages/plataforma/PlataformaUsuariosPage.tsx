import { useCallback, useEffect, useState } from 'react'
import { clsx } from 'clsx'
import { AlertTriangle, MessageCircle, Pencil, Search, Trash2 } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Field'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { useSuscripcionTabla, useTable } from '../../mocks/useDb'
import {
  alternarActivoUsuario,
  borrarCuentaHuerfana,
  borrarUsuario,
  estadoCuentasPortal,
  listCuentasHuerfanas,
  listUsuariosPlataforma,
  type CuentaHuerfana,
  type EstadoCuentaPortal,
  type UsuarioPlataforma,
} from '../../services/plataforma'
import { EditarUsuarioModal } from '../../features/plataforma/EditarUsuarioModal'
import { EnviarAccesoModal } from '../../features/plataforma/EnviarAccesoModal'

const ROL_LABEL: Record<string, string> = {
  admin: 'Administrador',
  veterinario: 'Veterinario',
  recepcion: 'Recepción',
  peluquero: 'Peluquero',
  superadmin: 'Dueño de la plataforma',
}

/**
 * Todos los usuarios de todas las clínicas, para encontrar a alguien sin saber
 * de antemano en qué clínica está.
 *
 * La lista sale de `listUsuariosPlataforma()`, que consulta `usuarios`
 * directamente. Antes se aplanaba `listClinicas()`, y por ahí se perdían filas
 * de tres formas a la vez —los usuarios sin clínica se descartaban, la salida
 * se generaba sobre el array de clínicas, y `max_rows` truncaba en silencio—,
 * de modo que ningún `superadmin` podía aparecer nunca.
 *
 * Las cuentas del portal (`rol = 'cliente'`) sí llegan, en su propia pestaña:
 * son dueños de mascota, no personal, y no se editan desde aquí.
 */
export function PlataformaUsuariosPage() {
  const [filasTodas, setFilasTodas] = useState<UsuarioPlataforma[]>([])
  const [huerfanas, setHuerfanas] = useState<CuentaHuerfana[]>([])
  // Solo booleano y conteo por cuenta: la RLS no deja al superadmin leer
  // `clientes`, y eso no cambia. Ver `estadoCuentasPortal`.
  const [estadoPortal, setEstadoPortal] = useState<Record<string, EstadoCuentaPortal>>({})
  const [busqueda, setBusqueda] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [editando, setEditando] = useState<UsuarioPlataforma | null>(null)
  const [enviandoAcceso, setEnviandoAcceso] = useState<UsuarioPlataforma | null>(null)
  const [borrando, setBorrando] = useState<UsuarioPlataforma | null>(null)
  const [eliminando, setEliminando] = useState(false)
  const [pestana, setPestana] = useState<'personal' | 'portal'>('personal')

  const revisionUsuarios = useSuscripcionTabla('usuarios')
  const sucursales = useTable('sucursales')

  const recargar = useCallback(async () => {
    setFilasTodas(await listUsuariosPlataforma())
    // Las dos consultas de apoyo van aparte y no deben tumbar la lista
    // principal si su Edge Function no está desplegada todavía.
    try {
      setHuerfanas(await listCuentasHuerfanas())
    } catch {
      setHuerfanas([])
    }
    try {
      setEstadoPortal(await estadoCuentasPortal())
    } catch {
      setEstadoPortal({})
    }
  }, [])

  useEffect(() => {
    recargar().catch((err) => setError(err instanceof Error ? err.message : 'No se pudieron cargar los usuarios'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recargar, revisionUsuarios])

  const esPortal = pestana === 'portal'
  const filas = filasTodas.filter(({ usuario }) =>
    esPortal ? usuario.rol === 'cliente' : usuario.rol !== 'cliente',
  )

  const termino = busqueda.trim().toLowerCase()
  const filtradas = termino
    ? filas.filter(
        ({ usuario: u, clinicaNombre }) =>
          u.nombre.toLowerCase().includes(termino) ||
          u.email.toLowerCase().includes(termino) ||
          u.whatsapp.toLowerCase().includes(termino) ||
          clinicaNombre.toLowerCase().includes(termino),
      )
    : filas

  async function ejecutar(accion: () => Promise<unknown>) {
    if (ocupado) return
    setOcupado(true)
    setError(null)
    try {
      await accion()
      await recargar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo completar la acción')
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-xl font-bold text-slate-900">Usuarios</h1>
        <p className="mt-0.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
          {esPortal ? 'Dueños de mascota registrados en el portal' : 'Personal de todas las clínicas, en un solo lugar'}
        </p>
      </div>

      {/* Dos mundos distintos, no un filtro: el personal ocupa plaza del plan
          y se edita; las cuentas del portal ni lo uno ni lo otro. */}
      <div className="border-b border-slate-200">
        <nav className="-mb-px flex gap-6 overflow-x-auto" aria-label="Tipo de cuenta">
          {([
            ['personal', 'Personal'],
            ['portal', 'Cuentas del portal'],
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

      {esPortal && (
        <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
          Son cuentas de dueños de mascota, no personal: no ocupan plaza del plan y no se editan desde aquí. Quien
          las gestiona es la propia clínica, desde su sección «Clientes» —ahí puede unir una cuenta con la ficha de
          su mascota si el registro no lo hizo solo.
        </p>
      )}

      {/* Cuentas que existen en Supabase Auth pero no en `usuarios`: son las
          que hacían que el total de aquí no cuadrara con Authentication →
          Users. No pueden entrar a ningún sitio, pero ocupan el correo. */}
      {huerfanas.length > 0 && (
        <Card className="border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-600" />
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-bold text-amber-900">
                {huerfanas.length} cuenta{huerfanas.length === 1 ? '' : 's'} de acceso sin perfil
              </h2>
              <p className="mt-0.5 text-xs text-amber-800">
                Quedaron a medias en un alta que se cortó. No pueden entrar a ninguna parte, pero mantienen el
                correo ocupado. Bórralas para poder volver a usar ese correo.
              </p>
              <ul className="mt-3 space-y-2">
                {huerfanas.map((c) => (
                  <li
                    key={c.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-white px-3 py-2"
                  >
                    <p className="min-w-0 break-words font-mono text-[11px] text-slate-600">{c.email}</p>
                    <Button
                      variant="secondary"
                      className="px-3 py-1 text-xs"
                      onClick={() => ejecutar(() => borrarCuentaHuerfana(c.id))}
                    >
                      Eliminar
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      )}

      <div className="relative max-w-sm">
        <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <Input
          className="pl-8"
          placeholder="Buscar por nombre, correo, WhatsApp o clínica…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
      </div>

      {error && <p className="text-sm font-bold text-rose-600">{error}</p>}

      <ul className="space-y-2">
        {filtradas.map((fila) => {
          const { usuario: u, clinicaNombre } = fila
          // El superadmin no se toca desde aquí por lo mismo que el cliente del
          // portal: el desplegable de `EditarUsuarioModal` solo tiene roles de
          // clínica, y no pertenece a ninguna.
          const sinAcciones = esPortal || u.rol === 'superadmin'
          const portal = estadoPortal[u.id]

          return (
            <li
              key={u.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className={u.activo ? 'text-sm font-bold text-slate-900' : 'text-sm font-bold text-slate-400'}>
                    {u.nombre}
                  </p>
                  <Badge tone={u.rol === 'superadmin' ? 'amber' : 'teal'} size="sm">
                    {clinicaNombre}
                  </Badge>
                  {!u.activo && (
                    <Badge tone="slate" size="sm">
                      Desactivado
                    </Badge>
                  )}
                  {/* Lo justo para responder «¿por qué no ve su mascota?» sin
                      abrir el expediente de nadie. */}
                  {esPortal &&
                    (portal?.vinculada ? (
                      <Badge tone="emerald" size="sm">
                        Vinculada · {portal.mascotas} mascota(s)
                      </Badge>
                    ) : (
                      <Badge tone="amber" size="sm">
                        Sin vincular
                      </Badge>
                    ))}
                </div>
                <p className="text-xs text-slate-500">{esPortal ? 'Dueño de mascota' : ROL_LABEL[u.rol] ?? u.rol}</p>
                <p className="font-mono text-[11px] text-slate-400 break-words">
                  {u.email} · {u.whatsapp}
                </p>
              </div>
              {/* Una cuenta del portal solo se borra. NO se edita: el
                  desplegable de `EditarUsuarioModal` solo tiene roles de
                  clínica —ascender a un dueño de mascota a «Administrador» le
                  daría el sistema clínico entero— y `actualizarUsuario` ya lo
                  rechaza; y «Enviar acceso» es para el alta de personal.

                  Los botones ya no se tapan con `hidden`: antes se renderizaban
                  con su `onClick` y solo se ocultaban por CSS. Cuando una
                  acción no aplica, no se pinta. */}
              {esPortal ? (
                <button
                  type="button"
                  onClick={() => setBorrando(fila)}
                  className="p-1.5 text-slate-400 hover:text-rose-600"
                  title="Eliminar cuenta del portal"
                >
                  <Trash2 size={15} />
                </button>
              ) : sinAcciones ? null : (
                <div className="flex items-center gap-2">
                  {u.activo && (
                    <Button
                      variant="secondary"
                      className="px-3 py-1.5 text-xs"
                      onClick={() => setEnviandoAcceso(fila)}
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
                  <Button
                    variant="secondary"
                    className="px-2 py-1.5 text-xs"
                    onClick={() => setEditando(fila)}
                    title="Editar"
                  >
                    <Pencil size={13} />
                  </Button>
                  <button
                    type="button"
                    onClick={() => setBorrando(fila)}
                    className="p-1.5 text-slate-400 hover:text-rose-600"
                    title="Eliminar"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {filtradas.length === 0 && (
        <Card className="border border-dashed border-slate-300 py-10 text-center">
          <p className="text-sm text-slate-400">
            {busqueda
              ? 'Ningún usuario coincide con la búsqueda.'
              : esPortal
                ? 'Todavía nadie se ha registrado en el portal.'
                : 'Todavía no hay usuarios.'}
          </p>
        </Card>
      )}

      {editando && (
        <EditarUsuarioModal
          usuario={editando.usuario}
          sucursales={sucursales.filter((s) => s.clinica_id === editando.clinicaId)}
          clinicaNombre={editando.clinicaNombre}
          onClose={() => setEditando(null)}
          onGuardado={() => {
            setEditando(null)
            recargar()
          }}
        />
      )}

      {enviandoAcceso && (
        <EnviarAccesoModal
          usuario={enviandoAcceso.usuario}
          clinicaNombre={enviandoAcceso.clinicaNombre}
          onClose={() => {
            setEnviandoAcceso(null)
            recargar()
          }}
        />
      )}

      {borrando && (
        <ConfirmDialog
          title={`Eliminar a ${borrando.usuario.nombre}`}
          description={
            borrando.usuario.rol === 'cliente'
              ? // La FK `clientes.usuario_id` es `on delete set null`: la ficha
                // y sus mascotas sobreviven, y quedan libres para vincularse
                // con la cuenta correcta. Conviene decirlo, porque «eliminar»
                // suena a que se pierde el expediente.
                'Borra su cuenta de acceso al portal. Su ficha y sus mascotas NO se borran: quedan en la clínica, sin cuenta vinculada, listas para unirse a la correcta. No se puede deshacer.'
              : 'Borra su cuenta de acceso por completo. Si ya registró actividad clínica o de caja, se rechaza —desactívalo en vez de borrarlo—; si no, no se puede deshacer.'
          }
          confirmLabel="Eliminar"
          loading={eliminando}
          onCancel={() => setBorrando(null)}
          onConfirm={async () => {
            setEliminando(true)
            setError(null)
            try {
              await borrarUsuario(borrando.usuario.id)
              setBorrando(null)
              await recargar()
            } catch (err) {
              setError(err instanceof Error ? err.message : 'No se pudo eliminar el usuario')
            } finally {
              setEliminando(false)
            }
          }}
        />
      )}
    </div>
  )
}
