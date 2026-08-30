export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      citas: {
        Row: {
          cita_origen_id: string | null
          clinica_id: string
          created_at: string
          estado: string
          fecha_hora: string
          id: string
          notas: string | null
          paciente_id: string
          recordatorio_enviado: boolean
          servicio_id: string | null
          sucursal_id: string
          tipo_cita: string
          veterinario_id: string
        }
        Insert: {
          cita_origen_id?: string | null
          clinica_id?: string
          created_at?: string
          estado?: string
          fecha_hora: string
          id?: string
          notas?: string | null
          paciente_id: string
          recordatorio_enviado?: boolean
          servicio_id?: string | null
          sucursal_id: string
          tipo_cita: string
          veterinario_id: string
        }
        Update: {
          cita_origen_id?: string | null
          clinica_id?: string
          created_at?: string
          estado?: string
          fecha_hora?: string
          id?: string
          notas?: string | null
          paciente_id?: string
          recordatorio_enviado?: boolean
          servicio_id?: string | null
          sucursal_id?: string
          tipo_cita?: string
          veterinario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "citas_cita_origen_id_fkey"
            columns: ["cita_origen_id"]
            isOneToOne: false
            referencedRelation: "citas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "citas_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "citas_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "citas_servicio_id_fkey"
            columns: ["servicio_id"]
            isOneToOne: false
            referencedRelation: "servicios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "citas_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "citas_veterinario_id_fkey"
            columns: ["veterinario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes: {
        Row: {
          ci: string | null
          clinica_id: string
          created_at: string
          id: string
          nombre: string
          usuario_id: string | null
          whatsapp: string
        }
        Insert: {
          ci?: string | null
          clinica_id?: string
          created_at?: string
          id?: string
          nombre: string
          usuario_id?: string | null
          whatsapp: string
        }
        Update: {
          ci?: string | null
          clinica_id?: string
          created_at?: string
          id?: string
          nombre?: string
          usuario_id?: string | null
          whatsapp?: string
        }
        Relationships: [
          {
            foreignKeyName: "clientes_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clientes_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      clinicas: {
        Row: {
          ciudad: string
          created_at: string
          estado: string
          estado_pago: string
          fecha_alta: string
          id: string
          logo_url: string | null
          nombre: string
          plan_id: string
          precio_acordado_usd: number
          proximo_cobro: string
          responsable: string
          tipo_negocio: string
          whatsapp: string
          whatsapp_mensajes_enviados: number
          whatsapp_periodo: string
        }
        Insert: {
          ciudad?: string
          created_at?: string
          estado?: string
          estado_pago?: string
          fecha_alta?: string
          id?: string
          logo_url?: string | null
          nombre: string
          plan_id: string
          precio_acordado_usd?: number
          proximo_cobro?: string
          responsable?: string
          tipo_negocio?: string
          whatsapp?: string
          whatsapp_mensajes_enviados?: number
          whatsapp_periodo?: string
        }
        Update: {
          ciudad?: string
          created_at?: string
          estado?: string
          estado_pago?: string
          fecha_alta?: string
          id?: string
          logo_url?: string | null
          nombre?: string
          plan_id?: string
          precio_acordado_usd?: number
          proximo_cobro?: string
          responsable?: string
          tipo_negocio?: string
          whatsapp?: string
          whatsapp_mensajes_enviados?: number
          whatsapp_periodo?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinicas_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "planes"
            referencedColumns: ["id"]
          },
        ]
      }
      configuracion_plataforma: {
        Row: {
          id: boolean
          tipo_cambio_usd: number
          actualizado_at: string
          qr_pago: string | null
          datos_pago: string
        }
        Insert: {
          id?: boolean
          tipo_cambio_usd: number
          actualizado_at?: string
          qr_pago?: string | null
          datos_pago?: string
        }
        Update: {
          id?: boolean
          tipo_cambio_usd?: number
          actualizado_at?: string
          qr_pago?: string | null
          datos_pago?: string
        }
        Relationships: []
      }
      onboarding_usuario: {
        Row: {
          usuario_id: string
          completado: boolean
          version: number
          actualizado_at: string
        }
        Insert: {
          usuario_id: string
          completado?: boolean
          version?: number
          actualizado_at?: string
        }
        Update: {
          usuario_id?: string
          completado?: boolean
          version?: number
          actualizado_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_usuario_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: true
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      pagos_suscripcion: {
        Row: {
          id: string
          clinica_id: string
          meses: number
          monto_usd: number
          tipo_cambio_usd: number
          monto_bs: number
          ruta_comprobante: string
          referencia: string
          estado: string
          motivo_rechazo: string | null
          revisado_por: string | null
          revisado_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          clinica_id?: string
          meses: number
          monto_usd: number
          tipo_cambio_usd: number
          monto_bs: number
          ruta_comprobante: string
          referencia?: string
          estado?: string
          motivo_rechazo?: string | null
          revisado_por?: string | null
          revisado_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          clinica_id?: string
          meses?: number
          monto_usd?: number
          tipo_cambio_usd?: number
          monto_bs?: number
          ruta_comprobante?: string
          referencia?: string
          estado?: string
          motivo_rechazo?: string | null
          revisado_por?: string | null
          revisado_at?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pagos_suscripcion_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      cobro_lineas: {
        Row: {
          cantidad: number
          clinica_id: string
          cobro_id: string
          concepto: string
          id: string
          precio_unitario_bs: number
          producto_id: string | null
          servicio_id: string | null
          subtotal_bs: number
        }
        Insert: {
          cantidad: number
          clinica_id?: string
          cobro_id: string
          concepto: string
          id?: string
          precio_unitario_bs: number
          producto_id?: string | null
          servicio_id?: string | null
          subtotal_bs: number
        }
        Update: {
          cantidad?: number
          clinica_id?: string
          cobro_id?: string
          concepto?: string
          id?: string
          precio_unitario_bs?: number
          producto_id?: string | null
          servicio_id?: string | null
          subtotal_bs?: number
        }
        Relationships: [
          {
            foreignKeyName: "cobro_lineas_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobro_lineas_cobro_id_fkey"
            columns: ["cobro_id"]
            isOneToOne: false
            referencedRelation: "cobros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobro_lineas_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobro_lineas_servicio_id_fkey"
            columns: ["servicio_id"]
            isOneToOne: false
            referencedRelation: "servicios"
            referencedColumns: ["id"]
          },
        ]
      }
      cobros: {
        Row: {
          cita_id: string | null
          cliente_nombre: string | null
          clinica_id: string
          created_at: string
          id: string
          internacion_id: string | null
          metodo_pago: string
          monto_bs: number
          sucursal_id: string
          turno_id: string
          usuario_id: string
        }
        Insert: {
          cita_id?: string | null
          cliente_nombre?: string | null
          clinica_id?: string
          created_at?: string
          id?: string
          internacion_id?: string | null
          metodo_pago: string
          monto_bs: number
          sucursal_id: string
          turno_id: string
          usuario_id: string
        }
        Update: {
          cita_id?: string | null
          cliente_nombre?: string | null
          clinica_id?: string
          created_at?: string
          id?: string
          internacion_id?: string | null
          metodo_pago?: string
          monto_bs?: number
          sucursal_id?: string
          turno_id?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cobros_cita_id_fkey"
            columns: ["cita_id"]
            isOneToOne: false
            referencedRelation: "citas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobros_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobros_internacion_id_fkey"
            columns: ["internacion_id"]
            isOneToOne: false
            referencedRelation: "internaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobros_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobros_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "turnos_caja"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobros_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      consentimientos_cirugia: {
        Row: {
          cita_id: string
          clinica_id: string
          created_at: string
          firma_tutor: string | null
          firma_veterinario: string | null
          id: string
          metodo_aceptacion: string
          nombre_tutor: string | null
          nombre_veterinario: string | null
          paciente_id: string
          url_pdf: string
          veterinario_id: string | null
        }
        Insert: {
          cita_id: string
          clinica_id?: string
          created_at?: string
          firma_tutor?: string | null
          firma_veterinario?: string | null
          id?: string
          metodo_aceptacion: string
          nombre_tutor?: string | null
          nombre_veterinario?: string | null
          paciente_id: string
          url_pdf: string
          veterinario_id?: string | null
        }
        Update: {
          cita_id?: string
          clinica_id?: string
          created_at?: string
          firma_tutor?: string | null
          firma_veterinario?: string | null
          id?: string
          metodo_aceptacion?: string
          nombre_tutor?: string | null
          nombre_veterinario?: string | null
          paciente_id?: string
          url_pdf?: string
          veterinario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consentimientos_cirugia_cita_id_fkey"
            columns: ["cita_id"]
            isOneToOne: false
            referencedRelation: "citas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consentimientos_cirugia_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consentimientos_cirugia_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      desparasitaciones_aplicadas: {
        Row: {
          clinica_id: string
          created_at: string
          fecha_aplicacion: string
          fecha_proxima: string | null
          historial_id: string | null
          id: string
          paciente_id: string
          producto: string
          via: string
        }
        Insert: {
          clinica_id?: string
          created_at?: string
          fecha_aplicacion?: string
          fecha_proxima?: string | null
          historial_id?: string | null
          id?: string
          paciente_id: string
          producto: string
          via?: string
        }
        Update: {
          clinica_id?: string
          created_at?: string
          fecha_aplicacion?: string
          fecha_proxima?: string | null
          historial_id?: string | null
          id?: string
          paciente_id?: string
          producto?: string
          via?: string
        }
        Relationships: [
          {
            foreignKeyName: "desparasitaciones_aplicadas_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "desparasitaciones_aplicadas_historial_id_fkey"
            columns: ["historial_id"]
            isOneToOne: false
            referencedRelation: "historial_clinico"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "desparasitaciones_aplicadas_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      historial_clinico: {
        Row: {
          apetito: string | null
          cita_id: string
          clinica_id: string
          condicion_corporal: number | null
          consumo_agua: string | null
          created_at: string
          deshidratacion: string | null
          desparasitacion_al_dia: boolean | null
          diagnostico: string
          editable: boolean
          estado_conciencia: string | null
          frecuencia_cardiaca: number | null
          frecuencia_respiratoria: number | null
          heces_color: string | null
          heces_consistencia: string | null
          id: string
          motivo: string
          mucosas: string | null
          observaciones_examen: string | null
          orina: string | null
          paciente_id: string
          peso_kg: number | null
          sintomas: string | null
          temperatura_c: number | null
          tiempo_evolucion: string | null
          tllc: string | null
          tratamiento: string
          veterinario_id: string
          vomitos: string | null
        }
        Insert: {
          apetito?: string | null
          cita_id: string
          clinica_id?: string
          condicion_corporal?: number | null
          consumo_agua?: string | null
          created_at?: string
          deshidratacion?: string | null
          desparasitacion_al_dia?: boolean | null
          diagnostico?: string
          editable?: boolean
          estado_conciencia?: string | null
          frecuencia_cardiaca?: number | null
          frecuencia_respiratoria?: number | null
          heces_color?: string | null
          heces_consistencia?: string | null
          id?: string
          motivo: string
          mucosas?: string | null
          observaciones_examen?: string | null
          orina?: string | null
          paciente_id: string
          peso_kg?: number | null
          sintomas?: string | null
          temperatura_c?: number | null
          tiempo_evolucion?: string | null
          tllc?: string | null
          tratamiento?: string
          veterinario_id: string
          vomitos?: string | null
        }
        Update: {
          apetito?: string | null
          cita_id?: string
          clinica_id?: string
          condicion_corporal?: number | null
          consumo_agua?: string | null
          created_at?: string
          deshidratacion?: string | null
          desparasitacion_al_dia?: boolean | null
          diagnostico?: string
          editable?: boolean
          estado_conciencia?: string | null
          frecuencia_cardiaca?: number | null
          frecuencia_respiratoria?: number | null
          heces_color?: string | null
          heces_consistencia?: string | null
          id?: string
          motivo?: string
          mucosas?: string | null
          observaciones_examen?: string | null
          orina?: string | null
          paciente_id?: string
          peso_kg?: number | null
          sintomas?: string | null
          temperatura_c?: number | null
          tiempo_evolucion?: string | null
          tllc?: string | null
          tratamiento?: string
          veterinario_id?: string
          vomitos?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "historial_clinico_cita_id_fkey"
            columns: ["cita_id"]
            isOneToOne: false
            referencedRelation: "citas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historial_clinico_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historial_clinico_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historial_clinico_veterinario_id_fkey"
            columns: ["veterinario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      estudios_imagen: {
        Row: {
          clinica_id: string
          created_at: string
          descripcion: string
          historial_id: string
          id: string
          paciente_id: string
          ruta: string
          tipo: string
        }
        Insert: {
          clinica_id?: string
          created_at?: string
          descripcion?: string
          historial_id: string
          id?: string
          paciente_id: string
          ruta: string
          tipo: string
        }
        Update: {
          clinica_id?: string
          created_at?: string
          descripcion?: string
          historial_id?: string
          id?: string
          paciente_id?: string
          ruta?: string
          tipo?: string
        }
        Relationships: []
      }
      registro_errores: {
        Row: {
          clinica_id: string | null
          contexto: string
          created_at: string
          id: string
          mensaje: string
          usuario_id: string | null
        }
        Insert: {
          clinica_id?: string | null
          contexto?: string
          created_at?: string
          id?: string
          mensaje: string
          usuario_id?: string | null
        }
        Update: {
          clinica_id?: string | null
          contexto?: string
          created_at?: string
          id?: string
          mensaje?: string
          usuario_id?: string | null
        }
        Relationships: []
      }
      informes_firmados: {
        Row: {
          clinica_id: string
          created_at: string
          firma_tutor: string
          firma_veterinario: string
          id: string
          item_id: string | null
          nombre_tutor: string
          nombre_veterinario: string
          paciente_id: string | null
          tipo: string
          veterinario_id: string | null
        }
        Insert: {
          clinica_id?: string
          created_at?: string
          firma_tutor: string
          firma_veterinario: string
          id?: string
          item_id?: string | null
          nombre_tutor: string
          nombre_veterinario: string
          paciente_id?: string | null
          tipo: string
          veterinario_id?: string | null
        }
        Update: {
          clinica_id?: string
          created_at?: string
          firma_tutor?: string
          firma_veterinario?: string
          id?: string
          item_id?: string | null
          nombre_tutor?: string
          nombre_veterinario?: string
          paciente_id?: string | null
          tipo?: string
          veterinario_id?: string | null
        }
        Relationships: []
      }
      internaciones: {
        Row: {
          cita_id: string | null
          clinica_id: string
          created_at: string
          estado: string
          fecha_alta: string | null
          fecha_ingreso: string
          id: string
          indicaciones_alta: string | null
          jaula: string | null
          motivo: string
          paciente_id: string
          precio_dia_bs: number
          servicio_dia_id: string
          sucursal_id: string
          veterinario_id: string
        }
        Insert: {
          cita_id?: string | null
          clinica_id?: string
          created_at?: string
          estado?: string
          fecha_alta?: string | null
          fecha_ingreso?: string
          id?: string
          indicaciones_alta?: string | null
          jaula?: string | null
          motivo: string
          paciente_id: string
          precio_dia_bs: number
          servicio_dia_id: string
          sucursal_id: string
          veterinario_id: string
        }
        Update: {
          cita_id?: string | null
          clinica_id?: string
          created_at?: string
          estado?: string
          fecha_alta?: string | null
          fecha_ingreso?: string
          id?: string
          indicaciones_alta?: string | null
          jaula?: string | null
          motivo?: string
          paciente_id?: string
          precio_dia_bs?: number
          servicio_dia_id?: string
          sucursal_id?: string
          veterinario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "internaciones_cita_id_fkey"
            columns: ["cita_id"]
            isOneToOne: false
            referencedRelation: "citas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internaciones_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internaciones_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internaciones_servicio_dia_id_fkey"
            columns: ["servicio_dia_id"]
            isOneToOne: false
            referencedRelation: "servicios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internaciones_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internaciones_veterinario_id_fkey"
            columns: ["veterinario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      invitaciones: {
        Row: {
          clinica_id: string
          created_at: string
          enviado_at: string | null
          expira_at: string
          id: string
          token: string
          usado_at: string | null
          usuario_id: string
        }
        Insert: {
          clinica_id?: string
          created_at?: string
          enviado_at?: string | null
          expira_at: string
          id?: string
          token: string
          usado_at?: string | null
          usuario_id: string
        }
        Update: {
          clinica_id?: string
          created_at?: string
          enviado_at?: string | null
          expira_at?: string
          id?: string
          token?: string
          usado_at?: string | null
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitaciones_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitaciones_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      movimientos_inventario: {
        Row: {
          cantidad: number
          cita_id: string | null
          clinica_id: string
          created_at: string
          id: string
          internacion_id: string | null
          motivo: string
          producto_id: string
          tipo: string
          usuario_id: string | null
        }
        Insert: {
          cantidad: number
          cita_id?: string | null
          clinica_id?: string
          created_at?: string
          id?: string
          internacion_id?: string | null
          motivo?: string
          producto_id: string
          tipo: string
          usuario_id?: string | null
        }
        Update: {
          cantidad?: number
          cita_id?: string | null
          clinica_id?: string
          created_at?: string
          id?: string
          internacion_id?: string | null
          motivo?: string
          producto_id?: string
          tipo?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "movimientos_inventario_cita_id_fkey"
            columns: ["cita_id"]
            isOneToOne: false
            referencedRelation: "citas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_inventario_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_inventario_internacion_id_fkey"
            columns: ["internacion_id"]
            isOneToOne: false
            referencedRelation: "internaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_inventario_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_inventario_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      notas_internacion: {
        Row: {
          clinica_id: string
          created_at: string
          frecuencia_cardiaca: number | null
          frecuencia_respiratoria: number | null
          id: string
          internacion_id: string
          nota: string
          peso_kg: number | null
          temperatura_c: number | null
          veterinario_id: string
        }
        Insert: {
          clinica_id?: string
          created_at?: string
          frecuencia_cardiaca?: number | null
          frecuencia_respiratoria?: number | null
          id?: string
          internacion_id: string
          nota: string
          peso_kg?: number | null
          temperatura_c?: number | null
          veterinario_id: string
        }
        Update: {
          clinica_id?: string
          created_at?: string
          frecuencia_cardiaca?: number | null
          frecuencia_respiratoria?: number | null
          id?: string
          internacion_id?: string
          nota?: string
          peso_kg?: number | null
          temperatura_c?: number | null
          veterinario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notas_internacion_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notas_internacion_internacion_id_fkey"
            columns: ["internacion_id"]
            isOneToOne: false
            referencedRelation: "internaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notas_internacion_veterinario_id_fkey"
            columns: ["veterinario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      pacientes: {
        Row: {
          alergias: string | null
          antecedentes: string | null
          cliente_id: string
          clinica_id: string
          codigo: string | null
          created_at: string
          especie: string
          fecha_nacimiento: string | null
          foto: string | null
          id: string
          nombre: string
          raza: string | null
          sexo: string
        }
        Insert: {
          alergias?: string | null
          antecedentes?: string | null
          cliente_id: string
          clinica_id?: string
          codigo?: string | null
          created_at?: string
          especie: string
          fecha_nacimiento?: string | null
          foto?: string | null
          id?: string
          nombre: string
          raza?: string | null
          sexo?: string
        }
        Update: {
          alergias?: string | null
          antecedentes?: string | null
          cliente_id?: string
          clinica_id?: string
          codigo?: string | null
          created_at?: string
          especie?: string
          fecha_nacimiento?: string | null
          foto?: string | null
          id?: string
          nombre?: string
          raza?: string | null
          sexo?: string
        }
        Relationships: [
          {
            foreignKeyName: "pacientes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pacientes_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      planes: {
        Row: {
          activo: boolean
          created_at: string
          id: string
          max_sucursales: number
          max_usuarios: number
          modulos_habilitados: string[]
          nombre: string
          precio_mensual_usd: number
          whatsapp_limite: number
        }
        Insert: {
          activo?: boolean
          created_at?: string
          id?: string
          max_sucursales: number
          max_usuarios: number
          modulos_habilitados?: string[]
          nombre: string
          precio_mensual_usd?: number
          whatsapp_limite: number
        }
        Update: {
          activo?: boolean
          created_at?: string
          id?: string
          max_sucursales?: number
          max_usuarios?: number
          modulos_habilitados?: string[]
          nombre?: string
          precio_mensual_usd?: number
          whatsapp_limite?: number
        }
        Relationships: []
      }
      productos: {
        Row: {
          activo: boolean
          categoria_retail: string
          codigo_barras: string | null
          clinica_id: string
          composicion: string
          contenido_presentacion: number
          costo_bs: number
          created_at: string
          id: string
          marca: string
          nombre: string
          precio_bs: number
          presentacion: string
          proveedor_id: string | null
          requiere_lote: boolean
          sku: string
          stock_actual: number
          stock_maximo: number
          stock_minimo: number
          sucursal_id: string
          ubicacion: string
          unidad_medida: string
        }
        Insert: {
          activo?: boolean
          categoria_retail?: string
          codigo_barras?: string | null
          clinica_id?: string
          composicion?: string
          contenido_presentacion?: number
          costo_bs?: number
          created_at?: string
          id?: string
          marca?: string
          nombre: string
          precio_bs?: number
          presentacion?: string
          proveedor_id?: string | null
          requiere_lote?: boolean
          sku: string
          stock_actual?: number
          stock_maximo?: number
          stock_minimo?: number
          sucursal_id: string
          ubicacion?: string
          unidad_medida?: string
        }
        Update: {
          activo?: boolean
          categoria_retail?: string
          codigo_barras?: string | null
          clinica_id?: string
          composicion?: string
          contenido_presentacion?: number
          costo_bs?: number
          created_at?: string
          id?: string
          marca?: string
          nombre?: string
          precio_bs?: number
          presentacion?: string
          proveedor_id?: string | null
          requiere_lote?: boolean
          sku?: string
          stock_actual?: number
          stock_maximo?: number
          stock_minimo?: number
          sucursal_id?: string
          ubicacion?: string
          unidad_medida?: string
        }
        Relationships: [
          {
            foreignKeyName: "productos_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productos_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
        ]
      }
      recetas: {
        Row: {
          clinica_id: string
          created_at: string
          dosis: string
          duracion: string
          frecuencia: string
          historial_id: string
          id: string
          indicaciones: string | null
          medicamento: string
          paciente_id: string
          via: string
        }
        Insert: {
          clinica_id?: string
          created_at?: string
          dosis: string
          duracion: string
          frecuencia: string
          historial_id: string
          id?: string
          indicaciones?: string | null
          medicamento: string
          paciente_id: string
          via: string
        }
        Update: {
          clinica_id?: string
          created_at?: string
          dosis?: string
          duracion?: string
          frecuencia?: string
          historial_id?: string
          id?: string
          indicaciones?: string | null
          medicamento?: string
          paciente_id?: string
          via?: string
        }
        Relationships: [
          {
            foreignKeyName: "recetas_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recetas_historial_id_fkey"
            columns: ["historial_id"]
            isOneToOne: false
            referencedRelation: "historial_clinico"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recetas_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      catalogo_productos: {
        Row: {
          id: string
          clinica_id: string
          nombre: string
          descripcion: string
          categoria: string
          precio_bs: number
          foto_ruta: string | null
          producto_id: string | null
          disponible: boolean
          created_at: string
        }
        Insert: {
          id?: string
          clinica_id?: string
          nombre: string
          descripcion?: string
          categoria?: string
          precio_bs?: number
          foto_ruta?: string | null
          producto_id?: string | null
          disponible?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          clinica_id?: string
          nombre?: string
          descripcion?: string
          categoria?: string
          precio_bs?: number
          foto_ruta?: string | null
          producto_id?: string | null
          disponible?: boolean
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalogo_productos_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalogo_productos_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: true
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      servicios: {
        Row: {
          activo: boolean
          categoria: string
          clinica_id: string
          created_at: string
          id: string
          nombre: string
          precio_bs: number
        }
        Insert: {
          activo?: boolean
          categoria: string
          clinica_id?: string
          created_at?: string
          id?: string
          nombre: string
          precio_bs?: number
        }
        Update: {
          activo?: boolean
          categoria?: string
          clinica_id?: string
          created_at?: string
          id?: string
          nombre?: string
          precio_bs?: number
        }
        Relationships: [
          {
            foreignKeyName: "servicios_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      sucursales: {
        Row: {
          clinica_id: string
          created_at: string
          direccion: string
          id: string
          nombre: string
        }
        Insert: {
          clinica_id?: string
          created_at?: string
          direccion?: string
          id?: string
          nombre: string
        }
        Update: {
          clinica_id?: string
          created_at?: string
          direccion?: string
          id?: string
          nombre?: string
        }
        Relationships: [
          {
            foreignKeyName: "sucursales_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      turnos_caja: {
        Row: {
          abierto_at: string
          cerrado_at: string | null
          clinica_id: string
          created_at: string
          diferencia_bs: number | null
          estado: string
          id: string
          saldo_declarado_bs: number | null
          saldo_inicial_bs: number
          sucursal_id: string
          usuario_id: string
        }
        Insert: {
          abierto_at?: string
          cerrado_at?: string | null
          clinica_id?: string
          created_at?: string
          diferencia_bs?: number | null
          estado?: string
          id?: string
          saldo_declarado_bs?: number | null
          saldo_inicial_bs?: number
          sucursal_id: string
          usuario_id: string
        }
        Update: {
          abierto_at?: string
          cerrado_at?: string | null
          clinica_id?: string
          created_at?: string
          diferencia_bs?: number | null
          estado?: string
          id?: string
          saldo_declarado_bs?: number | null
          saldo_inicial_bs?: number
          sucursal_id?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "turnos_caja_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "turnos_caja_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "turnos_caja_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      usuarios: {
        Row: {
          activo: boolean
          clinica_id: string | null
          created_at: string
          email: string
          id: string
          nombre: string
          rol: string
          sucursal_id: string | null
          whatsapp: string
        }
        Insert: {
          activo?: boolean
          clinica_id?: string | null
          created_at?: string
          email: string
          id: string
          nombre: string
          rol: string
          sucursal_id?: string | null
          whatsapp?: string
        }
        Update: {
          activo?: boolean
          clinica_id?: string | null
          created_at?: string
          email?: string
          id?: string
          nombre?: string
          rol?: string
          sucursal_id?: string | null
          whatsapp?: string
        }
        Relationships: [
          {
            foreignKeyName: "usuarios_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usuarios_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
        ]
      }
      vacunas_aplicadas: {
        Row: {
          clinica_id: string
          created_at: string
          fecha_aplicacion: string
          fecha_refuerzo: string | null
          historial_id: string | null
          id: string
          nombre_vacuna: string
          paciente_id: string
        }
        Insert: {
          clinica_id?: string
          created_at?: string
          fecha_aplicacion?: string
          fecha_refuerzo?: string | null
          historial_id?: string | null
          id?: string
          nombre_vacuna: string
          paciente_id: string
        }
        Update: {
          clinica_id?: string
          created_at?: string
          fecha_aplicacion?: string
          fecha_refuerzo?: string | null
          historial_id?: string | null
          id?: string
          nombre_vacuna?: string
          paciente_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vacunas_aplicadas_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vacunas_aplicadas_historial_id_fkey"
            columns: ["historial_id"]
            isOneToOne: false
            referencedRelation: "historial_clinico"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vacunas_aplicadas_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      peluqueria_fichas: {
        Row: {
          id: string
          clinica_id: string
          paciente_id: string
          corte_habitual: string | null
          longitud_preferida: string | null
          frecuencia_dias: number
          productos_preferidos: string | null
          comportamiento: string
          alergias_sensibilidad: string | null
          observaciones: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          clinica_id?: string
          paciente_id: string
          corte_habitual?: string | null
          longitud_preferida?: string | null
          frecuencia_dias?: number
          productos_preferidos?: string | null
          comportamiento?: string
          alergias_sensibilidad?: string | null
          observaciones?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          clinica_id?: string
          paciente_id?: string
          corte_habitual?: string | null
          longitud_preferida?: string | null
          frecuencia_dias?: number
          productos_preferidos?: string | null
          comportamiento?: string
          alergias_sensibilidad?: string | null
          observaciones?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      peluqueria_servicios_config: {
        Row: {
          id: string
          clinica_id: string
          servicio_id: string
          duracion_minutos: number
          categoria_grooming: string
          especie_permitida: string
          tamano_permitido: string
          comision_tipo: string
          comision_valor: number
          reglas_precio: Json
          activo: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          clinica_id?: string
          servicio_id: string
          duracion_minutos?: number
          categoria_grooming?: string
          especie_permitida?: string
          tamano_permitido?: string
          comision_tipo?: string
          comision_valor?: number
          reglas_precio?: Json
          activo?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          clinica_id?: string
          servicio_id?: string
          duracion_minutos?: number
          categoria_grooming?: string
          especie_permitida?: string
          tamano_permitido?: string
          comision_tipo?: string
          comision_valor?: number
          reglas_precio?: Json
          activo?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      peluqueria_servicio_insumos: {
        Row: {
          id: string
          clinica_id: string
          servicio_id: string
          producto_id: string
          cantidad_dosis: number
          created_at: string
        }
        Insert: {
          id?: string
          clinica_id?: string
          servicio_id: string
          producto_id: string
          cantidad_dosis: number
          created_at?: string
        }
        Update: {
          id?: string
          clinica_id?: string
          servicio_id?: string
          producto_id?: string
          cantidad_dosis?: number
          created_at?: string
        }
        Relationships: []
      }
      peluqueria_ordenes: {
        Row: {
          id: string
          clinica_id: string
          sucursal_id: string
          numero_orden: number
          paciente_id: string
          cliente_id: string
          peluquero_id: string
          servicio_id: string | null
          cita_id: string | null
          cobro_id: string | null
          estado: string
          condicion_pelaje: string | null
          nivel_nudos: string
          nivel_suciedad: string
          lesiones_visibles: string | null
          alerta_veterinaria: boolean
          comportamiento_recepcion: string | null
          suplementos: Json
          precio_estimado_bs: number
          precio_final_bs: number
          insumos_descontados: boolean
          observaciones_recepcion: string | null
          observaciones_peluquero: string | null
          hora_ingreso: string
          hora_inicio: string | null
          hora_fin: string | null
          hora_entrega: string | null
          creado_por: string | null
          created_at: string
        }
        Insert: {
          id?: string
          clinica_id?: string
          sucursal_id: string
          numero_orden?: number
          paciente_id: string
          cliente_id: string
          peluquero_id: string
          servicio_id?: string | null
          cita_id?: string | null
          cobro_id?: string | null
          estado?: string
          condicion_pelaje?: string | null
          nivel_nudos?: string
          nivel_suciedad?: string
          lesiones_visibles?: string | null
          alerta_veterinaria?: boolean
          comportamiento_recepcion?: string | null
          suplementos?: Json
          precio_estimado_bs?: number
          precio_final_bs?: number
          insumos_descontados?: boolean
          observaciones_recepcion?: string | null
          observaciones_peluquero?: string | null
          hora_ingreso?: string
          hora_inicio?: string | null
          hora_fin?: string | null
          hora_entrega?: string | null
          creado_por?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          clinica_id?: string
          sucursal_id?: string
          numero_orden?: number
          paciente_id?: string
          cliente_id?: string
          peluquero_id?: string
          servicio_id?: string | null
          cita_id?: string | null
          cobro_id?: string | null
          estado?: string
          condicion_pelaje?: string | null
          nivel_nudos?: string
          nivel_suciedad?: string
          lesiones_visibles?: string | null
          alerta_veterinaria?: boolean
          comportamiento_recepcion?: string | null
          suplementos?: Json
          precio_estimado_bs?: number
          precio_final_bs?: number
          insumos_descontados?: boolean
          observaciones_recepcion?: string | null
          observaciones_peluquero?: string | null
          hora_ingreso?: string
          hora_inicio?: string | null
          hora_fin?: string | null
          hora_entrega?: string | null
          creado_por?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "peluqueria_ordenes_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "peluqueria_ordenes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "peluqueria_ordenes_peluquero_id_fkey"
            columns: ["peluquero_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "peluqueria_ordenes_servicio_id_fkey"
            columns: ["servicio_id"]
            isOneToOne: false
            referencedRelation: "servicios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "peluqueria_ordenes_cita_id_fkey"
            columns: ["cita_id"]
            isOneToOne: false
            referencedRelation: "citas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "peluqueria_ordenes_cobro_id_fkey"
            columns: ["cobro_id"]
            isOneToOne: false
            referencedRelation: "cobros"
            referencedColumns: ["id"]
          },
        ]
      }
      peluqueria_fotos: {
        Row: {
          id: string
          clinica_id: string
          orden_id: string
          paciente_id: string
          tipo: string
          foto_url: string
          descripcion: string | null
          created_at: string
        }
        Insert: {
          id?: string
          clinica_id?: string
          orden_id: string
          paciente_id: string
          tipo: string
          foto_url: string
          descripcion?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          clinica_id?: string
          orden_id?: string
          paciente_id?: string
          tipo?: string
          foto_url?: string
          descripcion?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "peluqueria_fotos_orden_id_fkey"
            columns: ["orden_id"]
            isOneToOne: false
            referencedRelation: "peluqueria_ordenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "peluqueria_fotos_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      peluqueria_comisiones: {
        Row: {
          id: string
          clinica_id: string
          sucursal_id: string
          orden_id: string
          peluquero_id: string
          monto_base_bs: number
          tipo_comision: string
          valor_comision: number
          monto_comision_bs: number
          estado: string
          liquidada_por: string | null
          fecha_liquidacion: string | null
          created_at: string
        }
        Insert: {
          id?: string
          clinica_id?: string
          sucursal_id: string
          orden_id: string
          peluquero_id: string
          monto_base_bs: number
          tipo_comision: string
          valor_comision: number
          monto_comision_bs: number
          estado?: string
          liquidada_por?: string | null
          fecha_liquidacion?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          clinica_id?: string
          sucursal_id?: string
          orden_id?: string
          peluquero_id?: string
          monto_base_bs?: number
          tipo_comision?: string
          valor_comision?: number
          monto_comision_bs?: number
          estado?: string
          liquidada_por?: string | null
          fecha_liquidacion?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "peluqueria_comisiones_orden_id_fkey"
            columns: ["orden_id"]
            isOneToOne: false
            referencedRelation: "peluqueria_ordenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "peluqueria_comisiones_peluquero_id_fkey"
            columns: ["peluquero_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      peluqueria_configuracion: {
        Row: {
          id: string
          clinica_id: string
          tiempo_bloqueo_default_min: number
          intervalo_recordatorio_dias: number
          suplementos_predeterminados: Json
          mensaje_listo_whatsapp: string | null
          mensaje_recordatorio_whatsapp: string | null
          updated_at: string
        }
        Insert: {
          id?: string
          clinica_id?: string
          tiempo_bloqueo_default_min?: number
          intervalo_recordatorio_dias?: number
          suplementos_predeterminados?: Json
          mensaje_listo_whatsapp?: string | null
          mensaje_recordatorio_whatsapp?: string | null
          updated_at?: string
        }
        Update: {
          id?: string
          clinica_id?: string
          tiempo_bloqueo_default_min?: number
          intervalo_recordatorio_dias?: number
          suplementos_predeterminados?: Json
          mensaje_listo_whatsapp?: string | null
          mensaje_recordatorio_whatsapp?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      proveedores: {
        Row: {
          id: string
          clinica_id: string
          empresa: string
          nit: string | null
          contacto: string | null
          telefono: string | null
          whatsapp: string | null
          direccion: string | null
          email: string | null
          notas: string | null
          saldo_pendiente_bs: number
          activo: boolean
          created_at: string
        }
        Insert: {
          id?: string
          clinica_id?: string
          empresa: string
          nit?: string | null
          contacto?: string | null
          telefono?: string | null
          whatsapp?: string | null
          direccion?: string | null
          email?: string | null
          notas?: string | null
          saldo_pendiente_bs?: number
          activo?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          clinica_id?: string
          empresa?: string
          nit?: string | null
          contacto?: string | null
          telefono?: string | null
          whatsapp?: string | null
          direccion?: string | null
          email?: string | null
          notas?: string | null
          saldo_pendiente_bs?: number
          activo?: boolean
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proveedores_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          }
        ]
      }
      producto_lotes: {
        Row: {
          id: string
          clinica_id: string
          sucursal_id: string
          producto_id: string
          numero_lote: string
          fecha_vencimiento: string
          cantidad_inicial: number
          cantidad_actual: number
          costo_unitario_bs: number
          proveedor_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          clinica_id?: string
          sucursal_id: string
          producto_id: string
          numero_lote: string
          fecha_vencimiento: string
          cantidad_inicial: number
          cantidad_actual: number
          costo_unitario_bs?: number
          proveedor_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          clinica_id?: string
          sucursal_id?: string
          producto_id?: string
          numero_lote?: string
          fecha_vencimiento?: string
          cantidad_inicial?: number
          cantidad_actual?: number
          costo_unitario_bs?: number
          proveedor_id?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "producto_lotes_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "producto_lotes_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "producto_lotes_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          }
        ]
      }
      ordenes_compra: {
        Row: {
          id: string
          clinica_id: string
          sucursal_id: string
          proveedor_id: string
          numero_orden: string
          estado: string
          subtotal_bs: number
          descuento_bs: number
          total_bs: number
          notas: string | null
          creado_por: string | null
          recibido_por: string | null
          fecha_solicitud: string | null
          fecha_recepcion: string | null
          created_at: string
        }
        Insert: {
          id?: string
          clinica_id?: string
          sucursal_id: string
          proveedor_id: string
          numero_orden?: string
          estado?: string
          subtotal_bs?: number
          descuento_bs?: number
          total_bs?: number
          notas?: string | null
          creado_por?: string | null
          recibido_por?: string | null
          fecha_solicitud?: string | null
          fecha_recepcion?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          clinica_id?: string
          sucursal_id?: string
          proveedor_id?: string
          numero_orden?: string
          estado?: string
          subtotal_bs?: number
          descuento_bs?: number
          total_bs?: number
          notas?: string | null
          creado_por?: string | null
          recibido_por?: string | null
          fecha_solicitud?: string | null
          fecha_recepcion?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ordenes_compra_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordenes_compra_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordenes_compra_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordenes_compra_recibido_por_fkey"
            columns: ["recibido_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          }
        ]
      }
      orden_compra_detalles: {
        Row: {
          id: string
          clinica_id: string
          orden_id: string
          producto_id: string
          cantidad_pedida: number
          cantidad_recibida: number
          costo_unitario_bs: number
          subtotal_bs: number
          lote: string | null
          fecha_vencimiento: string | null
          created_at: string
        }
        Insert: {
          id?: string
          clinica_id?: string
          orden_id: string
          producto_id: string
          cantidad_pedida: number
          cantidad_recibida?: number
          costo_unitario_bs: number
          subtotal_bs: number
          lote?: string | null
          fecha_vencimiento?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          clinica_id?: string
          orden_id?: string
          producto_id?: string
          cantidad_pedida?: number
          cantidad_recibida?: number
          costo_unitario_bs?: number
          subtotal_bs?: number
          lote?: string | null
          fecha_vencimiento?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orden_compra_detalles_orden_id_fkey"
            columns: ["orden_id"]
            isOneToOne: false
            referencedRelation: "ordenes_compra"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orden_compra_detalles_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          }
        ]
      }
      petshop_promociones: {
        Row: {
          id: string
          clinica_id: string
          titulo: string
          descripcion: string | null
          tipo: string
          codigo_cupon: string | null
          valor_descuento: number
          fecha_inicio: string
          fecha_fin: string
          activo: boolean
          limite_uso: number | null
          usos_actuales: number
          condiciones: Json
          created_at: string
        }
        Insert: {
          id?: string
          clinica_id?: string
          titulo: string
          descripcion?: string | null
          tipo: string
          codigo_cupon?: string | null
          valor_descuento?: number
          fecha_inicio: string
          fecha_fin: string
          activo?: boolean
          limite_uso?: number | null
          usos_actuales?: number
          condiciones?: Json
          created_at?: string
        }
        Update: {
          id?: string
          clinica_id?: string
          titulo?: string
          descripcion?: string | null
          tipo?: string
          codigo_cupon?: string | null
          valor_descuento?: number
          fecha_inicio?: string
          fecha_fin?: string
          activo?: boolean
          limite_uso?: number | null
          usos_actuales?: number
          condiciones?: Json
          created_at?: string
        }
        Relationships: []
      }
      petshop_devoluciones: {
        Row: {
          id: string
          clinica_id: string
          sucursal_id: string
          cobro_id: string | null
          producto_id: string
          cantidad: number
          motivo: string
          estado_producto: string
          monto_devuelto_bs: number
          usuario_id: string | null
          autorizado_por: string | null
          created_at: string
        }
        Insert: {
          id?: string
          clinica_id?: string
          sucursal_id: string
          cobro_id?: string | null
          producto_id: string
          cantidad: number
          motivo: string
          estado_producto: string
          monto_devuelto_bs?: number
          usuario_id?: string | null
          autorizado_por?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          clinica_id?: string
          sucursal_id?: string
          cobro_id?: string | null
          producto_id?: string
          cantidad?: number
          motivo?: string
          estado_producto?: string
          monto_devuelto_bs?: number
          usuario_id?: string | null
          autorizado_por?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "petshop_devoluciones_cobro_id_fkey"
            columns: ["cobro_id"]
            isOneToOne: false
            referencedRelation: "cobros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "petshop_devoluciones_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "petshop_devoluciones_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "petshop_devoluciones_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          }
        ]
      }
      petshop_configuracion: {
        Row: {
          id: string
          clinica_id: string
          dias_alerta_vencimiento: number
          permitir_venta_sin_stock: boolean
          exigir_autorizacion_devolucion: boolean
          impresion_ticket_automatica: boolean
          mensaje_ticket_pie: string
          created_at: string
        }
        Insert: {
          id?: string
          clinica_id?: string
          dias_alerta_vencimiento?: number
          permitir_venta_sin_stock?: boolean
          exigir_autorizacion_devolucion?: boolean
          impresion_ticket_automatica?: boolean
          mensaje_ticket_pie?: string
          created_at?: string
        }
        Update: {
          id?: string
          clinica_id?: string
          dias_alerta_vencimiento?: number
          permitir_venta_sin_stock?: boolean
          exigir_autorizacion_devolucion?: boolean
          impresion_ticket_automatica?: boolean
          mensaje_ticket_pie?: string
          created_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      auth_clinica_id: { Args: never; Returns: string }
      auth_es_admin: { Args: never; Returns: boolean }
      auth_es_personal: { Args: never; Returns: boolean }
      auth_es_plataforma: { Args: never; Returns: boolean }
      auth_sucursal_id: { Args: never; Returns: string }
      clinicas_para_registro: {
        Args: never
        Returns: {
          id: string
          nombre: string
        }[]
      }
      clinicas_con_catalogo: {
        Args: never
        Returns: {
          id: string
          nombre: string
          logo_url: string | null
          ciudad: string
          tipo_negocio: string
          whatsapp: string
        }[]
      }
      // Migración 0035, añadidas a mano por el mismo motivo que las de 0028
      // (ver más abajo): sin declararlas aquí, `supabase.rpc()` las rechaza.
      clinicas_con_peluqueria: {
        Args: never
        Returns: {
          id: string
          nombre: string
          logo_url: string | null
          ciudad: string
          tipo_negocio: string
          whatsapp: string
        }[]
      }
      servicios_peluqueria_de: {
        Args: { p_clinica_id: string }
        Returns: {
          id: string
          nombre: string
          precio_bs: number
          duracion_minutos: number
          categoria_grooming: string
          especie_permitida: string
          tamano_permitido: string
        }[]
      }
      aprobar_pago_suscripcion: { Args: { p_pago_id: string }; Returns: string }
      consumir_cuota_whatsapp: { Args: never; Returns: number }
      espacio_estudios_bytes: { Args: never; Returns: number }
      get_citas_end_time: { Args: { start_time: string }; Returns: string }
      // Migración 0028. Añadidas a mano: este fichero se genera desde la base,
      // y hasta que alguien vuelva a generarlo `supabase.rpc()` rechaza por
      // tipos cualquier función que no esté en esta unión.
      vincular_cuenta_portal: {
        Args: { p_ficha_destino: string; p_ficha_portal: string }
        Returns: string
      }
      desvincular_cuenta_portal: { Args: { p_ficha: string }; Returns: string }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
