import { supabase } from '../lib/supabase'
import type { Paciente, HistorialClinico, VacunaAplicada } from '../types/database'
import { isPast, isToday, addDays } from 'date-fns'

export interface NotificacionPortal {
  id: string;
  tipo: 'cita' | 'vacuna';
  titulo: string;
  descripcion: string;
  fecha: string;
  pacienteNombre: string;
  estado: 'pendiente' | 'atrasada' | 'hoy';
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
      const fecha = new Date(cita.fecha_hora)
      
      if (isPast(fecha) && !isToday(fecha)) return

      notificaciones.push({
        id: `cita-${cita.id}`,
        tipo: 'cita',
        titulo: cita.tipo_cita === 'vacuna' ? 'Cita de Vacunación' : 'Cita Veterinaria',
        descripcion: `Tienes una cita programada.`,
        fecha: cita.fecha_hora,
        pacienteNombre: p?.nombre || 'Tu mascota',
        estado: isToday(fecha) ? 'hoy' : 'pendiente'
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
      const fechaRefuerzo = new Date(vacuna.fecha_refuerzo!)
      const treintaDias = addDays(new Date(), 30)

      if (fechaRefuerzo <= treintaDias) {
        let estado: 'pendiente' | 'atrasada' | 'hoy' = 'pendiente'
        if (isToday(fechaRefuerzo)) estado = 'hoy'
        else if (isPast(fechaRefuerzo)) estado = 'atrasada'

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
