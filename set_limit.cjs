const { Client } = require('pg');

const connectionString = 'postgresql://postgres:vetora2026!@db.irehiliqsdcgjosjuhri.supabase.co:5432/postgres';

async function setQuotaLimit() {
  const client = new Client({ connectionString });
  
  try {
    await client.connect();
    
    // Ponemos a TODAS las clínicas al borde de consumir su cuota (límite - 1)
    await client.query(`
      UPDATE clinicas c
      SET whatsapp_mensajes_enviados = p.whatsapp_limite - 1
      FROM planes p
      WHERE c.plan_id = p.id;
    `);
    
    console.log("Cuotas puestas al límite para todas las clínicas.");
  } catch (err) {
    console.error("Error:", err);
  } finally {
    await client.end();
  }
}

setQuotaLimit();
