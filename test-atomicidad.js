import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://irehiliqsdcgjosjuhri.supabase.co'
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_ANON_KEY) {
  console.error("No se encontró VITE_SUPABASE_ANON_KEY en el entorno.")
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

async function testAtomicity() {
  const email = process.env.TEST_EMAIL
  const password = process.env.TEST_PASSWORD

  if (!email || !password) {
    console.error("Por favor, provee TEST_EMAIL y TEST_PASSWORD como variables de entorno.")
    process.exit(1)
  }

  console.log("Iniciando sesión como administrador...")
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password
  })

  if (authError || !authData.user) {
    console.error("Error al iniciar sesión:", authError?.message)
    process.exit(1)
  }

  console.log("Sesión iniciada correctamente para:", authData.user.email)

  console.log("\n-------------------------------------------------")
  console.log("1. Probando que UPDATE directo falla con RLS (42501)...")
  
  const { error: updateError } = await supabase
    .from('clinicas')
    .update({ whatsapp_mensajes_enviados: 0 })
    .eq('id', authData.user.user_metadata?.clinica_id || '')
  
  if (updateError) {
    console.log("✅ Éxito: El UPDATE directo rebotó como se esperaba:", updateError.code, updateError.message)
  } else {
    console.error("❌ Fallo: El UPDATE directo no devolvió error. RLS falló en protegernos.")
  }

  console.log("\n-------------------------------------------------")
  console.log("2. Lanzando 2 peticiones concurrentes a consumir_cuota_whatsapp...")

  const promise1 = supabase.rpc('consumir_cuota_whatsapp')
  const promise2 = supabase.rpc('consumir_cuota_whatsapp')

  const [res1, res2] = await Promise.all([promise1, promise2])

  console.log("\nResultados devueltos:")
  console.log("Petición A:", res1.data ?? `Error: ${res1.error?.message}`)
  console.log("Petición B:", res2.data ?? `Error: ${res2.error?.message}`)

  const exitos = [res1, res2].filter(r => !r.error).length
  if (exitos === 1) {
    console.log("\n✅ Éxito absoluto: Solo una petición devolvió la cuota restante. La atomicidad impidió que pasaran ambas.")
  } else {
    console.log(`\n❌ Cuidado: ${exitos} peticiones tuvieron éxito concurrente. Atomicidad comprometida.`)
  }
}

testAtomicity().catch(console.error)
