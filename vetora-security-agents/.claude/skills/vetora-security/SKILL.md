---
name: vetora-security
description: Skill central de seguridad de Vetora. Se activa para auditorías, cambios sensibles y preparación de producción.
---

# Vetora Security Skill

Vetora es un SaaS veterinario multi-inquilino boliviano: Vercel + Supabase (PostgreSQL + Auth +
Storage + Edge Functions Deno), frontend Vite + React 19 (sin Next.js, sin SSR). No hay backend
propio: PostgREST autogenerado + RLS + 8 Edge Functions son toda la superficie de servidor.

## Relación con `security-engineer` y `pentester`

Si están instalados (revisión dirigida/profunda, defensiva y ofensiva), úsalos para un cambio
puntual o un ataque dirigido. Usa este paquete para un barrido sistemático por área o auditoría
integral programada. No dupliques: delega a esos dos cuando un hallazgo merezca profundizar.

## Activación automática

- `login`, `sesión`, `JWT`, `contraseña`, invitación, `/acceso/:token` → `auth-agent`.
- rol, `RolRoute`, `auth_es_personal`, `auth_es_admin`, admin/veterinario/recepción/peluquero/cliente → `authorization-agent`.
- `clinica_id`, `sucursal_id`, RLS, policies de Supabase, aislamiento entre clínicas → `tenant-isolation-agent` + `database-security-agent`.
- migración SQL, tabla, policy, función `SECURITY DEFINER`, trigger, Storage bucket → `database-security-agent`.
- llamadas a PostgREST desde `src/services/*.ts` (`.or()`, `.filter()`, `.rpc()`, `select`) → `api-security-agent`.
- `supabase/functions/acceso`, `crear-cuenta`, `registro-portal`, `eliminar-clinica`, `eliminar-usuario`, `cuentas-portal`, `respaldo-clinica` → `backend-security-agent`.
- `supabase/functions/asistente`, Claude, Anthropic, herramientas del copiloto, prompt → `ai-security-agent`.
- React, Vite, DOM, `localStorage`, `dangerouslySetInnerHTML` → `frontend-security-agent`.
- `package.json`, lockfile, `npm install`/`npm audit`, dependencia → `dependency-agent`.
- `.env`, `VITE_*`, `service_role`, token, secreto, credencial → `secrets-agent`.
- Vercel, ajustes del proyecto de Supabase, dominios, despliegue → `cloud-security-agent`.
- caja, venta, POS, stock, inventario, cuota de WhatsApp/IA, precio congelado → `business-logic-agent`.
- privacidad, dato personal, CI, WhatsApp, historial clínico, cumplimiento normativo → `privacy-compliance-agent`.
- producción/release/despliegue → `security-orchestrator` + `retest-agent`.
- corrección de una vulnerabilidad ya identificada → `remediation-agent` y luego `retest-agent`.
- revisión puntual de una funcionalidad concreta, sin necesidad de un barrido completo → `security-engineer` o `pentester` directamente.

## Reglas

1. Seguridad primero.
2. Nunca ejecutar pruebas destructivas, ni contra la base de producción — que tiene datos reales de clínicas en vivo.
3. Nunca probar sistemas fuera del alcance autorizado.
4. No exfiltrar datos reales.
5. No mostrar secretos completos en un informe.
6. No modificar controles críticos (auth, RLS, permisos, secretos, Edge Functions con `service_role`) sin aprobación explícita.
7. Diferenciar vulnerabilidad confirmada de riesgo potencial.
8. No afirmar cumplimiento legal sin evidencia — márcalo REQUIERE REVISIÓN JURÍDICA si no está verificado.
9. Preferir un proyecto de Supabase de prueba sobre producción para cualquier verificación en vivo.
10. Ante un secreto comprometido: **rotar la credencial, nunca reescribir el historial de git** (rompe cualquier clon y no borra lo que ya se filtró — ver H-4 en `SEGURIDAD.md`).
11. No hay runner de tests configurado en Vetora. La verificación real es `npm run build` (typecheck) más probar en el navegador con una cuenta real de Supabase — nunca asumas que existe una suite de tests que ejecutar.
12. Después de una corrección de seguridad, ejecutar `retest-agent`.

## Estándares

Usa como referencias:
- OWASP Top 10 2025.
- OWASP ASVS 5.0.
- OWASP WSTG.
- NIST CSF 2.0.
- ISO/IEC 27001:2022.
- Normativa boliviana aplicable (con la salvedad de la regla 8).

## Salida mínima

Cada hallazgo debe incluir:
ID (`H-N`, correlativo a los ya numerados en `SEGURIDAD.md` si hay una auditoría previa), título,
severidad, activo (archivo:línea o Edge Function), descripción, impacto (¿cruza clínicas?),
evidencia segura, CWE, CVSS cuando corresponda, referencias, recomendación, prioridad y estado
(vocabulario de `retest-agent`).

## Escalado

CRÍTICO/ALTO:
- informar inmediatamente;
- no corregir automáticamente controles críticos;
- pedir aprobación para cambios.

MEDIO/BAJO:
- proponer corrección;
- aplicar automáticamente solo si el cambio es reversible y de bajo riesgo.

INFORMACIONAL:
- registrar como hardening/recomendación.

## Gate de producción

Antes de producción verifica lo que enumera `SECURITY_CHECKLIST.md`. En particular, para Vetora:
- no hay secretos expuestos (`VITE_*` nunca lleva `service_role` ni la clave de Anthropic);
- ningún `.or()`/`.filter()`/`.textSearch()` nuevo con texto de usuario interpolado (regresión H-1);
- ninguna policy de negocio nueva con `or auth_es_plataforma()`;
- que `RolRoute`, el menú y la policy SQL coincidan para cualquier ruta nueva o modificada;
- que `asistente` no haya ganado una herramienta que escriba, borre o llame a la red;
- dependencias revisadas (`npm audit`);
- buckets de Storage revisados (solo `catalogo` es público, a propósito);
- vulnerabilidades críticas/altas cerradas o riesgo aceptado explícitamente.
