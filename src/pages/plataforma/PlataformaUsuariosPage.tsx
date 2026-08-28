import { useCallback, useEffect, useState } from 'react'
import { clsx } from 'clsx'
import { MessageCircle, Pencil, Search, Trash2 } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Field'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { useSuscripcionTabla, useTable } from '../../mocks/useDb'
import { alternarActivoUsuario, borrarUsuario, listClinicas } from '../../services/plataforma'
import { EditarUsuarioModal } from '../../features/plataforma/EditarUsuarioModal'
import { EnviarAccesoModal } from '../../features/plataforma/EnviarAccesoModal'
import type { Usuario } from '../../types/database'
import type { ClinicaConDetalle } from '../../types/views'

const ROL_LABEL: Record<string, string> = {
  admin: 'Administrador',
  veterinario: 'Veterinario',
  recepcion: 'Recepción',
  peluquero: 'Peluquero',
}

interface FilaUsuario {
  usuario: Usuario
  clinicaId: string
  clinicaNombre: string
}

/**
 * Todo el personal de todas las clínicas, para encontrar a alguien sin saber
 * de antemano en qué clínica está. `listClinicas()` ya trae `usuarios: []`
 * por clínica (lo usa `ClinicaDetalleModal`), así que alcanza con aplanarlo —
 * no hace falta ninguna consulta nueva al backend.
 *
 * Las cuentas del portal (`rol = 'cliente'`) no llegan hasta aquí: las
 * excluye `listClinicas()` en el origen, que es lo que garantiza que esta
 * pantalla y la del detalle de la clínica enseñen exactamente lo mismo.
 */
export function PlataformaUsuariosPage() {
  const [clinicas, setClinicas] = useState<ClinicaConDetalle[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [editando, setEditando] = useState<FilaUsuario | null>(null)
  const [enviandoAcceso, setEnviandoAcceso] = useState<FilaUsuario | null>(null)
  const [borrando, setBorrando] = useState<FilaUsuario | null>(null)
  const [eliminando, setEliminando] = useState(false)
  const [pestana, setPestana] = useState<'personal' | 'portal'>('personal')

  const revisionUsuarios = useSuscripcionTabla('usuarios')
  const sucursales = useTable('sucursales')

  const recargar = useCallback(async () => {
    setClinicas(await listClinicas())
  }, [])

  useEffect(() => {
    recargar().catch((err) => setError(err instanceof Error ? err.message : 'No se pudieron cargar los usuarios'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recargar, revisionUsuarios])

  const esPortal = pestana === 'portal'
  const filas: FilaUsuario[] = clinicas.flatMap((c) =>
    (esPortal ? c.usuarios_portal : c.usuarios).map((u) => ({
      usuario: u,
      clinicaId: c.id,
      clinicaNombre: c.nombre,
    })),
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
        <nav className="-mb-px flex gap-6" aria-label="Tipo de cuenta">
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
        {filtradas.map(({ usuario: u, clinicaId, clinicaNombre }) => (
          <li
            key={u.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className={u.activo ? 'text-sm font-bold text-slate-900' : 'text-sm font-bold text-slate-400'}>
                  {u.nombre}
                </p>
                <Badge tone="teal" size="sm">
                  {clinicaNombre}
                </Badge>
                {!u.activo && (
                  <Badge tone="slate" size="sm">
                    Desactivado
                  </Badge>
                )}
              </div>
              <p className="text-xs text-slate-500">{esPortal ? 'Dueño de mascota' : ROL_LABEL[u.rol] ?? u.rol}</p>
              <p className="font-mono text-[11px] text-slate-400">
                {u.email} · {u.whatsapp}
              </p>
            </div>
            {/* Sin acciones para las cuentas del portal: el desplegable de
                edición solo tiene roles de personal —convertir a un dueño de
                mascota en «Administrador» le daría acceso al sistema clínico
                entero—, y el enlace de acceso es para el alta de personal. */}
            <div className={clsx('flex items-center gap-2', esPortal && 'hidden')}>
              {u.activo && (
                <Button
                  variant="secondary"
                  className="px-3 py-1.5 text-xs"
                  onClick={() => setEnviandoAcceso({ usuario: u, clinicaId, clinicaNombre })}
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
                onClick={() => setEditando({ usuario: u, clinicaId, clinicaNombre })}
                title="Editar"
              >
                <Pencil size={13} />
              </Button>
              <button
                type="button"
                onClick={() => setBorrando({ usuario: u, clinicaId, clinicaNombre })}
                className="p-1.5 text-slate-400 hover:text-rose-600"
                title="Eliminar"
              >
                <Trash2 size={15} />
              </button>
            </div>
          </li>
        ))}
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
          description="Borra su cuenta de acceso por completo. Si ya registró actividad clínica o de caja, se rechaza —desactívalo en vez de borrarlo—; si no, no se puede deshacer."
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
