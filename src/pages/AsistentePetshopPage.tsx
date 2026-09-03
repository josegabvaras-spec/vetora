import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CalendarClock, MessageCircle, PackageSearch, Truck } from 'lucide-react'
import { AvisoError } from '../components/ui/AvisoError'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Seccion } from '../components/ui/Seccion'
import { TablaResponsive } from '../components/ui/Tabla'
import { useAuth } from '../context/useAuth'
import { PreguntaleAVetora } from '../features/asistente/PreguntaleAVetora'
import { puedeUsarCopiloto } from '../lib/personal'
import { getSugerenciasReposicion, listLotes, type SugerenciaReposicion } from '../services/petshop'
import { enlaceWhatsapp } from '../lib/whatsapp'
import { formatBs } from '../lib/currency'
import { formatClinicDate } from '../lib/datetime'
import type { ProductoLoteConDetalle } from '../types/views'

/**
 * El asistente de un Pet Shop: qué hay que atender hoy en la mercadería.
 *
 * **Pantalla propia y no una adaptación de `AsistentePage`.** Aquella deriva
 * todo de pacientes, citas, vacunas e historiales, y un petshop no tiene nada
 * de eso —ni `fichas` ni `agenda` en su plan—, así que adaptarla habría dejado
 * una pantalla con todas las cifras en cero y ninguna fila. Lo que un petshop
 * sí tiene que decidir cada día es qué reponer y qué sacar antes de que
 * caduque.
 *
 * Los datos ya existían, los pintaba solo el dashboard como dos números:
 * `getSugerenciasReposicion()` trae el producto, cuánto pedir y **con qué
 * proveedor**, y `listLotes()` el semáforo de vencimiento.
 *
 * ⚠️ **El pedido al proveedor es `enlaceWhatsapp()`, nunca
 * `enviarMensajeWhatsapp()`** — un `wa.me` puro, compuesto aquí, que no toca
 * Supabase ni descuenta nada. Mismo criterio que el botón del catálogo: la
 * cuota mensual del plan es para **avisos a clientes**, y una orden de compra
 * es logística interna. Reponer stock no puede gastar los mensajes con los que
 * se avisa a los clientes.
 */
export function AsistentePetshopPage() {
  const { usuario, sucursalActivaId } = useAuth()

  const [reposicion, setReposicion] = useState<SugerenciaReposicion[]>([])
  const [porVencer, setPorVencer] = useState<ProductoLoteConDetalle[]>([])
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)

  const recargar = useCallback(async () => {
    setCargando(true)
    setErrorCarga(null)
    try {
      const sucursal = sucursalActivaId || undefined
      const [sugerencias, lotes] = await Promise.all([
        getSugerenciasReposicion(sucursal),
        listLotes({ sucursalId: sucursal, estado: 'todos' }),
      ])
      setReposicion(sugerencias)
      // Vencidos primero: son los que hay que retirar hoy, no los que hay que
      // vigilar. `listLotes` ya viene ordenada por fecha de vencimiento.
      setPorVencer(
        lotes.filter((l) => l.estado_vencimiento !== 'normal' && Number(l.cantidad_actual) > 0),
      )
    } catch (err) {
      setErrorCarga(err instanceof Error ? err.message : 'No se pudo cargar el asistente')
    } finally {
      setCargando(false)
    }
  }, [sucursalActivaId])

  useEffect(() => {
    recargar()
  }, [recargar])

  const urgentes = reposicion.filter((s) => s.urgencia === 'alta').length
  const vencidos = porVencer.filter((l) => l.estado_vencimiento === 'vencido').length

  const columnasReposicion = [
    {
      clave: 'producto',
      cabecera: 'Producto',
      movil: 'titulo' as const,
      celda: (s: SugerenciaReposicion) => (
        <div>
          <p className="font-bold text-slate-900">{s.producto.nombre}</p>
          <p className="text-[11px] text-slate-500">
            {s.producto.sku}
            {s.producto.marca ? ` · ${s.producto.marca}` : ''}
          </p>
        </div>
      ),
    },
    {
      clave: 'stock',
      cabecera: 'Stock',
      movil: 'destacado' as const,
      celda: (s: SugerenciaReposicion) => (
        <Badge tone={s.stockActual === 0 ? 'rose' : 'amber'}>
          {s.stockActual} de {s.stockMinimo} mín.
        </Badge>
      ),
    },
    {
      clave: 'pedir',
      cabecera: 'Pedir',
      movil: 'destacado' as const,
      celda: (s: SugerenciaReposicion) => (
        <span className="font-black text-slate-900">
          {s.cantidadSugerida} {s.producto.unidad_medida}
        </span>
      ),
    },
    {
      clave: 'proveedor',
      cabecera: 'Proveedor',
      movil: 'detalle' as const,
      celda: (s: SugerenciaReposicion) => (
        <span className="text-slate-600">{s.proveedor?.empresa || 'Sin proveedor asignado'}</span>
      ),
    },
    {
      clave: 'acciones',
      cabecera: '',
      movil: 'acciones' as const,
      celda: (s: SugerenciaReposicion) => {
        const whatsapp = s.proveedor?.whatsapp?.trim()
        if (!whatsapp) {
          return (
            <span className="text-[11px] text-slate-400">
              {s.proveedor ? 'Sin WhatsApp' : 'Asigna un proveedor'}
            </span>
          )
        }
        const mensaje =
          `Buen día. Queremos hacer un pedido: ${s.cantidadSugerida} ${s.producto.unidad_medida} ` +
          `de ${s.producto.nombre}${s.producto.marca ? ` (${s.producto.marca})` : ''}. ` +
          '¿Nos confirma disponibilidad y precio?'
        return (
          <a
            href={enlaceWhatsapp(whatsapp, mensaje)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-100"
          >
            <MessageCircle size={14} /> Pedir
          </a>
        )
      },
    },
  ]

  const columnasVencimiento = [
    {
      clave: 'producto',
      cabecera: 'Producto',
      movil: 'titulo' as const,
      celda: (l: ProductoLoteConDetalle) => (
        <div>
          <p className="font-bold text-slate-900">{l.producto?.nombre ?? 'Producto retirado'}</p>
          <p className="text-[11px] text-slate-500">Lote {l.numero_lote}</p>
        </div>
      ),
    },
    {
      clave: 'vence',
      cabecera: 'Vence',
      movil: 'destacado' as const,
      celda: (l: ProductoLoteConDetalle) => (
        <Badge tone={l.estado_vencimiento === 'vencido' ? 'rose' : 'amber'}>
          {l.estado_vencimiento === 'vencido'
            ? `Vencido hace ${Math.abs(l.dias_para_vencer)} d.`
            : `En ${l.dias_para_vencer} d.`}
        </Badge>
      ),
    },
    {
      clave: 'fecha',
      cabecera: 'Fecha',
      movil: 'detalle' as const,
      celda: (l: ProductoLoteConDetalle) => (
        <span className="text-slate-600">{formatClinicDate(l.fecha_vencimiento)}</span>
      ),
    },
    {
      clave: 'cantidad',
      cabecera: 'Quedan',
      movil: 'detalle' as const,
      celda: (l: ProductoLoteConDetalle) => (
        <span className="font-semibold text-slate-700">
          {l.cantidad_actual} {l.producto?.unidad_medida ?? ''}
        </span>
      ),
    },
    {
      clave: 'valor',
      cabecera: 'Costo',
      movil: 'detalle' as const,
      celda: (l: ProductoLoteConDetalle) => (
        <span className="text-slate-500">
          {formatBs(Number(l.costo_unitario_bs) * Number(l.cantidad_actual))}
        </span>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <AvisoError mensaje={errorCarga} />

      <div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
          Asistente
        </h1>
        <p className="mt-1 text-sm font-medium text-slate-500">
          Lo que toca atender hoy en la mercadería: qué reponer y qué sacar antes de que venza.
        </p>
      </div>

      {puedeUsarCopiloto(usuario) && <PreguntaleAVetora />}

      <Card padding="md" className="border border-slate-200/60">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Cifra etiqueta="Por reponer" valor={String(reposicion.length)} alerta={urgentes > 0} />
          <Cifra etiqueta="Sin stock" valor={String(urgentes)} alerta={urgentes > 0} />
          <Cifra etiqueta="Por vencer" valor={String(porVencer.length - vencidos)} />
          <Cifra etiqueta="Ya vencidos" valor={String(vencidos)} alerta={vencidos > 0} />
        </div>
        <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-400">
          Los pedidos por WhatsApp salen de tu propio teléfono y{' '}
          <strong className="font-semibold text-slate-500">no descuentan</strong> del cupo de
          mensajes del plan, que es para avisar a clientes.
        </p>
      </Card>

      <Seccion
        titulo="Por reponer"
        icono={<Truck size={14} />}
        tono={urgentes > 0 ? 'destacado' : 'neutro'}
      >
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <TablaResponsive
            columnas={columnasReposicion}
            filas={reposicion}
            claveDe={(s) => s.producto.id}
            vacio={
              <span className="flex flex-col items-center gap-2 text-slate-400">
                <PackageSearch size={32} className="opacity-20" />
                {cargando ? 'Cargando…' : 'Todo por encima del mínimo'}
              </span>
            }
          />
        </div>
      </Seccion>

      <Seccion
        titulo="Vencimientos"
        icono={<CalendarClock size={14} />}
        tono={vencidos > 0 ? 'destacado' : 'neutro'}
      >
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <TablaResponsive
            columnas={columnasVencimiento}
            filas={porVencer}
            claveDe={(l) => l.id}
            vacio={
              <span className="flex flex-col items-center gap-2 text-slate-400">
                <AlertTriangle size={32} className="opacity-20" />
                {cargando ? 'Cargando…' : 'Ningún lote próximo a vencer'}
              </span>
            }
          />
        </div>
        <p className="mt-2 text-xs text-slate-400">
          Los lotes se registran en{' '}
          <Link to="/petshop/inventario" className="font-semibold text-teal-700 hover:underline">
            Inventario
          </Link>
          .
        </p>
      </Seccion>
    </div>
  )
}

function Cifra({
  etiqueta,
  valor,
  alerta,
}: {
  etiqueta: string
  valor: string
  alerta?: boolean
}) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{etiqueta}</p>
      <p
        className={
          alerta
            ? 'font-display text-2xl font-black text-rose-700'
            : 'font-display text-2xl font-black text-slate-900'
        }
      >
        {valor}
      </p>
    </div>
  )
}
