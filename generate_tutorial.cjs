const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function generateTutorial() {
  console.log("Iniciando Puppeteer...");
  const browser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  const loginUrl = 'http://localhost:5173/login';

  console.log("Navegando a Login...");
  await page.goto(loginUrl, { waitUntil: 'networkidle2' });

  // 1. Captura del Login
  const loginScreenshot = await page.screenshot({ encoding: 'base64' });

  console.log("Iniciando sesión...");
  // Llenar formulario
  await page.type('input[type="email"]', 'josegabrielvarasarenas@gmail.com');
  await page.type('input[type="password"]', '12345duduvale');
  await page.click('button[type="submit"]');

  // Esperar a que entre a la app (por defecto /agenda o /pacientes)
  await page.waitForNavigation({ waitUntil: 'networkidle2' });
  await delay(2000); // Darle un margen extra a la carga de datos

  console.log("Capturando Agenda...");
  await page.goto('http://localhost:5173/agenda', { waitUntil: 'networkidle2' });
  await delay(2000);
  const agendaScreenshot = await page.screenshot({ encoding: 'base64' });

  console.log("Capturando Pacientes...");
  await page.goto('http://localhost:5173/pacientes', { waitUntil: 'networkidle2' });
  await delay(2000);
  const pacientesScreenshot = await page.screenshot({ encoding: 'base64' });

  console.log("Capturando Inventario...");
  await page.goto('http://localhost:5173/inventario', { waitUntil: 'networkidle2' });
  await delay(2000);
  const inventarioScreenshot = await page.screenshot({ encoding: 'base64' });

  console.log("Capturando Caja...");
  await page.goto('http://localhost:5173/caja', { waitUntil: 'networkidle2' });
  await delay(2000);
  const cajaScreenshot = await page.screenshot({ encoding: 'base64' });

  console.log("Generando PDF...");

  const htmlContent = `
    <html>
      <head>
        <style>
          body { font-family: 'Helvetica Neue', Arial, sans-serif; margin: 40px; color: #333; }
          h1 { color: #0f172a; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px; }
          h2 { color: #334155; margin-top: 40px; }
          p { line-height: 1.6; font-size: 14px; }
          .screenshot { width: 100%; border: 1px solid #cbd5e1; border-radius: 8px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); margin-top: 20px; }
          .page-break { page-break-before: always; }
        </style>
      </head>
      <body>
        <h1>Tutorial de Uso: Plataforma Vetora</h1>
        <p>Bienvenido al manual oficial de Vetora. En este documento repasaremos las pantallas principales y su funcionamiento básico.</p>

        <h2>1. Acceso a la Plataforma</h2>
        <p>Para ingresar, utiliza tus credenciales asignadas en la pantalla de inicio de sesión.</p>
        <img class="screenshot" src="data:image/png;base64,${loginScreenshot}" />

        <div class="page-break"></div>

        <h2>2. Agenda de Citas</h2>
        <p>En la <strong>Agenda</strong>, podrás visualizar el calendario, organizar turnos por profesionales y programar recordatorios de WhatsApp de forma rápida.</p>
        <img class="screenshot" src="data:image/png;base64,${agendaScreenshot}" />

        <div class="page-break"></div>

        <h2>3. Gestión de Pacientes</h2>
        <p>El módulo de <strong>Pacientes</strong> muestra la lista de todas las mascotas registradas. Desde aquí puedes buscar, ver sus historiales médicos y agregar nuevos registros de consultas o vacunaciones.</p>
        <img class="screenshot" src="data:image/png;base64,${pacientesScreenshot}" />

        <div class="page-break"></div>

        <h2>4. Inventario de Insumos</h2>
        <p>En <strong>Inventario</strong>, se controlan los productos, medicamentos e insumos de la clínica. Puedes ajustar el stock, registrar entradas y revisar las salidas.</p>
        <img class="screenshot" src="data:image/png;base64,${inventarioScreenshot}" />

        <div class="page-break"></div>

        <h2>5. Caja y Movimientos</h2>
        <p>En el módulo de <strong>Caja</strong>, podrás abrir y cerrar cajas diarias, cobrar servicios, y revisar los ingresos y egresos de la jornada de manera organizada.</p>
        <img class="screenshot" src="data:image/png;base64,${cajaScreenshot}" />

      </body>
    </html>
  `;

  const pdfPage = await browser.newPage();
  await pdfPage.setContent(htmlContent, { waitUntil: 'networkidle0' });

  const outputPath = path.join(__dirname, 'Tutorial_Vetora.pdf');
  await pdfPage.pdf({
    path: outputPath,
    format: 'A4',
    printBackground: true,
    margin: { top: '20px', right: '20px', bottom: '20px', left: '20px' }
  });

  console.log("PDF generado exitosamente en:", outputPath);

  await browser.close();
}

generateTutorial().catch(console.error);
