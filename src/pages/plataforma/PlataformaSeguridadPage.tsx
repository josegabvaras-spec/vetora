import { useCallback, useEffect, useState } from 'react'
import { ShieldCheck, ShieldAlert, Sparkles, Clock, Search } from 'lucide-react'
import { AvisoError } from '../../components/ui/AvisoError'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Seccion } from '../../components/ui/Seccion'
import { TablaResponsive, type Columna } from '../../components/ui/Tabla'
import {
  analizarConIa,
  analizarEventos,
  listEventosSeguridad,
} from '../../services/seguridad'
import { formatClinicDateTime } from '../../lib/datetime'
import type { EventoSeguridad, SeveridadEvento } from '../../types/database'
import type { AnalisisSeguridadIa, AnomaliaSeguridad } from '../../types/views'

/**
 * Security Center — la pantalla del operador (fase 4).
 *
 * Enseña tres cosas, en este orden y no por casualidad:
 *
 *   1. Lo que las reglas marcaron (gratis, siempre visible).
 *   2. El análisis del modelo, **solo si se pide** — porque cuesta.
 *   3. La bitácora cruda, para comprobar cualquiera de las dos.
 *
 * ⚠️ **No hay un solo botón que ejecute una acción de seguridad.** Ni
 * desactivar una cuenta, ni suspender una clínica, ni cerrar una sesión. Es
 * deliberado y coincide con lo que la Edge Function ya garantiza por su cuenta:
 * el análisis explica y recomienda; quien actúa entra al panel correspondiente
 * y lo hace a mano, con el contexto delante. Un botón de «contener» aquí
 * convertiría una lectura probabilística en una acción irreversible a un clic.
 */

const TONO_SEVERIDAD: Record<SeveridadEvento, 'rose' | 'amber' | 'teal' | 'slate'> = {
  critica: 'rose',
  alta: 'rose',
  media: 'amber',
  baja: 'teal',
  info: 'slate',
}

/** Los nombres de regla que devuelve `0079`, en lenguaje de persona. */
const REGLA_LABEL: Record<string, string> = {
  exportaciones_repetidas: 'Exportaciones repetidas',
  escalada_a_admin: 'Ascenso a administrador',
  bajas_en_rafaga: 'Bajas de personal en ráfaga',
  actividad_de_madrugada: 'Actividad sensible de madrugada',
  rafaga_de_accesos: 'Ráfaga de accesos',
}

/** Igual para los tipos de evento de la bitácora (`0078`). */
const EVENTO_LABEL: Record<string, string> = {
  login_exitoso: 'Inicio de sesión',
  password_cambiado: 'Cambio de contraseña',
  mfa_activado: 'Segundo factor activado',
  mfa_desactivado: 'Segundo factor desactivado',
  sesion_bloqueada: 'Sesión bloqueada',
  rol_cambiado: 'Cambio de rol',
  usuario_activado: 'Usuario activado',
  usuario_desactivado: 'Usuario desactivado',
  usuario_borrado: 'Usuario borrado',
  usuario_creado: 'Usuario creado',
  clinica_suspendida: 'Clínica suspendida',
  clinica_reactivada: 'Clínica reactivada',
  clinica_borrada: 'Clínica borrada',
  respaldo_exportado: 'Respaldo exportado',
  cuenta_portal_vinculada: 'Cuenta de portal vinculada',
  cuenta_portal_desvinculada: 'Cuenta de portal desvinculada',
}

const VENTANAS = [
  { horas: 24, label: '24 horas' },
  { horas: 72, label: '3 días' },
  { horas: 168, label: '7 días' },
]

export function PlataformaSeguridadPage() {
  const [horas, setHoras] = useState(24)
  const [anomalias, setAnomalias] = useState<AnomaliaSeguridad[]>([])
  const [eventos, setEventos] = useState<EventoSeguridad[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [analisis, setAnalisis] = useState<AnalisisSeguridadIa | null>(null)
  const [motivoAnalisis, setMotivoAnalisis] = useState<string | null>(null)
  const [analizando, setAnalizando] = useState(false)
  const [errorAnalisis, setErrorAnalisis] = useState<string | null>(null)

  const recargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      // Las dos son gratis: reglas en SQL y la bitácora. Nada de esto llama al
      // modelo — eso solo pasa cuando se pulsa el botón de analizar.
      const [a, e] = await Promise.all([analizarEventos(horas), listEventosSeguridad(50)])
      setAnomalias(a)
      setEventos(e)
    } catch (e) {
      // Se muestra el fallo en vez de dejar las listas vacías: una pantalla de
      // seguridad en blanco se lee como «no hay nada raro», que es justo la
      // conclusión contraria a la correcta si lo que pasó es que falló la
      // consulta (misma lección que VUL-41).
      setError(e instanceof Error ? e.message : 'No se pudo cargar la seguridad')
    } finally {
      setCargando(false)
    }
  }, [horas])

  useEffect(() => {
    void recargar()
  }, [recargar])

  // Cambiar de ventana invalida el análisis anterior: se hizo sobre otro
  // periodo y dejarlo en pantalla haría creer que describe lo que se ve ahora.
  useEffect(() => {
    setAnalisis(null)
    setMotivoAnalisis(null)
    setErrorAnalisis(null)
  }, [horas])

  async function pedirAnalisis() {
    setAnalizando(true)
    setErrorAnalisis(null)
    try {
      const resultado = await analizarConIa(horas)
      setAnalisis(resultado.analisis)
      setMotivoAnalisis(resultado.motivo)
      setAnomalias(resultado.anomalias)
    } catch (e) {
      setErrorAnalisis(e instanceof Error ? e.message : 'No se pudo analizar')
    } finally {
      setAnalizando(false)
    }
  }

  const columnasAnomalias: Columna<AnomaliaSeguridad>[] = [
    {
      clave: 'regla',
      cabecera: 'Patrón',
      movil: 'titulo',
      celda: (a: AnomaliaSeguridad) => (
        <span className="font-semibold text-slate-800">{REGLA_LABEL[a.regla] ?? a.regla}</span>
      ),
    },
    {
      clave: 'severidad',
      cabecera: 'Severidad',
      movil: 'destacado',
      celda: (a: AnomaliaSeguridad) => <Badge tone={TONO_SEVERIDAD[a.severidad]}>{a.severidad}</Badge>,
    },
    {
      clave: 'eventos',
      cabecera: 'Eventos',
      movil: 'destacado',
      celda: (a: AnomaliaSeguridad) => <span className="tabular-nums">{a.eventos}</span>,
    },
    {
      clave: 'ultimo',
      cabecera: 'Último',
      movil: 'detalle',
      celda: (a: AnomaliaSeguridad) => <span className="text-slate-500">{formatClinicDateTime(a.ultimo)}</span>,
    },
    {
      clave: 'clinica_id',
      cabecera: 'Clínica',
      movil: 'detalle',
      celda: (a: AnomaliaSeguridad) => (
        <span className="font-mono text-[11px] text-slate-400">
          {a.clinica_id ? a.clinica_id.slice(0, 8) : 'plataforma'}
        </span>
      ),
    },
  ]

  const columnasEventos: Columna<EventoSeguridad>[] = [
    {
      clave: 'tipo',
      cabecera: 'Evento',
      movil: 'titulo',
      celda: (e: EventoSeguridad) => <span className="font-medium">{EVENTO_LABEL[e.tipo] ?? e.tipo}</span>,
    },
    {
      clave: 'severidad',
      cabecera: 'Severidad',
      movil: 'destacado',
      celda: (e: EventoSeguridad) => (
        <Badge tone={TONO_SEVERIDAD[e.severidad]} size="sm">
          {e.severidad}
        </Badge>
      ),
    },
    {
      clave: 'created_at',
      cabecera: 'Cuándo',
      movil: 'detalle',
      celda: (e: EventoSeguridad) => <span className="text-slate-500">{formatClinicDateTime(e.created_at)}</span>,
    },
    {
      clave: 'clinica_id',
      cabecera: 'Clínica',
      movil: 'detalle',
      celda: (e: EventoSeguridad) => (
        <span className="font-mono text-[11px] text-slate-400">
          {e.clinica_id ? e.clinica_id.slice(0, 8) : 'plataforma'}
        </span>
      ),
    },
  ]

  const hayAnomalias = anomalias.length > 0

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">Seguridad</h1>
          <p className="text-sm text-slate-500">
            Lo que el sistema registró y lo que las reglas marcaron. Ninguna acción se ejecuta desde
            aquí.
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1">
          {VENTANAS.map((v) => (
            <button
              key={v.horas}
              type="button"
              onClick={() => setHoras(v.horas)}
              className={
                horas === v.horas
                  ? 'rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-slate-900 shadow-sm'
                  : 'rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700'
              }
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      <AvisoError mensaje={error} />

      {/* ── 1. Lo que marcaron las reglas ── */}
      <Seccion
        titulo={hayAnomalias ? `Patrones detectados (${anomalias.length})` : 'Patrones detectados'}
      >
        {cargando ? (
          <p className="py-6 text-center text-sm text-slate-400">Analizando…</p>
        ) : hayAnomalias ? (
          <TablaResponsive
            columnas={columnasAnomalias}
            filas={anomalias}
            claveDe={(a) => `${a.regla}-${a.usuario_id ?? "sin-usuario"}-${a.ultimo}`}
          />
        ) : (
          <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <ShieldCheck size={20} className="shrink-0 text-emerald-600" />
            <div>
              <p className="text-sm font-semibold text-emerald-800">Sin patrones anómalos</p>
              <p className="text-xs text-emerald-700">
                Ninguna de las cinco reglas encontró nada en esta ventana. Es la respuesta normal.
              </p>
            </div>
          </div>
        )}
      </Seccion>

      {/* ── 2. El análisis del modelo, bajo demanda ── */}
      <Seccion titulo="Análisis con IA">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <Button onClick={pedirAnalisis} disabled={analizando || cargando}>
            <Sparkles size={16} />
            {analizando ? 'Analizando…' : 'Analizar con IA'}
          </Button>
          <p className="text-xs text-slate-500">
            {hayAnomalias
              ? 'Interpreta los patrones de arriba. Consume una llamada al modelo.'
              : 'Sin patrones no hay llamada al modelo, así que no cuesta nada comprobarlo.'}
          </p>
        </div>

        <AvisoError mensaje={errorAnalisis} />

        {motivoAnalisis === 'sin_anomalias' && !analisis && (
          <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            No había nada que analizar en esta ventana, así que no se llamó al modelo.
          </p>
        )}

        {motivoAnalisis === 'sin_respuesta_del_modelo' && !analisis && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            El modelo no devolvió un análisis utilizable. No se inventa uno: los patrones de arriba
            siguen siendo válidos y se pueden revisar a mano.
          </p>
        )}

        {analisis && (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge tone={TONO_SEVERIDAD[analisis.severidad]}>{analisis.severidad}</Badge>
                <Badge tone="slate" size="sm">
                  riesgo {analisis.riesgo}/100
                </Badge>
                <Badge tone="slate" size="sm">
                  confianza {Math.round(analisis.confianza * 100)}%
                </Badge>
                {analisis.requiere_revision_humana && (
                  <Badge tone="amber" size="sm">
                    requiere revisión
                  </Badge>
                )}
              </div>
              <p className="text-sm leading-relaxed text-slate-700">{analisis.resumen}</p>
            </div>

            {analisis.hallazgos.map((h, i) => (
              <div key={i} className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="mb-2 text-sm font-bold text-slate-900">{h.patron}</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                      Explicación probable
                    </p>
                    <p className="text-xs text-slate-600">{h.explicacion_probable}</p>
                  </div>
                  <div className="rounded-lg bg-rose-50/60 p-3">
                    <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-rose-700">
                      Si fuera un problema
                    </p>
                    <p className="text-xs text-rose-800">{h.explicacion_preocupante}</p>
                  </div>
                </div>
                <div className="mt-3 flex items-start gap-2 rounded-lg border border-teal-200 bg-teal-50 p-3">
                  <Search size={15} className="mt-0.5 shrink-0 text-teal-700" />
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-teal-700">
                      Cómo distinguirlo
                    </p>
                    <p className="text-xs text-teal-900">{h.que_lo_distinguiria}</p>
                  </div>
                </div>
              </div>
            ))}

            {analisis.recomendaciones.length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="mb-2 text-sm font-bold text-slate-900">Qué hacer</p>
                <ol className="list-decimal space-y-1.5 pl-5 text-sm text-slate-600">
                  {analisis.recomendaciones.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ol>
                <p className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
                  <ShieldAlert size={14} className="shrink-0" />
                  Nada de esto se ejecuta solo. Estos pasos los realiza una persona desde el panel
                  que corresponda.
                </p>
              </div>
            )}
          </div>
        )}
      </Seccion>

      {/* ── 3. La bitácora cruda ── */}
      <Seccion titulo="Últimos eventos registrados">
        {eventos.length === 0 && !cargando ? (
          <p className="flex items-center gap-2 py-6 text-center text-sm text-slate-400">
            <Clock size={16} /> Todavía no hay eventos registrados.
          </p>
        ) : (
          <TablaResponsive columnas={columnasEventos} filas={eventos} claveDe={(e) => e.id} />
        )}
      </Seccion>
    </div>
  )
}
