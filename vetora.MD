# PRD — Vetora: Sistema SaaS de Gestión Veterinaria

## 1. Visión general del producto

**Problema**
Las veterinarias en Bolivia gestionan citas, historiales clínicos, inventario y comunicación con sus clientes de forma manual o dispersa entre cuadernos, Excel y WhatsApp personal. Esto genera pérdida de tiempo, citas mal coordinadas, historiales incompletos y una experiencia poco profesional.

**Propuesta de valor**
Una plataforma de gestión veterinaria que se adapta al tamaño real del negocio con historial clínico centralizado, agenda, inventario y comunicación automatizada por WhatsApp.

**Visión a largo plazo**
Convertirse en el sistema de referencia para la gestión de veterinarias en Bolivia, integrando administración, inventario y comunicación en un solo lugar.

**Mercado objetivo**
Veterinarias y consultorios independientes de Bolivia como mercado inicial.

---

## 2. Definición del MVP

**Objetivo de la primera versión**
Validar que veterinarias reales de Bolivia adopten el sistema para su operación diaria antes de invertir en funciones avanzadas.

**Incluye (alcance MVP)**
- Registro de clientes y mascotas con historial clínico básico.
- Agenda de citas (y consentimientos de cirugía).
- Usuarios con roles (veterinario, recepción).
- Recordatorios automáticos de citas por WhatsApp (solo envío).
- Inventario básico (entradas y salidas).
- Interfaz web responsive (computadora y celular).
- Estructura multi-sucursal en base de datos.

**Fuera de alcance (fases posteriores)**
- Plan Multi-sede completo (reportes comparativos, traspaso de inventario).
- Chatbot de WhatsApp conversacional o de agendamiento automático.
- Pagos en línea integrados.
- Aplicación móvil nativa (Android/iOS).
- Telemedicina.

---

## 3. Buyer persona

*   **Persona 1 — Veterinario independiente (Plan Consultorio):** Atiende solo/a. Necesita ordenar su agenda y separar su WhatsApp personal del trabajo.
*   **Persona 2 — Dueño/a de clínica veterinaria (Plan Clínica) [PRIMARIA]:** 2-5 veterinarios y recepción. Necesita visibilidad centralizada, estandarizar historiales y controlar el inventario.
*   **Persona 3 — Administrador de cadena veterinaria (Plan Multi-sede):** 2+ sucursales. Necesita reportes comparativos y control sin visitar los locales físicamente (fuera de alcance del MVP, pero estructurado en BD).

---

## 4. Épicas y Requisitos Funcionales (MVP)

*   **Épica 1: Autenticación, Usuarios y Roles:** Gestión de inquilinos (Tenants), Roles MVP (Admin, Veterinario, Recepción), Flujo de Login y Perfil.
*   **Épica 2: Gestión de Clientes y Pacientes:** Registro de dueños (con WhatsApp) y ficha técnica de mascotas. Historial clínico centralizado por paciente.
*   **Épica 3: Agenda, Citas y Procedimientos:** Calendario (diario/semanal), gestión de estados de cita. **Consentimientos de Cirugías:** Generación de PDF pre-llenado cuando el `tipo_cita` es cirugía/riesgo.
*   **Épica 4: Notificaciones (WhatsApp One-Way):** Envío automático de recordatorios 24h antes. Alertas de próximas vacunas. (Requiere validación de límite de cuota).
*   **Épica 5: Inventario y Facturación Básica:** Control de stock (bloqueo en 0), registro de transacciones tras la cita, recibos simples.

---

## 5. Tech Stack y Reglas de Negocio

### 5.1. Tech Stack Obligatorio
- **Frontend:** React + Vite
- **Estilos:** Tailwind CSS
- **Base de datos y autenticación:** Supabase (PostgreSQL + Supabase Auth)
*(Ninguna otra librería core sin aprobación explícita).*

### 5.2. Reglas de Negocio Estrictas
- **Moneda:** Bolivianos (Bs.) con dos decimales.
- **Secretos:** Todo en variables de entorno `.env` (no trackeado en git).
- **Multi-tenant / Aislamiento (RLS):** Toda consulta debe filtrar por `clinica_id`. Un usuario solo ve datos de su `sucursal_id` (excepto admins). Controlado mediante **Supabase Row Level Security (RLS)**, nunca solo en frontend.
- **Inventario:** Prohibido stock negativo. PostgreSQL bloquea operaciones que bajen el stock de 0.
- **WhatsApp:** Validación estricta del tope mensual de mensajes antes de disparar el API.
- **Tiempos:** Zona horaria estricta `America/La_Paz`.
- **Inmutabilidad:** El historial clínico cerrado y los consentimientos firmados **NO** se pueden editar, solo admiten lectura o nuevas entradas (Bloqueado por RLS).

---

## 6. Modelo de Datos (Esquema Relacional - Supabase)

*Todas las tablas incluyen `clinica_id` (RLS) y `created_at`.*

1.  **Núcleo:** 
    *   `clinicas`: `id`, `nombre`, `whatsapp_mensajes_enviados`, `whatsapp_limite`, `estado`.
    *   `sucursales`: `id`, `clinica_id`, `nombre`, `direccion`.
    *   `usuarios`: `id` (Supabase Auth), `clinica_id`, `sucursal_id`, `nombre`, `rol`.
2.  **Pacientes/Clientes:**
    *   `clientes`: `id`, `clinica_id`, `nombre`, `whatsapp`, `ci`.
    *   `pacientes`: `id`, `clinica_id`, `cliente_id`, `nombre`, `especie`, `raza`, `sexo`.
3.  **Clínico (Inmutables tras cierre):**
    *   `citas`: `id`, `clinica_id`, `sucursal_id`, `paciente_id`, `fecha_hora` (TIMESTAMPTZ), `tipo_cita`, `estado`.
    *   `historial_clinico`: `id`, `paciente_id`, `cita_id`, `veterinario_id`, `motivo`, `diagnostico`, `tratamiento`, `editable` (Boolean, default true).
    *   `consentimientos_cirugia`: `id`, `cita_id`, `paciente_id`, `url_pdf`, `metodo_aceptacion`. (Solo INSERT).
4.  **Inventario:**
    *   `productos`: `id`, `sucursal_id`, `nombre`, `precio_bs`, `stock_actual` (Constraint: `CHECK (stock_actual >= 0)`).
    *   `movimientos_inventario`: `id`, `producto_id`, `tipo` (ingreso/egreso), `cantidad`.

---

## 7. Historias de Usuario (Core MVP - BDD)

**HU-01: Agendamiento de cirugías y consentimiento informado**
*   **Dado** que el usuario crea una cita para "Max" con el tipo `cirugia`
*   **Cuando** guarda la cita
*   **Entonces** el sistema guarda la fecha en `America/La_Paz` y habilita el botón "Generar Consentimiento".
*   **Cuando** se marca como "Aceptado", el registro queda inmutable (Supabase bloquea UPDATE).

**HU-02: Cierre inmutable de historial clínico**
*   **Dado** que el veterinario está editando un historial con datos obligatorios llenos
*   **Cuando** hace clic en "Finalizar y Cerrar Historial"
*   **Entonces** el campo `editable` pasa a `false`
*   **Y** las políticas RLS rechazan cualquier intento de UPDATE sobre ese registro; el frontend pasa a modo solo lectura.

**HU-03: Restricción de stock negativo**
*   **Dado** que "Vacuna" tiene `stock = 1`
*   **Cuando** el usuario intenta registrar un egreso de `2` unidades
*   **Entonces** la DB rechaza la transacción (`CHECK`) y el frontend muestra: "Stock insuficiente".

---

## 8. Interfaces de Usuario y Componentes (UI/UX)

### 8.1. Paleta de Colores (Tailwind CSS)
El diseño transmitirá confianza, limpieza médica y modernidad:
- **Primario (Acciones/Marca):** `teal-600` (Hover: `teal-700`).
- **Secundario (Fondos y Superficies):** `slate-50` para fondo global, `white` para tarjetas.
- **Texto:** `slate-800` (textos principales), `slate-500` (labels y subtítulos).
- **Éxito (Finalizar, Pagado):** `emerald-600`.
- **Alerta / Peligro (Cancelar, Eliminar, Cirugía):** `rose-600`.
- **Advertencia (Bajo stock):** `amber-500`.

### 8.2. Desglose de Pantallas Clave

**Pantalla 1: Calendario / Agenda**
- **Vista:** Grilla tipo calendario (día/semana/mes).
- **Componentes:** 
  - Botón principal `bg-teal-600`: "+ Nueva Cita".
  - Modal de Agendamiento: Selector de Paciente, Fecha/Hora, Veterinario. Select de Tipo (`Consulta`, `Vacuna`, `Cirugía`).
  - *Condicional:* Si es `Cirugía`, muestra un badge `bg-rose-100 text-rose-700` indicando "Requiere Consentimiento".

**Pantalla 2: Ficha del Paciente (Historial Clínico)**
- **Vista:** Perfil de la mascota con acordeones cronológicos de sus visitas.
- **Componentes:**
  - Tarjeta de información del paciente (Especie, Raza, Edad, Dueño, WhatsApp).
  - Listado de historiales previos (Cerrados, solo lectura, UI desactivada/grisácea).
  - Formulario de Nueva Consulta: Campos de texto (Motivo, Síntomas, Diagnóstico, Receta).
  - Botón: "Guardar Borrador" (`bg-slate-200 text-slate-700`).
  - Botón de Acción Crítica: "Finalizar y Cerrar Historial" (`bg-emerald-600 text-white`). Con pop-up de confirmación advirtiendo que la acción es irreversible.

**Pantalla 3: Módulo de Inventario**
- **Vista:** Tabla de productos filtrable por sucursal.
- **Componentes:**
  - Columnas: SKU, Nombre, Stock, Precio (Bs.), Acciones.
  - Indicadores visuales: Si Stock <= 3, mostrar número en `text-amber-500`. Si Stock = 0, en `text-rose-600`.
  - Botón en cada fila: "+/- Ajustar Stock" (Abre modal para registrar ingreso/egreso justificando el motivo).