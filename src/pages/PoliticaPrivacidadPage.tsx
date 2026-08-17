import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card } from '../components/ui/Card'
import { Seccion } from '../components/ui/Seccion'

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
        <h1 className="text-3xl font-black text-slate-900 font-display">Política de Privacidad</h1>
        
        <Card>
          <Seccion titulo="1. Recopilación de Información">
            <p className="text-slate-600 text-sm leading-relaxed mb-4">
              Vetora ("la Plataforma") recopila la información necesaria para el funcionamiento de los servicios clínicos veterinarios y la gestión administrativa de las clínicas suscritas. Esto incluye, pero no se limita a:
            </p>
            <ul className="list-disc list-inside text-sm text-slate-600 space-y-1">
              <li>Datos de contacto de administradores y personal veterinario (nombre, correo electrónico, WhatsApp).</li>
              <li>Información de los clientes de las clínicas (propietarios de mascotas).</li>
              <li>Registros médicos e historial clínico de los pacientes (mascotas).</li>
              <li>Registros de facturación y cobros.</li>
            </ul>
          </Seccion>

          <Seccion titulo="2. Uso de la Información">
            <p className="text-slate-600 text-sm leading-relaxed mb-4">
              La información ingresada en la Plataforma pertenece exclusivamente a la clínica veterinaria que la registra ("el Inquilino"). Vetora actúa únicamente como procesador de datos, utilizando la información para:
            </p>
            <ul className="list-disc list-inside text-sm text-slate-600 space-y-1">
              <li>Permitir el acceso y autenticación de usuarios.</li>
              <li>Facilitar la gestión de citas, historias clínicas e inventarios.</li>
              <li>Enviar notificaciones y recordatorios a los clientes vía WhatsApp (si la clínica lo habilita).</li>
              <li>Mejorar el rendimiento y seguridad de la plataforma.</li>
            </ul>
          </Seccion>

          <Seccion titulo="3. Privacidad y Seguridad (Multitenencia)">
            <p className="text-slate-600 text-sm leading-relaxed mb-4">
              Vetora utiliza estrictas políticas de Seguridad a Nivel de Fila (Row Level Security - RLS) en su base de datos. Esto garantiza que la información de una clínica es absolutamente invisible e inaccesible para cualquier otra clínica que utilice la plataforma.
            </p>
            <p className="text-slate-600 text-sm leading-relaxed">
              Los datos están encriptados en tránsito y en reposo. Las contraseñas de los usuarios no son almacenadas en texto plano en ningún momento, y la autenticación es delegada a sistemas de alta seguridad.
            </p>
          </Seccion>

          <Seccion titulo="4. Envío de Mensajes por WhatsApp">
            <p className="text-slate-600 text-sm leading-relaxed">
              Al registrar un cliente y habilitar notificaciones, la clínica acepta que Vetora envíe mensajes de WhatsApp al número proporcionado por el cliente, incluyendo recordatorios de citas y accesos al portal. Es responsabilidad de la clínica obtener el consentimiento previo de sus clientes para ser contactados por este medio.
            </p>
          </Seccion>

          <Seccion titulo="5. Derechos sobre los Datos">
            <p className="text-slate-600 text-sm leading-relaxed">
              La clínica puede, en cualquier momento, exportar su información o solicitar la eliminación total de su cuenta y sus datos asociados. Vetora no comparte, vende, ni utiliza los datos clínicos o comerciales de sus usuarios para propósitos de terceros, publicidad o entrenamiento de inteligencia artificial fuera de los límites del servicio contratado.
            </p>
          </Seccion>

          <Seccion titulo="6. Contacto">
            <p className="text-slate-600 text-sm leading-relaxed">
              Para dudas sobre esta política de privacidad o el manejo de los datos, por favor contactar al administrador del sistema o al correo de soporte de Vetora.
            </p>
          </Seccion>
        </Card>
      </main>
    </div>
  )
}
