import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Printer } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { useTable } from '../mocks/useDb'
import { getCita } from '../services/citas'
import { calcularEdad } from '../lib/paciente'
import { formatClinicDate, formatClinicDateTime } from '../lib/datetime'
import type { CitaConDetalle } from '../types/views'

const ESPECIE_LABEL: Record<string, string> = {
  canino: 'Canino',
  felino: 'Felino',
  ave: 'Ave',
  exotico: 'Exótico',
  otro: 'Otro',
}

const METODO_LABEL: Record<string, string> = {
  firma_digital: 'Firma digital en tableta',
  firma_fisica_escaneada: 'Firma física escaneada',
  aceptacion_verbal_registrada: 'Aceptación verbal registrada',
}

export function ConsentimientoPage() {
  const { citaId } = useParams<{ citaId: string }>()
  const [cita, setCita] = useState<CitaConDetalle | null | undefined>(undefined)
  const clinica = useTable('clinicas')[0]
  const sucursales = useTable('sucursales')

  useEffect(() => {
    if (!citaId) return
    getCita(citaId).then(setCita)
  }, [citaId])

  if (cita === undefined) {
    return <p className="p-6 text-sm text-slate-500">Cargando consentimiento…</p>
  }

  if (!cita) {
    return (
      <div className="mx-auto max-w-lg space-y-4 p-6 text-center">
        <p className="text-sm text-slate-500">No se encontró la cita solicitada.</p>
        <Link to="/agenda" className="inline-flex items-center gap-1 text-sm text-teal-700 hover:underline">
          <ArrowLeft size={16} /> Volver a la agenda
        </Link>
      </div>
    )
  }

  const sucursal = sucursales.find((s) => s.id === cita.sucursal_id)
  // Si aún no fue aceptado, se imprime como borrador para recoger la firma física.
  const consentimiento = cita.consentimiento
  const procedimiento = cita.servicio_nombre || 'Procedimiento quirúrgico'

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4 print:hidden">
        <Link to="/agenda" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft size={16} /> Volver a la agenda
        </Link>
        <Button onClick={() => window.print()}>
          <Printer size={16} /> Imprimir / Guardar PDF
        </Button>
      </div>

      <div className="mx-auto max-w-3xl bg-white p-10 shadow-sm print:shadow-none print:p-0">
        <header className="mb-8 border-b border-slate-200 pb-6 text-center">
          <h1 className="text-lg font-bold uppercase tracking-wide text-slate-800">
            Consentimiento informado para procedimiento quirúrgico
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {clinica?.nombre ?? ""} {sucursal ? `— ${sucursal.nombre}` : ''}
          </p>
          {sucursal && <p className="text-xs text-slate-400">{sucursal.direccion}</p>}
          {!consentimiento && (
            <p className="mx-auto mt-4 w-fit rounded border border-slate-400 px-3 py-1 text-xs font-bold uppercase tracking-widest text-slate-500">
              Borrador — pendiente de firma
            </p>
          )}
        </header>

        <section className="mb-6 grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
          <div>
            <p className="text-xs font-semibold uppercase text-slate-400">Paciente</p>
            <p className="text-slate-800">{cita.paciente.nombre}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-slate-400">Especie / Raza</p>
            <p className="text-slate-800">
              {ESPECIE_LABEL[cita.paciente.especie]} · {cita.paciente.raza}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-slate-400">Edad</p>
            <p className="text-slate-800">{calcularEdad(cita.paciente.fecha_nacimiento)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-slate-400">Propietario/a</p>
            <p className="text-slate-800">{cita.paciente.cliente.nombre}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-slate-400">CI</p>
            <p className="text-slate-800">{cita.paciente.cliente.ci || '—'}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-slate-400">WhatsApp de contacto</p>
            <p className="text-slate-800">{cita.paciente.cliente.whatsapp}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-slate-400">Fecha del procedimiento</p>
            <p className="text-slate-800">{formatClinicDateTime(cita.fecha_hora)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-slate-400">Veterinario/a responsable</p>
            <p className="text-slate-800">{cita.veterinario_nombre}</p>
          </div>
        </section>

        {/* El procedimiento concreto va destacado: un consentimiento debe decir
            qué cirugía se autoriza, no solo que hay una. */}
        <section className="mb-6 border border-slate-400 px-3 py-2">
          <p className="text-xs font-semibold uppercase text-slate-400">Procedimiento a realizar</p>
          <p className="text-base font-bold text-slate-900">{procedimiento}</p>
        </section>

        <section className="mb-8 space-y-3 text-sm leading-relaxed text-slate-700">
          <p>
            Yo, <strong>{cita.paciente.cliente.nombre}</strong>, en calidad de propietario/a o tutor/a responsable del
            paciente <strong>{cita.paciente.nombre}</strong>, declaro haber sido informado/a de manera clara por el
            equipo veterinario de {clinica?.nombre ?? ""} sobre la naturaleza del procedimiento{' '}
            <strong>{procedimiento}</strong> a realizarse, sus riesgos inherentes (incluyendo pero no limitados a reacciones anestésicas, hemorragias o complicaciones
            postoperatorias), los beneficios esperados y las alternativas de tratamiento disponibles.
          </p>
          <p>
            Habiendo tenido la oportunidad de resolver mis dudas, otorgo mi consentimiento informado y voluntario para
            que el equipo veterinario realice el procedimiento descrito, incluyendo los actos anestésicos y
            complementarios que a su criterio profesional resulten necesarios durante la intervención.
          </p>
          {consentimiento ? (
            <p>
              Este documento fue aceptado mediante: <strong>{METODO_LABEL[consentimiento.metodo_aceptacion]}</strong>, el{' '}
              {formatClinicDateTime(consentimiento.created_at)}.
            </p>
          ) : (
            <p className="text-slate-500">
              Documento pendiente de aceptación. Imprímalo para recoger la firma física del propietario/a y luego
              regístrelo como aceptado en el sistema.
            </p>
          )}
        </section>

        {/* Las firmas se dibujan encima de la raya, no la sustituyen: el
            documento impreso tiene que verse igual con trazo y sin él, y los
            consentimientos anteriores a la firma digital no tienen imagen. */}
        <section className="grid grid-cols-2 gap-8 pt-10 text-sm">
          <div className="text-center">
            <div className="flex h-20 items-end justify-center">
              {consentimiento?.firma_tutor && (
                <img
                  src={consentimiento.firma_tutor}
                  alt="Firma del propietario o tutor"
                  className="max-h-20 object-contain"
                />
              )}
            </div>
            <div className="mb-1 border-t border-slate-400 pt-2">Firma del propietario/a o tutor/a</div>
            {consentimiento?.nombre_tutor && (
              <p className="text-xs text-slate-600">{consentimiento.nombre_tutor}</p>
            )}
          </div>
          <div className="text-center">
            <div className="flex h-20 items-end justify-center">
              {consentimiento?.firma_veterinario && (
                <img
                  src={consentimiento.firma_veterinario}
                  alt="Firma del veterinario responsable"
                  className="max-h-20 object-contain"
                />
              )}
            </div>
            <div className="mb-1 border-t border-slate-400 pt-2">Firma del veterinario/a responsable</div>
            {consentimiento?.nombre_veterinario && (
              <p className="text-xs text-slate-600">{consentimiento.nombre_veterinario}</p>
            )}
          </div>
        </section>

        <footer className="mt-10 border-t border-slate-100 pt-4 text-center text-[10px] text-slate-400">
          Documento generado electrónicamente por Vetora el{' '}
          {formatClinicDate(consentimiento?.created_at ?? new Date().toISOString())}
          {consentimiento && <> · Referencia {consentimiento.id}</>} · Este registro es inmutable una vez aceptado.
        </footer>
      </div>
    </div>
  )
}
