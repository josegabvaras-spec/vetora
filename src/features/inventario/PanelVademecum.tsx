import { useCallback, useEffect, useState } from 'react'
import { BookOpen, Pencil, Plus, Trash2 } from 'lucide-react'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Field'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { TablaResponsive, type Columna } from '../../components/ui/Tabla'
import { useAuth } from '../../context/useAuth'
import { eliminarFichaVademecum, listVademecum } from '../../services/vademecum'
import { describirDosis, dosisParaPeso, UNIDAD_LABEL } from '../../lib/vademecum'
import { VademecumModal } from './VademecumModal'
import type { FichaVademecum } from '../../types/database'

/**
 * El vademécum propio de la clínica: sus medicamentos con la concentración y el
 * rango de dosis que ella fija.
 *
 * Vive dentro de `/inventario` como una sección más, junto a Lotes, Proveedores
 * y Compras, porque habla de los mismos fármacos — pero **no cuelga de
 * `productos`**: esa tabla es por sucursal y la dosis de un fármaco no cambia
 * según la sede (ver la cabecera de la migración 0042).
 *
 * ⚠️ **Escribirlo es de `admin` y `veterinario`**, y la barrera está en la RLS
 * (`auth_es_clinico()`), no aquí. Ocultar los botones a recepción y al
 * peluquero es convención de pantalla, como en el resto del proyecto: evita
 * ofrecer un formulario que iba a devolver 403.
 */

const ESPECIE_LABEL: Record<FichaVademecum['especie'], string> = {
  todos: 'Todas',
  canino: 'Canino',
  felino: 'Felino',
}

const VIA_LABEL: Record<FichaVademecum['via'], string> = {
  oral: 'Oral',
  intramuscular: 'Intramuscular',
  subcutanea: 'Subcutánea',
  intravenosa: 'Intravenosa',
  topica: 'Tópica',
  oftalmica: 'Oftálmica',
  otica: 'Ótica',
}

export function PanelVademecum({ conCabecera = true }: { conCabecera?: boolean }) {
  const { usuario } = useAuth()
  const [fichas, setFichas] = useState<FichaVademecum[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [editando, setEditando] = useState<FichaVademecum | null>(null)
  const [creando, setCreando] = useState(false)
  const [borrando, setBorrando] = useState<FichaVademecum | null>(null)

  // Una calculadora, no un campo de la ficha: se escribe un peso y la tabla
  // enseña qué dosis sale para ESE paciente. Es el motivo de que la
  // concentración esté en la ficha.
  const [pesoKg, setPesoKg] = useState('')

  const puedeEditar = usuario?.rol === 'admin' || usuario?.rol === 'veterinario'
  const peso = Number(pesoKg) || null

  const recargar = useCallback(async () => {
    setCargando(true)
    try {
      setFichas(await listVademecum())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el vademécum')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    recargar()
  }, [recargar])

  const termino = busqueda.trim().toLowerCase()
  const filtradas = termino
    ? fichas.filter(
        (f) =>
          f.nombre.toLowerCase().includes(termino) ||
          f.principio_activo.toLowerCase().includes(termino),
      )
    : fichas

  const columnas: Columna<FichaVademecum>[] = [
    {
      clave: 'nombre',
      cabecera: 'Medicamento',
      movil: 'titulo',
      celda: (f) => (
        <div className="min-w-0">
          <p className="font-bold text-slate-800 break-words">{f.nombre}</p>
          {f.principio_activo && (
            <p className="mt-0.5 text-xs text-slate-500 break-words">{f.principio_activo}</p>
          )}
          {f.presentacion && <p className="mt-0.5 text-xs text-slate-400">{f.presentacion}</p>}
        </div>
      ),
    },
    {
      clave: 'especie',
      cabecera: 'Especie',
      movil: 'destacado',
      celda: (f) => (
        <div className="space-y-1">
          <Badge tone={f.especie === 'todos' ? 'slate' : 'teal'} size="sm">
            {ESPECIE_LABEL[f.especie]}
          </Badge>
          {!f.activo && (
            <Badge tone="amber" size="sm">
              Retirada
            </Badge>
          )}
        </div>
      ),
    },
    {
      clave: 'dosis',
      cabecera: 'Dosis',
      celda: (f) => {
        const rango =
          f.dosis_min_mg_kg == null && f.dosis_max_mg_kg == null
            ? null
            : f.dosis_min_mg_kg === f.dosis_max_mg_kg || f.dosis_max_mg_kg == null
              ? `${f.dosis_min_mg_kg} mg/kg`
              : f.dosis_min_mg_kg == null
                ? `${f.dosis_max_mg_kg} mg/kg`
                : `${f.dosis_min_mg_kg} – ${f.dosis_max_mg_kg} mg/kg`
        const calculada = peso ? dosisParaPeso(f, peso) : null
        return (
          <div className="min-w-0">
            {/* Sin rango se dice que la ficha no lo trae, no se pinta un cero:
                un cero se leería como «no le des nada». */}
            <p className={rango ? 'font-semibold text-slate-800' : 'text-xs text-slate-400'}>
              {rango ?? 'Sin rango anotado'}
            </p>
            {calculada && (
              <p className="mt-0.5 text-xs font-bold text-teal-700 break-words">
                Para {peso} kg: {describirDosis(calculada)}
              </p>
            )}
            {f.frecuencia && <p className="mt-0.5 text-xs text-slate-500">{f.frecuencia}</p>}
          </div>
        )
      },
    },
    {
      clave: 'via',
      cabecera: 'Vía',
      celda: (f) => <span className="text-xs text-slate-600">{VIA_LABEL[f.via]}</span>,
    },
    {
      clave: 'concentracion',
      cabecera: 'Concentración',
      celda: (f) =>
        f.concentracion_mg ? (
          <span className="text-xs text-slate-600">
            {f.concentracion_mg} mg / {UNIDAD_LABEL[f.unidad_dosificacion].replace(/s$/, '')}
          </span>
        ) : (
          <span className="text-xs text-slate-400">—</span>
        ),
    },
    {
      clave: 'contraindicaciones',
      cabecera: 'Contraindicaciones',
      celda: (f) =>
        f.contraindicaciones ? (
          <span className="text-xs text-rose-700 break-words">{f.contraindicaciones}</span>
        ) : (
          <span className="text-xs text-slate-400">—</span>
        ),
    },
    ...(puedeEditar
      ? [
          {
            clave: 'acciones',
            cabecera: '',
            movil: 'acciones' as const,
            alineadaDerecha: true,
            celda: (f: FichaVademecum) => (
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={() => setEditando(f)}>
                  <Pencil size={13} className="mr-1" /> Editar
                </Button>
                <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={() => setBorrando(f)}>
                  <Trash2 size={13} className="mr-1" /> Eliminar
                </Button>
              </div>
            ),
          },
        ]
      : []),
  ]

  return (
    <div className="space-y-4">
      {conCabecera && (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-black tracking-tight text-slate-900">Vademécum</h1>
            <p className="mt-0.5 text-xs text-slate-500">
              Los medicamentos de la clínica, con su concentración y su rango de dosis.
            </p>
          </div>
        </div>
      )}

      {error && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            placeholder="Buscar por nombre o principio activo…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="sm:w-72"
          />
          <Input
            type="number"
            min="0"
            step="0.1"
            placeholder="Peso del paciente (kg)"
            value={pesoKg}
            onChange={(e) => setPesoKg(e.target.value)}
            className="sm:w-52"
          />
        </div>
        {puedeEditar && (
          <Button onClick={() => setCreando(true)}>
            <Plus size={15} className="mr-1.5" /> Nueva ficha
          </Button>
        )}
      </div>

      {/* La calculadora se explica sola solo cuando hay un peso puesto. */}
      {peso && (
        <p className="rounded-lg border border-teal-200 bg-teal-50/70 px-3 py-2 text-xs font-medium text-teal-900">
          Mostrando la dosis que sale para <strong>{peso} kg</strong> según el rango de cada ficha.
          Es una comprobación para que la revise un veterinario, no una indicación.
        </p>
      )}

      <Card padding="none" className="overflow-hidden shadow-md">
        {cargando ? (
          <p className="px-5 py-12 text-center text-sm text-slate-400">Cargando el vademécum…</p>
        ) : (
          <TablaResponsive
            columnas={columnas}
            filas={filtradas}
            claveDe={(f) => f.id}
            vacio={
              <span className="flex flex-col items-center gap-2 text-slate-400">
                <BookOpen size={32} className="opacity-20" />
                {termino
                  ? 'Ningún medicamento coincide con esa búsqueda.'
                  : puedeEditar
                    ? 'Todavía no hay medicamentos. Empieza por los que más recetas.'
                    : 'Todavía no hay medicamentos cargados.'}
              </span>
            }
          />
        )}
      </Card>

      {(creando || editando) && (
        <VademecumModal
          ficha={editando}
          onClose={() => {
            setCreando(false)
            setEditando(null)
          }}
          onGuardado={() => {
            setCreando(false)
            setEditando(null)
            recargar()
          }}
        />
      )}

      {borrando && (
        <ConfirmDialog
          title="Eliminar del vademécum"
          description={`«${borrando.nombre}» dejará de aparecer en el recetario y de servirle al asistente como referencia. Las recetas ya emitidas no cambian: guardan su texto propio. Si solo quieres dejar de usarlo, edítalo y márcalo como retirado.`}
          confirmLabel="Eliminar"
          onCancel={() => setBorrando(null)}
          onConfirm={async () => {
            try {
              await eliminarFichaVademecum(borrando.id)
              setBorrando(null)
              recargar()
            } catch (e) {
              setError(e instanceof Error ? e.message : 'No se pudo eliminar')
              setBorrando(null)
            }
          }}
        />
      )}
    </div>
  )
}
