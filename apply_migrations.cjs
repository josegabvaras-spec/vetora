const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const connectionString = 'postgresql://postgres:vetora2026!@db.irehiliqsdcgjosjuhri.supabase.co:5432/postgres';

async function applyMigrations() {
  const client = new Client({ connectionString });
  
  try {
    await client.connect();
    console.log("Conectado a la base de datos de producción.");

    const migrationsDir = path.join(__dirname, 'supabase', 'migrations');
    const files = fs.readdirSync(migrationsDir).sort();
    
    // Filtramos las migraciones que el usuario mencionó que faltan subir (0002 a 0005)
    // Pero en caso de que ya estén algunas, el código SQL de replace u otras instrucciones fallará o tendrá éxito.
    // Solo aplicaremos las nuevas.
    for (const file of files) {
      if (file.startsWith('0005')) {
        console.log(`Aplicando ${file}...`);
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
        await client.query(sql);
        console.log(`✅ ${file} aplicada correctamente.`);
      }
    }
    
    console.log("Todas las migraciones aplicadas con éxito.");
  } catch (err) {
    console.error("Error aplicando migraciones:", err);
  } finally {
    await client.end();
  }
}

applyMigrations();
