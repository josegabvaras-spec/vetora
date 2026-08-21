import { LogOut, Menu, MessageCircle, Building2, ArrowLeft } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useTable } from '../../mocks/useDb'

import { Badge } from '../ui/Badge'
import { Select } from '../ui/Field'
import { getCuotaWhatsapp } from '../../services/whatsapp'
import { useMultiSucursal, usePlanActivo } from '../../hooks/usePlanActivo'
import { PerfilModal } from '../../features/auth/PerfilModal'
import { clsx } from 'clsx'
import { formatClinicDateTime } from '../../lib/datetime'

const ROL_LABEL: Record<string, string> = {
  admin: 'Administrador',
  veterinario: 'Veterinario',
  recepcion: 'Recepción',
}


/** Barra de consumo de recordatorios frente al tope del plan. */
function CuotaWhatsapp({ className }: { className?: string }) {
  const { usuario } = useAuth()
  const [cuota, setCuota] = useState({ enviados: 0, limite: 0, disponible: 0 })

  useEffect(() => {
    if (!usuario?.clinica_id) return
    let montado = true
    getCuotaWhatsapp(usuario.clinica_id).then(c => {
      if (montado) setCuota(c)
    })
    return () => { montado = false }
  }, [usuario])

  const pct = cuota.limite > 0 ? (cuota.enviados / cuota.limite) * 100 : 0

  return (
    <div
      className={clsx('flex flex-col gap-1', className)}
      title={`Recordatorios enviados: ${cuota.enviados} de ${cuota.limite} mensuales`}
    >
      <div className="flex items-center justify-between text-[11px] font-bold text-slate-500">
        <span className="flex items-center gap-1">
          <MessageCircle size={12} className="text-teal-600" /> WhatsApp
        </span>
        <span>
          {cuota.enviados}/{cuota.limite}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
        <div
          className={clsx('h-full transition-all duration-500', pct > 90 ? 'bg-rose-500' : 'bg-teal-500')}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
    </div>
  )
}

/** Selector de sucursal: solo para admin y solo si el plan permite más de una. */
function SelectorSucursal({ className }: { className?: string }) {
  const { usuario, sucursalActivaId, setSucursalActivaId } = useAuth()
  const sucursales = useTable('sucursales')
  const multiSucursal = useMultiSucursal()

  if (usuario?.rol !== 'admin' || !multiSucursal) return null

  return (
    // El tamaño de letra lo fija el propio control (`text-base sm:text-sm`): si
    // se pisara desde aquí volvería el zoom de iOS al enfocarlo.
    <Select
      className={clsx('h-10 py-1.5 font-semibold', className)}
      aria-label="Sucursal activa"
      value={sucursalActivaId || 'todas'}
      onChange={(e) => setSucursalActivaId(e.target.value === 'todas' ? null : e.target.value)}
    >
      <option value="todas">Todas las sucursales</option>
      {sucursales.map((s) => (
        <option key={s.id} value={s.id}>
          {s.nombre}
        </option>
      ))}
    </Select>
  )
}

/**
 * Lo que en escritorio vive en la barra superior y en un celular no cabe: se
 * monta dentro del menú lateral (ver el `pie` de `Sidebar`).
 */
export function ControlesMovil() {
  return (
    <div className="space-y-3">
      <CuotaWhatsapp />
      <SelectorSucursal className="w-full" />
    </div>
  )
}

export function Topbar({ onAbrirMenu }: { onAbrirMenu: () => void }) {
  const { usuario, logout } = useAuth()
  const clinica = useTable('clinicas')[0]
  const plan = usePlanActivo()
  const [mostrarPerfil, setMostrarPerfil] = useState(false)

  const { pathname } = useLocation()
  const navigate = useNavigate()
  const esSubpagina = pathname.split('/').filter(Boolean).length > 1

  if (!usuario) return null

  // La hora es la de la clínica, no la del equipo: con getHours() un portátil
  // con el huso mal puesto saludaba "buenas noches" a mediodía.
  const hora = Number(formatClinicDateTime(new Date().toISOString(), 'HH'))
  let saludo = '¡Hola'
  if (hora >= 6 && hora < 12) saludo = 'Buenos días'
  else if (hora >= 12 && hora < 19) saludo = 'Buenas tardes'
  else saludo = 'Buenas noches'

  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200/50 bg-white/80 px-3 py-3 shadow-[0_2px_12px_rgba(0,0,0,0.02)] backdrop-blur-xl sm:px-6 sm:py-4">
      {esSubpagina && (
        <button
          onClick={() => navigate(-1)}
          aria-label="Volver"
          className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 md:hidden"
        >
          <ArrowLeft size={20} />
        </button>
      )}
      <button
        onClick={onAbrirMenu}
        aria-label="Abrir menú"
        className="hidden h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 md:flex"
      >
        <Menu size={20} />
      </button>

      {/* Clínica y sucursal */}
      <div className="flex min-w-0 items-center gap-3">
        {clinica?.logo_url ? (
          <img src={clinica.logo_url} alt="Logo" className="hidden h-9 w-9 items-center justify-center rounded-lg border border-slate-100 bg-white object-contain sm:flex" />
        ) : (
          <div className="hidden h-9 w-9 items-center justify-center rounded-lg border border-slate-100 bg-slate-50 text-slate-500 sm:flex">
            <Building2 size={16} />
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-bold leading-tight text-slate-900">{clinica?.nombre}</p>
          <p className="truncate text-xs font-medium text-slate-400">
            {plan ? `Plan ${plan.nombre}` : 'Sin plan'} · {clinica?.ciudad || 'Bolivia'}
          </p>
        </div>
      </div>

      {/* Acciones y perfil */}
      <div className="ml-auto flex items-center gap-3 lg:gap-5">
        <CuotaWhatsapp className="hidden w-32 lg:flex xl:w-40" />
        <SelectorSucursal className="hidden w-44 md:block" />

        <div className="flex items-center gap-2 border-slate-200 sm:gap-3 sm:border-l sm:pl-3">
          <div className="hidden text-right lg:block">
            <p className="mb-0.5 text-xs font-medium leading-none text-slate-400">{saludo},</p>
            <p className="text-sm font-bold leading-tight text-slate-800">{usuario.nombre}</p>
            <Badge tone="teal">{ROL_LABEL[usuario.rol]}</Badge>
          </div>
          <button
            onClick={() => setMostrarPerfil(true)}
            title={`${usuario.nombre} · ${ROL_LABEL[usuario.rol]}`}
            className="flex h-10 w-10 shrink-0 cursor-pointer select-none items-center justify-center rounded-xl border border-teal-500/20 bg-gradient-to-tr from-teal-500/10 to-teal-600/10 font-display text-xs font-bold text-teal-700 shadow-xs transition-colors hover:from-teal-500/20 hover:to-teal-600/20 focus:outline-none focus:ring-2 focus:ring-teal-500/40"
          >
            {usuario.nombre.substring(0, 2).toUpperCase()}
          </button>
          <button
            onClick={logout}
            title="Cerrar sesión"
            aria-label="Cerrar sesión"
            className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-transparent text-slate-400 transition-colors hover:border-rose-100 hover:bg-rose-50 hover:text-rose-600"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
      
      {mostrarPerfil && <PerfilModal onClose={() => setMostrarPerfil(false)} />}
    </header>
  )
}
