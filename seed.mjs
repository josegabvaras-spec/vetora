import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://irehiliqsdcgjosjuhri.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlyZWhpbGlxc2RjZ2pvc2p1aHJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyMDA5ODUsImV4cCI6MjEwMDc3Njk4NX0.oy73U2mnmjBTg1Z2hOiTYsMixWv36lsMDn2gSy1DUX0'
)

async function seed() {
  const { data, error } = await supabase.auth.signUp({
    email: 'admin@vetora.bo',
    password: 'admin' // Contraseña default
  })

  if (error) {
    console.error('Error signing up:', error)
    return
  }

  console.log('User ID:', data.user.id)
}

seed()
