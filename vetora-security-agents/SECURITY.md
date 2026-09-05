# Vetora Security Automation

Paquete de subagentes de seguridad especializados, más la skill central `vetora-security`, para
**Vetora**, el SaaS veterinario multi-inquilino de Bolivia (Vercel + Supabase: PostgreSQL + Auth +
Edge Functions), frontend Vite + React 19 (sin Next.js, sin Docker, sin pipeline de CI/CD propio).

## Relación con lo que el proyecto ya tiene

El proyecto **ya cuenta** con dos agentes de seguridad en `.claude/agents/` (raíz del repo):
`security-engineer` (revisión desde el diseño) y `pentester` (ataque dirigido, con mentalidad
adversaria). Los dos están anclados al proyecto real —funciones RLS, Edge Functions, hallazgos ya
verificados— y son el punto de entrada para una revisión rápida de una funcionalidad concreta o
antes de un despliegue puntual.

Este paquete no los sustituye ni los duplica: añade **13 especialistas más finos** (uno por área:
auth, autorización, tenants, base de datos, PostgREST desde el cliente, frontend, Edge Functions
no-IA, la Edge Function de IA, dependencias, secretos, cloud, lógica de negocio, cumplimiento)
coordinados por un `security-orchestrator`, más `remediation-agent`, `report-agent` y
`retest-agent`. Es para un **barrido sistemático por área**, no para una consulta puntual — para
eso sigue estando `security-engineer` o `pentester` directamente.

## Instalación

Copia la carpeta `.claude` de este paquete a la raíz del proyecto Vetora:

```text
Vetora/
└── .claude/
    ├── agents/            (aquí ya conviven security-engineer.md y pentester.md)
    └── skills/
        └── vetora-security/
```

Ninguno de los 13 nombres de este paquete colisiona con los agentes ya existentes del proyecto.

## Uso recomendado

Barrido sistemático completo: `security-orchestrator`

Revisión dirigida a un cambio concreto o ataque puntual (más rápido que el barrido completo):
`security-engineer` / `pentester`, directamente — sin pasar por el orquestador.

Después de cambios de autenticación o roles: `auth-agent` + `authorization-agent`

Después de cambios en migraciones SQL o policies: `database-security-agent` + `tenant-isolation-agent`

Después de cambios en llamadas a PostgREST desde `src/services/*.ts`: `api-security-agent`

Después de tocar una Edge Function no-IA (`acceso`, `crear-cuenta`, `registro-portal`,
`eliminar-clinica`, `eliminar-usuario`, `cuentas-portal`, `respaldo-clinica`):
`backend-security-agent`

Después de tocar `supabase/functions/asistente/` (el copiloto de IA): `ai-security-agent`

Antes de producción: `security-orchestrator` + `retest-agent`, con `SECURITY_CHECKLIST.md` como gate.

Después de corregir un hallazgo: `remediation-agent` y luego `retest-agent`

## Importante

El paquete está diseñado para auditoría defensiva y autorizada. No realiza explotación destructiva,
DoS, robo de credenciales ni acceso fuera del alcance. Sigue la misma regla de oro que ya aplica
`pentester.md` del proyecto: **nunca contra la base de datos de producción**, que tiene datos
reales de clínicas — todo ataque es lectura adversaria del código más un guion reproducible que la
persona ejecuta contra un proyecto de Supabase de prueba.

Ante un secreto comprometido, la doctrina del proyecto es **rotar la credencial, nunca reescribir
el historial de git** (ver H-4 en `SEGURIDAD.md`). Para cambios críticos (auth, RLS, permisos,
secretos, Edge Functions con `service_role`), exige aprobación humana explícita antes de aplicarlos.
