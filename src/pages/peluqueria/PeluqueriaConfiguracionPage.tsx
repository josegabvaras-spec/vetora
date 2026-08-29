import { useEffect, useState } from 'react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { FieldGroup, Input, Textarea } from '../../components/ui/Field'
import { Save, Plus, Trash2, CheckCircle2 } from 'lucide-react'
import { getConfiguracionPeluqueria, guardarConfiguracionPeluqueria } from '../../services/peluqueria'
import type { SuplementoOrden } from '../../types/database'
import { formatBs } from '../../lib/currency'

export function PeluqueriaConfiguracionPage() {
  const [tiempoBloqueo, setTiempoBloqueo] = useState(45)
  const [intervaloRecordatorio, setIntervaloRecordatorio] = useState(30)
  const [suplementos, setSuplementos] = useState<SuplementoOrden[]>([])
  const [mensajeListo, setMensajeListo] = useState('')
  const [mensajeRecordatorio, setMensajeRecordatorio] = useState('')

  const [nuevoConcepto, setNuevoConcepto] = useState('')
  const [nuevoMonto, setNuevoMonto] = useState('')

  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [guardadoExito, setGuardadoExito] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getConfiguracionPeluqueria()
      .then((cfg) => {
        setTiempoBloqueo(cfg.tiempo_bloqueo_default_min || 45)
        setIntervaloRecordatorio(cfg.intervalo_recordatorio_dias || 30)
        setSuplementos(cfg.suplementos_predeterminados || [])
        setMensajeListo(cfg.mensaje_listo_whatsapp || '')
        setMensajeRecordatorio(cfg.mensaje_recordatorio_whatsapp || '')
      })
      .finally(() => setCargando(false))
  }, [])

  function agregarSuplemento() {
    if (!nuevoConcepto.trim()) return
    const m = parseFloat(nuevoMonto) || 0
    if (m <= 0) return
    setSuplementos([...suplementos, { concepto: nuevoConcepto.trim(), monto_bs: m }])
    setNuevoConcepto('')
    setNuevoMonto('')
  }

  function quitarSuplemento(idx: number) {
    setSuplementos(suplementos.filter((_, i) => i !== idx))
  }

  async function handleGuardar(e: React.FormEvent) {
    e.preventDefault()
    setGuardando(true)
    setError(null)
    setGuardadoExito(false)

    try {
      await guardarConfiguracionPeluqueria({
        tiempo_bloqueo_default_min: tiempoBloqueo,
        intervalo_recordatorio_dias: intervaloRecordatorio,
        suplementos_predeterminados: suplementos,
        mensaje_listo_whatsapp: mensajeListo,
        mensaje_recordatorio_whatsapp: mensajeRecordatorio,
      })
      setGuardadoExito(true)
      setTimeout(() => setGuardadoExito(false), 3000)
    } catch (err: any) {
      setError(err.message || 'Error al guardar configuración')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Cabecera Principal */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">
            Configuración de Peluquería
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Tiempos por defecto de agenda, suplementos predefinidos y plantillas de mensajería para clientes.
          </p>
        </div>
      </div>

      {guardadoExito && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 p-3.5 text-xs font-semibold text-emerald-800">
          <CheckCircle2 size={16} className="text-emerald-600" />
          <span>Configuración guardada correctamente.</span>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs font-semibold text-red-700">
          {error}
        </div>
      )}

      {cargando ? (
        <p className="text-center py-12 text-xs text-slate-500">Cargando configuración...</p>
      ) : (
        <form onSubmit={handleGuardar} className="space-y-6">
          {/* Tiempos Operativos */}
          <Card className="p-5 border-slate-200 space-y-4">
            <h2 className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-2">
              Tiempos y Frecuencias Operativas
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FieldGroup label="Duración por Defecto de Bloqueo en Agenda (minutos)">
                <Input
                  type="number"
                  min="15"
                  step="15"
                  value={tiempoBloqueo}
                  onChange={(e) => setTiempoBloqueo(parseInt(e.target.value) || 45)}
                  required
                />
              </FieldGroup>

              <FieldGroup label="Intervalo de Recordatorio de Visita (días)">
                <Input
                  type="number"
                  min="7"
                  max="180"
                  value={intervaloRecordatorio}
                  onChange={(e) => setIntervaloRecordatorio(parseInt(e.target.value) || 30)}
                  required
                />
              </FieldGroup>
            </div>
          </Card>

          {/* Suplementos Predefinidos */}
          <Card className="p-5 border-slate-200 space-y-4">
            <h2 className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-2">
              Catálogo de Suplementos y Recargos Frecuentes
            </h2>

            <div className="space-y-2">
              {suplementos.map((sup, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-xs"
                >
                  <span className="font-semibold text-slate-800">{sup.concepto}</span>
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-teal-800">{formatBs(sup.monto_bs)}</span>
                    <button
                      type="button"
                      onClick={() => quitarSuplemento(idx)}
                      className="text-slate-400 hover:text-red-600 transition-colors"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2 pt-2">
              <Input
                placeholder="Nombre del nuevo suplemento..."
                value={nuevoConcepto}
                onChange={(e) => setNuevoConcepto(e.target.value)}
                className="text-xs"
              />
              <div className="w-28 shrink-0">
                <Input
                  type="number"
                  placeholder="Bs."
                  step="1"
                  min="0"
                  value={nuevoMonto}
                  onChange={(e) => setNuevoMonto(e.target.value)}
                  className="text-xs"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={agregarSuplemento}
                disabled={!nuevoConcepto.trim() || !nuevoMonto}
              >
                <Plus size={14} className="mr-1" />
                <span>Agregar</span>
              </Button>
            </div>
          </Card>

          {/* Plantillas de WhatsApp */}
          <Card className="p-5 border-slate-200 space-y-4">
            <h2 className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-2">
              Plantillas de Notificaciones por WhatsApp
            </h2>

            <div className="space-y-4">
              <FieldGroup label="Mensaje cuando la mascota está lista para recoger">
                <Textarea
                  rows={3}
                  value={mensajeListo}
                  onChange={(e) => setMensajeListo(e.target.value)}
                  placeholder="Variables disponibles: {clinica}, {mascota}, {dueno}"
                />
                <p className="text-[11px] text-slate-400">
                  Usa <code className="text-teal-700">{'{mascota}'}</code>, <code className="text-teal-700">{'{dueno}'}</code> y <code className="text-teal-700">{'{clinica}'}</code> para sustitución dinámica.
                </p>
              </FieldGroup>

              <FieldGroup label="Mensaje de recordatorio de servicio / fidelización">
                <Textarea
                  rows={3}
                  value={mensajeRecordatorio}
                  onChange={(e) => setMensajeRecordatorio(e.target.value)}
                  placeholder="Variables disponibles: {clinica}, {mascota}, {dueno}, {dias}, {servicio}"
                />
                <p className="text-[11px] text-slate-400">
                  Usa <code className="text-teal-700">{'{mascota}'}</code>, <code className="text-teal-700">{'{dias}'}</code> y <code className="text-teal-700">{'{servicio}'}</code> para sustitución dinámica.
                </p>
              </FieldGroup>
            </div>
          </Card>

          <div className="flex justify-end">
            <Button type="submit" variant="primary" disabled={guardando}>
              <Save size={16} className="mr-1.5" />
              <span>{guardando ? 'Guardando configuración...' : 'Guardar Cambios'}</span>
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}
