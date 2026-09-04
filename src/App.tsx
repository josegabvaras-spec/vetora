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
import { PortalPeluqueriaPage } from './pages/portal-cliente/PortalPeluqueriaPage'
import { PortalPeluqueriaClinicaPage } from './pages/portal-cliente/PortalPeluqueriaClinicaPage'
import { PortalMascotasPage } from './pages/portal-cliente/PortalMascotasPage'
import { PortalCitasPage } from './pages/portal-cliente/PortalCitasPage'
import { PortalPerfilPage } from './pages/portal-cliente/PortalPerfilPage'
import { RegistroClientePage } from './pages/RegistroClientePage'
import { HomePage } from './pages/HomePage'

import { PeluqueriaLayout } from './pages/peluqueria/PeluqueriaLayout'
import { PeluqueriaDashboardPage } from './pages/peluqueria/PeluqueriaDashboardPage'
import { PeluqueriaAgendaPage } from './pages/peluqueria/PeluqueriaAgendaPage'
import { PeluqueriaServiciosPage } from './pages/peluqueria/PeluqueriaServiciosPage'
import { PeluqueriaPeluquerosPage } from './pages/peluqueria/PeluqueriaPeluquerosPage'
import { PeluqueriaInsumosPage } from './pages/peluqueria/PeluqueriaInsumosPage'
import { PeluqueriaComisionesPage } from './pages/peluqueria/PeluqueriaComisionesPage'
import { PeluqueriaFidelizacionPage } from './pages/peluqueria/PeluqueriaFidelizacionPage'
import { PeluqueriaReportesPage } from './pages/peluqueria/PeluqueriaReportesPage'
import { PeluqueriaConfiguracionPage } from './pages/peluqueria/PeluqueriaConfiguracionPage'

import { PetshopLayout } from './pages/petshop/PetshopLayout'
import { PetshopDashboardPage } from './pages/petshop/PetshopDashboardPage'
import { PetshopPosPage } from './pages/petshop/PetshopPosPage'
import { PetshopProductosPage } from './pages/petshop/PetshopProductosPage'
import { PetshopInventarioPage } from './pages/petshop/PetshopInventarioPage'
import { PetshopComprasPage } from './pages/petshop/PetshopComprasPage'
import { PetshopProveedoresPage } from './pages/petshop/PetshopProveedoresPage'
import { PetshopOrdenesPage } from './pages/petshop/PetshopOrdenesPage'
import { PetshopClientesPage } from './pages/petshop/PetshopClientesPage'
import { PetshopPromocionesPage } from './pages/petshop/PetshopPromocionesPage'
import { PetshopCajaPage } from './pages/petshop/PetshopCajaPage'
import { PetshopReportesPage } from './pages/petshop/PetshopReportesPage'
import { PetshopConfiguracionPage } from './pages/petshop/PetshopConfiguracionPage'

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
              {/* Peluquerias: mismo criterio y mismo motivo que la Tienda --
                  son servicios de OTROS negocios, no un modulo del suyo. Y
                  tampoco agendan: la pantalla solicita por WhatsApp (PRD 2). */}
              <Route path="peluqueria" element={<PortalPeluqueriaPage />} />
              <Route path="peluqueria/:clinicaId" element={<PortalPeluqueriaClinicaPage />} />
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
            {/* Los cuatro documentos del expediente los abren DOS roles: el
                personal desde la ficha clínica, y el dueño desde su portal —
                es su expediente, y poder descargárselo es justo el punto. Cada
                página resuelve de dónde carga con `cargarFichaDeDocumento()`:
                el dueño NO pasa por `getFichaPaciente`, que le bajaría el
                directorio del personal (ver `services/documentos.ts`).

                `peluquero` sigue fuera, y es lo mismo que le oculta las
                pestañas del expediente (`puedeVerHistorialClinico`): sin este
                RolRoute bastaba con teclear la URL, porque colgaban solo de
                `ProtectedRoute`. La RLS no distingue aquí — `auth_es_personal()`
                incluye al peluquero desde 0025—, así que esta es la barrera. */}
            <Route element={<RolRoute roles={['admin', 'veterinario', 'recepcion', 'cliente']} />}>
              <Route path="/pacientes/:id/historial/imprimir" element={<HistorialImprimirPage />} />
              <Route path="/pacientes/:pacienteId/consulta/:consultaId/imprimir" element={<ConsultaImprimirPage />} />
              <Route path="/pacientes/:pacienteId/consulta/:consultaId/receta/imprimir" element={<RecetarioImprimirPage />} />
              <Route path="/pacientes/:pacienteId/reporte/:tipo" element={<InformeImprimirPage />} />
              <Route path="/pacientes/:pacienteId/reporte/:tipo/:itemId" element={<InformeImprimirPage />} />
            </Route>
            {/* La hoja de internación se queda solo para el personal: el dueño
                no tiene policy de portal sobre `internaciones`, así que le
                saldría vacía. */}
            <Route element={<RolRoute roles={['admin', 'veterinario', 'recepcion']} />}>
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

              {/* Módulo Profesional de Peluquería Canina y Felina */}
              <Route element={<RolRoute roles={['admin', 'recepcion', 'peluquero']} />}>
                <Route element={<ModuloRoute modulo="peluqueria" />}>
                  <Route path="/peluqueria" element={<PeluqueriaLayout />}>
                    <Route index element={<PeluqueriaDashboardPage />} />
                    <Route path="dashboard" element={<PeluqueriaDashboardPage />} />
                    <Route path="agenda" element={<PeluqueriaAgendaPage />} />
                    <Route path="servicios" element={<PeluqueriaServiciosPage />} />
                    <Route path="peluqueros" element={<PeluqueriaPeluquerosPage />} />
                    <Route path="insumos" element={<PeluqueriaInsumosPage />} />
                    <Route path="comisiones" element={<PeluqueriaComisionesPage />} />
                    <Route path="fidelizacion" element={<PeluqueriaFidelizacionPage />} />
                    {/* La MISMA caja, no otra.  era una
                        lista filtrada que no sabia abrir ni cerrar turno, asi
                        que habia dos sitios para cobrar y solo uno servia. La
                        ruta se conserva para no romper enlaces guardados. */}
                    <Route path="caja" element={<CajaPage />} />
                    <Route path="reportes" element={<PeluqueriaReportesPage />} />
                    <Route path="configuracion" element={<PeluqueriaConfiguracionPage />} />
                  </Route>
                </Route>
              </Route>

              {/* Módulo Profesional de Pet Shop y Retail */}
              <Route element={<RolRoute roles={['admin', 'recepcion', 'veterinario']} />}>
                <Route element={<ModuloRoute modulo="petshop" />}>
                  <Route path="/petshop" element={<PetshopLayout />}>
                    <Route index element={<PetshopDashboardPage />} />
                    <Route path="dashboard" element={<PetshopDashboardPage />} />
                    <Route path="pos" element={<PetshopPosPage />} />
                    <Route path="productos" element={<PetshopProductosPage />} />
                    <Route path="inventario" element={<PetshopInventarioPage />} />
                    <Route path="compras" element={<PetshopComprasPage />} />
                    <Route path="proveedores" element={<PetshopProveedoresPage />} />
                    <Route path="ordenes" element={<PetshopOrdenesPage />} />
                    <Route path="clientes" element={<PetshopClientesPage />} />
                    <Route path="promociones" element={<PetshopPromocionesPage />} />
                    <Route path="caja" element={<PetshopCajaPage />} />
                    <Route path="reportes" element={<PetshopReportesPage />} />
                    <Route path="configuracion" element={<PetshopConfiguracionPage />} />
                  </Route>
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
