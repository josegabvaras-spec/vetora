import { useEffect, useRef, useState } from 'react'
import { X, Printer, Plus, Trash2 } from 'lucide-react'
import { useTable } from '../../mocks/useDb'
import { calcularEdad } from '../../lib/paciente'
import { formatClinicDate, formatClinicDateTime } from '../../lib/datetime'
import { registrarRecetaItem, eliminarRecetaItem } from '../../services/historial'
import type { HistorialConDetalle, PacienteConDueno } from '../../types/views'
import type { RecetaItem, ViaAdministracion } from '../../types/database'

const VIA_LABEL: Record<ViaAdministracion, string> = {
  oral: 'Oral',
  intramuscular: 'Intramuscular (IM)',
  subcutanea: 'Subcutánea (SC)',
  intravenosa: 'Intravenosa (IV)',
  topica: 'Tópica',
  oftalmica: 'Oftálmica',
  otica: 'Ótica',
}

const ESPECIE_LABEL: Record<string, string> = {
  canino: 'Canino',
  felino: 'Felino',
  ave: 'Ave',
  exotico: 'Exótico',
  otro: 'Otro',
}

const FORM_VACIO = {
  medicamento: '',
  dosis: '',
  via: 'oral' as ViaAdministracion,
  frecuencia: '',
  duracion: '',
  indicaciones: '',
}

/**
 * Modal de pantalla completa con dos paneles:
 * - Izquierdo (print:hidden): formulario para agregar/eliminar medicamentos.
 * - Derecho: vista previa de la receta lista para imprimir.
 */
export function RecetarioModal({
  historial: historialInicial,
  paciente,
  onClose,
  onChanged,
}: {
  historial: HistorialConDetalle
  paciente: PacienteConDueno
  onClose: () => void
  onChanged: () => void
}) {
  const clinica = useTable('clinicas')[0]
  const usuarios = useTable('usuarios')

  // Estado local de la receta para actualizarla sin recargar toda la página
  const [receta, setReceta] = useState<RecetaItem[]>(historialInicial.receta ?? [])
  const [form, setForm] = useState(FORM_VACIO)
  const [guardando, setGuardando] = useState(false)
  const [eliminandoId, setEliminandoId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  const vet = usuarios.find((u) => u.id === historialInicial.veterinario_id)
  const editable = historialInicial.editable

  const formularioValido =
    form.medicamento.trim() && form.dosis.trim() && form.frecuencia.trim() && form.duracion.trim()

  // Cerrar con Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Bloquear scroll del body.
  //
  // Se restaura el valor PREVIO, no cadena vacía: el recetario se abre desde la
  // ficha de consulta, que ya vive dentro de un `Modal` con el scroll
  // bloqueado. Al cerrar el recetario, vaciar el estilo devolvía el scroll a la
  // página de detrás con el modal padre todavía encima. Es el mismo patrón que
  // usa components/ui/Modal.
  useEffect(() => {
    const overflowPrevio = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = overflowPrevio }
  }, [])

  function set<K extends keyof typeof FORM_VACIO>(key: K, value: (typeof FORM_VACIO)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function agregar() {
    setError(null)
    setGuardando(true)
    try {
      const nuevo = await registrarRecetaItem(historialInicial.id, form)
      setReceta((prev) => [...prev, nuevo])
      setForm(FORM_VACIO)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo agregar el medicamento')
    } finally {
      setGuardando(false)
    }
  }

  async function eliminar(id: string) {
    setEliminandoId(id)
    try {
      await eliminarRecetaItem(id, historialInicial.id)
      setReceta((prev) => prev.filter((r) => r.id !== id))
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar el medicamento')
    } finally {
      setEliminandoId(null)
    }
  }

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex flex-col bg-slate-100 print:static print:bg-white"
    >
      {/* ── Barra superior (oculta al imprimir) ── */}
      <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6 py-3 shadow-sm print:hidden">
        <p className="text-sm font-semibold text-slate-700">
          Recetario médico
          {!editable && <span className="ml-2 text-[11px] font-normal text-slate-400">(consulta cerrada — solo lectura)</span>}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-700"
          >
            <Printer size={14} /> Generar PDF / Imprimir
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            title="Cerrar (Esc)"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* ── Cuerpo: formulario + vista previa ── */}
      <div className="flex flex-1 overflow-hidden print:overflow-visible">

        {/* ════ PANEL IZQUIERDO: formulario (oculto al imprimir) ════ */}
        <div className="flex w-full max-w-sm shrink-0 flex-col gap-4 overflow-y-auto border-r border-slate-200 bg-white p-5 print:hidden lg:max-w-md">
          <p className="text-xs font-bold uppercase tracking-widest text-teal-600">Medicamentos recetados</p>

          {/* Lista actual */}
          {receta.length === 0 ? (
            <p className="text-xs italic text-slate-400">Aún no hay medicamentos en esta receta.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {receta.map((item, idx) => (
                <li key={item.id} className="flex items-start gap-2 py-2 first:pt-0">
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-teal-600 text-[9px] font-bold text-white">
                    {idx + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-slate-800">{item.medicamento}</p>
                    <p className="text-[11px] text-slate-500">
                      {item.dosis} · {VIA_LABEL[item.via]} · {item.frecuencia} · {item.duracion}
                    </p>
                    {item.indicaciones && (
                      <p className="text-[11px] italic text-slate-400">{item.indicaciones}</p>
                    )}
                  </div>
                  {editable && (
                    <button
                      type="button"
                      onClick={() => eliminar(item.id)}
                      disabled={eliminandoId === item.id}
                      className="shrink-0 rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"
                      title="Eliminar"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {/* Formulario para agregar (solo si la consulta está abierta) */}
          {editable && (
            <div className="flex flex-col gap-3 border-t border-slate-200 pt-4">
              <p className="text-xs font-semibold text-slate-600">Agregar medicamento</p>

              {/* Medicamento */}
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-slate-500">Medicamento *</label>
                <input
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-800 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  value={form.medicamento}
                  onChange={(e) => set('medicamento', e.target.value)}
                  placeholder="Ej. Amoxicilina 250 mg"
                />
              </div>

              {/* Dosis + Vía */}
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="mb-1 block text-[11px] font-semibold text-slate-500">Dosis *</label>
                  <input
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-800 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                    value={form.dosis}
                    onChange={(e) => set('dosis', e.target.value)}
                    placeholder="Ej. 5 mg/kg"
                  />
                </div>
                <div className="w-36">
                  <label className="mb-1 block text-[11px] font-semibold text-slate-500">Vía</label>
                  <select
                    className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs text-slate-800 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                    value={form.via}
                    onChange={(e) => set('via', e.target.value as ViaAdministracion)}
                  >
                    {(Object.keys(VIA_LABEL) as ViaAdministracion[]).map((v) => (
                      <option key={v} value={v}>{VIA_LABEL[v]}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Frecuencia + Duración */}
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="mb-1 block text-[11px] font-semibold text-slate-500">Frecuencia *</label>
                  <input
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-800 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                    value={form.frecuencia}
                    onChange={(e) => set('frecuencia', e.target.value)}
                    placeholder="Ej. Cada 12 horas"
                  />
                </div>
                <div className="flex-1">
                  <label className="mb-1 block text-[11px] font-semibold text-slate-500">Duración *</label>
                  <input
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-800 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                    value={form.duracion}
                    onChange={(e) => set('duracion', e.target.value)}
                    placeholder="Ej. 7 días"
                  />
                </div>
              </div>

              {/* Indicaciones */}
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-slate-500">Indicaciones adicionales</label>
                <input
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-800 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  value={form.indicaciones}
                  onChange={(e) => set('indicaciones', e.target.value)}
                  placeholder="Ej. Administrar con comida"
                />
              </div>

              {error && <p className="text-xs font-bold text-rose-600">{error}</p>}

              <button
                type="button"
                onClick={agregar}
                disabled={!formularioValido || guardando}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
              >
                <Plus size={14} /> {guardando ? 'Agregando…' : 'Agregar medicamento'}
              </button>
            </div>
          )}
        </div>

        {/* ════ PANEL DERECHO: vista previa / documento imprimible ════ */}
        <div className="flex-1 overflow-y-auto bg-slate-200 p-6 print:overflow-visible print:bg-white print:p-0">

          {/* Estilos exclusivos de impresión */}
          <style>{`
            @media print {
              @page { size: A4; margin: 14mm 16mm 14mm 16mm; }
              body * { visibility: hidden; }
              #receta-print, #receta-print * { visibility: visible; }
              #receta-print { position: fixed; inset: 0; }
            }
          `}</style>

          <div
            id="receta-print"
            className="mx-auto max-w-[680px] overflow-hidden rounded-xl border-2 border-teal-700 bg-white shadow-2xl print:rounded-none print:border-0 print:shadow-none"
            style={{ fontFamily: "'Segoe UI', system-ui, sans-serif" }}
          >

            {/* ── CABECERA con fondo teal ── */}
            <header className="bg-teal-700 px-8 py-5 text-white print:px-6 print:py-4">
              <div className="flex items-start justify-between gap-4">
                {/* Logo + nombre */}
                <div>
                  <div className="mb-1 flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-lg font-black text-white">℞</span>
                    <h1 className="text-lg font-extrabold uppercase tracking-widest">
                      {clinica?.nombre ?? 'Clínica Veterinaria'}
                    </h1>
                  </div>
                  <p className="pl-10 text-[11px] font-medium uppercase tracking-widest text-teal-100">
                    Receta Médica Veterinaria
                  </p>
                </div>
                {/* Fecha + nº de consulta */}
                <div className="shrink-0 rounded-lg bg-white/15 px-4 py-2 text-right text-[11px] text-teal-50">
                  <p className="text-[10px] uppercase tracking-wider text-teal-200">Fecha de emisión</p>
                  <p className="text-sm font-bold text-white">{formatClinicDate(historialInicial.created_at)}</p>
                  <p className="mt-1 text-[10px] text-teal-200">Consulta #{historialInicial.id.slice(-6).toUpperCase()}</p>
                </div>
              </div>
            </header>

            {/* ── FRANJA TEAL CLARO: datos del médico ── */}
            <div className="border-b border-teal-100 bg-teal-50 px-8 py-2.5 print:px-6">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-0.5 text-[11px] text-teal-800">
                <span className="font-semibold">Médico Veterinario:</span>
                <span className="font-bold text-teal-900">{historialInicial.veterinario_nombre}</span>
                {vet?.whatsapp && (
                  <span className="text-teal-600">📞 {vet.whatsapp}</span>
                )}
              </div>
            </div>

            {/* ── DATOS DEL PACIENTE ── */}
            <section className="border-b border-slate-200 px-8 py-4 print:px-6">
              <p className="mb-2.5 text-[9px] font-bold uppercase tracking-[0.18em] text-slate-400">
                Datos del Paciente
              </p>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="grid grid-cols-3 gap-x-6 gap-y-1.5 text-[11px]">
                  <div>
                    <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">Paciente</span>
                    <span className="font-semibold text-slate-800">{paciente.nombre}</span>
                  </div>
                  <div>
                    <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">Especie / Raza</span>
                    <span className="font-semibold text-slate-800">
                      {ESPECIE_LABEL[paciente.especie] ?? paciente.especie}
                      {paciente.raza ? ` · ${paciente.raza}` : ''}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">Edad</span>
                    <span className="font-semibold text-slate-800">{calcularEdad(paciente.fecha_nacimiento)}</span>
                  </div>
                  <div>
                    <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">Propietario/a</span>
                    <span className="font-semibold text-slate-800">{paciente.cliente.nombre}</span>
                  </div>
                  <div>
                    <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">C.I.</span>
                    <span className="font-semibold text-slate-800">{paciente.cliente.ci}</span>
                  </div>
                  {historialInicial.diagnostico && (
                    <div className="col-span-3 mt-1 border-t border-slate-200 pt-1.5">
                      <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">Diagnóstico</span>
                      <span className="font-medium text-slate-700">{historialInicial.diagnostico}</span>
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* ── MEDICAMENTOS ── */}
            <section className="px-8 py-5 print:px-6">
              <div className="mb-4 flex items-center gap-3">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-teal-700 text-sm font-black text-white">℞</span>
                <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-400">
                  Medicamentos Prescritos
                </p>
              </div>

              {receta.length === 0 ? (
                <p className="py-4 text-center text-sm italic text-slate-300">
                  Sin medicamentos recetados en esta consulta.
                </p>
              ) : (
                <ol className="space-y-3">
                  {receta.map((item, idx) => (
                    <li
                      key={item.id}
                      className="overflow-hidden rounded-lg border border-slate-200 print:break-inside-avoid"
                    >
                      {/* Fila superior: número + nombre + vía */}
                      <div className="flex items-center gap-3 bg-slate-50 px-4 py-2.5">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-700 text-[10px] font-black text-white">
                          {idx + 1}
                        </span>
                        <p className="flex-1 text-sm font-bold text-slate-900">{item.medicamento}</p>
                        <span className="shrink-0 rounded-full border border-teal-200 bg-teal-50 px-2.5 py-0.5 text-[10px] font-semibold text-teal-700">
                          {VIA_LABEL[item.via]}
                        </span>
                      </div>
                      {/* Fila inferior: detalles */}
                      <div className="grid grid-cols-3 gap-px bg-slate-200">
                        <div className="bg-white px-4 py-2">
                          <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">Dosis</span>
                          <span className="text-[11px] font-semibold text-slate-700">{item.dosis}</span>
                        </div>
                        <div className="bg-white px-4 py-2">
                          <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">Frecuencia</span>
                          <span className="text-[11px] font-semibold text-slate-700">{item.frecuencia}</span>
                        </div>
                        <div className="bg-white px-4 py-2">
                          <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">Duración</span>
                          <span className="text-[11px] font-semibold text-slate-700">{item.duracion}</span>
                        </div>
                        {item.indicaciones && (
                          <div className="col-span-3 bg-amber-50 px-4 py-1.5">
                            <span className="text-[10px] font-medium text-amber-700">
                              ⚠ {item.indicaciones}
                            </span>
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            {/* ── PIE: firma + metadatos ── */}
            <footer className="border-t-2 border-dashed border-slate-200 px-8 pb-6 pt-5 print:px-6">
              <div className="flex items-end justify-between gap-4">
                {/* Metadatos */}
                <div className="space-y-0.5 text-[9px] text-slate-400">
                  <p>Emitido: {formatClinicDateTime(historialInicial.created_at)}</p>
                  <p>Generado por Vetora Software · {formatClinicDate(new Date().toISOString())}</p>
                  {historialInicial.editable && (
                    <p className="font-bold text-amber-500">⚠ Borrador — consulta no finalizada</p>
                  )}
                </div>
                {/* Firma */}
                <div className="shrink-0 text-center">
                  <div className="mx-auto mb-1 h-12 w-48 border-b-2 border-slate-400" />
                  <p className="text-[10px] font-bold text-slate-700">{historialInicial.veterinario_nombre}</p>
                  <p className="text-[9px] uppercase tracking-wider text-slate-400">Médico Veterinario · Firma y Sello</p>
                </div>
              </div>
            </footer>

          </div>
        </div>

      </div>
    </div>
  )
}
