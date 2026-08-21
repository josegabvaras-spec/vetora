import { supabase } from '../lib/supabase'
import type { ConsentimientoCirugia, Paciente, HistorialClinico, VacunaAplicada } from '../types/database'
import { addDays } from 'date-fns'
import { clinicDayIso } from '../lib/datetime'

export interface NotificacionPortal {
  id: string;
  tipo: 'cita' | 'vacuna';
  titulo: string;
  descripcion: string;
  fecha: string;
  pacienteNombre: string;
  estado: 'pendiente' | 'atrasada' | 'hoy';
}

/** Lo único que un anónimo puede saber de una clínica: cómo se llama. */
export interface ClinicaParaRegistro {
  id: string
  nombre: string
}

/**
 * El listado sale de una función `security definer`, no de la tabla: quien está
 * en el formulario de registro no tiene sesión y la RLS no le deja leer
 * `clinicas`. La función devuelve solo `id` y `nombre` — ni WhatsApp, ni
 * responsable, ni estado, ni plan contratado.
 */
export async function listClinicasParaRegistro(): Promise<ClinicaParaRegistro[]> {
  const { data, error } = await supabase.rpc('clinicas_para_registro')
  if (error) throw new Error('No se pudieron cargar las clínicas')
  return (data ?? []) as ClinicaParaRegistro[]
}

export interface DatosRegistroPortal {
  clinica_id: string
  nombre: string
  email: string
  password: string
  ci: string
  whatsapp: string
}

/**
 * Alta de una cuenta del portal.
 *
 * Pasa por la Edge Function `registro-portal` porque **el rol y la clínica no
 * pueden venir del navegador**: allí `rol: 'cliente'` es una constante del
 * servidor y la clínica se valida contra la base. Insertar en `usuarios` desde
 * aquí sería mandar el rol en una petición HTTP que cualquiera puede reescribir.
 *
 * La función tampoco devuelve sesión: se inicia después con la contraseña
 * recién elegida, igual que en el canje de invitación.
 */
export async function registrarClientePortal(datos: DatosRegistroPortal): Promise<void> {
  const { data, error } = await supabase.functions.invoke<{ error?: string }>('registro-portal', {
    body: datos,
  })

  if (error) {
    const contexto = (error as { context?: Response }).context
    let motivo: string | null = null
    if (contexto && typeof contexto.json === 'function') {
      try {
        const cuerpo = await contexto.clone().json()
        if (typeof cuerpo?.error === 'string') motivo = cuerpo.error
      } catch {
        motivo = null
      }
    }
    throw new Error(motivo ?? 'No se pudo completar el registro')
  }
  if (data?.error) throw new Error(data.error)

  const { error: errorSesion } = await supabase.auth.signInWithPassword({
    email: datos.email.trim().toLowerCase(),
    password: datos.password,
  })
  if (errorSesion) {
    throw new Error('Tu cuenta se creó, pero no se pudo iniciar sesión. Entra desde el inicio de sesión.')
  }
}

export async function getPacientesPortal(clinicaId: string, usuarioId: string): Promise<Paciente[]> {
  const { data: cliente } = await supabase
    .from('clientes')
    .select('id')
    .eq('clinica_id', clinicaId)
    .eq('usuario_id' as any, usuarioId)
    .maybeSingle()
  
  if (!cliente) return []

  const { data: pacientes } = await supabase
    .from('pacientes')
    .select('*')
    .eq('clinica_id', clinicaId)
    .eq('cliente_id', cliente.id)
    
  return (pacientes || []) as Paciente[]
}

export async function getHistorialPacientePortal(clinicaId: string, pacienteId: string): Promise<HistorialClinico[]> {
  const { data: historial } = await supabase
    .from('historial_clinico')
    .select('*')
    .eq('clinica_id', clinicaId)
    .eq('paciente_id', pacienteId)
    .eq('editable', false)
    .order('created_at', { ascending: false })

  return (historial || []) as HistorialClinico[]
}

export async function getVacunasPacientePortal(clinicaId: string, pacienteId: string): Promise<VacunaAplicada[]> {
  const { data: vacunas } = await supabase
    .from('vacunas_aplicadas')
    .select('*')
    .eq('clinica_id', clinicaId)
    .eq('paciente_id', pacienteId)
    .order('fecha_aplicacion', { ascending: false })

  return (vacunas || []) as VacunaAplicada[]
}

/**
 * Consentimientos de cirugía que el tutor firmó, para que pueda releer y
 * reimprimir lo que autorizó.
 *
 * Lo hace visible la policy `consentimientos_portal` (0012): la de personal
 * exige `auth_es_personal()`, así que antes el dueño no veía ni su propia firma.
 */
export async function getConsentimientosPacientePortal(
  clinicaId: string,
  pacienteId: string,
): Promise<ConsentimientoCirugia[]> {
  const { data: consentimientos } = await supabase
    .from('consentimientos_cirugia')
    .select('*')
    .eq('clinica_id', clinicaId)
    .eq('paciente_id', pacienteId)
    .order('created_at', { ascending: false })

  return (consentimientos || []) as ConsentimientoCirugia[]
}

export async function getNotificacionesPortal(clinicaId: string, usuarioId: string): Promise<NotificacionPortal[]> {
  const { data: cliente } = await supabase
    .from('clientes')
    .select('id')
    .eq('clinica_id', clinicaId)
    .eq('usuario_id' as any, usuarioId)
    .maybeSingle()
  
  if (!cliente) return []

  const { data: pacientes } = await supabase
    .from('pacientes')
    .select('id, nombre')
    .eq('clinica_id', clinicaId)
    .eq('cliente_id', cliente.id)
    
  if (!pacientes || pacientes.length === 0) return []

  const pacienteIds = pacientes.map(p => p.id)
  const notificaciones: NotificacionPortal[] = []
  const hoy = clinicDayIso()

  // 1. Citas pendientes
  const { data: citas } = await supabase
    .from('citas')
    .select('*')
    .eq('clinica_id', clinicaId)
    .in('paciente_id', pacienteIds)
    .in('estado', ['pendiente', 'confirmada'])

  if (citas) {
    citas.forEach(cita => {
      const p = pacientes.find(x => x.id === cita.paciente_id)
      // Se compara el día de la clínica, no el del dispositivo del cliente:
      // `isPast`/`isToday` resolvían en la zona de su teléfono, que puede estar
      // en cualquier parte.
      const diaCita = clinicDayIso(cita.fecha_hora)

      if (diaCita < hoy) return

      notificaciones.push({
        id: `cita-${cita.id}`,
        tipo: 'cita',
        titulo: cita.tipo_cita === 'vacuna' ? 'Cita de Vacunación' : 'Cita Veterinaria',
        descripcion: `Tienes una cita programada.`,
        fecha: cita.fecha_hora,
        pacienteNombre: p?.nombre || 'Tu mascota',
        estado: diaCita === hoy ? 'hoy' : 'pendiente'
      })
    })
  }

  // 2. Vacunas pendientes o atrasadas (refuerzos)
  const { data: vacunas } = await supabase
    .from('vacunas_aplicadas')
    .select('*')
    .eq('clinica_id', clinicaId)
    .in('paciente_id', pacienteIds)
    .not('fecha_refuerzo', 'is', null)

  if (vacunas) {
    vacunas.forEach(vacuna => {
      const p = pacientes.find(x => x.id === vacuna.paciente_id)
      // `fecha_refuerzo` es una columna `date`. `new Date("2026-08-20")` es
      // medianoche UTC, o sea el día 19 a las 20:00 en La Paz: el refuerzo se
      // marcaba "atrasado" desde la víspera y el carné mostraba un día menos.
      // Comparar cadenas 'yyyy-MM-dd' del día de la clínica es exacto.
      const diaRefuerzo = vacuna.fecha_refuerzo!.slice(0, 10)
      const limite = clinicDayIso(addDays(new Date(), 30).toISOString())

      if (diaRefuerzo <= limite) {
        let estado: 'pendiente' | 'atrasada' | 'hoy' = 'pendiente'
        if (diaRefuerzo === hoy) estado = 'hoy'
        else if (diaRefuerzo < hoy) estado = 'atrasada'

        notificaciones.push({
          id: `vac-${vacuna.id}`,
          tipo: 'vacuna',
          titulo: `Refuerzo: ${vacuna.nombre_vacuna}`,
          descripcion: estado === 'atrasada' ? 'Refuerzo atrasado. Contáctanos.' : 'Refuerzo programado.',
          fecha: vacuna.fecha_refuerzo!,
          pacienteNombre: p?.nombre || 'Tu mascota',
          estado
        })
      }
    })
  }

  return notificaciones.sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime())
}
