import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Printer } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { useTable } from '../mocks/useDb'
import { getCobro } from '../services/caja'
import { formatBs } from '../lib/currency'
import { formatClinicDateTime } from '../lib/datetime'
import type { MetodoPago } from '../types/database'
import type { CobroConDetalle } from '../types/views'

const METODO_LABEL: Record<MetodoPago, string> = { efectivo: 'Efectivo', qr: 'QR' }

export function ReciboPage() {
  const { cobroId } = useParams<{ cobroId: string }>()
  const [cobro, setCobro] = useState<CobroConDetalle | null | undefined>(undefined)
  const clinica = useTable('clinicas')[0]
  const sucursales = useTable('sucursales')

  useEffect(() => {
    if (!cobroId) return
    getCobro(cobroId).then(setCobro)
  }, [cobroId])

  if (cobro === undefined) return <p className="p-6 text-sm text-slate-500">Cargando recibo…</p>

  if (!cobro) {
    return (
      <div className="mx-auto max-w-lg space-y-4 p-6 text-center">
        <p className="text-sm text-slate-500">No se encontró el cobro solicitado.</p>
        <Link to="/caja" className="inline-flex items-center gap-1 text-sm text-teal-700 hover:underline">
          <ArrowLeft size={16} /> Volver a caja
        </Link>
      </div>
    )
  }

  const sucursal = sucursales.find((s) => s.id === cobro.sucursal_id)

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white">
      <div className="mx-auto flex max-w-xl items-center justify-between px-6 py-4 print:hidden">
        <Link to="/caja" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft size={16} /> Volver a caja
        </Link>
        <Button onClick={() => window.print()}>
          <Printer size={16} /> Imprimir / Guardar PDF
        </Button>
      </div>

      <div className="mx-auto max-w-xl bg-white p-10 shadow-sm print:p-0 print:shadow-none">
        <header className="mb-5 border-b-2 border-slate-700 pb-3 text-center">
          <h1 className="text-base font-bold uppercase tracking-wide text-slate-800">Recibo de pago</h1>
          <p className="mt-0.5 text-xs text-slate-600">{clinica.nombre}</p>
          {sucursal && <p className="text-[11px] text-slate-500">{sucursal.nombre}</p>}
        </header>

        <table className="mb-4 w-full table-fixed border-collapse text-[11px]">
          <tbody>
            <tr>
              <th className="w-32 border border-slate-400 bg-slate-100 px-2 py-1 text-left font-bold uppercase tracking-wide text-slate-600">
                Recibo N.º
              </th>
              <td className="border border-slate-400 px-2 py-1 font-mono text-slate-800">{cobro.id.slice(-12)}</td>
            </tr>
            <tr>
              <th className="border border-slate-400 bg-slate-100 px-2 py-1 text-left font-bold uppercase tracking-wide text-slate-600">
                Fecha
              </th>
              <td className="border border-slate-400 px-2 py-1 text-slate-800">
                {formatClinicDateTime(cobro.created_at)}
              </td>
            </tr>
            <tr>
              <th className="border border-slate-400 bg-slate-100 px-2 py-1 text-left font-bold uppercase tracking-wide text-slate-600">
                Cliente
              </th>
              <td className="border border-slate-400 px-2 py-1 text-slate-800">{cobro.cliente_nombre}</td>
            </tr>
            <tr>
              <th className="border border-slate-400 bg-slate-100 px-2 py-1 text-left font-bold uppercase tracking-wide text-slate-600">
                Paciente
              </th>
              <td className="border border-slate-400 px-2 py-1 text-slate-800">
                {cobro.paciente_nombre} · {cobro.concepto_atencion}
              </td>
            </tr>
            <tr>
              <th className="border border-slate-400 bg-slate-100 px-2 py-1 text-left font-bold uppercase tracking-wide text-slate-600">
                Atendido por
              </th>
              <td className="border border-slate-400 px-2 py-1 text-slate-800">{cobro.veterinario_nombre}</td>
            </tr>
          </tbody>
        </table>

        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr>
              <th className="border border-slate-400 bg-slate-100 px-2 py-1 text-left font-bold uppercase tracking-wide text-slate-600">
                Concepto
              </th>
              <th className="w-16 border border-slate-400 bg-slate-100 px-2 py-1 text-right font-bold uppercase tracking-wide text-slate-600">
                Cant.
              </th>
              <th className="w-24 border border-slate-400 bg-slate-100 px-2 py-1 text-right font-bold uppercase tracking-wide text-slate-600">
                P. unit.
              </th>
              <th className="w-24 border border-slate-400 bg-slate-100 px-2 py-1 text-right font-bold uppercase tracking-wide text-slate-600">
                Subtotal
              </th>
            </tr>
          </thead>
          <tbody>
            {cobro.lineas.map((l, i) => (
              <tr key={i}>
                <td className="border border-slate-400 px-2 py-1 text-slate-800">{l.concepto}</td>
                <td className="border border-slate-400 px-2 py-1 text-right text-slate-800">{l.cantidad}</td>
                <td className="border border-slate-400 px-2 py-1 text-right text-slate-800">
                  {formatBs(l.precio_unitario_bs)}
                </td>
                <td className="border border-slate-400 px-2 py-1 text-right text-slate-800">
                  {formatBs(l.subtotal_bs)}
                </td>
              </tr>
            ))}
            <tr>
              <td className="border border-slate-400 bg-slate-100 px-2 py-1 text-right font-bold text-slate-700" colSpan={3}>
                Total pagado ({METODO_LABEL[cobro.metodo_pago]})
              </td>
              <td className="border border-slate-400 bg-slate-100 px-2 py-1 text-right text-sm font-black text-slate-900">
                {formatBs(cobro.monto_bs)}
              </td>
            </tr>
          </tbody>
        </table>

        <div className="mt-12 grid grid-cols-2 gap-8 text-[11px]">
          <div className="text-center">
            <div className="border-t border-slate-400 pt-2">Firma de quien recibe</div>
          </div>
          <div className="text-center">
            <div className="border-t border-slate-400 pt-2">Sello de la clínica</div>
          </div>
        </div>

        <footer className="mt-8 border-t border-slate-300 pt-3 text-center text-[9px] text-slate-500">
          Documento generado electrónicamente por Vetora · Los cobros registrados son inmutables.
        </footer>
      </div>
    </div>
  )
}
