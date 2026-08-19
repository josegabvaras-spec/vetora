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
          precio_acordado_bs: number
          proximo_cobro: string
          responsable: string
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
          precio_acordado_bs?: number
          proximo_cobro?: string
          responsable?: string
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
          precio_acordado_bs?: number
          proximo_cobro?: string
          responsable?: string
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
          id: string
          metodo_aceptacion: string
          paciente_id: string
          url_pdf: string
        }
        Insert: {
          cita_id: string
          clinica_id?: string
          created_at?: string
          id?: string
          metodo_aceptacion: string
          paciente_id: string
          url_pdf: string
        }
        Update: {
          cita_id?: string
          clinica_id?: string
          created_at?: string
          id?: string
          metodo_aceptacion?: string
          paciente_id?: string
          url_pdf?: string
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
          historial_id: string
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
          historial_id: string
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
          historial_id?: string
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
          nombre: string
          precio_mensual_bs: number
          whatsapp_limite: number
        }
        Insert: {
          activo?: boolean
          created_at?: string
          id?: string
          max_sucursales: number
          max_usuarios: number
          nombre: string
          precio_mensual_bs?: number
          whatsapp_limite: number
        }
        Update: {
          activo?: boolean
          created_at?: string
          id?: string
          max_sucursales?: number
          max_usuarios?: number
          nombre?: string
          precio_mensual_bs?: number
          whatsapp_limite?: number
        }
        Relationships: []
      }
      productos: {
        Row: {
          clinica_id: string
          composicion: string
          contenido_presentacion: number
          created_at: string
          id: string
          nombre: string
          precio_bs: number
          presentacion: string
          sku: string
          stock_actual: number
          stock_minimo: number
          sucursal_id: string
          unidad_medida: string
        }
        Insert: {
          clinica_id?: string
          composicion?: string
          contenido_presentacion?: number
          created_at?: string
          id?: string
          nombre: string
          precio_bs?: number
          presentacion?: string
          sku: string
          stock_actual?: number
          stock_minimo?: number
          sucursal_id: string
          unidad_medida?: string
        }
        Update: {
          clinica_id?: string
          composicion?: string
          contenido_presentacion?: number
          created_at?: string
          id?: string
          nombre?: string
          precio_bs?: number
          presentacion?: string
          sku?: string
          stock_actual?: number
          stock_minimo?: number
          sucursal_id?: string
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
          historial_id: string
          id: string
          nombre_vacuna: string
          paciente_id: string
        }
        Insert: {
          clinica_id?: string
          created_at?: string
          fecha_aplicacion?: string
          fecha_refuerzo?: string | null
          historial_id: string
          id?: string
          nombre_vacuna: string
          paciente_id: string
        }
        Update: {
          clinica_id?: string
          created_at?: string
          fecha_aplicacion?: string
          fecha_refuerzo?: string | null
          historial_id?: string
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
      consumir_cuota_whatsapp: { Args: never; Returns: number }
      get_citas_end_time: { Args: { start_time: string }; Returns: string }
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
