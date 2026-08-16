import { db } from '../mocks/db'
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
  await new Promise((resolve) => setTimeout(resolve, 300))
  // Encontrar el cliente asociado al usuario_id
  const clientes = db.get('clientes')
  const cliente = clientes.find((c) => c.clinica_id === clinicaId && c.usuario_id === usuarioId)
  
  if (!cliente) return []

  const todos = db.get('pacientes')
  return todos.filter((p) => p.clinica_id === clinicaId && p.cliente_id === cliente.id)
}

export async function getHistorialPacientePortal(clinicaId: string, pacienteId: string): Promise<HistorialClinico[]> {
  await new Promise((resolve) => setTimeout(resolve, 300))
  const historial = db.get('historial_clinico')
  return historial
    .filter((h) => h.clinica_id === clinicaId && h.paciente_id === pacienteId && !h.editable)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
}

export async function getVacunasPacientePortal(clinicaId: string, pacienteId: string): Promise<VacunaAplicada[]> {
  await new Promise((resolve) => setTimeout(resolve, 300))
  const vacunas = db.get('vacunas_aplicadas')
  return vacunas
    .filter((v) => v.clinica_id === clinicaId && v.paciente_id === pacienteId)
    .sort((a, b) => new Date(b.fecha_aplicacion).getTime() - new Date(a.fecha_aplicacion).getTime())
}

export async function getNotificacionesPortal(clinicaId: string, usuarioId: string): Promise<NotificacionPortal[]> {
  await new Promise((resolve) => setTimeout(resolve, 300))
  const clientes = db.get('clientes')
  const cliente = clientes.find((c) => c.clinica_id === clinicaId && c.usuario_id === usuarioId)
  
  if (!cliente) return []

  const pacientes = db.get('pacientes').filter((p) => p.clinica_id === clinicaId && p.cliente_id === cliente.id)
  const pacienteIds = pacientes.map(p => p.id)
  
  const notificaciones: NotificacionPortal[] = []

  // 1. Citas pendientes
  const citas = db.get('citas').filter(c => 
    c.clinica_id === clinicaId && 
    pacienteIds.includes(c.paciente_id) &&
    (c.estado === 'pendiente' || c.estado === 'confirmada')
  )

  citas.forEach(cita => {
    const p = pacientes.find(x => x.id === cita.paciente_id)
    const fecha = new Date(cita.fecha_hora)
    
    // Ignorar citas muy pasadas que no se marcaron como completadas, a menos que sean de hoy
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

  // 2. Vacunas pendientes o atrasadas (refuerzos)
  const vacunas = db.get('vacunas_aplicadas').filter(v => 
    v.clinica_id === clinicaId && 
    pacienteIds.includes(v.paciente_id) &&
    v.fecha_refuerzo
  )

  vacunas.forEach(vacuna => {
    const p = pacientes.find(x => x.id === vacuna.paciente_id)
    const fechaRefuerzo = new Date(vacuna.fecha_refuerzo!)
    const treintaDias = addDays(new Date(), 30)

    // Solo mostrar si ya pasó (atrasada), es hoy, o es en los próximos 30 días
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

  return notificaciones.sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime())
}
