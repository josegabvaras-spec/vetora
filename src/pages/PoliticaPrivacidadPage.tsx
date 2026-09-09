import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card } from '../components/ui/Card'
import { Seccion } from '../components/ui/Seccion'

/**
 * Política de privacidad.
 *
 * ✅ **2026-09-09 — restauradas las dos secciones que llevaban retiradas desde
 * el 06-09.** Se habían quitado (no por ser falsas — seguían verificadas —,
 * sino para no publicar una calificación jurídica antes de tenerla) mientras
 * se esperaba la respuesta de la asesoría sobre quién es responsable y quién
 * encargado del tratamiento. Esa respuesta ya llegó — Vetora es encargada,
 * cada clínica es responsable, ver `INFORME_PARA_ASESORIA_JURIDICA.md` — así
 * que:
 *
 * - **«Dónde están físicamente sus datos»** vuelve tal como estaba: era
 *   puramente factual (Brasil/EE. UU.), nunca dependió de la calificación
 *   jurídica. Con esto la política ya informa la transferencia internacional,
 *   que hasta hoy era una omisión conocida.
 * - **«Cómo funcionan realmente los mensajes de WhatsApp»** vuelve igual:
 *   se había retirado junto con la anterior por comodidad, no porque tuviera
 *   nada pendiente.
 * - Dentro de **«Para qué se usan»** se añadió la frase que sí dependía de la
 *   respuesta («Vetora es encargada del tratamiento, su clínica es la
 *   responsable») y un párrafo de base de licitud (por qué se tratan estos
 *   datos sin pedir un consentimiento aparte). Y en **«Qué datos se guardan»**
 *   una frase sobre menores de edad, que no existía.
 * - Estas dos últimas frases son lenguaje estándar y no controvertido —no una
 *   calificación jurídica nueva sin respaldo—, pero si la asesoría revisa el
 *   texto completo de la política en algún momento, conviene que las vea.
 *
 * ---
 *
 * Reescrita el 2026-09-06 porque la anterior afirmaba cosas que el sistema no
 * hace. Cada corrección vino de contrastar el texto contra el código y la base
 * de datos, no de reescribirlo por estilo:
 *
 * 1. **«Vetora envíe mensajes de WhatsApp»** — falso; corregido (ver «Cómo
 *    funcionan realmente los mensajes de WhatsApp»).
 * 2. **«encriptados en tránsito y en reposo»** — el tránsito sí (HTTPS,
 *    verificado); **el reposo nunca se verificó**. Es una propiedad de la
 *    plataforma gestionada que damos por supuesta, y afirmarla en un documento
 *    legal es justo lo que no se debe hacer. Ahora se dice como lo que es.
 * 3. **No decía dónde están los datos** — corregido (ver «Dónde están
 *    físicamente sus datos»).
 * 4. **No mencionaba la IA**, salvo una frase tranquilizadora sobre
 *    entrenamiento. El sistema SÍ envía datos clínicos a un tercero.
 * 5. **«Vetora actúa únicamente como procesador de datos»** — era una
 *    calificación **jurídica** que no correspondía hacer unilateralmente.
 *    Retirada hasta que lo dijera un abogado; ya lo dijo (ver arriba) y quedó
 *    reintroducida, con el vocabulario exacto que confirmó: encargada/responsable.
 * 6. **No mencionaba el CI**, que es el dato más sensible que se guarda.
 * 7. **No decía que el operador puede acceder** vía la función de respaldo.
 * 8. **Solo hablaba de la clínica**, no del dueño de mascota, que es de quien
 *    son los datos.
 *
 * ⚠️ **Esto es un texto FACTUAL, no un dictamen legal**, salvo por la frase de
 * responsable/encargado del punto 5, que sí es una calificación — pero una que
 * ya no hacemos unilateralmente, la confirmó la asesoría.
 */
export function PoliticaPrivacidadPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200/60 bg-white/80 px-4 py-3 shadow-sm backdrop-blur-md sm:px-6">
        <div className="flex items-center gap-3">
          <Link
            to="/login"
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-900"
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="font-display text-lg font-bold tracking-tight text-slate-900">Vetora</h1>
            <p className="-mt-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Políticas Legales
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl p-4 sm:p-6 lg:p-8 space-y-6">
        <div>
          <h1 className="text-3xl font-black text-slate-900 font-display">Política de Privacidad</h1>
          <p className="mt-2 text-sm text-slate-500">
            Última actualización: 9 de septiembre de 2026
          </p>
        </div>

        <Card>
          <Seccion titulo="Resumen en una frase">
            <p className="text-slate-600 text-sm leading-relaxed">
              Vetora guarda los datos de los dueños de mascota y el historial clínico de sus
              animales para que su veterinaria pueda atenderlos. Cada clínica solo ve los suyos, y
              no se venden ni se comparten con nadie para publicidad.
            </p>
          </Seccion>

          <Seccion titulo="1. Qué datos se guardan">
            <p className="text-slate-600 text-sm leading-relaxed mb-3">
              <strong className="text-slate-800">Del dueño de la mascota:</strong>
            </p>
            <ul className="list-disc list-inside text-sm text-slate-600 space-y-1 mb-4">
              <li>Nombre completo.</li>
              <li>
                <strong className="text-slate-800">Número de cédula de identidad (CI)</strong>, si
                la clínica lo registra. Se usa para poder vincular su cuenta del portal con la ficha
                que la clínica ya tenía de usted.
              </li>
              <li>Número de WhatsApp o teléfono.</li>
              <li>Correo electrónico, únicamente si abre una cuenta en el portal.</li>
            </ul>

            <p className="text-slate-600 text-sm leading-relaxed mb-3">
              <strong className="text-slate-800">De la mascota:</strong> nombre, especie, raza,
              sexo, fecha de nacimiento, alergias, antecedentes, fotografía, y su historial clínico
              — motivo de consulta, síntomas, diagnóstico, tratamiento, peso, recetas, vacunas,
              desparasitaciones, consentimientos de cirugía firmados e informes.
            </p>

            <p className="text-slate-600 text-sm leading-relaxed mb-3">
              <strong className="text-slate-800">Del personal de la clínica:</strong> nombre, correo
              electrónico, WhatsApp y su rol dentro de la clínica.
            </p>

            <p className="text-slate-600 text-sm leading-relaxed">
              Vetora no está dirigido a menores de edad ni recoge intencionalmente datos de niños:
              los datos de esta política pertenecen a la persona adulta responsable de la mascota.
            </p>
          </Seccion>

          <Seccion titulo="2. Dónde están físicamente sus datos">
            <p className="text-slate-600 text-sm leading-relaxed mb-3">
              Esto es importante y preferimos decirlo claro:{' '}
              <strong className="text-slate-800">sus datos no se almacenan en Bolivia.</strong>
            </p>
            <ul className="list-disc list-inside text-sm text-slate-600 space-y-1">
              <li>
                <strong className="text-slate-800">Base de datos y archivos</strong> (incluidas las
                fotografías): servidores de Supabase en{' '}
                <strong className="text-slate-800">São Paulo, Brasil</strong>.
              </li>
              <li>
                <strong className="text-slate-800">La aplicación web</strong> se sirve desde la red
                de Vercel, con presencia principalmente en Estados Unidos.
              </li>
              <li>
                <strong className="text-slate-800">El asistente de inteligencia artificial</strong>{' '}
                procesa en Estados Unidos (ver punto 4).
              </li>
            </ul>
          </Seccion>

          <Seccion titulo="3. Para qué se usan">
            <ul className="list-disc list-inside text-sm text-slate-600 space-y-1">
              <li>Que su veterinaria pueda agendar citas y llevar el historial de su mascota.</li>
              <li>Que usted pueda ver ese historial desde su portal.</li>
              <li>Que la clínica lleve su inventario, su caja y sus cobros.</li>
              <li>Que la clínica pueda escribirle recordatorios de sus citas y sus vacunas.</li>
            </ul>
            <p className="text-slate-600 text-sm leading-relaxed mt-4">
              <strong className="text-slate-800">
                No se usan para publicidad, no se venden, y no se comparten con terceros
              </strong>{' '}
              salvo los proveedores de infraestructura necesarios para que el servicio funcione.
            </p>
            <p className="text-slate-600 text-sm leading-relaxed mt-4">
              <strong className="text-slate-800">Por qué tratamos estos datos:</strong> porque son
              necesarios para prestarle el servicio veterinario que usted contrató con su clínica —
              agendar, atender, cobrar y darle seguimiento a su mascota. No le pedimos un
              consentimiento aparte para esto porque el tratamiento es parte inherente de esa
              relación con su clínica.
            </p>
            <p className="text-slate-600 text-sm leading-relaxed mt-4">
              <strong className="text-slate-800">Frente a esta información, Vetora es encargada del
              tratamiento y su clínica es la responsable:</strong>{' '}
              es su veterinaria quien decide para qué se usan sus datos y quien responde ante usted
              por ellos. Vetora los aloja y los protege técnicamente, pero no decide por su cuenta
              qué hacer con ellos.
            </p>
          </Seccion>

          <Seccion titulo="4. El asistente de inteligencia artificial">
            <p className="text-slate-600 text-sm leading-relaxed mb-3">
              Vetora incluye un asistente que ayuda al personal de la clínica a redactar
              recordatorios y a consultar información de su propia clínica. Para funcionar,{' '}
              <strong className="text-slate-800">
                envía parte de la información a Anthropic, un proveedor en Estados Unidos.
              </strong>
            </p>
            <p className="text-slate-600 text-sm leading-relaxed mb-3">
              <strong className="text-slate-800">Lo que se envía:</strong> nombre de la mascota,
              especie, su nombre de pila, fecha y tipo de procedimiento. Cuando el personal consulta
              sobre un paciente concreto, además el historial clínico y las recetas de ese animal.
            </p>
            <p className="text-slate-600 text-sm leading-relaxed">
              <strong className="text-slate-800">Lo que nunca se envía:</strong> su número de cédula,
              su teléfono, su correo electrónico ni las fotografías. Esta separación está
              implementada en el sistema, no es solo una intención.
            </p>
          </Seccion>

          <Seccion titulo="5. Cómo funcionan realmente los mensajes de WhatsApp">
            <p className="text-slate-600 text-sm leading-relaxed mb-3">
              Vetora <strong className="text-slate-800">no envía mensajes automáticamente</strong>.
              Cuando la clínica quiere recordarle una cita o una vacuna, el sistema le prepara el
              texto y abre WhatsApp;{' '}
              <strong className="text-slate-800">
                el mensaje lo envía una persona de la clínica desde su propio teléfono
              </strong>
              , como cualquier mensaje normal.
            </p>
            <p className="text-slate-600 text-sm leading-relaxed">
              Esto significa que Vetora no tiene acceso a su conversación de WhatsApp, y que quien
              decide escribirle es su veterinaria, no el sistema.
            </p>
          </Seccion>

          <Seccion titulo="6. Quién puede ver sus datos">
            <ul className="list-disc list-inside text-sm text-slate-600 space-y-1 mb-4">
              <li>
                <strong className="text-slate-800">Su clínica</strong>, y únicamente su clínica. Una
                clínica no puede ver los datos de otra: está impedido en la base de datos, no solo
                en la pantalla.
              </li>
              <li>
                <strong className="text-slate-800">Usted</strong>, desde su portal: el expediente de
                sus propias mascotas, en modo lectura.
              </li>
            </ul>
            <p className="text-slate-600 text-sm leading-relaxed mb-3">
              <strong className="text-slate-800">
                Nosotros, como operadores de Vetora, no podemos ver historiales clínicos, pacientes
                ni cobros de ninguna clínica.
              </strong>{' '}
              La cuenta con la que administramos la plataforma está deliberadamente fuera de ese
              acceso.
            </p>
            <p className="text-slate-600 text-sm leading-relaxed">
              <strong className="text-slate-800">Con una excepción que preferimos declarar:</strong>{' '}
              existe una función de respaldo que sí permite extraer los datos de una clínica
              concreta. Existe para poder devolverle sus datos a una clínica que lo solicite o que se
              dé de baja, solo nosotros podemos ejecutarla, y cada uso queda registrado.
            </p>
          </Seccion>

          <Seccion titulo="7. Seguridad">
            <p className="text-slate-600 text-sm leading-relaxed mb-3">
              La conexión entre su navegador y Vetora va{' '}
              <strong className="text-slate-800">cifrada (HTTPS)</strong> en todo momento. Las
              contraseñas nunca se guardan en texto plano: la autenticación la gestiona el proveedor
              de infraestructura.
            </p>
            <p className="text-slate-600 text-sm leading-relaxed mb-3">
              El historial clínico, una vez cerrado, no se puede modificar ni borrar. Los cobros
              tampoco. Un registro firmado se conserva tal como se firmó.
            </p>
            <p className="text-slate-600 text-sm leading-relaxed">
              El cifrado del almacenamiento en reposo lo proporciona nuestro proveedor de
              infraestructura conforme a sus propias condiciones de servicio.
            </p>
          </Seccion>

          <Seccion titulo="8. Sus derechos y cómo ejercerlos">
            <p className="text-slate-600 text-sm leading-relaxed mb-3">
              <strong className="text-slate-800">Si usted es dueño de una mascota:</strong> los datos
              los registra y los administra su clínica veterinaria, así que{' '}
              <strong className="text-slate-800">
                para ver, corregir o eliminar su información debe dirigirse a ella
              </strong>
              . Desde su portal puede consultar y descargar en cualquier momento el expediente de sus
              mascotas.
            </p>
            <p className="text-slate-600 text-sm leading-relaxed">
              <strong className="text-slate-800">Si usted es una clínica:</strong> puede exportar
              todos sus datos cuando quiera desde la sección de Respaldo, y puede solicitar la
              eliminación completa de su cuenta y de sus datos. La eliminación es definitiva.
            </p>
          </Seccion>

          <Seccion titulo="9. Cuánto tiempo se conservan">
            <p className="text-slate-600 text-sm leading-relaxed">
              Los datos se conservan mientras la clínica mantenga su cuenta activa. No hay borrado
              automático por antigüedad: un historial clínico se conserva porque es el expediente
              médico del animal. Si una clínica solicita la baja, sus datos se eliminan por completo.
            </p>
          </Seccion>

          <Seccion titulo="10. Cambios en esta política">
            <p className="text-slate-600 text-sm leading-relaxed">
              Si cambiamos algo sustancial en cómo tratamos sus datos, actualizaremos esta página y
              su fecha. Partes de esta política ya fueron revisadas con asesoría legal en Bolivia, y
              puede seguir cambiando conforme avance esa revisión.
            </p>
          </Seccion>

          <Seccion titulo="11. Contacto">
            <p className="text-slate-600 text-sm leading-relaxed">
              Para cualquier duda sobre el manejo de sus datos, puede escribir al correo de soporte
              de Vetora. Si es dueño de una mascota y su consulta es sobre datos que registró su
              veterinaria, lo más rápido es dirigirse directamente a ella.
            </p>
          </Seccion>
        </Card>
      </main>
    </div>
  )
}
