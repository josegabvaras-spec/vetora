import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useTable } from '../mocks/useDb'
import {
  AccionesFirmaInforme,
  FirmasInformeImpresas,
  useFirmaInforme,
} from '../features/pacientes/FirmaInforme'
import { getCobro } from '../services/caja'
import { formatBs } from '../lib/currency'
import { formatClinicDateTime } from '../lib/datetime'
import type { MetodoPago } from '../types/database'
import type { CobroConDetalle } from '../types/views'

const METODO_LABEL: Record<MetodoPago, string> = { efectivo: 'Efectivo', qr: 'QR' }

export function ReciboPage() {
  const { cobroId } = useParams<{ cobroId: string }>()
  const [cobro, setCobro] = useState<CobroConDetalle | null | undefined>(undefined)
  // «No se pudo cargar» y «no existe» son cosas distintas.
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const clinica = useTable('clinicas')[0]
  const sucursales = useTable('sucursales')
  // Sin paciente: un recibo puede ser de una venta de mostrador, que se cobra a
  // un nombre suelto. Se localiza por su cobro (0017).
  const { firma, setFirma } = useFirmaInforme(null, 'recibo', cobroId ?? null)

  useEffect(() => {
    if (!cobroId) return
    getCobro(cobroId)
      .then(setCobro)
      .catch((err) => {
        setErrorCarga(err instanceof Error ? err.message : 'No se pudo cargar el recibo')
        setCobro(null)
      })
  }, [cobroId])

  if (cobro === undefined) return <p className="p-6 text-sm text-slate-500">Cargando recibo…</p>

  if (!cobro) {
    return (
      <div className="mx-auto max-w-lg space-y-4 p-6 text-center">
        <p className={errorCarga ? 'text-sm font-semibold text-rose-700' : 'text-sm text-slate-500'}>
          {errorCarga ?? 'No se encontró el cobro solicitado.'}
        </p>
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
        <AccionesFirmaInforme
          pacienteId={null}
          tipo="recibo"
          itemId={cobro.id}
          tituloDocumento={`Recibo de ${formatBs(cobro.monto_bs)} — ${cobro.cliente_nombre}`}
          nombreTutor={cobro.cliente_nombre}
          etiquetaTutor="Cliente"
          etiquetaFirmante="Cajero/a"
          firma={firma}
          onFirmado={setFirma}
        />
      </div>

      <div className="mx-auto max-w-xl bg-white p-10 shadow-sm print:p-0 print:shadow-none">
        <header className="mb-5 border-b-2 border-slate-700 pb-3 text-center">
          <h1 className="text-base font-bold uppercase tracking-wide text-slate-800">Recibo de pago</h1>
          <p className="mt-0.5 text-xs text-slate-600">{clinica?.nombre ?? ""}</p>
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

        {/* Dos columnas a propósito: el precio unitario está expresado por
            unidad de medida (Bs. 2 por ml), así que imprimirlo enseñaba al
            cliente "2 ml × Bs. 2" en vez del importe que la clínica cobra. Lo
            que se cobra es el subtotal, ya fijado en caja. */}
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr>
              <th className="border border-slate-400 bg-slate-100 px-2 py-1 text-left font-bold uppercase tracking-wide text-slate-600">
                Concepto
              </th>
              <th className="w-28 border border-slate-400 bg-slate-100 px-2 py-1 text-right font-bold uppercase tracking-wide text-slate-600">
                Monto
              </th>
            </tr>
          </thead>
          <tbody>
            {cobro.lineas.map((l, i) => (
              <tr key={i}>
                <td className="border border-slate-400 px-2 py-1 text-slate-800">
                  {l.concepto}
                  {/* Sin la columna de cantidad, "dos consultas" y "una" se
                      imprimirían igual; en productos la cantidad es la dosis y
                      es justo lo que no debe salir. */}
                  {l.cantidad > 1 && !l.producto_id && ` (×${l.cantidad})`}
                </td>
                <td className="border border-slate-400 px-2 py-1 text-right text-slate-800">
                  {formatBs(l.subtotal_bs)}
                </td>
              </tr>
            ))}
            <tr>
              <td className="border border-slate-400 bg-slate-100 px-2 py-1 text-right font-bold text-slate-700">
                Total pagado ({METODO_LABEL[cobro.metodo_pago]})
              </td>
              <td className="border border-slate-400 bg-slate-100 px-2 py-1 text-right text-sm font-black text-slate-900">
                {formatBs(cobro.monto_bs)}
              </td>
            </tr>
          </tbody>
        </table>

        <FirmasInformeImpresas
          firma={firma}
          etiquetaTutor="Firma del Cliente"
          etiquetaFirmante="Firma del Cajero/a"
        />

        <footer className="mt-8 border-t border-slate-300 pt-3 text-center text-[9px] text-slate-500">
          Documento generado electrónicamente por Vetora · Los cobros registrados son inmutables.
        </footer>
      </div>
    </div>
  )
}
