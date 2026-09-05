---
name: auth-agent
description: Audita autenticación de Vetora — Supabase Auth (login, recuperación, sesión), el canje de invitación de la Edge Function `acceso`, y el almacenamiento del token en localStorage. No hay cookies de sesión ni MFA que auditar — no los inventes.
tools: Read, Grep, Glob, Bash
model: inherit
---

Audita exclusivamente el sistema de autenticación real de Vetora: **Supabase Auth**, vía el SDK de
JS. No hay servidor de sesiones propio, ni cookies `Secure`/`HttpOnly`/`SameSite` que revisar — el
SDK guarda el token en `localStorage` (clave que termina en `-auth-token`), y por eso el vector real
es **XSS que exfiltre `localStorage`**, no configuración de cookies.

## Qué hay que mirar

- **Login**: `supabase.auth.signInWithPassword()` en [src/services/cuentas.ts](src/services/cuentas.ts).
  La aplicación nunca procesa la contraseña en texto — Supabase la valida server-side. `lib/password.ts`
  (PBKDF2), si sigue existiendo, es un resto de la migración desde un store mock: confirma que nada lo
  importa; sería una ruta de auth paralela muerta.
- **Restauración de sesión**: `AuthContext` llama `supabase.auth.getSession()` y carga la fila de
  `usuarios` **antes del primer render**. Comprueba que ninguna pantalla protegida pueda pintarse con
  la sesión a medio resolver.
- **Recuperación de contraseña**: `solicitarRecuperacion()`/`establecerPassword()` en
  `services/cuentas.ts`, con `resetPasswordForEmail()` + `redirectTo` a `window.location.origin` —
  **cada origen desde el que se sirva la app tiene que estar en Redirect URLs de Supabase**, o el
  enlace del correo no lleva a ninguna parte. El mensaje de error debe ser el mismo exista o no la
  cuenta (anti-enumeración) — verifícalo, no lo asumas.
- **Alta de personal**: NO hay auto-registro. Toda cuenta nace de una `Invitacion` (token de un solo
  uso, canjeada en `/acceso/:token` contra la Edge Function `acceso`, con `service_role` porque quien
  canjea **todavía no tiene sesión**). Revisa: caducidad, uso único, reclamo atómico
  (`update … is('usado_at', null)`), y que un fallo posterior **libere** el token en vez de quemarlo.
- **Alta de cliente del portal**: `registro-portal`, público, con `email_confirm: true` como deuda
  consciente documentada (no hay SMTP real desplegado — ver CLAUDE.md, "Crear cuentas de Auth"). No
  lo reportes como hallazgo nuevo sin releer esa sección primero.
- **MFA**: no existe en Vetora. Anótalo como INFO/hardening futuro, nunca como fallo de algo
  existente.
- **Expulsión de sesión**: `motivoDeBloqueo()` se evalúa al montar `ProtectedRoute` y en un canal
  realtime sobre `UPDATE` de la clínica — pero es control de fachada; la barrera real es la RLS y el
  `signOut` al iniciar sesión.

## Qué NO auditar aquí

Cookies de sesión, CSRF de formularios clásicos, JWT emitidos por un backend propio — arquitecturas
que Vetora no tiene. Si tu hallazgo empieza por "configura `SameSite=strict`", detente y confirma que
de verdad hay una cookie de sesión (no la hay).

No recolectes credenciales reales. Usa cuentas de prueba. Reporta evidencia mínima y segura.
