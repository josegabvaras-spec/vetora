import { useEffect, useState, useCallback } from 'react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import {
  Building2,
  Plus,
  Phone,
  MessageCircle,
  Mail,
  MapPin,
  Edit2,
  RefreshCw,
} from 'lucide-react'
import { listProveedores } from '../../services/compras'
import type { Proveedor } from '../../types/database'
import { NuevoProveedorModal } from '../../features/petshop/NuevoProveedorModal'

export function PetshopProveedoresPage() {
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [cargando, setCargando] = useState(true)

  const [modalNuevo, setModalNuevo] = useState(false)
  const [proveedorAEditar, setProveedorAEditar] = useState<Proveedor | null>(null)

  const recargar = useCallback(async () => {
    setCargando(true)
    try {
      const data = await listProveedores()
      setProveedores(data)
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    recargar()
  }, [recargar])

  function abrirWhatsApp(numero: string) {
    const limpio = numero.replace(/\D/g, '')
    window.open(`https://wa.me/${limpio}`, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="space-y-6">
      {/* Cabecera Principal */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900 flex items-center gap-2">
            <Building2 className="text-teal-700" size={24} />
            <span>Directorio de Proveedores</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Empresas proveedoras, canales directos de WhatsApp, NIT y condiciones comerciales.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => recargar()}>
            <RefreshCw size={14} className={cargando ? 'animate-spin' : ''} />
          </Button>
          <Button type="button" variant="primary" size="sm" onClick={() => setModalNuevo(true)}>
            <Plus size={15} className="mr-1.5" />
            <span>Nuevo Proveedor</span>
          </Button>
        </div>
      </div>

      {/* Grid de Proveedores */}
      {cargando ? (
        <p className="text-center py-16 text-xs text-slate-500">Cargando proveedores...</p>
      ) : proveedores.length === 0 ? (
        <Card className="p-12 text-center border-slate-200">
          <Building2 size={36} className="mx-auto text-slate-300 mb-2" />
          <p className="font-bold text-sm text-slate-700">No hay proveedores registrados</p>
          <p className="text-xs text-slate-400 mt-1">Registra a tus proveedores para gestionar órdenes de compra.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {proveedores.map((p) => (
            <Card key={p.id} className="p-4 border-slate-200 space-y-3 flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-bold text-base text-slate-900">{p.empresa}</h3>
                    {p.nit && (
                      <span className="text-[10px] font-semibold text-slate-400">NIT: {p.nit}</span>
                    )}
                  </div>
                  <Badge tone={p.activo ? 'emerald' : 'slate'}>
                    {p.activo ? 'Activo' : 'Inactivo'}
                  </Badge>
                </div>

                <div className="space-y-1.5 pt-3 text-xs text-slate-600">
                  {p.contacto && (
                    <p className="font-medium text-slate-700">Contacto: {p.contacto}</p>
                  )}
                  {p.whatsapp && (
                    <p className="flex items-center gap-1 text-slate-600">
                      <Phone size={12} className="text-slate-400" />
                      <span>{p.whatsapp}</span>
                    </p>
                  )}
                  {p.email && (
                    <p className="flex items-center gap-1 text-slate-600">
                      <Mail size={12} className="text-slate-400" />
                      <span className="truncate">{p.email}</span>
                    </p>
                  )}
                  {p.direccion && (
                    <p className="flex items-center gap-1 text-slate-500">
                      <MapPin size={12} className="text-slate-400 shrink-0" />
                      <span className="truncate">{p.direccion}</span>
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                {p.whatsapp ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => abrirWhatsApp(p.whatsapp!)}
                    className="text-emerald-700 hover:text-emerald-900"
                  >
                    <MessageCircle size={13} className="mr-1" />
                    <span>WhatsApp</span>
                  </Button>
                ) : (
                  <span />
                )}

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setProveedorAEditar(p)
                    setModalNuevo(true)
                  }}
                >
                  <Edit2 size={12} className="mr-1" />
                  <span>Editar</span>
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Modal Alta y Edición */}
      {modalNuevo && (
        <NuevoProveedorModal
          proveedorAEditar={proveedorAEditar}
          onClose={() => {
            setModalNuevo(false)
            setProveedorAEditar(null)
          }}
          onSaved={() => recargar()}
        />
      )}
    </div>
  )
}
