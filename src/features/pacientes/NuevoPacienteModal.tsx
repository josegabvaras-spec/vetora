import { useState } from 'react'
import { Stethoscope } from 'lucide-react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { Seccion } from '../../components/ui/Seccion'
import { registrarClienteYPaciente } from '../../services/clientesPacientes'
import { registrarProductoUsado } from '../../services/historial'
import { useAuth } from '../../context/AuthContext'
import { useTable } from '../../mocks/useDb'
import { supabase } from '../../lib/supabase'
import { puedeVerHistorialClinico } from '../../lib/personal'
import { FormularioPaciente, datosPacienteVacios } from './FormularioPaciente'
import { FormularioClinico, aCamposHistorial, datosClinicosVacios } from './FormularioClinico'
import { SeccionesConsulta, type ProductoPendiente } from './SeccionesConsulta'
import type { AltaPacienteResultado } from '../../services/clientesPacientes'

export function NuevoPacienteModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (resultado: AltaPacienteResultado) => void
}) {
  const { usuario, sucursalActivaId } = useAuth()
  const sucursales = useTable('sucursales')

  const [datosPaciente, setDatosPaciente] = useState(datosPacienteVacios)

  // Ficha clínica de la primera consulta. La llena quien atiende: todo
  // paciente de una clínica entra al sistema con su historial abierto. El
  // historial aún no existe al llenar el formulario, así que los productos se
  // acumulan y se registran justo después de crearlo.
  //
  // Las vacunas y desparasitaciones que la mascota ya trae puestas se cargan
  // después, desde el esquema sanitario de su ficha: allí la fecha de
  // aplicación es un campo, que es lo que un historial previo necesita.
  //
  // El peluquero es la excepción, y por eso esta sección es condicional: da de
  // alta a la mascota para poder agendarle, pero no abre una consulta médica.
  // Exigirle motivo, temperatura y frecuencia cardíaca —campos obligatorios de
  // abajo— le impedía registrar a nadie, que es justo lo que dejaba a una
  // peluquería sin poder usar el sistema.
  const conConsulta = puedeVerHistorialClinico(usuario)
  const [datosClinicos, setDatosClinicos] = useState(datosClinicosVacios)
  const [productosPendientes, setProductosPendientes] = useState<ProductoPendiente[]>([])

  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const faltaMotivo = conConsulta && !datosClinicos.motivo.trim()
  const faltanCamposFisico =
    conConsulta &&
    (!datosClinicos.peso_kg.trim() ||
      !datosClinicos.temperatura_c.trim() ||
      !datosClinicos.frecuencia_cardiaca.trim() ||
      !datosClinicos.frecuencia_respiratoria.trim())

  /** Valida contra el stock real menos lo ya pendiente, para avisar antes de crear al paciente. */
  async function agregarProductoPendiente(p: ProductoPendiente) {
    if (p.cantidad <= 0) throw new Error('La cantidad debe ser mayor a 0')
    const { data: producto } = await supabase.from('productos').select('*').eq('id', p.producto_id).single()
    if (!producto) throw new Error('Producto no encontrado')
    const yaPendiente = productosPendientes
      .filter((x) => x.producto_id === p.producto_id)
      .reduce((n, x) => n + x.cantidad, 0)
    if (p.cantidad + yaPendiente > producto.stock_actual) {
      throw new Error('Stock insuficiente')
    }
    setProductosPendientes((prev) => [...prev, p])
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (faltaMotivo) {
      setError('Indica el motivo de la primera consulta')
      return
    }
    if (faltanCamposFisico) {
      setError('Debes completar los campos de examen físico (peso, temperatura, frecuencia cardíaca y respiratoria)')
      return
    }
    setEnviando(true)
    try {
      const sucursalId = sucursalActivaId || usuario?.sucursal_id || sucursales[0]?.id
      if (!sucursalId) throw new Error('No hay sucursal activa. Selecciona una sucursal antes de continuar.')
      const resultado = await registrarClienteYPaciente({
        clienteNombre: datosPaciente.clienteNombre,
        clienteWhatsapp: datosPaciente.clienteWhatsapp,
        clienteCi: datosPaciente.clienteCi,
        pacienteNombre: datosPaciente.pacienteNombre,
        especie: datosPaciente.especie,
        raza: datosPaciente.raza,
        sexo: datosPaciente.sexo,
        foto: datosPaciente.foto,
        fechaNacimiento: datosPaciente.fechaNacimiento || null,
        alergias: datosPaciente.alergias,
        antecedentes: datosPaciente.antecedentes,
        veterinarioId: usuario?.id,
        sucursalId,
        // Sin consulta para el peluquero: `registrarClienteYPaciente` ya trata
        // `primeraConsulta` como opcional, así que la mascota se crea sola, sin
        // historial abierto a nombre de nadie.
        primeraConsulta: conConsulta ? aCamposHistorial(datosClinicos) : undefined,
      })

      // El historial ya existe: se registran las líneas acumuladas.
      const fallidas: string[] = []
      if (resultado.historialId) {
        for (const p of productosPendientes) {
          try {
            await registrarProductoUsado(resultado.historialId, p.producto_id, p.cantidad)
          } catch {
            const { data: prod } = await supabase.from('productos').select('nombre').eq('id', p.producto_id).single()
            const nombre = prod?.nombre ?? 'producto'
            fallidas.push(`${nombre} × ${p.cantidad}`)
          }
        }
      }

      if (fallidas.length > 0) {
        // El paciente y la consulta sí quedaron creados: se informa en vez de fingir éxito.
        setError(
          `El paciente se registró, pero no se pudo guardar: ${fallidas.join(', ')}. Agrégalo desde la ficha del paciente.`,
        )
        return
      }

      onCreated(resultado)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar el paciente')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Modal title="Nuevo cliente y mascota" onClose={onClose} widthClassName="max-w-4xl">
      <form className="space-y-5" onSubmit={handleSubmit}>
        <FormularioPaciente datos={datosPaciente} onChange={setDatosPaciente} />

        {/* Ficha clínica de la primera consulta: para quien atiende. El
            peluquero registra la mascota y nada más. */}
        {conConsulta && (
        <Seccion
          titulo="Ficha clínica de la primera consulta"
          tono="destacado"
          icono={<Stethoscope size={14} className="text-teal-600" />}
        >
          <FormularioClinico datos={datosClinicos} onChange={setDatosClinicos} />

          <SeccionesConsulta
            productos={[]}
            productosPendientes={productosPendientes}
            onAgregarProducto={agregarProductoPendiente}
            receta={[]}
            recetaPendientes={[]}
            onAgregarRecetaItem={async () => {}}
          />

          <p className="text-xs text-slate-500">
            La consulta queda como borrador: puede completarse y cerrarse después desde la ficha del paciente.
          </p>
        </Seccion>
        )}

        {error && <p className="text-sm text-rose-600">{error}</p>}

        <div className="flex justify-end gap-3 border-t border-slate-200 pt-5">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={enviando || faltaMotivo || faltanCamposFisico}>
            {enviando ? 'Guardando…' : 'Registrar'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
