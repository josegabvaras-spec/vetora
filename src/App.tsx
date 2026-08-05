import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ProtectedRoute } from './components/layout/ProtectedRoute'
import { AppLayout } from './components/layout/AppLayout'
import { LoginPage } from './pages/LoginPage'
import { AccesoPage } from './pages/AccesoPage'
import { AgendaPage } from './pages/AgendaPage'
import { PacientesListPage } from './pages/PacientesListPage'
import { FichaPacientePage } from './pages/FichaPacientePage'
import { InventarioPage } from './pages/InventarioPage'
import { ConsentimientoPage } from './pages/ConsentimientoPage'
import { HistorialImprimirPage } from './pages/HistorialImprimirPage'
import { ConsultaImprimirPage } from './pages/ConsultaImprimirPage'
import { InformeImprimirPage } from './pages/InformeImprimirPage'
import { RolRoute } from './components/layout/RolRoute'
import { CajaPage } from './pages/CajaPage'
import { MovimientosPage } from './pages/MovimientosPage'
import { ServiciosPage } from './pages/ServiciosPage'
import { ReciboPage } from './pages/ReciboPage'
import { InternacionPage } from './pages/InternacionPage'
import { RespaldoPage } from './pages/RespaldoPage'
import { MetricasPage } from './pages/MetricasPage'
import { AsistentePage } from './pages/AsistentePage'
import { InternacionImprimirPage } from './pages/InternacionImprimirPage'
import { PlataformaLayout } from './components/layout/PlataformaLayout'
import { PlataformaResumenPage } from './pages/plataforma/PlataformaResumenPage'
import { PlataformaClinicasPage } from './pages/plataforma/PlataformaClinicasPage'
import { PlataformaPlanesPage } from './pages/plataforma/PlataformaPlanesPage'
import { InicioSegunRol } from './components/layout/InicioSegunRol'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          {/* Enlace que reciben por WhatsApp quienes acaban de ser dados de alta */}
          <Route path="/acceso/:token" element={<AccesoPage />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/consentimientos/:citaId" element={<ConsentimientoPage />} />
            <Route path="/pacientes/:id/historial/imprimir" element={<HistorialImprimirPage />} />
            <Route path="/pacientes/:pacienteId/consulta/:consultaId/imprimir" element={<ConsultaImprimirPage />} />
            <Route path="/pacientes/:pacienteId/reporte/:tipo" element={<InformeImprimirPage />} />
            <Route path="/pacientes/:pacienteId/reporte/:tipo/:itemId" element={<InformeImprimirPage />} />
            <Route path="/recibos/:cobroId" element={<ReciboPage />} />
            <Route path="/internaciones/:id/imprimir" element={<InternacionImprimirPage />} />
            {/* Área del dueño de la plataforma: no comparte nada con la clínica */}
            <Route element={<RolRoute roles={['superadmin']} />}>
              <Route element={<PlataformaLayout />}>
                <Route path="/plataforma" element={<PlataformaResumenPage />} />
                <Route path="/plataforma/clinicas" element={<PlataformaClinicasPage />} />
                <Route path="/plataforma/planes" element={<PlataformaPlanesPage />} />
              </Route>
            </Route>

            <Route element={<AppLayout />}>
              <Route path="/agenda" element={<AgendaPage />} />
              <Route path="/pacientes" element={<PacientesListPage />} />
              <Route path="/pacientes/:id" element={<FichaPacientePage />} />
              <Route path="/internacion" element={<InternacionPage />} />
              <Route path="/inventario" element={<InventarioPage />} />

              {/* Caja para recepción y administración; los movimientos, solo administración */}
              <Route element={<RolRoute roles={['recepcion', 'admin']} />}>
                <Route path="/caja" element={<CajaPage />} />
                {/* Los avisos al cliente son trabajo de recepción; el informe, del administrador */}
                <Route path="/asistente" element={<AsistentePage />} />
                <Route path="/respaldo" element={<RespaldoPage />} />
                <Route path="/metricas" element={<MetricasPage />} />
              </Route>
              <Route element={<RolRoute roles={['admin']} />}>
                <Route path="/servicios" element={<ServiciosPage />} />
                <Route path="/movimientos" element={<MovimientosPage />} />
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
