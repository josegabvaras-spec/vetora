import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ProtectedRoute } from './components/layout/ProtectedRoute'
import { AppLayout } from './components/layout/AppLayout'
import { LoginPage } from './pages/LoginPage'
import { AccesoPage } from './pages/AccesoPage'
import { RecuperarPasswordPage } from './pages/RecuperarPasswordPage'
import { NuevaPasswordPage } from './pages/NuevaPasswordPage'
import { AgendaPage } from './pages/AgendaPage'
import { PacientesListPage } from './pages/PacientesListPage'
import { ClientesPage } from './pages/ClientesPage'
import { FichaPacientePage } from './pages/FichaPacientePage'
import { InventarioPage } from './pages/InventarioPage'
import { ConsentimientoPage } from './pages/ConsentimientoPage'
import { HistorialImprimirPage } from './pages/HistorialImprimirPage'
import { ConsultaImprimirPage } from './pages/ConsultaImprimirPage'
import { RecetarioImprimirPage } from './pages/RecetarioImprimirPage'
import { InformeImprimirPage } from './pages/InformeImprimirPage'
import { RolRoute } from './components/layout/RolRoute'
import { ModuloRoute } from './components/layout/ModuloRoute'
import { CajaPage } from './pages/CajaPage'
import { MovimientosPage } from './pages/MovimientosPage'
import { ServiciosPage } from './pages/ServiciosPage'
import { ReciboPage } from './pages/ReciboPage'
import { InternacionPage } from './pages/InternacionPage'
import { RespaldoPage } from './pages/RespaldoPage'
import { MetricasPage } from './pages/MetricasPage'
import { AsistenteSegunRol } from './components/layout/AsistenteSegunRol'
import { InternacionImprimirPage } from './pages/InternacionImprimirPage'
import { PoliticaPrivacidadPage } from './pages/PoliticaPrivacidadPage'
import { PlataformaLayout } from './components/layout/PlataformaLayout'
import { PlataformaResumenPage } from './pages/plataforma/PlataformaResumenPage'
import { PlataformaAsistentePage } from './pages/plataforma/PlataformaAsistentePage'
import { PlataformaClinicasPage } from './pages/plataforma/PlataformaClinicasPage'
import { PlataformaUsuariosPage } from './pages/plataforma/PlataformaUsuariosPage'
import { PlataformaPlanesPage } from './pages/plataforma/PlataformaPlanesPage'
import { InicioSegunRol } from './components/layout/InicioSegunRol'
import { CatalogoPage } from './pages/CatalogoPage'

import { PortalClienteLayout } from './components/layout/PortalClienteLayout'
import { PortalDashboardPage } from './pages/portal-cliente/PortalDashboardPage'
import { PortalPacientePage } from './pages/portal-cliente/PortalPacientePage'
import { PortalTiendaPage } from './pages/portal-cliente/PortalTiendaPage'
import { PortalTiendaClinicaPage } from './pages/portal-cliente/PortalTiendaClinicaPage'
import { PortalMascotasPage } from './pages/portal-cliente/PortalMascotasPage'
import { PortalCitasPage } from './pages/portal-cliente/PortalCitasPage'
import { PortalPerfilPage } from './pages/portal-cliente/PortalPerfilPage'
import { RegistroClientePage } from './pages/RegistroClientePage'
import { HomePage } from './pages/HomePage'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Página Principal Pública (Home / Landing Page) */}
          <Route path="/" element={<HomePage />} />

          {/* Portal de Clientes (protegido por AuthContext normal) */}
          <Route element={<ProtectedRoute />}>
            <Route path="/portal-cliente" element={<PortalClienteLayout />}>
              <Route path="dashboard" element={<PortalDashboardPage />} />
              <Route path="mascotas" element={<PortalMascotasPage />} />
              <Route path="citas" element={<PortalCitasPage />} />
              <Route path="perfil" element={<PortalPerfilPage />} />
              <Route path="paciente/:pacienteId" element={<PortalPacientePage />} />
              {/* Sin ModuloRoute: no es un módulo de la propia clínica del
                  dueño, es contenido de OTRAS clínicas. */}
              <Route path="tienda" element={<PortalTiendaPage />} />
              <Route path="tienda/:clinicaId" element={<PortalTiendaClinicaPage />} />
            </Route>
          </Route>

          <Route path="/login" element={<LoginPage />} />
          <Route path="/privacidad" element={<PoliticaPrivacidadPage />} />
          <Route path="/registro-cliente" element={<RegistroClientePage />} />
          {/* Enlace que reciben por WhatsApp quienes acaban de ser dados de alta */}
          <Route path="/acceso/:token" element={<AccesoPage />} />
          {/* Recuperación por correo. Las dos van FUERA de `ProtectedRoute`:
              quien olvidó su contraseña no tiene sesión, y el enlace del correo
              rebotaría al login sin dejarle hacer nada. */}
          <Route path="/recuperar-password" element={<RecuperarPasswordPage />} />
          <Route path="/nueva-password" element={<NuevaPasswordPage />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/consentimientos/:citaId" element={<ConsentimientoPage />} />
            {/* Los documentos clínicos en papel enseñan exactamente lo que las
                pestañas del expediente, así que van tras la MISMA puerta que
                `puedeVerHistorialClinico()`. Sin este RolRoute bastaba con
                teclear la URL: colgaban solo de `ProtectedRoute`, y desde que
                el peluquero tiene «Pacientes» en el menú también tiene a mano
                los ids con los que construirla. El portal no enlaza ninguna de
                estas rutas — usa sus propias pantallas—, así que cerrarlas al
                personal clínico no le quita nada al dueño. */}
            <Route element={<RolRoute roles={['admin', 'veterinario', 'recepcion']} />}>
              <Route path="/pacientes/:id/historial/imprimir" element={<HistorialImprimirPage />} />
              <Route path="/pacientes/:pacienteId/consulta/:consultaId/imprimir" element={<ConsultaImprimirPage />} />
              <Route path="/pacientes/:pacienteId/consulta/:consultaId/receta/imprimir" element={<RecetarioImprimirPage />} />
              <Route path="/pacientes/:pacienteId/reporte/:tipo" element={<InformeImprimirPage />} />
              <Route path="/pacientes/:pacienteId/reporte/:tipo/:itemId" element={<InformeImprimirPage />} />
              <Route path="/internaciones/:id/imprimir" element={<InternacionImprimirPage />} />
            </Route>
            <Route path="/recibos/:cobroId" element={<ReciboPage />} />
            {/* Área del dueño de la plataforma: no comparte nada con la clínica */}
            <Route element={<RolRoute roles={['superadmin']} />}>
              <Route element={<PlataformaLayout />}>
                <Route path="/plataforma" element={<PlataformaResumenPage />} />
                <Route path="/plataforma/asistente" element={<PlataformaAsistentePage />} />
                <Route path="/plataforma/clinicas" element={<PlataformaClinicasPage />} />
                <Route path="/plataforma/usuarios" element={<PlataformaUsuariosPage />} />
                <Route path="/plataforma/planes" element={<PlataformaPlanesPage />} />
              </Route>
            </Route>

            <Route element={<AppLayout />}>
              {/* Sin módulo: la agenda es el destino al que rebota
                  `ModuloRoute` (y `RolRoute`, y `InicioSegunRol` por defecto) —
                  por eso `peluquero` va aquí sin excepción: sin él, quedaría en
                  un bucle infinito de redirección. */}
              <Route element={<RolRoute roles={['admin', 'veterinario', 'recepcion', 'peluquero']} />}>
                <Route path="/agenda" element={<AgendaPage />} />
              </Route>

              {/* Alta de mascotas y dueños. El peluquero SÍ entra: una
                  peluquería tiene que poder registrar al paciente para poder
                  agendarle y para que su dueño lo vea en el portal, igual que
                  una clínica — y la RLS ya se lo permite (`auth_es_personal()`
                  lo incluye desde 0025). Lo que no ve es el expediente clínico:
                  `FichaPacientePage` le oculta las pestañas de historial,
                  esquema sanitario e internaciones con
                  `puedeVerHistorialClinico()`, y las rutas de impresión —que
                  enseñan lo mismo en papel— quedan cerradas por su propio
                  RolRoute, más arriba.

                  Sin este RolRoute, una cuenta del portal («cliente») entraría
                  en las mismas pantallas que el personal. */}
              <Route element={<RolRoute roles={['admin', 'veterinario', 'recepcion', 'peluquero']} />}>
                <Route path="/pacientes" element={<PacientesListPage />} />
                <Route path="/pacientes/:id" element={<FichaPacientePage />} />
                {/* Sin módulo: la lista de dueños no es una sección opcional
                    del plan, es la contraparte de Pacientes. */}
                <Route path="/clientes" element={<ClientesPage />} />
              </Route>

              {/* El peluquero no interna ni maneja el kardex. */}
              <Route element={<RolRoute roles={['admin', 'veterinario', 'recepcion']} />}>
                <Route element={<ModuloRoute modulo="internacion" />}>
                  <Route path="/internacion" element={<InternacionPage />} />
                </Route>
                <Route element={<ModuloRoute modulo="inventario" />}>
                  <Route path="/inventario" element={<InventarioPage />} />
                </Route>
              </Route>

              {/* El asistente lo abre todo el personal que atiende directamente
                  (veterinario, peluquero) más recepción/admin, pero enseña dos
                  cosas distintas: a quien atiende, su cola de trabajo del día;
                  a recepción y administración, los avisos al cliente y el
                  informe del día. Ver AsistenteSegunRol. */}
              <Route element={<RolRoute roles={['recepcion', 'admin', 'veterinario', 'peluquero']} />}>
                <Route element={<ModuloRoute modulo="asistente_ia" />}>
                  <Route path="/asistente" element={<AsistenteSegunRol />} />
                </Route>
              </Route>

              {/* Caja para recepción y administración; los movimientos, solo administración */}
              <Route element={<RolRoute roles={['recepcion', 'admin']} />}>
                <Route element={<ModuloRoute modulo="caja" />}>
                  <Route path="/caja" element={<CajaPage />} />
                </Route>
                {/* El respaldo no depende del plan: sus datos son suyos. */}
                <Route path="/respaldo" element={<RespaldoPage />} />
              </Route>
              <Route element={<RolRoute roles={['admin']} />}>
                {/* Servicios tampoco: sin tarifas no se cobra en ningún tipo
                    de negocio. */}
                <Route path="/servicios" element={<ServiciosPage />} />
                <Route element={<ModuloRoute modulo="caja" />}>
                  <Route path="/movimientos" element={<MovimientosPage />} />
                </Route>
                <Route element={<ModuloRoute modulo="metricas" />}>
                  <Route path="/metricas" element={<MetricasPage />} />
                </Route>
                <Route element={<ModuloRoute modulo="catalogo" />}>
                  <Route path="/catalogo" element={<CatalogoPage />} />
                </Route>
              </Route>

              <Route path="/" element={<InicioSegunRol />} />
            </Route>
          </Route>
          <Route path="*" element={<InicioSegunRol />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
