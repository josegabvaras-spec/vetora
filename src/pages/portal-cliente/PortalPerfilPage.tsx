import { useEffect, useState } from 'react'
import { Navigate, Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import type { Clinica } from '../../types/database'
import { ArrowLeft, LogOut, User, Building2, Mail, Shield, PawPrint } from 'lucide-react'

/**
 * Perfil del usuario — pestaña «Perfil» de la barra inferior.
 *
 * Muestra los datos de la cuenta del dueño (nombre, email), la clínica
 * vinculada, y el botón de cierre de sesión. Sin formularios de edición:
 * los cambios de perfil los hace recepción o el administrador.
 */
export function PortalPerfilPage() {
  const { usuario, logout } = useAuth()
  const [clinica, setClinica] = useState<Clinica | null>(null)

  useEffect(() => {
    async function load() {
      if (usuario?.clinica_id) {
        const { data } = await supabase
          .from('clinicas')
          .select('*')
          .eq('id', usuario.clinica_id)
          .single()
        if (data) setClinica(data as any)
      }
    }
    load()
  }, [usuario])

  if (usuario?.rol !== 'cliente') return <Navigate to="/" replace />

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <Link
          to="/portal-cliente/dashboard"
          className="p-2 bg-white rounded-full border border-slate-200 hover:bg-slate-50 transition-colors shadow-sm"
        >
          <ArrowLeft className="h-5 w-5 text-slate-600" />
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 font-display">Mi Perfil</h1>
      </div>

      {/* Avatar y nombre */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center shadow-sm mb-4">
        <div className="mx-auto h-20 w-20 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center mb-4 shadow-lg shadow-emerald-200">
          <User className="h-10 w-10 text-white" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 font-display">{usuario.nombre}</h2>
        <p className="text-sm text-slate-500 mt-1">Dueño de mascota</p>
      </div>

      {/* Datos de la cuenta */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm mb-4">
        <div className="p-4 border-b border-slate-100 bg-slate-50">
          <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">
            Información de la cuenta
          </h3>
        </div>
        <div className="divide-y divide-slate-100">
          <div className="flex items-center gap-3 p-4">
            <div className="h-9 w-9 rounded-full bg-blue-50 flex items-center justify-center">
              <Mail className="h-4 w-4 text-blue-500" />
            </div>
            <div>
              <p className="text-xs text-slate-400 font-medium">Correo electrónico</p>
              <p className="text-sm font-medium text-slate-900">{usuario.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-4">
            <div className="h-9 w-9 rounded-full bg-emerald-50 flex items-center justify-center">
              <Shield className="h-4 w-4 text-emerald-500" />
            </div>
            <div>
              <p className="text-xs text-slate-400 font-medium">Tipo de cuenta</p>
              <p className="text-sm font-medium text-slate-900">Portal de Clientes</p>
            </div>
          </div>
        </div>
      </div>

      {/* Clínica vinculada */}
      {clinica && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm mb-4">
          <div className="p-4 border-b border-slate-100 bg-slate-50">
            <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">
              Clínica vinculada
            </h3>
          </div>
          <div className="flex items-center gap-3 p-4">
            {clinica.logo_url ? (
              <img
                src={clinica.logo_url}
                alt={clinica.nombre}
                className="h-10 w-10 rounded-lg object-cover border border-slate-200"
              />
            ) : (
              <div className="h-10 w-10 rounded-lg bg-emerald-50 flex items-center justify-center">
                <Building2 className="h-5 w-5 text-emerald-500" />
              </div>
            )}
            <div>
              <p className="text-sm font-bold text-slate-900">{clinica.nombre}</p>
              <p className="text-xs text-slate-500">Veterinaria</p>
            </div>
          </div>
        </div>
      )}

      {/* Versión y cerrar sesión */}
      <div className="space-y-3">
        <button
          onClick={logout}
          className="w-full flex items-center justify-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3.5 text-sm font-semibold text-red-600 hover:bg-red-100 transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Cerrar sesión
        </button>

        <div className="text-center py-3">
          <div className="flex items-center justify-center gap-1.5 text-slate-300 mb-1">
            <PawPrint size={14} />
          </div>
          <p className="text-[11px] text-slate-400 font-medium">
            Vetora v1.0.1 • Plataforma de Gestión Veterinaria
          </p>
        </div>
      </div>
    </div>
  )
}
